/* Optional browser regression against an externally supplied saved ChatGPT page.
 * NODE_PATH must resolve Playwright. Run:
 * node tests/composer-compatibility.browser.cjs <saved-page.html>
 * Defaults to installed Edge; set GPT_THEMES_BROWSER for another executable.
 * Page scripts and external network requests are disabled.
 */
const {chromium}=require('playwright');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const snapshot=process.argv[2];
if (!snapshot) throw new Error('Pass the path to a saved ChatGPT HTML page.');
const root=path.join(__dirname,'..');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
const b=await chromium.launch({...(process.env.GPT_THEMES_BROWSER ? {executablePath:process.env.GPT_THEMES_BROWSER} : {channel:'msedge'}),headless:true});
try {
const p=await b.newPage({viewport:{width:1900,height:900},javaScriptEnabled:false});
await p.route(/^https?:/,r=>r.abort());
await p.goto(pathToFileURL(path.resolve(snapshot)).href,{waitUntil:'domcontentloaded'});
const paint=()=>p.evaluate(()=>{const q=s=>{let n=document.querySelector(s),c=getComputedStyle(n);return {bg:c.backgroundColor,radius:c.borderRadius,color:c.color}};return {dock:q('[data-thread-scroll-footer]'),layer:q('[data-thread-scroll-footer] > [aria-hidden="true"]'),shell:q('form[data-chatgpt-composer] [data-composer-surface-variant]'),editor:q('[data-composer-markdown]'),stop:q('form[data-chatgpt-composer] button[aria-label="Stop"]'),code:q('[data-markdown-copy="code-block"]')}});
await p.evaluate(()=>document.documentElement.classList.remove('cgpt-ui-enhancer-active'));const native=await paint();await p.evaluate(()=>document.documentElement.classList.add('cgpt-ui-enhancer-active'));const before=await paint();assert.equal(before.layer.bg,'rgb(33, 33, 33)');
await p.evaluate(css=>{const s=document.createElement('style');s.textContent=css;document.head.append(s)},fs.readFileSync(path.join(root,'content/injected.css'),'utf8'));
const after=await paint();assert.equal(after.layer.bg,'rgba(0, 0, 0, 0)');assert.equal(after.dock.bg,'rgba(0, 0, 0, 0)');assert.equal(after.stop.bg,before.stop.bg);
for(const file of ['shared/constants.js','content/target-registry.js','content/compatibility-probe.js']) await p.evaluate(s=>(0,eval)(s),fs.readFileSync(path.join(root,file),'utf8'));
const targets=await p.evaluate(()=>{let ns=CgptUiEnhancer;return {input:ns.findThemeTargetFromElement(document.querySelector('[data-composer-markdown]'))?.target.id,matches:ns.THEME_TARGETS.filter(t=>['composer.input','composer.surface','bottom.dock'].includes(t.id)).map(t=>({id:t.id,matches:document.querySelectorAll(t.selectors.join(',')).length})),report:ns.getCompatibilityReport()}});assert.equal(targets.input,'composer.input');
assert.equal(targets.report.composer.editor,true);assert.equal(targets.report.composer.surface,true);assert.equal(targets.report.currentUi.threadScrollFooter,true);

await p.evaluate(()=>{for(const [k,v] of Object.entries({'--cgpt-bottom-dock-bg':'rgba(100, 50, 20, 0.5)','--cgpt-composer-bg':'rgb(45, 25, 65)','--cgpt-composer-input-bg':'rgb(20, 30, 40)','--cgpt-composer-radius':'18px','--cgpt-composer-text':'rgb(230, 220, 210)'}))document.documentElement.style.setProperty(k,v,'important')});
const custom=await paint();assert.equal(custom.dock.bg,'rgba(100, 50, 20, 0.5)');assert.equal(custom.layer.bg,'rgba(0, 0, 0, 0)');assert.equal(custom.shell.bg,'rgb(45, 25, 65)');assert.equal(custom.shell.radius,'18px');assert.equal(custom.editor.bg,'rgb(20, 30, 40)');assert.equal(custom.editor.color,'rgb(230, 220, 210)');
await p.setViewportSize({width:390,height:844});const mobile=await paint();assert.equal(mobile.layer.bg,'rgba(0, 0, 0, 0)');
await p.evaluate(()=>document.documentElement.classList.remove('cgpt-ui-enhancer-active'));const disabled=await paint();assert.equal(disabled.layer.bg,native.layer.bg);
console.log('PASS: footer transparency, custom colors/radius, input selection, diagnostics, narrow viewport, disabled restoration, native Stop button.');
}finally{await b.close()}
})();
