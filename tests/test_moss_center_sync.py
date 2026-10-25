import json
import unittest
from pathlib import Path
import numpy as np
import torch
from host import package
import vmnodes_test.moss_layout as ML
from test_moss_layout import run


class CenterSyncTests(unittest.TestCase):
    def setUp(self):
        self.draft = json.loads((Path(__file__).parent / 'fixtures/meirenyu_layout.json').read_text(encoding='utf-8'))
        self.boxes = ML.parse_skill_json(json.dumps(self.draft), 1152, 2048, ML.SYNC_CENTER)['boxes']

    def test_all_18_boxes_translate_without_new_overlap(self):
        result = ML.sync_boxes(self.boxes, 1152, 2048, 1536, 2048, ML.SYNC_CENTER)
        for old, new in zip(self.boxes, result):
            self.assertAlmostEqual(new['w'] * 1536, old['w'] * 1152)
            self.assertAlmostEqual(new['h'] * 2048, old['h'] * 2048)
            self.assertAlmostEqual(new['cx'] * 1536, old['cx'] * 1152 + 192)
            self.assertAlmostEqual(new['cy'], old['cy'])
        person = next(b for b in result if b['label'] == 'character')
        title = next(b for b in result if b['text'] == '美人余')
        self.assertAlmostEqual((title['cy'] + title['h']/2 - person['cy'] + person['h']/2)*2048, 14)

    def test_full_background_fills_but_large_foreground_does_not(self):
        b = dict(label='object', cx=.5, cy=.5, w=1, h=1, lock_aspect=True)
        self.assertEqual(ML.sync_box_aspect_ratio(b, 1152, 2048, 1536, 2048, ML.SYNC_CENTER), (.5,.5,1,1))
        b.update(w=.9,h=.9)
        self.assertAlmostEqual(ML.sync_box_aspect_ratio(b,1152,2048,1536,2048,ML.SYNC_CENTER)[2]*1536,.9*1152)

    def test_shrink_uses_uniform_layout_scale(self):
        result = ML.sync_boxes(self.boxes,1152,2048,512,1024,ML.SYNC_CENTER)
        scale=512/1152
        for old,new in zip(self.boxes,result):
            self.assertAlmostEqual(new['w']*512,old['w']*1152*scale)
            self.assertAlmostEqual(new['h']*1024,old['h']*2048*scale)
            self.assertGreaterEqual(new['cy']-new['h']/2,-1e-10)
            self.assertLessEqual(new['cy']+new['h']/2,1+1e-10)

    def test_backend_compiles_centered_geometry_and_reference(self):
        data=dict(version=2,base_width=1152,base_height=2048,boxes=self.boxes)
        out=run(width=1536,height=2048,bbox_ratio_sync=ML.SYNC_CENTER,layout_data=json.dumps(data))
        draft=json.loads(out['result'][1])
        for source in self.draft['items']:
            item=next(x for x in draft['items'] if x['caption']==source['caption'])
            expected=[source['bbox'][0]+192,source['bbox'][1],source['bbox'][2]+192,source['bbox'][3]]
            for a,b in zip(item['bbox'],expected): self.assertLessEqual(abs(a-b),1)
        self.assertIn(ML.SYNC_CENTER,ML.VMMOSSLayoutStudio.INPUT_TYPES()['required']['bbox_ratio_sync'][0])

    def test_preview_keeps_reference_in_center_with_neutral_margins(self):
        image=torch.ones((1,2048,1152,3))
        preview=np.asarray(ML.render_preview([],1536,2048,image,reference_size=[1152,2048]))
        # Away from grid, guide lines, footer and palette.
        self.assertTrue(np.max(preview[150,40])<40)
        self.assertTrue(np.min(preview[150,200])>90)
        self.assertTrue(np.max(preview[150,820])<40)

    def test_reference_metadata_survives_parse_and_matches_resize(self):
        state=dict(version=2,base_width=1152,base_height=2048,boxes=[])
        ML.sync_reference_size(state,1536,2048,ML.SYNC_CENTER)
        state.update(base_width=1536,base_height=2048)
        restored=ML.parse_layout_data(json.dumps(state),1536,2048)
        self.assertEqual(restored['reference_size'],[1152,2048])
        ML.sync_reference_size(restored,768,1024,ML.SYNC_CENTER)
        self.assertEqual(restored['reference_size'],[576,1024])
        ML.sync_reference_size(restored,768,1024,ML.SYNC_SMART)
        self.assertNotIn('reference_size',restored)

    def test_external_replace_discards_old_reference_padding(self):
        state=dict(version=2,base_width=1536,base_height=2048,boxes=[],reference_size=[1152,2048])
        out=run(width=1536,height=2048,layout_data=json.dumps(state),bbox_ratio_sync=ML.SYNC_CENTER,
                external_layout_json=json.dumps(self.draft),external_sync_mode=ML.EXTERNAL_REPLACE)
        restored=json.loads(out['ui']['synced_layout_data'][0])
        self.assertNotIn('reference_size',restored)
        self.assertEqual((restored['base_width'],restored['base_height']),(1152,2048))

if __name__=='__main__': unittest.main()
