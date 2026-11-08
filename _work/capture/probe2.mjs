import { spawn } from 'node:child_process';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9411;
const W=390,H=844,DPR=3;
const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--hide-scrollbars',
  '--window-size='+W+','+H,
  '--force-device-scale-factor=1',
  '--remote-debugging-port='+PORT,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await sleep(2500);
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws=new WebSocket(list[0].webSocketDebuggerUrl);
let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m); pend.delete(m.id);}};
const send=(m,p={})=>new Promise(res=>{const i=++id; pend.set(i,res); ws.send(JSON.stringify({id:i,method:m,params:p}));});
await new Promise(r=>ws.onopen=r);
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:DPR,mobile:true,screenWidth:W,screenHeight:H});
await sleep(600);
const d1=await send('Runtime.evaluate',{expression:'innerWidth+"x"+innerHeight+" dpr="+devicePixelRatio',returnByValue:true});
console.log('after emulation (before nav):',d1.result.result.value);
await send('Page.navigate',{url:'file:///Users/daijingyi/Desktop/软糖动效素材包/_work/dist/index.html'});
await sleep(3000);
const d2=await send('Runtime.evaluate',{expression:'innerWidth+"x"+innerHeight+" dpr="+devicePixelRatio',returnByValue:true});
console.log('after nav:',d2.result.result.value);
const s=await send('Page.captureScreenshot',{format:'jpeg',quality:92});
console.log('shot KB:',Math.round(s.result.data.length*3/4/1024));
const meta=await send('Page.getLayoutMetrics');
console.log('layout viewport:',JSON.stringify(meta.result.cssVisualViewport));
ws.close(); chrome.kill();
