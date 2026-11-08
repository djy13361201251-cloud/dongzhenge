import { spawn } from 'node:child_process';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9463;
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
await send('Page.navigate',{url:'http://127.0.0.1:8899/index.html?v=3'});
await sleep(1200);
await send('Emulation.setDeviceMetricsOverride',{width:1400,height:1000,deviceScaleFactor:1,mobile:false});
await sleep(300);
await send('Runtime.evaluate',{expression:'window.dispatchEvent(new Event("resize"))'});
await sleep(2200);
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) return {__err:r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text};
  return r.result?.result?.value;};
for(let i=0;i<40;i++){ if(await ev('typeof window.GRIDKIT')==='object') break; await sleep(200); }

await ev(`window.GRIDKIT.S.count=12;window.GRIDKIT.S.cols=4;window.GRIDKIT.S.rows=3;window.GRIDKIT.S.overKey=''`);
await sleep(400);
await ev(`(async function(){
  function load(u,n){return new Promise(function(res,rej){var x=new XMLHttpRequest();x.open('GET',u);x.responseType='blob';
    x.onload=function(){res(new File([x.response],n,{type:'image/png'}))};x.onerror=rej;x.send();});}
  var a=await load('/t_wide.png','a.png'), b=await load('/t_tall.png','b.png');
  var dt=new DataTransfer(); for(var k=0;k<4;k++){dt.items.add(a);dt.items.add(b)}
  var i=document.getElementById('fileall'); i.files=dt.files; i.dispatchEvent(new Event('change')); return dt.files.length;})()`);
await sleep(2500);
console.log('gal:', await ev(`document.querySelectorAll('#gallery .gwrap').length`));

const bind = await ev(`(function(){
  var G=window.GRIDKIT, cv=document.getElementById('cv'), log=[];
  var n=document.querySelectorAll('#gallery .gwrap').length;
  for(var k=0;k<n;k++){
    var R=G.getRects(); if(k>=R.length) break;
    var r=R[k], cr=cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('click',{clientX:cr.left+(r.x+r.w/2)*cr.width/cv.width,clientY:cr.top+(r.y+r.h/2)*cr.height/cv.height,bubbles:true}));
    var bs=document.querySelectorAll('#popImgList .pimgwrap .pimg');
    log.push('k'+k+' thumbs'+bs.length);
    if(!bs.length) break;
    bs[k%bs.length].click();
  }
  return log;
})()`);
console.log('bind log:', JSON.stringify(bind));
await sleep(800);
console.log('pin:', JSON.stringify(await ev('window.GRIDKIT.debugPin()')));
console.log('over keys:', await ev('Object.keys(window.GRIDKIT.S.over).map(function(k){return k+"="+(window.GRIDKIT.S.over[k].aid||"-")}).join(",")'));
await ev(`document.getElementById('relay').click()`);
await sleep(900);
console.log('relay后 pin:', JSON.stringify(await ev('window.GRIDKIT.debugPin()')));
console.log('relay后 over:', await ev('Object.keys(window.GRIDKIT.S.over).map(function(k){return k+"="+(window.GRIDKIT.S.over[k].aid||"-")}).join(",")'));
ws.close(); chrome.kill();
