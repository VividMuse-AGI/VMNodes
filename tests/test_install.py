import importlib.util
import importlib.metadata
from pathlib import Path
import types
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('vmnodes_installer', Path(__file__).resolve().parents[1] / 'install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallTests(unittest.TestCase):
    def test_compatible_cv2_reused_without_pip(self):
        with patch.object(installer.importlib, 'import_module', return_value=types.SimpleNamespace(__version__='4.10.0')), patch.object(installer.subprocess, 'run') as pip:
            self.assertIn('4.10.0', installer.ensure_dependency('cv2', 'requirements-opencv.txt', (4, 8)))
            pip.assert_not_called()

    def test_absent_cv2_check_is_read_only(self):
        with patch.object(installer.importlib, 'import_module', side_effect=ModuleNotFoundError(name='cv2')), patch.object(installer.importlib.metadata, 'version', side_effect=importlib.metadata.PackageNotFoundError), patch.object(installer.subprocess, 'run') as pip:
            with self.assertRaisesRegex(RuntimeError, 'Missing cv2'):
                installer.ensure_dependency('cv2', 'requirements-opencv.txt', (4, 8), True)
            pip.assert_not_called()

    def test_missing_cv2_install_does_not_resolve_host_dependencies(self):
        with patch.object(installer.importlib, 'import_module', side_effect=[ModuleNotFoundError(name='cv2'), types.SimpleNamespace(__version__='4.10.0')]), patch.object(installer.importlib.metadata, 'version', side_effect=importlib.metadata.PackageNotFoundError), patch.object(installer.subprocess, 'run') as pip:
            installer.ensure_dependency('cv2', 'requirements-opencv.txt', (4, 8))
            self.assertIn('--no-deps', pip.call_args.args[0])
            self.assertNotIn('--upgrade', pip.call_args.args[0])

    def test_broken_registered_cv2_is_not_overlaid(self):
        with patch.object(installer.importlib, 'import_module', side_effect=ModuleNotFoundError(name='cv2')), patch.object(installer.importlib.metadata, 'version', return_value='4.10.0'), patch.object(installer.subprocess, 'run') as pip:
            with self.assertRaisesRegex(RuntimeError, 'installed but cv2 is broken'):
                installer.ensure_dependency('cv2', 'requirements-opencv.txt', (4, 8))
            pip.assert_not_called()

    def test_old_variant_is_not_overwritten(self):
        with patch.object(installer.importlib, 'import_module', return_value=types.SimpleNamespace(__version__='4.7.0')), patch.object(installer.subprocess, 'run') as pip:
            with self.assertRaisesRegex(RuntimeError, 'existing distribution'):
                installer.ensure_dependency('cv2', 'requirements-opencv.txt', (4, 8))
            pip.assert_not_called()
