// Optional adapter for the user's existing pysssss autocomplete settings/word lists.
export function createPromptAutocomplete(loadProvider) {
  const bindings = new Map();

  function bind(element) {
    if (bindings.has(element)) return;
    const binding = { disposed: false, composing: false, instance: null, listeners: [] };
    bindings.set(element, binding);
    const listen = (type, handler, capture = false) => {
      element.addEventListener(type, handler, capture);
      binding.listeners.push([type, handler, capture]);
    };
    const hide = () => binding.instance?.dropdown?.remove();
    listen("compositionstart", () => { binding.composing = true; hide(); });
    listen("compositionend", () => { binding.composing = false; });
    for (const type of ["keydown", "keypress", "keyup"]) {
      listen(type, (event) => {
        if (binding.composing || event.isComposing || event.keyCode === 229) {
          hide();
          event.stopImmediatePropagation();
        }
      }, true);
    }
    // Keep native text undo and candidate navigation inside the node.
    for (const type of ["keydown", "keypress", "keyup"]) {
      listen(type, (event) => event.stopPropagation());
    }
    listen("focus", async () => {
      if (binding.instance || binding.disposed) return;
      try {
        const Provider = await loadProvider();
        if (!Provider || binding.instance || binding.disposed || !element.isConnected
            || element.ownerDocument.activeElement !== element) return;
        const instance = new Provider(element);
        binding.instance = instance;
        // The provider schedules updates after insertion. Do not reopen a popup
        // for a detached editor, an old region, or an unfinished IME composition.
        const beforeCursor = instance.helper.getBeforeCursor.bind(instance.helper);
        instance.helper.getBeforeCursor = () => binding.disposed || binding.composing
          || !Provider.enabled || !element.isConnected
          || element.ownerDocument.activeElement !== element ? null : beforeCursor();
        // The provider's fallback does not reliably emit input (and older builds
        // reference undefined variables). Always commit fallback inserts to MOSS.
        instance.helper.insertAtCursor = (value, offset = 0, finalOffset = 0) => {
          if (binding.disposed || binding.composing || !element.isConnected) return;
          const start = element.selectionStart + offset;
          element.selectionStart = start;
          let inserted = false;
          try { inserted = element.ownerDocument.execCommand("insertText", false, value); } catch { /* fallback below */ }
          if (!inserted) {
            element.setRangeText(value, start, element.selectionEnd, "end");
            element.dispatchEvent(new Event("input", { bubbles: true }));
          }
          element.selectionStart = element.selectionEnd = start + value.length + finalOffset;
        };
      } catch {
        // An absent/disabled/incompatible optional extension must not break editing.
        hide();
      }
    });
  }

  function clear(container) {
    for (const [element, binding] of bindings) {
      if (container && !container.contains(element)) continue;
      binding.disposed = true;
      binding.instance?.dropdown?.remove();
      for (const args of binding.listeners) element.removeEventListener(...args);
      bindings.delete(element);
    }
  }

  return { bind, clear };
}

// Resolve the installed extension through ComfyUI, including renamed folders and
// reverse-proxy prefixes; do not request a guessed URL when it is absent.
export function createAutocompleteLoader(getExtensions, importModule, baseUrl) {
  let pending;
  return () => pending ||= Promise.resolve().then(getExtensions).then(async (urls) => {
    const entry = urls.find((url) => /\/autocompleter\.js(?:\?|$)/.test(url));
    if (!entry) return null;
    const url = new URL("./common/autocomplete.js", new URL(entry, baseUrl));
    const module = await importModule(url.href);
    return typeof module.TextAreaAutoComplete === "function" ? module.TextAreaAutoComplete : null;
  }).catch(() => null);
}
