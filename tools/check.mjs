#!/usr/bin/env node
/* spec-check <episode-dir> [--chrome <path>]
   Deterministic checks on an episode. Writes out/check.json and exits 1 on any FAIL.
   It does not judge whether the lesson is true or good; that is the reviewer's job.
   It catches what a tired reviewer misses: wrong size, unreadable or clipped text, collisions,
   lines through labels, color, banned characters and phrases, undefined codes, unsourced claims,
   and a caption LinkedIn will truncate or down-rank.

   Thresholds come from the nearest spec-sheet.rules.json at or above the episode (versioned with
   the repo). An episode may only add code prefixes (episode.json checks.extraCodePrefixes). */
import fs from 'node:fs';import path from 'node:path';
import {openEpisode,readRules,slideSizes,clearOutputs,inputHash} from './lib.mjs';

const args=process.argv.slice(2);
const dir=path.resolve(args.find(a=>!a.startsWith('--'))||'.');
const ci=args.indexOf('--chrome');const chrome=ci>=0?args[ci+1]:null;
const R={checkedAt:new Date().toISOString(),inputs:null,rulesFile:null,overrides:[],fail:[],warn:[],pass:[]};
const fail=(id,msg)=>R.fail.push({id,msg}),warn=(id,msg)=>R.warn.push({id,msg});
const ok=(id,n)=>{if(!n)R.pass.push(id)};

const DEFAULTS={minSlides:8,maxSlides:10,minPx:24,safe:48,captionMax:3000,captionEndsWithQuestion:false,maxHashtags:0,
  codePrefixes:['IN','K','REF','SK','C','G','OUT','T','V','E','L'],banned:[]};
try{fs.rmSync(path.join(dir,'out','check.json'),{force:true})}catch{}
const {file:rulesFile,rules:repoRules,inside,error:rulesError}=readRules(dir);R.rulesFile=rulesFile;
const rules=Object.assign({},DEFAULTS,repoRules);
R.inputs=inputHash(dir,rulesFile?[rulesFile]:[]);
if(rulesError)fail('rules','spec-sheet.rules.json is not valid JSON: '+rulesError);
if(inside)fail('rules','spec-sheet.rules.json inside the episode folder is not allowed and was ignored');
if(!rulesFile)fail('rules','no spec-sheet.rules.json found above the episode folder; checks cannot run with default thresholds');
else{const need=['minSlides','maxSlides','minPx','safe','captionMax','captionEndsWithQuestion','maxHashtags','banned'];
  const miss=need.filter(k=>!(k in repoRules));if(miss.length)fail('rules',`spec-sheet.rules.json is missing ${miss.join(', ')}; every threshold must be stated`);
  if(Array.isArray(repoRules.banned)&&!repoRules.banned.length)fail('rules','spec-sheet.rules.json has an empty banned list')}
{const rj=path.join(dir,'out','render.json');let rec=null;try{rec=JSON.parse(fs.readFileSync(rj,'utf8'))}catch{}
  if(!rec)fail('render','no out/render.json; run spec-render before spec-check');
  else if(rec.inputs!==R.inputs)fail('render','the files changed since the last render; the PDF on disk is out of date. Run spec-render again')
  else{const out=path.join(dir,'out');const dwgName=((()=>{try{return JSON.parse(fs.readFileSync(path.join(dir,'episode.json'),'utf8')).dwg}catch{return null}})()||path.basename(dir)).replace(/[^A-Za-z0-9-]/g,'');
    const missing=[dwgName+'.pdf','contact.png'].concat(Array.from({length:rec.slides||0},(_,i)=>`slide-${String(i+1).padStart(2,'0')}.png`)).filter(f=>!fs.existsSync(path.join(out,f)));
    if(missing.length)fail('render','rendered files are missing: '+missing.slice(0,4).join(', ')+'. Run spec-render again')}}
const writeReport=()=>{fs.mkdirSync(path.join(dir,'out'),{recursive:true});fs.writeFileSync(path.join(dir,'out','check.json'),JSON.stringify(R,null,2))};

let ctx;
try{ctx=await openEpisode(dir,{chrome})}catch(e){clearOutputs(dir);fail('load',e.message);writeReport();console.error('FAIL load: '+e.message+' (old outputs removed)');process.exit(1)}
const {browser,page,ep}=ctx;

if(ep&&ep.checks){
  for(const k of Object.keys(ep.checks)){
    if(k==='extraCodePrefixes'&&Array.isArray(ep.checks[k])){rules.codePrefixes=rules.codePrefixes.concat(ep.checks[k]);R.overrides.push('extraCodePrefixes: '+ep.checks[k].join(','))}
    else fail('rules',`episode.json checks.${k} is not allowed; thresholds live in spec-sheet.rules.json`)}}

try{try{
  // 1. size and count
  const sizes=await slideSizes(page);const n=sizes.length;
  const badSize=sizes.map((b,i)=>[i+1,b]).filter(([,b])=>b[0]!==1080||b[1]!==1350);
  badSize.forEach(([i,b])=>fail('slide-size',`slide ${i} is ${b[0]} x ${b[1]}; must be 1080 x 1350`));ok('slide-size',badSize.length);
  if(n<rules.minSlides||n>rules.maxSlides)fail('slide-count',`${n} slides; series spec is ${rules.minSlides} to ${rules.maxSlides}`);else ok('slide-count');

  const scan=await page.evaluate(()=>{
    const slides=[...document.querySelectorAll('section.slide')];
    const okColor=(v)=>{if(!v||v==='none'||v==='transparent'||v==='currentcolor')return true;
      if(/^url\(["']?#hat\d+["']?\)/.test(v))return true;
      const m=v.match(/^rgba?\(([^)]+)\)$/);if(!m)return false;const p=m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      if(p.length>3&&p[3]===0)return true;return Math.max(p[0],p[1],p[2])-Math.min(p[0],p[1],p[2])<=6};
    const visible=e=>{if(e.getClientRects().length===0)return false;for(let x=e;x&&x.nodeType===1;x=x.parentElement){const cs=getComputedStyle(x);
      if(cs.visibility==='hidden'||cs.display==='none'||parseFloat(cs.opacity)===0)return false}return true};
    let gid=0;const tag=(el,sel,attr)=>{const g=el.closest(sel);if(!g)return null;if(!g.dataset[attr])g.dataset[attr]=String(++gid);return g.dataset[attr]};
    return slides.map((s,si)=>{
      const sr=s.getBoundingClientRect();const rel=r=>[r.left-sr.left,r.top-sr.top,r.right-sr.left,r.bottom-sr.top];
      const texts=[];const bad=[];let tid=0;
      const fam=e=>getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g,'').trim();
      const light=e=>{const cs=getComputedStyle(e);const m=(e.namespaceURI==='http://www.w3.org/2000/svg'?(cs.fill||''):'').match(/^rgba?\(([^)]+)\)/)||(cs.color||'').match(/^rgba?\(([^)]+)\)/);if(!m)return false;const p=m[1].split(/[ ,/]+/).map(Number);return Math.min(p[0],p[1],p[2])>0x88};
      s.querySelectorAll('svg text, svg tspan').forEach(t=>{t.dataset.qat=String(++tid)});
      s.querySelectorAll('svg text, svg tspan').forEach(t=>{
        const own=[...t.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join('');if(!own.trim()||!visible(t))return;
        const m=t.getScreenCTM();const k=m?Math.hypot(m.a,m.b):1;const anc=t.parentElement&&t.parentElement.closest('text,tspan');
        if(!t.closest('.brand')){if(!['Arimo','JetBrains Mono'].includes(fam(t)))bad.push(['font',`"${own.slice(0,30)}" uses ${fam(t)}`]);
          if(light(t))bad.push(['contrast',`"${own.slice(0,30)}" is too light to read`])}
        texts.push({s:own,id:t.dataset.qat,anc:anc?anc.dataset.qat:null,px:parseFloat(getComputedStyle(t).fontSize)*k,box:rel(t.getBoundingClientRect()),
          brand:!!t.closest('.brand'),avoid:!!t.closest('[data-avoid]'),inTable:!!t.closest('[data-code]'),dim:tag(t,'g.dim','qadim'),part:tag(t,'g.part','qapart')})});
      s.querySelectorAll('text,tspan,div,p,span').forEach(e=>{if(e.closest('.brand')||!e.textContent.trim())return;let o=1;for(let x=e;x&&x.nodeType===1&&x!==s;x=x.parentElement){const cs=getComputedStyle(x);o*=parseFloat(cs.opacity);if(x===e&&cs.fillOpacity)o*=parseFloat(cs.fillOpacity)}
        {const cs=getComputedStyle(e);const c=(e.namespaceURI==='http://www.w3.org/2000/svg'?cs.fill:cs.color)||'';const m=c.match(/^rgba\(([^)]+)\)/);if(m){const a=+m[1].split(/[ ,/]+/).filter(Boolean)[3];if(a<1)o*=a}}
        if(o>0&&o<0.6)bad.push(['contrast',`"${e.textContent.trim().slice(0,30)}" is drawn at ${Math.round(o*100)}% opacity`])});
      s.querySelectorAll('foreignObject, use, textPath').forEach(e=>bad.push(['element',`<${e.tagName}> is not allowed; draw text and parts with the kit`]));
      // HTML text nodes (any element, any nesting), size scaled by CSS transforms
      const tw=document.createTreeWalker(s,NodeFilter.SHOW_TEXT);let node;
      while((node=tw.nextNode())){const p=node.parentElement;if(!p||p.closest('svg')||!node.textContent.trim()||!visible(p))continue;
        const range=document.createRange();range.selectNodeContents(node);const r=range.getBoundingClientRect();
        const pr=p.getBoundingClientRect();const scale=p.offsetWidth?pr.width/p.offsetWidth:1;
        if(!p.closest('.brand')&&!['Arimo','JetBrains Mono'].includes(fam(p)))bad.push(['font',`"${node.textContent.trim().slice(0,30)}" uses ${fam(p)}`]);
        if(!p.closest('.brand')&&light(p))bad.push(['contrast',`"${node.textContent.trim().slice(0,30)}" is too light to read`]);
        texts.push({s:node.textContent,id:'h'+(++tid),anc:null,px:parseFloat(getComputedStyle(p).fontSize)*scale,box:rel(r),brand:!!p.closest('.brand'),avoid:!!p.closest('[data-avoid]'),inTable:false,dim:null,part:null})}
      // segments: lines, polylines, paths, detail circles, and the edges of drawn boxes
      const segs=[];const inDefs=e=>!!e.closest('defs,marker,pattern,mask,clipPath');
      const P=(e,x,y)=>{const m=e.getScreenCTM();return [m.a*x+m.c*y+m.e-sr.left,m.b*x+m.d*y+m.f-sr.top]};
      const push=(e,a,b,kind)=>segs.push({a,b,dim:tag(e,'g.dim','qadim'),part:tag(e,'g.part','qapart'),kind});
      s.querySelectorAll('svg line').forEach(e=>{if(inDefs(e)||e.classList.contains('border'))return;
        push(e,P(e,+e.getAttribute('x1'),+e.getAttribute('y1')),P(e,+e.getAttribute('x2'),+e.getAttribute('y2')),'line')});
      s.querySelectorAll('svg polyline').forEach(e=>{if(inDefs(e)||!e.getAttribute('points'))return;const pts=e.getAttribute('points').trim().split(/\s+/).map(p=>p.split(',').map(Number));
        for(let i=0;i<pts.length-1;i++)push(e,P(e,...pts[i]),P(e,...pts[i+1]),'line')});
      s.querySelectorAll('svg path').forEach(e=>{if(inDefs(e)||!e.getAttribute('d'))return;const L=e.getTotalLength();const k=Math.max(8,Math.ceil(L/6));let prev=null;
        for(let i=0;i<=k;i++){const q=e.getPointAtLength(L*i/k);const cur=P(e,q.x,q.y);if(prev)push(e,prev,cur,'path');prev=cur}});
      s.querySelectorAll('svg circle, svg ellipse').forEach(e=>{if(inDefs(e))return;const cx=+e.getAttribute('cx'),cy=+e.getAttribute('cy');
        const rx=+(e.getAttribute('r')||e.getAttribute('rx')),ry=+(e.getAttribute('r')||e.getAttribute('ry'));if(Math.max(rx,ry)<=6)return;
        for(let i=0;i<96;i++){const a=i/96*2*Math.PI,b=(i+1)/96*2*Math.PI;push(e,P(e,cx+rx*Math.cos(a),cy+ry*Math.sin(a)),P(e,cx+rx*Math.cos(b),cy+ry*Math.sin(b)),'circle')}});
      s.querySelectorAll('svg polygon').forEach(e=>{if(inDefs(e)||!e.getAttribute('points'))return;const pts=e.getAttribute('points').trim().split(/\s+/).map(p=>p.split(',').map(Number));
        for(let i=0;i<pts.length;i++)push(e,P(e,...pts[i]),P(e,...pts[(i+1)%pts.length]),'line')});
      s.querySelectorAll('svg rect').forEach(e=>{if(inDefs(e)||e.classList.contains('border')||e.closest('.brand'))return;
        const x=+e.getAttribute('x'),y=+e.getAttribute('y'),w=+e.getAttribute('width'),h=+e.getAttribute('height');
        const c=[P(e,x,y),P(e,x+w,y),P(e,x+w,y+h),P(e,x,y+h)];for(let i=0;i<4;i++)push(e,c[i],c[(i+1)%4],'edge')});
      // label fit inside its own part
      const fit=[];s.querySelectorAll('g.part').forEach(g=>{const r=g.querySelector('rect');if(!r)return;const b=r.getBoundingClientRect();
        g.querySelectorAll('text').forEach(t=>{const q=t.getBoundingClientRect();
          if(q.left<b.left+6||q.right>b.right-6||q.top<b.top||q.bottom>b.bottom)fit.push(t.textContent)})});
      // color
      const color=[];const props=['fill','stroke','color','background-color','stop-color','border-top-color','border-right-color','border-bottom-color','border-left-color','outline-color'];
      s.querySelectorAll('*').forEach(e=>{const br=e.closest('.brand');if(br&&(si===0||si===slides.length-1))return;const cs=getComputedStyle(e);
        for(const p of props){const v=cs.getPropertyValue(p);if(!okColor(v))color.push(e.tagName+'.'+(e.getAttribute('class')||'')+' '+p+'='+v)}
        const bs=cs.boxShadow;if(bs&&bs!=='none'&&(bs.match(/rgba?\([^)]+\)/g)||['x']).some(c=>!okColor(c)))color.push(e.tagName+' box-shadow='+bs);
        if(cs.filter&&cs.filter!=='none')color.push(e.tagName+' filter='+cs.filter);
        if(cs.backgroundImage&&cs.backgroundImage!=='none')color.push(e.tagName+' background-image');
        if(e.tagName==='image'||e.tagName==='IMG')color.push(e.tagName+' outside the brand group on the first or last sheet')});
      const brandMisplaced=si!==0&&si!==slides.length-1&&!!s.querySelector('.brand');
      const codes=[...s.querySelectorAll('[data-code]')].map(e=>e.getAttribute('data-code'));
      const sht=[...s.querySelectorAll('text.footb')].map(t=>t.textContent);
      return {n:si+1,texts,segs,fit,color,codes,brandMisplaced,bad,sht,all:texts.map(t=>t.s).join(' \n ')+' \n '+s.textContent};
    });
  });

  // 2. readable size, 3. safe area
  let c1=0,c2=0;
  for(const sl of scan)for(const t of sl.texts){
    if(t.px<rules.minPx-0.01){c1++;fail('min-size',`slide ${sl.n}: "${t.s.slice(0,40)}" renders at ${t.px.toFixed(1)}px (floor ${rules.minPx})`)}
    const [x1,y1,x2,y2]=t.box;
    if(x1<rules.safe||y1<rules.safe||x2>1080-rules.safe||y2>1350-rules.safe){c2++;fail('safe-area',`slide ${sl.n}: "${t.s.slice(0,40)}" is inside the ${rules.safe}px margin`)}}
  ok('min-size',c1);ok('safe-area',c2);

  // 4. text on text
  let c3=0;
  for(const sl of scan){const T=sl.texts;for(let i=0;i<T.length;i++)for(let j=i+1;j<T.length;j++){
    const a=T[i].box,b=T[j].box;const w=Math.min(a[2],b[2])-Math.max(a[0],b[0]),h=Math.min(a[3],b[3])-Math.max(a[1],b[1]);
    if(w>2&&h>2){const min=Math.min((a[2]-a[0])*(a[3]-a[1]),(b[2]-b[0])*(b[3]-b[1]));
      if(w*h>0.08*min&&T[i].anc!==T[j].id&&T[j].anc!==T[i].id){c3++;fail('collision',`slide ${sl.n}: "${T[i].s.slice(0,28)}" overlaps "${T[j].s.slice(0,28)}"`)}}}}
  ok('collision',c3);

  // 4b. any line, path, detail circle, or box edge through a label (a dimension may touch its own label)
  let c4=0;
  for(const sl of scan)for(const t of sl.texts){const [x1,y1,x2,y2]=t.box;const ix1=x1+3,iy1=y1+3,ix2=x2-3,iy2=y2-3;
    for(const g of sl.segs){if(t.dim&&g.dim===t.dim)continue;if(g.kind==='edge'&&t.part&&g.part===t.part)continue;
      const [ax,ay]=g.a,[bx,by]=g.b;const L=Math.hypot(bx-ax,by-ay),k=Math.max(2,Math.ceil(L/3));let hit=false;
      for(let i=0;i<=k&&!hit;i++){const x=ax+(bx-ax)*i/k,y=ay+(by-ay)*i/k;if(x>ix1&&x<ix2&&y>iy1&&y<iy2)hit=true}
      if(hit){c4++;fail('line-cross',`slide ${sl.n}: a ${g.kind==='edge'?'box edge':g.kind} runs through "${t.s.slice(0,32)}"`);break}}}
  ok('line-cross',c4);

  // 4c. every label inside its own box
  const over=scan.flatMap(sl=>sl.fit.map(t=>`slide ${sl.n}: "${t.slice(0,36)}" runs outside its box`));
  over.forEach(m=>fail('label-fit',m));ok('label-fit',over.length);

  // 5. monochrome, brand placement
  const col=scan.flatMap(s=>s.color.map(c=>`slide ${s.n}: ${c}`));col.slice(0,12).forEach(c=>fail('monochrome',c));ok('monochrome',col.length);
  scan.filter(s=>s.brandMisplaced).forEach(s=>fail('brand',`slide ${s.n} has a brand group; only the first and last sheet may`));
  const badEl=scan.flatMap(s=>s.bad.map(([id,m])=>[id,`slide ${s.n}: ${m}`]));badEl.forEach(([id,m])=>fail(id,m));ok('fonts-contrast',badEl.length);
  let c7=0;scan.forEach(s=>{const want=`SHT ${s.n} OF ${n}`;if(!s.sht.includes(want)){c7++;fail('sheet-numbers',`slide ${s.n} footer says ${s.sht.join(', ')||'nothing'}; expected ${want}`)}});ok('sheet-numbers',c7);

  // 6. characters and banned phrases on the sheets
  const em=scan.filter(s=>s.all.includes('\u2014'));em.forEach(s=>fail('em-dash',`slide ${s.n} contains an em dash`));ok('em-dash',em.length);
  scan.filter(s=>s.all.includes('\u2013')).forEach(s=>warn('en-dash',`slide ${s.n} has an en dash (fine for ranges, not as a dash)`));
  const emoji=/\p{Extended_Pictographic}/u;
  scan.filter(s=>emoji.test(s.all)).forEach(s=>fail('emoji',`slide ${s.n} contains an emoji`));
  const norm=t=>t.replace(/[\u2018\u2019\u02bc]/g,"'").replace(/[\u201c\u201d]/g,'"');
  const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const bannedRe=rules.banned.map(b=>({b,re:b.startsWith('re:')?new RegExp(b.slice(3),'i'):new RegExp('(^|[^a-z])'+esc(b.toLowerCase())+'($|[^a-z])','i')}));
  for(const s of scan){const txt=norm(s.texts.filter(t=>!t.avoid).map(t=>t.s).join(' \n '));for(const {b,re} of bannedRe)if(re.test(txt))fail('banned',`slide ${s.n}: "${b}"`)}

  // 7. codes: every code drawn outside a table is defined in a table row
  const re=new RegExp('\\b('+rules.codePrefixes.join('|')+')\\d+\\b','g');
  const all=scan.flatMap(s=>s.texts.map(t=>({n:s.n,s:t.s,inTable:t.inTable})));
  const used=new Set(all.filter(t=>!t.inTable).flatMap(t=>t.s.match(re)||[]));
  const expand=c=>{const m=c.match(/^([A-Z]+)(\d+)\.\.(?:[A-Z]+)?(\d+)$/);if(!m)return [c];const out=[];for(let i=+m[2];i<=+m[3];i++)out.push(m[1]+i);return out};
  const defined=new Set(scan.flatMap(s=>s.codes.flatMap(expand)));
  const undef=[...used].filter(c=>!defined.has(c));
  if(undef.length)fail('codes',`drawn but missing from every table: ${undef.join(', ')}`);else ok('codes');
  [...defined].filter(c=>!used.has(c)).forEach(c=>warn('codes',`${c} is in a table but never drawn`));
  if(!all.some(t=>t.s.includes('[TBD]')))warn('tbd','no [TBD] anywhere; the series promises a "what only you decide" sheet');

  // 8. claims and sources
  const realDate=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d||''))return false;const x=new Date(d+'T00:00:00Z');return !isNaN(x)&&x.toISOString().slice(0,10)===d&&x<=new Date(Date.now()+864e5)};
  if(!ep)fail('episode','episode.json missing');
  else{
    const sources=ep.sources||[],claims=ep.claims||[];const ids=new Set(sources.map(s=>s.n));let c5=0;
    for(const s of sources){let u=null;try{u=new URL(s.url)}catch{}
      if(!u||u.protocol!=='https:'||!u.hostname.includes('.')){c5++;fail('sources',`source ${s.n} needs a full https url`)}
      if(!claims.some(c=>c.src===s.n)){c5++;fail('sources',`source ${s.n} is listed but no claim uses it`)}}
    for(const c of claims){
      if(!ids.has(c.src)){c5++;fail('claims',`claim "${(c.text||'').slice(0,50)}" points to source ${c.src}, which is not in sources`)}
      (c.sheets||[]).filter(x=>!(Number.isInteger(x)&&x>=1&&x<=n)).forEach(x=>{c5++;fail('claims',`claim "${(c.text||'').slice(0,40)}" lists sheet ${x}, which does not exist`)});
      if(!realDate(c.accessed)){c5++;fail('claims',`claim "${(c.text||'').slice(0,50)}" needs accessed as YYYY-MM-DD`)}}
    if(!realDate(ep.checked)){c5++;fail('sources','episode.json checked must be YYYY-MM-DD')}
    const last=scan[scan.length-1]?.all||'';const saysNone=last.includes('NONE. THIS SET STATES NO OUTSIDE FACTS.');
    if(sources.length&&saysNone){c5++;fail('sources','last sheet says no outside facts, but episode.json lists sources')}
    if(!sources.length&&!saysNone){c5++;fail('sources','no sources in episode.json, but the last sheet does not say so')}
    const cited=new Set(scan.flatMap(s=>[...s.all.matchAll(/SRC (\d+)/g)].map(m=>+m[1])));
    [...cited].filter(x=>!ids.has(x)).forEach(x=>{c5++;fail('sources',`a sheet cites SRC ${x}, which is not in sources`)});
    ok('claims-sources',c5);
    if(!claims.length)warn('claims','no claims listed; fine only if the episode states no facts about tools, limits or numbers');
  }

  // 8b. evidence: every claim carries the exact words it rests on; sources must be primary
  if(ep&&rules.requireClaimQuote){let q=0;
    for(const c of ep.claims||[]){const w=String(c.quote||'').trim().split(/\s+/).filter(Boolean).length;
      if(w<3||w>45){q++;fail('evidence',`claim "${(c.text||'').slice(0,40)}" needs a quote of 3 to 45 words copied from the source page`)}}
    ok('evidence',q)}
  if(ep&&Array.isArray(rules.primaryDomains)){let q=0;
    for(const s of ep.sources||[]){let h='';try{h=new URL(s.url).hostname}catch{}
      if(!rules.primaryDomains.some(d=>h===d||h.endsWith('.'+d))){
        if(s.primaryNote)warn('primary',`source ${s.n} (${h}) is outside the primary list; the auditor must confirm: ${s.primaryNote}`);
        else{q++;fail('primary',`source ${s.n} (${h}) is not on the primary-source list; use the original publisher, or add primaryNote explaining why this is the original`)}}}
    ok('primary',q)}

  // 8c. series: approval and continuity come from the series file, not from memory
  let S=null,me=null,nextEp=null;
  if(rules.series){const sf=path.resolve(path.dirname(rulesFile),rules.series);let c9=0;
    try{S=JSON.parse(fs.readFileSync(sf,'utf8'))}catch(e){c9++;fail('series',`cannot read ${rules.series}: ${String(e.message).split('\n')[0]}`)}
    if(S&&ep){const all=(S.seasons||[]).flatMap(se=>se.episodes||[]);const i=all.findIndex(e=>e.dwg===ep.dwg);me=all[i];
      if(!me){c9++;fail('series',`${ep.dwg} is not in the series file`)}
      else{
        if(!['approved','drawn','review','posted'].includes(me.status)){c9++;fail('series',`${ep.dwg} is "${me.status}" in the series file; only approved episodes may be drawn`)}
        if(!me.approval||!String(me.approval.words||'').trim()){c9++;fail('series',`${ep.dwg} has no approval record with Samantha's own words`)}
        if(norm(String(me.title)).toLowerCase()!==norm(String(ep.title||'')).toLowerCase()){c9++;fail('series',`episode.json title "${ep.title}" differs from the series file "${me.title}"`)}
        nextEp=all[i+1]||null;const cn=(ep.close||{}).next;
        const flat=t=>norm(String(t)).toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
        if(nextEp){
          if(!cn){c9++;fail('series',`close.next is empty but the series continues with Spec Sheet ${nextEp.no}`)}
          else{if(flat(cn.no)!==flat('Spec Sheet '+nextEp.no)){c9++;fail('series',`close sheet teases ${cn.no}; the next episode is Spec Sheet ${nextEp.no}`)}
            if(flat(cn.day)!==flat(nextEp.day)){c9++;fail('series',`close sheet says ${cn.day}; the next episode posts on ${nextEp.day}`)}
            if(flat((cn.title||[]).join(' '))!==flat(nextEp.title)){c9++;fail('series',`close sheet teases "${(cn.title||[]).join(' ')}"; the next title is "${nextEp.title}"`)}}}
        else if(cn){c9++;fail('series','close.next is set but this is the last episode in the series file')}}}
    ok('series',c9)}

  // 9. caption
  const cap=path.join(dir,'caption.md');let c6=0;
  if(!fs.existsSync(cap)){c6++;fail('caption','caption.md missing')}
  else{const c=norm(fs.readFileSync(cap,'utf8').trim());
    if(c.length>rules.captionMax){c6++;fail('caption',`${c.length} characters; the limit is ${rules.captionMax}`)}
    if(/https?:\/\/|www\.|\b[a-z0-9-]{2,}\.[a-z]{2,24}\b(?!\.[a-z])/i.test(c)){c6++;fail('caption','link or bare domain in the post; put civicnorthma.com on the last sheet')}
    if(c.includes('\u2014')){c6++;fail('caption','em dash')}
    if(/\s\u2013\s|--/.test(c)){c6++;fail('caption','an en dash or double hyphen used as a dash')}
    if(emoji.test(c)){c6++;fail('caption','emoji')}
    const tags=(c.match(/(^|[^\w&])[#\uff03][A-Za-z]/g)||[]).length;if(tags>((rules.caption||{}).hashtagsMax??rules.maxHashtags)){c6++;fail('caption',`${tags} hashtags; the limit is ${(rules.caption||{}).hashtagsMax??rules.maxHashtags}`)}
    for(const {b,re} of bannedRe)if(re.test(c)){c6++;fail('caption',`banned phrase "${b}"`)}
    const paras=c.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
    const R2=rules.caption||{};const lines=c.split('\n').map(l=>l.trim());
    if(R2.firstLine&&me){const want=R2.firstLine.replace('{no}',me.no).replace('{title}',me.title);
      if(norm(lines[0]).toLowerCase()!==norm(want).toLowerCase()){c6++;fail('caption',`first line must be "${want}"`)}}
    const tagLine=paras[paras.length-1]||'';const tagList=(tagLine.match(/(^|[^\w&])[#\uff03][A-Za-z][\w]*/g)||[]).map(t=>t.trim().replace(/^[^#\uff03]+/,''));
    if(R2.hashtagsLast){const elsewhere=paras.slice(0,-1).some(p=>/(^|[^\w&])[#\uff03][A-Za-z]/.test(p));
      if(elsewhere){c6++;fail('caption','hashtags belong only in the last paragraph')}
      if(R2.hashtagsMin&&tagList.length<R2.hashtagsMin){c6++;fail('caption',`${tagList.length} hashtags; at least ${R2.hashtagsMin}`)}
      for(const t of R2.hashtagsRequired||[])if(!tagList.some(x=>x.toLowerCase()===t.toLowerCase())){c6++;fail('caption',`missing the series hashtag ${t}`)}
      if(R2.hashtagsAllowed)for(const t of tagList)if(!R2.hashtagsAllowed.concat(R2.hashtagsRequired||[]).some(a=>a.toLowerCase()===t.toLowerCase())){c6++;fail('caption',`${t} is not on the approved hashtag list`)}
      if(new Set(tagList.map(t=>t.toLowerCase())).size!==tagList.length){c6++;fail('caption','a hashtag is repeated')}}
    if(R2.cta&&S){const ctaP=paras[paras.length-(R2.hashtagsLast?2:1)]||'';
      const want=nextEp?R2.cta.replace('{no}',nextEp.no).replace('{day}',nextEp.day).replace('{title}',nextEp.title):(R2.ctaEnd||'');
      if(norm(ctaP).toLowerCase()!==norm(want).toLowerCase()){c6++;fail('caption',`call to action must read "${want}"`)}
      if(R2.questionBeforeCta){const qP=paras[paras.length-(R2.hashtagsLast?3:2)]||'';if(!/\?$/.test(qP)||qP.split(/\n/).length>1){c6++;fail('caption','the paragraph before the call to action must be the one question, on its own')}}}
    if(rules.captionEndsWithQuestion&&!rules.caption&&!/\?$/.test(paras[paras.length-1]||'')){c6++;fail('caption','must end with the question')}
    const hook=c.split(/\n/).slice(0,2).join(' ');if(hook.length>210)warn('caption',`first two lines are ${hook.length} characters; the hook may fall below "see more"`);
    ok('caption',c6)}
  if(ep){const t=norm(ep.pdfTitle||'');let c8=0;
    if(!t.trim()){c8++;fail('pdf-title','episode.json pdfTitle is empty')}
    if(t.length>100){c8++;fail('pdf-title',`pdfTitle is ${t.length} characters; keep it under 100`)}
    if(/\u2014|\s\u2013\s|--/.test(t)||emoji.test(t)){c8++;fail('pdf-title','pdfTitle has a dash or emoji')}
    for(const {b,re} of bannedRe)if(re.test(t)){c8++;fail('pdf-title',`banned phrase "${b}"`)}
    ok('pdf-title',c8)}

  }catch(e){fail('crash','spec-check crashed: '+String(e&&e.message||e).split('\n')[0])}
  writeReport();
  for(const f of R.fail)console.log('FAIL '+f.id.padEnd(15)+f.msg);
  for(const w of R.warn)console.log('WARN '+w.id.padEnd(15)+w.msg);
  if(R.overrides.length)console.log('NOTE episode overrides: '+R.overrides.join('; '));
  console.log(`${R.fail.length} fail, ${R.warn.length} warn, ${R.pass.length} pass${rulesFile?'  (rules: '+path.relative(process.cwd(),rulesFile)+')':'  (default rules)'}`);
  process.exitCode=R.fail.length?1:0;
}finally{await browser.close()}
