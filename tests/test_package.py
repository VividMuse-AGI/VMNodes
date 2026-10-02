import builtins
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import zipfile

import numpy as np
from PIL import Image, PngImagePlugin
import torch

from host import ROOT, package, load_package
from vmnodes_test.registration import load_features
from vmnodes_test.optional_dependencies import load_yolo, person_config_directory
from vmnodes_test.geometry import restore_to_original, final_allowed_mask

sys.path.insert(0, str(ROOT / 'tools'))
from check_release import check
from build_release import build

torch.set_num_threads(2)


def schema(module):
    attributes = ('RETURN_TYPES', 'RETURN_NAMES', 'FUNCTION', 'CATEGORY', 'OUTPUT_NODE', 'DEV_ONLY')
    return {key: {'inputs': cls.INPUT_TYPES(),
                  **{a: getattr(cls, a, None) for a in attributes}}
            for key, cls in module.NODE_CLASS_MAPPINGS.items()}


class PackageTests(unittest.TestCase):
    def test_six_original_contracts(self):
        expected = json.loads((ROOT / 'tests/contracts_v51.json').read_text(encoding='utf-8'))
        actual = json.loads(json.dumps(schema(package)))
        self.assertEqual(actual, expected['schemas'])
        self.assertEqual(package.NODE_DISPLAY_NAME_MAPPINGS, expected['display_names'])

    def test_workflow_adds_only_final_saver_and_png_metadata_roundtrip(self):
        expected = json.loads((ROOT / 'tests/contracts_v51.json').read_text(encoding='utf-8'))
        original = (ROOT / 'tests/fixtures/workflow_v016.json').read_bytes()
        self.assertEqual(hashlib.sha256(original).hexdigest(), expected['workflow_sha256'])
        baseline = json.loads(original)
        payload = (ROOT / 'workflows/image_edit/VM_图像编辑.json').read_bytes()
        workflow = json.loads(payload)
        added = [n for n in workflow['nodes'] if n['id'] not in {x['id'] for x in baseline['nodes']}]
        self.assertEqual(len(added), 1)
        saver = added[0]
        self.assertEqual(saver['type'], 'SaveImage')
        self.assertNotIn('title', saver)
        link = workflow['links'][-1]
        self.assertEqual(link[1:], [13, 5, saver['id'], 0, 'IMAGE'])
        self.assertEqual(saver['inputs'][0]['link'], link[0])
        # Compare the whole original graph after removing precisely the allowed addition.
        restored = json.loads(payload)
        restored['nodes'].remove(next(n for n in restored['nodes'] if n['id'] == saver['id']))
        next(n for n in restored['nodes'] if n['id'] == 13)['outputs'][5]['links'] = None
        restored['links'].pop()
        for key in ('last_node_id', 'last_link_id'):
            restored[key] = baseline[key]
        self.assertEqual(restored, baseline)
        info = PngImagePlugin.PngInfo()
        info.add_text('workflow', payload.decode('utf-8'))
        buffer = io.BytesIO()
        Image.new('RGB', (32, 32)).save(buffer, format='PNG', pnginfo=info)
        buffer.seek(0)
        self.assertEqual(json.loads(Image.open(buffer).info['workflow']), workflow)

    def test_one_broken_feature_keeps_resize_and_reports_traceback(self):
        def importer(module, parent):
            if module != '.geometry':
                raise RuntimeError('injected editing failure')
            return types.SimpleNamespace(VMImageResizeAlign=package.VMImageResizeAlign)
        with self.assertLogs('VMNodes', level='ERROR') as logs:
            classes, _, errors = load_features('unused', importer=importer)
        self.assertEqual(set(classes), {'VMImageResizeAlign'})
        self.assertIn('injected editing failure', errors['image_edit'])
        self.assertIn('Traceback', '\n'.join(logs.output))
        result = classes['VMImageResizeAlign']().run(torch.zeros(1, 47, 61, 3),
            '保持原尺寸', 1024, 'bicubic', 32)['result'][0]
        self.assertEqual(tuple(result.shape), (1, 64, 64, 3))

    def test_real_import_failure_does_not_remove_resize(self):
        original = builtins.__import__
        def injected(name, *args, **kwargs):
            if name == 'comfy_execution.graph_utils':
                raise ImportError('simulated unavailable editing host API')
            return original(name, *args, **kwargs)
        with patch('builtins.__import__', side_effect=injected), self.assertLogs('VMNodes', 'ERROR'):
            isolated = load_package(name='vmnodes_missing_edit_api')
        self.assertEqual(set(isolated.NODE_CLASS_MAPPINGS), {'VMImageResizeAlign'})
        self.assertIn('image_edit', isolated.IMPORT_ERRORS)

    def test_duplicate_ids_fail_before_import(self):
        features = (('one', (('a', 'SameID', 'A'),)), ('two', (('b', 'SameID', 'B'),)))
        with self.assertRaisesRegex(ValueError, 'VMN_DUPLICATE_NODE_ID'):
            load_features('unused', features, importer=lambda *args: self.fail('imported duplicate'))

    def test_optional_dependency_absent_leaves_ordinary_modes_usable(self):
        original = builtins.__import__
        def missing(name, *args, **kwargs):
            if name == 'ultralytics' or name.startswith('ultralytics.'):
                raise ModuleNotFoundError('blocked for test', name='ultralytics')
            return original(name, *args, **kwargs)
        with patch('builtins.__import__', side_effect=missing):
            isolated = load_package(name='vmnodes_no_optional')
            self.assertFalse(isolated.IMPORT_ERRORS)
            image = torch.full((1, 73, 109, 3), .4)
            mask = torch.zeros((1, 73, 109)); mask[:, 20:55, 25:80] = 1
            for mode in ('drawn_mask', 'coarse_region', 'full_image'):
                result = isolated.VMEditPlan().build(image, mask, 'Change the material', mode)
                self.assertEqual(tuple(result[1].shape), (1, 96, 128, 3))
            with tempfile.TemporaryDirectory() as folder:
                prior = os.environ.get('YOLO_CONFIG_DIR')
                with self.assertRaisesRegex(RuntimeError, 'VMN_OPTIONAL_PERSON_DEP'):
                    load_yolo(folder)
                self.assertEqual(os.environ.get('YOLO_CONFIG_DIR'), prior)

    def test_transitive_dependency_error_not_misreported(self):
        original = builtins.__import__
        def missing(name, *args, **kwargs):
            if name == 'ultralytics':
                raise ModuleNotFoundError('broken dependency', name='some_transitive_package')
            return original(name, *args, **kwargs)
        with tempfile.TemporaryDirectory() as folder, patch('builtins.__import__', side_effect=missing):
            with self.assertRaises(ModuleNotFoundError) as caught:
                load_yolo(folder)
            self.assertEqual(caught.exception.name, 'some_transitive_package')

    def test_legacy_configuration_preserved_and_existing_env_respected(self):
        with tempfile.TemporaryDirectory() as folder:
            legacy = Path(folder) / 'coarse_edit_v9/yolo_config'
            legacy.mkdir(parents=True)
            (legacy / 'settings.json').write_text('{"keep":true}')
            self.assertEqual(person_config_directory(folder), legacy)
            current = Path(folder) / 'VMNodes/image_edit/yolo_config'
            current.mkdir(parents=True)
            self.assertEqual(person_config_directory(folder), current)
            fake = types.ModuleType('ultralytics'); fake.YOLO = object()
            with patch.dict(sys.modules, {'ultralytics': fake}), patch.dict(os.environ, {'YOLO_CONFIG_DIR': 'owner-setting'}):
                self.assertIs(load_yolo(folder), fake.YOLO)
                self.assertEqual(os.environ['YOLO_CONFIG_DIR'], 'owner-setting')
            self.assertEqual((legacy / 'settings.json').read_text(), '{"keep":true}')

    def test_local_package_and_reproducible_zip(self):
        self.assertEqual(check()['errors'], [])
        with tempfile.TemporaryDirectory() as folder:
            first = build(Path(folder) / 'first')
            second = build(Path(folder) / 'second')
            self.assertEqual(first['sha256'], second['sha256'])
            with zipfile.ZipFile(first['archive']) as archive:
                self.assertIsNone(archive.testzip())
                names = archive.namelist()
                self.assertIn('VMNodes/__init__.py', names)
                self.assertTrue(all(n.startswith('VMNodes/') for n in names))
                manifest = json.loads(archive.read('VMNodes/manifest.json'))
                for item in manifest['files']:
                    self.assertEqual(hashlib.sha256(archive.read('VMNodes/' + item['path'])).hexdigest(), item['sha256'])
                archive.extractall(Path(folder) / 'installed')
            installed = load_package(Path(folder) / 'installed/VMNodes', 'vmnodes_zip')
            self.assertEqual(set(installed.NODE_CLASS_MAPPINGS), set(package.NODE_CLASS_MAPPINGS))
            self.assertFalse(installed.IMPORT_ERRORS)

    def test_all_edit_modes_preserve_scope_and_size(self):
        rng = np.random.default_rng(52)
        original = rng.integers(0, 256, (173, 259, 3), dtype=np.uint8)
        image = torch.from_numpy(original.astype(np.float32) / 255)[None]
        mask = torch.zeros(1, 173, 259); mask[:, 40:140, 50:210] = 1
        protection = torch.zeros_like(mask); protection[:, 65:90, 80:110] = 1
        for mode in ('drawn_mask', 'coarse_region', 'full_image'):
            for resize in ('保持原尺寸', '按长边'):
                with self.subTest(mode=mode, resize=resize):
                    work, wm, pm, context, _ = package.VMImageResizeAlign().run(
                        image, resize, 192, 'bicubic', 32, mask, protection)['result']
                    plan = package.VMEditPlan().build(work, wm, 'Change material', mode,
                        protect_mask=pm, image_context=context, canvas_policy='external')[0]
                    for harmony in ('off', 'auto'):
                        final = restore_to_original(dict(plan), torch.ones_like(work), harmony)
                        allowed = final_allowed_mask(plan)
                        self.assertEqual(final.shape, original.shape)
                        self.assertTrue(np.array_equal(final[~allowed], original[~allowed]))
                        protected = protection[0].numpy() > 0
                        self.assertTrue(np.array_equal(final[protected], original[protected]))

    def test_removed_backend_still_rejected(self):
        result = package.VMEditPlan.VALIDATE_INPUTS(backend='flux2_klein9b')
        self.assertIsInstance(result, str)
        self.assertIn('VMN_BACKEND_REMOVED', result)


if __name__ == '__main__':
    unittest.main()
