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
  const run = () => vm.runInContext('(function(){' + source + '\n globalThis.savingTest = {applyAdvancedVisibility, updateGuidanceStatus, rewritePrompt}; })()', context);
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
  // An older manual graph retains its legacy field but cannot present it as an active save setting.
  const edit = {id:13,type:'VMImageEditBridge',properties:{vm_language:'en',vm_selection:'coarse_region',vm_seam_harmonization:'off'},
    widgets:[{name:'filename_prefix',value:'old/subdir'},{name:'vm_advanced_toggle'},{name:'vm_language'}],
    outputs:Array.from({length:8},()=>({links:null})),vmGuidanceStatus:{},inputs:[]};
  context.savingTest.applyAdvancedVisibility(edit);
  assert.equal(edit.widgets[0].hidden,true); assert.equal(edit.widgets[0].value,'old/subdir');
  context.savingTest.updateGuidanceStatus(edit);
  assert.match(edit.vmGuidanceStatus.textContent,/Final is unconnected/);
  edit.properties.vm_language='zh'; edit.properties.vm_unified=true;
  context.savingTest.updateGuidanceStatus(edit);
  assert.match(edit.vmGuidanceStatus.textContent,/Final 未连接/);
  edit.outputs[5].links=[61]; context.savingTest.updateGuidanceStatus(edit);
  assert.match(edit.vmGuidanceStatus.textContent,/临时预览/);
  edit.properties.vm_unified=false; graph._nodes=[edit];
  for(const mode of ['generate','preview']){
    edit.properties.vm_run=mode;
    const compiled=context.savingTest.rewritePrompt({output:{
      '13':{class_type:'VMImageEditBridge',inputs:{image:['1',0],edit_mask:['1',1],prompt:'Edit',filename_prefix:'old/subdir',run_mode:mode}},
      '135':{class_type:'SaveImage',inputs:{images:['13',5],filename_prefix:'chosen/subdir'}}}});
    assert.equal(JSON.stringify(compiled.output['135'].inputs.images),JSON.stringify(['vm15f_13',0]));
    assert.equal(compiled.output['135'].inputs.filename_prefix,'chosen/subdir');
    assert.equal(compiled.output.vm15f_13.inputs.run_mode,mode);
    assert.equal(compiled.output.vm15f_13.inputs.filename_prefix,'old/subdir');
  }
  console.log(JSON.stringify({passed:true, checks:['single_registration','single_setup',
    'single_timer_and_listeners','unrelated_prompt_unchanged','unrelated_node_untouched','idempotent_node_hooks',
    'legacy_prefix_hidden_preserved','bilingual_saving_notice','external_final_routing_both_modes']}));
})().catch(error => { console.error(error); process.exitCode = 1; });
