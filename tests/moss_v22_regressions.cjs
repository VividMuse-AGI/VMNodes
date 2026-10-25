// Real Chrome regression + real ComfyUI queue integration. Native OS picker is mocked only in named contract checks.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const BASE = process.env.COMFY_BASE || 'http://127.0.0.1:8199';
const OUT = process.env.MOSS_V22_OUT || path.join(__dirname, 'v22_out');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, detail = {}) {
  results.push({ name, ok: !!ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name} ${JSON.stringify(detail)}`);
}

async function mount(browser, dpr) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1500 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  page.on('pageerror', e => check(`DPR${dpr} uncaught page error`, false, String(e)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.LiteGraph?.registered_node_types?.VMMOSSLayoutStudio, null, { timeout: 90000 });
  await page.waitForTimeout(1000);
  for (const name of ['关闭对话框', 'Close dialog']) {
    const close = page.getByRole('button', { name, exact: true });
    if (await close.count()) await close.click();
  }
  await page.evaluate(() => {
    const app = window.comfyAPI.app.app;
    app.graph.clear();
    const n = window.LiteGraph.createNode('VMMOSSLayoutStudio');
    n.pos = [40, 40]; app.graph.add(n); window.__n = n;
    app.canvas.ds.scale = .78; app.canvas.ds.offset = [416, 110];
    app.canvas.setDirty(true, true);
  });
  await page.waitForTimeout(1000);
  return { context, page };
}

async function setup(page, config) {
  return page.evaluate(async cfg => {
    const n = window.__n, S = n._vmmoss.S;
    n._vmmoss.exitEyedropper(); S.ref = null; S.state.palette = []; S.state.boxes = []; S.sel = null;
    n._vmmoss.resetView();
    if (cfg.ref) {
      const off = document.createElement('canvas'); off.width = 64; off.height = 64;
      const ctx = off.getContext('2d');
      ctx.fillStyle = '#C81E1E'; ctx.fillRect(0, 0, 32, 64);
      ctx.fillStyle = '#1E40AF'; ctx.fillRect(32, 0, 32, 64);
      const image = new Image(); image.src = off.toDataURL(); await image.decode();
      S.ref = { image, size: [64, 64], aligned: [64, 64] };
    }
    if (cfg.selected) {
      S.state.boxes = [{ id: 'pick-box', label: 'object', visible: true, cx: .12, cy: .12,
        w: .1, h: .1, orig_aspect: 1, lock_aspect: false, caption: 'target', text: '', palette: [] }];
      S.sel = 'pick-box';
    }
    S.view = { zoom: cfg.zoom, panX: cfg.panX * S.canvasW, panY: cfg.panY * S.canvasH };
    window.comfyAPI.app.app.canvas.ds.scale = cfg.outer || .78;
    window.comfyAPI.app.app.canvas.setDirty(true, true);
    n._vmmoss.commit(); n._vmmoss.rebuildRows(); n._vmmoss.draw();
  }, config);
}

async function point(page, x, y) {
  const r = await page.locator('.vmmoss-canvas').boundingBox();
  return { x: r.x + r.width * x, y: r.y + r.height * y };
}

async function hoverPick(page, p) {
  await page.mouse.move(p.x, p.y);
  await page.locator('.vmmoss-canvas').focus();
  await page.keyboard.press('i');
  const samples = [];
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(p.x + i % 2, p.y);
    samples.push(await page.evaluate(() => window.__n._vmmoss.S.eye?.hex));
  }
  await page.mouse.click(p.x, p.y);
  return page.evaluate(samples => {
    const S = window.__n._vmmoss.S;
    return { samples, palette: S.state.palette, box: S.state.boxes[0]?.palette || [], eye: S.eye };
  }, samples);
}

async function queue(page) {
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/prompt' && r.request().method() === 'POST'
    || new URL(r.url()).pathname === '/prompt' && r.request().method() === 'POST');
  await page.evaluate(async () => { await window.comfyAPI.app.app.queuePrompt(0, 1); });
  const reply = await response;
  const submitted = await reply.json();
  if (!reply.ok() || !submitted.prompt_id) throw new Error(`Queue rejected: ${JSON.stringify(submitted)}`);
  for (let i = 0; i < 180; i++) {
    const history = await (await page.request.get(`${BASE}/history/${submitted.prompt_id}`)).json();
    const entry = history[submitted.prompt_id];
    if (entry?.status?.completed) return { id: submitted.prompt_id, entry };
    if (entry?.status?.status_str === 'error') throw new Error(JSON.stringify(entry.status));
    await page.waitForTimeout(500);
  }
  throw new Error('Real queue did not complete');
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const dpr of [1, 2]) {
      const { context, page } = await mount(browser, dpr);
      for (const cfg of [
        { zoom: 1, panX: 0, panY: 0, x: .25, y: .4, selected: false, outer: .78 },
        { zoom: 2, panX: 0, panY: 0, x: .75, y: .4, selected: true, outer: .78 },
        { zoom: 6, panX: -1.5, panY: -1.1, x: .75, y: .4, selected: false, outer: .55 },
      ]) {
        await setup(page, { ...cfg, ref: true }); await page.waitForTimeout(120);
        const p = await point(page, cfg.x, cfg.y), out = await hoverPick(page, p);
        const colors = cfg.selected ? out.box : out.palette;
        check(`DPR${dpr} reference ${cfg.zoom * 100}% zoom/pan hover and commit`,
          out.samples.every(c => c === '#C81E1E') && colors.length === 1 && colors[0] === '#C81E1E' && out.eye === null
          && (cfg.selected ? out.palette.length === 0 : out.box.length === 0), { config: cfg, ...out });
      }
      for (const zoom of [1, 2]) {
        await setup(page, { ref: false, zoom, panX: zoom === 1 ? 0 : -.2, panY: 0 });
        await page.waitForTimeout(120);
        const p = await point(page, .43, .42);
        const expected = await page.evaluate(() => {
          const S = window.__n._vmmoss.S, c = document.querySelector('.vmmoss-canvas');
          const rgba = c.getContext('2d').getImageData(Math.floor(S.canvasW * .43 * S.dpr), Math.floor(S.canvasH * .42 * S.dpr), 1, 1).data;
          return '#' + [...rgba].slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
        });
        const out = await hoverPick(page, p);
        check(`DPR${dpr} no-reference ${zoom * 100}% repeated hover avoids self-sampling`,
          out.samples.every(c => c === expected) && out.palette[0] === expected && out.eye === null, { expected, ...out });
      }

      // Explicit per-box fallback and cancellation with actual input events.
      await setup(page, { ref: true, zoom: 1, panX: 0, panY: 0, selected: true });
      await page.evaluate(() => { delete window.EyeDropper; });
      await page.locator('.vmmoss-pal-btn').first().click();
      await page.locator('.vmmoss-pop-pick').click();
      const entered = await page.evaluate(() => window.__n._vmmoss.S.eye?.target);
      await page.keyboard.press('Escape');
      const cancelled = await page.evaluate(() => ({ eye: window.__n._vmmoss.S.eye, palette: window.__n._vmmoss.S.state.boxes[0].palette }));
      check(`DPR${dpr} per-box fallback target and Escape cancellation`, entered === 'pick-box' && !cancelled.eye && cancelled.palette.length === 0, { entered, ...cancelled });
      await page.mouse.move(...Object.values(await point(page, .25, .4)));
      await page.locator('.vmmoss-canvas').focus(); await page.keyboard.press('i');
      const p = await point(page, .25, .4); await page.mouse.click(p.x, p.y, { button: 'right' });
      check(`DPR${dpr} physical right-click cancels without writing`, await page.evaluate(() => !window.__n._vmmoss.S.eye && !window.__n._vmmoss.S.state.boxes[0].palette.length));
      await context.close();
    }

    const { context, page } = await mount(browser, 1);
    // Upload a real input PNG and connect LoadImage -> MOSS -> Preview/ShowText.
    const ids = await page.evaluate(async () => {
      const off = document.createElement('canvas'); off.width = 192; off.height = 192;
      const c = off.getContext('2d');
      ['#FFFFFF', '#000000', '#C81E1E', '#1E40AF', '#F59E0B', '#1EA05A'].forEach((color, i) => {
        c.fillStyle = color; c.fillRect((i % 3) * 64, Math.floor(i / 3) * 96, 64, 96);
      });
      const blob = await new Promise(resolve => off.toBlob(resolve, 'image/png'));
      const data = new FormData(); data.append('image', blob, 'moss_v22_noise_reference.png'); data.append('overwrite', 'true');
      const upload = await fetch('/upload/image', { method: 'POST', body: data });
      if (!upload.ok) throw new Error('Fixture upload failed');
      const file = await upload.json(), app = window.comfyAPI.app.app, n = window.__n;
      const src = window.LiteGraph.createNode('LoadImage'); app.graph.add(src); src.pos = [900, 40];
      src.widgets.find(w => w.name === 'image').value = file.subfolder ? `${file.subfolder}/${file.name}` : file.name;
      src.connect(0, n, n.inputs.findIndex(input => input.name === 'ref_image'));
      const preview = window.LiteGraph.createNode('PreviewImage'); app.graph.add(preview); preview.pos = [900, 400]; n.connect(2, preview, 0);
      const text = window.LiteGraph.createNode('ShowText|pysssss'); app.graph.add(text); text.pos = [900, 700]; n.connect(0, text, 0);
      return { source: String(src.id), studio: String(n.id), preview: String(preview.id), text: String(text.id) };
    });
    const first = await queue(page);
    await page.waitForFunction(() => window.__n._vmmoss.S.ref?.image?.naturalWidth === 192, null, { timeout: 30000 });
    const ref = await page.evaluate(() => {
      const S = window.__n._vmmoss.S;
      return { size: S.ref.size, src: S.ref.image.src.slice(0, 23), buttons: [...document.querySelectorAll('.vmmoss-extract')].map(b => getComputedStyle(b).display !== 'none') };
    });
    check('real queue delivers reference via WebSocket onExecuted and exposes both extract buttons',
      first.entry.outputs[ids.studio]?.ref_info?.[0]?.size?.[0] === 192 && ref.size[0] === 192 && ref.buttons.length === 2 && ref.buttons.every(Boolean), { prompt_id: first.id, ...ref });
    await page.locator('.vmmoss-ref .vmmoss-extract').click();
    const colors = await page.evaluate(() => window.__n._vmmoss.S.state.palette.slice());
    const anchors = [[200, 30, 30], [30, 64, 175], [245, 158, 11], [30, 160, 90]];
    const near = (hex, rgb) => rgb.every((v, i) => Math.abs(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) - v) <= 14);
    check('real JPEG reference extraction removes extreme noise and retains four distinct chromatic anchors',
      colors.length === 4 && anchors.every(rgb => colors.some(hex => near(hex, rgb))), { colors });
    await page.locator('.vmmoss-pal .vmmoss-extract').click();
    check('global extract entry matches reference-bar result', await page.evaluate(colors => JSON.stringify(window.__n._vmmoss.S.state.palette) === JSON.stringify(colors), colors));

    // Sample the live reference, then persist through real execution and workflow reload.
    await page.evaluate(() => {
      const n = window.__n, S = n._vmmoss.S;
      S.view = { zoom: 2, panX: -S.canvasW, panY: 0 };
      S.state.boxes = [{ id: 'live', label: 'object', visible: true, cx: .12, cy: .12, w: .1, h: .1,
        orig_aspect: 1, lock_aspect: false, caption: 'live picked', text: '', palette: [] }];
      S.sel = 'live'; n._vmmoss.commit(); n._vmmoss.rebuildRows(); n._vmmoss.draw();
    });
    const picked = await hoverPick(page, await point(page, .75, .4));
    check('real reference zoomed picking writes selected box without changing global palette',
      picked.box.length === 1 && near(picked.box[0], anchors[0]) && JSON.stringify(picked.palette) === JSON.stringify(colors), picked);
    const second = await queue(page);
    const outputText = second.entry.outputs[ids.text]?.text?.[0];
    const compiled = JSON.parse(outputText);
    check('real API output preserves extracted summary.palette', JSON.stringify(compiled.summary.palette) === JSON.stringify(colors), { prompt_id: second.id, palette: compiled.summary.palette });
    check('real API output preserves picked item.palette', JSON.stringify(compiled.items[0].palette) === JSON.stringify(picked.box), { palette: compiled.items[0].palette });
    check('real API generates backend preview after extraction and picking', !!second.entry.outputs[ids.preview]?.images?.length);
    const workflow = await page.evaluate(() => window.comfyAPI.app.app.graph.serialize());
    fs.writeFileSync(path.join(OUT, 'real_queue_workflow.json'), JSON.stringify(workflow, null, 2));
    await page.evaluate(async workflow => {
      const app = window.comfyAPI.app.app; await app.loadGraphData(workflow);
      window.__n = app.graph._nodes.find(n => n.type === 'VMMOSSLayoutStudio');
    }, workflow);
    await page.waitForTimeout(500);
    const reloaded = await page.evaluate(() => ({ palette: window.__n._vmmoss.S.state.palette, box: window.__n._vmmoss.S.state.boxes[0].palette }));
    check('workflow reload retains extracted and picked palettes', JSON.stringify(reloaded.palette) === JSON.stringify(colors) && JSON.stringify(reloaded.box) === JSON.stringify(picked.box), reloaded);
    fs.writeFileSync(path.join(OUT, 'real_queue_evidence.json'), JSON.stringify({ first_prompt_id: first.id, second_prompt_id: second.id, ids, ref, colors, picked, compiled, preview: second.entry.outputs[ids.preview], reloaded }, null, 2));
    await context.close();
  } finally {
    fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(results, null, 2));
    await browser.close();
  }
  const passed = results.filter(r => r.ok).length;
  console.log(`Total: ${passed}/${results.length}`);
  if (passed !== results.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 2; });
