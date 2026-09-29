"""Audit precision must not change normal output or shared plans."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import torch

from host import package
from vmnodes_test.geometry import restore_to_original
from vmnodes_test.vm_legacy.nodes import _rgb


class AuditTests(unittest.TestCase):
    def test_channel_metadata_and_revision_do_not_change_pixels(self):
        from vmnodes_test import edit
        image = torch.full((1, 32, 32, 3), .4)
        plan = package.VMEditPlan().build(image, None, 'Edit image', 'full_image')[0]
        for channels in (3, 4):
            for dtype in (torch.float32, torch.float16, torch.bfloat16):
                with self.subTest(channels=channels, dtype=dtype), tempfile.TemporaryDirectory() as folder:
                    pre = image.to(dtype)
                    if channels == 4:
                        # Extra-channel range is neither clipped nor assumed to represent alpha.
                        pre = torch.cat((pre, torch.full((1, 32, 32, 1), 1.5, dtype=dtype)), dim=-1)
                    with patch.dict(os.environ, {'VM_IMAGE_EDIT_AUDIT': '0'}):
                        reference = package.VMFinalizeEdit().finish(plan, pre)[0]
                    with patch.dict(os.environ, {'VM_IMAGE_EDIT_AUDIT': '1', 'VM_IMAGE_EDIT_AUDIT_DIR': folder}):
                        output = package.VMFinalizeEdit().finish(plan, pre)[0]
                        with patch.object(edit, 'AUDIT_METADATA_REVISION', edit.AUDIT_METADATA_REVISION + 1):
                            revised = package.VMFinalizeEdit().finish(plan, pre)[0]
                    np.testing.assert_array_equal(output, reference)
                    np.testing.assert_array_equal(revised, reference)
                    files = list(Path(folder).glob('*.npz'))
                    self.assertEqual(len(files), 2, 'Metadata revisions must not overwrite prior audits')
                    for path in files:
                        with np.load(path, allow_pickle=False) as data:
                            self.assertEqual(int(data['audit_schema']), 2)
                            self.assertEqual(int(data['pre_channel_count']), channels)
                            np.testing.assert_array_equal(data['pre_rgb_channel_indices'], [0, 1, 2])
                            np.testing.assert_array_equal(data['pre_float32'], pre.float().numpy())
                            np.testing.assert_array_equal(data['pre'], _rgb(pre[..., :3]))
                            self.assertEqual(str(data['pre_extra_channel_semantics']),
                                'none' if channels == 3 else 'unknown; excluded from RGB compositing')
                            self.assertNotIn('[0,1]', str(data['pre_float32_layout']))

    def test_float_capture_replays_and_retains_subpixel_values(self):
        image=torch.full((1,47,61,3),.4)
        mask=torch.zeros((1,47,61));mask[:,10:38,10:50]=1
        plan=package.VMEditPlan().build(image,mask,'Change selected material','drawn_mask')[0]
        # Values straddle SaveImage truncation and VMNodes nearest rounding.
        pre=torch.linspace(.2,.7,64*64*3).reshape(1,64,64,3)
        original_keys=set(plan)
        for mode in ('off','auto'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as folder:
                with patch.dict(os.environ,{'VM_IMAGE_EDIT_AUDIT':'0'}):
                    reference=package.VMFinalizeEdit().finish(plan,pre,mode)[0]
                with patch.dict(os.environ,{'VM_IMAGE_EDIT_AUDIT':'1','VM_IMAGE_EDIT_AUDIT_DIR':folder}):
                    result=package.VMFinalizeEdit().finish(plan,pre,mode)[0]
                np.testing.assert_array_equal(result,reference)
                self.assertEqual(set(plan),original_keys)
                files=list(Path(folder).glob('*.npz'));self.assertEqual(len(files),1)
                with np.load(files[0],allow_pickle=False) as data:
                    self.assertEqual(int(data['audit_schema']),2)
                    np.testing.assert_array_equal(data['pre_float32'],pre.numpy())
                    np.testing.assert_array_equal(data['pre'],_rgb(pre))
                    restored=restore_to_original(dict(plan),torch.from_numpy(data['pre_float32']),mode)
                    np.testing.assert_array_equal(restored,data['final'])
                    self.assertTrue(np.any(data['pre_float32']*255 != np.rint(data['pre_float32']*255)))
                    self.assertEqual(str(data['pre_tensor_dtype']),'torch.float32')

    def test_bfloat16_capture_is_lossless_in_float32(self):
        image=torch.full((1,32,32,3),.4)
        plan=package.VMEditPlan().build(image,None,'Edit image','full_image')[0]
        pre=torch.full_like(image,.413).to(torch.bfloat16)
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(os.environ,{'VM_IMAGE_EDIT_AUDIT':'1','VM_IMAGE_EDIT_AUDIT_DIR':folder}):
                package.VMFinalizeEdit().finish(plan,pre,'off')
            with np.load(next(Path(folder).glob('*.npz')),allow_pickle=False) as data:
                np.testing.assert_array_equal(data['pre_float32'],pre.float().numpy())
                self.assertEqual(str(data['pre_tensor_dtype']),'torch.bfloat16')

    def test_distinct_float_inputs_with_identical_rgb8_do_not_collide(self):
        image=torch.full((1,32,32,3),.4)
        plan=package.VMEditPlan().build(image,None,'Edit image','full_image')[0]
        a=torch.full_like(image,100.1/255);b=torch.full_like(image,100.2/255)
        np.testing.assert_array_equal(_rgb(a),_rgb(b))
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(os.environ,{'VM_IMAGE_EDIT_AUDIT':'1','VM_IMAGE_EDIT_AUDIT_DIR':folder}):
                package.VMFinalizeEdit().finish(plan,a,'off')
                package.VMFinalizeEdit().finish(plan,b,'off')
            self.assertEqual(len(list(Path(folder).glob('*.npz'))),2)


if __name__=='__main__':unittest.main()
