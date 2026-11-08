import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9413;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--remote-debugging-port=' + PORT, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(2200);
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(list[0].webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise(r => ws.onopen = r);
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file:///Users/daijingyi/Desktop/动真格/_work/dist/index.html' });
await sleep(3000);

const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { err: r.result.exceptionDetails.text + ' ' + (r.result.exceptionDetails.exception?.description || '') };
  return r.result?.result?.value;
};

console.log('console errors:', JSON.stringify(await ev(`
  (()=>{ return window.__errs || 'none' })()
`)));

// 探针：把一张 200x100 的测试图塞进素材库（模拟上传结果）
const setup = await ev(`
(function(){
  function mk(w,h,c){
    var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
    var g=cv.getContext('2d'); g.fillStyle=c; g.fillRect(0,0,w,h);
    g.fillStyle='#fff'; g.fillRect(0,0,w/2,h/2);
    var im=new Image(); im.src=cv.toDataURL('image/png');
    return new Promise(function(res){ im.onload=function(){res(im)} });
  }
  return Promise.all([mk(200,100,'#e33'), mk(100,300,'#3e3')]).then(function(ims){
    window.__t=ims;
    // 直接走内部：模拟 onPick 之后的入库
    var input=document.createElement('input'); input.type='file'; input.id='x';
    return 'ready';
  });
})()
`);
console.log('setup:', setup);

// 检查界面元素
const info = await ev(`
(function(){
  var out={};
  out.hasHeroText = document.body.innerText.indexOf('主视觉')>=0;
  out.hasSetHero = document.body.innerText.indexOf('设为主视觉')>=0;
  out.clearHidden = document.getElementById('clear') ? document.getElementById('clear').hidden : 'missing';
  out.galleryHidden = document.getElementById('gallery') ? document.getElementById('gallery').hidden : 'missing';
  out.types = (window.GRIDKIT ? window.GRIDKIT.getTypes() : []).join(',');
  return out;
})()
`);
console.log('UI:', JSON.stringify(info, null, 1));

// 点一个格子，看面板
const clickCell = await ev(`
(function(){
  var cv=document.getElementById('cv');
  var r=window.GRIDKIT.getRects()[0];
  var cr=cv.getBoundingClientRect();
  var x=cr.left + (r.x+r.w/2)*cr.width/cv.width;
  var y=cr.top + (r.y+r.h/2)*cr.height/cv.height;
  var e=new MouseEvent('click',{clientX:x,clientY:y,bubbles:true});
  cv.dispatchEvent(e);
  return 'clicked '+Math.round(x)+','+Math.round(y);
})()
`);
console.log('cell click:', clickCell);
await sleep(400);

const panel = await ev(`
(function(){
  var out={};
  out.title = document.getElementById('popTitle') ? document.getElementById('popTitle').textContent : 'missing';
  out.hasHeroOpt = Array.from(document.querySelectorAll('#popType option')).some(function(o){return o.textContent.indexOf('主视觉')>=0});
  out.opts = Array.from(document.querySelectorAll('#popType option')).map(function(o){return o.value}).join(',');
  out.imgRowHidden = document.getElementById('popImgRow') ? document.getElementById('popImgRow').hidden : 'missing';
  out.hasUploadBtn = !!document.getElementById('popFileAll');
  out.pimgCount = document.querySelectorAll('#popImgList .pimg').length;
  return out;
})()
`);
console.log('panel:', JSON.stringify(panel, null, 1));

ws.close();
chrome.kill();
