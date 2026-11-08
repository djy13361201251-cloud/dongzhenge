import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9427;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(2200);
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await new Promise(r => ws.onopen = r);
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8899/index.html' });
await sleep(1200);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(400);
await send('Runtime.evaluate', { expression: 'window.dispatchEvent(new Event("resize"))' });
await sleep(2200);

const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const ex = r.result?.exceptionDetails;
  if (ex) return { __err: ex.text, d: ex.exception?.description };
  return r.result?.result?.value;
};

await ev(`window.__errs=[]; window.addEventListener('error',function(e){window.__errs.push(String(e.message))}); 1`);

// ---- 1. 真实上传（素材面板）
const up = await ev(`
(async function(){
  function load(url,name){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest(); x.open('GET',url); x.responseType='blob';
      x.onload=function(){ res(new File([x.response],name,{type:'image/png'})) };
      x.onerror=rej; x.send();
    });
  }
  var f1=await load('/t_wide.png','wide.png');
  var f2=await load('/t_tall.png','tall.png');
  var dt=new DataTransfer(); dt.items.add(f1); dt.items.add(f2);
  var inp=document.getElementById('fileall');
  inp.files=dt.files;
  inp.dispatchEvent(new Event('change'));
  return dt.files.length;
})()`);
console.log('1) 上传文件数:', JSON.stringify(up));
await sleep(1600);

const SNAP = `(function(){
  var G=window.GRIDKIT, TY=G.getTypes();
  var imgCells=TY.map(function(t,i){return t==='img'?i:-1}).filter(function(i){return i>=0});
  var gal=document.querySelectorAll('#gallery .gwrap').length;
  return {gallery:gal, imgCells:imgCells,
          clearHidden:document.getElementById('clear').hidden,
          galleryHidden:document.getElementById('gallery').hidden};
})()`;
console.log('2) 上传后（应只入库、画面不变）:', JSON.stringify(await ev(SNAP)));

// ---- 2. 点格子 0
console.log('3) 点格子0 ->', await ev(`
(function(){
  var G=window.GRIDKIT, cv=document.getElementById('cv');
  var r=G.getRects()[0], cr=cv.getBoundingClientRect();
  cv.dispatchEvent(new MouseEvent('click',{clientX:cr.left+(r.x+r.w/2)*cr.width/cv.width,
    clientY:cr.top+(r.y+r.h/2)*cr.height/cv.height,bubbles:true}));
  return document.getElementById('popTitle').textContent;
})()`));
await sleep(500);

console.log('4) 格子面板:', JSON.stringify(await ev(`(function(){
  return {thumbs:document.querySelectorAll('#popImgList .pimgwrap').length,
          none:document.querySelectorAll('#popImgList .pimg.none').length,
          hasUpload:!!document.getElementById('popFileAll'),
          rowHidden:document.getElementById('popImgRow').hidden,
          title:document.getElementById('popTitle').textContent};
})()`)));

// ---- 3. 点第二个素材 -> 贴到该格
console.log('5) 选第2个素材 ->', await ev(`(function(){
  var bs=document.querySelectorAll('#popImgList .pimgwrap .pimg');
  if(!bs.length) return 'no thumb';
  bs[1].click(); return 'ok';
})()`));
await sleep(800);
console.log('6) 选后画面:', JSON.stringify(await ev(SNAP)));

// ---- 4. 换排列 + 抽卡
await ev(`document.getElementById('relay').click()`);
await sleep(900);
console.log('7) 换排列后:', JSON.stringify(await ev(SNAP)));
for (let k = 0; k < 4; k++) { await ev(`document.getElementById('draw').click()`); await sleep(400); }
console.log('8) 抽卡4次后:', JSON.stringify(await ev(SNAP)));

// ---- 5. 改参数
await ev(`(function(){ var G=window.GRIDKIT; G.S.cols=4; G.S.overKey=''; return 1 })()`);
await sleep(900);
console.log('9) 改列数后:', JSON.stringify(await ev(SNAP)));
await ev(`(function(){ var G=window.GRIDKIT; G.S.aspect='1:1'; G.S.overKey=''; return 1 })()`);
await sleep(900);
console.log('10) 换1:1后:', JSON.stringify(await ev(SNAP)));

// ---- 6. 删掉这条素材
console.log('11) 删素材 ->', await ev(`(function(){
  var x=document.querySelector('#gallery .gdel'); if(!x) return 'no del'; x.click(); return 'ok';
})()`));
await sleep(900);
console.log('12) 删后:', JSON.stringify(await ev(SNAP)));

// ---- 7. 清空
console.log('13) 清空 ->', await ev(`(function(){
  var b=document.getElementById('clear'); if(!b||b.hidden) return 'hidden'; b.click(); return 'ok';
})()`));
await sleep(900);
console.log('14) 清空后:', JSON.stringify(await ev(SNAP)));

console.log('JS 报错:', JSON.stringify(await ev('window.__errs')));
ws.close(); chrome.kill();
