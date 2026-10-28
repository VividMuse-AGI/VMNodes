// Uses the real installed Custom Scripts provider with a local deterministic word list.
// Run against an isolated ComfyUI profile, never the user's active workflow.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.COMFY_BASE || 'http://127.0.0.1:8208';
const OUT = process.env.MOSS_AUTOCOMPLETE_OUT || path.join(ROOT, 'evidence/autocomplete-browser');
const results = [];
const words = 'long_hair\nlong_dress\nsoft_lighting\n';
fs.mkdirSync(OUT, { recursive: true });
let browser;
async function check(name, test) {
  await test(); results.push({ name, ok: true }); console.log(`[PASS] ${name}`);
}
(async () => {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1500 } });
  if (process.env.MOSS_TEST_STAGED === '1') {
    for (const file of ['moss_layout_studio.js', 'moss_autocomplete.js']) {
      await context.route(`**/extensions/VMNodes/${file}*`, r => r.fulfill({
        contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'web', file), 'utf8') }));
    }
  }
  await context.route('**/pysssss/autocomplete', r => r.fulfill({ contentType: 'text/plain', body: words }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE);
  await page.waitForFunction(() => window.LiteGraph?.registered_node_types?.VMMOSSLayoutStudio);
  await page.waitForTimeout(1000);
  for (const name of ['Close dialog', '关闭对话框']) {
    const close = page.getByRole('button', { name, exact: true });
    if (await close.count()) await close.click();
  }
  await page.evaluate(async () => {
    const app = window.comfyAPI.app.app;
    await app.ui.settings.setSettingValue('pysssss.AutoCompleter', true);
    const urls = await window.comfyAPI.api.api.getExtensions();
    const entry = urls.find(url => /\/autocompleter\.js$/.test(url));
    const { TextAreaAutoComplete } = await import(new URL('./common/autocomplete.js', new URL(entry, location.href)).href);
    TextAreaAutoComplete.enabled = true;
    app.graph.clear();
    const n = window.LiteGraph.createNode('VMMOSSLayoutStudio'); n.pos = [40, 0];
    app.graph.add(n); window.__n = n;
    app.canvas.ds.scale = 0.8; app.canvas.ds.offset = [400, -300]; app.canvas.setDirty(true, true);
  });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '+ 文字框', exact: true }).click();
  await page.getByRole('button', { name: '+ 角色框', exact: true }).click();
  await page.locator('.vmmoss-row[data-id="box_1"] .vmmoss-expand').click();
  const caption = () => page.locator('.vmmoss-insp-caption');
  const popup = () => page.locator('.pysssss-autocomplete');
  async function suggest(field = caption(), token = 'long') {
    await field.fill(''); await field.focus(); await page.waitForTimeout(250);
    await field.pressSequentially(token, { delay: 70 });
    await page.waitForFunction(() => !!document.querySelector('.pysssss-autocomplete-item'));
  }
  const state = () => page.evaluate(() => JSON.parse(window.__n.widgets.find(w => w.name === 'layout_data').value));
  await check('expanded caption opens real word-list candidates and Tab commits to layout_data', async () => {
    await suggest(); assert.match(await popup().textContent(), /long_hair/);
    await caption().press('Tab'); await page.waitForTimeout(200);
    assert.match((await state()).boxes[0].caption, /^long[ _]hair/);
  });
  await check('ArrowDown and Enter accept the selected candidate', async () => {
    await suggest(); await caption().press('ArrowDown'); await caption().press('Enter');
    assert.match((await state()).boxes[0].caption, /^long[ _]dress/);
  });
  await check('mouse candidate selection commits to the current region', async () => {
    await suggest(caption(), 'soft'); await page.locator('.pysssss-autocomplete-item').first().click();
    assert.match((await state()).boxes[0].caption, /^soft[ _]lighting/);
  });
  await check('Escape dismisses candidates without changing the typed token', async () => {
    await suggest(); await caption().press('Escape'); await page.waitForTimeout(200);
    assert.equal(await popup().count(), 0); assert.equal(await caption().inputValue(), 'long');
  });
  await check('literal poster text stays literal and Enter remains a newline', async () => {
    const exact = page.locator('.vmmoss-insp-text'); await exact.fill('');
    await exact.pressSequentially('long'); await exact.press('Enter'); await exact.pressSequentially('Title');
    assert.equal(await popup().count(), 0); assert.equal((await state()).boxes[0].text, 'long\nTitle');
  });
  await check('region switch removes old candidates; character caption has independent completion', async () => {
    await suggest(); await page.locator('.vmmoss-row[data-id="box_2"] .vmmoss-tag').click();
    await page.waitForTimeout(250); assert.equal(await popup().count(), 0);
    await suggest(caption(), 'soft'); await caption().press('Tab');
    const s = await state(); assert.equal(s.boxes[0].caption, 'long'); assert.match(s.boxes[1].caption, /^soft[ _]lighting/);
  });
  await check('inline row caption supports the same provider', async () => {
    const row = page.locator('.vmmoss-row[data-id="box_2"] input.vmmoss-inp');
    await suggest(row); await row.press('Tab'); assert.match((await state()).boxes[1].caption, /^long[ _]hair/);
  });
  await check('native autocomplete undo works inside MOSS', async () => {
    await caption().click(); await suggest(); await caption().press('Tab'); await caption().press('Control+z');
    assert.equal(await caption().inputValue(), 'long'); assert.equal((await state()).boxes[1].caption, 'long');
  });
  await check('input fallback commits a candidate when execCommand is unavailable', async () => {
    await suggest(); await page.evaluate(() => { window.__exec = document.execCommand; document.execCommand = () => false; });
    await caption().press('Tab'); assert.match((await state()).boxes[1].caption, /^long[ _]hair/);
    await page.evaluate(() => { document.execCommand = window.__exec; });
  });
  await check('IME Enter does not accept an English candidate', async () => {
    await suggest(); await caption().evaluate(e => {
      e.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      e.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    });
    assert.equal(await caption().inputValue(), 'long'); assert.equal(await popup().count(), 0);
    await caption().evaluate(e => e.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
  });
  await check('existing Text Autocomplete setting disables MOSS candidates too', async () => {
    // Custom Scripts' legacy settings checkbox sets this shared flag directly.
    await page.evaluate(async () => {
      const urls = await window.comfyAPI.api.api.getExtensions();
      const entry = urls.find(url => /\/autocompleter\.js$/.test(url));
      const { TextAreaAutoComplete } = await import(new URL('./common/autocomplete.js', new URL(entry, location.href)).href);
      window.__completionProvider = TextAreaAutoComplete; TextAreaAutoComplete.enabled = false;
    });
    await caption().fill(''); await caption().pressSequentially('long'); await page.waitForTimeout(200);
    assert.equal(await popup().count(), 0);
    await page.evaluate(async () => {
      window.__completionProvider.enabled = true;
      await window.comfyAPI.app.app.ui.settings.setSettingValue('pysssss.AutoCompleter', true);
    });
  });
  await check('resized editor keeps its height across region switches and workflow save/reload', async () => {
    const area = await caption().boundingBox();
    await page.mouse.move(area.x + area.width - 3, area.y + area.height - 3); await page.mouse.down();
    await page.mouse.move(area.x + area.width - 3, area.y + area.height + 65, { steps: 10 }); await page.mouse.up();
    const expected = await caption().evaluate(e => e.offsetHeight); assert.ok(expected > 219);
    await page.evaluate(() => { window.__saved = window.comfyAPI.app.app.graph.serialize(); });
    const saved = await page.evaluate(() => window.__saved);
    fs.writeFileSync(path.join(OUT, 'saved-workflow.json'), JSON.stringify(saved, null, 2));
    await page.reload(); await page.waitForFunction(() => window.LiteGraph?.registered_node_types?.VMMOSSLayoutStudio);
    await page.waitForTimeout(600);
    await page.evaluate(async savedGraph => {
      const app = window.comfyAPI.app.app; await app.loadGraphData(savedGraph);
      window.__n = app.graph._nodes.find(n => n.type === 'VMMOSSLayoutStudio');
      app.canvas.ds.scale = 0.8; app.canvas.ds.offset = [400, -300]; app.canvas.setDirty(true, true);
    }, saved);
    await page.waitForTimeout(300); await page.locator('.vmmoss-row[data-id="box_1"] .vmmoss-expand').click();
    assert.equal(await caption().evaluate(e => e.offsetHeight), expected);
    await page.locator('.vmmoss-row[data-id="box_2"] .vmmoss-tag').click();
    assert.equal(await caption().evaluate(e => e.offsetHeight), expected);
    await suggest(); await caption().press('Tab'); assert.match((await state()).boxes[1].caption, /^long[ _]hair/);
  });
  await suggest();
  await page.screenshot({ path: path.join(OUT, 'candidates.jpg'), type: 'jpeg', quality: 70 });
  await check('deleting the node removes its suggestion popup', async () => {
    await page.evaluate(() => window.comfyAPI.app.app.graph.remove(window.__n));
    await page.waitForTimeout(250); assert.equal(await popup().count(), 0);
  });
  await check('no MOSS autocomplete runtime errors', async () => {
    assert.deepEqual(errors.filter(e => /moss|autocomplete|modifiedText|textarea is not defined/i.test(e)), []);
  });
  await check('missing optional extension leaves MOSS fully editable without candidates', async () => {
    const plainContext = await browser.newContext({ viewport: { width: 1600, height: 1500 } });
    if (process.env.MOSS_TEST_STAGED === '1') {
      for (const file of ['moss_layout_studio.js', 'moss_autocomplete.js']) {
        await plainContext.route(`**/extensions/VMNodes/${file}*`, r => r.fulfill({
          contentType: 'text/javascript', body: fs.readFileSync(path.join(ROOT, 'web', file), 'utf8') }));
      }
    }
    await plainContext.route('**/extensions', async route => {
      const response = await route.fetch();
      const urls = (await response.json()).filter(url => !/\/autocompleter\.js$/.test(url));
      await route.fulfill({ response, json: urls });
    });
    const plain = await plainContext.newPage();
    await plain.goto(BASE);
    await plain.waitForFunction(() => window.LiteGraph?.registered_node_types?.VMMOSSLayoutStudio);
    await plain.waitForTimeout(600);
    await plain.evaluate(() => {
      const app = window.comfyAPI.app.app; app.graph.clear();
      const n = window.LiteGraph.createNode('VMMOSSLayoutStudio'); n.pos = [40, 0]; app.graph.add(n); window.__n = n;
      app.canvas.ds.scale = 0.8; app.canvas.ds.offset = [400, -300]; app.canvas.setDirty(true, true);
    });
    await plain.waitForTimeout(250);
    await plain.getByRole('button', { name: '+ 角色框', exact: true }).click();
    await plain.locator('.vmmoss-expand').click();
    await plain.locator('.vmmoss-insp-caption').pressSequentially('long hair', { delay: 40 });
    assert.equal(await plain.locator('.pysssss-autocomplete').count(), 0);
    assert.equal(await plain.locator('.vmmoss-insp-caption').inputValue(), 'long hair');
    assert.equal(await plain.locator('.vmmoss-insp-caption').evaluate(e => e.offsetHeight), 219);
    const data = await plain.evaluate(() => JSON.parse(window.__n.widgets.find(w => w.name === 'layout_data').value));
    assert.equal(data.boxes[0].caption, 'long hair'); await plainContext.close();
  });
  console.log(`${results.length} checks passed`);
})().catch(error => {
  results.push({ name: 'test exception', ok: false, error: String(error.stack) }); console.error(error); process.exitCode = 1;
}).finally(async () => {
  fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(results, null, 2));
  await browser?.close();
});
