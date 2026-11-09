// 用法：
//   node render.mjs stills 1.7 5.1 18.7 ...        → out/still_<t>.jpg
//   node render.mjs clip <起始秒> <时长秒> <输出名>  → out/<输出名>.mp4（含原声）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const ROOT=fileURLToPath(new URL('.',import.meta.url));
const SRC=process.env.HOME+'/Desktop/11月9日 (1).mp4';
const FFMPEG=process.env.HOME+'/.local/bin/ffmpeg';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9631, HPORT=8911;
fs.mkdirSync(ROOT+'out',{recursive:true});
const http=spawn('/usr/bin/python3',['-m','http.server',String(HPORT),'--bind','127.0.0.1'],{cwd:ROOT+'web',stdio:'ignore'});
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--user-data-dir=/tmp/filmprof'+Date.now(),'--remote-debugging-port='+PORT,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); await sleep(2500);
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws=new WebSocket(list[0].webSocketDebuggerUrl);
let id=0;const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);} else if(m.method==='Runtime.exceptionThrown') console.error('EXC',m.params.exceptionDetails.exception?.description)};
const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await new Promise(r=>ws.onopen=r); await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:`http://127.0.0.1:${HPORT}/film.html?v=${Date.now()}`}); await sleep(2500);
const ev=async x=>{const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text); return r.result?.result?.value};
const info=await ev('FILM.init()'); console.log('init',JSON.stringify(info));
const shot=async n=>Buffer.from((await ev(`FILM.frame(${n})`)).split(',')[1],'base64');
const [cmd,...args]=process.argv.slice(2);
try{
  if(cmd==='stills'){
    for(const a of args){ const n=Math.round(parseFloat(a)*30); fs.writeFileSync(`${ROOT}out/still_${a}.jpg`,await shot(n)); console.log('still',a) }
  } else if(cmd==='clip'){
    const t0=parseFloat(args[0]), dur=parseFloat(args[1]), name=args[2]||'clip';
    const n0=Math.round(t0*30), n1=Math.min(info.frames+30, n0+Math.round(dur*30));
    const ff=spawn(FFMPEG,['-v','error','-y','-f','image2pipe','-framerate','30','-i','-','-ss',String(t0),'-t',String(dur),'-i',SRC,
      '-map','0:v','-map','1:a','-vf','scale=in_range=pc:out_range=tv,format=yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709','-c:v','libx264','-preset','slow','-crf','20','-maxrate','16M','-bufsize','32M','-movflags','+faststart','-c:a','aac','-b:a','192k','-shortest',`${ROOT}out/${name}.mp4`],{stdio:['pipe','inherit','inherit']});
    const tt=Date.now();
    for(let n=n0;n<n1;n++){ const b=await shot(n); if(!ff.stdin.write(b)) await new Promise(r=>ff.stdin.once('drain',r)); if((n-n0)%60===0) console.log('frame',n,((Date.now()-tt)/1000).toFixed(0)+'s') }
    ff.stdin.end(); await new Promise(r=>ff.on('close',r)); console.log('done',name,((Date.now()-tt)/1000).toFixed(0)+'s');
  }
} finally { ws.close(); chrome.kill(); http.kill() }
