import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9401;
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',
  '--remote-debugging-port='+PORT,'--disable-frame-rate-limit','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await sleep(2200);
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws=new WebSocket(list[0].webSocketDebuggerUrl);
let id=0; const pend=new Map(); const events=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.id&&pend.has(m.id)){pend.get(m.id)(m); pend.delete(m.id);}
  else if(m.method) events.push(m);};
const send=(method,params={})=>new Promise(res=>{const i=++id; pend.set(i,res); ws.send(JSON.stringify({id:i,method,params}));});
await new Promise(r=>ws.onopen=r);
await send('Page.enable');
await send('Runtime.enable');
// 移动端竖屏视口，dpr 拉到接近 1080 宽
const W=390,H=844,DPR=2.77;
await send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:DPR,mobile:true,screenWidth:W,screenHeight:H});
await send('Page.navigate',{url:'file:///Users/daijingyi/Desktop/软糖动效素材包/_work/dist/index.html'});
await sleep(3500);
const dim=await send('Runtime.evaluate',{expression:'innerWidth+"x"+innerHeight+" dpr="+devicePixelRatio',returnByValue:true});
console.log('viewport:',dim.result.result.value);
// 帧捕获：连拍
let frames=[];
const t0=Date.now();
for(let i=0;i<20;i++){
  const r=await send('Page.captureScreenshot',{format:'jpeg',quality:92});
  frames.push(r.result.data.length);
  await sleep(20);
}
console.log('20 shot bytes avg:',Math.round(frames.reduce((a,b)=>a+b,0)/frames.length/1024)+'KB');
console.log('elapsed for 20 shots:',Date.now()-t0,'ms');
// 试一次合成点击
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:200,y:1400,button:'left',clickCount:1});
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:200,y:1400,button:'left',clickCount:1});
await sleep(500);
console.log('click dispatched ok');
ws.close(); chrome.kill();
