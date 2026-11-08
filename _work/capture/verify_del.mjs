import { spawn } from 'node:child_process';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9441;
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
await sleep(400);
await send('Runtime.evaluate',{expression:'window.dispatchEvent(new Event("resize"))'});
await sleep(2200);
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) return {__err:r.result.exceptionDetails.exception?.description};
  return r.result?.result?.value;};
const SNAP=`(function(){var G=window.GRIDKIT,TY=G.getTypes();
  var img=TY.map(function(t,i){return t==='img'?i:-1}).filter(function(i){return i>=0});
  var aids=Object.keys(G.S.over).map(function(k){return G.S.over[k].aid}).filter(Boolean);
  return {gal:document.querySelectorAll('#gallery .gwrap').length,img:img,aids:aids};})()`;

await ev(`(async function(){
  function load(u,n){return new Promise(function(res,rej){var x=new XMLHttpRequest();x.open('GET',u);x.responseType='blob';
    x.onload=function(){res(new File([x.response],n,{type:'image/png'}))};x.onerror=rej;x.send();});}
  var a=await load('/t_wide.png','a.png'), b=await load('/t_tall.png','b.png');
  var dt=new DataTransfer(); dt.items.add(a); dt.items.add(b);
  var i=document.getElementById('fileall'); i.files=dt.files; i.dispatchEvent(new Event('change'));
  return 1;})()`);
await sleep(1600);

// 点格子 2，选中第 1 个素材
await ev(`(function(){var G=window.GRIDKIT,cv=document.getElementById('cv');var r=G.getRects()[2],cr=cv.getBoundingClientRect();
  cv.dispatchEvent(new MouseEvent('click',{clientX:cr.left+(r.x+r.w/2)*cr.width/cv.width,clientY:cr.top+(r.y+r.h/2)*cr.height/cv.height,bubbles:true}));return 1})()`);
await sleep(400);
await ev(`document.querySelectorAll('#popImgList .pimgwrap .pimg')[0].click()`);
await sleep(700);
console.log('ready:', await ev('document.readyState+" gk="+(typeof window.GRIDKIT)'));
for(let i=0;i<30;i++){ if(await ev('typeof window.GRIDKIT')) break; await sleep(300); }
console.log('A) 绑定后:', JSON.stringify(await ev(SNAP)));

// 删掉正在用的这条素材（第 1 个）
await ev(`document.querySelectorAll('#gallery .gdel')[0].click()`);
await sleep(900);
console.log('B) 删掉在用的素材后（img 应清空该格）:', JSON.stringify(await ev(SNAP)));

// 再测：格子内直接上传（#popFileAll）
await ev(`(async function(){
  function load(u,n){return new Promise(function(res,rej){var x=new XMLHttpRequest();x.open('GET',u);x.responseType='blob';
    x.onload=function(){res(new File([x.response],n,{type:'image/png'}))};x.onerror=rej;x.send();});}
  var i=document.getElementById('popFileAll'); if(!i) return 'noinput';
  var a=await load('/t_wide.png','c.png');
  var dt=new DataTransfer(); dt.items.add(a);
  i.files=dt.files; i.dispatchEvent(new Event('change')); return 'sent';})()`);
await sleep(1500);
console.log('C) 格子内上传后（应自动贴到当前格）:', JSON.stringify(await ev(SNAP)));
console.log('   当前选中格:', await ev(`(function(){var G=window.GRIDKIT,TY=G.getTypes();
  var ix=-1;Object.keys(G.S.over).forEach(function(k){if(G.S.over[k].aid) ix=+k}); return ix})()`));
console.log('errcap:', JSON.stringify(await ev(`window.__e||[]`)));
ws.close(); chrome.kill();
