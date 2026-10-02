"""The editor previews temporarily; persistent saving is a downstream decision."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from PIL import Image
import torch

from host import package
from vmnodes_test.bridge import VMEditFinish, ExecutionBlocker


class SavingTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.temp = self.root / 'temp'
        self.temp.mkdir()
        self.calls = []

        def save_path(prefix, directory, width, height):
            self.calls.append((prefix, directory))
            self.assertEqual(Path(directory), self.temp)
            target = Path(directory) / prefix
            self.assertTrue(target.resolve().is_relative_to(self.temp.resolve()))
            target.parent.mkdir(parents=True, exist_ok=True)
            return str(target.parent), target.name, 1, 'VMNodes', prefix

        for patcher in (patch('folder_paths.get_temp_directory', return_value=str(self.temp), create=True),
                        patch('folder_paths.get_save_image_path', side_effect=save_path, create=True),
                        patch('folder_paths.get_output_directory', side_effect=AssertionError('editor accessed output'))):
            patcher.start()
            self.addCleanup(patcher.stop)
        image = torch.linspace(0, 1, 64 * 96 * 3).reshape(1, 64, 96, 3)
        mask = torch.zeros(1, 64, 96)
        mask[:, 15:49, 22:71] = 1
        self.plan = package.VMEditPlan().build(image, mask, 'Change the material', 'drawn_mask')[0]
        self.pre = torch.full_like(image, .6)

    def test_generate_has_unchanged_final_and_only_temp_preview(self):
        expected = package.VMFinalizeEdit().finish(self.plan, self.pre, 'off')[0]
        workflow = {'nodes': [{'id': 1, 'type': 'SaveImage'}]}
        result = VMEditFinish().finish(self.plan, 'generate', str(self.root / 'must_not_save'),
            self.pre, extra_pnginfo={'workflow': workflow})
        self.assertTrue(torch.equal(result['result'][0], expected))
        self.assertIsInstance(result['result'][2], ExecutionBlocker)
        self.assertEqual(result['ui']['images'][0]['type'], 'temp')
        paths = list(self.temp.rglob('*.png'))
        self.assertEqual(len(paths), 1)
        with Image.open(paths[0]) as im:
            self.assertTrue(np.array_equal(np.array(im), (expected[0].numpy() * 255).round().astype('uint8')))
            self.assertEqual(json.loads(im.info['workflow']), workflow)
            self.assertEqual(json.loads(im.info['vmnodes'])['stage'], 'Final')
        self.assertFalse(list(self.root.glob('must_not_save*')))

    def test_preview_blocks_final_and_never_calls_compositor(self):
        with patch.object(package.VMFinalizeEdit, 'finish', side_effect=AssertionError('generated during preview')):
            result = VMEditFinish().finish(self.plan, 'preview', '../../old_output', generated_pre=None)
        self.assertIsInstance(result['result'][0], ExecutionBlocker)
        self.assertEqual(result['ui']['vm_stage'], ['Preview'])
        self.assertEqual(result['ui']['images'][0]['type'], 'temp')
        self.assertEqual(VMEditFinish.check_lazy_status(self.plan, 'preview', 'ignored', generated_pre=None), [])
        self.assertEqual(VMEditFinish.check_lazy_status(self.plan, 'generate', 'ignored', generated_pre=None), ['generated_pre'])

    def test_independent_editor_previews_do_not_overwrite_each_other(self):
        first = VMEditFinish().finish(self.plan, 'preview', 'same_prefix')
        second = VMEditFinish().finish(self.plan, 'preview', 'same_prefix')
        self.assertNotEqual(first['ui']['images'], second['ui']['images'])
        self.assertEqual(len(list(self.temp.rglob('*.png'))), 2)


if __name__ == '__main__':
    unittest.main()
