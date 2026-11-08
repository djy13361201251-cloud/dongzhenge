import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9419;
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
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'file:///Users/daijingyi/Desktop/动真格/_work/dist/index.html' });
await sleep(2800);

const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  const ex = r.result?.exceptionDetails;
  if (ex) return { __err: ex.text, d: ex.exception?.description };
  return r.result?.result?.value;
};

// 造素材 + 走真实 UI：点格子，然后手动触发 file input 的 onchange 不现实，
// 改为直接调用与 UI 完全相同的两个入口：G.pinAsset + 写 S.over
await ev(`
window.__mk = function(w,h,c){
  var cv=document.createElement('canvas'); cv.width=w; cv.height=h; var g=cv.getContext('2d');
  g.fillStyle=c; g.fillRect(0,0,w,h); g.fillStyle='#fff'; g.fillRect(0,0,w/2,h/2);
  return cv.toDataURL('image/png');
};
window.__ready=false;
(function(){
  var srcs=[__mk(300,200,'#ff3355'), __mk(200,300,'#33aa66')];
  var ims=[], n=0;
  srcs.forEach(function(s,i){ var im=new Image(); im.onload=function(){ ims[i]=im; if(++n===2) window.__ready=true }; im.src=s });
})(); 1`);
for (let i = 0; i < 40 && !(await ev('window.__ready')); i++) await sleep(100);

// 用页面里真实的 GALLERY 变量（在闭包内，通过点击素材按钮来验证不可行）
// 改为：用 setAsset + 直接改 S.over 模拟"用户已贴好的状态"，再验证 pin 生效
const seeded = await ev(`
(function(){
  var G=window.GRIDKIT, S=G.S;
  G.setAsset('testA',{img:window.__testA});
  return 'x';
})()`);

// 真正的验证：模拟 bindCellAsset 的效果 —— pin + 写 over
await ev(`
(function(){
  var G=window.GRIDKIT, S=G.S;
  // 从 dataURL 造 image
  function img(src){ var im=new Image(); im.src=src; return im }
  window.__A = img(window.__mk(300,200,'#ff3355'));
  window.__B = img(window.__mk(200,300,'#33aa66'));
  return 'ok';
})()`);
await sleep(600);

const r1 = await ev(`
(function(){
  var G=window.GRIDKIT, S=G.S;
  G.setAsset('A',{img:window.__A});
  G.setAsset('B',{img:window.__B});
  G.pinAsset('A'); G.pinAsset('B');
  // 不手动写 S.over，全部交给 pinAssets 自动安排
  G.S.over={}; G.S.overKey='';
  return {over:Object.keys(S.over).length};
})()`);
console.log('1) pin 后 over 清空:', JSON.stringify(r1));
await sleep(700);

const countPlaced = `(function(){
  var G=window.GRIDKIT, S=G.S, TY=G.getTypes();
  var ids={}; Object.keys(S.over).forEach(function(k){ var o=S.over[k]; if(o&&o.aid) ids[o.aid]=+k });
  var imgCells=TY.map(function(t,i){return t==='img'?i:-1}).filter(function(i){return i>=0});
  return {placed:Object.keys(ids), imgCells:imgCells, n:imgCells.length};
})()`;

console.log('2) 渲染后:', JSON.stringify(await ev(countPlaced)));

// 换排列
await ev(`(function(){ var b=document.getElementById('relay'); if(b) b.click(); return 1 })()`);
await sleep(900);
console.log('3) 换排列后:', JSON.stringify(await ev(countPlaced)));

// 抽卡多次
for (let k = 0; k < 5; k++) {
  await ev(`(function(){ var b=document.getElementById('draw'); if(b) b.click(); return 1 })()`);
  await sleep(450);
}
console.log('4) 抽卡 5 次后:', JSON.stringify(await ev(countPlaced)));

// 改参数（列数）
await ev(`(function(){
  var G=window.GRIDKIT; G.S.cols=4; G.S.overKey=''; return G.S.cols })()`);
await sleep(900);
console.log('5) 改列数后:', JSON.stringify(await ev(countPlaced)));

// 换宽高比
await ev(`(function(){
  var G=window.GRIDKIT; G.S.aspect='1:1'; G.S.overKey=''; return G.S.aspect })()`);
await sleep(900);
console.log('6) 换比例后:', JSON.stringify(await ev(countPlaced)));

ws.close(); chrome.kill();
