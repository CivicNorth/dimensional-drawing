/* Shared loader for spec-render and spec-check: open an episode's slides.html with bundled fonts,
   the kit, and window.EPISODE (episode.json) injected, then draw it. Throws with a plain reason. */
import {chromium} from 'playwright-core';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';import crypto from 'node:crypto';

const require=createRequire(import.meta.url);
export const KIT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','kit');

const CHROME=[process.env.CHROMIUM_PATH,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'];
function chromePath(explicit){return [explicit,...CHROME].filter(Boolean).find(p=>fs.existsSync(p))}
const font=(pkg,file)=>pathToFileURL(path.join(path.dirname(require.resolve(pkg+'/package.json')),'files',file)).href;
const FONTS=()=>`
@font-face{font-family:'Arimo';font-weight:400;src:url(${font('@fontsource/arimo','arimo-latin-400-normal.woff2')}) format('woff2')}
@font-face{font-family:'Arimo';font-weight:700;src:url(${font('@fontsource/arimo','arimo-latin-700-normal.woff2')}) format('woff2')}
@font-face{font-family:'JetBrains Mono';font-weight:400;src:url(${font('@fontsource/jetbrains-mono','jetbrains-mono-latin-400-normal.woff2')}) format('woff2')}`;

/* Repo-level rules: the nearest spec-sheet.rules.json in a folder ABOVE the episode folder.
   Thresholds live there (reviewed, versioned with the repo), never with an episode. A rules file inside
   the episode folder is reported, never used. */
export function readRules(dir){const ep=path.resolve(dir);const inside=fs.existsSync(path.join(ep,'spec-sheet.rules.json'));
  let d=path.dirname(ep);
  for(;;){const f=path.join(d,'spec-sheet.rules.json');if(fs.existsSync(f)){let rules,error=null;try{rules=JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){rules={};error=e.message}return {file:f,rules,inside,error}}
    const up=path.dirname(d);if(up===d)return {file:null,rules:{},inside};d=up}}

/* Remove generated outputs so a failed run can never leave an older passing result behind. */
export function clearOutputs(dir,{keepCheck=false}={}){const out=path.join(dir,'out');if(!fs.existsSync(out))return;
  for(const f of fs.readdirSync(out))if(/^(slide|phone)-\d+\.png$|\.pdf$|^contact\.png$|^render\.json$/.test(f)||(!keepCheck&&f==='check.json'))fs.rmSync(path.join(out,f))}

/* Hash of everything that decides the drawing, so check.json shows exactly what it checked. */
export function inputHash(dir,extra=[]){const h=crypto.createHash('sha256');
  for(const f of ['slides.html','episode.json','caption.md'].map(x=>path.join(dir,x)).concat([path.join(KIT,'spec-kit.js'),path.join(KIT,'spec-kit.css')],extra))
    if(f&&fs.existsSync(f)){h.update(path.basename(f));h.update(fs.readFileSync(f))}
  return h.digest('hex')}

export function readEpisode(dir){
  const slides=path.join(dir,'slides.html');
  if(!fs.existsSync(slides))throw new Error('no slides.html in '+dir);
  const ej=path.join(dir,'episode.json');
  const ep=fs.existsSync(ej)?JSON.parse(fs.readFileSync(ej,'utf8')):null;
  const dwg=((ep&&ep.dwg)||path.basename(dir)).replace(/[^A-Za-z0-9-]/g,'');
  return {slides,ep,dwg};
}

export async function openEpisode(dir,{chrome}={}){
  const {slides,ep,dwg}=readEpisode(dir);
  const exe=chromePath(chrome);
  if(!exe&&!process.env.PLAYWRIGHT_BROWSERS_PATH)throw new Error('no Chrome or Chromium found. Install one, or set CHROMIUM_PATH to its executable');
  const browser=await chromium.launch(exe?{executablePath:exe}:{});
  const page=await browser.newPage({viewport:{width:1080,height:1350},deviceScaleFactor:1});
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.goto(pathToFileURL(slides).href,{waitUntil:'load'});
  await page.addStyleTag({content:FONTS()});
  await page.addStyleTag({path:path.join(KIT,'spec-kit.css')});
  await page.evaluate(e=>{window.EPISODE=e||{}},ep);
  await page.addScriptTag({path:path.join(KIT,'spec-kit.js')});
  try{
    await page.evaluate(async()=>{
      await document.fonts.load("400 30px Arimo");await document.fonts.load("700 30px Arimo");await document.fonts.load("400 30px 'JetBrains Mono'");
      if(typeof window.drawEpisode!=='function')throw new Error('slides.html must define window.drawEpisode(K)');
      window.drawEpisode(window.SpecKit);await document.fonts.ready});
  }catch(e){await browser.close();throw new Error('drawing failed: '+e.message.split('\n')[0])}
  if(errs.length){await browser.close();throw new Error('script error: '+errs.join(' | '))}
  const fontsOk=await page.evaluate(()=>document.fonts.check("30px Arimo")&&document.fonts.check("30px 'JetBrains Mono'"));
  if(!fontsOk){await browser.close();throw new Error('bundled fonts did not load; output would silently fall back to a system font')}
  return {browser,page,ep,dwg};
}

export async function slideSizes(page){
  return page.$$eval('section.slide',s=>s.map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)]}));
}
