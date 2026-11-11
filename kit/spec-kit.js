/* Spec Sheet kit v1.2
   Port of the drawing kit in enesozturk/dimensional-drawing
   (skills/dimensional-drawing/examples/card-sheet.html, MIT, Copyright (c) 2026 Enes Ozturk),
   rescaled for 1080 x 1350 portrait slides, plus process parts for drawing a business job
   (slots, stages, flows, gates, layer stacks) instead of a UI component.
   Civic North additions: Copyright (c) 2026 Civic North, MIT.

   Exposes window.SpecKit. An episode's slides.html defines window.drawEpisode(K);
   tools/render.mjs sets window.EPISODE (the parsed episode.json) and then calls it.

   Grouping contract with tools/check.mjs:
   - <g class="part" data-box="x,y,w,h">  a box and its own labels; labels must fit inside the box
   - <g class="dim">                      a dimension or callout and its own label; its lines may touch its label
   - <g class="brand">                    the only place color, images, or the Civic North name may appear */
(function(){
const NS='http://www.w3.org/2000/svg';
const W=1080,H=1350,M=48;            // page size and safe margin
const G=2.3;                          // geometry scale vs upstream offsets
let sv,par=null,A,HAT,uid=0;

function mk(t,a,p){const e=document.createElementNS(NS,t);for(const k in a)if(a[k]!=null)e.setAttribute(k,a[k]);(p||par||sv).appendChild(e);return e}
function tx(x,y,s,c,a,p){const t=mk('text',Object.assign({x,y,class:c||'dt'},a||{}),p);t.textContent=s;return t}
function rr(x,y,w,h,r,c){return mk('rect',{x,y,width:w,height:h,rx:r,class:c})}
/* draw fn() inside a new group so check.mjs can tell parts and dimensions apart */
function grp(attrs,fn){const g=mk('g',attrs);const prev=par;par=g;try{fn(g)}finally{par=prev}return g}
function part(x,y,w,h,fn){return grp({class:'part','data-box':[x,y,w,h].join(',')},fn||(()=>{}))}

/* begin(svg): new slide context, unique arrow + hatch ids, rounded border */
function begin(svg){
  sv=svg;par=null;sv.innerHTML='';sv.setAttribute('viewBox','0 0 '+W+' '+H);
  const n=uid++;const d=mk('defs',{});
  const m=mk('marker',{id:'ar'+n,viewBox:'0 0 10 10',refX:10,refY:5,markerWidth:16,markerHeight:16,orient:'auto-start-reverse',markerUnits:'userSpaceOnUse'},d);
  mk('path',{d:'M0,1.7 L10,5 L0,8.3 z',class:'arrow'},m);
  const pt=mk('pattern',{id:'hat'+n,width:12,height:12,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'},d);
  mk('line',{x1:0,y1:0,x2:0,y2:12,class:'hl'},pt);
  A='url(#ar'+n+')';HAT='url(#hat'+n+')';
  rr(24,24,W-48,H-48,28,'border');
  return sv;
}

/* ---------- upstream helpers, offsets scaled by G, each in its own g.dim ---------- */
function dimH(x1,x2,y,e1,e2,l,o){o=o||{};grp({class:'dim'},()=>{
  [[x1,e1],[x2,e2]].forEach(([x,e])=>{if(e==null)return;const s=Math.sign(y-e)||1;mk('line',{x1:x,y1:e+s*3*G,x2:x,y2:y+s*5*G,class:'ext'})});
  if(x2-x1>=28*G)mk('line',{x1,y1:y,x2,y2:y,class:'dl','marker-start':A,'marker-end':A});
  else{mk('line',{x1:x1-13*G,y1:y,x2:x1,y2:y,class:'dl','marker-end':A});mk('line',{x1:x2+13*G,y1:y,x2:x2,y2:y,class:'dl','marker-end':A});mk('line',{x1,y1:y,x2,y2:y,class:'dl'})}
  if(l)tx((x1+x2)/2+(o.dx||0),(o.below?y+13*G:y-4*G)+(o.dy||0),l,o.c||'dt',{'text-anchor':'middle'})})}
function dimV(y1,y2,x,e1,e2,l,o){o=o||{};grp({class:'dim'},()=>{
  [[y1,e1],[y2,e2]].forEach(([y,e])=>{if(e==null)return;const s=Math.sign(x-e)||1;mk('line',{x1:e+s*3*G,y1:y,x2:x+s*5*G,y2:y,class:'ext'})});
  if(y2-y1>=28*G)mk('line',{x1:x,y1,x2:x,y2,class:'dl','marker-start':A,'marker-end':A});
  else{mk('line',{x1:x,y1:y1-13*G,x2:x,y2:y1,class:'dl','marker-end':A});mk('line',{x1:x,y1:y2+13*G,x2:x,y2:y2,class:'dl','marker-end':A});mk('line',{x1:x,y1,x2:x,y2,class:'dl'})}
  const c=(y1+y2)/2;if(!l)return;
  if(o.side){const r=o.side==='r';tx(r?x+6*G:x-6*G,c+9,l,o.c||'dt',{'text-anchor':r?'start':'end'})}
  else tx(x-5*G,c,l,o.c||'dt',{'text-anchor':'middle',transform:'rotate(-90 '+(x-5*G)+' '+c+')'})})}
function callout(px,py,ex,ey,l,dir,c){const s=dir||(ex>=px?1:-1);grp({class:'dim'},()=>{
  mk('circle',{cx:px,cy:py,r:4.5,class:'dot'});
  mk('polyline',{points:px+','+py+' '+ex+','+ey+' '+(ex+s*10*G)+','+ey,class:'lead'});
  tx(ex+s*14*G,ey+9,l,c||'dts',{'text-anchor':s>0?'start':'end'})})}
/* nb: numbered note marker. With (tx,ty) it gets a leader to the feature it labels. */
function nb(x,y,n,lx,ly){if(lx!=null)grp({class:'dim'},()=>{const dx=lx-x,dy=ly-y,k=17/Math.max(Math.abs(dx),Math.abs(dy),1);
    mk('line',{x1:x+dx*k,y1:y+dy*k,x2:lx,y2:ly,class:'lead'});mk('circle',{cx:lx,cy:ly,r:4.5,class:'dot'})});
  part(x-17,y-17,34,34,()=>{mk('rect',{x:x-17,y:y-17,width:34,height:34,class:'nb'});tx(x,y+8,String(n),'nbt',{'text-anchor':'middle'})})}
function detailRef(cx,cy,r,lbl,lx,ly){mk('circle',{cx,cy,r,class:'ph'});const a=Math.atan2(ly-cy,lx-cx);
  grp({class:'dim'},()=>{mk('line',{x1:cx+r*Math.cos(a),y1:cy+r*Math.sin(a),x2:lx,y2:ly,class:'lead'});
  tx(lx+(lx<cx?-10:10),ly+9,lbl,'dts',{'text-anchor':lx<cx?'end':'start'})})}
function title(x,y,t,s){tx(x,y,t,'vt',{'text-anchor':'middle'});if(s)tx(x,y+38,s,'dts',{'text-anchor':'middle'})}

/* notes([[n,text],...],{x,y,gap}); n=0 for an unnumbered line. Long lines: pass an array of strings. */
function notes(list,o){o=o||{};const NX=o.x||M+24,NY=o.y||120,gap=o.gap||52;
  tx(NX,NY,'NOTES:','nth');tx(NX+150,NY,'(UNLESS OTHERWISE SPECIFIED)','nt',{style:'font-size:24px'});
  let y=NY+70;list.forEach(([n,t])=>{const lines=Array.isArray(t)?t:[t];
    lines.forEach((ln,i)=>{if(n&&i===0)nb(NX+17,y-10,n);tx(NX+(n?52:0),y,ln,'nt');y+=gap*0.8});y+=gap*0.4});return y}

/* table(x,y,title,[[code,variable,value],...]); each row carries data-code, each cell is a g.part */
function table(x,y,ttl,rows,ws){ws=ws||[150,430,360];const rh=56;tx(x,y-20,ttl,'vt');
  const all=[['CODE','VARIABLE','VALUE']].concat(rows);
  all.forEach((r,i)=>{let cx=x;grp(i?{'data-code':r[0]}:{},()=>{
    r.forEach((c,j)=>{const X=cx,Y=y+i*rh;part(X,Y,ws[j],rh,()=>{mk('rect',{x:X,y:Y,width:ws[j],height:rh,class:'thin'});
      tx(X+(j?ws[j]/2:14),Y+37,c,i?'tc':'th',{'text-anchor':j?'middle':'start'})});cx+=ws[j]})})});
  return y+all.length*rh+60}

/* ---------- process parts ---------- */
/* slot kinds: fill = new every job (dashed), fixed = same every job (gray), ref = reference examples (dotted gray).
   o.suffix=false hides the " · KIND" suffix (use on detail sheets where the kind is already stated).
   o.avoid=true marks a word shown as the thing to AVOID, so spec-check does not flag it as banned. */
function slot(x,y,w,h,label,kind,o){o=o||{};const k=kind||'fill',c={fill:'slot',fixed:'slot-fixed',ref:'slot-ref'}[k];
  const g=part(x,y,w,h,()=>{mk('rect',{x,y,width:w,height:h,rx:10,class:c});
    tx(x+w/2,y+h/2+9,label+(o.suffix===false?'':' · '+k.toUpperCase()),o.cls||'sl',{'text-anchor':'middle'})});
  if(o.avoid)g.setAttribute('data-avoid','');return g}
function stage(x,y,w,h,label,sub){part(x,y,w,h,()=>{mk('rect',{x,y,width:w,height:h,rx:18,class:'stage'});
  tx(x+w/2,y+h/2+(sub?-6:9),label,'slb',{'text-anchor':'middle'});
  if(sub)tx(x+w/2,y+h/2+32,sub,'dts',{'text-anchor':'middle'})})}
function flow(x1,y1,x2,y2,label,o){o=o||{};
  if(!label){mk('line',{x1,y1,x2,y2,class:'flowl','marker-end':A});return}
  const vert=Math.abs(x2-x1)<Math.abs(y2-y1)*0.3;
  mk('line',{x1,y1,x2,y2,class:'flowl','marker-end':A});
  if(vert&&o.dx==null)tx((x1+x2)/2+18,(y1+y2)/2+9+(o.dy||0),label,'dts',{'text-anchor':'start'});
  else tx((x1+x2)/2+(o.dx||0),(y1+y2)/2+(o.dy!=null?o.dy:-14),label,'dts',{'text-anchor':'middle'})}
/* gate: hatched keep-out. Means one thing only: the owner approves before anything crosses. */
function gate(x,y,w,h,label){mk('rect',{x,y,width:w,height:h,rx:10,class:'gatebox',fill:HAT});
  const lw=Math.min(w-24,label.length*19+48);
  part(x+(w-lw)/2,y+h/2-24,lw,48,()=>{mk('rect',{x:x+(w-lw)/2,y:y+h/2-24,width:lw,height:48,rx:8,class:'obj'});
    tx(x+w/2,y+h/2+9,label,'slb',{'text-anchor':'middle'})})}
/* struck: a part the drawing rejects. Dashed box crossed out, label underneath (never the hatch, which means approval). */
function struck(x,y,w,h,label,sub){part(x,y,w,h,()=>{mk('rect',{x,y,width:w,height:h,rx:10,class:'thin'})});
  mk('line',{x1:x+10,y1:y+10,x2:x+w-10,y2:y+h-10,class:'thin'});mk('line',{x1:x+w-10,y1:y+10,x2:x+10,y2:y+h-10,class:'thin'});
  tx(x+w/2,y+h+38,label,'slb',{'text-anchor':'middle'});if(sub)tx(x+w/2,y+h+74,sub,'dts',{'text-anchor':'middle'})}
/* box: a plain labeled box with no slot or stage meaning (a note, a test, a reason).
   lines = [text, ...] or [[text, cls], ...] to mix a bold title with a gray subline */
function box(x,y,w,h,lines,cls){part(x,y,w,h,()=>{mk('rect',{x,y,width:w,height:h,rx:10,class:'thin'});
  const n=lines.length,lh=36;lines.forEach((l,i)=>{const [t,c]=Array.isArray(l)?l:[l,cls||'dts'];tx(x+w/2,y+h/2+9+(i-(n-1)/2)*lh,t,c,{'text-anchor':'middle'})})})}
/* tbd box: a value only the owner can set, or a number not yet measured */
function tbd(x,y,w,h,label){part(x,y,w,h,()=>{mk('rect',{x,y,width:w,height:h,rx:10,class:'tbdbox'});tx(x+w/2,y+h/2+9,label+' = [TBD]','dt',{'text-anchor':'middle'})})}
/* formula line, mono, e.g. "OUT1 = G1( SK1( IN1 + K3 ) )" */
function formula(x,y,s,o){return tx(x,y,s,'dt',Object.assign({'text-anchor':'middle',style:'font-size:'+((o&&o.size)||34)+'px'},o&&o.attrs))}
/* exploded layer stack: layers = [[name, sub], ...] bottom to top. Projection from upstream: matrix(.94s,.17s,-.34s,.47s,tx,ty-z).
   Labels read "L0 · NAME" unless o.noPrefix (use when the names already carry codes). */
function layers(cx,cy,list,o){o=o||{};const s=o.s||1,w=o.w||420,h=o.h||300,gap=o.gap||118;
  list.forEach(([name,sub],i)=>{const z=i*gap;const g=mk('g',{transform:`matrix(${.94*s},${.17*s},${-.34*s},${.47*s},${cx},${cy-z})`});
    mk('rect',{x:-w/2,y:-h/2,width:w,height:h,rx:22,class:i===list.length-1?'well':'obj',style:'vector-effect:non-scaling-stroke'},g);
    if(o.noLabels)return;
    const lx=o.labelX||M+30,ly=cy-z+6;
    grp({class:'dim'},()=>{mk('line',{x1:o.lineX||lx+320,y1:ly,x2:cx-w*.3*s,y2:ly,class:'lead'});mk('circle',{cx:cx-w*.3*s,cy:ly,r:4.5,class:'dot'})});
    tx(lx,ly-8,(o.noPrefix?'':'L'+i+' · ')+name,'slb');if(sub)tx(lx,ly+30,sub,'dts')})}
/* key plan: which sheet of the set this is (drafting convention) */
function keyPlan(x,y,total,active){for(let i=0;i<total;i++){const r=mk('rect',{x:x+i*32,y,width:26,height:20,rx:3,class:i===active?'gatebox':'thin'});if(i===active)r.setAttribute('fill',HAT)}}

/* frame: slide chrome. opts {dwg, n, total, view, sub, viewY, series} */
function frame(o){const fy=H-60;
  tx(M+10,fy,o.dwg+'  |  '+(o.series||'SPEC SHEET'),'foot');
  keyPlan(W-M-10-o.total*32,fy-22,o.total,o.n-1);
  tx(W-M-20-o.total*32,fy,'SHT '+o.n+' OF '+o.total,'footb',{'text-anchor':'end'});
  if(o.view)title(W/2,o.viewY||H-150,o.view,o.sub)}

/* closeSheet: the last sheet of every episode, one fixed pattern.
   o = { question:[1-3 lines], brand:{name,url}, dwg, n, total }
   The next episode, the sources and the checked date are read only from window.EPISODE (episode.json:
   close.next, sources, checked); passing them in o throws, so the sheet and the claims ledger cannot drift.
   close.next = null draws the season-end variant from close.end.
   Throws if the content would run into the footer, so render fails loudly instead of overlapping. */
function closeSheet(o){const C=W/2,E=window.EPISODE||{},EC=E.close||{};
  for(const k of ['next','sources','checked','end'])if(k in o)throw new Error(`closeSheet: "${k}" comes from episode.json only, so the sheet and the claims ledger cannot drift`);
  const next=EC.next,sources=E.sources||[],checked=E.checked;
  sources.forEach(s=>{if(!s.label||!String(s.label).trim())throw new Error('closeSheet: source '+s.n+' has no label')});
  if(next===undefined)throw new Error('closeSheet: set close.next in episode.json (or null for the season end)');
  if(!checked)throw new Error('closeSheet: set checked (YYYY-MM-DD) in episode.json');
  const q=o.question;if(!q||q.length<1||q.length>3)throw new Error('closeSheet: question must be 1 to 3 lines');
  const qy=q.length===3?190:240;
  q.forEach((l,i)=>tx(C,qy+i*100,l,'hero',{'text-anchor':'middle'}));
  const y0=qy+(q.length-1)*100+90;
  mk('line',{x1:M+40,y1:y0,x2:W-M-40,y2:y0,class:'thin'});
  let yn;
  if(next){tx(C,y0+66,'NEXT · '+next.day,'slb',{'text-anchor':'middle'});
    next.title.forEach((l,i)=>tx(C,y0+120+i*46,l,'vt',{'text-anchor':'middle'}));
    yn=y0+120+(next.title.length-1)*46+44;tx(C,yn,next.no,'dt',{'text-anchor':'middle'})}
  else{const end=EC.end||{line:'END OF SEASON',sub:''};
    tx(C,y0+80,end.line,'vt',{'text-anchor':'middle'});yn=y0+80;if(end.sub){yn+=44;tx(C,yn,end.sub,'dts',{'text-anchor':'middle'})}}
  const ys=yn+76;
  mk('line',{x1:M+40,y1:ys-40,x2:W-M-40,y2:ys-40,class:'thin'});
  tx(M+40,ys,'SOURCES','th');tx(W-M-40,ys,'CHECKED '+checked,'dts',{'text-anchor':'end'});
  let y=ys+50;
  if(!sources.length){tx(M+40,y,'NONE. THIS SET STATES NO OUTSIDE FACTS.','dts');y+=40}
  else sources.forEach(s=>{nb(M+57,y-9,s.n);tx(M+96,y,s.label,'dts');if(s.where){tx(M+96,y+34,s.where,'dt',{style:'font-size:24px'});y+=34}y+=54});
  const by=Math.max(y+70,1130);
  if(by+44>H-90)throw new Error(`closeSheet: content runs to y ${by+44}, past the footer. Shorten the question, the next title, or drop the "where" lines`);
  grp({class:'brand'},()=>{tx(C,by,o.brand.name,'vtb',{'text-anchor':'middle'});tx(C,by+44,o.brand.url,'dts',{'text-anchor':'middle'})});
  frame({dwg:o.dwg,n:o.n,total:o.total});
}

window.SpecKit={W,H,M,G,mk,tx,rr,grp,part,box,begin,dimH,dimV,callout,nb,detailRef,title,notes,table,slot,stage,flow,gate,struck,tbd,formula,layers,keyPlan,frame,closeSheet,get hatch(){return HAT},get arrow(){return A}};
})();
