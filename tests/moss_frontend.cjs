// Pure front-end checks for VM MOSS Layout Studio (no browser needed).
// Run: node tests/moss_frontend.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

class Element {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.style = {}; this.dataset = {};
    this.className = ''; this.handlers = {}; this.clientWidth = 480; this.clientHeight = 360;
    this.offsetHeight = 30; this.scrollTop = 0;
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (name) => { if (!this.classList.contains(name)) this.className += ` ${name}`; },
      remove: (name) => { this.className = this.className.split(/\s+/).filter((s) => s !== name).join(' '); },
      toggle: (name, force) => {
        const add = force === undefined ? !this.classList.contains(name) : force;
        this.classList[add ? 'add' : 'remove'](name);
      },
    };
  }
  append(...elements) { elements.forEach((element) => this.appendChild(element)); }
  appendChild(element) { element.parent = this; this.children.push(element); return element; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  set innerHTML(value) { this.children = []; }
  addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
  removeEventListener(type, handler) { this.handlers[type] = (this.handlers[type] || []).filter(h => h !== handler); }
  setAttribute(name, value) { this.attrs ||= {}; this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs?.[name] ?? null; }
  removeAttribute(name) { if (this.attrs) delete this.attrs[name]; }
  closest(selector) {
    const wanted = selector.split(',').map((part) => part.trim().toUpperCase());
    let node = this;
    while (node) {
      if (wanted.includes(String(node.tagName).toUpperCase())) return node;
      node = node.parent;
    }
    return null;
  }
  click() { for (const handler of this.handlers.click || []) handler({ target: this, stopPropagation() {} }); }
  focus() {}
  contains(element) { return element === this || this.children.some(child => child.contains(element)); }
  getBoundingClientRect() { return { left: 0, top: 0, right: 480, bottom: 360, width: 480, height: 360 }; }
  setPointerCapture(id) { this.capturedPointer = id; }
  releasePointerCapture(id) { this.releasedPointer = id; }

  querySelectorAll(selector) {
    const matches = (element) => selector.split(',').some((part) => {
      const s = part.trim();
      return s.startsWith('.') ? element.classList.contains(s.slice(1)) : element.tagName === s;
    });
    return this.children.flatMap((child) => [...(matches(child) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getContext() {
    return new Proxy({ measureText: (text) => ({ width: String(text).length * 6 }) }, {
      get: (target, name) => target[name] || (() => {}),
    });
  }
}

const MUG_DRAFT = {
  width: 1536, height: 1024, bbox_coord_space: 'abs', bbox_format: 'xyxy',
  summary: {
    meta: ['product campaign', 'studio photography'], canvas: 'single',
    caption: 'A warm studio campaign for a handmade ceramic cup.',
  },
  items: [
    { label: 'object', caption: 'An ivory ceramic cup.', bbox: [176, 224, 800, 864] },
    { label: 'text', caption: 'Large title.', text: '把日常，过成诗。', bbox: [928, 272, 1408, 448] },
    { label: 'text', caption: 'Smaller copy.', text: '一杯温暖\n一刻从容', bbox: [928, 512, 1376, 656] },
  ],
};

const MUG_COMPILED = {
  summary: { meta: ['product campaign', 'studio photography'], canvas: 'single', caption: 'cup' },
  items: [
    { label: 'object', caption: 'An ivory ceramic cup.', bbox: [-288, -592, 352, 32] },
    { label: 'text', caption: 'Large title.', text: '把日常，过成诗。', bbox: [-240, 160, -64, 640] },
    { label: 'text', caption: 'Smaller copy.', text: '一杯温暖\n一刻从容', bbox: [0, 160, 144, 608] },
  ],
  bbox_coord_space: 'abs_centralized', bbox_format: 'yxyx',
};

(async () => {
  let extension;
  globalThis.__mossTestApp = { registerExtension(value) { extension = value; }, graph: { setDirtyCanvas() {} } };
  const autocompleteUrl = 'data:text/javascript;base64,' + Buffer.from(
    fs.readFileSync(path.join(ROOT, 'web/moss_autocomplete.js'), 'utf8')).toString('base64');
  const source = fs.readFileSync(path.join(ROOT, 'web/moss_layout_studio.js'), 'utf8')
    .replace(/^import \{ app \}.*$/m, 'const app = globalThis.__mossTestApp;')
    .replace(/^import \{ api \}.*$/m, 'const api = { getExtensions: async () => [] };')
    .replace('"./moss_autocomplete.js"', JSON.stringify(autocompleteUrl));
  const mod = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  const {
    I18N, PRESETS, PRESET_CUSTOM, SYNC_SMART, SYNC_KEEP, SYNC_STRETCH, LAYER_AUTO, LAYER_MANUAL,
    alignedSize, syncBoxAspectRatio, effectiveOrder, displayTags, resizeGeometry,
    parseSkillJson, buildDraftJson, normalizeState, contentId, sha1Hex, splitTags,
    clampView, zoomAtPoint, viewToCanvas, ZOOM_MAX, PALETTE_THEMES, QUICK_COLORS,
    THEME_CUSTOM, normalizeHex, pushPaletteColor, nextAllVisible, setAllVisible,
    hexFromRgb, extractDominantColorsFromPixels, pickColorWithEyedropper,
    guideRatios, snapBoxToGuides, GUIDE_GOLDEN, GUIDE_SNAP_PX,
  } = mod;

  const images = [];
  const createEditor = () => {
    const frames = [];
    globalThis.window = { devicePixelRatio: 1, LiteGraph: { vueNodesMode: true }, handlers: {},
      addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); },
      removeEventListener(type, handler) { this.handlers[type] = (this.handlers[type] || []).filter(h => h !== handler); },
    };
    globalThis.document = {
      head: new Element('head'), body: new Element('body'), getElementById: () => null,
      createElement: (tag) => new Element(tag), addEventListener() {}, removeEventListener() {},
    };
    globalThis.Image = class {
      constructor() { images.push(this); this.complete = false; this.naturalWidth = 0; }
    };
    globalThis.requestAnimationFrame = (fn) => { frames.push(fn); };
    class Node {
      constructor() {
        const values = {
          ui_language: 'English (EN)', canvas_preset: PRESET_CUSTOM, width: 1024, height: 1024,
          bbox_ratio_sync: SYNC_SMART, scene_meta: 'poster', canvas_layout_type: 'single',
          layer_order_mode: LAYER_AUTO, global_prompt: 'old caption', layout_data: '{}',
          external_sync_mode: 'Merge into Canvas (追加到当前画布并回填)', custom_meta_tags: 'old tag',
        };
        this.widgets = Object.entries(values).map(([name, value]) => ({ name, value, callback() {},
          options: { values: name === 'scene_meta' ? ['poster', 'infographic', mod.META_NONE]
            : name === 'canvas_layout_type' ? ['single', 'multi_panel', 'collage'] : [] } }));
        this.widgets.find((widget) => widget.name === 'global_prompt').inputEl = new Element('textarea');
        this.inputs = [{ name: 'ref_image', link: null }, { name: 'external_layout_json', link: null }];
        this.size = [520, 700];
      }
      setSize(size) { this.size = size; }
      computeSize() { return [520, 700]; }
      addDOMWidget(name, type, element) { this.root = element; document.body.appendChild(element); return { options: {} }; }
    }
    extension.beforeRegisterNodeDef(Node, { name: mod.NODE_ID });
    const node = new Node();
    node.onNodeCreated();
    while (frames.length) frames.shift()();
    node.getWidget = (name) => node.widgets.find((widget) => widget.name === name);
    return node;
  };

  let passed = 0;
  const check = (name, fn) => {
    const pass = () => { passed += 1; console.log(`  [PASS] ${name}`); };
    const fail = (err) => { console.log(`  [FAIL] ${name} — ${err.message}`); process.exitCode = 1; };
    try {
      const result = fn();
      if (result?.then) return result.then(pass, fail);
      pass();
    } catch (err) { fail(err); }
  };

  console.log('[1] i18n dictionary');
  check('zh/en expose the same key set', () => {
    assert.deepStrictEqual(Object.keys(I18N.zh).sort(), Object.keys(I18N.en).sort());
  });
  check('every translation is a non-empty string', () => {
    for (const lang of ['zh', 'en']) {
      for (const [key, value] of Object.entries(I18N[lang])) {
        assert.strictEqual(typeof value, 'string', `${lang}.${key}`);
        assert.ok(value.trim().length > 0, `${lang}.${key} is empty`);
      }
    }
  });
  check('placeholders match between languages', () => {
    const holes = (s) => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');
    for (const key of Object.keys(I18N.zh)) {
      assert.strictEqual(holes(I18N.zh[key]), holes(I18N.en[key]), key);
    }
  });

  console.log('[2] presets and alignment');
  check('every preset named by the design is present (+ Custom)', () => {
    // The design prose says 16 groups but its canonical list names 17 (the
    // horizontal group has five entries). All listed sizes are implemented.
    const names = Object.keys(PRESETS).filter((k) => k !== PRESET_CUSTOM);
    assert.strictEqual(names.length, 17, `got ${names.length}`);
    assert.ok(names.includes('Ultrawide 21:9 (1536x640)'));
    assert.ok(names.includes('Print A4 HD (1216x1728)'));
    assert.ok(PRESET_CUSTOM in PRESETS);
  });
  check('all preset sizes are multiples of 16 and within 256–4096', () => {
    for (const [name, size] of Object.entries(PRESETS)) {
      if (!size) continue;
      assert.strictEqual(size[0] % 16, 0, name);
      assert.strictEqual(size[1] % 16, 0, name);
    }
  });
  check('alignedSize snaps and clamps', () => {
    assert.strictEqual(alignedSize(1001), 1008);
    assert.strictEqual(alignedSize(777), 784);
    assert.strictEqual(alignedSize(100), 256);
    assert.strictEqual(alignedSize(5000), 4096);
    assert.strictEqual(alignedSize(1024), 1024);
  });

  console.log('[3] content ids match the Python parser');
  check('SHA-1 known vector', () => {
    assert.strictEqual(sha1Hex('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  });
  check('imported ids equal Python sha1 prefixes', () => {
    const parsed = parseSkillJson(JSON.stringify(MUG_DRAFT), 1536, 1024, SYNC_KEEP);
    assert.deepStrictEqual(parsed.boxes.map((b) => b.id),
      ['imp_dc9e4045d2', 'imp_240618557d', 'imp_ba2b67e9d5']);
  });
  check('contentId is stable for a known box', () => {
    const id = contentId('character', 'hero', '', { cx: 0.5, cy: 0.5, w: 0.4, h: 0.4 });
    assert.match(id, /^imp_[0-9a-f]{10}$/);
    assert.strictEqual(id, contentId('character', 'hero', '', { cx: 0.5, cy: 0.5, w: 0.4, h: 0.4 }));
  });

  console.log('[4] Skill JSON parsing');
  check('draft keeps canvas, meta, canvas type, caption and boxes', () => {
    const parsed = parseSkillJson(JSON.stringify(MUG_DRAFT), 896, 1152, SYNC_KEEP);
    assert.strictEqual(parsed.kind, 'draft');
    assert.deepStrictEqual([parsed.width, parsed.height], [1536, 1024]);
    assert.deepStrictEqual(parsed.meta, ['product campaign', 'studio photography']);
    assert.strictEqual(parsed.canvas, 'single');
    assert.strictEqual(parsed.boxes.length, 3);
    assert.strictEqual(parsed.boxes[2].text, '一杯温暖\n一刻从容');
    assert.ok(Math.abs(parsed.boxes[0].cx - 488 / 1536) < 1e-12);
  });
  check('markdown fences are stripped', () => {
    const text = '```json\n' + JSON.stringify(MUG_DRAFT) + '\n```';
    assert.strictEqual(parseSkillJson(text, 1536, 1024).boxes.length, 3);
  });
  check('compiled yxyx parses to the same normalised geometry', () => {
    const a = parseSkillJson(JSON.stringify(MUG_DRAFT), 1536, 1024, SYNC_KEEP).boxes;
    const b = parseSkillJson(JSON.stringify(MUG_COMPILED), 1536, 1024, SYNC_KEEP).boxes;
    assert.strictEqual(b.length, 3);
    for (let i = 0; i < 3; i += 1) {
      for (const key of ['cx', 'cy', 'w', 'h']) {
        assert.ok(Math.abs(a[i][key] - b[i][key]) < 1e-9, `${i}.${key}`);
      }
    }
  });
  check('caption-only objects and plain strings fill the caption', () => {
    assert.deepStrictEqual(
      [parseSkillJson('{"caption":"just a caption"}', 896, 1152).kind,
        parseSkillJson('{"caption":"just a caption"}', 896, 1152).caption],
      ['caption', 'just a caption']);
    const plain = parseSkillJson('a plain caption', 896, 1152);
    assert.strictEqual(plain.kind, 'caption');
    assert.deepStrictEqual(plain.boxes, []);
  });
  check('unrecognised JSON returns null', () => {
    assert.strictEqual(parseSkillJson('{"foo":[1,2]}', 896, 1152), null);
  });
  check('cross-size import keeps a square character (F02)', () => {
    const square = {
      width: 1024, height: 1024, bbox_coord_space: 'abs', bbox_format: 'xyxy',
      summary: { caption: 'square' },
      items: [{ label: 'character', caption: 'hero', bbox: [307, 307, 717, 717] }],
    };
    const parsed = parseSkillJson(JSON.stringify(square), 768, 1344, SYNC_KEEP);
    const box = parsed.boxes[0];
    const wPx = box.w * 768;
    const hPx = box.h * 1344;
    assert.ok(Math.abs(wPx - hPx) <= 1, `${wPx}×${hPx}`);
  });

  console.log('[5] resize geometry (F03)');
  const base = { cx: 0.5, cy: 0.5, w: 0.4, h: 0.1, orig_aspect: 4, lock_aspect: true, label: 'text' };
  check('4:1 locked box cannot shrink below 32×8 px', () => {
    const next = resizeGeometry(base, 'se', { x: 0.3001, y: 0.4501 }, 1024, 1024, false);
    assert.ok(Math.abs(next.w * 1024 - 32) < 1e-6, `w=${next.w * 1024}`);
    assert.ok(Math.abs(next.h * 1024 - 8) < 1e-6, `h=${next.h * 1024}`);
    assert.ok(Math.abs((next.w * 1024) / (next.h * 1024) - 4) < 1e-9);
  });
  check('1:4 locked box cannot shrink below 8×32 px', () => {
    const tall = { ...base, orig_aspect: 0.25, w: 0.1, h: 0.4 };
    const next = resizeGeometry(tall, 'se', { x: 0.4501, y: 0.3001 }, 1024, 1024, false);
    assert.ok(Math.abs(next.w * 1024 - 8) < 1e-6, `w=${next.w * 1024}`);
    assert.ok(Math.abs(next.h * 1024 - 32) < 1e-6, `h=${next.h * 1024}`);
  });
  check('1:1 locked box minimum is 8×8 px', () => {
    const square = { ...base, orig_aspect: 1, w: 0.3, h: 0.3 };
    const next = resizeGeometry(square, 'se', { x: 0.3501, y: 0.3501 }, 1024, 1024, false);
    assert.ok(Math.abs(next.w * 1024 - 8) < 1e-6, `w=${next.w * 1024}`);
    assert.ok(Math.abs(next.h * 1024 - 8) < 1e-6, `h=${next.h * 1024}`);
  });
  check('all four corners keep the locked ratio and stay inside', () => {
    for (const handle of ['nw', 'ne', 'sw', 'se']) {
      for (const point of [{ x: 0.02, y: 0.02 }, { x: 0.98, y: 0.98 }, { x: 0.05, y: 0.9 }]) {
        const next = resizeGeometry(base, handle, point, 1024, 1024, false);
        assert.ok(Math.abs((next.w * 1024) / (next.h * 1024) - 4) < 1e-6, `${handle}`);
        assert.ok(next.w > 0 && next.h > 0);
        assert.ok(next.cx - next.w / 2 >= -1e-9 && next.cx + next.w / 2 <= 1 + 1e-9, `${handle} x`);
        assert.ok(next.cy - next.h / 2 >= -1e-9 && next.cy + next.h / 2 <= 1 + 1e-9, `${handle} y`);
      }
    }
  });
  check('unlocked boxes resize freely with an 8px floor', () => {
    const free = { ...base, lock_aspect: false };
    const next = resizeGeometry(free, 'se', { x: 0.9001, y: 0.6001 }, 1024, 1024, false);
    assert.ok(Math.abs(next.w * 1024 - (0.9001 - 0.3) * 1024) < 1e-6);
    assert.ok(Math.abs(next.h * 1024 - (0.6001 - 0.45) * 1024) < 1e-6);
  });

  console.log('[6] effective layer order (F05)');
  const boxes = [
    { id: 'a', label: 'text', visible: true, cx: 0.5, cy: 0.2, w: 0.6, h: 0.1 },
    { id: 'b', label: 'object', visible: true, cx: 0.5, cy: 0.5, w: 0.98, h: 0.98 },
    { id: 'c', label: 'object', visible: true, cx: 0.2, cy: 0.8, w: 0.1, h: 0.1 },
    { id: 'd', label: 'character', visible: true, cx: 0.5, cy: 0.5, w: 0.4, h: 0.4 },
  ];
  check('Auto puts text last and sorts objects by area', () => {
    assert.deepStrictEqual(effectiveOrder(boxes, LAYER_AUTO).map((b) => b.id), ['b', 'c', 'd', 'a']);
  });
  check('Manual preserves the list order', () => {
    assert.deepStrictEqual(effectiveOrder(boxes, LAYER_MANUAL).map((b) => b.id), ['a', 'b', 'c', 'd']);
  });
  check('display tags follow list order, not z-order', () => {
    assert.deepStrictEqual(displayTags(boxes), { a: 'T1', b: 'O1', c: 'O2', d: 'C1' });
  });

  console.log('[7] draft export matches the backend');
  check('draft export reproduces the Python draft for the mug example', () => {
    const parsed = parseSkillJson(JSON.stringify(MUG_DRAFT), 1536, 1024, SYNC_KEEP);
    const state = normalizeState({ version: 2, base_width: 1536, base_height: 1024, boxes: parsed.boxes }, 1536, 1024);
    const draft = buildDraftJson(state, 1536, 1024, {
      caption: parsed.caption, meta: parsed.meta, canvas: parsed.canvas, palette: [], layerOrder: LAYER_MANUAL, lang: 'en',
    });
    assert.deepStrictEqual(draft.items.map((i) => i.bbox),
      [[176, 224, 800, 864], [928, 272, 1408, 448], [928, 512, 1376, 656]]);
    assert.strictEqual(draft.items[2].text, '一杯温暖\n一刻从容');
    assert.deepStrictEqual(draft.summary.meta, ['product campaign', 'studio photography']);
  });
  check('hidden boxes are excluded from the draft', () => {
    const state = normalizeState({
      version: 2, base_width: 1024, base_height: 1024,
      boxes: [{ id: 'x', label: 'object', visible: false, cx: 0.5, cy: 0.5, w: 0.5, h: 0.5, orig_aspect: 1 }],
    }, 1024, 1024);
    assert.strictEqual(buildDraftJson(state, 1024, 1024, { caption: 'c', layerOrder: LAYER_AUTO, lang: 'en' }).items.length, 0);
  });

  console.log('[8] mode helpers');
  check('sync modes fall back to Smart', () => {
    assert.strictEqual(mod.syncModeValue('nonsense'), SYNC_SMART);
    assert.strictEqual(mod.syncModeValue(SYNC_STRETCH), SYNC_STRETCH);
    assert.strictEqual(mod.syncModeValue(SYNC_KEEP), SYNC_KEEP);
  });
  check('tag splitting accepts commas and full-width separators', () => {
    assert.deepStrictEqual(splitTags('poster, editorial，poster'), ['poster', 'editorial']);
    assert.deepStrictEqual(splitTags(['a', 'b']), ['a', 'b']);
  });
  check('aspect sync returns the same size for identical canvases', () => {
    const box = { cx: 0.3, cy: 0.4, w: 0.2, h: 0.2, label: 'text', orig_aspect: 1, lock_aspect: true };
    assert.deepStrictEqual(syncBoxAspectRatio(box, 1024, 1024, 1024, 1024, SYNC_SMART),
      { cx: 0.3, cy: 0.4, w: 0.2, h: 0.2 });
  });

  console.log('[9] independent review regressions');
  check('alignment uses Python ties-to-even, including input rounding', () => {
    for (const [input, expected] of [[1032, 1024], [1048, 1056], [1064, 1056],
      [1031.5, 1024], [1032.5, 1024], [1047.5, 1056], [255.5, 256], [4096.5, 4096]]) {
      assert.strictEqual(alignedSize(input), expected, String(input));
    }
  });
  check('fractional draft edges survive repeated import and export', () => {
    let state = normalizeState({ version: 2, base_width: 1024, base_height: 1024,
      boxes: [{ id: 'fractional', label: 'object', visible: true, cx: 0.5031, cy: 0.4977,
        w: 0.3011, h: 0.2033, orig_aspect: 1.5, caption: 'x', text: '' }] }, 1024, 1024);
    const summary = { caption: 'audit', layerOrder: LAYER_MANUAL, lang: 'en' };
    for (let i = 0; i < 4; i++) {
      const draft = buildDraftJson(state, 1024, 1024, summary);
      assert.deepStrictEqual(draft.items[0].bbox, [361.0112, 405.5552, 669.3376, 613.7344]);
      const parsed = parseSkillJson(JSON.stringify(draft), 1024, 1024);
      state = normalizeState({ ...state, boxes: parsed.boxes }, 1024, 1024);
    }
  });
  check('state normalization retains palette and explicit empty summary values', () => {
    const state = normalizeState({ version: 2, base_width: 1024, base_height: 1024, boxes: [],
      caption: '', meta: [], palette: ['#112233'] }, 1024, 1024);
    assert.deepStrictEqual(state.palette, ['#112233']);
    assert.strictEqual(state.caption, '');
    assert.deepStrictEqual(state.meta, []);
    assert.deepStrictEqual(normalizeState({ ...state, palette: [] }, 1024, 1024).palette, []);
  });
  check('empty draft and compiled layouts are distinct from caption-only inputs', () => {
    for (const [bbox_coord_space, bbox_format] of [['abs', 'xyxy'], ['abs_centralized', 'yxyx']]) {
      const parsed = parseSkillJson(JSON.stringify({ width: 768, height: 1344,
        bbox_coord_space, bbox_format, summary: { caption: '' }, items: [] }), 1024, 1024);
      assert.ok(parsed && parsed.kind !== 'caption');
      assert.deepStrictEqual(parsed.boxes, []);
      assert.strictEqual(parsed.width, 768);
    }
    assert.strictEqual(parseSkillJson('{"caption":"caption only"}', 1024, 1024).kind, 'caption');
    assert.strictEqual(parseSkillJson('{"items":[{"label":"object","bbox":[]}]}', 1024, 1024), null);
  });

  const returnedState = {
    version: 2, base_width: 1024, base_height: 1024, caption: '', meta: [], canvas: 'single', palette: ['#112233'],
    boxes: [{ id: 'imported', label: 'text', visible: true, lock_aspect: true,
      cx: 0.375, cy: 0.375, w: 0.25, h: 0.25, orig_aspect: 1, text: 'Original', caption: 'title' }],
  };
  const payload = { resolved_size: [[1024, 1024]], synced_layout_data: [JSON.stringify(returnedState)] };
  check('repeated onExecuted payload overwrites stale local edits and restores widgets', () => {
    const node = createEditor();
    node.onExecuted(payload);
    node.onExecuted(payload);
    node._vmmoss.S.state.boxes[0].text = 'Edited';
    node._vmmoss.S.state.boxes[0].cx = 0.475;
    node.getWidget('global_prompt').value = 'manual caption';
    node.getWidget('width').value = 1032;
    node._vmmoss.commit();
    node.onExecuted(payload);
    const state = JSON.parse(node.getWidget('layout_data').value);
    assert.strictEqual(state.boxes[0].text, 'Original');
    assert.strictEqual(state.boxes[0].cx, 0.375);
    assert.strictEqual(node.getWidget('width').value, 1024);
    assert.strictEqual(node.getWidget('global_prompt').value, '');
    assert.strictEqual(node.getWidget('scene_meta').value, mod.META_NONE);
    assert.strictEqual(node.getWidget('custom_meta_tags').value, '');
    assert.deepStrictEqual(state.palette, ['#112233']);
    assert.strictEqual(node.root.querySelectorAll('.vmmoss-row').length, 1);
  });
  const importViaDialog = (node, value, replace) => {
    node.root.querySelectorAll('button').find((button) => button.textContent === I18N.en.importJson).click();
    const modal = document.body.querySelector('.vmmoss-modal');
    modal.querySelector('textarea').value = value;
    modal.querySelectorAll('button').find((button) => button.textContent ===
      I18N.en[replace ? 'replaceCanvas' : 'mergeCanvas']).click();
  };
  check('import dialog Replace clears the canvas for an empty layout', () => {
    const node = createEditor();
    node.onExecuted(payload);
    importViaDialog(node, JSON.stringify({ width: 768, height: 1344, items: [],
      bbox_coord_space: 'abs', bbox_format: 'xyxy', summary: { caption: '', meta: [], palette: [] } }), true);
    assert.deepStrictEqual(node._vmmoss.S.state.boxes, []);
    assert.strictEqual(node.root.querySelectorAll('.vmmoss-row').length, 0);
    assert.deepStrictEqual(node._vmmoss.liveSize(), { w: 768, h: 1344 });
    assert.deepStrictEqual(node._vmmoss.S.state.palette, []);
    assert.strictEqual(node.getWidget('global_prompt').value, '');
    assert.strictEqual(node.getWidget('scene_meta').value, mod.META_NONE);
    node.root.querySelectorAll('button').find((button) => button.textContent === I18N.en.exportJson).click();
    const exported = JSON.parse(document.body.querySelector('.vmmoss-modal').querySelector('textarea').value);
    assert.strictEqual(exported.summary.caption, '');
    assert.deepStrictEqual(exported.items, []);
  });
  check('caption-only dialog import preserves boxes and palette', () => {
    const node = createEditor();
    node.onExecuted(payload);
    importViaDialog(node, '{"caption":"updated caption"}', true);
    assert.strictEqual(node._vmmoss.S.state.boxes.length, 1);
    assert.deepStrictEqual(node._vmmoss.S.state.palette, ['#112233']);
    assert.strictEqual(node.getWidget('global_prompt').value, 'updated caption');
  });
  check('invalid nonempty layout with caption cannot clear the canvas', () => {
    const node = createEditor();
    node.onExecuted(payload);
    const previous = JSON.stringify(node._vmmoss.S.state);
    const invalid = JSON.stringify({ width: 768, height: 1344,
      summary: { caption: 'invalid incoming layout' }, items: [{ label: 'object', bbox: [] }] });
    assert.strictEqual(parseSkillJson(invalid, 1024, 1024), null);
    importViaDialog(node, invalid, true);
    assert.strictEqual(JSON.stringify(node._vmmoss.S.state), previous);
    assert.deepStrictEqual(node._vmmoss.liveSize(), { w: 1024, h: 1024 });
    assert.strictEqual(node.getWidget('global_prompt').value, '');
    assert.ok(document.body.querySelector('.vmmoss-modal'));
    assert.strictEqual(document.body.querySelector('.vmmoss-status').textContent, I18N.en.importFail);
  });
  check('Merge dialog applies and exports the incoming summary palette', () => {
    const node = createEditor();
    const incoming = { ...MUG_DRAFT, summary: { ...MUG_DRAFT.summary, palette: ['#abcdef'] } };
    importViaDialog(node, JSON.stringify(incoming), false);
    assert.deepStrictEqual(node._vmmoss.S.state.palette, ['#abcdef']);
    node.root.querySelectorAll('button').find((button) => button.textContent === I18N.en.exportJson).click();
    const exported = JSON.parse(document.body.querySelector('.vmmoss-modal').querySelector('textarea').value);
    assert.deepStrictEqual(exported.summary.palette, ['#abcdef']);
  });
  check('reference disconnect clears the overlay and ignores a delayed image load', () => {
    const node = createEditor();
    node.inputs[0].link = 1;
    node.onExecuted({ ref_info: [{ size: [1080, 1440], aligned: [1088, 1440], thumbnail: 'fixture:a' }] });
    const image = images.at(-1);
    assert.strictEqual(node._vmmoss.S.ref.image, image);
    node.inputs[0].link = null;
    node.onConnectionsChange();
    image.complete = true; image.naturalWidth = 2; image.onload();
    assert.strictEqual(node._vmmoss.S.ref, null);
    assert.strictEqual(node.root.querySelector('.vmmoss-ref').classList.contains('show'), false);
  });
  check('backend null reference clears the overlay and earlier loads cannot replace a newer image', () => {
    const node = createEditor();
    node.inputs[0].link = 1;
    node.onExecuted({ ref_info: [{ size: [1024, 1024], aligned: [1024, 1024], thumbnail: 'fixture:a' }] });
    const oldImage = images.at(-1);
    node.onExecuted({ ref_info: [{ size: [768, 1344], aligned: [768, 1344], thumbnail: 'fixture:b' }] });
    const newImage = images.at(-1);
    oldImage.complete = true; oldImage.naturalWidth = 2; oldImage.onload();
    assert.strictEqual(node._vmmoss.S.ref.image, newImage);
    node.onExecuted({ ref_info: [null] });
    newImage.complete = true; newImage.naturalWidth = 2; newImage.onload();
    assert.strictEqual(node._vmmoss.S.ref, null);
    assert.strictEqual(node.root.querySelector('.vmmoss-ref').classList.contains('show'), false);
  });
  check('a queued reference result cannot restore an overlay after disconnect', () => {
    const node = createEditor();
    const queued = { ref_info: [{ size: [1080, 1440], aligned: [1088, 1440], thumbnail: 'fixture:queued' }] };
    node.inputs[0].link = 1;
    node.onExecuted(queued);
    node.inputs[0].link = null;
    node.onConnectionsChange();
    node.onExecuted(queued);
    assert.strictEqual(node._vmmoss.S.ref, null);
    assert.strictEqual(node.root.querySelector('.vmmoss-ref').classList.contains('show'), false);
    node.inputs[0].link = 2;
    node.onExecuted(queued);
    assert.deepStrictEqual(node._vmmoss.S.ref.size, [1080, 1440]);
    // Lightweight hosts without input metadata can still consume UI payloads.
    delete node.inputs;
    node.onExecuted(queued);
    assert.deepStrictEqual(node._vmmoss.S.ref.size, [1080, 1440]);
  });

  console.log('[final audit regressions]');
  const compiledBox = (bbox, size = {}) => JSON.stringify({ ...size,
    bbox_coord_space: 'abs_centralized', bbox_format: 'yxyx',
    items: [{ label: 'object', caption: 'cup', bbox }] });
  check('missing compiled dimensions reject all four outside edges', () => {
    for (const bbox of [[-513,-100,100,100],[-100,-513,100,100],[-100,-100,513,100],[-100,-100,100,513]]) {
      assert.throws(() => parseSkillJson(compiledBox(bbox), 1024, 1024), /compiledSizeError/);
    }
  });
  check('missing dimensions accept exact edges and explicit dimensions permit resizing', () => {
    assert.strictEqual(parseSkillJson(compiledBox([-512,-512,512,512]), 1024, 1024).boxes.length, 1);
    assert.strictEqual(parseSkillJson(JSON.stringify({...MUG_COMPILED, width:1536, height:1024}), 768, 1344).boxes.length, 3);
  });
  check('partial and null dimensions validate the missing axis', () => {
    for (const [size, bbox] of [[{width:1536},[-513,-592,352,32]], [{height:1024},[-288,-592,352,32]], [{width:null},[-288,-592,352,32]]]) {
      assert.throws(() => parseSkillJson(compiledBox(bbox, size), 1024, 1024), /compiledSizeError/);
    }
  });
  check('failed compiled Replace and Merge keep the entire local layout and show an actionable error', () => {
    for (const replace of [true, false]) {
      const node = createEditor();
      node.onExecuted(payload);
      const before = node.getWidget('layout_data').value;
      importViaDialog(node, JSON.stringify(MUG_COMPILED), replace);
      assert.strictEqual(node.getWidget('layout_data').value, before);
      assert.strictEqual(node.getWidget('global_prompt').value, '');
      assert.deepStrictEqual(node._vmmoss.liveSize(), {w:1024,h:1024});
      assert.strictEqual(document.body.querySelector('.vmmoss-status').textContent, I18N.en.compiledSizeError);
      assert.ok(document.body.querySelector('.vmmoss-modal'));
    }
  });
  const keyOnCanvas = (node, key, shiftKey = false) => {
    const event = {key, shiftKey, prevented:false, stopped:false,
      preventDefault() { this.prevented=true; }, stopPropagation() { this.stopped=true; }};
    for (const handler of node.root.querySelector('canvas').handlers.keydown) handler(event);
    // The host ignores defaultPrevented; only stopped propagation protects it.
    return {...event, hostWouldReceive:!event.stopped};
  };
  for (const key of ['Delete', 'Backspace']) {
    check(`${key} deletes only the selected box and does not reach host shortcuts`, () => {
      const node = createEditor();
      importViaDialog(node, JSON.stringify(MUG_DRAFT), true);
      const state = node._vmmoss.S;
      state.sel = state.state.boxes[0].id;
      const expected = state.state.boxes.slice(1).map((box) => box.id);
      const event = keyOnCanvas(node, key);
      assert.deepStrictEqual(state.state.boxes.map((box) => box.id), expected);
      assert.strictEqual(event.prevented,true);
      assert.strictEqual(event.hostWouldReceive,false);
    });
    check(`${key} with no selected box preserves layout and does not reach host shortcuts`, () => {
      const node=createEditor(); node.onExecuted(payload); node._vmmoss.S.sel=null;
      const before=node.getWidget('layout_data').value;
      assert.strictEqual(keyOnCanvas(node,key).hostWouldReceive,false);
      assert.strictEqual(node.getWidget('layout_data').value,before);
    });
  }
  check('arrow keys still nudge and unrelated shortcuts still propagate', () => {
    const node=createEditor(); node.onExecuted(payload);
    const box=node._vmmoss.S.state.boxes[0]; node._vmmoss.S.sel=box.id;
    const start=box.cx;
    assert.strictEqual(keyOnCanvas(node,'ArrowRight').hostWouldReceive,false);
    assert.strictEqual(box.cx,start+1/1024);
    keyOnCanvas(node,'ArrowLeft',true);
    assert.strictEqual(box.cx,start-9/1024);
    assert.strictEqual(keyOnCanvas(node,'z').hostWouldReceive,true);
  });
  check('global caption placeholder switches EN/ZH/EN without changing content', () => {
    const node=createEditor();
    const caption=node.getWidget('global_prompt');
    const language=node.getWidget('ui_language');
    for (const [value,lang] of [['English (EN)','en'],['中文 (ZH)','zh'],['English (EN)','en']]) {
      language.value=value; language.callback(value);
      assert.match(caption.inputEl.placeholder || '', lang === 'en' ? /^Overall scene/ : /^整体画面/);
      assert.strictEqual(caption.options.placeholder,I18N[lang].placeholderGlobal);
      assert.strictEqual(caption.inputEl.placeholder,I18N[lang].placeholderGlobal);
      assert.strictEqual(caption.value,'old caption');
    }
  });

  check('layer reorder uses local row coordinates at every canvas zoom and scroll offset', () => {
    for (const scale of [0.5, 0.8, 1, 1.5]) for (const scrollTop of [0, 26]) {
      const node=createEditor();
      importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
      const original=node._vmmoss.S.state.boxes.map(box=>box.id);
      const rows=node.root.querySelector('.vmmoss-rows');
      rows.clientHeight=80-scrollTop;
      rows.offsetHeight=rows.clientHeight+2;
      rows.clientTop=1;
      rows.scrollTop=scrollTop;
      rows.getBoundingClientRect=()=>({top:100,height:rows.offsetHeight*scale});
      const grip=rows.querySelector('.grip');
      grip.setPointerCapture=()=>{};
      grip.removeEventListener=(type,handler)=>{grip.handlers[type]=grip.handlers[type].filter(h=>h!==handler);};
      grip.handlers.pointerdown[0]({pointerId:1,preventDefault(){},stopPropagation(){}});
      grip.handlers.pointermove[0]({clientY:100+13*scale});
      grip.handlers.pointerup[0]({type:'pointerup',clientY:100+(1+78-scrollTop)*scale});
      assert.deepStrictEqual(node._vmmoss.S.state.boxes.map(box=>box.id),[...original.slice(1),original[0]],`scale=${scale}, scroll=${scrollTop}`);
    }
  });


  console.log('[10] V2.1 canvas view (zoom / pan)');
  check('clampView resets to a centred 100% view at zoom <= 1', () => {
    assert.deepStrictEqual(clampView(1, -40, -30, 480, 600), { zoom: 1, panX: 0, panY: 0 });
    assert.deepStrictEqual(clampView(0.2, 10, 10, 480, 600), { zoom: 1, panX: 0, panY: 0 });
  });
  check('clampView keeps the canvas covered and caps at 600%', () => {
    const edge = clampView(2, 40, 40, 480, 600);            // pan must never be positive
    assert.strictEqual(edge.panX, 0);
    assert.strictEqual(edge.panY, 0);
    const far = clampView(2, -9999, -9999, 480, 600);
    assert.strictEqual(far.panX, -480);
    assert.strictEqual(far.panY, -600);
    assert.strictEqual(clampView(99, -10, -10, 480, 600).zoom, ZOOM_MAX);
  });
  check('zoomAtPoint keeps the point under the cursor fixed', () => {
    const cw = 480, ch = 600, mx = 120, my = 450;
    const before = viewToCanvas({ zoom: 1, panX: 0, panY: 0 }, mx, my, cw, ch);
    const zoomed = zoomAtPoint({ zoom: 1, panX: 0, panY: 0 }, mx, my, 2.5, cw, ch);
    const after = viewToCanvas(zoomed, mx, my, cw, ch);
    assert.ok(Math.abs(after.px - before.px) < 1e-9 && Math.abs(after.py - before.py) < 1e-9,
      `${before.px}->${after.px} / ${before.py}->${after.py}`);
  });
  check('zoomAtPoint saturates and springs back to 100%', () => {
    let view = { zoom: 1, panX: 0, panY: 0 };
    for (let i = 0; i < 40; i += 1) view = zoomAtPoint(view, 100, 100, 1.4, 480, 600);
    assert.strictEqual(view.zoom, ZOOM_MAX);
    const tiny = zoomAtPoint({ zoom: 1.05, panX: -4, panY: -3 }, 10, 10, 0.5, 480, 600);
    assert.deepStrictEqual(tiny, { zoom: 1, panX: 0, panY: 0 });
  });
  check('viewToCanvas inverts the render transform exactly', () => {
    const cw = 512, ch = 640;
    const view = clampView(3, -300, -220, cw, ch);
    for (const [nx, ny] of [[0, 0], [0.5, 0.5], [1, 1], [0.31, 0.77]]) {
      const px = nx * cw, py = ny * ch;
      const back = viewToCanvas(view, px * view.zoom + view.panX, py * view.zoom + view.panY, cw, ch);
      assert.ok(Math.abs(back.px - px) < 1e-9 && Math.abs(back.py - py) < 1e-9, `${nx},${ny}`);
    }
  });

  console.log('[11] V2.1 palette helpers');
  check('16 quick colours are unique, valid and cover the design list', () => {
    assert.strictEqual(QUICK_COLORS.length, 16);
    assert.strictEqual(new Set(QUICK_COLORS).size, 16);
    for (const color of QUICK_COLORS) assert.match(color, /^#[0-9A-F]{6}$/);
    for (const color of ['#FFFFFF', '#111827', '#F59E0B', '#DC2626', '#2563EB',
      '#06B6D4', '#9333EA', '#10B981', '#FEF3C7', '#6B8E78']) {
      assert.ok(QUICK_COLORS.includes(color), color);
    }
  });
  check('every palette theme carries four valid colours and both labels', () => {
    for (const [id, theme] of Object.entries(PALETTE_THEMES)) {
      assert.ok(theme.zh && theme.en, id);
      assert.strictEqual(theme.colors.length, 4, id);
      for (const color of theme.colors) assert.match(color, /^#[0-9A-Fa-f]{6}$/, `${id}: ${color}`);
    }
    assert.ok(THEME_CUSTOM);
  });
  check('normalizeHex handles shorthand, long form and colour words', () => {
    assert.strictEqual(normalizeHex('#abc'), '#AABBCC');
    assert.strictEqual(normalizeHex('0f172a'), '#0F172A');
    assert.strictEqual(normalizeHex(' ivory '), '#FFFFF0');
    assert.strictEqual(normalizeHex('Warm Gold'), null);
    assert.strictEqual(normalizeHex(''), null);
  });
  check('pushPaletteColor dedupes, caps at four and keeps unknown words', () => {
    let list = [];
    for (const color of ['#F59E0B', '#f59e0b', '#DC2626', '#2563EB', '#06B6D4', '#9333EA']) {
      list = pushPaletteColor(list, color, 4);
    }
    assert.deepStrictEqual(list, ['#F59E0B', '#DC2626', '#2563EB', '#06B6D4']);
    assert.deepStrictEqual(pushPaletteColor(['#FFFFFF'], 'warm gold', 4), ['#FFFFFF', 'warm gold']);
  });
  check('toggle-all helpers flip every box and report the next state', () => {
    const list = [{ id: 'a', visible: true }, { id: 'b', visible: false }];
    assert.strictEqual(nextAllVisible(list), false);
    assert.deepStrictEqual(setAllVisible(list, false).map((box) => box.visible), [false, false]);
    assert.strictEqual(nextAllVisible(setAllVisible(list, false)), true);
    assert.deepStrictEqual(setAllVisible(setAllVisible(list, false), true).map((box) => box.visible), [true, true]);
    assert.strictEqual(nextAllVisible([]), true);
  });
  check('draft export writes summary.palette and item.palette', () => {
    const state = normalizeState({
      version: 2, base_width: 1024, base_height: 1024,
      palette: ['#0F172A', '#38BDF8'],
      boxes: [{ id: 'x', label: 'text', visible: true, cx: 0.5, cy: 0.2, w: 0.8, h: 0.1,
        orig_aspect: 8, text: 'hi', caption: 'title', palette: ['#F59E0B'] }],
    }, 1024, 1024);
    const draft = buildDraftJson(state, 1024, 1024,
      { caption: 'c', layerOrder: LAYER_AUTO, lang: 'en', palette: state.palette });
    assert.deepStrictEqual(draft.summary.palette, ['#0F172A', '#38BDF8']);
    assert.deepStrictEqual(draft.items[0].palette, ['#F59E0B']);
  });
  check('i18n covers every t("…") key the UI uses', () => {
    const used = new Set([...source.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)].map((m) => m[1]));
    assert.ok(used.size > 60, `only ${used.size} keys found`);
    for (const key of used) {
      assert.ok(key in I18N.zh, `missing zh.${key}`);
      assert.ok(key in I18N.en, `missing en.${key}`);
    }
  });


  console.log('[12] V2.1 native picker and Space lifecycle regressions');
  const emit = (element, type, props = {}) => {
    const event = { type, target: element, preventDefault() {}, stopPropagation() {}, ...props };
    for (const handler of element.handlers[type] || []) handler(event);
  };
  const gesture = (picker, values) => {
    for (const value of values) { picker.value = value; emit(picker, 'input'); }
    emit(picker, 'change');
  };
  const paletteEditor = () => {
    const n = createEditor();
    n.root.querySelectorAll('button').find(b => b.textContent === '+ Text').click();
    const box = n._vmmoss.S.state.boxes[0];
    n._vmmoss.openPalettePop(box, n.root.querySelector('.vmmoss-pal-btn'));
    return { n, box, picker: document.body.querySelector('.vmmoss-pop-color') };
  };
  const sweep = ['#110001', '#220002', '#330003', '#440004', '#550005', '#660006', '#770007', '#880008', '#990009'];
  check('global picker commits only final colour of a continuous gesture', () => {
    const n = createEditor();
    const picker = n.root.querySelectorAll('input').find(el => el.type === 'color');
    gesture(picker, sweep);
    assert.deepStrictEqual(n._vmmoss.S.state.palette, ['#990009']);
    gesture(picker, sweep);
    assert.deepStrictEqual(n._vmmoss.S.state.palette, ['#990009']);
  });
  check('global picker uses the last available slot for the final colour', () => {
    const n = createEditor(); const S = n._vmmoss.S;
    S.state.palette = sweep.slice(0, 7).map(s => s.toUpperCase());
    const picker = n.root.querySelectorAll('input').find(el => el.type === 'color');
    gesture(picker, sweep.slice(7));
    assert.deepStrictEqual(S.state.palette, [...sweep.slice(0, 7), '#990009']);
    gesture(picker, ['#AABBCC']); assert.strictEqual(S.state.palette.length, 8);
  });
  check('layer picker commits only final colour and preserves separate selections', () => {
    const { box, picker } = paletteEditor();
    gesture(picker, sweep); assert.deepStrictEqual(box.palette, ['#990009']);
    gesture(picker, ['#112233', '#abcdef']);
    assert.deepStrictEqual(box.palette, ['#990009', '#ABCDEF']);
  });
  check('layer picker respects dedupe and limit without recording intermediate colours', () => {
    const { box, picker } = paletteEditor(); box.palette = ['#FFFFFF', '#111111', '#222222'];
    gesture(picker, sweep); assert.deepStrictEqual(box.palette, ['#FFFFFF', '#111111', '#222222', '#990009']);
    gesture(picker, ['#FFFFFF']); assert.strictEqual(box.palette.length, 4);
  });
  check('Space keyup outside canvas releases pan modifier', () => {
    const n = createEditor(); const S = n._vmmoss.S;
    S.inside = true; emit(window, 'keydown', { key: ' ', target: { tagName: 'BODY' } });
    assert.strictEqual(S.space, true);
    S.inside = false; document.activeElement = null;
    emit(window, 'keyup', { key: ' ', target: { tagName: 'BODY' } });
    assert.strictEqual(S.space, false);
  });
  check('Space keyup in text input clears an already active modifier', () => {
    const n = createEditor(); const S = n._vmmoss.S;
    S.inside = true; emit(window, 'keydown', { key: ' ', target: { tagName: 'BODY' } });
    S.inside = false; emit(window, 'keyup', { key: ' ', target: { tagName: 'INPUT' } });
    assert.strictEqual(S.space, false);
    emit(window, 'keydown', { key: ' ', target: { tagName: 'INPUT' } });
    assert.strictEqual(S.space, false);
  });
  check('window blur clears Space and active pan and releases pointer capture', () => {
    const n = createEditor(); const S = n._vmmoss.S;
    S.space = true; S.inside = true; S.pan = { pointerId: 7 };
    emit(window, 'blur');
    assert.strictEqual(S.space, false); assert.strictEqual(S.pan, null); assert.strictEqual(S.inside, false);
    assert.strictEqual(n.root.querySelector('.vmmoss-canvas').releasedPointer, 7);
  });
  check('removing editor removes Space and blur listeners', () => {
    const n = createEditor();
    assert.strictEqual(window.handlers.blur.length, 1);
    n.onRemoved();
    for (const name of ['keydown', 'keyup', 'blur']) assert.strictEqual(window.handlers[name].length, 0);
  });

  // -------------------------------------------------------------------------
  // V2.2 — eyedropper (native + canvas loupe) and reference palette extraction
  // -------------------------------------------------------------------------
  console.log('[13] V2.2 eyedropper and palette extraction');

  const solidBlock = (pixels, [r, g, b, a = 255], times) => {
    for (let i = 0; i < times; i += 1) pixels.push(r, g, b, a);
  };

  check('hexFromRgb pads, upper-cases and clamps channels', () => {
    assert.strictEqual(hexFromRgb(255, 0, 0), '#FF0000');
    assert.strictEqual(hexFromRgb(0, 12, 255), '#000CFF');
    assert.strictEqual(hexFromRgb(-20, 300, 129.6), '#00FF82');
  });

  check('extractDominantColorsFromPixels returns the four block colours in order', () => {
    const pixels = [];
    for (const color of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]) solidBlock(pixels, color, 600);
    const colors = extractDominantColorsFromPixels(new Uint8ClampedArray(pixels), 4);
    assert.deepStrictEqual(colors, ['#FF0000', '#00FF00', '#0000FF', '#FFFF00']);
    for (const hex of colors) assert.match(hex, /^#[0-9A-F]{6}$/);
  });

  check('extraction ignores transparent pixels and empty input', () => {
    const pixels = [];
    solidBlock(pixels, [10, 20, 30], 400);
    solidBlock(pixels, [99, 99, 99, 0], 4000); // fully transparent → skipped
    assert.deepStrictEqual(extractDominantColorsFromPixels(new Uint8ClampedArray(pixels), 4), ['#0A141E']);
    assert.deepStrictEqual(extractDominantColorsFromPixels(new Uint8ClampedArray([]), 4), []);
    assert.deepStrictEqual(extractDominantColorsFromPixels(undefined, 4), []);
    assert.deepStrictEqual(extractDominantColorsFromPixels(new Uint8ClampedArray([1, 2, 3]), 4), []);
  });

  check('maxColors caps the result and near-duplicates are merged', () => {
    const pixels = [];
    for (const color of [[255, 0, 0], [0, 255, 0], [0, 0, 255]]) solidBlock(pixels, color, 300);
    assert.strictEqual(extractDominantColorsFromPixels(new Uint8ClampedArray(pixels), 2).length, 2);
    const twinned = [];
    solidBlock(twinned, [200, 10, 10], 600);
    solidBlock(twinned, [205, 12, 11], 300); // within 42 RGB distance → one swatch
    const merged = extractDominantColorsFromPixels(new Uint8ClampedArray(twinned), 4);
    assert.strictEqual(merged.length, 1);
    assert.match(merged[0], /^#[0-9A-F]{6}$/);
  });

  const fakeDropper = (impl) => {
    return class {
      open(...args) { return impl(...args); }
    };
  };

  await check('native EyeDropper success normalises the sampled colour', async () => {
    const picked = [];
    const outcome = await pickColorWithEyedropper((hex) => picked.push(hex), {
      eyeDropper: fakeDropper(async () => ({ sRGBHex: '#abc' })),
    });
    assert.strictEqual(outcome, 'picked');
    assert.deepStrictEqual(picked, ['#AABBCC']);
  });

  await check('AbortError is silent and never triggers the fallback', async () => {
    const picked = [];
    let fellBack = false;
    const outcome = await pickColorWithEyedropper((hex) => picked.push(hex), {
      eyeDropper: fakeDropper(async () => {
        const err = new Error('cancelled');
        err.name = 'AbortError';
        throw err;
      }),
      fallback: () => { fellBack = true; },
    });
    assert.strictEqual(outcome, 'cancelled');
    assert.deepStrictEqual(picked, []);
    assert.strictEqual(fellBack, false);
  });

  await check('missing or throwing native API degrades to the canvas fallback', async () => {
    let fellBack = 0;
    assert.strictEqual(await pickColorWithEyedropper(() => {}, {
      eyeDropper: null, fallback: () => { fellBack += 1; },
    }), 'fallback');
    assert.strictEqual(await pickColorWithEyedropper(() => {}, {
      eyeDropper: fakeDropper(async () => { throw new Error('NotAllowedError'); }),
      fallback: () => { fellBack += 1; },
    }), 'fallback');
    assert.strictEqual(await pickColorWithEyedropper(() => {}, { eyeDropper: null }), 'unsupported');
    assert.strictEqual(fellBack, 2);
  });

  check('global palette bar exposes 💧 pick and 🎨 extract buttons', () => {
    const node = createEditor();
    const buttons = node.root.querySelectorAll('button');
    const pick = buttons.find((b) => String(b.textContent).includes('💧'));
    const extract = buttons.find((b) => String(b.textContent).includes('🎨') && String(b.textContent).includes(I18N.en.extractPalette));
    assert.ok(pick, 'missing global pick button');
    assert.strictEqual(pick.className.includes('vmmoss-pick'), true);
    assert.ok(extract, 'missing global extract button');
    assert.strictEqual(extract.style.display, 'none'); // hidden until a reference exists
  });

  check('per-box popover exposes a 💧 eyedropper button', () => {
    const node = createEditor();
    node.root.querySelectorAll('button').find((b) => b.textContent === '+ Text').click();
    const box = node._vmmoss.S.state.boxes[0];
    node._vmmoss.openPalettePop(box, node.root.querySelector('.vmmoss-pal-btn'));
    const pop = document.body.querySelector('.vmmoss-pop');
    const pick = pop.querySelectorAll('button').find((b) => String(b.textContent).includes('💧'));
    assert.ok(pick, 'missing popover eyedropper');
    assert.strictEqual(pick.textContent, `💧 ${I18N.en.pickColorLayer}`);
  });

  check('I enters the canvas eyedropper and Esc leaves it', () => {
    const node = createEditor();
    const S = node._vmmoss.S;
    assert.strictEqual(S.eye, null);
    const event = keyOnCanvas(node, 'i');
    assert.ok(S.eye, 'I did not enter eyedropper mode');
    assert.strictEqual(S.eye.target, 'global');
    assert.strictEqual(event.hostWouldReceive, false);
    assert.strictEqual(node.root.querySelector('canvas').style.cursor, 'copy');
    keyOnCanvas(node, 'Escape');
    assert.strictEqual(S.eye, null);
    assert.strictEqual(node.root.querySelector('canvas').style.cursor, 'crosshair');
  });

  check('I targets the selected box and ignores text fields', () => {
    const node = createEditor();
    node.onExecuted(payload);
    const S = node._vmmoss.S;
    S.sel = S.state.boxes[0].id;
    node._vmmoss.enterEyedropper();
    assert.strictEqual(S.eye.target, S.sel);
    node._vmmoss.exitEyedropper();

    S.inside = true;
    emit(window, 'keydown', { key: 'i', target: { tagName: 'INPUT' } });
    assert.strictEqual(S.eye, null, 'typing in an input must not start the eyedropper');
    emit(window, 'keydown', { key: 'i', target: { tagName: 'BODY' } });
    assert.ok(S.eye, 'window-level I should start the eyedropper over the node');
    emit(window, 'keydown', { key: 'Escape', target: { tagName: 'BODY' } });
    assert.strictEqual(S.eye, null);
  });

  check('picked colours land in the global palette when nothing is selected', () => {
    const node = createEditor();
    const S = node._vmmoss.S;
    S.sel = null;
    assert.strictEqual(node._vmmoss.pickTargetFor(), 'global');
    assert.strictEqual(node._vmmoss.commitPickedColor('#112233'), true);
    assert.deepStrictEqual(S.state.palette, ['#112233']);
    assert.strictEqual(node._vmmoss.commitPickedColor('#112233'), false); // duplicate
    assert.deepStrictEqual(S.state.palette, ['#112233']);
  });

  check('picked colours land in the selected box palette', () => {
    const node = createEditor();
    node.onExecuted(payload);
    const S = node._vmmoss.S;
    S.sel = S.state.boxes[0].id;
    assert.strictEqual(node._vmmoss.pickTargetFor(), S.sel);
    assert.strictEqual(node._vmmoss.commitPickedColor('#ABCDEF'), true);
    assert.deepStrictEqual(S.state.boxes[0].palette, ['#ABCDEF']);
    assert.deepStrictEqual(S.state.palette, ['#112233']); // global untouched
  });

  const withPixelCanvas = (pixels, run) => {
    const original = document.createElement;
    document.createElement = (tag) => {
      if (tag !== 'canvas') return original(tag);
      return {
        width: 0, height: 0,
        getContext: () => ({
          drawImage() {},
          getImageData: () => ({ data: pixels }),
        }),
      };
    };
    try { return run(); } finally { document.createElement = original; }
  };

  check('extract palette reads the reference image into the global palette', () => {
    const node = createEditor();
    const S = node._vmmoss.S;
    S.ref = { image: { naturalWidth: 4, complete: true }, size: [4, 4], aligned: [4, 4] };
    node._vmmoss.renderPaletteBar();
    const pixels = [];
    for (const color of [[12, 34, 56], [200, 30, 30], [30, 160, 90], [240, 220, 120]]) {
      solidBlock(pixels, color, 300);
    }
    const colors = withPixelCanvas(pixels, () => node._vmmoss.extractPaletteFromRef());
    assert.deepStrictEqual(colors, ['#0C2238', '#C81E1E', '#1EA05A', '#F0DC78']);
    assert.deepStrictEqual(S.state.palette, colors);
    assert.strictEqual(node.root.querySelectorAll('button')
      .filter((b) => String(b.textContent).includes(I18N.en.extractPalette))
      .every((b) => b.style.display !== 'none'), true);
  });

  check('extract palette without a reference leaves the palette untouched', () => {
    const node = createEditor();
    const S = node._vmmoss.S;
    S.state.palette = ['#112233'];
    assert.strictEqual(node._vmmoss.extractPaletteFromRef(), null);
    assert.deepStrictEqual(S.state.palette, ['#112233']);
    S.ref = { image: { naturalWidth: 4 }, size: [4, 4], aligned: [4, 4] };
    assert.strictEqual(withPixelCanvas([], () => node._vmmoss.extractPaletteFromRef()), null);
    assert.deepStrictEqual(S.state.palette, ['#112233']);
  });

  check('canvas eyedropper click samples and exits without moving boxes', () => {
    const node = createEditor();
    node.onExecuted(payload);
    const S = node._vmmoss.S;
    const canvasEl = node.root.querySelector('canvas');
    const before = { ...S.state.boxes[0] };
    S.sel = null;
    node._vmmoss.enterEyedropper('global');
    // The harness canvas returns no pixel data, so the pick resolves to a no-op
    // write but must still leave eyedropper mode.
    node._vmmoss.pickAtPointer({ clientX: 10, clientY: 10 });
    assert.strictEqual(S.eye, null);
    assert.deepStrictEqual(S.state.boxes[0], before);
    assert.ok(canvasEl);
  });


  console.log('[14] V2.2 sampling regressions');
  check('extraction removes clipped white and black before ranking four colours', () => {
    const pixels = [];
    solidBlock(pixels, [255, 255, 255], 1000);
    solidBlock(pixels, [0, 0, 0], 900);
    for (const [rgb, count] of [[[200, 30, 30], 800], [[30, 64, 175], 700], [[245, 158, 11], 600], [[30, 160, 90], 500]]) {
      solidBlock(pixels, rgb, count);
    }
    assert.deepStrictEqual(extractDominantColorsFromPixels(pixels), ['#C81E1E', '#1E40AF', '#F59E0B', '#1EA05A']);
  });

  check('noise thresholds retain ordinary light dark and saturated colours', () => {
    const pixels = [];
    for (const rgb of [[248, 250, 252], [10, 20, 30], [255, 0, 0], [0, 0, 255]]) solidBlock(pixels, rgb, 50);
    for (const rgb of [[250, 251, 255], [0, 5, 3], [30, 200, 30, 127]]) solidBlock(pixels, rgb, 500);
    assert.deepStrictEqual(extractDominantColorsFromPixels(pixels), ['#F8FAFC', '#0A141E', '#FF0000', '#0000FF']);
  });

  check('all-noise extraction returns no fabricated palette', () => {
    const pixels = [];
    for (const rgb of [[255, 255, 255], [0, 0, 0], [250, 250, 250], [5, 5, 5]]) solidBlock(pixels, rgb, 50);
    assert.deepStrictEqual(extractDominantColorsFromPixels(pixels), []);
  });

  check('reference sampling inverts zoom and both pan axes independently of DPR', () => {
    const node = createEditor(), S = node._vmmoss.S;
    S.ref = { image: { naturalWidth: 64, complete: true } };
    const original = document.createElement;
    const sampled = [];
    document.createElement = (tag) => {
      if (tag !== 'canvas') return original(tag);
      const off = { width: 0, height: 0 };
      off.getContext = () => ({ canvas: off, drawImage() {}, getImageData(x, y) {
        sampled.push([x, y]); return { data: [200, 30, 30, 255] };
      } });
      return off;
    };
    try { node._vmmoss.enterEyedropper(); } finally { document.createElement = original; }
    for (const [zoom, panX, panY, dpr] of [[1, 0, 0, 1], [2, 0, 0, 1], [6, -120, -180, 2]]) {
      S.view = { zoom, panX, panY }; S.dpr = dpr;
      assert.strictEqual(node._vmmoss.samplePixel(180, 120).hex, '#C81E1E');
      assert.deepStrictEqual(sampled.pop(), [Math.floor((180 - panX) / zoom), Math.floor((120 - panY) / zoom)]);
    }
    node._vmmoss.samplePixel(1e6, 1e6);
    assert.deepStrictEqual(sampled.pop(), [S.canvasW - 1, S.canvasH - 1]);
    node._vmmoss.samplePixel(-1e6, -1e6);
    assert.deepStrictEqual(sampled.pop(), [0, 0]);
  });

  check('canvas sampling removes the loupe before every hover and click', () => {
    const original = Element.prototype.getContext;
    let overlay = false;
    Element.prototype.getContext = function () {
      const base = original.call(this);
      base.clearRect = () => { overlay = false; };
      base.arc = () => { overlay = true; };
      base.getImageData = () => ({ data: overlay ? [4, 4, 5, 255] : [25, 25, 33, 255] });
      return base;
    };
    let node;
    try { node = createEditor(); } finally { Element.prototype.getContext = original; }
    const S = node._vmmoss.S, canvasEl = node.root.querySelector('canvas');
    node._vmmoss.enterEyedropper('global');
    for (let i = 0; i < 6; i++) {
      emit(canvasEl, 'pointermove', { clientX: 200 + i % 2, clientY: 150, pointerId: 1 });
      assert.strictEqual(S.eye.hex, '#191921');
      assert.strictEqual(overlay, true, 'loupe should still be drawn after sampling');
    }
    node._vmmoss.pickAtPointer({ clientX: 200, clientY: 150 });
    assert.deepStrictEqual(S.state.palette, ['#191921']);
    assert.strictEqual(S.eye, null);
  });

  check('rendered canvas sampling uses screen pixels and clamps physical DPR edges', () => {
    const original = Element.prototype.getContext, sampled = [];
    Element.prototype.getContext = function () {
      const base = original.call(this);
      base.getImageData = (x, y) => { sampled.push([x, y]); return { data: [25, 25, 33, 255] }; };
      return base;
    };
    let node;
    try { node = createEditor(); } finally { Element.prototype.getContext = original; }
    const S = node._vmmoss.S, c = node.root.querySelector('canvas');
    S.dpr = 2; c.width = S.canvasW * 2; c.height = S.canvasH * 2;
    S.view = { zoom: 6, panX: -100, panY: -150 };
    node._vmmoss.samplePixel(180.75, 120.25);
    assert.deepStrictEqual(sampled.pop(), [361, 240]);
    node._vmmoss.samplePixel(S.canvasW, S.canvasH);
    assert.deepStrictEqual(sampled.pop(), [c.width - 1, c.height - 1]);
  });

  check('all-noise reference extraction preserves the existing palette', () => {
    const node = createEditor(), S = node._vmmoss.S;
    S.state.palette = ['#123456'];
    S.ref = { image: { naturalWidth: 48 }, size: [48, 48], aligned: [48, 48] };
    const pixels = []; solidBlock(pixels, [255, 255, 255], 48 * 48);
    assert.strictEqual(withPixelCanvas(pixels, () => node._vmmoss.extractPaletteFromRef()), null);
    assert.deepStrictEqual(S.state.palette, ['#123456']);
  });


  console.log('[re-import regressions]');
  check('clear then reimport dimensioned Draft restores every original box', () => {
    const node=createEditor();
    importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    const before=JSON.stringify(node._vmmoss.S.state);
    node.root.querySelectorAll('button').find(b=>b.textContent===I18N.en.clear).click();
    assert.strictEqual(node._vmmoss.S.state.boxes.length,0);
    importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    assert.strictEqual(JSON.stringify(node._vmmoss.S.state),before);
  });
  check('manual width and height then Replace restores source geometry', () => {
    const node=createEditor();
    importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    const before=JSON.stringify(node._vmmoss.S.state);
    for(const [name,value] of [['width',512],['height',2048]]){
      node.getWidget(name).value=value;node.getWidget(name).callback(value);
    }
    importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    assert.strictEqual(JSON.stringify(node._vmmoss.S.state),before);
    assert.deepStrictEqual(node._vmmoss.liveSize(),{w:1536,h:1024});
  });
  check('Replace after zoom and pan exposes the whole newly imported layout', () => {
    const node=createEditor();
    importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    node._vmmoss.S.view={zoom:4,panX:-300,panY:-200};
    node._vmmoss.S.sel=node._vmmoss.S.state.boxes[0].id;
    node._vmmoss.S.hover=node._vmmoss.S.sel;
    node.root.querySelectorAll('button').find(b=>b.textContent===I18N.en.clear).click();
    importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    assert.deepStrictEqual(node._vmmoss.S.view,{zoom:1,panX:0,panY:0});
    assert.strictEqual(node._vmmoss.S.sel,null);
    assert.strictEqual(node._vmmoss.S.hover,null);
  });


  check('Merge retains the view and current selection', () => {
    const node=createEditor();
    importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    const view={zoom:2,panX:-80,panY:-50};
    const id=node._vmmoss.S.state.boxes[0].id;
    node._vmmoss.S.view={...view};node._vmmoss.S.sel=id;
    importViaDialog(node,JSON.stringify(MUG_DRAFT),false);
    assert.deepStrictEqual(node._vmmoss.S.view,view);
    assert.strictEqual(node._vmmoss.S.sel,id);
  });
  check('caption-only and rejected imports retain existing framing', () => {
    const node=createEditor();
    importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    const view={zoom:2,panX:-80,panY:-50};node._vmmoss.S.view={...view};
    importViaDialog(node,'{"caption":"Updated scene"}',true);
    assert.deepStrictEqual(node._vmmoss.S.view,view);
    importViaDialog(node,'{"items":[{"bbox":[]}]}',true);
    assert.deepStrictEqual(node._vmmoss.S.view,view);
    assert.strictEqual(node._vmmoss.S.state.boxes.length,3);
  });


  check('Python generator pasted into Replace or Merge is rejected without changing canvas', () => {
    const scripts=[
      '"""Build a MOSS draft."""\nimport json\nfrom pathlib import Path\nCANVAS_W, CANVAS_H = 1152, 2048\n',
      '```python\ndraft = {"items": []}\n```',
      'from pathlib import Path\nITEMS = []',
    ];
    for(const script of scripts)for(const replace of [true,false]){
      const node=createEditor();importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
      const before=JSON.stringify(node._vmmoss.S.state),caption=node.getWidget('global_prompt').value;
      importViaDialog(node,script,replace);
      assert.strictEqual(JSON.stringify(node._vmmoss.S.state),before);
      assert.strictEqual(node.getWidget('global_prompt').value,caption);
      assert.strictEqual(document.body.querySelector('.vmmoss-status').textContent,I18N.en.importScriptError);
      assert.ok(document.body.querySelector('.vmmoss-modal'));
    }
  });
  check('ordinary caption prose and valid JSON mentioning Python remain importable', () => {
    const node=createEditor();importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    const text='A poster about Python and import json, with a blue background.';
    importViaDialog(node,text,true);
    assert.strictEqual(node.getWidget('global_prompt').value,text);
    assert.strictEqual(node._vmmoss.S.state.boxes.length,3);
    importViaDialog(node,JSON.stringify({...MUG_DRAFT,summary:{...MUG_DRAFT.summary,caption:'import json'}}),true);
    assert.strictEqual(node.getWidget('global_prompt').value,'import json');
  });


  console.log('[megapixels]');
  check('MP sizing preserves portrait/landscape/square ratios within alignment tolerance', () => {
    for (const [w,h] of [[1152,2048],[2048,1152],[1024,1024]]) {
      for (const mp of [0.5,1,2,4,8]) {
        const size=mod.sizeForMegapixels(w,h,mp);
        assert.ok(size); assert.strictEqual(size.w%16,0); assert.strictEqual(size.h%16,0);
        assert.ok(Math.abs(size.w*size.h/1e6-mp)/mp<0.025);
        assert.ok(Math.abs(size.w/size.h-w/h)/(w/h)<0.025);
      }
    }
    assert.deepStrictEqual(mod.sizeForMegapixels(1152,2048,2),{w:1056,h:1888});
  });
  check('invalid MP and extreme aspect targets fail without clamping', () => {
    for(const mp of [NaN,Infinity,0,-1,0.009,33,true,'2',null]) assert.strictEqual(mod.sizeForMegapixels(1024,1024,mp),null);
    for(const args of [[256,4096,0.1],[256,4096,4],[1024,1024,32],[0,1024,2]]) assert.strictEqual(mod.sizeForMegapixels(...args),null);
  });
  const applyMP=(node,value)=>{
    node.root.querySelector('.vmmoss-mp-input').value=String(value);
    node.root.querySelector('.vmmoss-mp-apply').click();
  };
  check('Apply updates both sides once and respects all three box sync modes', () => {
    for(const mode of [SYNC_SMART,SYNC_KEEP,SYNC_STRETCH]) {
      const node=createEditor();importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
      node.getWidget('bbox_ratio_sync').value=mode;
      const before=structuredClone(node._vmmoss.S.state);
      applyMP(node,2);
      const state=node._vmmoss.S.state;
      assert.deepStrictEqual(node._vmmoss.liveSize(),{w:1728,h:1152});
      assert.strictEqual(node.getWidget('canvas_preset').value,PRESET_CUSTOM);
      assert.strictEqual(state.base_width,1728);assert.strictEqual(state.base_height,1152);
      for(const old of before.boxes) {
        const b=state.boxes.find(b=>b.id===old.id);
        const expected=syncBoxAspectRatio(old,1536,1024,1728,1152,mode);
        for(const key of ['cx','cy','w','h'])assert.ok(Math.abs(b[key]-expected[key])<1e-12);
        assert.strictEqual(b.text,old.text);assert.strictEqual(b.caption,old.caption);
      }
      assert.strictEqual(JSON.parse(node.getWidget('layout_data').value).base_width,1728);
    }
  });
  check('invalid Apply keeps layout and previous target; correction clears error', () => {
    const node=createEditor();applyMP(node,1);
    const before=node.getWidget('layout_data').value, size=node._vmmoss.liveSize();
    applyMP(node,32);
    assert.deepStrictEqual(node._vmmoss.liveSize(),size);
    assert.strictEqual(node.getWidget('layout_data').value,before);
    assert.strictEqual(node.properties.vmmoss_target_megapixels,1);
    assert.strictEqual(node.root.querySelector('.vmmoss-mp-error').style.display,'block');
    applyMP(node,2);assert.strictEqual(node.root.querySelector('.vmmoss-mp-error').style.display,'none');
  });
  check('linked dimensions disable Apply and reconnect restores it', () => {
    const node=createEditor(),size=node._vmmoss.liveSize();
    node.inputs=[{name:'width',link:123}];node._vmmoss.updateFoot();
    assert.ok(node.root.querySelector('.vmmoss-mp-input').disabled);
    assert.ok(node.root.querySelector('.vmmoss-mp-apply').disabled);
    applyMP(node,4);assert.deepStrictEqual(node._vmmoss.liveSize(),size);
    node.inputs[0].link=null;node._vmmoss.updateFoot();
    assert.strictEqual(node.root.querySelector('.vmmoss-mp-apply').disabled,false);
  });
  check('saved MP target restores without altering saved dimensions or widget count', () => {
    const node=createEditor();const count=node.widgets.length;applyMP(node,1.5);
    const size=node._vmmoss.liveSize();node.root.querySelector('.vmmoss-mp-input').value='4';
    node.onConfigure();assert.strictEqual(node.root.querySelector('.vmmoss-mp-input').value,'1.5');
    assert.deepStrictEqual(node._vmmoss.liveSize(),size);assert.strictEqual(node.widgets.length,count);
    delete node.properties.vmmoss_target_megapixels;node.onConfigure();
    assert.strictEqual(node.root.querySelector('.vmmoss-mp-input').value,'2');
    assert.deepStrictEqual(node._vmmoss.liveSize(),size);
  });
  check('Replace import remains authoritative after MP sizing', () => {
    const node=createEditor();applyMP(node,4);importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    assert.deepStrictEqual(node._vmmoss.liveSize(),{w:1536,h:1024});
    assert.ok(node.root.querySelector('.vmmoss-mp-actual').textContent.includes('1.573 MP'));
  });
  check('MP controls translate in place while preserving the entered target', () => {
    const node=createEditor();node.root.querySelector('.vmmoss-mp-input').value='3.5';
    assert.strictEqual(node.root.querySelector('.vmmoss-mp-apply').textContent,'Apply');
    node.getWidget('ui_language').value='中文 (ZH)';node.getWidget('ui_language').callback();
    assert.strictEqual(node.root.querySelector('.vmmoss-mp-apply').textContent,'应用');
    assert.strictEqual(node.root.querySelector('.vmmoss-mp-input').value,'3.5');
  });


  console.log('[center layout]');
  check('Center Layout preserves all source pixels and translates the full layout', () => {
    assert.strictEqual(mod.syncModeValue(mod.SYNC_CENTER),mod.SYNC_CENTER);
    const src=parseSkillJson(JSON.stringify(MUG_DRAFT),1536,1024,mod.SYNC_CENTER);
    for(const b of src.boxes) {
      const n=syncBoxAspectRatio(b,1536,1024,2048,1536,mod.SYNC_CENTER);
      assert.ok(Math.abs(n.w*2048-b.w*1536)<1e-9);
      assert.ok(Math.abs(n.h*1536-b.h*1024)<1e-9);
      assert.ok(Math.abs(n.cx*2048-b.cx*1536-256)<1e-9);
      assert.ok(Math.abs(n.cy*1536-b.cy*1024-256)<1e-9);
    }
  });
  check('Center Layout treats only full canvas objects as backgrounds', () => {
    const full={label:'object',cx:.5,cy:.5,w:1,h:1,lock_aspect:true};
    assert.deepStrictEqual(syncBoxAspectRatio(full,1152,2048,1536,2048,mod.SYNC_CENTER),{cx:.5,cy:.5,w:1,h:1});
    for(const label of ['object','character','text']) {
      const b={...full,label,w:.9,h:.9};const n=syncBoxAspectRatio(b,1152,2048,1536,2048,mod.SYNC_CENTER);
      assert.ok(Math.abs(n.w*1536-.9*1152)<1e-9);assert.strictEqual(n.h,.9);
    }
  });
  check('Center Layout fits a smaller canvas with one shared scale and keeps edge boxes inside', () => {
    for(const b of [{label:'text',cx:.9,cy:.9,w:.2,h:.2},{label:'character',cx:.1,cy:.1,w:.2,h:.2}]) {
      const n=syncBoxAspectRatio(b,1024,1024,512,768,mod.SYNC_CENTER);
      assert.ok(Math.abs(n.w*512/n.h/768-1)<1e-9);
      assert.ok(Math.abs(n.cx*512-b.cx*512)<1e-9);
      assert.ok(Math.abs(n.cy*768-b.cy*512-128)<1e-9);
      assert.ok(n.cx-n.w/2>=-1e-12&&n.cy-n.h/2>=-1e-12&&n.cx+n.w/2<=1+1e-12&&n.cy+n.h/2<=1+1e-12);
    }
  });
  check('Center Layout state saves reference placement through chained changes and reload', () => {
    const node=createEditor();importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    const sync=node.getWidget('bbox_ratio_sync');sync.value=mod.SYNC_CENTER;sync.callback(sync.value);
    const before=structuredClone(node._vmmoss.S.state);
    const w=node.getWidget('width');w.value=2048;w.callback(w.value);
    assert.deepStrictEqual(node._vmmoss.S.state.reference_size,[1536,1024]);
    assert.deepStrictEqual(mod.referenceRect(node._vmmoss.S.state,1024,512,mod.SYNC_CENTER),[128,0,768,512]);
    node.onConfigure();assert.deepStrictEqual(node._vmmoss.S.state.reference_size,[1536,1024]);
    w.value=1536;w.callback(w.value);
    // Shrinking uniformly scales the current whole canvas, including its padding.
    assert.deepStrictEqual(node._vmmoss.S.state.reference_size,[1152,768]);
    assert.strictEqual(node._vmmoss.S.state.boxes.length,before.boxes.length);
  });
  check('Replace import resets reference padding; switching modes does not resize boxes', () => {
    const node=createEditor();importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    const sync=node.getWidget('bbox_ratio_sync');sync.value=mod.SYNC_CENTER;sync.callback();
    const w=node.getWidget('width');w.value=2048;w.callback();
    const before=JSON.stringify(node._vmmoss.S.state.boxes);
    sync.value=SYNC_SMART;sync.callback();
    assert.strictEqual(JSON.stringify(node._vmmoss.S.state.boxes),before);
    assert.strictEqual(node._vmmoss.S.state.reference_size,undefined);
    sync.value=mod.SYNC_CENTER;sync.callback();w.value=2304;w.callback();
    importViaDialog(node,JSON.stringify(MUG_DRAFT),true);
    assert.strictEqual(node._vmmoss.S.state.reference_size,undefined);
    assert.deepStrictEqual(node._vmmoss.liveSize(),{w:1536,h:1024});
  });
  check('reference rectangle matches centered placement and invalid metadata is discarded', () => {
    const node=createEditor();const S=node._vmmoss.S;
    node.getWidget('bbox_ratio_sync').value=mod.SYNC_CENTER;
    S.state.reference_size=[512,1024];
    assert.deepStrictEqual(mod.referenceRect(S.state,480,360,mod.SYNC_CENTER),[120,0,240,360]);
    assert.deepStrictEqual(mod.referenceRect(S.state,480,360,SYNC_SMART),[0,0,480,360]);
    for(const bad of [[null,1],[-1,100],[NaN,100],[Infinity,100],[true,100]]) {
      assert.strictEqual(normalizeState({base_width:1024,base_height:1024,boxes:[],reference_size:bad},1024,1024).reference_size,undefined);
    }
  });


  console.log('[16] V2.3 composition guides');
  check('guideRatios returns nothing when both guides are off', () => {
    assert.deepStrictEqual(guideRatios({ thirds: false, golden: false }), []);
    assert.deepStrictEqual(guideRatios(undefined), []);
  });
  check('thirds use 1/3 and 2/3 on both axes', () => {
    const ratios = guideRatios({ thirds: true, golden: false });
    assert.strictEqual(ratios.length, 2);
    for (const entry of ratios) {
      assert.strictEqual(entry.kind, 'thirds');
      assert.ok(Math.abs(entry.ratio - 1 / 3) < 1e-12 || Math.abs(entry.ratio - 2 / 3) < 1e-12);
    }
  });
  check('golden guides use 0.381966 and 0.618034', () => {
    const ratios = guideRatios({ thirds: false, golden: true }).map((entry) => entry.ratio);
    assert.deepStrictEqual(ratios, GUIDE_GOLDEN);
    assert.ok(Math.abs(ratios[0] - 0.382) < 1e-3);
    assert.ok(Math.abs(ratios[1] - 0.618) < 1e-3);
    assert.strictEqual(guideRatios({ thirds: true, golden: true }).length, 4);
  });
  check('snapBoxToGuides pulls a centre onto the nearest guide', () => {
    const guides = { thirds: true, golden: false };
    const snapped = snapBoxToGuides({ cx: 0.336, cy: 0.5, w: 0.2, h: 0.2 }, 900, 900, guides);
    assert.ok(Math.abs(snapped.cx - 1 / 3) < 1e-12, String(snapped.cx));
    assert.strictEqual(snapped.cy, 0.5);
  });
  check('snapBoxToGuides also snaps box edges', () => {
    const guides = { thirds: true, golden: false };
    // left edge 0.4283 - 0.1 = 0.3283 → 4.5px away from 1/3
    const snapped = snapBoxToGuides({ cx: 0.4283, cy: 0.5, w: 0.2, h: 0.2 }, 900, 900, guides);
    assert.ok(Math.abs((snapped.cx - 0.1) - 1 / 3) < 1e-12, String(snapped.cx - 0.1));
  });
  check('snapBoxToGuides ignores far boxes and disabled guides', () => {
    const guides = { thirds: true, golden: true };
    const far = { cx: 0.5, cy: 0.5, w: 0.1, h: 0.1 };
    assert.deepStrictEqual(snapBoxToGuides(far, 900, 900, guides), { cx: 0.5, cy: 0.5 });
    const near = { cx: 0.336, cy: 0.336, w: 0.1, h: 0.1 };
    assert.deepStrictEqual(snapBoxToGuides(near, 900, 900, { thirds: false, golden: false }),
      { cx: near.cx, cy: near.cy });
    const edge = { cx: 0.336 + GUIDE_SNAP_PX / 900 * 1.2, cy: 0.5, w: 0.1, h: 0.1 };
    assert.deepStrictEqual(snapBoxToGuides(edge, 900, 900, guides), { cx: edge.cx, cy: 0.5 });
  });
  check('guide toggles persist on node.properties and update the buttons', () => {
    const node = createEditor();
    const S = node._vmmoss.S;
    assert.deepStrictEqual(S.guides, { thirds: true, golden: false });
    node._vmmoss.toggleGuide('thirds');
    assert.deepStrictEqual(node.properties.vmmoss_guides, { thirds: false, golden: false });
    node._vmmoss.toggleGuide('golden');
    assert.deepStrictEqual(node.properties.vmmoss_guides, { thirds: false, golden: true });
    node._vmmoss.toggleGuide('thirds');
    assert.deepStrictEqual(node.properties.vmmoss_guides, { thirds: true, golden: true });
    assert.ok(node.getWidget('canvas_preset'));
    // layout_data never carries the guide flags
    assert.ok(!node.getWidget('layout_data').value.includes('thirds'));
  });
  check('guides restore from node.properties on configure', () => {
    const node = createEditor();
    node.properties = { vmmoss_guides: { thirds: true, golden: false } };
    node.onConfigure({});
    assert.deepStrictEqual(node._vmmoss.S.guides, { thirds: true, golden: false });
  });
  check('saved disabled guides survive reload while old workflows use the thirds default', () => {
    const node = createEditor();
    node.properties = { vmmoss_guides: { thirds: false, golden: false } };
    node.onConfigure({});
    assert.deepStrictEqual(node._vmmoss.S.guides, { thirds: false, golden: false });
    node.properties = {};
    node.onConfigure({});
    assert.deepStrictEqual(node._vmmoss.S.guides, { thirds: true, golden: false });
  });

  console.log('[17] V2.3 text inspector drawer');
  const makeEditorWithBoxes = () => {
    const node = createEditor();
    const S = node._vmmoss.S;
    S.state = {
      version: 2, base_width: 896, base_height: 1152,
      boxes: [
        { id: 'box_1', label: 'text', visible: true, lock_aspect: true, cx: 0.5, cy: 0.12,
          w: 0.8, h: 0.08, orig_aspect: 10, text: '主标题', caption: '白色粗体', tags: [], palette: [] },
        { id: 'box_2', label: 'character', visible: true, lock_aspect: true, cx: 0.5, cy: 0.55,
          w: 0.5, h: 0.4, orig_aspect: 0.87, text: '', caption: '角色描述', tags: [], palette: [] },
      ],
    };
    node._vmmoss.commit();
    node._vmmoss.rebuildRows();
    node._vmmoss.draw();
    return node;
  };

  check('every row exposes a [⤢] expand button', () => {
    const node = makeEditorWithBoxes();
    const buttons = node.root.querySelectorAll('.vmmoss-expand');
    assert.strictEqual(buttons.length, 2);
    assert.strictEqual(buttons[0].textContent, '⤢');
  });
  check('both inspector fields default to twelve rows, including character captions', () => {
    const node = makeEditorWithBoxes();
    node._vmmoss.openInspector('box_1');
    for (const area of node.root.querySelector('.vmmoss-inspector').querySelectorAll('textarea')) {
      assert.strictEqual(area.rows, 12);
    }
    node._vmmoss.openInspector('box_2');
    assert.strictEqual(node.root.querySelector('.vmmoss-insp-caption').rows, 12);
  });
  check('manual inspector heights follow region switches and reopening without entering layout data', () => {
    const node = makeEditorWithBoxes();
    const before = node.getWidget('layout_data').value;
    node._vmmoss.openInspector('box_1');
    for (const [field, height] of [['text', 260], ['caption', 380]]) {
      const area = node.root.querySelector(`.vmmoss-insp-${field}`);
      area.handlers.pointerdown[0]({ button: 0, clientX: 479, clientY: 359, stopPropagation() {} });
      area.offsetHeight = height;
      for (const fn of window.handlers.pointerup) fn({});
    }
    assert.deepStrictEqual(node.properties.vmmoss_inspector_heights, { text: 260, caption: 380 });
    node._vmmoss.openInspector('box_2');
    assert.strictEqual(node.root.querySelector('.vmmoss-insp-caption').style.height, '380px');
    node._vmmoss.closeInspector();
    node._vmmoss.openInspector('box_1');
    assert.strictEqual(node.root.querySelector('.vmmoss-insp-text').style.height, '260px');
    assert.strictEqual(node.root.querySelector('.vmmoss-insp-caption').style.height, '380px');
    assert.strictEqual(node.getWidget('layout_data').value, before);
  });
  check('saved inspector preferences restore on another node without leaking to a new node', () => {
    const restored = makeEditorWithBoxes();
    restored.properties = { vmmoss_inspector_heights: { text: 280, caption: 420 } };
    restored.onConfigure({});
    restored._vmmoss.openInspector('box_1');
    assert.strictEqual(restored.root.querySelector('.vmmoss-insp-caption').style.height, '420px');
    const fresh = makeEditorWithBoxes();
    fresh._vmmoss.openInspector('box_1');
    assert.strictEqual(fresh.root.querySelector('.vmmoss-insp-caption').rows, 12);
    assert.ok(!fresh.root.querySelector('.vmmoss-insp-caption').style.height);
  });
  check('expanding a text box shows both multi-line fields with its copy', () => {
    const node = makeEditorWithBoxes();
    node._vmmoss.openInspector('box_1');
    const drawer = node.root.querySelector('.vmmoss-inspector');
    assert.ok(drawer.classList.contains('show'));
    assert.strictEqual(node._vmmoss.S.inspector, 'box_1');
    assert.strictEqual(drawer.querySelector('.vmmoss-insp-text').value, '主标题');
    assert.strictEqual(drawer.querySelector('.vmmoss-insp-caption').value, '白色粗体');
  });
  check('drawer edits update layout_data and the compact row', () => {
    const node = makeEditorWithBoxes();
    node._vmmoss.openInspector('box_1');
    const drawer = node.root.querySelector('.vmmoss-inspector');
    const area = drawer.querySelector('.vmmoss-insp-text');
    area.value = '第一行\n第二行';
    area.handlers.input[0]({ target: area });
    const state = JSON.parse(node.getWidget('layout_data').value);
    assert.strictEqual(state.boxes[0].text, '第一行\n第二行');
    const row = node.root.querySelectorAll('.vmmoss-row')
      .find((candidate) => candidate.dataset.id === 'box_1');
    const rowArea = row.querySelectorAll('textarea')[0];
    assert.strictEqual(rowArea.value, '第一行\n第二行');
  });
  check('character boxes hide the exact-text field but keep the caption', () => {
    const node = makeEditorWithBoxes();
    node._vmmoss.openInspector('box_2');
    const drawer = node.root.querySelector('.vmmoss-inspector');
    assert.strictEqual(drawer.querySelector('.vmmoss-insp-text'), null);
    assert.strictEqual(drawer.querySelector('.vmmoss-insp-caption').value, '角色描述');
  });
  check('collapsing the drawer hides it and clears the target', () => {
    const node = makeEditorWithBoxes();
    node._vmmoss.openInspector('box_1');
    node._vmmoss.closeInspector();
    const drawer = node.root.querySelector('.vmmoss-inspector');
    assert.ok(!drawer.classList.contains('show'));
    assert.strictEqual(node._vmmoss.S.inspector, null);
    assert.strictEqual(drawer.children.length, 0);
  });
  check('toggleInspector opens and closes the same box', () => {
    const node = makeEditorWithBoxes();
    node._vmmoss.toggleInspector('box_1');
    assert.strictEqual(node._vmmoss.S.inspector, 'box_1');
    node._vmmoss.toggleInspector('box_1');
    assert.strictEqual(node._vmmoss.S.inspector, null);
  });
  check('removing the expanded box closes the drawer', () => {
    const node = makeEditorWithBoxes();
    node._vmmoss.openInspector('box_1');
    node._vmmoss.S.state.boxes = node._vmmoss.S.state.boxes.filter((box) => box.id !== 'box_1');
    node._vmmoss.S.inspector = null;
    node._vmmoss.rebuildRows();
    assert.ok(!node.root.querySelector('.vmmoss-inspector').classList.contains('show'));
  });

  console.log('[18] V2.3 acceptance regressions');
  check('open drawer writes current box after execution replaces state, in both fields', () => {
    const node = makeEditorWithBoxes();
    node._vmmoss.openInspector('box_1');
    const detached = node._vmmoss.S.state.boxes[0];
    const incoming = JSON.parse(node.getWidget('layout_data').value);
    incoming.boxes[0].text = 'external text';
    incoming.boxes[0].caption = 'external style';
    node.onExecuted({ resolved_size: [[896, 1152]], synced_layout_data: [JSON.stringify(incoming)] });
    for (const [field, value] of [['text', '编辑后第一行\n第二行'], ['caption', '编辑后的样式']]) {
      const area = node.root.querySelector(`.vmmoss-insp-${field}`);
      area.value = value;
      area.handlers.input[0]({ target: area });
      assert.strictEqual(node._vmmoss.S.state.boxes[0][field], value);
      assert.strictEqual(JSON.parse(node.getWidget('layout_data').value).boxes[0][field], value);
      assert.notStrictEqual(detached[field], value);
    }
  });
  check('drawer survives repeated same-id box replacements and ignores removed targets', () => {
    const node = makeEditorWithBoxes();
    node._vmmoss.openInspector('box_1');
    const area = node.root.querySelector('.vmmoss-insp-text');
    for (let i = 0; i < 2; i++) {
      node._vmmoss.S.state.boxes = node._vmmoss.S.state.boxes.map(b => ({ ...b }));
      area.value = `edit ${i}`;
      area.handlers.input[0]({ target: area });
      assert.strictEqual(JSON.parse(node.getWidget('layout_data').value).boxes[0].text, area.value);
    }
    node._vmmoss.S.state.boxes = [];
    node._vmmoss.commit();
    area.value = 'stale event';
    area.handlers.input[0]({ target: area });
    assert.deepStrictEqual(JSON.parse(node.getWidget('layout_data').value).boxes, []);
  });
  check('global caption uses a taller resizable native widget without adding a serialized widget', () => {
    const node = createEditor();
    const caption = node.getWidget('global_prompt');
    assert.strictEqual(caption.inputEl.style.resize, 'vertical');
    assert.strictEqual(caption.inputEl.style.minHeight, '64px');
    assert.strictEqual(caption.inputEl.style.height, '84px');
    assert.strictEqual(caption.options.getMinHeight(), 104);
    assert.strictEqual(caption.options.getMaxHeight(), 104);
    assert.strictEqual(node.widgets.filter(w => w.name === 'global_prompt').length, 1);
  });
  check('global caption height restores from properties without affecting layout JSON', () => {
    const node = createEditor();
    const data = node.getWidget('layout_data').value;
    node.properties = { vmmoss_caption_height: 180 };
    node.onConfigure({});
    assert.strictEqual(node.getWidget('global_prompt').options.getHeight(), 200);
    assert.strictEqual(node.getWidget('global_prompt').inputEl.style.height, '180px');
    assert.strictEqual(node.getWidget('layout_data').value, data);
  });
  check('global caption allocation includes native widget margins without enlarging the textarea', () => {
    const caption = createEditor().getWidget('global_prompt');
    caption.margin = 6;
    assert.strictEqual(caption.options.getMinHeight(), 96);
    assert.strictEqual(caption.options.getMaxHeight(), 96);
    caption.margin = 0;
    assert.strictEqual(caption.options.getHeight(), 84);
    assert.strictEqual(caption.inputEl.style.height, '84px');
  });

  console.log(`\n${passed} checks passed`);
  if (process.exitCode) console.log('Frontend checks FAILED');
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
