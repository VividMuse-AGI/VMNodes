"""Spatial hints for coarse selection; never treat every painted pixel as foreground."""
import cv2
import numpy as np

from .core import _enclosed_selection


def visual_hint(user, protected):
    enclosed = _enclosed_selection(user)
    scope = user | enclosed
    support = scope & ~protected
    if not support.any():
        return None
    height, width = user.shape
    yy, xx = np.where(scope)
    x0, y0, x1, y1 = int(xx.min()), int(yy.min()), int(xx.max())+1, int(yy.max())+1
    bw, bh = x1-x0, y1-y0
    # Only a substantial outline/painted region supplies a useful object extent.
    # A short internal mark must not become a tiny crop cutting off the object.
    bounded = bool(enclosed.any() or (min(bw, bh) >= min(width, height)*.08 and
                                     scope.sum() / (bw*bh) >= .25))
    if bounded:
        margin = max(8, round(max(bw, bh)*.08))
        roi = (max(0,x0-margin), max(0,y0-margin), min(width,x1+margin), min(height,y1+margin))
    else:
        roi = (0,0,width,height)
    # A protected detail excludes seed locations; it is not an object edge.
    # Otherwise even a tiny protected island can push the seed onto background.
    distance = cv2.distanceTransform(scope.astype(np.uint8), cv2.DIST_L2,5)
    distance[~support] = -1
    py, px = np.unravel_index(distance.argmax(),distance.shape)
    return {'roi':roi, 'point':(int(px),int(py)), 'bounded':bounded,
            'extent':(x0,y0,x1,y1), 'support':support}


def spatial_candidate(mask, hint, protected):
    """Reject clipped/escaping point results; retain the component containing the hint."""
    px, py = hint['point']
    count, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8),8)
    label = int(labels[py,px])
    if label == 0 or stats[label,cv2.CC_STAT_AREA] < 32:
        return None
    candidate = labels == label
    if (candidate & protected).sum() > .4*candidate.sum():
        return None
    if hint['bounded']:
        x0,y0,x1,y1 = hint['roi']
        # A cut edge suggests the point selected a bigger object, e.g. the person.
        edge = np.zeros_like(candidate)
        if x0>0: edge[y0:y1,x0:x0+2]=True
        if y0>0: edge[y0:y0+2,x0:x1]=True
        if x1<mask.shape[1]: edge[y0:y1,x1-2:x1]=True
        if y1<mask.shape[0]: edge[y1-2:y1,x0:x1]=True
        if (candidate & edge).sum() > max(4,round(min(mask.shape)*.005)):
            return None
        bx0,by0,bx1,by1=hint['extent']
        inside=candidate[by0:by1,bx0:bx1].sum()/candidate.sum()
        if inside < .90:
            return None
    return candidate


def same_instance(a,b):
    intersection=int((a & b).sum())
    return intersection/max(1,int((a | b).sum())) >= .80


def extent_consistent(candidate, user):
    """Reject tiny fragments only when a substantial region supplies extent evidence."""
    hint = visual_hint(user, np.zeros_like(user))
    if hint is None or not hint['bounded']:
        return True, {'bounded': False}
    scope = hint['support']
    yy, xx = np.where(candidate)
    if not len(xx):
        return False, {'bounded': True, 'coverage': 0.0}
    x0,y0,x1,y1 = hint['extent']
    coverage = float((candidate & scope).sum())/max(1,int(scope.sum()))
    span = max((xx.max()-xx.min()+1)/max(1,x1-x0), (yy.max()-yy.min()+1)/max(1,y1-y0))
    # Do not impose area similarity on thin objects or a short pointing stroke.
    accepted = not (coverage < .02 and span < .30)
    return accepted, {'bounded': True, 'coverage': coverage, 'span': float(span)}


def remove_unmarked_components(mask, user):
    hint = visual_hint(user, np.zeros_like(user))
    if hint is None or not hint['bounded']:
        return mask
    count, labels = cv2.connectedComponents(mask.astype(np.uint8), 8)
    supported = np.unique(labels[hint['support'] & mask])
    supported = supported[supported != 0]
    return np.isin(labels, supported) if len(supported) else np.zeros_like(mask)
