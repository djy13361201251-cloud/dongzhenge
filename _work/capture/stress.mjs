import { spawn } from 'node:child_process';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9451;
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
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
await sleep(300);
await send('Runtime.evaluate',{expression:'window.dispatchEvent(new Event("resize"))'});
await sleep(2200);
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) return {__err:r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text};
  return r.result?.result?.value;};
for(let i=0;i<40;i++){ if(await ev('typeof window.GRIDKIT')==='object') break; await sleep(200); }

// 上传 12 张，每张不同颜色
await ev(`(async function(){
  function load(u,n){return new Promise(function(res,rej){var x=new XMLHttpRequest();x.open('GET',u);x.responseType='blob';
    x.onload=function(){res(new File([x.response],n,{type:'image/png'}))};x.onerror=rej;x.send();});}
  var a=await load('/t_wide.png','a.png'), b=await load('/t_tall.png','b.png');
  var dt=new DataTransfer();
  for(var k=0;k<6;k++){ dt.items.add(a); dt.items.add(b) }
  var i=document.getElementById('fileall'); i.files=dt.files; i.dispatchEvent(new Event('change'));
  return dt.files.length;})()`);
await sleep(3000);

const STAT=`(function(){
  var G=window.GRIDKIT,S=G.S,TY=G.getTypes();
  var gal=document.querySelectorAll('#gallery .gwrap').length;
  var drawn={}; TY.forEach(function(t,i){ if(t==='img'){ var o=S.over[i]; if(o&&o.aid) drawn[o.aid]=1 } });
  var bound={}; Object.keys(S.over).forEach(function(k){var o=S.over[k]; if(o&&o.aid) bound[o.aid]=1});
  return {gal:gal,drawn:Object.keys(drawn).length,bound:Object.keys(bound).length,cells:TY.length,count:S.count};
})()`;
console.log('上传12张后:', JSON.stringify(await ev(STAT)));

// 把每张素材都贴到某一格（模拟用户逐个指定）
await ev(`(function(){
  var G=window.GRIDKIT,S=G.S,TY=G.getTypes();
  var TY2=G.getTypes();
  // 直接经内部入口：每张都 pin，让它自动安置
  return 1;})()`);

// 压力循环：换排列 / 抽卡 / 改参数
const steps=[
  ['relay', "document.getElementById('relay').click()"],
  ['draw',  "document.getElementById('draw').click()"],
  ['cols=5',"window.GRIDKIT.S.cols=5;window.GRIDKIT.S.overKey=''"],
  ['rows=3',"window.GRIDKIT.S.rows=3;window.GRIDKIT.S.overKey=''"],
  ['count=6',"window.GRIDKIT.S.count=6;window.GRIDKIT.S.overKey=''"],
  ['aspect',"window.GRIDKIT.S.aspect='1:1';window.GRIDKIT.S.overKey=''"],
  ['variance',"window.GRIDKIT.S.variance=90;window.GRIDKIT.S.overKey=''"],
  ['count=28',"window.GRIDKIT.S.count=28;window.GRIDKIT.S.overKey=''"],
];
let bad=0;
for(let round=0; round<6; round++){
  for(const [name,code] of steps){
    await ev(code); await sleep(260);
    const s=await ev(STAT);
    const ok = s.drawn===s.gal && s.gal>0;
    if(!ok && s.gal>0){ bad++; console.log('  ✗', round, name, JSON.stringify(s)); }
  }
  const s=await ev(STAT);
  console.log('round',round,'->',JSON.stringify(s), (s.drawn===s.gal?'OK':'MISSING '+(s.gal-s.drawn)));
}
console.log('总计不合格次数:', bad);
ws.close(); chrome.kill();
