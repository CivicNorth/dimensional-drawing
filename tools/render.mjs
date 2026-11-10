#!/usr/bin/env node
/* spec-render <episode-dir> [--chrome <path>]
   Writes into <episode-dir>/out/:
     <DWG>.pdf      LinkedIn document upload (vector, 1080 x 1350 px pages)
     slide-NN.png   full-size slides (reuse on Facebook, Medium, the site)
     phone-NN.png   390 px wide previews, about what an iPhone shows in the feed
     contact.png    every slide on one image, for review on a phone
   Exits non-zero on a missing browser, font fallback, script error, or a wrong-sized slide.
   Run spec-check after. */
import fs from 'node:fs';import path from 'node:path';import {openEpisode,slideSizes,clearOutputs,inputHash,readRules} from './lib.mjs';

const args=process.argv.slice(2);
const dir=path.resolve(args.find(a=>!a.startsWith('--'))||'.');
const ci=args.indexOf('--chrome');const chrome=ci>=0?args[ci+1]:null;

let ctx;
try{ctx=await openEpisode(dir,{chrome})}catch(e){clearOutputs(dir);console.error('FAIL '+e.message+' (old outputs removed)');process.exit(1)}
const {browser,page,dwg}=ctx;
let code=0;
try{
  const boxes=await slideSizes(page);
  const bad=boxes.map((b,i)=>[i+1,b]).filter(([,b])=>b[0]!==1080||b[1]!==1350);
  if(!boxes.length||bad.length){clearOutputs(dir);console.error('FAIL slide size: '+(boxes.length?JSON.stringify(bad):'no section.slide found')+' (old outputs removed)');code=1}
  else{
    const out=path.join(dir,'out');
    fs.mkdirSync(out,{recursive:true});
    clearOutputs(dir);
    await page.pdf({path:path.join(out,dwg+'.pdf'),width:'1080px',height:'1350px',printBackground:true,preferCSSPageSize:true});
    const els=await page.$$('section.slide');const names=[];
    for(let i=0;i<els.length;i++){const nn=String(i+1).padStart(2,'0');names.push(nn);await els[i].screenshot({path:path.join(out,`slide-${nn}.png`)})}
    const tool=await browser.newPage({viewport:{width:390,height:488}});
    const data=nn=>'data:image/png;base64,'+fs.readFileSync(path.join(out,`slide-${nn}.png`)).toString('base64');
    const loaded=async()=>{await tool.waitForFunction(()=>[...document.images].every(i=>i.complete));
      if(!(await tool.evaluate(()=>[...document.images].every(i=>i.naturalWidth>0))))throw new Error('a slide image failed to load while building previews')};
    for(const nn of names){
      await tool.setContent(`<body style="margin:0"><img src="${data(nn)}" style="width:390px;display:block"></body>`);
      await loaded();
      await tool.screenshot({path:path.join(out,`phone-${nn}.png`),clip:{x:0,y:0,width:390,height:488}})}
    // contact sheet: 3 columns of 540 x 675 tiles
    const cols=3,rows=Math.ceil(names.length/cols),tw=540,th=675,pad=10;
    const W=cols*tw+(cols+1)*pad,H=rows*th+(rows+1)*pad;
    await tool.setViewportSize({width:W,height:H});
    await tool.setContent(`<body style="margin:0;background:#808080;width:${W}px;height:${H}px;position:relative">`+
      names.map((nn,i)=>`<img src="${data(nn)}" style="position:absolute;width:${tw}px;height:${th}px;left:${pad+(i%cols)*(tw+pad)}px;top:${pad+Math.floor(i/cols)*(th+pad)}px">`).join('')+'</body>');
    await loaded();
    await tool.screenshot({path:path.join(out,'contact.png'),clip:{x:0,y:0,width:W,height:H}});
    const rf=readRules(dir).file;
    fs.writeFileSync(path.join(out,'render.json'),JSON.stringify({renderedAt:new Date().toISOString(),inputs:inputHash(dir,rf?[rf]:[]),slides:els.length},null,2));
    console.log(`OK ${els.length} slides -> ${path.relative(process.cwd(),out)||'out'}/${dwg}.pdf (+ slide-NN.png, phone-NN.png, contact.png)`);
  }
}finally{await browser.close()}
process.exitCode=code;
