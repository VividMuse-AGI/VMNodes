// Optional routing for the explicitly opted-in unified workflow.
// The canvas wiring stays intact for PNG/workflow round trips.
const isLink = value => Array.isArray(value) && value.length === 2;
const same = (value, id, slot) => isLink(value) && String(value[0]) === String(id) && value[1] === slot;

export function routeUnified(prompt, editors, outputIds = new Set()) {
  const candidates = new Set();
  const legacyOnly = new Set();
  const closure = value => {
    const result = new Set();
    const visit = v => { if (!isLink(v)) return; const id=String(v[0]); if(result.has(id)||!prompt[id])return; result.add(id); Object.values(prompt[id].inputs||{}).forEach(visit); };
    visit(value); return result;
  };
  const collect = value => {
    if (!isLink(value)) return;
    const id = String(value[0]);
    if (candidates.has(id) || !prompt[id]) return;
    candidates.add(id);
    Object.values(prompt[id].inputs || {}).forEach(collect);
  };
  const detach = (inputs, key) => { collect(inputs[key]); delete inputs[key]; };
  // A shared transform must not silently acquire another editor's protection.
  const resizeFlags = new Map();
  const managedPlans = new Set(editors.map(e => e.plan));
  for (const e of editors) {
    const plan = prompt[e.plan].inputs;
    const id = isLink(plan.image_context) ? String(plan.image_context[0]) : null;
    if (id && prompt[id]?.class_type === 'VMImageResizeAlign') {
      const old = resizeFlags.get(id);
      if (old !== undefined && old !== e.protect) throw Error('VMN_SHARED_PROTECTION');
      resizeFlags.set(id, e.protect);
      if (!e.protect && prompt[id].inputs.protect_mask && Object.entries(prompt).some(([key, node]) =>
        !managedPlans.has(key) && node.class_type === 'VMEditPlan' && same(node.inputs?.image_context, id, 3))) {
        throw Error('VMN_SHARED_PROTECTION');
      }
    }
  }
  for (const e of editors) {
    const plan = prompt[e.plan].inputs, finish = prompt[e.finish].inputs;
    const backend = plan.backend || 'qwen21';
    if (backend === 'flux2_klein9b') throw Error('VMN_BACKEND_REMOVED');
    if (backend !== 'qwen21') throw Error('VMN_BACKEND_UNKNOWN');
    // Read old metadata solely to remove unused dependencies, never to run Klein.
    const retired = e.backendOutputs?.flux2_klein9b;
    if (retired) {
      const expected = e.backendOutputs?.qwen21;
      if (isLink(finish.generated_pre) && (!isLink(expected) || !same(finish.generated_pre,expected[0],expected[1])))
        throw Error('VMN_LEGACY_BRANCH_USED');
      const selected = closure(finish.generated_pre || expected);
      for (const id of closure([e.plan,0])) selected.add(id);
      for (const id of closure(retired)) if (!selected.has(id)) legacyOnly.add(id);
      collect(retired);
    }
    const preview = finish.run_mode === 'preview';
    const full = plan.selection_mode === 'full_image';
    if (full && e.reference === 'mask') throw Error('VMN_FULL_MASK_GUIDANCE');
    if (plan.selection_mode !== 'auto_target' && !isLink(plan.selection_mode)) {
      detach(plan, 'sam_model'); detach(plan, 'sam_clip');
    }
    const resizeId = isLink(plan.image_context) ? String(plan.image_context[0]) : null;
    const resize = prompt[resizeId];
    if (full) {
      detach(plan, 'edit_mask');
      // A transform shared with a local editor still needs its original mask.
      const consumers = Object.entries(prompt).filter(([id, node]) => id !== e.plan &&
        Object.values(node.inputs || {}).some(v => isLink(v) && String(v[0]) === resizeId));
      const needsMask = consumers.some(([, node]) => node.class_type !== 'VMEditPlan' || node.inputs.selection_mode !== 'full_image');
      if (resize?.class_type === 'VMImageResizeAlign' && !needsMask) detach(resize.inputs, 'edit_mask');
    }
    if (!e.protect) {
      detach(plan, 'protect_mask');
      if (resize?.class_type === 'VMImageResizeAlign') detach(resize.inputs, 'protect_mask');
    } else if (!plan.protect_mask || (resize?.class_type === 'VMImageResizeAlign' && !resize.inputs.protect_mask)) {
      throw Error('VMN_PROTECT_INPUT');
    }
    routeQwen(prompt, e, plan, finish, preview, full, collect, detach);
    if (preview) detach(finish, 'generated_pre');
  }
  // Only disconnected dependencies are candidates. Preserve shared consumers,
  // explicit output nodes and unrelated parts of the user's workflow.
  let changed = true;
  while (changed) {
    changed = false;
    const used = new Set();
    for (const node of Object.values(prompt)) for (const value of Object.values(node.inputs || {})) {
      if (isLink(value)) used.add(String(value[0]));
    }
    for (const id of candidates) {
      if (!prompt[id] || used.has(id) || outputIds.has(id) || ['VMEditFinish', 'VMImageResizeAlign'].includes(prompt[id].class_type)) continue;
      delete prompt[id]; changed = true;
    }
  }
  if ([...legacyOnly].some(id => prompt[id])) throw Error('VMN_LEGACY_BRANCH_USED');
  return prompt;
}

function routeQwen(prompt, e, plan, finish, preview, full, collect, detach) {
    const encoders = Object.values(prompt).filter(n => n.class_type === 'TextEncodeQwenImage21' && same(n.inputs?.['images.image_1'], e.plan, 1));
    if (encoders.length !== 1 && !preview) throw Error('VMN_UNIFIED_ENCODER');
    for (const encoder of encoders) {
      const inputs = encoder.inputs;
      if (preview || e.reference === 'none') {
        detach(inputs, 'images.image_2');
        inputs.prompt = [e.plan, 3];
      } else if (e.reference === 'mask') {
        collect(inputs['images.image_2']);
        inputs['images.image_2'] = [e.plan, 6];
        inputs.prompt = [e.plan, 7];
      } else if (e.reference === 'content') {
        if (!inputs['images.image_2'] || same(inputs['images.image_2'], e.plan, 6)) throw Error('VMN_REFERENCE_INPUT');
        inputs.prompt = [e.plan, 3];
      } else throw Error('VMN_REFERENCE_MODE');
    }
    if (full && !preview) {
      const encoder = encoders[0];
      const encoderId = Object.keys(prompt).find(id => prompt[id] === encoder);
      const decodeId = isLink(finish.generated_pre) ? String(finish.generated_pre[0]) : null;
      const decode = prompt[decodeId];
      const sampleId = isLink(decode?.inputs.samples) ? String(decode.inputs.samples[0]) : null;
      const sample = prompt[sampleId];
      const mask = prompt[String(sample?.inputs.latent_image?.[0])];
      const latent = prompt[String(mask?.inputs.samples?.[0])];
      const vaeEqual = (a,b) => isLink(a) && isLink(b) && same(a,b[0],b[1]);
      const chain = decode?.class_type === 'VAEDecode' && finish.generated_pre[1] === 0 &&
        sample?.class_type === 'KSampler' && decode.inputs.samples[1] === 0 &&
        same(sample.inputs.positive,encoderId,0) && same(sample.inputs.negative,encoderId,1) &&
        mask?.class_type === 'SetLatentNoiseMask' && same(mask.inputs.mask,e.plan,2) &&
        latent?.class_type === 'VAEEncode' && same(latent.inputs.pixels,e.plan,1) &&
        vaeEqual(decode.inputs.vae,encoder.inputs.vae) && vaeEqual(latent.inputs.vae,encoder.inputs.vae);
      const shared = Object.entries(prompt).some(([id,node]) => id !== decodeId &&
        Object.values(node.inputs || {}).some(v => isLink(v) && String(v[0]) === sampleId));
      // Do not silently rewrite a shared or unrelated user sampler.
      if (!chain || shared || encoder.inputs.resolution !== 0) throw Error('VMN_FULL_GENERATION_CHAIN');
      collect(sample.inputs.latent_image);
      sample.inputs.latent_image = [encoderId,2];
    }
}

