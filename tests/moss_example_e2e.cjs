// Run against ComfyUI with VMNodes enabled; no other custom nodes or models needed.
// COMFY_BASE=http://127.0.0.1:8207 MOSS_EXAMPLE_OUT=<directory> node tests/moss_example_e2e.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.COMFY_BASE || 'http://127.0.0.1:8207';
const OUT = process.env.MOSS_EXAMPLE_OUT || path.join(ROOT, 'tests', 'example_out');
const workflow = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflows/moss/MOSS-V2.3-Layout-Studio.json'), 'utf8'));
const results = [];
function check(name, ok) {
  results.push({ name, ok: !!ok });
  assert.ok(ok, name);
  console.log(`[PASS] ${name}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1700, height: 1500 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.LiteGraph?.registered_node_types?.Note && window.LiteGraph?.registered_node_types?.VMMOSSLayoutStudio);
    await page.waitForTimeout(800);
    for (const name of ['关闭对话框', 'Close dialog']) {
      const button = page.getByRole('button', { name, exact: true });
      if (await button.count()) await button.click();
    }
    await page.evaluate(async data => {
      const app = window.comfyAPI.app.app;
      await app.loadGraphData(data);
      window.__example = app.graph._nodes.find(n => n.type === 'VMMOSSLayoutStudio');
      app.canvas.ds.scale = .85; app.canvas.ds.offset = [90, 80];
      app.canvas.setDirty(true, true);
    }, workflow);
    await page.waitForSelector('.vmmoss-canvas');
    await page.waitForTimeout(700);
    check('Workflow imports all six nodes without unknown node types', await page.evaluate(() => {
      const nodes = window.comfyAPI.app.app.graph._nodes;
      return nodes.length === 6 && nodes.every(n => !!LiteGraph.registered_node_types[n.type]);
    }));
    const initial = await page.evaluate(() => {
      const n = window.__example;
      return { state: n._vmmoss.S.state, guides: n._vmmoss.S.guides,
        linked: n.inputs.filter(i => i.link != null).map(i => i.name) };
    });
    check('Five editable boxes restore at 896x1152', initial.state.boxes.length === 5 && initial.state.base_width === 896 && initial.state.base_height === 1152);
    check('Global caption and box text ports are connected', initial.linked.includes('global_prompt_in') && initial.linked.includes('box_texts_in'));
    check('Thirds start enabled and Golden disabled', initial.guides.thirds && !initial.guides.golden);

    const graphPrompt = await page.evaluate(async () => (await window.comfyAPI.app.app.graphToPrompt()).output);
    const types = new Set(Object.values(graphPrompt).map(n => n.class_type));
    check('Executable graph needs only native nodes and VMNodes', [...types].every(t => ['PrimitiveStringMultiline', 'VMMOSSLayoutStudio', 'PreviewImage', 'PreviewAny'].includes(t)));
    const response = await page.request.post(`${BASE}/prompt`, { data: { prompt: graphPrompt, client_id: 'moss-example-api' } });
    const queued = await response.json();
    check('Real API accepts the imported graph', response.ok() && !!queued.prompt_id && !Object.keys(queued.node_errors || {}).length);
    let history;
    for (let i = 0; i < 120; i++) {
      const payload = await (await page.request.get(`${BASE}/history/${queued.prompt_id}`)).json();
      history = payload[queued.prompt_id];
      if (history) break;
      await page.waitForTimeout(500);
    }
    check('Real API execution completes successfully', history?.status?.status_str === 'success');
    const previewId = workflow.nodes.find(n => n.type === 'PreviewAny').id;
    const imageId = workflow.nodes.find(n => n.type === 'PreviewImage').id;
    const compiled = JSON.parse(history.outputs[previewId].text[0]);
    check('Layout output has five items and the linked title', compiled.items.length === 5 && compiled.items.some(i => i.text === 'NIGHT GARDEN'));
    check('Escaped multiline event text compiles to a real newline', compiled.items.some(i => i.text === '27 OCT 2026\n18:00 - 22:00'));
    const globalId = workflow.nodes.find(n => n.title.startsWith('1 ·')).id;
    check('Global caption reaches summary.caption', compiled.summary.caption === graphPrompt[globalId].inputs.value);
    check('PreviewImage produces an actual image', history.outputs[imageId].images?.length === 1);
    fs.writeFileSync(path.join(OUT, 'api_history.json'), JSON.stringify(history, null, 2));

    async function runFromBrowser() {
      await page.evaluate(async () => {
        const app = window.comfyAPI.app.app;
        const preview = app.graph._nodes.find(n => n.type === 'PreviewAny');
        window.__exampleOutput = null;
        if (!preview.__exampleHook) {
          const original = preview.onExecuted;
          preview.onExecuted = function(message) {
            window.__exampleOutput = message.text?.[0];
            return original?.apply(this, arguments);
          };
          preview.__exampleHook = true;
        }
        await app.queuePrompt(0, 1);
      });
      await page.waitForFunction(() => !!window.__exampleOutput, null, { timeout: 60000 });
      return page.evaluate(() => JSON.parse(window.__exampleOutput));
    }
    const browserOutput = await runFromBrowser();
    check('Browser Run renders the same layout JSON as the API', JSON.stringify(browserOutput) === JSON.stringify(compiled));
    await page.locator('.vmmoss-row[data-id="box_3"] .vmmoss-expand').click();
    check('Title row opens the multiline inspector', await page.locator('.vmmoss-insp-text').inputValue() === 'NIGHT GARDEN');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'workflow.png') });
    const golden = page.locator('.vmmoss-btn').filter({ hasText: /黄金线|Golden/ });
    await golden.click();
    check('Golden guide toggle works in the imported workflow', await page.evaluate(() => window.__example._vmmoss.S.guides.golden));
    const withGuide = await runFromBrowser();
    check('Visual guide changes leave the compiled layout unchanged', JSON.stringify(withGuide) === JSON.stringify(compiled));

    await page.evaluate(() => {
      const n = window.comfyAPI.app.app.graph._nodes.find(n => n.title.startsWith('2 ·'));
      n.widgets[0].inputEl.dataset.exampleBoxTexts = 'true';
    });
    const source = page.locator('[data-example-box-texts="true"]');
    await source.fill((await source.inputValue()).replace('NIGHT GARDEN', 'AFTER DARK'));
    const externalEdit = await runFromBrowser();
    check('Editing the external multiline node updates the next real output', externalEdit.items.some(i => i.text === 'AFTER DARK'));
    check('Execution backfills the open inspector', await page.locator('.vmmoss-insp-text').inputValue() === 'AFTER DARK');
    await page.locator('.vmmoss-insp-text').fill('LOCAL TITLE');
    const overridden = await runFromBrowser();
    check('Connected external box text wins on the next run', overridden.items.some(i => i.text === 'AFTER DARK') && !overridden.items.some(i => i.text === 'LOCAL TITLE'));
    await page.evaluate(() => {
      const n = window.__example;
      n.disconnectInput(n.inputs.findIndex(i => i.name === 'box_texts_in'));
    });
    await page.locator('.vmmoss-insp-text').fill('LOCAL TITLE');
    const localEdit = await runFromBrowser();
    check('Disconnecting box_texts_in preserves inspector edits on execution', localEdit.items.some(i => i.text === 'LOCAL TITLE'));
    const saved = await page.evaluate(() => window.comfyAPI.app.app.graph.serialize());
    await page.evaluate(async data => { await window.comfyAPI.app.app.loadGraphData(data); }, saved);
    await page.waitForTimeout(700);
    check('Saved workflow reload retains the manually edited title', await page.evaluate(() => window.comfyAPI.app.app.graph._nodes.find(n => n.type === 'VMMOSSLayoutStudio')._vmmoss.S.state.boxes.some(b => b.text === 'LOCAL TITLE')));
    check('No browser JavaScript exceptions', errors.length === 0);
  } finally {
    fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify({ passed: results.filter(r => r.ok).length, total: results.length, checks: results }, null, 2));
    await browser.close();
  }
  console.log(`${results.length}/${results.length} checks passed`);
})().catch(e => { console.error(e); process.exit(1); });
