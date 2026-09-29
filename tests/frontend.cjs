// Test the actual frontend module with minimal app/DOM doubles, without a browser.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
(async () => {
  const root = path.resolve(__dirname, '..');
  const unified = fs.readFileSync(path.join(root, 'web/unified.js'), 'utf8');
  const { routeUnified } = await import('data:text/javascript;base64,' + Buffer.from(unified).toString('base64'));
  const source = fs.readFileSync(path.join(root, 'web/bridge.js'), 'utf8').replace(/^import .*;\r?\n/gm, '');
  let extensions = [], intervals = 0, listeners = [], styles = 0, queueArgs;
  const graph = { _nodes: [], getNodeById: () => null };
  const prompt = { output: { '1': { class_type: 'Unrelated', inputs: { text: 'keep' } } }, workflow: { keep: true } };
  const app = { graph, registerExtension: e => extensions.push(e),
    graphToPrompt: async () => prompt, ui: {settings: { getSettingValue: () => 'en' }} };
  const api = { queuePrompt: async (...args) => { queueArgs = args; return { prompt_id: 'plain' }; },
    addEventListener: name => listeners.push(name) };
  const context = vm.createContext({ app, api, routeUnified, console,
    document: { createElement: () => ({}), head: { appendChild: () => styles++ },
      documentElement: {lang: 'en'} },
    navigator: { language: 'en' }, setInterval: () => ++intervals,
    localStorage: {getItem: () => null}, Symbol, URLSearchParams });
  const run = () => vm.runInContext('(function(){' + source + '\n})()', context);
  run(); run();
  assert.equal(extensions.length, 1, 'duplicate module registration');
  const extension = extensions[0];
  extension.setup(); const firstPrompt = app.graphToPrompt, firstQueue = api.queuePrompt;
  extension.setup();
  assert.strictEqual(app.graphToPrompt, firstPrompt); assert.strictEqual(api.queuePrompt, firstQueue);
  assert.equal(intervals, 1); assert.equal(styles, 1); assert.deepEqual(listeners.sort(), ['executed','execution_error']);
  const before = JSON.stringify(prompt);
  assert.strictEqual(await app.graphToPrompt(), prompt);
  await api.queuePrompt(0, prompt);
  assert.strictEqual(queueArgs[1], prompt); assert.equal(JSON.stringify(prompt), before);
  class Unrelated {};
  const properties = Object.getOwnPropertyNames(Unrelated.prototype);
  extension.beforeRegisterNodeDef(Unrelated, {name:'Unrelated'});
  assert.deepEqual(Object.getOwnPropertyNames(Unrelated.prototype), properties);
  for (const name of ['VMImageEditBridge','VMImageResizeAlign']) {
    class Node {};
    extension.beforeRegisterNodeDef(Node, {name});
    const created = Node.prototype.onNodeCreated, configured = Node.prototype.onConfigure;
    extension.beforeRegisterNodeDef(Node, {name});
    assert.strictEqual(Node.prototype.onNodeCreated, created);
    assert.strictEqual(Node.prototype.onConfigure, configured);
  }
  console.log(JSON.stringify({passed:true, checks:['single_registration','single_setup',
    'single_timer_and_listeners','unrelated_prompt_unchanged','unrelated_node_untouched','idempotent_node_hooks']}));
})().catch(error => { console.error(error); process.exitCode = 1; });
