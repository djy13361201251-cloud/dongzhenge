import { spawn } from 'node:child_process';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9467;
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
await send('Page.navigate',{url:'http://127.0.0.1:8899/index.html?v=9'});
await sleep(1200);
await send('Emulation.setDeviceMetricsOverride',{width:1400,height:1000,deviceScaleFactor:1,mobile:false});
await sleep(300);
await send('Runtime.evaluate',{expression:'window.dispatchEvent(new Event("resize"))'});
await sleep(2200);
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) return {__err:r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text};
  return r.result?.result?.value;};
for(let i=0;i<40;i++){ if(await ev('typeof window.GRIDKIT')==='object') break; await sleep(200); }

// 点一个格子并锁定
await ev(`(function(){var G=window.GRIDKIT,cv=document.getElementById('cv');var r=G.getRects()[0],cr=cv.getBoundingClientRect();
 cv.dispatchEvent(new MouseEvent('click',{clientX:cr.left+(r.x+r.w/2)*cr.width/cv.width,clientY:cr.top+(r.y+r.h/2)*cr.height/cv.height,bubbles:true}));return 1})()`);
await sleep(400);
console.log('锁定按钮文案:', await ev(`document.getElementById('popLock').textContent`));
await ev(`document.getElementById('popLock').click()`);
await sleep(400);
console.log('锁定后文案:', await ev(`document.getElementById('popLock').textContent`));
console.log('锁定后提示:', await ev(`document.getElementById('popHint').textContent`));
console.log('锁定格内容:', await ev(`(function(){var o=window.GRIDKIT.S.over[0]||{};return JSON.stringify({type:o.type,fill:o.fill,lock:o.lock})})()`));
await ev(`document.getElementById('draw').click()`);
await sleep(900);
console.log('抽卡后锁定格仍是:', await ev(`(function(){var o=window.GRIDKIT.S.over[0]||{};return JSON.stringify({type:o.type,fill:o.fill,lock:o.lock})})()`));
console.log('全部锁定按钮:', await ev(`(function(){var b=document.getElementById('lockAll');return b?b.textContent+' hidden='+b.hidden:'missing'})()`));
ws.close(); chrome.kill();
