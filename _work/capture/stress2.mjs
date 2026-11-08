import { spawn } from 'node:child_process';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9453;
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
await send('Page.navigate',{url:'http://127.0.0.1:8899/index.html'});
await sleep(1200);
await send('Emulation.setDeviceMetricsOverride',{width:1400,height:1000,deviceScaleFactor:1,mobile:false});
await sleep(300);
await send('Runtime.evaluate',{expression:'window.dispatchEvent(new Event("resize"))'});
await sleep(2200);
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) return {__err:r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text};
  return r.result?.result?.value;};
for(let i=0;i<40;i++){ if(await ev('typeof window.GRIDKIT')==='object') break; await sleep(200); }

// 先放大格子数量，方便贴 8 张
await ev(`window.GRIDKIT.S.count=12; window.GRIDKIT.S.cols=4; window.GRIDKIT.S.rows=3; window.GRIDKIT.S.overKey=''`);
await sleep(500);

// 上传 8 张
await ev(`(async function(){
  function load(u,n){return new Promise(function(res,rej){var x=new XMLHttpRequest();x.open('GET',u);x.responseType='blob';
    x.onload=function(){res(new File([x.response],n,{type:'image/png'}))};x.onerror=rej;x.send();});}
  var a=await load('/t_wide.png','a.png'), b=await load('/t_tall.png','b.png');
  var dt=new DataTransfer();
  for(var k=0;k<4;k++){ dt.items.add(a); dt.items.add(b) }
  var i=document.getElementById('fileall'); i.files=dt.files; i.dispatchEvent(new Event('change'));
  return dt.files.length;})()`);
await sleep(2500);

// 通过真实 UI：点第 k 格 → 点第 k 个素材
const bindN = await ev(`(function(){
  var G=window.GRIDKIT, cv=document.getElementById('cv');
  var n=document.querySelectorAll('#gallery .gwrap').length;
  var done=0;
  for(var k=0;k<n;k++){
    var R=G.getRects(); if(k>=R.length) break;
    var r=R[k], cr=cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('click',{clientX:cr.left+(r.x+r.w/2)*cr.width/cv.width,
      clientY:cr.top+(r.y+r.h/2)*cr.height/cv.height,bubbles:true}));
    var bs=document.querySelectorAll('#popImgList .pimgwrap .pimg');
    if(!bs.length) break;
    bs[k % bs.length].click(); done++;
  }
  return {bound:done, gal:n};
})()`);
console.log('绑定:', JSON.stringify(bindN));
await sleep(700);

const STAT=`(function(){
  var G=window.GRIDKIT,S=G.S,TY=G.getTypes();
  var gal=document.querySelectorAll('#gallery .gwrap').length;
  var drawn={},bound={};
  TY.forEach(function(t,i){ if(t==='img'){var o=S.over[i]; if(o&&o.aid) drawn[o.aid]=1} });
  Object.keys(S.over).forEach(function(k){var o=S.over[k]; if(o&&o.aid) bound[o.aid]=1});
  return {gal:gal,drawn:Object.keys(drawn).length,bound:Object.keys(bound).length,cells:TY.length,count:S.count};
})()`;
console.log('初始:', JSON.stringify(await ev(STAT)));

const steps=[
  ['relay', "document.getElementById('relay').click()"],
  ['draw',  "document.getElementById('draw').click()"],
  ['count=6',"window.GRIDKIT.S.count=6;window.GRIDKIT.S.overKey=''"],
  ['aspect1:1',"window.GRIDKIT.S.aspect='1:1';window.GRIDKIT.S.overKey=''"],
  ['aspect9:16',"window.GRIDKIT.S.aspect='9:16';window.GRIDKIT.S.overKey=''"],
  ['variance90',"window.GRIDKIT.S.variance=90;window.GRIDKIT.S.overKey=''"],
  ['cols3',"window.GRIDKIT.S.cols=3;window.GRIDKIT.S.rows=3;window.GRIDKIT.S.overKey=''"],
  ['seed',"window.GRIDKIT.S.seed+=7;window.GRIDKIT.S.overKey=''"],
  ['draw2', "document.getElementById('draw').click()"],
];
let bad=0;
for(let round=0; round<5; round++){
  for(const [name,code] of steps){
    await ev(code); await sleep(300);
    const s=await ev(STAT);
    if(s.gal>0 && s.drawn<s.gal){ bad++; console.log('  ✗ round',round,name,JSON.stringify(s)); }
  }
  console.log('round',round,'->',JSON.stringify(await ev(STAT)));
}
console.log('不合格次数:', bad);
ws.close(); chrome.kill();
