const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path');
const BASE=process.env.COMFY_BASE||'http://127.0.0.1:8205';
const OUT=process.env.MOSS_CENTER_OUT||path.join(__dirname,'center_sync_out');
const draft=JSON.parse(fs.readFileSync(process.env.MOSS_CENTER_FIXTURE||path.join(__dirname,'fixtures/meirenyu_layout.json'),'utf8'));
const MODE='Center Layout (居中扩展，缩小时整体适配)';
fs.mkdirSync(OUT,{recursive:true});const results=[];
function check(name,ok,detail){results.push({name,ok:!!ok,detail});console.log(`[${ok?'PASS':'FAIL'}] ${name} ${JSON.stringify(detail||'')}`);}
async function queue(page){
 const response=page.waitForResponse(r=>/\/(api\/)?prompt$/.test(new URL(r.url()).pathname)&&r.request().method()==='POST');
 await page.evaluate(()=>window.comfyAPI.app.app.queuePrompt(0,1));
 const reply=await response,submitted=await reply.json();if(!reply.ok()||!submitted.prompt_id)throw Error(JSON.stringify(submitted));
 for(let i=0;i<120;i++) {const entry=(await(await page.request.get(`${BASE}/history/${submitted.prompt_id}`)).json())[submitted.prompt_id];if(entry?.status?.completed)return {submitted,entry};if(entry?.status?.status_str==='error')throw Error(JSON.stringify(entry.status));await page.waitForTimeout(500);}
 throw Error('Queue timeout');
}
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
  });await page.waitForTimeout(400);
  const importDraft=async()=>{
   await page.getByRole('button',{name:'📥 导入 JSON',exact:true}).click();
   await page.locator('.vmmoss-modal textarea').fill(JSON.stringify(draft));
   await page.getByRole('button',{name:'覆盖画布',exact:true}).click();await page.waitForTimeout(150);
  };
  await importDraft();
  check('new mode is registered in real backend schema',await page.evaluate(mode=>window.__n.widgets.find(w=>w.name==='bbox_ratio_sync').options.values.includes(mode),MODE));
  await page.evaluate(mode=>{const w=window.__n.widgets.find(w=>w.name==='bbox_ratio_sync');w.value=mode;w.callback(mode);},MODE);
  const ids=await page.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=1152;canvas.height=2048;const ctx=canvas.getContext('2d');ctx.fillStyle='#C81E1E';ctx.fillRect(0,0,576,2048);ctx.fillStyle='#1E40AF';ctx.fillRect(576,0,576,2048);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const data=new FormData();data.append('image',blob,'center_sync_reference.png');data.append('overwrite','true');
   const response=await fetch('/upload/image',{method:'POST',body:data});if(!response.ok)throw Error('Upload failed');const file=await response.json();
   const app=window.comfyAPI.app.app,n=window.__n;
   const src=window.LiteGraph.createNode('LoadImage');app.graph.add(src);src.pos=[1100,40];src.widgets.find(w=>w.name==='image').value=file.name;src.connect(0,n,n.inputs.findIndex(i=>i.name==='ref_image'));
   const preview=window.LiteGraph.createNode('PreviewImage');app.graph.add(preview);preview.pos=[1100,450];n.connect(2,preview,0);
   const text=window.LiteGraph.createNode('ShowText|pysssss');app.graph.add(text);text.pos=[1100,850];n.connect(1,text,0);
   return {node:n.id,preview:preview.id,text:text.id};
  });
  await queue(page);await page.waitForFunction(()=>window.__n._vmmoss.S.ref?.image?.complete);
  await page.evaluate(()=>{const w=window.__n.widgets.find(w=>w.name==='width');w.value=1536;w.callback(1536);});await page.waitForTimeout(200);
  const state=await page.evaluate(()=>window.__n._vmmoss.S.state);
  const errors=draft.items.map(item=>{const b=state.boxes.find(b=>b.caption===item.caption&&(b.text||'')===(item.text||''));const actual=[(b.cx-b.w/2)*1536,(b.cy-b.h/2)*2048,(b.cx+b.w/2)*1536,(b.cy+b.h/2)*2048];return Math.max(...actual.map((v,i)=>Math.abs(v-item.bbox[i]-(i%2===0?192:0))));});
  check('all 18 source boxes move exactly 192px right without changing size',state.boxes.length===18&&errors.every(e=>e<1e-6),{maxError:Math.max(...errors)});
  const person=state.boxes.find(b=>b.label==='character'),title=state.boxes.find(b=>b.text==='美人余');const overlap=(title.cy+title.h/2-person.cy+person.h/2)*2048;
  check('person/title overlap stays at original 14px instead of growing to 110px',Math.abs(overlap-14)<1e-6,{overlap});
  check('reference placement retains original 1152x2048 footprint',JSON.stringify(state.reference_size)==='[1152,2048]',state.reference_size);
  const hover=async(x,y)=>{
   await page.locator('.vmmoss-canvas').focus();await page.keyboard.press('i');
   const r=await page.locator('.vmmoss-canvas').boundingBox();await page.mouse.move(r.x+r.width*x,r.y+r.height*y);await page.waitForTimeout(100);
   const hex=await page.evaluate(()=>window.__n._vmmoss.S.eye?.hex);await page.keyboard.press('Escape');return hex;
  };
  const red=await hover(.2,.5),blue=await hover(.8,.5),margin=await hover(.05,.5);
  const near=(actual,expected)=>!!actual&&[1,3,5].every(i=>Math.abs(parseInt(actual.slice(i,i+2),16)-parseInt(expected.slice(i,i+2),16))<=2);
  check('canvas eyedropper samples centered reference on both sides',near(red,'#C81E1E')&&near(blue,'#1E40AF'),{red,blue,reason:'reference thumbnails use JPEG; allow 2 levels per channel'});
  check('padding eyedropper samples neutral canvas rather than stretched source edge',!!margin&&margin!=='#C81E1E'&&margin!=='#1E40AF',{margin});
  await page.locator('.vmmoss').screenshot({path:path.join(OUT,'centered_reference.png')});
  const workflow=await page.evaluate(()=>window.comfyAPI.app.app.graph.serialize());
  fs.writeFileSync(path.join(OUT,'workflow.json'),JSON.stringify(workflow,null,2));
  await page.evaluate(async data=>{const app=window.comfyAPI.app.app;await app.loadGraphData(data);window.__n=app.graph._nodes.find(n=>n.type==='VMMOSSLayoutStudio');},workflow);await page.waitForTimeout(600);
  const restored=await page.evaluate(()=>window.__n._vmmoss.S.state);
  const same=(a,b)=>{if(a&&b&&typeof a==='object'&&typeof b==='object'){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>same(a[k],b[k]));}return a===b;};
  check('workflow reload preserves every box and reference placement',same(restored,state),{reference_size:restored.reference_size,boxCount:restored.boxes.length});
  fs.writeFileSync(path.join(OUT,'restore.json'),JSON.stringify({before:state,after:restored},null,2));
  const finished=await queue(page);await page.waitForFunction(()=>window.__n._vmmoss.S.ref?.image?.complete);await page.waitForTimeout(200);
  const output=JSON.parse(finished.entry.outputs[ids.text].text[0]);
  check('real API Draft matches all translated boxes',output.width===1536&&output.height===2048&&draft.items.every(source=>{const item=output.items.find(x=>x.caption===source.caption);return item&&item.bbox.every((v,i)=>Math.abs(v-source.bbox[i]-(i%2===0?192:0))<=1);}),{width:output.width,height:output.height,count:output.items.length});
  const img=finished.entry.outputs[ids.preview].images[0];
  const pixels=await page.evaluate(async img=>{const image=new Image();image.src='/view?'+new URLSearchParams(img);await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return {size:[c.width,c.height],left:Array.from(ctx.getImageData(35,500,1,1).data),right:Array.from(ctx.getImageData(c.width-35,500,1,1).data)};},img);
  check('real backend preview has neutral side margins',pixels.size[0]===864&&pixels.size[1]===1152&&pixels.left.slice(0,3).every(v=>v<40)&&pixels.right.slice(0,3).every(v=>v<40),pixels);
  check('reference remains centered after backend onExecuted',JSON.stringify(await page.evaluate(()=>window.__n._vmmoss.S.state.reference_size))==='[1152,2048]'&&await hover(.2,.5)==='#C81E1E');
  await page.evaluate(()=>{const w=window.__n.widgets.find(w=>w.name==='width');w.value=768;w.callback(768);});
  const shrunk=await page.evaluate(()=>window.__n._vmmoss.S.state);
  check('smaller canvas uniformly fits layout and reference without clipping',JSON.stringify(shrunk.reference_size)==='[576,1024]'&&shrunk.boxes.every(b=>b.cx-b.w/2>=-1e-9&&b.cy-b.h/2>=-1e-9&&b.cx+b.w/2<=1+1e-9&&b.cy+b.h/2<=1+1e-9));
  await importDraft();
  check('Replace JSON resets padding and source geometry',await page.evaluate(()=>{const s=window.__n._vmmoss.S.state;return !s.reference_size&&s.base_width===1152&&s.base_height===2048&&s.boxes.length===18;}));
  fs.writeFileSync(path.join(OUT,'queue.json'),JSON.stringify({prompt_id:finished.submitted.prompt_id,output,pixels},null,2));
 }finally{fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(results,null,2));await browser.close();}
 const passed=results.filter(r=>r.ok).length;console.log(`Total ${passed}/${results.length}`);if(passed!==results.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=2;});
