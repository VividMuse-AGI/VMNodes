const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../web/moss_autocomplete.js'), 'utf8');
  const { createPromptAutocomplete, createAutocompleteLoader } = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  let passed = 0;
  const check = async (name, run) => { await run(); passed++; console.log(`[PASS] ${name}`); };
  class Field {
    constructor() {
      this.listeners = new Map(); this.isConnected = true; this.value = 'long';
      this.selectionStart = this.selectionEnd = 4;
      this.ownerDocument = { activeElement: this, execCommand: () => false };
    }
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(x => x !== fn)); }
    async emit(type, event = {}) { for (const fn of this.listeners.get(type) || []) await fn(event); }
    dispatchEvent(event) { this.emit(event.type, event); }
    setRangeText(value, start, end) { this.value = this.value.slice(0, start) + value + this.value.slice(end); }
  }
  class Provider {
    static enabled = true;
    static instances = [];
    constructor(field) {
      this.helper = { getBeforeCursor: () => field.value };
      this.dropdown = { removed: false, remove() { this.removed = true; } };
      Provider.instances.push(this);
    }
  }
  await check('absent provider makes no import and caches discovery', async () => {
    let calls = 0, imports = 0;
    const load = createAutocompleteLoader(async () => { calls++; return ['/extensions/other.js']; },
      async () => { imports++; }, 'http://localhost/prefix/');
    assert.equal(await load(), null); assert.equal(await load(), null);
    assert.equal(calls, 1); assert.equal(imports, 0);
  });
  await check('renamed extension folder and reverse-proxy prefix resolve the same shared provider', async () => {
    let requested;
    const load = createAutocompleteLoader(async () => ['/prefix/extensions/renamed/js/autocompleter.js?v=1'],
      async url => { requested = url; return { TextAreaAutoComplete: Provider }; }, 'http://localhost/prefix/');
    assert.equal(await load(), Provider);
    assert.equal(requested, 'http://localhost/prefix/extensions/renamed/js/common/autocomplete.js');
  });
  await check('discovery errors and failed optional imports degrade to plain editing', async () => {
    for (const failDiscovery of [true, false]) {
      const load = createAutocompleteLoader(async () => {
        if (failDiscovery) throw new Error('offline'); return ['/extensions/custom/js/autocompleter.js'];
      }, async () => { throw new Error('disabled extension'); }, 'http://localhost/');
      assert.equal(await load(), null);
    }
    const field = new Field();
    const adapter = createPromptAutocomplete(async () => null); adapter.bind(field);
    await field.emit('focus'); assert.equal(field.value, 'long'); adapter.clear();
  });
  await check('repeat binding/focus attaches one instance and leaves content unchanged', async () => {
    const field = new Field(), adapter = createPromptAutocomplete(async () => Provider);
    const before = Provider.instances.length;
    adapter.bind(field); adapter.bind(field); await field.emit('focus'); await field.emit('focus');
    assert.equal(Provider.instances.length - before, 1); assert.equal(field.value, 'long'); adapter.clear();
  });
  await check('late load cannot attach to a closed editor or an unfocused field', async () => {
    for (const action of ['clear', 'blur', 'detach']) {
      let resolve;
      const pending = new Promise(r => { resolve = r; });
      const adapter = createPromptAutocomplete(() => pending), field = new Field();
      adapter.bind(field); const before = Provider.instances.length, focus = field.emit('focus');
      if (action === 'clear') adapter.clear();
      if (action === 'blur') field.ownerDocument.activeElement = null;
      if (action === 'detach') field.isConnected = false;
      resolve(Provider); await focus; assert.equal(Provider.instances.length, before); adapter.clear();
    }
  });
  await check('fallback insertion replaces only the token and emits input to commit state', async () => {
    const field = new Field(), adapter = createPromptAutocomplete(async () => Provider);
    field.value = 'portrait, long, gold'; field.selectionStart = field.selectionEnd = 14;
    let committed; field.addEventListener('input', () => { committed = field.value; });
    adapter.bind(field); await field.emit('focus');
    Provider.instances.at(-1).helper.insertAtCursor('long_hair', -4);
    assert.equal(field.value, 'portrait, long_hair, gold'); assert.equal(committed, field.value);
    assert.equal(field.selectionStart, 19); adapter.clear();
  });
  await check('successful native insertion is not duplicated and preserves native undo path', async () => {
    const field = new Field(), adapter = createPromptAutocomplete(async () => Provider);
    let calls = 0;
    field.ownerDocument.execCommand = (command, ui, text) => {
      assert.equal(command, 'insertText'); calls++; field.value = text; return true;
    };
    field.setRangeText = () => assert.fail('native insertion should not use fallback');
    adapter.bind(field); await field.emit('focus'); Provider.instances.at(-1).helper.insertAtCursor('long_hair', -4);
    assert.equal(calls, 1); assert.equal(field.value, 'long_hair'); adapter.clear();
  });
  await check('IME composition suppresses candidates without cancelling native text entry', async () => {
    const field = new Field(), adapter = createPromptAutocomplete(async () => Provider);
    adapter.bind(field); await field.emit('focus'); const instance = Provider.instances.at(-1);
    await field.emit('compositionstart'); let stopped = false;
    await field.emit('keydown', { stopImmediatePropagation() { stopped = true; }, stopPropagation() {},
      preventDefault() { assert.fail('IME must not be cancelled'); } });
    assert.equal(stopped, true); assert.equal(instance.helper.getBeforeCursor(), null);
    instance.helper.insertAtCursor('wrong', -4); assert.equal(field.value, 'long');
    await field.emit('compositionend'); assert.equal(instance.helper.getBeforeCursor(), 'long'); adapter.clear();
  });
  await check('disabled provider, blurred/detached editors cannot reopen delayed suggestions', async () => {
    const field = new Field(), adapter = createPromptAutocomplete(async () => Provider);
    adapter.bind(field); await field.emit('focus'); const instance = Provider.instances.at(-1);
    Provider.enabled = false; assert.equal(instance.helper.getBeforeCursor(), null); Provider.enabled = true;
    field.ownerDocument.activeElement = null; assert.equal(instance.helper.getBeforeCursor(), null);
    field.ownerDocument.activeElement = field; field.isConnected = false;
    assert.equal(instance.helper.getBeforeCursor(), null); adapter.clear();
  });
  await check('region cleanup closes only its dropdown and blocks stale writes', async () => {
    const first = new Field(), second = new Field(), adapter = createPromptAutocomplete(async () => Provider);
    adapter.bind(first); adapter.bind(second); await first.emit('focus'); const one = Provider.instances.at(-1);
    await second.emit('focus'); const two = Provider.instances.at(-1);
    adapter.clear({ contains: element => element === first });
    assert.equal(one.dropdown.removed, true); assert.equal(two.dropdown.removed, false);
    one.helper.insertAtCursor('stale', -4); assert.equal(first.value, 'long');
    assert.equal(one.helper.getBeforeCursor(), null); adapter.clear(); assert.equal(two.dropdown.removed, true);
    assert.ok([...second.listeners.values()].every(list => list.length === 0));
  });
  console.log(`\n${passed} checks passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
