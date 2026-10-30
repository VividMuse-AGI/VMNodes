// Isolated ComfyUI browser + real API regression. No image model required.
// COMFY_BASE=http://127.0.0.1:8210 MOSS_SYNC_OUT=<directory> node tests/moss_external_sync_e2e.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const BASE = process.env.COMFY_BASE || 'http://127.0.0.1:8210';
const OUT = process.env.MOSS_SYNC_OUT || path.join(__dirname, 'external_sync_out');
const results = [];
const source = { width: 1024, height: 1024, bbox_coord_space: 'abs', bbox_format: 'xyxy',
  summary: { caption: 'External layout', canvas: 'single' },
  items: [{ label: 'text', text: 'Original title', caption: 'Title', bbox: [300, 300, 500, 500] }] };
function check(name, ok) { results.push({ name, ok: !!ok }); assert.ok(ok, name); console.log(`[PASS] ${name}`); }
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1600 } });
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.LiteGraph?.registered_node_types?.VMMOSSLayoutStudio, null, { timeout: 90000 });
    await page.waitForTimeout(1200);
    for (const name of ['关闭对话框', 'Close dialog']) {
      const close = page.getByRole('button', { name, exact: true });
      if (await close.count()) await close.click();
    }
    const mode = await page.evaluate(async source => {
      const app = window.comfyAPI.app.app;
      app.graph.clear();
      await new Promise(resolve => setTimeout(resolve, 300));
      const n = LiteGraph.createNode('VMMOSSLayoutStudio'); n.pos = [400, 20]; app.graph.add(n);
      const text = LiteGraph.createNode('PrimitiveStringMultiline'); text.pos = [0, 20]; app.graph.add(text);
      text.widgets.find(w => w.name === 'value').value = JSON.stringify(source);
      text.connect(0, n, n.inputs.findIndex(i => i.name === 'external_layout_json'));
      const preview = LiteGraph.createNode('PreviewAny'); preview.pos = [1400, 20]; app.graph.add(preview);
      n.connect(1, preview, 0);
      app.canvas.ds.scale = .75; app.canvas.ds.offset = [0, 60]; app.canvas.setDirty(true, true);
      return n.widgets.find(w => w.name === 'external_sync_mode').value;
    }, source);
    await page.waitForSelector('.vmmoss-canvas');
    check('New node defaults to On Change with a real text-node connection', mode.startsWith('On Change'));
    async function execute() {
      await page.evaluate(async () => {
        const app = window.comfyAPI.app.app;
        const preview = app.graph._nodes.find(n => n.type === 'PreviewAny');
        window.__syncOutput = null;
        if (!preview.__syncHook) {
          const original = preview.onExecuted;
          preview.onExecuted = function(message) {
            window.__syncOutput = message.text?.[0];
            return original?.apply(this, arguments);
          };
          preview.__syncHook = true;
        }
        await app.queuePrompt(0, 1);
      });
      await page.waitForFunction(() => !!window.__syncOutput, null, { timeout: 60000 });
      return page.evaluate(() => JSON.parse(window.__syncOutput));
    }
    const state = () => page.evaluate(() => window.comfyAPI.app.app.graph._nodes.find(n => n.type === 'VMMOSSLayoutStudio')._vmmoss.S.state);
    const first = await execute();
    check('First real execution imports source and backfills fingerprint', first.items[0].text === 'Original title' && !!(await state()).external_sync_signature);
    await page.waitForTimeout(500);
    const rect = await page.locator('.vmmoss-canvas').boundingBox();
    const original = (await state()).boxes[0];
    const x = rect.x + rect.width * original.cx, y = rect.y + rect.height * original.cy;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x + 70, y + 45, { steps: 10 }); await page.mouse.up();
    const moved = (await state()).boxes[0];
    check('Physical mouse drag changes box coordinates', Math.abs(moved.cx - original.cx) > .03);
    await page.locator('.vmmoss-expand').first().click();
    await page.locator('.vmmoss-insp-text').fill('Edited title');
    const second = await execute();
    check('Rerun preserves dragged coordinates and edited text in output and canvas', second.items[0].text === 'Edited title'
      && Math.abs((await state()).boxes[0].cx - moved.cx) < 1e-9 && second.items[0].bbox[0] > first.items[0].bbox[0]);
    await page.evaluate(source => {
      window.comfyAPI.app.app.graph._nodes.find(n => n.type === 'PrimitiveStringMultiline').widgets.find(w => w.name === 'value').value = '```json\n' + JSON.stringify(source, null, 4) + '\n```';
    }, source);
    check('Formatting-only source changes keep local edits', (await execute()).items[0].text === 'Edited title');
    const saved = await page.evaluate(() => window.comfyAPI.app.app.graph.serialize());
    fs.writeFileSync(path.join(OUT, 'edited_workflow.json'), JSON.stringify(saved, null, 2));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.LiteGraph?.registered_node_types?.VMMOSSLayoutStudio);
    await page.evaluate(async data => window.comfyAPI.app.app.loadGraphData(data), saved);
    await page.waitForSelector('.vmmoss-canvas');
    check('Save, page refresh, reopen and run preserve local edits', (await execute()).items[0].text === 'Edited title');
    source.items[0].text = 'Changed upstream';
    await page.evaluate(source => {
      window.comfyAPI.app.app.graph._nodes.find(n => n.type === 'PrimitiveStringMultiline').widgets.find(w => w.name === 'value').value = JSON.stringify(source);
    }, source);
    const changed = await execute();
    check('Changed upstream JSON replaces the layout and backfills UI', changed.items[0].text === 'Changed upstream'
      && (await state()).boxes[0].text === 'Changed upstream' && changed.items[0].bbox[0] === 300);
    page.once('dialog', d => d.accept());
    await page.locator('.vmmoss-btn').filter({ hasText: /^(清空|Clear)$/ }).click();
    const cleared = await execute();
    check('Clear all then rerun keeps an empty canvas', cleared.items.length === 0 && (await state()).boxes.length === 0);
    await page.evaluate(() => {
      const n = window.comfyAPI.app.app.graph._nodes.find(n => n.type === 'VMMOSSLayoutStudio');
      const w = n.widgets.find(w => w.name === 'external_sync_mode');
      w.value = w.options.values.find(v => v.startsWith('Replace Canvas'));
      w.callback?.(w.value);
    });
    check('Legacy Replace still supports force-reimport of unchanged JSON', (await execute()).items[0].text === 'Changed upstream');
    check('No browser JavaScript exceptions', errors.length === 0);
  } finally {
    fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify({ passed: results.filter(r => r.ok).length, total: results.length, checks: results, errors }, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
