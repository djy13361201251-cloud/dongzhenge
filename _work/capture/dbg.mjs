import { spawn } from 'node:child_process';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9431;
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--remote-debugging-port='+PORT,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await sleep(2200);
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws=new WebSocket(list[0].webSocketDebuggerUrl);
let id=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await new Promise(r=>ws.onopen=r);
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://127.0.0.1:8899/index.html'});
await sleep(2800);
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) return {__err:r.result.exceptionDetails.exception?.description};
  return r.result?.result?.value;};
console.log('errcap:', await ev(`window.__e=[]; window.addEventListener('error',function(e){window.__e.push(String(e.error&&e.error.stack||e.message))}); 'ok'`));
console.log('rects:', await ev(`(function(){var R=window.GRIDKIT.getRects(); var cv=document.getElementById('cv'); var cr=cv.getBoundingClientRect(); return {n:R.length, r0:R[0], cr:{l:cr.left,t:cr.top,w:cr.width,h:cr.height}, cw:cv.width, ch:cv.height}})()`));
console.log('els:', await ev(`(function(){return {inspPop:!!document.getElementById('inspPop'), popFields:!!document.getElementById('popFields'), popType:!!document.getElementById('popType'), popImgRow:!!document.getElementById('popImgRow'), popImgList:!!document.getElementById('popImgList'), paneWrap:!!document.getElementById('paneWrap')}})()`));
console.log('click:', await ev(`(function(){
  var G=window.GRIDKIT, cv=document.getElementById('cv'); var R=G.getRects(); var r=R[0];
  var cr=cv.getBoundingClientRect();
  cv.dispatchEvent(new MouseEvent('click',{clientX:cr.left+(r.x+r.w/2)*cr.width/cv.width, clientY:cr.top+(r.y+r.h/2)*cr.height/cv.height, bubbles:true}));
  return {body:document.body.className, inspHidden:document.getElementById('inspPop').hidden,
          title:document.getElementById('popTitle').textContent,
          opts:document.getElementById('popType').options.length,
          rowHidden:document.getElementById('popImgRow').hidden};
})()`));
await sleep(300);
console.log('errs:', await ev('window.__e'));
ws.close(); chrome.kill();
