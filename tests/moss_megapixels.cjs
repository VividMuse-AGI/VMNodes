const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path');
const BASE=process.env.COMFY_BASE||'http://127.0.0.1:8205';
const OUT=process.env.MOSS_MP_OUT||path.join(__dirname,'megapixels_out');
const FIXTURE=process.env.MOSS_MP_FIXTURE||path.join(__dirname,'fixtures/meirenyu_layout.json');
const draft=JSON.parse(fs.readFileSync(FIXTURE,'utf8'));
fs.mkdirSync(OUT,{recursive:true});const results=[];
function check(name,ok,detail){results.push({name,ok:!!ok,detail});console.log(`[${ok?'PASS':'FAIL'}] ${name} ${JSON.stringify(detail)}`);}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1500},deviceScaleFactor:1});
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LiteGraph?.registered_node_types?.VMMOSSLayoutStudio,null,{timeout:90000});
  await page.waitForTimeout(1000);
  for(const name of ['关闭对话框','Close dialog']){const b=page.getByRole('button',{name,exact:true});if(await b.count())await b.click();}
  await page.evaluate(()=>{
   const app=window.comfyAPI.app.app;app.graph.clear();const n=window.LiteGraph.createNode('VMMOSSLayoutStudio');n.pos=[40,40];app.graph.add(n);window.__n=n;
   app.canvas.ds.scale=.78;app.canvas.ds.offset=[416,50];app.canvas.setDirty(true,true);
  });await page.waitForTimeout(500);
  const importDraft=async()=>{
   await page.locator('.vmmoss-bar button').filter({hasText:'导入 JSON'}).click();
   await page.locator('.vmmoss-modal textarea').fill(JSON.stringify(draft));
   await page.getByRole('button',{name:'覆盖画布',exact:true}).click();
   await page.waitForTimeout(180);
  };
  const snapshot=()=>page.evaluate(()=>{
   const n=window.__n;return {size:n._vmmoss.liveSize(),state:n._vmmoss.S.state,target:n.properties.vmmoss_target_megapixels,
    preset:n.widgets.find(w=>w.name==='canvas_preset').value,input:document.querySelector('.vmmoss-mp-input').value,
    actual:document.querySelector('.vmmoss-mp-actual').textContent,graph:{scale:window.comfyAPI.app.app.canvas.ds.scale,offset:Array.from(window.comfyAPI.app.app.canvas.ds.offset)}};
  });
  const apply=async(value)=>{await page.locator('.vmmoss-mp-input').fill(String(value));await page.locator('.vmmoss-mp-apply').click();await page.waitForTimeout(180);};
  await importDraft();const before=await snapshot();
  await apply(2);let got=await snapshot();
  check('2 MP real click converts user portrait to aligned 1056x1888',got.size.w===1056&&got.size.h===1888&&got.actual.includes('1.994 MP')&&got.preset.startsWith('Custom'),got.size);
  check('resizing keeps all 18 boxes and text; base and draft dimensions follow',got.state.boxes.length===18&&got.state.base_width===1056&&got.state.base_height===1888&&got.state.boxes.every(b=>before.state.boxes.some(a=>a.id===b.id&&a.caption===b.caption&&a.text===b.text)));
  check('control clicks leave outer ComfyUI zoom and pan unchanged',JSON.stringify(got.graph)===JSON.stringify(before.graph),got.graph);
  const saved=JSON.stringify(got.state);await apply(32);got=await snapshot();
  check('unreachable MP shows inline error without changing layout or saved target',await page.locator('.vmmoss-mp-error').isVisible()&&JSON.stringify(got.state)===saved&&got.target===2);
  await page.locator('.vmmoss-mp-input').fill('1');await page.locator('.vmmoss-mp-input').press('Enter');await page.waitForTimeout(150);got=await snapshot();
  check('Enter applies 1 MP and clears error',!await page.locator('.vmmoss-mp-error').isVisible()&&Math.abs(got.size.w*got.size.h/1e6-1)<.025,got.size);
  await importDraft();got=await snapshot();
  check('JSON Replace restores source dimensions after MP changes',got.size.w===1152&&got.size.h===2048&&got.state.boxes.length===18,got.size);
  await apply(2);
  const workflow=await page.evaluate(()=>window.comfyAPI.app.app.graph.serialize());
  fs.writeFileSync(path.join(OUT,'workflow.json'),JSON.stringify(workflow,null,2));
  await page.evaluate(async w=>{const app=window.comfyAPI.app.app;await app.loadGraphData(w);window.__n=app.graph._nodes.find(n=>n.type==='VMMOSSLayoutStudio');},workflow);
  await page.waitForTimeout(700);got=await snapshot();
  check('workflow reload restores target and generated size',got.target===2&&got.input==='2'&&got.size.w===1056&&got.size.h===1888,got.size);
  await page.evaluate(()=>{const w=window.__n.widgets.find(w=>w.name==='ui_language');w.value='English (EN)';w.callback(w.value);});
  check('English labels apply without resetting target',await page.locator('.vmmoss-pixels').innerText().then(t=>t.includes('Total pixels (MP)')&&t.includes('Apply'))&&(await snapshot()).input==='2');
  await page.evaluate(()=>{const w=window.__n.widgets.find(w=>w.name==='ui_language');w.value='中文 (ZH)';w.callback(w.value);});
  await page.locator('.vmmoss').screenshot({path:path.join(OUT,'controls.png')});
  const {previewId,draftId}=await page.evaluate(()=>{const app=window.comfyAPI.app.app,p=window.LiteGraph.createNode('PreviewImage');app.graph.add(p);p.pos=[1100,40];window.__n.connect(2,p,0);const text=window.LiteGraph.createNode('ShowText|pysssss');app.graph.add(text);text.pos=[1100,500];window.__n.connect(1,text,0);return {previewId:p.id,draftId:text.id};});
  const response=page.waitForResponse(r=>/\/(api\/)?prompt$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST');
  await page.evaluate(()=>window.comfyAPI.app.app.queuePrompt(0,1));
  const reply=await response,submitted=await reply.json();if(!reply.ok()||!submitted.prompt_id)throw Error(JSON.stringify(submitted));
  let entry;
  for(let i=0;i<120;i++) {entry=(await(await page.request.get(`${BASE}/history/${submitted.prompt_id}`)).json())[submitted.prompt_id];if(entry?.status?.completed)break;if(entry?.status?.status_str==='error')throw Error(JSON.stringify(entry.status));await page.waitForTimeout(500);}
  const img=entry?.outputs?.[previewId]?.images?.[0];
  check('real queue executes MP-sized workflow and returns preview',entry?.status?.completed&&!!img,{prompt_id:submitted.prompt_id});
  if(img){
   const dimensions=await page.evaluate(async img=>{const image=new Image();image.src='/view?'+new URLSearchParams(img);await image.decode();return [image.naturalWidth,image.naturalHeight];},img);
   const compiledDraft=JSON.parse(entry.outputs[draftId].text[0]);
   check('backend Draft carries 1056x1888 and all 18 boxes',compiledDraft.width===1056&&compiledDraft.height===1888&&compiledDraft.items.length===18,{width:compiledDraft.width,height:compiledDraft.height,count:compiledDraft.items.length});
   check('backend thumbnail preserves the MP canvas aspect within one pixel',Math.abs(dimensions[0]-dimensions[1]*1056/1888)<1&&Math.max(...dimensions)<=1152,dimensions);
  }
  fs.writeFileSync(path.join(OUT,'queue.json'),JSON.stringify({submitted,entry},null,2));
 }finally{fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(results,null,2));await browser.close();}
 const passed=results.filter(r=>r.ok).length;console.log(`Total ${passed}/${results.length}`);if(passed!==results.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=2;});
