const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path');
const BASE=process.env.COMFY_BASE||'http://127.0.0.1:8199';
const OUT=process.env.MOSS_REIMPORT_OUT||path.join(__dirname,'reimport_out');
const FIXTURE=process.env.MOSS_REIMPORT_FIXTURE||path.join(__dirname,'fixtures/meirenyu_layout.json');
const draft=JSON.parse(fs.readFileSync(FIXTURE,'utf8'));
fs.mkdirSync(OUT,{recursive:true});const results=[];
function check(name,ok,detail){results.push({name,ok:!!ok,detail});console.log(`[${ok?'PASS':'FAIL'}] ${name} ${JSON.stringify(detail)}`);}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1500},deviceScaleFactor:1});
  page.on('dialog',d=>d.accept());
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LiteGraph?.registered_node_types?.VMMOSSLayoutStudio,null,{timeout:90000});
  await page.waitForTimeout(1000);
  for(const name of ['关闭对话框','Close dialog']){const b=page.getByRole('button',{name,exact:true});if(await b.count())await b.click();}
  await page.evaluate(()=>{
   const app=window.comfyAPI.app.app;app.graph.clear();const n=window.LiteGraph.createNode('VMMOSSLayoutStudio');n.pos=[40,40];app.graph.add(n);window.__n=n;
   app.canvas.ds.scale=.78;app.canvas.ds.offset=[416,50];app.canvas.setDirty(true,true);
  });await page.waitForTimeout(500);
  const importDraft=async()=>{
   await page.getByRole('button',{name:'📥 导入 JSON',exact:true}).click();
   await page.locator('.vmmoss-modal textarea').fill(JSON.stringify(draft));
   await page.getByRole('button',{name:'覆盖画布',exact:true}).click();
   await page.waitForTimeout(180);
  };
  const verify=async(name,fit=true)=>{
   const actual=await page.evaluate(()=>{
    const S=window.__n._vmmoss.S;
    return {size:window.__n._vmmoss.liveSize(),base:[S.state.base_width,S.state.base_height],view:{...S.view},
     boxes:S.state.boxes.map(b=>({caption:b.caption,text:b.text,bbox:[(b.cx-b.w/2)*S.state.base_width,(b.cy-b.h/2)*S.state.base_height,(b.cx+b.w/2)*S.state.base_width,(b.cy+b.h/2)*S.state.base_height]})),
     visible:S.state.boxes.every(b=>b.visible),modal:!!document.querySelector('.vmmoss-modal'),
     badge:document.querySelector('.vmmoss-zoom').classList.contains('show')};
   });
   const errors=draft.items.map(item=>{
    const b=actual.boxes.find(b=>b.caption===item.caption&&(b.text||'')===(item.text||''));
    return b?Math.max(...b.bbox.map((v,i)=>Math.abs(v-item.bbox[i]))):Infinity;
   });
   const geometry=actual.boxes.length===18&&actual.size.w===1152&&actual.size.h===2048&&actual.base[0]===1152&&actual.base[1]===2048&&errors.every(e=>e<1e-6);
   check(name+' restores 1152x2048 and every source bbox',geometry&&actual.visible&&!actual.modal,{count:actual.boxes.length,size:actual.size,maxError:Math.max(...errors)});
   if(fit)check(name+' displays the complete layout at 100%',actual.view.zoom===1&&actual.view.panX===0&&actual.view.panY===0&&!actual.badge,{view:actual.view,badge:actual.badge});
  };
  const resize=()=>page.evaluate(()=>{
   const n=window.__n;
   for(const [name,value] of [['width',512],['height',1024]]){const w=n.widgets.find(w=>w.name===name);w.value=value;w.callback(value);}
  });
  const zoom=async()=>{
   const c=await page.locator('.vmmoss-canvas').boundingBox();await page.mouse.move(c.x+c.width*.6,c.y+c.height*.6);
   for(let i=0;i<3;i++)await page.mouse.wheel(0,-250);
   await page.waitForTimeout(100);
  };
  await importDraft();await verify('initial Replace');
  await page.getByRole('button',{name:'清空',exact:true}).click();await importDraft();await verify('Clear then Replace');
  await resize();await importDraft();await verify('edited dimensions then Replace');
  await zoom();await page.getByRole('button',{name:'清空',exact:true}).click();await importDraft();await verify('zoomed Clear then Replace');
  await zoom();await resize();await importDraft();await verify('zoomed resized canvas then Replace');
  const beforeScript=await page.evaluate(()=>window.__n.widgets.find(w=>w.name==='layout_data').value);
  await page.getByRole('button',{name:'📥 导入 JSON',exact:true}).click();
  await page.locator('.vmmoss-modal textarea').fill('"""Build a MOSS-Image Layout draft."""\nimport json\nfrom pathlib import Path\nCANVAS_W, CANVAS_H = 1152, 2048\nITEMS = []\n');
  await page.getByRole('button',{name:'覆盖画布',exact:true}).click();
  const scriptResult=await page.evaluate(()=>({state:window.__n.widgets.find(w=>w.name==='layout_data').value,status:document.querySelector('.vmmoss-status')?.textContent,modal:!!document.querySelector('.vmmoss-modal')}));
  check('Python generator is rejected with explicit message and unchanged layout',scriptResult.state===beforeScript&&scriptResult.modal&&scriptResult.status.includes('Python')&&scriptResult.status.includes('layout.json'),{status:scriptResult.status,modal:scriptResult.modal});
  if(!scriptResult.modal)await page.getByRole('button',{name:'📥 导入 JSON',exact:true}).click();
  await page.locator('.vmmoss-modal textarea').fill(JSON.stringify(draft));
  await page.getByRole('button',{name:'覆盖画布',exact:true}).click();
  await verify('corrected JSON after rejected Python');
  await page.locator('.vmmoss').screenshot({path:path.join(OUT,'user_layout.png')});
 }finally{fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(results,null,2));await browser.close();}
 const passed=results.filter(r=>r.ok).length;console.log(`Total ${passed}/${results.length}`);if(passed!==results.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=2;});
