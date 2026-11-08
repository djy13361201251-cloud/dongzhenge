import { spawn } from 'node:child_process';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9433;
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
await sleep(3000);
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) return {__err:r.result.exceptionDetails.exception?.description};
  return r.result?.result?.value;};
console.log(JSON.stringify(await ev(`(function(){
  var cv=document.getElementById('cv'), st=cv.parentElement;
  var cs=getComputedStyle(cv), ss=getComputedStyle(st);
  return {cvStyle:{w:cv.style.width,h:cv.style.height}, cvRect:cv.getBoundingClientRect().toJSON(),
    stage:{cls:st.className,w:st.clientWidth,h:st.clientHeight,disp:ss.display},
    desk:(function(){var d=document.querySelector('.desk'); return d?{w:d.clientWidth,h:d.clientHeight,disp:getComputedStyle(d).display}:null})(),
    main:(function(){var d=document.querySelector('.main'); return d?{w:d.clientWidth,h:d.clientHeight,disp:getComputedStyle(d).display}:null})(),
    body:{cls:document.body.className, w:document.body.clientWidth, h:document.body.clientHeight}};
})()`),null,1));
ws.close(); chrome.kill();
