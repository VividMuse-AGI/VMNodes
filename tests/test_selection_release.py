import importlib.util
from pathlib import Path
import sys
import types
import unittest
import numpy as np
import torch
import cv2
from host import ROOT, package
from vmnodes_test.region import coarse_region, outline_support
from vmnodes_test.vm_legacy.core import _enclosed_selection, pick
from vmnodes_test.vm_legacy.selection import visual_hint
from vmnodes_test.vm_legacy.nodes import _person_segments
sys.path.insert(0, str(ROOT/'tools'))
from check_release import release_date_error


def strokes(kind, h, w):
    m=np.zeros((h,w),np.uint8); x0,y0,x1,y1=w//4,h//4,3*w//4,3*h//4
    if kind.startswith('closed'):
        cv2.rectangle(m,(x0,y0),(x1,y1),1,int(kind[6:]))
    elif kind=='gap':
        cv2.rectangle(m,(x0,y0),(x1,y1),1,1); m[y0,w//2:w//2+2]=0
    elif kind=='open':
        cv2.line(m,(x0,y0),(x0,y1),1,1);cv2.line(m,(x0,y1),(x1,y1),1,1);cv2.line(m,(x1,y0),(x1,y1),1,1)
    elif kind=='edge_open':
        cv2.line(m,(0,y0),(x1,y0),1,1);cv2.line(m,(x1,y0),(x1,y1),1,1);cv2.line(m,(x1,y1),(0,y1),1,1)
    elif kind=='multi':
        cv2.rectangle(m,(w//8,y0),(3*w//8,y1),1,1);cv2.rectangle(m,(5*w//8,y0),(7*w//8,y1),1,1)
    elif kind=='thin':
        cv2.rectangle(m,(x0,y0),(x0+12,y1),1,1)
    elif kind=='strict': m[y0:y0+3,x0:x0+6]=1
    return m.astype(bool)


class SelectionReleaseTests(unittest.TestCase):
    def test_outline_twenty_fixed_inputs(self):
        for h,w in [(256,320),(513,769)]:
            for kind in ['closed1','closed3','closed8','gap','open','edge_open','multi','thin','empty','strict']:
                with self.subTest(size=(h,w),kind=kind):
                    u=strokes(kind,h,w); enclosed=_enclosed_selection(u)
                    scope,evidence=outline_support(u)
                    np.testing.assert_array_equal(enclosed,scope & ~u)
                    if kind in ('open','edge_open','empty'):
                        self.assertFalse(enclosed.any())
                        with self.assertRaisesRegex(ValueError,'VMN_REGION_OPEN|VMN_EMPTY_SCOPE'):coarse_region(u)
                    elif kind=='strict':
                        image=torch.zeros((1,h,w,3));mask=torch.from_numpy(u.astype('float32'))[None]
                        plan=package.VMEditPlan().build(image,mask,'repair','drawn_mask')[0]
                        np.testing.assert_array_equal(plan['allowed'],u)
                    else:
                        self.assertTrue(evidence['enclosed'])
                        np.testing.assert_array_equal(coarse_region(u)[0],scope)
                        hint=visual_hint(u,np.zeros_like(u));x,y=hint['point']
                        self.assertTrue(scope[y,x]);self.assertTrue(hint['bounded'])

    def test_thin_outline_targets_interior_and_rejects_two_targets(self):
        task={'status':'READY','target':'visual','protected':[]}
        for h,w in [(256,320),(513,769)]:
            u=strokes('closed1',h,w); target=np.zeros_like(u)
            target[h//3:2*h//3,w//3:2*w//3]=True
            self.assertFalse((u & target).any())
            chosen,reason,support=pick([target.astype('uint8')*255],u,task,return_support=True)
            self.assertIsNone(reason);np.testing.assert_array_equal(chosen,target)
            self.assertTrue((support & target).any())
            u=strokes('multi',h,w); targets=[]
            for x0,x1 in [(w//8+2,3*w//8-2),(5*w//8+2,7*w//8-2)]:
                t=np.zeros_like(u);t[h//4+2:3*h//4-2,x0:x1]=True;targets.append(t.astype('uint8')*255)
            chosen,reason=pick(targets,u,task)
            self.assertIsNone(chosen);self.assertIn('多个同类目标',reason)

    def prediction(self, classes, masks):
        return types.SimpleNamespace(boxes=None if classes is None else types.SimpleNamespace(cls=torch.tensor(classes,dtype=torch.float32)),
            masks=None if masks is None else types.SimpleNamespace(data=torch.tensor(masks,dtype=torch.float32)))

    def test_person_evidence_and_contract_errors(self):
        names={0:'person',1:'object'}; shape=(12,17); good=np.ones((1,*shape),np.float32)
        rows=[(None,None,'UNCONFIRMED'),([],None,'UNCONFIRMED'),([1],None,'UNCONFIRMED'),
              ([0],None,'MASK_DATA'),([0],np.ones((1,5,7)),'MASK_SIZE'),
              ([0,1],good,'MASK_DATA'),([0],np.full_like(good,np.nan),'MASK_DATA'),
              ([0],np.zeros_like(good),'MASK_DATA'),([0],good*2,'MASK_DATA'),([99],good,'MASK_DATA')]
        for classes,masks,code in rows:
            with self.subTest(classes=classes,code=code):
                with self.assertRaisesRegex(ValueError,'VMN_PERSON_'+code):
                    _person_segments(self.prediction(classes,masks),shape,names)
        result=_person_segments(self.prediction([0,1],np.concatenate([good,good])),shape,names)
        self.assertEqual(len(result),1);self.assertTrue(result[0].all())

    def test_release_heading_is_version_specific(self):
        valid='## Unreleased\n\n## 0.1.4 — 2026-01-01\n\n## 0.1.3 — Unreleased\n'
        self.assertIsNone(release_date_error(valid,'0.1.4'))
        for text in ['## 0.1.4 — Unreleased','## 0.1.40 — 2026-01-01',
                     '## 0.1.4 — 2026-02-30','## 0.1.4 — 2999-01-01',
                     '## 0.1.4 — 2026-01-01\n## [0.1.4] — 2026-01-02', '## 0.1.4']:
            with self.subTest(text=text): self.assertIsNotNone(release_date_error(text,'0.1.4'))

if __name__=='__main__': unittest.main()
