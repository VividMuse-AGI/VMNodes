const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path');
const BASE=process.env.COMFY_BASE||'http://127.0.0.1:8199';
const OUT=process.env.MOSS_SCROLL_OUT||path.join(__dirname,'scroll_out');
fs.mkdirSync(OUT,{recursive:true});
const results=[];
function check(name,ok,detail){results.push({name,ok:!!ok,detail});console.log(`[${ok?'PASS':'FAIL'}] ${name} ${JSON.stringify(detail)}`);}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1600,height:1500},deviceScaleFactor:1});
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LiteGraph?.registered_node_types?.VMMOSSLayoutStudio,null,{timeout:90000});
  await page.waitForTimeout(1000);
  for(const name of ['关闭对话框','Close dialog']){const close=page.getByRole('button',{name,exact:true});if(await close.count())await close.click();}
  await page.evaluate(()=>{
   const app=window.comfyAPI.app.app;app.graph.clear();
   const n=window.LiteGraph.createNode('VMMOSSLayoutStudio');n.pos=[40,40];app.graph.add(n);window.__n=n;
   app.canvas.ds.scale=.78;app.canvas.ds.offset=[416,50];app.canvas.setDirty(true,true);
   n._vmmoss.S.state.boxes=Array.from({length:40},(_,i)=>({id:`layer_${i}`,label:'object',caption:`Layer ${i+1}`,text:'',visible:true,lock_aspect:false,cx:.5,cy:.5,w:.2,h:.2,orig_aspect:1,palette:[]}));
   n._vmmoss.commit();n._vmmoss.rebuildRows();n._vmmoss.draw();n._vmmoss.updateFoot();
  });
  await page.waitForTimeout(400);
  const state=()=>page.evaluate(()=>{
   const r=document.querySelector('.vmmoss-rows'),n=window.__n;
   return {top:r.scrollTop,max:r.scrollHeight-r.clientHeight,count:n._vmmoss.S.state.boxes.length,
    visible:n._vmmoss.S.state.boxes.filter(b=>b.visible).length,view:{...n._vmmoss.S.view},
    outer:{scale:window.comfyAPI.app.app.canvas.ds.scale,offset:[...window.comfyAPI.app.app.canvas.ds.offset]}};
  });
  const visibleId=()=>page.evaluate(()=>{
   const list=document.querySelector('.vmmoss-rows'),bounds=list.getBoundingClientRect();
   const rows=[...list.querySelectorAll('.vmmoss-row')].filter(r=>{const b=r.getBoundingClientRect();return b.top>=bounds.top+2&&b.bottom<=bounds.bottom-2;});
   return rows[Math.floor(rows.length/2)].dataset.id;
  });
  const scrollTo=async ratio=>{
   await page.locator('.vmmoss-rows').evaluate((e,r)=>{e.scrollTop=(e.scrollHeight-e.clientHeight)*r;},ratio);
   await page.waitForTimeout(100);
  };
  const samePosition=(a,b)=>Math.abs(a.top-b.top)<1 && JSON.stringify(a.view)===JSON.stringify(b.view)&&JSON.stringify(a.outer)===JSON.stringify(b.outer);
  for(const ratio of [.5,1]){
   await scrollTo(ratio);const id=await visibleId();
   for(const action of ['hide','show']){
    const before=await state();
    await page.locator(`.vmmoss-row[data-id="${id}"] .vmmoss-ico`).nth(0).click();
    await page.waitForTimeout(120);const after=await state();
    const hidden=await page.evaluate(id=>!window.__n._vmmoss.S.state.boxes.find(b=>b.id===id).visible,id);
    check(`individual ${action} at ${ratio===1?'bottom':'middle'} preserves scroll and views`,before.top>0&&samePosition(before,after)&&hidden===(action==='hide'),{id,before,after});
    // Restore the fixture position after a baseline failure so subsequent checks are independent.
    if(!samePosition(before,after))await scrollTo(ratio);
   }
  }
  for(const action of ['hide','show']){
   await scrollTo(.6);const before=await state();
   await page.getByRole('button',{name:action==='hide'?'👁 全部隐藏':'🚫 全部显示',exact:true}).click();
   await page.waitForTimeout(120);const after=await state();
   check(`all ${action} preserves list position`,before.top>0&&samePosition(before,after)&&after.visible===(action==='hide'?0:40),{before,after});
  }
  await scrollTo(.5);let id=await visibleId(),before=await state();
  await page.locator(`.vmmoss-row[data-id="${id}"] .vmmoss-ico`).nth(1).click();
  await page.waitForTimeout(120);let after=await state();
  check('lock toggle also preserves scroll',samePosition(before,after),{before,after});
  await scrollTo(1);id=await visibleId();before=await state();
  await page.locator(`.vmmoss-row[data-id="${id}"] .vmmoss-ico`).last().click();
  await page.waitForTimeout(120);after=await state();
  check('deleting at bottom clamps to new bottom without jumping to top',after.count===39&&after.top>0&&Math.abs(after.top-Math.min(before.top,after.max))<1,{before,after});
  await scrollTo(.3);
  await page.getByRole('button',{name:'+ 物体框',exact:true}).click();
  await page.waitForTimeout(120);after=await state();
  check('adding a box still intentionally reveals the last row',after.count===40&&Math.abs(after.top-after.max)<1,{after});
  await page.locator('.vmmoss').screenshot({path:path.join(OUT,'scroll_result.png')});
 } finally {fs.writeFileSync(path.join(OUT,'result.json'),JSON.stringify(results,null,2));await browser.close();}
 const passed=results.filter(r=>r.ok).length;console.log(`Total ${passed}/${results.length}`);
 if(passed!==results.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=2;});
