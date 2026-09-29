"""Image-domain contracts. Generation graphs remain external to this module."""
from types import MappingProxyType

PROFILES = MappingProxyType({
    'qwen21': (32, 32, '1', 'sampling_mask'),
    'manual_image': (1, 1, '1', 'external'),
})

def profile(name='qwen21'):
    if isinstance(name, str) and name == 'flux2_klein9b':
        raise ValueError('VMN_BACKEND_REMOVED: Klein 已撤除，请使用 Qwen / Klein removed; use Qwen.')
    if not isinstance(name, str) or name not in PROFILES:
        raise ValueError('VMN_BACKEND_UNKNOWN: 未知模型适配 / Unknown backend profile.')
    x, y, version, mask = PROFILES[name]
    return {'id': name, 'version': version, 'alignment': (x, y),
            'mask_route': mask, 'mapping': 'same_work_canvas_v1'}

def validate_size(width, height, backend='qwen21'):
    p = profile(backend)
    x, y = p['alignment']
    if width % x or height % y:
        code = 'VMN_QWEN_ALIGNMENT' if backend == 'qwen21' else 'VMN_BACKEND_ALIGNMENT'
        raise ValueError(f'{code}: {backend} 工作宽高需分别为 {x}/{y} 的倍数 / Align work dimensions to {x}/{y}.')
    return p
