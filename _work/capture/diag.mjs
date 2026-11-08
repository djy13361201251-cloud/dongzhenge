import { spawn } from 'node:child_process';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9457;
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--remote-debugging-port='+PORT,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await sleep(2200);
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws=new WebSocket(list[0].webSocketDebuggerUrl);
let id=0;const pend=new Map();const logs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}
  else if(m.method==='Runtime.consoleAPICalled'){logs.push(m.params.args.map(a=>a.value).join(' '));}
  else if(m.method==='Runtime.exceptionThrown'){logs.push('EXC '+JSON.stringify(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));}};
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

await ev(`window.GRIDKIT.S.count=12;window.GRIDKIT.S.cols=4;window.GRIDKIT.S.rows=3;window.GRIDKIT.S.overKey=''`);
await sleep(400);
await ev(`(async function(){
  function load(u,n){return new Promise(function(res,rej){var x=new XMLHttpRequest();x.open('GET',u);x.responseType='blob';
    x.onload=function(){res(new File([x.response],n,{type:'image/png'}))};x.onerror=rej;x.send();});}
  var a=await load('/t_wide.png','a.png'), b=await load('/t_tall.png','b.png');
  var dt=new DataTransfer(); for(var k=0;k<3;k++){dt.items.add(a);dt.items.add(b)}
  var i=document.getElementById('fileall'); i.files=dt.files; i.dispatchEvent(new Event('change')); return dt.files.length;})()`);
await sleep(2000);

// 只贴 2 张
await ev(`(function(){
  var G=window.GRIDKIT, cv=document.getElementById('cv');
  for(var k=0;k<2;k++){
    var R=G.getRects(), r=R[k], cr=cv.getBoundingClientRect();
    cv.dispatchEvent(new MouseEvent('click',{clientX:cr.left+(r.x+r.w/2)*cr.width/cv.width,clientY:cr.top+(r.y+r.h/2)*cr.height/cv.height,bubbles:true}));
    var bs=document.querySelectorAll('#popImgList .pimgwrap .pimg');
    bs[k].click();
  }
  return 'ok';
})()`);
await sleep(600);
const D=`(function(){var G=window.GRIDKIT,S=G.S;
  var aids=Object.keys(S.over).map(function(k){return k+':'+(S.over[k].aid||'-')});
  return {overKey:S.overKey, aids:aids, count:S.count, seed:S.seed};})()`;
console.log('A 贴2张:', JSON.stringify(await ev(D)));

await ev(`document.getElementById('relay').click()`);
await sleep(600);
console.log('B 换排列后:', JSON.stringify(await ev(D)));
await sleep(600);
console.log('B+ 再等:', JSON.stringify(await ev(D)));

await ev(`document.getElementById('draw').click()`);
await sleep(800);
console.log('C 抽卡后:', JSON.stringify(await ev(D)));

console.log('errors:', JSON.stringify(logs.slice(0,5)));
ws.close(); chrome.kill();
