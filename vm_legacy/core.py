"""User selection inference. This module never imports evaluation annotations."""
import re
import cv2
from PIL import ImageDraw,ImageOps
import numpy as np
from PIL import Image
from pathlib import Path


def dilate(m,r):return cv2.dilate(np.uint8(m),cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*r+1,2*r+1)))>0
def erode(m,r):return cv2.erode(np.uint8(m),cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(2*r+1,2*r+1)))>0
def paste_band(support, protected, cover, blend):
    """Paste old target edge fully, then fade only on its outer side."""
    core=dilate(support,cover)&~protected
    allowed=dilate(core,blend)&~protected
    distance=cv2.distanceTransform((~core).astype(np.uint8),cv2.DIST_L2,5)
    t=np.clip((distance-.5)/blend,0,1)
    fade=1-(3*t*t-2*t*t*t)
    alpha=np.rint(np.where(allowed,np.where(core,1,fade),0)*255).astype(np.uint8)
    alpha[protected]=0
    return allowed,alpha


def paste_hair_boundary(allowed, alpha, protected, hair, hard_protected, source=None):
    """Release only hair components with a local contact to the edit region."""
    if not np.any(hair):
        return allowed, alpha, protected, np.zeros_like(allowed)
    side = min(allowed.shape)
    full = max(8, min(48, round(side / 32)))
    fade_width = max(4, min(24, round(side / 64)))
    hair_expand = max(1, min(8, round(side / 192)))
    distance = cv2.distanceTransform((~allowed).astype(np.uint8), cv2.DIST_L2, 5)
    contact_radius = max(1, min(2, round(side / 768)))
    t = np.clip((distance - full) / fade_width, 0, 1)
    band_alpha = np.rint((1 - (t * t * (3 - 2 * t))) * 255).astype(np.uint8)
    candidate = np.zeros_like(allowed)
    labels_count, labels, stats, _ = cv2.connectedComponentsWithStats(hair.astype(np.uint8), 8)
    for index in range(1, labels_count):
        if stats[index, cv2.CC_STAT_AREA] < 32:
            continue
        component = labels == index
        contact = component & (distance <= contact_radius)
        if contact.sum() < max(4, round(side / 256)):
            continue
        contact_distance = cv2.distanceTransform((~contact).astype(np.uint8), cv2.DIST_L2, 5)
        local = (dilate(component, hair_expand) & (~hair | component) & ~hard_protected & (band_alpha > 0) &
                 (contact_distance < full + 2 * fade_width))
        candidate |= local
    allowed[candidate] = True
    alpha[candidate] = np.maximum(alpha[candidate], band_alpha[candidate])
    protected[candidate] = False
    return allowed, alpha, protected, candidate
def attachment_owned(part,chosen,others,radius):
    own=int((part&dilate(chosen,radius)).sum())
    competing=max((int((part&dilate(other,radius)).sum()) for other in others),default=0)
    return own>3 and competing<max(4,own*.4)
def rasterize(selection,size):
    w,h=size;im=Image.new('L',(w,h));d=ImageDraw.Draw(im)
    mode=selection['tool']
    if mode not in ('lasso','brush','strict','region'):raise ValueError('Unknown selection tool')
    widths=selection.get('stroke_widths',[])
    if widths and len(widths)!=len(selection['strokes']):raise ValueError('Stroke width count mismatch')
    for index,stroke in enumerate(selection['strokes']):
        pts=[(round(x*(w-1)),round(y*(h-1))) for x,y in stroke]
        if any(x<0 or y<0 or x>=w or y>=h for x,y in pts):raise ValueError('Selection outside image')
        if mode in ('lasso','region'):
            if len(pts)<3:raise ValueError('Lasso requires at least 3 points')
            d.polygon(pts,fill=255)
        else:
            width=widths[index] if widths else selection.get('brush_width',.035)
            if not 0<width<=.3:raise ValueError('Invalid brush width')
            radius=max(1,round(width*min(w,h)/2))
            d.line(pts,fill=255,width=radius*2,joint='curve')
            for x,y in pts:d.ellipse((x-radius,y-radius,x+radius,y+radius),fill=255)
    return np.asarray(im)>0

TERMS=(('leash',('牵引绳','绳子','leash')),('hair',('头发','发色','hair')),('person',('路人','这个人','人物','行人','游客','人','person')),('shirt',('t 恤','t恤','衣服','上衣','衬衫','运动内衣','背心','外套','夹克','毛衣','卫衣','shirt','tank top','sports bra','jacket','sweater','hoodie')),('cup',('杯子','纸杯','cup')),('dog',('狗','dog')),('collar',('项圈','collar')),('tag',('圆牌','吊牌','tag')),('face',('脸','面部','face')),('hand',('手','hand')))
PROTECT=('别动','不要动','不能动','不要变','保留','留下','保持','不改','别改','不要改','勿动')
EDIT=('去掉','删除','删掉','移除','remove','改','换','染','编辑','替换')
def _category(clause):
    # A hair color can identify a person; a requested hair recolor edits the hair.
    if any(k in clause for k in ('路人','这个人','人物','person','人')) and any(k in clause for k in ('去掉','删除','删掉','移除','remove')):
        return 'person'
    return next((name for name,keys in TERMS if any(key in clause for key in keys)),None)
def _categories(clause):
    return [name for name,keys in TERMS if any(key in clause for key in keys)]
def _position(clause):
    left=any(k in clause for k in ('左边','左侧','left'))
    right=any(k in clause for k in ('右边','右侧','right'))
    return 'CONFLICT' if left and right else 'left' if left else 'right' if right else None
def _clothing_color(clause):
    match=re.search(r'(?:穿|穿着|身着)(.{0,8}?)(?:衣服|外套|上衣|衬衫|恤)|([红绿蓝黑白]衣)',clause)
    if not match:return None
    words=match.group(1) or match.group(2) or ''
    return next((color for color,char in (('red','红'),('green','绿'),('blue','蓝'),('black','黑'),('white','白')) if char in words),None)
def _negated_action(clause):
    return bool(re.search(r'(?:不要|别|禁止|不许|不得|不能|不可|勿|do not|don\'t|never).{0,12}?(?:去掉|删除|删掉|移除|remove|改|换|染|编辑|替换|edit|replace|recolor)',clause))
def intent(text, allow_visual=False):
    """Parse the supported short-command grammar; protective clauses never choose a target."""
    clauses=[c.strip() for c in re.split(r'[，,。；;！!]',text.lower()) if c.strip()]
    edit=[];protected=[]
    for clause in clauses:
        category=_category(clause);pos=_position(clause)
        protection=any(k in clause for k in PROTECT) or _negated_action(clause)
        action=any(k in clause for k in EDIT)
        if protection and action and category and re.search(r'(?:别动|不要变|保留|留下|保持|不改|别改|不要改|勿动).*(?:去掉|删除|删掉|移除|remove|改色|换成|染)',clause):
            return {'status':'NEEDS_CLARIFICATION','reason':'编辑目标和保护要求写在同一句且有歧义，请分开描述。'}
        if protection:
            protected.extend({'category':item,'position':pos,'clause':clause} for item in _categories(clause))
            if allow_visual and not _categories(clause):
                protected.append({'category':None,'position':pos,'clause':clause})
        elif action and (category or allow_visual):edit.append({'category':category,'position':pos,'clause':clause})
    if allow_visual and len(edit)==1 and edit[0]['category'] is None:
        # Unknown recolor nouns may use a spatial selection. Unknown removals do
        # not bypass the independent person guard or existing operation policy.
        clause=edit[0]['clause']
        if any(k in clause for k in ('色','染','recolor','colour','color')) and not any(k in clause for k in ('删','去掉','移除','remove')):
            edit[0]['category']='visual'
        else:
            return {'status':'NEEDS_CLARIFICATION','reason':'VMN_TARGET_DESCRIPTION: 未识别该编辑目标；可使用所画遮罩，或描述需要改色的物体。'}
    if len(edit)!=1 or not edit[0]['category']:
        return {'status':'NEEDS_CLARIFICATION','reason':'请用一句话说明要修改的物体，并另写需要保留的对象。'}
    target=edit[0]['category'];target_text=edit[0]['clause'];target_position=edit[0]['position']
    if target=='visual' and any(p['category'] is None for p in protected):
        return {'status':'NEEDS_CLARIFICATION','reason':'VMN_PROTECTION_UNVERIFIED: 未识别需要保留的对象；请接入手工保护遮罩。'}
    if target not in ('person','cup','leash','shirt','hair','visual'):
        return {'status':'NEEDS_CLARIFICATION','reason':'当前版本尚不支持该编辑目标。'}
    if target_position=='CONFLICT' or any(p['position']=='CONFLICT' for p in protected):
        return {'status':'NEEDS_CLARIFICATION','reason':'左右位置描述相互冲突。'}
    if any(p['category']==target and (p['position'] is None or p['position']==target_position) for p in protected):
        return {'status':'NEEDS_CLARIFICATION','reason':'编辑目标同时被要求保留，请重新描述。'}
    operation='remove' if any(k in target_text for k in ('去掉','删除','删掉','移除','remove')) else 'recolor' if any(k in target_text for k in ('色','染','换成','color')) else 'replace'
    supported={'person':{'remove'},'leash':{'remove'},'cup':{'remove'},'shirt':{'recolor'},'hair':{'recolor'},'visual':{'recolor'}}
    if operation not in supported[target] or (target=='shirt' and re.search(r'换成.{0,12}(?:衬衫|外套|裙|西装|毛衣|连衣裙)',target_text)):
        return {'status':'NEEDS_CLARIFICATION','reason':'当前只支持删除人物、牵引绳、杯子，以及衣服和头发改色；换款式暂不支持。'}
    return {'status':'READY','target':target,'target_position':target_position,'target_color':_clothing_color(target_text) if target=='person' else None,'operation':operation,'protected':protected,'shadow':'影子' in target_text and target=='person','clasp':'绳扣' in target_text and target=='leash','text':text}

def _hint_categories(clause):
    """Conservative optional hints; e.g. chair is not hair, 仙人掌 is not 人."""
    found=[]
    for category,keys in TERMS:
        for key in keys:
            if key=='人':
                match=re.search(r'(?:这个|那个|左边的?|右边的?|左侧的?|右侧的?|一个|一名|一位)人|(?:删除|移除|去掉|把)人(?:$|[，,。；;\s]|删|移|去)',clause)
            elif key.isascii():
                match=re.search(r'\b'+re.escape(key)+r'\b',clause)
            else:match=key in clause
            if match:
                found.append(category);break
    return found


def request_hints(text):
    """Free-form editing entry. The old grammar supplies optional specialists only.

    Selection and generation do not require a registered noun or action verb.
    The original request is always forwarded unchanged to the image model.
    """
    if not isinstance(text,str) or not text.strip():
        raise ValueError('VMN_EMPTY_PROMPT: 请填写编辑需求。')
    legacy=intent(text)
    clauses=[c.strip() for c in re.split(r'[，,。；;！!\n]',text.lower()) if c.strip()]
    def is_protection(clause):
        return any(k in clause for k in PROTECT) or re.search(r"\b(?:keep|preserve|protect|do not|don't)\b",clause)
    edit_hints={category for clause in clauses if not is_protection(clause) for category in _hint_categories(clause)}
    specialist=(legacy['status']=='READY' and legacy['target'] in edit_hints and
                (legacy['target'],legacy['operation']) in
                (('shirt','recolor'),('hair','recolor'),('person','remove'),('leash','remove')))
    if specialist and legacy['operation']=='recolor':
        specialist=any(not is_protection(c) and any(k in c for k in ('色','染','color','colour')) for c in clauses)
    protected=[];unresolved=[]
    for clause in clauses:
        if not is_protection(clause):
            continue
        categories=_hint_categories(clause)
        protected.extend({'category':c,'position':_position(clause),'clause':clause} for c in categories)
        if not categories and not any(k in clause for k in ('背景','其他','其它','其余','background','everything else')):
            unresolved.append(clause)
    if specialist:
        return {**legacy,'protected':protected,'specialist':True,'unresolved_protection':unresolved}
    return {'status':'READY','target':'visual','operation':'edit','target_position':None,
            'target_color':None,'protected':protected,'shadow':False,'clasp':False,
            'text':text,'specialist':False,'unresolved_protection':unresolved}


def _has_clothing_color(image,person,color):
    ys,xs=np.nonzero(person)
    if len(xs)<16:return False
    x0,x1=xs.min(),xs.max();y0,y1=ys.min(),ys.max()
    yy,xx=np.indices(person.shape)
    torso=person&(yy>=y0+.23*(y1-y0))&(yy<=y0+.72*(y1-y0))&(xx>=x0+.12*(x1-x0))&(xx<=x1-.12*(x1-x0))
    if torso.sum()<16:return False
    hsv=cv2.cvtColor(image,cv2.COLOR_RGB2HSV)
    h,s,v=cv2.split(hsv)
    if color=='red':matches=((h<=12)|(h>=170))&(s>=75)&(v>=40)
    elif color=='green':matches=(h>=35)&(h<=85)&(s>=65)&(v>=35)
    elif color=='blue':matches=(h>=90)&(h<=135)&(s>=65)&(v>=35)
    elif color=='black':matches=(v<=65)&(s<=140)
    elif color=='white':matches=(s<=50)&(v>=175)
    else:return False
    return int((matches&torso).sum())>=max(12,int(torso.sum()*.08))

def _enclosed_selection(user):
    """Use the same component-local outline interpretation as coarse editing."""
    from ..region import outline_support
    scope, _ = outline_support(user)
    return scope & ~user

def pick(masks,u,text,image=None,return_support=False):
    def finish(chosen,reason,support=None):
        return (chosen,reason,support) if return_support else (chosen,reason)
    task=intent(text) if isinstance(text,str) else text
    if task['status']!='READY':return finish(None,task['reason'])
    valid=[m>127 for m in masks if (m>127).sum()>=4]
    if not valid:return finish(None,'没有识别到所述目标。')
    centers={id(m):float(np.nonzero(m)[1].mean()) for m in valid}
    def on_side(m,position):
        if len(valid)==1 and position in ('left','right'):
            return (centers[id(m)]<u.shape[1]/2) == (position=='left')
        if position=='left':return centers[id(m)]<=min(centers.values())+1
        if position=='right':return centers[id(m)]>=max(centers.values())-1
        return True
    forbidden=set()
    for p in task.get('protected',[]):
        if p.get('category')!=task['target']:continue
        if p.get('position') in ('left','right'):
            forbidden.update(id(m) for m in valid if on_side(m,p['position']))
    enclosed=_enclosed_selection(u)
    def candidates_for(selection,outlined=False):
        area=max(1,int(selection.sum()))
        candidates=[]
        for i,m in enumerate(valid):
            if id(m) in forbidden or not on_side(m,task.get('target_position')):continue
            overlap=int((m&selection).sum())
            score=overlap/max(1,int(m.sum()))
            precision=overlap/area
            minimum=max(32,round(min(u.shape)*.05))
            if outlined:
                reliable=(score>=.25 and precision>=.15) or (overlap>=minimum and precision>=.80)
            else:
                reliable=score>=.03 or (overlap>=minimum and precision>=.80)
            if overlap and reliable:candidates.append((score,i,m))
        return sorted(candidates,key=lambda a:a[0],reverse=True)
    direct=candidates_for(u)
    outline=candidates_for(enclosed,True) if enclosed.any() else []
    if not direct and not outline:
        return finish(None,'粗选与所述目标没有可靠交集；若画的是轮廓，请闭合轮廓或在目标内部补画几笔。')
    color=task.get('target_color')
    if color:
        if image is None:return finish(None,'无法核实所述衣服颜色，请点选目标。')
        direct=[item for item in direct if _has_clothing_color(image,item[2],color)]
        outline=[item for item in outline if _has_clothing_color(image,item[2],color)]
        if not direct and not outline:return finish(None,'没有可靠核实所述衣服颜色，请点选目标。')
    for candidates in (direct,outline):
        if len(candidates)>1 and candidates[1][0]>=.7*candidates[0][0]:
            return finish(None,'粗选覆盖多个同类目标，请确认要修改哪一个。')
    if direct and outline and direct[0][1]!=outline[0][1]:
        return finish(None,'内部粗涂与外轮廓指向不同目标，请只圈出或涂抹一个目标。')
    use_outline=bool(outline and (not direct or outline[0][0]>=.25))
    chosen=(outline if use_outline else direct)[0][2]
    support=(u|enclosed) if use_outline else u
    return finish(chosen,None,support)


