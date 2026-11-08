
// ---- tiny MP4 muxer for one H.264 track from WebCodecs (avc format), fast-start (moov before mdat) ----
window.MiniMP4=(function(){
  function u32(n){return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]}
  function u16(n){return [(n>>>8)&255,n&255]}
  function str(s){return [...s].map(c=>c.charCodeAt(0))}
  function box(type,...parts){let len=8; const flat=[]; for(const p of parts){flat.push(p); len+=p.length} const out=new Uint8Array(len); out.set(u32(len),0); out.set(str(type),4); let o=8; for(const p of flat){out.set(p,o); o+=p.length} return out}
  const A=a=>Uint8Array.from(a);
  function full(type,ver,flags,...parts){return box(type,A([ver,(flags>>16)&255,(flags>>8)&255,flags&255]),...parts)}
  function Muxer(w,h,fps){this.w=w;this.h=h;this.fps=fps;this.samples=[];this.desc=null}
  Muxer.prototype.add=function(chunk,meta){
    if(meta&&meta.decoderConfig&&meta.decoderConfig.description&&!this.desc) this.desc=new Uint8Array(meta.decoderConfig.description.slice?meta.decoderConfig.description.slice(0):meta.decoderConfig.description);
    const d=new Uint8Array(chunk.byteLength); chunk.copyTo(d); this.samples.push({d,key:chunk.type==='key'});
  };
  Muxer.prototype.finish=function(){
    const TS=this.fps*1000, dur=1000, n=this.samples.length, total=n*dur;
    const W=this.w,H=this.h;
    const mat=[0x00010000,0,0,0,0x00010000,0,0,0,0x40000000].flatMap(u32);
    const ftyp=box('ftyp',A(str('isom')),A(u32(512)),A(str('isomiso2avc1mp41')));
    const mvhd=full('mvhd',0,0,A([...u32(0),...u32(0),...u32(TS),...u32(total),...u32(0x00010000),...u16(0x0100),...u16(0),...u32(0),...u32(0),...mat,...Array(24).fill(0),...u32(2)]));
    const tkhd=full('tkhd',0,3,A([...u32(0),...u32(0),...u32(1),...u32(0),...u32(total),...u32(0),...u32(0),...u16(0),...u16(0),...u16(0),...u16(0),...mat,...u32(W<<16),...u32(H<<16)]));
    const mdhd=full('mdhd',0,0,A([...u32(0),...u32(0),...u32(TS),...u32(total),...u16(0x55c4),...u16(0)]));
    const hdlr=full('hdlr',0,0,A([...u32(0),...str('vide'),...u32(0),...u32(0),...u32(0),...str('VideoHandler'),0]));
    const vmhd=full('vmhd',0,1,A([0,0,0,0,0,0,0,0]));
    const dinf=box('dinf',full('dref',0,0,A(u32(1)),full('url ',0,1)));
    const avcC=box('avcC',this.desc);
    const avc1=box('avc1',A([0,0,0,0,0,0,...u16(1),...u16(0),...u16(0),...u32(0),...u32(0),...u32(0),...u16(W),...u16(H),...u32(0x00480000),...u32(0x00480000),...u32(0),...u16(1),...Array(32).fill(0),...u16(0x18),...u16(0xffff)]),avcC);
    const stsd=full('stsd',0,0,A(u32(1)),avc1);
    const stts=full('stts',0,0,A([...u32(1),...u32(n),...u32(dur)]));
    const keys=[]; this.samples.forEach((s,i)=>{if(s.key) keys.push(i+1)});
    const stss=full('stss',0,0,A([...u32(keys.length),...keys.flatMap(u32)]));
    const stsc=full('stsc',0,0,A([...u32(1),...u32(1),...u32(n),...u32(1)]));
    const stsz=full('stsz',0,0,A([...u32(0),...u32(n),...this.samples.flatMap(s=>u32(s.d.length))]));
    const build=off=>{const stco=full('stco',0,0,A([...u32(1),...u32(off)])); const stbl=box('stbl',stsd,stts,stss,stsc,stsz,stco); const minf=box('minf',vmhd,dinf,stbl); const mdia=box('mdia',mdhd,hdlr,minf); const trak=box('trak',tkhd,mdia); return box('moov',mvhd,trak)};
    let moov=build(0); const off=ftyp.length+moov.length+8; moov=build(off);
    let dataLen=0; for(const s of this.samples) dataLen+=s.d.length;
    const mdatHead=A([...u32(dataLen+8),...str('mdat')]);
    return new Blob([ftyp,moov,mdatHead,...this.samples.map(s=>s.d)],{type:'video/mp4'});
  };
  return {Muxer};
})();

// ===== Grid Processor engine: procedural bento layouts + per-cell motion. render(ctx, t, opts) is pure in t =====
(function(){
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const lerp=(a,b,t)=>a+(b-a)*t;
const P=(t,s,d)=>clamp((t-s)/d);
const TAU=Math.PI*2;
const E={
  expoOut:x=>x>=1?1:1-Math.pow(2,-10*x),
  expoInOut:x=>x<=0?0:x>=1?1:x<.5?Math.pow(2,20*x-10)/2:(2-Math.pow(2,-20*x+10))/2,
  quartOut:x=>1-Math.pow(1-x,4),
  sineInOut:x=>-(Math.cos(Math.PI*x)-1)/2,
};
function spring(t,f=2.0,z=0.45){if(t<=0) return 0; const w=TAU*f, wd=w*Math.sqrt(1-z*z); return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+z*w/wd*Math.sin(wd*t))}
function rng(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
function hex(h){h=h.replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
function lum(h){const [r,g,b]=hex(h).map(v=>{v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}); return 0.2126*r+0.7152*g+0.0722*b}
function contrast(a,b){const la=lum(a),lb=lum(b); return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05)}
function toHex(r,g,b){return '#'+[r,g,b].map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('')}
function rgb2hsl(h){let [r,g,b]=hex(h).map(v=>v/255); const mx=Math.max(r,g,b),mn=Math.min(r,g,b); let H=0,S=0,L=(mx+mn)/2; if(mx!==mn){const d=mx-mn; S=L>0.5?d/(2-mx-mn):d/(mx+mn); H=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4; H/=6} return [H,S,L]}
function hsl2hex(H,S,L){const f=n=>{const k=(n+H*12)%12, a=S*Math.min(L,1-L); return L-a*Math.max(-1,Math.min(k-3,9-k,1))}; return toHex(f(0)*255,f(8)*255,f(4)*255)}

// ---------- palettes (6 roles) ----------
const PRESETS={
  meadow:{name:'草地',ground:'#39A564',paper:'#F1EBDD',ink:'#062419',c1:'#CE4B45',c2:'#3081E9',c3:'#00804F',c4:'#EEB04D'},
  rose:{name:'玫瑰',ground:'#D0749A',paper:'#F4E8DD',ink:'#45121B',c1:'#EEB04D',c2:'#AD2E24',c3:'#CB7349',c4:'#2D7FED'},
  snow:{name:'晴雪',ground:'#2782F7',paper:'#EEECE8',ink:'#24044F',c1:'#E07CA0',c2:'#A375AC',c3:'#5B2E9A',c4:'#FFD36E'},
  clay:{name:'陶土',ground:'#CF4742',paper:'#F3E6D3',ink:'#3D0604',c1:'#EEB04C',c2:'#E07D55',c3:'#8E2A22',c4:'#4776AA'},
  pasture:{name:'牧场',ground:'#287EF0',paper:'#F2F0EC',ink:'#022B1E',c1:'#00D68C',c2:'#E04A4C',c3:'#007A4D',c4:'#FFC94A'},
  cobalt:{name:'钴蓝',ground:'#DEDDFC',paper:'#FFFFFF',ink:'#050505',c1:'#1054F5',c2:'#53B7EA',c3:'#4BBC6D',c4:'#EA353A'},
  wrapper:{name:'糖纸',ground:'#F5F5FD',paper:'#FFFFFF',ink:'#282A2B',c1:'#F5B431',c2:'#BE5FEA',c3:'#57A970',c4:'#53B7E9'},
  market:{name:'夜市',ground:'#0A0C0A',paper:'#EDE9E3',ink:'#0A0C0A',c1:'#4B7CF4',c2:'#E95F26',c3:'#C961F5',c4:'#D5CA5F'},
  soda:{name:'橘子汽水',ground:'#ECE8E2',paper:'#F7F4EE',ink:'#111111',c1:'#EE5D06',c2:'#F2B231',c3:'#E2D0F9',c4:'#1254F5'},
  lemon:{name:'柠檬',ground:'#F7E04B',paper:'#FFFBEA',ink:'#1A1A1A',c1:'#FF5B3A',c2:'#2F6BFF',c3:'#13B57A',c4:'#FF9EC4'},
  volt:{name:'电光蓝',ground:'#2F5BFF',paper:'#F4F1EA',ink:'#0D0D12',c1:'#FF7AB6',c2:'#FFD23F',c3:'#9EE6FF',c4:'#FF4D2E'},
  tomint:{name:'番茄薄荷',ground:'#F2EBDD',paper:'#FFFFFF',ink:'#1B1B1B',c1:'#FF4B2B',c2:'#2BD99F',c3:'#FFC42E',c4:'#3A47F5'},
  spec:{name:'规格书',ground:'#161616',paper:'#EFEDE6',ink:'#161616',c1:'#1F3D2B',c2:'#E5482F',c3:'#F2CF5B',c4:'#BFDDE8'},
  sky:{name:'晴蓝条',ground:'#ECE7E1',paper:'#F5EEE8',ink:'#1F3550',c1:'#7CACCB',c2:'#D43445',c3:'#C3CCD6',c4:'#D78791'},
  candy:{name:'糖果条',ground:'#EBE4D7',paper:'#F6F1E7',ink:'#1C3E68',c1:'#8E769F',c2:'#D9A657',c3:'#E59AB4',c4:'#66AC71'},
  plaid:{name:'粉格纹',ground:'#F4D8DD',paper:'#FBF0F2',ink:'#6A2238',c1:'#D66585',c2:'#E2A6B8',c3:'#DC7F9C',c4:'#E7B9C5'},
  navy:{name:'海军条',ground:'#ECE8DD',paper:'#F3F0E7',ink:'#1C2125',c1:'#264E6A',c2:'#AACCDF',c3:'#78919E',c4:'#495F6C'},
  dusk:{name:'暮色条',ground:'#EAD9D3',paper:'#F4E9E4',ink:'#3E2F48',c1:'#8E739F',c2:'#E27D6E',c3:'#CAC3C8',c4:'#E7AFB9'},
  mint:{name:'薄荷条',ground:'#EAE4D4',paper:'#F4EFE3',ink:'#1D4B34',c1:'#88B7AD',c2:'#E4A4B4',c3:'#B3C7C2',c4:'#2F6B55'},
  sakura:{name:'夜樱条',ground:'#2C2326',paper:'#EFCCA1',ink:'#2C2326',c1:'#D86B90',c2:'#AB5773',c3:'#7B4254',c4:'#512E3A'},
  fog:{name:'灰雾',ground:'#C5C1C8',paper:'#EEEBEF',ink:'#2B2A33',c1:'#96BBD7',c2:'#7CAFD3',c3:'#B7B2B9',c4:'#DCD8DE'},
};

// ---------- state ----------
const S={
  aspect:'9:16', style:'spec',
  pal:Object.assign({},PRESETS.spec),
  cols:12, rows:6, count:9, variance:55, bias:0, gutter:12, pad:20, radius:4, seed:7,
  grain:0.5, shuffle:true, dur:9,
  hero:'auto', cseed:7, over:{}, overKey:'', cells:null, cellsKey:'', blank:0, textMix:35, plainMix:15,
  text:{title:'WEEKEND\nMARKET',lines:'11.08 周六\n上海 · 西岸美术馆\n免费入场\n立即报名'},
};
const SIZES={'16:9':[1920,1080],'9:16':[1080,1920],'1:1':[1080,1080],'4:5':[1080,1350]};
function size(){return SIZES[S.aspect]||SIZES['16:9']}

// ---------- fonts ----------
const CJK='"Noto Sans SC","Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif';
let CC=null; // per-cell cute flag while drawing in chaos mode
function isCute(){return CC!==null?CC:S.style==='cute'}
function fam(){return isCute()?'PoppinsT':'InterD'}
function font(sz,w=900){return `${w} ${sz}px ${fam()}, ${CJK}`}
function measure(ctx,s,sz,w=900){ctx.font=font(sz,w); return ctx.measureText(s).width}
function txt(ctx,s,x,y,sz,col,{align='center',w=900,base='alphabetic'}={}){
  ctx.font=font(sz,w); ctx.textAlign=align; ctx.textBaseline=base; ctx.fillStyle=col;
  if(isCute()&&!/[　-鿿＀-￯]/.test(s)){ctx.lineJoin='round'; ctx.lineWidth=sz*0.05; ctx.strokeStyle=col; ctx.strokeText(s,x,y)}
  ctx.fillText(s,x,y);
}
function fitSize(ctx,lines,maxW,maxH,lh=1.0){let sz=maxH/(lines.length*lh); for(const l of lines){const m=measure(ctx,l,sz); if(m>maxW) sz*=maxW/m} return sz}

// ---------- textures ----------
let GRAIN=null, PAPER=null, PW=0, PH=0;
function textures(W,H){
  if(!GRAIN){const g=document.createElement('canvas'); g.width=g.height=512; const gc=g.getContext('2d'); const id=gc.createImageData(512,512); const r=rng(7); for(let i=0;i<id.data.length;i+=4){const v=128+(r()-.5)*230; id.data[i]=id.data[i+1]=id.data[i+2]=v; id.data[i+3]=255} gc.putImageData(id,0,0); GRAIN=g}
  if(PW!==W||PH!==H){const p=document.createElement('canvas'); p.width=W; p.height=H; const pc=p.getContext('2d'); pc.fillStyle='#808080'; pc.fillRect(0,0,W,H); const r=rng(11);
    for(let i=0;i<(W*H)/8000;i++){const x=r()*W,y=r()*H,s=40+r()*220; const gr=pc.createRadialGradient(x,y,0,x,y,s); const v=r()<.5?112:144; gr.addColorStop(0,`rgba(${v},${v},${v},${0.08+r()*0.1})`); gr.addColorStop(1,'rgba(128,128,128,0)'); pc.fillStyle=gr; pc.fillRect(x-s,y-s,2*s,2*s)}
    pc.lineCap='round'; for(let i=0;i<(W*H)/2300;i++){const x=r()*W,y=r()*H,a=r()*TAU,l=4+r()*14; const v=r()<.5?100:165; pc.strokeStyle=`rgba(${v},${v},${v},${0.08+r()*0.12})`; pc.lineWidth=0.6+r()*0.7; pc.beginPath(); pc.moveTo(x,y); pc.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l); pc.stroke()}
    PAPER=p; PW=W; PH=H}
}
function grain(ctx,t,W,H){const k=S.grain; if(k<=0) return; ctx.save(); ctx.globalCompositeOperation='overlay'; ctx.globalAlpha=0.5*k; ctx.drawImage(PAPER,0,0);
  const r=rng(Math.floor(t*24)*977+3); const ox=Math.floor(r()*512), oy=Math.floor(r()*512); ctx.globalCompositeOperation='soft-light'; ctx.globalAlpha=0.4*k; ctx.translate(-ox,-oy);
  for(let y=0;y<H+512;y+=512) for(let x=0;x<W+512;x+=512) ctx.drawImage(GRAIN,x,y); ctx.restore()}

// ---------- layout: guillotine splits on an integer grid ----------
function genLayout(seed){
  const r=rng(seed*7919+13);
  const cols=S.cols, rows=S.rows; const target=Math.min(S.count,cols*rows);
  const v=S.variance/100, bias=S.bias/100;
  let cells=[{x:0,y:0,w:cols,h:rows}];
  let guard=0;
  while(cells.length<target && guard++<500){
    // pick a cell to split: big ones first, randomness grows with variance
    const cand=cells.map((c,i)=>({i,s:Math.pow(c.w*c.h,1.2+v*1.6)*(0.4+r()) })).filter(o=>cells[o.i].w>1||cells[o.i].h>1).sort((a,b)=>b.s-a.s);
    if(!cand.length) break;
    const c=cells[cand[0].i];
    // split direction: longer side, nudged by bias (+ = favour wide cells -> split horizontally)
    let vert=(c.w/c.h)*Math.pow(2,-bias*1.6) > 1;     // vertical cut => two side-by-side cells
    if(r()<0.18) vert=!vert;
    if(vert&&c.w<2) vert=false; if(!vert&&c.h<2) vert=true;
    const L=vert?c.w:c.h; if(L<2) continue;
    // cut position: centred when variance is low, far off-centre when high
    const off=(r()*2-1)*v*0.42; let k=Math.round(L*(0.5+off)); k=Math.max(1,Math.min(L-1,k));
    const a=vert?{x:c.x,y:c.y,w:k,h:c.h}:{x:c.x,y:c.y,w:c.w,h:k};
    const b=vert?{x:c.x+k,y:c.y,w:c.w-k,h:c.h}:{x:c.x,y:c.y+k,w:c.w,h:c.h-k};
    cells.splice(cand[0].i,1,a,b);
  }
  return cells;
}
function toPx(c,W,H){const g=S.gutter, p=S.pad; const cw=(W-2*p-(S.cols-1)*g)/S.cols, ch=(H-2*p-(S.rows-1)*g)/S.rows; return {x:p+c.x*(cw+g),y:p+c.y*(ch+g),w:c.w*cw+(c.w-1)*g,h:c.h*ch+(c.h-1)*g}}

// ---------- cell types ----------
const TYPES=['halftone','oval','lens','bands','title','ticker','count','dial','swatch','dots','spec','shape','stripes','face','sparkle','checker','letter','cta','wave'];
function eligible(type,a,mn){ // a = aspect w/h, mn = shorter side in px
  if(type.startsWith('tx:')) return txEligible(type.slice(3),a,mn);
  if(mn<130&&!['ticker','stripes','dots','checker','wave','sparkle'].includes(type)) return false;
  if(type==='ticker'&&mn<60) return false;
  if(type==='spec'&&mn<230) return false; if((type==='oval'||type==='lens')&&mn<150) return false; if(type==='dial'&&mn<170) return false; if(type==='swatch'&&mn<140) return false; if(type==='cta'&&mn<90) return false;
  switch(type){
    case 'title': return a>1.1; case 'ticker': return a>1.3; case 'swatch': return a>0.9; case 'cta': return a>1.6;
    case 'spec': return a<1.6&&a>0.5; case 'dial': return a>0.7&&a<1.5; case 'face': return a>0.7&&a<1.5; case 'shape': return a>0.6&&a<1.7;
    case 'letter': return a<1.4; case 'count': return a<2.2; default: return true;
  }
}
function assign(rects,seed){
  const r=rng(seed*31+5); const n=rects.length; const out=new Array(n);
  const [W,H]=size(); const px=rects.map(c=>toPx(c,W,H));
  const idx=[...rects.keys()].sort((i,j)=>rects[j].w*rects[j].h-rects[i].w*rects[i].h);
  const sq=i=>{const a=px[i].w/px[i].h; return px[i].w*px[i].h*Math.pow(Math.min(a,1/a),1.3)};
  const pi=[...rects.keys()].sort((i,j)=>sq(j)-sq(i))[0]; out[pi]='prod';
  // title in the widest remaining cell
  let ti=idx.filter(i=>i!==pi).filter(i=>px[i].w/px[i].h>1.1&&px[i].h>90).sort((i,j)=>rects[j].w*rects[j].h-rects[i].w*rects[i].h)[0];
  if(ti===undefined) ti=idx.find(i=>i!==pi); if(ti!==undefined&&heroKind()!=='type') out[ti]='tx:headline';
  // each remaining cell becomes text, pattern or a plain colour block, in the proportions set by the sliders
  const TEXT=['tx:ticker','tx:stat','tx:info','tx:badge','tx:cta','letter','tx:stack','tx:kicker','tx:body','tx:quote','tx:vert'], DECO=TYPES.filter(t=>!['title','ticker','count','spec','oval','cta','letter'].includes(t));
  const pools={text:[],deco:[]};
  const rest=idx.filter(i=>!out[i]); const nT=Math.round(rest.length*S.textMix/100), nP=Math.round(rest.length*S.plainMix/100);
  const order=rest.slice().sort(()=>r()-0.5); const cat={}; order.forEach((i,k)=>{cat[i]=k<nT?'text':k<nT+nP?'plain':'deco'});
  {const cand=rest.filter(i=>cat[i]==='text'&&txEligible('promo',px[i].w/px[i].h,Math.min(px[i].w,px[i].h))).sort((a,b)=>px[b].w*px[b].h-px[a].w*px[a].h); if(cand.length){out[cand[0]]='tx:promo'; cat[cand[0]]='done'}}
  rest.forEach(i=>{if(out[i]) return; const a=px[i].w/px[i].h, mn=Math.min(px[i].w,px[i].h); let c=cat[i];
    if(c==='plain'&&rects[i].w*rects[i].h<=S.cols*S.rows*0.1){out[i]='plain'; return} if(c==='plain') c='deco';
    const src=c==='text'?TEXT:DECO;
    for(let tries=0;tries<2;tries++){if(!pools[c].length) pools[c]=src.slice().sort(()=>r()-0.5); const k=pools[c].findIndex(t=>eligible(t,a,mn)); if(k>=0){out[i]=pools[c][k]; pools[c].splice(k,1); return} pools[c]=[]}
    out[i]=c==='text'?'tx:stack':['dots','stripes','checker','sparkle'][Math.floor(r()*4)]});
  return out;
}
// fill colours: avoid neighbouring repeats; text colour picks the better contrast of ink/paper
function colours(rects,types,seed){
  const r=rng(seed*17+3); const p=S.pal; const fills=[p.c1,p.c1,p.c1,p.c2,p.c2,p.c3,p.c3,p.c4,p.paper,p.paper];
  const out=[];
  rects.forEach((a,i)=>{
    const nb=new Set(); rects.forEach((b,j)=>{if(j>=i) return; const touch=!(a.x+a.w<b.x-0.5||b.x+b.w<a.x-0.5||a.y+a.h<b.y-0.5||b.y+b.h<a.y-0.5); if(touch) nb.add(out[j])});
    let opts=fills.filter(f=>!nb.has(f)&&f!==p.ground); if(!opts.length) opts=fills;
    if(types[i]==='title'||types[i]==='spec') opts=opts.includes(p.paper)?[p.paper]:opts;
    const pick=opts[Math.floor(r()*opts.length)];
    out.push(['note','notedot','plainGround'].includes(types[i])?p.ground:pick);
  });
  return out;
}
function onCol(fill){const p=S.pal; return contrast(fill,p.ink)>=contrast(fill,p.paper)?p.ink:p.paper}

// ---------- product ----------
let IMG=null;
function drawProduct(ctx,cx,by,h,t,body){
  const p=S.pal;
  if(IMG){const r=Math.min(h*0.95/IMG.height,h*1.1/IMG.width); const w=IMG.width*r, hh=IMG.height*r; const f=Math.sin(t*TAU*0.3)*h*0.012; ctx.drawImage(IMG,cx-w/2,by-hh+f,w,hh); return}
  if(S.style==='cute'){
    const br=Math.sin(t*TAU*0.8), hop=Math.max(0,Math.sin(t*TAU*0.4))**6; const sy=1+0.025*br-0.04*hop, sx=1-0.02*br+0.03*hop; const lift=hop*h*0.06;
    ctx.save(); ctx.globalAlpha=0.2; ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(cx,by+h*0.02,h*0.34,h*0.045,0,0,TAU); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(cx,by-lift); ctx.scale(sx,sy);
    const bw=h*0.66, bh=h*0.74, lidH=h*0.17;
    ctx.fillStyle=body||p.c1; rr(ctx,-bw/2,-bh,bw,bh,bw*0.32); ctx.fill();
    ctx.save(); ctx.globalAlpha=0.3; ctx.fillStyle='#fff'; rr(ctx,-bw*0.36,-bh*0.86,bw*0.11,bh*0.5,bw*0.06); ctx.fill(); ctx.restore();
    ctx.fillStyle=p.c3; rr(ctx,-bw*0.43,-bh-lidH*0.92,bw*0.86,lidH,lidH*0.45); ctx.fill();
    ctx.fillStyle=p.paper; rr(ctx,-bw*0.4,-bh*0.62,bw*0.8,bh*0.42,bh*0.08); ctx.fill();
    const bl=(t%2.9)>2.78?0.12:1, ex=bw*0.15, ey=-bh*0.44, er=bw*0.045; const look=Math.sin(t*0.9);
    ctx.fillStyle=p.ink; ctx.beginPath(); ctx.ellipse(-ex+look*er,ey,er,er*1.25*bl,0,0,TAU); ctx.ellipse(ex+look*er,ey,er,er*1.25*bl,0,0,TAU); ctx.fill();
    ctx.strokeStyle=p.ink; ctx.lineWidth=bw*0.03; ctx.lineCap='round'; ctx.beginPath(); ctx.arc(look*er,ey+bw*0.04,bw*0.07,0.15*Math.PI,0.85*Math.PI); ctx.stroke();
    ctx.fillStyle='#FF8FA8'; ctx.globalAlpha=0.65; ctx.beginPath(); ctx.ellipse(-ex*1.75,ey+bw*0.07,er*1.3,er*0.8,0,0,TAU); ctx.ellipse(ex*1.75,ey+bw*0.07,er*1.3,er*0.8,0,0,TAU); ctx.fill();
    ctx.restore(); return;
  }
  // spec: flat can, label scrolls sideways
  ctx.save(); ctx.translate(cx,by); ctx.rotate(Math.sin(t*TAU*0.22)*0.015);
  const s=h/100, bw=46*s, bh=92*s, ey=5*s;
  ctx.fillStyle=body||p.c2; ctx.fillRect(-bw/2,-bh,bw,bh); ctx.beginPath(); ctx.ellipse(0,0,bw/2,ey,0,0,Math.PI); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.rect(-bw/2,-bh*0.70,bw,bh*0.42); ctx.clip(); ctx.fillStyle=p.paper; ctx.fillRect(-bw/2,-bh*0.70,bw,bh*0.42);
  const sc=(t*14*s)%(bw*0.9); ctx.fillStyle=p.ink; for(let k=-2;k<4;k++){const xx=-bw/2+k*bw*0.9-sc; ctx.fillRect(xx+bw*0.10,-bh*0.62,bw*0.42,bh*0.07); ctx.fillRect(xx+bw*0.10,-bh*0.51,bw*0.26,bh*0.035); ctx.fillRect(xx+bw*0.10,-bh*0.45,bw*0.32,bh*0.035)}
  ctx.restore();
  const g=ctx.createLinearGradient(-bw/2,0,bw/2,0); g.addColorStop(0,'rgba(0,0,0,.22)'); g.addColorStop(.28,'rgba(255,255,255,.18)'); g.addColorStop(.5,'rgba(255,255,255,0)'); g.addColorStop(1,'rgba(0,0,0,.28)'); ctx.fillStyle=g; ctx.fillRect(-bw/2,-bh,bw,bh);
  ctx.fillStyle=p.ink; ctx.fillRect(-bw/2-s,-bh-6*s,bw+2*s,6*s); ctx.beginPath(); ctx.ellipse(0,-bh-6*s,bw/2+s,ey,0,0,TAU); ctx.fill();
  ctx.restore();
}
function rr(ctx,x,y,w,h,r){r=Math.max(0,Math.min(r,w/2,h/2)); ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath()}
function heart(ctx,x,y,s){ctx.beginPath(); ctx.moveTo(x,y+s*0.35); ctx.bezierCurveTo(x+s*1.05,y-s*0.35,x+s*0.5,y-s*1.0,x,y-s*0.45); ctx.bezierCurveTo(x-s*0.5,y-s*1.0,x-s*1.05,y-s*0.35,x,y+s*0.35); ctx.closePath()}


// ---------- hero (the poster's main visual) ----------
let IMGALPHA=false;
function heroKind(){if(S.hero==='bowls') S.hero='type'; if(S.hero==='image') return IMG?'image':'type'; if(S.hero!=='auto') return S.hero; return HEROES_AUTO[S.seed%HEROES_AUTO.length]}
const HEROES_AUTO=['type','arch','sun','stack'];
function hero(ctx,R,t,it,fill,fg,ac,i,cute){
  const {x,y,w,h}=R, cx=x+w/2, cy=y+h/2, m=Math.min(w,h), p=S.pal, T=S.text;
  const others=[p.c1,p.c2,p.c3,p.c4,p.paper,p.ink].filter(c=>c!==fill&&contrast(c,fill)>1.35);
  const kind=heroKind();
  if(kind==='image'){
    const e=E.expoOut(P(it,0,1.2));
    if(IMGALPHA){ // cut-out: float in the middle with a soft shadow
      const k=Math.min(w*0.82/IMG.width,h*0.82/IMG.height)*(cute?spring(it,1.4,0.5):1); const iw=IMG.width*k, ih=IMG.height*k; const f=Math.sin(t*TAU*0.3)*m*0.015;
      ctx.save(); ctx.globalAlpha=0.18*e; ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(cx,cy+ih*0.46,iw*0.34,m*0.03,0,0,TAU); ctx.fill(); ctx.restore();
      ctx.save(); ctx.globalAlpha=e; ctx.drawImage(IMG,cx-iw/2,cy-ih/2+f+(1-e)*m*0.2,iw,ih); ctx.restore();
    } else { // photo: cover the cell with a slow push-in
      const z=1.04+0.08*E.sineInOut(clamp(t/S.dur)); const k=Math.max(w/IMG.width,h/IMG.height)*z; const iw=IMG.width*k, ih=IMG.height*k;
      const px=Math.sin(t*0.25)*w*0.01;
      ctx.save(); ctx.globalAlpha=e; ctx.drawImage(IMG,cx-iw/2+px,cy-ih/2,iw,ih); ctx.restore();
    }
    return;
  }
  if(kind==='type'){ // giant headline fills the hero
    const lines=T.title.split('\n'); const sz=fitSize(ctx,lines,w*0.88,h*0.84,0.94); const total=lines.length*sz*0.94; let by=cy-total/2+sz*0.8;
    if(cute){ctx.save(); ctx.fillStyle=others.find(c=>c!==fg&&contrast(c,fg)>2.2)||ac; if(contrast(ctx.fillStyle,fg)<2.2) ctx.globalAlpha=0; const br=1+0.02*Math.sin(t*2); ctx.beginPath(); ctx.arc(x+w*0.78,y+h*0.26,m*0.2*spring(it-0.3,1.5,0.45)*br,0,TAU); ctx.fill(); ctx.restore()}
    lines.forEach((ln,li)=>{ctx.font=font(sz); let xx=cx-measure(ctx,ln,sz)/2;
      [...ln].forEach((ch,ci)=>{const cw=measure(ctx,ch,sz);
        if(cute){const s=spring(it-li*0.12-ci*0.045,1.8,0.5); if(s>0){ctx.save(); ctx.translate(xx+cw/2,by+(1-s)*sz*0.7); ctx.rotate((1-s)*0.22*(ci%2?1:-1)); txt(ctx,ch,0,0,sz,fg); ctx.restore()}}
        else {const pr=E.expoOut(P(it,li*0.14+ci*0.035,0.9)); ctx.save(); ctx.beginPath(); ctx.rect(xx-2,by-sz*0.9,cw+4,sz*1.08); ctx.clip(); txt(ctx,ch,xx+cw/2,by+(1-pr)*sz*1.05,sz,fg); ctx.restore()}
        xx+=cw});
      by+=sz*0.94});
    return;
  }
  if(kind==='arch'){ // nested rainbow arches rising from the bottom edge
    const n=Math.min(6,Math.max(4,others.length)); const R0=Math.min(w*0.46,h*0.92); const bw=R0/(n+0.6);
    for(let k=0;k<n;k++){const col=others[k%others.length]; const rr_=R0-k*bw-bw/2; const pr=(cute?E.quartOut:E.expoOut)(P(it,k*0.1,1.1));
      const br=1+0.012*Math.sin(t*1.6-k*0.6);
      ctx.strokeStyle=col; ctx.lineWidth=bw*(cute?0.82:1.0); ctx.lineCap=cute?'round':'butt';
      ctx.beginPath(); ctx.arc(cx,y+h,rr_*br,Math.PI,Math.PI+Math.PI*pr); ctx.stroke()}
    ctx.fillStyle=others[n%others.length]; const ss=cute?spring(it-0.6,1.6,0.5):E.expoOut(P(it,0.6,0.8)); ctx.beginPath(); ctx.arc(cx,y+h,Math.max(0,(R0-n*bw)*ss),Math.PI,TAU); ctx.fill();
    return;
  }
  if(kind==='sun'){ // sun with rotating rays
    const R0=m*0.42; const e=cute?spring(it,1.5,0.5):E.expoOut(P(it,0,1.0)); const rays=cute?12:24;
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(t*0.18); ctx.fillStyle=others[1%others.length];
    for(let k=0;k<rays;k++){const a=k/rays*TAU; const L=R0*(0.62+0.38*e)*(1+(cute?0.04*Math.sin(t*2+k):0));
      ctx.save(); ctx.rotate(a); if(cute){rr(ctx,R0*0.5,-R0*0.07,L-R0*0.5,R0*0.14,R0*0.07); ctx.fill()} else {ctx.beginPath(); ctx.moveTo(R0*0.48,-R0*0.05); ctx.lineTo(L,0); ctx.lineTo(R0*0.48,R0*0.05); ctx.closePath(); ctx.fill()} ctx.restore()}
    ctx.restore();
    ctx.fillStyle=others[0]; ctx.beginPath(); ctx.arc(cx,cy,R0*0.46*e*(1+0.015*Math.sin(t*1.8)),0,TAU); ctx.fill();
    if(cute){ctx.fillStyle=onCol(others[0]); const bl=(t%3.3)>3.18?0.1:1; ctx.beginPath(); ctx.ellipse(cx-R0*0.13,cy-R0*0.04,R0*0.04,R0*0.06*bl,0,0,TAU); ctx.ellipse(cx+R0*0.13,cy-R0*0.04,R0*0.04,R0*0.06*bl,0,0,TAU); ctx.fill(); ctx.strokeStyle=onCol(others[0]); ctx.lineWidth=R0*0.035; ctx.lineCap='round'; ctx.beginPath(); ctx.arc(cx,cy+R0*0.04,R0*0.12,0.2*Math.PI,0.8*Math.PI); ctx.stroke()}
    else {ctx.fillStyle=fill; ctx.beginPath(); ctx.arc(cx,cy,R0*0.16*e,0,TAU); ctx.fill()}
    return;
  }
  if(kind==='bowls'){ // stacked tableware pieces dropping in and settling (bauhaus stacking)
    const r=rng(S.seed*7+3); const cols=w>h*1.15?2:1; const colW=w*(cols===2?0.42:0.6);
    for(let c=0;c<cols;c++){
      const ccx=cols===2?x+w*(0.29+c*0.42):cx; let base=y+h*0.96; const n=3+Math.floor(r()*2);
      for(let k=0;k<n;k++){
        const kind2=k===0?2:Math.floor(r()*3); const pw=colW*(0.7+r()*0.3), ph=Math.min(h*0.88/n,pw*0.55); const col=others[Math.floor(r()*others.length)];
        const tt=it-c*0.15-k*0.22; const s=cute?spring(tt,1.6,0.42):E.expoOut(P(tt,0,0.9)); if(s<=0){base-=ph; continue}
        const drop=(1-s)*-h*0.9; const sway=Math.sin(t*1.4+k+c)*(cute?pw*0.012:0);
        ctx.save(); ctx.translate(ccx+sway,base-ph+drop); ctx.fillStyle=col; ctx.beginPath();
        if(kind2===0){ // bowl: flat top, round bottom
          ctx.moveTo(-pw/2,0); ctx.lineTo(pw/2,0); ctx.ellipse(0,0,pw/2,ph,0,0,Math.PI); ctx.closePath(); ctx.fill(); ctx.fillRect(-pw*0.18,ph*0.86,pw*0.36,ph*0.14)}
        else if(kind2===1){ // cup: rounded block
          rr(ctx,-pw*0.42,0,pw*0.84,ph,cute?ph*0.3:ph*0.08); ctx.fill()}
        else { // arch: n-shape
          ctx.moveTo(-pw/2,ph); ctx.lineTo(-pw/2,ph*0.5); ctx.arc(0,ph*0.5,pw/2,Math.PI,TAU); ctx.lineTo(pw/2,ph); ctx.lineTo(pw*0.2,ph); ctx.lineTo(pw*0.2,ph*0.55); ctx.arc(0,ph*0.55,pw*0.2,0,Math.PI,true); ctx.lineTo(-pw*0.2,ph); ctx.closePath(); ctx.fill()}
        ctx.restore(); base-=ph;
      }
    }
    return;
  }
  if(kind==='stack'){ // modular geometric tiles that turn one by one
    const nx=Math.max(2,Math.round(w/(m/2.6))), ny=Math.max(2,Math.round(h/(m/2.6))); const gw=w/nx, gh=h/ny, q=Math.min(gw,gh);
    const r=rng(S.seed*13+i);
    for(let a=0;a<nx;a++) for(let b=0;b<ny;b++){
      const kind2=Math.floor(r()*4), col=others[Math.floor(r()*others.length)], rot0=Math.floor(r()*4), ph=r()*3;
      const step=Math.floor((t+ph)/1.6), fr=E.expoInOut(clamp(((t+ph)%1.6)/0.7));
      const rot=(rot0+step+fr)*Math.PI/2; const e=cute?spring(it-(a+b)*0.05,1.8,0.5):E.expoOut(P(it,(a+b)*0.05,0.8));
      const ccx=x+gw*(a+0.5), ccy=y+gh*(b+0.5), s2=q*0.5*e*(cute?0.86:1);
      ctx.save(); ctx.translate(ccx,ccy); ctx.rotate(rot); ctx.fillStyle=col; ctx.beginPath();
      if(kind2===0){ctx.moveTo(-s2,-s2); ctx.arc(-s2,-s2,s2*2,0,Math.PI/2); ctx.closePath()}
      else if(kind2===1){ctx.arc(0,s2,s2,Math.PI,TAU); ctx.closePath()}
      else if(kind2===2){ctx.arc(0,0,s2*0.9,0,TAU)}
      else {ctx.moveTo(-s2,-s2); ctx.lineTo(s2,-s2); ctx.lineTo(-s2,s2); ctx.closePath()}
      ctx.fill(); ctx.restore()}
    return;
  }
}


// ---------- type scale: every text cell picks a step from one scale, so sizes stay related across layouts ----------
function scale(){const [W,H]=size(); const b=Math.min(W,H); return [b*0.135,b*0.095,b*0.066,b*0.046,b*0.032,b*0.024]} // XL L M S XS XXS
function stepFit(ctx,lines,maxW,maxH,start,lh=1.08,w=900){const sc=scale(); for(let k=start;k<sc.length;k++){const sz=sc[k]; if(lines.length*sz*lh<=maxH&&lines.every(l=>measure(ctx,l,sz,w)<=maxW)) return sz}
  let sz=sc[sc.length-1]; for(const l of lines){const m_=measure(ctx,l,sz,w); if(m_>maxW) sz*=maxW/m_} return Math.min(sz,maxH/(lines.length*lh))}
function lines(){return (S.text.lines||'').split('\n').map(x=>x.trim()).filter(Boolean)}
function line(i){const L=lines(); return L.length?L[i%L.length]:''}
function titleWords(){return S.text.title.split(/\s|\n/).filter(Boolean)}


// ================= poster text layouts =================
const TXL={
  headline:{name:'大标题',f:[['h','主标题',1]]},
  stack:{name:'标题 + 副标题',f:[['h','主标题',1],['s','副标题']]},
  kicker:{name:'眉题 + 标题',f:[['k','眉题'],['h','主标题',1],['s','副标题']]},
  body:{name:'小标题 + 正文',f:[['h','小标题'],['b','正文',1]]},
  stat:{name:'大数字 + 说明',f:[['h','数字'],['s','说明']]},
  info:{name:'信息栏',f:[['b','每行一条，用 | 分左右',1]]},
  quote:{name:'引语',f:[['h','引语',1],['s','署名']]},
  vert:{name:'竖排',f:[['h','竖排文字']]},
  badge:{name:'徽章',f:[['h','文字']]},
  cta:{name:'按钮',f:[['h','按钮文字']]},
  ticker:{name:'滚动字',f:[['h','滚动文字']]},
  promo:{name:'卖点（主张 + 卖点 + 按钮）',f:[['h','主张',1],['b','卖点（每行一条）',1],['k','按钮文字']]},
};
function ac0(fill,i){const p=S.pal; const a=[p.c1,p.c2,p.c3,p.c4].filter(c=>c!==fill&&contrast(c,fill)>1.6); return a[i%Math.max(1,a.length)]||onCol(fill)}
function txEligible(l,a,mn){if(mn<120) return l==='ticker'&&mn>=60; switch(l){case 'ticker': return a>1.3; case 'cta': return a>1.4&&mn>=90; case 'badge': return a>0.9&&mn>=130;
  case 'info': return mn>=200&&a<2; case 'body': return mn>=200; case 'quote': return mn>=200; case 'vert': return a<0.6&&mn>=90; case 'promo': return mn>=230&&a>0.55&&a<2.2; case 'stat': return a<2.4; case 'kicker': return a>0.6; default: return true}}
function txDefault(l,i){const L=lines(), T=S.text.title; const dig=L.find(x=>/\d/.test(x))||''; const cjr=x=>(x.match(/[一-鿿]/g)||[]).length/Math.max(1,x.replace(/\s/g,'').length); const cjk=L.slice().sort((a,b)=>cjr(b)-cjr(a))[0]||T;
  switch(l){
    case 'headline': return {h:T};
    case 'promo': return {h:L[0]||T, b:L.slice(1,Math.max(1,L.length-1)).join('\n'), k:L.length>1?L[L.length-1]:''};
    case 'stack': return {h:line(i)||T, s:line(i+1)};
    case 'kicker': return {k:line(i+2)||'', h:line(i)||T, s:''};
    case 'body': return {h:T.replace(/\n/g,' '), b:L.join('，')};
    case 'stat': {const m=dig.match(/[\d][\d.:,/]*/); return {h:m?m[0]:(L[0]||'01'), s:m?dig.replace(m[0],'').trim()||L[1]||'':L[1]||''}}
    case 'info': return {b:L.join('\n')};
    case 'quote': return {h:L[1]||T.replace(/\n/g,' '), s:L[0]||''};
    case 'vert': return {h:cjk.replace(/[\s·・,，.。]/g,'')};
    case 'badge': return {h:[...L,...titleWords()].sort((a,b)=>a.length-b.length)[0]||''};
    case 'cta': return {h:L[L.length-1]||'查看'};
    case 'ticker': return {h:(L.length?L:titleWords()).join(' · ')};
  }
  return {}}
function txContent(l,i){const d=txDefault(l,i); const o=(S.over[i]&&S.over[i].txt)||{}; const out={}; ['k','h','s','b'].forEach(k=>{out[k]=(o[k]!==undefined&&o[k]!==null)?o[k]:(d[k]||'')}); return out}
function txAlign(i){const o=S.over[i]||{}; if(o.al) return o.al; return isCute()?'c':'l'}
function txOff(i){const o=S.over[i]||{}; return o.sz||0}
// wrap latin by words, CJK by characters
// line breaking: latin words stay whole, CJK breaks between characters, punctuation never starts a line,
// no single-character last line, and wrapped lines are balanced instead of one long line + a short tail
const NOHEAD='，。、！？：；）》」』】…·,.!?:;)]}%';
function wrapRaw(ctx,para,maxW,size,wt){const tk=para.match(/[　-鿿＀-￯][，。、！？：；）》」』】…·,.!?:;%]*|[^\s　-鿿＀-￯]+|\s+/g)||['']; const out=[]; let cur='';
  for(const t_ of tk){const test=cur+t_; if(!cur.trim()||measure(ctx,test.trim(),size,wt)<=maxW) cur=test; else {out.push(cur.trim()); cur=t_.replace(/^\s+/,'')}}
  out.push(cur.trim());
  // lines must not start with punctuation
  for(let k=1;k<out.length;k++){while(out[k]&&NOHEAD.includes(out[k][0])){out[k-1]+=out[k][0]; out[k]=out[k].slice(1)}}
  // avoid a lone CJK character on the last line
  const n=out.length; if(n>1&&[...out[n-1]].length===1&&/[一-鿿]/.test(out[n-1])){const prev=[...out[n-2]]; if(prev.length>2){out[n-1]=prev.pop()+out[n-1]; out[n-2]=prev.join('')}}
  return out.filter(x=>x!=='')}
function wrap(ctx,str,maxW,size,wt){const out=[];
  for(const para of String(str).split('\n')){let ls=wrapRaw(ctx,para,maxW,size,wt);
    if(ls.length>1){const total=measure(ctx,para,size,wt); for(let f=1.02;f<1.6;f+=0.04){const w2=Math.min(maxW,total/ls.length*f); const t2=wrapRaw(ctx,para,w2,size,wt); if(t2.length===ls.length){ls=t2; break}}}
    out.push(...(ls.length?ls:['']))}
  return out}
// items: {key,step,wt,up,alpha,lh,gap,wrap,color}
function txItems(l,c){const it=[];
  switch(l){
    case 'headline': it.push({t:c.h,step:0,wt:900,lh:0.98}); break;
    case 'stack': it.push({t:c.h,step:1,wt:900,lh:1.0}); if(c.s) it.push({t:c.s,step:3,wt:700,lh:1.25,gap:0.45,alpha:0.9}); break;
    case 'kicker': if(c.k) it.push({t:c.k,step:4,wt:700,up:1,lh:1.2,alpha:0.85,rule:1}); it.push({t:c.h,step:0,wt:900,lh:0.98,gap:c.k?0.5:0}); if(c.s) it.push({t:c.s,step:3,wt:500,lh:1.3,gap:0.5,alpha:0.85}); break;
    case 'body': if(c.h) it.push({t:c.h,step:2,wt:900,lh:1.05}); it.push({t:c.b,step:4,wt:500,lh:1.55,gap:c.h?0.7:0,alpha:0.88,para:1}); break;
    case 'stat': it.push({t:c.h,step:-1,wt:900,lh:0.92}); if(c.s) it.push({t:c.s,step:4,wt:700,lh:1.3,gap:0.35,rule:2}); break;
    case 'promo': it.push({t:c.h,step:1,wt:900,lh:1.0}); String(c.b||'').split('\n').map(z=>z.trim()).filter(Boolean).forEach((z,k)=>it.push({t:z,step:3,wt:700,lh:1.3,gap:k?0.35:0.7,bullet:1})); if(c.k) it.push({t:c.k,step:4,wt:900,lh:2.3,gap:0.9,cta:1}); break;
    case 'quote': it.push({t:'“',step:0,wt:900,lh:0.6,color:'ac'}); it.push({t:c.h,step:2,wt:900,lh:1.2,gap:0.1,para:1}); if(c.s) it.push({t:'— '+c.s,step:4,wt:500,lh:1.3,gap:0.6,alpha:0.8}); break;
  }
  return it}
const LAYCACHE=new Map();
function txLayout(ctx,l,c,w,h,off){const key=[l,c.k,c.h,c.s,c.b,Math.round(w),Math.round(h),off,fam(),S.aspect].join('\u0001'); if(LAYCACHE.has(key)) return LAYCACHE.get(key);
  const sc=scale(); const items=txItems(l,c); let res=null;
  const passes=[]; for(let o=off;o<off+3;o++) passes.push([o,false]); for(let o=off;o<off+4;o++) passes.push([o,true]);
  for(const [o,allowWrap] of passes){const lay=[]; let H=0, ok=true;
    for(const itm of items){let size;
      if(itm.step===-1){size=stepFit(ctx,[itm.t],w,h*0.62,Math.max(0,o-1),0.92)*1.25; size=Math.min(size,h*0.62); const mw=measure(ctx,itm.t,size,itm.wt); if(mw>w) size*=w/mw}
      else size=sc[Math.max(0,Math.min(5,itm.step+o))];
      const txt=itm.up?String(itm.t).toUpperCase():itm.t; const iw=w-(itm.bullet?size*1.4:itm.cta?size*2.8:0); const ls=(allowWrap||itm.para)?wrap(ctx,txt,iw,size,itm.wt):String(txt).split('\n');
      if(ls.some(x=>measure(ctx,x,size,itm.wt)>iw*1.001)) ok=false;
      const lh=itm.lh+(/[一-鿿]/.test(txt)&&itm.lh<1.15?0.12:0); const gap=(itm.gap||0)*size; H+=gap+(itm.rule===1?size*0.9:0)+(itm.rule===2?size*0.9:0)+ls.length*size*lh;
      lay.push(Object.assign({},itm,{size,ls,gapPx:gap,lh}))}
    res={lay,H,scale:1,o}; if(ok&&H<=h) break}
  if(res.H>h){const k=h/res.H; res.scale=k; res.lay.forEach(x=>{x.size*=k; x.gapPx*=k}); res.H=h}
  else { // grow with the cell: scale the whole block (hierarchy ratios kept) until it meets the cell's width or height
    const KMAX={headline:1.9,stat:1.7,stack:1.6,kicker:1.55,quote:1.35,body:1.25}[l]||1.3; let mw=1;
    res.lay.forEach(x=>x.ls.forEach(ln=>{mw=Math.max(mw,measure(ctx,ln,x.size,x.wt))}));
    // size option sets how much of the cell the block fills: 大 = full, 标准 = 80%, 小 = 60%
    const F=off<0?1:off>0?0.6:0.8, KM=KMAX*(off<0?1.45:off>0?0.8:1);
    let k=Math.min(KM,Math.min(w/mw,h/res.H)*F); if(off<=0) k=Math.max(1,k); else k=Math.max(0.55,k);
    if(Math.abs(k-1)>0.001){res.lay.forEach(x=>{x.size*=k; x.gapPx*=k}); res.H*=k}}
  if(LAYCACHE.size>400) LAYCACHE.clear(); LAYCACHE.set(key,res); return res}
function txPad(w,h){return Math.max(14,Math.min(w,h)*0.09)}
function txFit(l,i,R){const pd=txPad(R.w,R.h), c=txContent(l,i); if(['badge','cta','ticker','info','vert'].includes(l)) return {bad:0};
  const L=txLayout(MC,l,c,R.w-2*pd,R.h-2*pd,txOff(i)); let bad=0; if(L.scale<0.85) bad+=4; if(L.o-txOff(i)>=2) bad+=2; return {bad}}
function revealLine(ctx,str,x,y,size,col,wt,al,it,d,cute,alpha){
  if(cute){const s=spring(it-d,1.8,0.5); if(s<=0) return; ctx.save(); ctx.globalAlpha=(alpha||1)*clamp(s*2.5); ctx.translate(0,(1-s)*size*0.6); drawStr(ctx,str,x,y,size,col,wt,al); ctx.restore()}
  else {const pr=E.expoOut(P(it,d,0.9)); if(pr<=0) return; ctx.save(); ctx.globalAlpha=alpha||1; ctx.beginPath(); ctx.rect(-1e5,y-size*0.95,2e5,size*1.22); ctx.clip(); drawStr(ctx,str,x,y+(1-pr)*size*1.1,size,col,wt,al); ctx.restore()}}
function drawStr(ctx,str,x,y,size,col,wt,al){ctx.font=font(size,wt); ctx.textAlign=al==='c'?'center':al==='r'?'right':'left'; ctx.textBaseline='alphabetic'; ctx.fillStyle=col;
  if(isCute()&&wt>=900&&!/[　-鿿＀-￯]/.test(str)){ctx.lineJoin='round'; ctx.lineWidth=size*0.04; ctx.strokeStyle=col; ctx.strokeText(str,x,y)} ctx.fillText(str,x,y)}
function txCell(ctx,l,R,t,it,fill,fg,ac,i,cute){
  const {x,y,w,h}=R, pd=txPad(w,h), c=txContent(l,i), al=txAlign(i), off=txOff(i); const sc=scale();
  const ax=al==='c'?x+w/2:al==='r'?x+w-pd:x+pd;
  if(l==='ticker'){const str=(c.h||' ')+' · '; const sz=Math.min(sc[Math.max(0,1+off)],h*0.62); ctx.save(); ctx.font=font(sz); const tw=Math.max(10,ctx.measureText(str).width); const o=-((t*sz*1.1)%tw);
    for(let k=0;k<Math.ceil(w/tw)+2;k++) drawStr(ctx,str,x+o+k*tw,y+h/2+sz*0.36,sz,fg,900,'l'); ctx.restore(); return}
  if(l==='badge'){const e=cute?spring(it,1.6,0.5):E.expoOut(P(it,0,0.9)); const ow=(w-2*pd)*e, oh=Math.min(h*0.6,ow*0.55)*(1+0.02*Math.sin(t*2+i)); ctx.save(); ctx.translate(x+w/2,y+h/2); ctx.fillStyle=ac; ctx.beginPath(); ctx.ellipse(0,0,Math.max(0,ow/2),Math.max(0,oh/2),0,0,TAU); ctx.fill();
    const sz=stepFit(ctx,[c.h],ow*0.7,oh*0.5,2+off,1.0); drawStr(ctx,c.h,0,sz*0.36,sz,onCol(ac),900,'c'); ctx.restore(); return}
  if(l==='cta'){let sz=Math.min(sc[Math.max(0,3+off)],h*0.3); const maxTw=w-2*pd; let tw=measure(ctx,c.h,sz)+sz*2.6; if(tw>maxTw){sz*=maxTw/tw; tw=maxTw} const th=sz*2; const e=cute?spring(it,2,0.42):E.expoOut(P(it,0,0.8));
    const bx=al==='c'?x+w/2:al==='r'?x+w-pd-tw/2:x+pd+tw/2;
    ctx.save(); ctx.translate(bx,y+h/2); ctx.scale(cute?e:1,e); ctx.fillStyle=fg; rr(ctx,-tw/2,-th/2,tw,th,cute?th/2:Math.max(2,S.radius*0.5)); ctx.fill();
    drawStr(ctx,c.h,-sz*0.6,sz*0.36,sz,fill,900,'c'); ctx.translate(tw/2-sz*1.1+Math.sin(t*4)*sz*0.15,0); ctx.strokeStyle=fill; ctx.lineWidth=sz*0.14; ctx.lineCap=cute?'round':'butt'; ctx.lineJoin=cute?'round':'miter'; ctx.beginPath(); ctx.moveTo(-sz*0.4,0); ctx.lineTo(sz*0.4,0); ctx.moveTo(0,-sz*0.35); ctx.lineTo(sz*0.4,0); ctx.lineTo(0,sz*0.35); ctx.stroke(); ctx.restore(); return}
  if(l==='info'){const rows=String(c.b).split('\n').map(z=>z.trim()).filter(Boolean); if(!rows.length) return; const iw=w-2*pd, ih=h-2*pd; const lh=ih/rows.length;
    let fs=sc[Math.max(0,3+off)]; fs=Math.min(fs,lh*0.5); rows.forEach(r=>{const pr=r.split('|'); const need=measure(ctx,pr[0],fs,500)+(pr[1]?measure(ctx,pr[1],fs,900)+fs:0); if(need>iw) fs*=iw/need});
    rows.forEach((r,k)=>{const pr=E.expoOut(P(it,0.1+k*0.1,0.8)); const yy=y+pd+k*lh+lh*0.6; ctx.fillStyle=fg; ctx.globalAlpha=0.35; ctx.fillRect(x+pd,yy+lh*0.25,iw*pr,Math.max(1.2,fs*0.05)); ctx.globalAlpha=pr;
      const parts=r.split('|'); if(parts[1]!==undefined){drawStr(ctx,parts[0].trim(),x+pd,yy,fs,fg,500,'l'); drawStr(ctx,parts[1].trim(),x+w-pd,yy,fs,fg,900,'r')} else drawStr(ctx,r,ax,yy,fs,fg,700,al); ctx.globalAlpha=1}); return}
  if(l==='vert'&&w>h*0.9){l='headline'}
  if(l==='vert'){const chars=[...String(c.h).replace(/\s/g,'')]; if(!chars.length) return; const ih=h-2*pd, iw=w-2*pd; const fk=off>0?0.78:off<0?1:0.9; let sz=Math.min(ih/(chars.length*1.05),iw/1.15)*fk; let per=chars.length; let cols=1; if(sz<sc[3]){sz=sc[Math.max(0,2+off)]; per=Math.max(1,Math.floor(ih/(sz*1.05))); cols=Math.ceil(chars.length/per)}
    while(cols*sz*1.15>iw&&sz>sc[5]){sz*=0.92; per=Math.max(1,Math.floor(ih/(sz*1.05))); cols=Math.ceil(chars.length/per)}
    const colW=sz*1.15, total=cols*colW; let x0=(al==='l'?x+pd+total:al==='r'?x+w-pd:x+w/2+total/2)-colW/2;
    const rowsN=Math.min(per,chars.length), colH=rowsN*sz*1.05, top=y+h/2-colH/2;
    chars.forEach((ch,k)=>{const col=Math.floor(k/per), row=k%per; const cx=x0-col*colW, cy=top+row*sz*1.05+sz*0.86; revealLine(ctx,ch,cx,cy,sz,fg,900,'c',it,k*0.035,cute)}); return}
  // block layouts
  const L=txLayout(ctx,l,c,w-2*pd,h-2*pd,off); let yy=y+h/2-L.H/2; let n=0;
  L.lay.forEach(itm=>{yy+=itm.gapPx; const col=itm.color==='ac'?ac:fg;
    if(itm.rule===2){const e=E.expoInOut(P(it,0.3,0.9)); const rw=(w-2*pd)*e; ctx.fillStyle=fg; ctx.globalAlpha=0.5; const rx=al==='c'?x+w/2-rw/2:al==='r'?x+w-pd-rw:x+pd; ctx.fillRect(rx,yy+itm.size*0.2,rw,Math.max(1.5,itm.size*0.07)); ctx.globalAlpha=1; yy+=itm.size*0.9}
    if(itm.cta){const sz=itm.size, tw=measure(ctx,itm.ls[0]||'',sz,900)+sz*2.8, th=sz*2.1; yy+=sz*itm.lh; const e=cute?spring(it-n*0.08,2,0.42):E.expoOut(P(it,n*0.08,0.8)); const cyb=yy-sz*itm.lh/2;
      const bx=al==='c'?x+w/2:al==='r'?x+w-pd-tw/2:x+pd+tw/2; ctx.save(); ctx.translate(bx,cyb); ctx.scale(cute?e:1,e); ctx.fillStyle=fg; rr(ctx,-tw/2,-th/2,tw,th,cute?th/2:Math.max(2,S.radius*0.4)); ctx.fill();
      drawStr(ctx,itm.ls[0]||'',-sz*0.55,sz*0.36,sz,fill,900,'c'); ctx.translate(tw/2-sz*1.05+Math.sin(t*4)*sz*0.12,0); ctx.strokeStyle=fill; ctx.lineWidth=sz*0.14; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath(); ctx.moveTo(-sz*0.38,0); ctx.lineTo(sz*0.38,0); ctx.moveTo(0,-sz*0.32); ctx.lineTo(sz*0.38,0); ctx.lineTo(0,sz*0.32); ctx.stroke(); ctx.restore(); n++; return}
    itm.ls.forEach((ln,li)=>{yy+=itm.size*itm.lh; const by=yy-itm.size*(itm.lh-0.82); let tx=ax;
      if(itm.bullet){const sz=itm.size, ind=sz*1.4; const tw=measure(ctx,ln,sz,itm.wt); const bxl=al==='c'?x+w/2-(tw+ind)/2:al==='r'?x+w-pd-tw-ind:x+pd; tx=al==='c'?bxl+ind+tw/2:al==='r'?x+w-pd:x+pd+ind;
        if(li===0){const e=cute?spring(it-n*0.08,2,0.45):E.expoOut(P(it,n*0.08,0.6)); const cx2=bxl+sz*0.5, cy2=by-sz*0.34; ctx.save(); ctx.translate(cx2,cy2); ctx.scale(e,e); ctx.fillStyle=ac; ctx.beginPath(); ctx.arc(0,0,sz*0.5,0,TAU); ctx.fill();
          ctx.strokeStyle=onCol(ac); ctx.lineWidth=sz*0.13; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.beginPath(); ctx.moveTo(-sz*0.22,0); ctx.lineTo(-sz*0.05,sz*0.17); ctx.lineTo(sz*0.24,-sz*0.17); ctx.stroke(); ctx.restore()}}
      revealLine(ctx,ln,tx,by,itm.size,col,itm.wt,itm.bullet&&al==='c'?'c':al,it,n*0.08,cute,itm.alpha); n++});
    if(itm.rule===1){const e=E.expoInOut(P(it,0.2,0.8)); const rw=itm.size*2.4*e; ctx.fillStyle=col; ctx.globalAlpha=itm.alpha||1; const rx=al==='c'?x+w/2-rw/2:al==='r'?x+w-pd-rw:x+pd; ctx.fillRect(rx,yy+itm.size*0.35,rw,Math.max(2,itm.size*0.12)); ctx.globalAlpha=1; yy+=itm.size*0.9}
  });
}

// ---------- cell renderers (all scale to any w,h) ----------
function cell(ctx,type,R,t,it,fill,i){
  const {x,y,w,h}=R, cx=x+w/2, cy=y+h/2, m=Math.min(w,h), p=S.pal, fg=onCol(fill), cute=isCute();
  const T=S.text; const lab=Math.max(12,Math.min(24,m*0.075));
  if(type.startsWith('tx:')){txCell(ctx,type.slice(3),R,t,it,fill,fg,ac0(fill,i),i,cute); return}
  const label=s=>{ctx.fillStyle=fg; ctx.globalAlpha=0.8; ctx.font=font(lab,700); ctx.textAlign='left'; ctx.textBaseline='alphabetic'; ctx.fillText(s,x+lab,y+lab*1.9); ctx.globalAlpha=1};
  const accent=[p.c1,p.c2,p.c3,p.c4].filter(c=>c!==fill&&contrast(c,fill)>1.6);
  const ac=accent[i%Math.max(1,accent.length)]||fg;
  switch(type){
    case 'prod':{ hero(ctx,R,t,it,fill,fg,ac,i,cute); break}
    case 'title':{
      const ls=T.title.split('\n'); const padX=w*0.08; const sz=stepFit(ctx,ls,w-2*padX,h*0.78,0,1.0);
      const total=ls.length*sz*1.0; let by=cy-total/2+sz*0.8;
      ls.forEach((ln,li)=>{
        if(cute){ctx.font=font(sz); let xx=cx-measure(ctx,ln,sz)/2;
          [...ln].forEach((ch,ci)=>{const cw=measure(ctx,ch,sz); const s=spring(it-li*0.1-ci*0.04,1.9,0.5); if(s>0){ctx.save(); ctx.globalAlpha=clamp(s*3); ctx.translate(xx+cw/2,by+(1-s)*sz*0.8); ctx.rotate((1-s)*0.25*(ci%2?1:-1)); txt(ctx,ch,0,0,sz,fg); ctx.restore()} xx+=cw});
        } else {let xx=x+padX; ln.split(' ').forEach((wd,wi)=>{const pr=E.expoOut(P(it,li*0.12+wi*0.07,0.9)); const ww=measure(ctx,wd,sz); ctx.save(); ctx.beginPath(); ctx.rect(xx-4,by-sz*0.95,ww+8,sz*1.16); ctx.clip(); txt(ctx,wd,xx,by+(1-pr)*sz*1.05,sz,fg,{align:'left'}); ctx.restore(); xx+=ww+measure(ctx,' ',sz)})}
        by+=sz*1.0});
      break}
    case 'ticker':{
      const str=(lines().length?lines():titleWords()).join(' · ')+' · '; const sc=scale();
      const sz=Math.min(stepFit(ctx,['Ag'],1e9,h*0.7,0,1.0),sc[1]); ctx.save(); ctx.font=font(sz); const tw=Math.max(10,ctx.measureText(str).width); const off=-((t*sz*1.1)%tw);
      for(let k=0;k<Math.ceil(w/tw)+2;k++) txt(ctx,str,x+off+k*tw,cy+sz*0.36,sz,fg,{align:'left'});
      ctx.restore(); break}
    case 'count':{ // the first line that contains digits rolls in like a counter; otherwise show a short line large
      const L=lines(); const str=L.find(l=>/\d/.test(l))||line(i)||titleWords()[0]||''; const padX=w*0.08;
      const sz=stepFit(ctx,[str],w-2*padX,h*0.7,0,1.0); const bw=measure(ctx,str,sz); let xx=cx-bw/2; const base=cy+sz*0.36;
      [...str].forEach((ch,ci)=>{const cw=measure(ctx,ch,sz); const d=parseInt(ch);
        if(isNaN(d)){const pr=E.expoOut(P(it,ci*0.05,0.8)); ctx.save(); ctx.globalAlpha=pr; txt(ctx,ch,xx+cw/2,base,sz,fg); ctx.restore()} else {ctx.save(); ctx.beginPath(); ctx.rect(xx-2,base-sz*0.8,cw+4,sz*0.9); ctx.clip(); const spins=6+ci*2, pos=E.expoOut(P(it,ci*0.12,1.6))*(spins+d), f=Math.floor(pos), fr=pos-f;
          for(let k=0;k<=1;k++){const v=(((f+k-spins)%10)+10)%10; txt(ctx,String(v),xx+cw/2,base+(fr-k)*sz*0.92,sz,fg)} ctx.restore()}
        xx+=cw}); break}
    case 'dial':{
      const R0=m*0.36, dx=cx, dy=cy+m*0.04, a0=Math.PI*0.75, span=Math.PI*1.5, tp=E.expoOut(P(it,0,1.4));
      const n=cute?12:48;
      for(let k=0;k<=n;k++){const a=a0+span*k/n; const on=k/n<=tp; const long=cute||k%6===0; ctx.strokeStyle=fg; ctx.globalAlpha=on?1:0.2; ctx.lineWidth=cute?m*0.03:(long?Math.max(2,m*0.016):Math.max(1.2,m*0.009)); ctx.lineCap=cute?'round':'butt'; ctx.beginPath(); ctx.moveTo(dx+Math.cos(a)*R0*(long?0.78:0.86),dy+Math.sin(a)*R0*(long?0.78:0.86)); ctx.lineTo(dx+Math.cos(a)*R0,dy+Math.sin(a)*R0); ctx.stroke()} ctx.globalAlpha=1;
      const val=0.3+0.4*E.expoOut(P(it,0.2,1.6))+Math.sin(t*1.7+i)*0.05; const an=a0+span*val;
      ctx.strokeStyle=ac; ctx.lineWidth=Math.max(3,m*0.025); ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(dx,dy); ctx.lineTo(dx+Math.cos(an)*R0*0.72,dy+Math.sin(an)*R0*0.72); ctx.stroke(); ctx.lineCap='butt';
      ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(dx,dy,m*0.035,0,TAU); ctx.fill();
      txt(ctx,Math.round(val*100)+'%',dx,dy+R0*0.66,m*0.13,fg); break}
    case 'swatch':{
      const cols=[p.c1,p.c2,p.c3,p.c4,p.ink].filter(c=>c!==fill); const n=cols.length, pad=m*0.08, sw=(w-2*pad)/n;
      cols.forEach((c,k)=>{const pr=E.expoOut(P(it,k*0.08,0.8)); const hh=(h-2*pad-lab*1.6)*pr*(1+0.04*Math.sin(t*2+k)); ctx.fillStyle=c;
        if(cute){rr(ctx,x+pad+k*sw+2,y+h-pad-hh,sw-4,hh,sw*0.45); ctx.fill()} else ctx.fillRect(x+pad+k*sw,y+h-pad-hh,sw-4,hh)});
      break}
    case 'dots':{
      const g=Math.max(18,m/5.2); const nx=Math.floor(w/g), ny=Math.floor(h/g); const ox=x+(w-nx*g)/2+g/2, oy=y+(h-ny*g)/2+g/2;
      for(let a=0;a<nx;a++) for(let b=0;b<ny;b++){const d=(a+b)/(nx+ny); const e=E.expoOut(P(it,d*0.9,0.7)); const rip=0.5+0.5*Math.sin(t*3-(a+b)*0.55);
        const rad=g*0.36*e*(0.55+0.45*rip); ctx.fillStyle=fg; ctx.beginPath(); if(cute){ctx.arc(ox+a*g,oy+b*g,rad,0,TAU)} else {ctx.rect(ox+a*g-rad*0.8,oy+b*g-rad*0.8,rad*1.6,rad*1.6)} ctx.fill()}
      break}
    case 'spec':{ // all text lines as a ruled list, one size for every row
      const rows=lines(); if(!rows.length) break; const padX=w*0.08, padY=h*0.1; const lh=(h-2*padY)/rows.length;
      const fs=stepFit(ctx,rows.map(r=>r.replace('|','  ')),w-2*padX,Math.min(lh*0.55,scale()[3])*rows.length,3,1.0,700);
      rows.forEach((r,k)=>{const pr=E.expoOut(P(it,0.15+k*0.12,0.8)); const yy=y+padY+k*lh+lh*0.62;
        ctx.fillStyle=fg; ctx.globalAlpha=0.85; ctx.fillRect(x+padX,yy+lh*0.24,(w-2*padX)*pr,Math.max(1.5,fs*0.06)); ctx.globalAlpha=pr;
        const parts=r.split('|'); ctx.font=font(fs,700); ctx.textAlign='left'; ctx.fillText(parts[0].trim(),x+padX,yy); if(parts[1]){ctx.textAlign='right'; ctx.fillText(parts[1].trim(),x+w-padX,yy)} ctx.globalAlpha=1});
      break}
    case 'shape':{ // morphing shape: circle -> flower -> half-moons
      const e=cute?spring(it,1.6,0.45):E.expoOut(P(it,0,0.9)); const R0=m*0.36*e;
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(t*0.4*(i%2?1:-1));
      if(cute){const k=6, ph=t*1.3; ctx.fillStyle=ac; ctx.beginPath(); for(let s=0;s<=240;s++){const th=s/240*TAU; const rr_=R0*(0.82+0.18*Math.abs(Math.cos(k*th/2))*(0.6+0.4*Math.sin(ph)) ); ctx.lineTo(Math.cos(th)*rr_,Math.sin(th)*rr_)} ctx.closePath(); ctx.fill();
        ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(0,0,R0*0.28,0,TAU); ctx.fill()}
      else {const sp=Math.sin(t*1.2)*0.5+0.5; ctx.fillStyle=ac; ctx.beginPath(); ctx.arc(-R0*0.25*sp,0,R0,Math.PI/2,Math.PI*1.5); ctx.closePath(); ctx.fill(); ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(R0*0.25*sp,0,R0,-Math.PI/2,Math.PI/2); ctx.closePath(); ctx.fill()}
      ctx.restore(); break}
    case 'stripes':{
      const sw=Math.max(14,m/7); const off=(t*sw*0.8)%(sw*2); const e=E.expoOut(P(it,0,1.0));
      ctx.save(); ctx.translate(cx,cy); ctx.rotate(cute?-0.5:-Math.PI/4); ctx.fillStyle=fg; ctx.globalAlpha=cute?0.9:1; const L=Math.hypot(w,h);
      for(let k=-L;k<L;k+=sw*2){const yy=k+off; if(cute){ctx.beginPath(); for(let s=-L;s<=L;s+=12){ctx.lineTo(s,yy+Math.sin(s*0.02+t*2)*sw*0.25)} for(let s=L;s>=-L;s-=12){ctx.lineTo(s,yy+sw*e+Math.sin(s*0.02+t*2)*sw*0.25)} ctx.closePath(); ctx.fill()} else ctx.fillRect(-L,yy,2*L,sw*e)}
      ctx.restore(); break}
    case 'face':{ // cute: blinking face; spec: arrow that nudges
      const e=cute?spring(it,1.6,0.45):E.expoOut(P(it,0,0.9));
      ctx.save(); ctx.translate(cx,cy); ctx.scale(e,e);
      if(cute){const R0=m*0.34; ctx.fillStyle=ac; ctx.beginPath(); ctx.arc(0,0,R0,0,TAU); ctx.fill(); const bl=((t+i*0.7)%3.1)>2.98?0.12:1; ctx.fillStyle=onCol(ac); ctx.beginPath(); ctx.ellipse(-R0*0.33,-R0*0.1,R0*0.09,R0*0.13*bl,0,0,TAU); ctx.ellipse(R0*0.33,-R0*0.1,R0*0.09,R0*0.13*bl,0,0,TAU); ctx.fill(); ctx.strokeStyle=onCol(ac); ctx.lineWidth=R0*0.08; ctx.lineCap='round'; ctx.beginPath(); ctx.arc(0,R0*0.1,R0*0.28,0.2*Math.PI,0.8*Math.PI); ctx.stroke()}
      else {const L=m*0.3, nud=Math.sin(t*3)*m*0.03; ctx.translate(nud,0); ctx.strokeStyle=fg; ctx.lineWidth=Math.max(4,m*0.05); ctx.lineCap='square'; ctx.beginPath(); ctx.moveTo(-L,0); ctx.lineTo(L,0); ctx.moveTo(L*0.35,-L*0.65); ctx.lineTo(L,0); ctx.lineTo(L*0.35,L*0.65); ctx.stroke()}
      ctx.restore(); break}
    case 'sparkle':{
      const r=rng(i*97+1); const n=5;
      for(let k=0;k<n;k++){const px=x+w*(0.15+r()*0.7), py=y+h*(0.15+r()*0.7), s=m*(0.08+r()*0.1); const e=cute?spring(it-k*0.08,2,0.4):E.expoOut(P(it,k*0.08,0.6)); const tw=0.8+0.2*Math.sin(t*4+k*1.7);
        ctx.save(); ctx.translate(px,py); ctx.rotate(t*0.5*(k%2?1:-1)); ctx.scale(e*tw,e*tw); ctx.fillStyle=k%2?fg:ac;
        if(cute){if(k%3===0){heart(ctx,0,0,s)} else {ctx.beginPath(); for(let q=0;q<8;q++){const a=q/8*TAU, rad=q%2?s*0.22:s; ctx.lineTo(Math.cos(a)*rad,Math.sin(a)*rad)} ctx.closePath()} ctx.fill()}
        else {ctx.fillRect(-s,-s*0.16,2*s,s*0.32); ctx.fillRect(-s*0.16,-s,s*0.32,2*s)}
        ctx.restore()}
      break}
    case 'checker':{
      const q=Math.max(14,m/6); const off=(t*q*0.5)%(2*q); const e=E.expoOut(P(it,0,1.0)); ctx.fillStyle=fg; ctx.globalAlpha=cute?0.85:1;
      for(let yy=-2;yy<h/q+2;yy++) for(let xx=-2;xx<w/q+2;xx++){if((xx+yy)%2) continue; const px=x+xx*q+off*(cute?1:0), py=y+yy*q+(cute?0:off); const s=q*e*(cute?0.86:1);
        if(cute){ctx.beginPath(); ctx.arc(px+q/2,py+q/2,s/2,0,TAU); ctx.fill()} else ctx.fillRect(px+(q-s)/2,py+(q-s)/2,s,s)}
      ctx.globalAlpha=1; break}
    case 'letter':{
      const W_=titleWords(); const ch=([...(W_[i%Math.max(1,W_.length)]||'A')][0])||'A'; const sz=fitSize(ctx,[ch],w*0.8,h*0.82); const e=cute?spring(it,1.4,0.5):E.expoOut(P(it,0,1.0));
      ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip(); ctx.translate(cx,cy+sz*0.36+(cute?0:(1-e)*h)); if(cute){ctx.scale(e,e); ctx.rotate(Math.sin(t*1.2+i)*0.05)} txt(ctx,ch,0,0,sz,fg); ctx.restore(); break}
    case 'cta':{ // the last text line as a button
      const L=lines(); const str=L[L.length-1]||titleWords()[0]||''; const sc=scale(); let sz=Math.min(sc[3],h*0.3); const maxTw=w*0.84; let tw=measure(ctx,str,sz)+sz*2.6; if(tw>maxTw){sz*=maxTw/tw; tw=maxTw} const th=sz*2;
      const e=cute?spring(it,2,0.42):E.expoOut(P(it,0,0.8));
      ctx.save(); ctx.translate(cx,cy); ctx.scale(cute?e:1,e); ctx.fillStyle=fg; rr(ctx,-tw/2,-th/2,tw,th,cute?th/2:Math.max(2,S.radius*0.5)); ctx.fill();
      txt(ctx,str,-sz*0.6,sz*0.36,sz,fill); ctx.translate(tw/2-sz*1.1+Math.sin(t*4)*sz*0.15,0); ctx.strokeStyle=fill; ctx.lineWidth=sz*0.14; ctx.lineCap=cute?'round':'butt'; ctx.lineJoin=cute?'round':'miter'; ctx.beginPath(); ctx.moveTo(-sz*0.4,0); ctx.lineTo(sz*0.4,0); ctx.moveTo(0,-sz*0.35); ctx.lineTo(sz*0.4,0); ctx.lineTo(0,sz*0.35); ctx.stroke(); ctx.restore();
      break}
    case 'plain':{ // solid colour block: a slow inner light drift keeps it alive
      if(!cute){ctx.save(); ctx.globalAlpha=0.06; const g=ctx.createLinearGradient(x,y,x+w,y+h); const k=0.5+0.5*Math.sin(t*0.6+i); g.addColorStop(0,'#fff'); g.addColorStop(k,'rgba(255,255,255,0)'); g.addColorStop(1,'#000'); ctx.fillStyle=g; ctx.fillRect(x,y,w,h); ctx.restore()}
      break}
    case 'note2':{ // one text line at a fixed step, the next line below it one step smaller
      const a=line(i), b2=line(i+1); if(!a) break; const padX=w*0.08; const sz=stepFit(ctx,[a],w-2*padX,h*0.5,1,1.0); const sc=scale(); const sz2=Math.min(sc[4],sz*0.5);
      const pr=cute?spring(it,1.7,0.5):E.expoOut(P(it,0,0.9)); const by=cy+(b2&&b2!==a?-sz2*0.6:sz*0.36);
      ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip(); txt(ctx,a,x+padX,by+(1-pr)*sz,sz,fg,{align:'left'});
      if(b2&&b2!==a&&measure(ctx,b2,sz2,700)<w-2*padX){ctx.globalAlpha=pr*0.85; ctx.font=font(sz2,700); ctx.fillStyle=fg; ctx.textAlign='left'; ctx.fillText(b2,x+padX,by+sz2*1.7)} ctx.restore(); break}
    case 'plainGround': break;
    case 'notedot':{const sc=scale(); const fs=sc[5]; ctx.fillStyle=fg; ctx.globalAlpha=E.expoOut(P(it,0,0.9)); ctx.beginPath(); const rr2=fs*0.9; ctx.arc(x+w-fs*2,y+h-fs*2,rr2,0,TAU); ctx.arc(x+w-fs*4,y+h-fs*2,rr2,0,TAU); ctx.fill(); ctx.globalAlpha=1; break}
    case 'note':{ // whitespace cell: fine print, smallest steps of the scale
      const sc=scale(); const e=E.expoOut(P(it,0,0.9)); const fs=sc[5]; const v=i%3; const padX=Math.max(fs*0.6,w*0.04);
      ctx.save(); ctx.globalAlpha=e; ctx.fillStyle=fg; ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      {ctx.font=font(fs,700); lines().slice(0,4).forEach((l,k)=>{if(measure(ctx,l,fs,700)<w-2*padX) ctx.fillText(l,x+padX,y+fs*(2+k*1.45))})}
      if(false){ctx.beginPath(); const rr2=fs*0.9; ctx.arc(x+w-fs*2,y+h-fs*2,rr2,0,TAU); ctx.arc(x+w-fs*4,y+h-fs*2,rr2,0,TAU); ctx.fill()}
      ctx.restore(); break}
    case 'halftone':{ // dot gradient that drifts diagonally
      const g=Math.max(10,m/11); const nx=Math.ceil(w/g)+1, ny=Math.ceil(h/g)+1; const e=E.expoOut(P(it,0,1.0)); const ph=t*0.25;
      ctx.fillStyle=fg;
      for(let a=0;a<nx;a++) for(let b=0;b<ny;b++){const u=(a/nx+b/ny)/2; const v=0.5+0.5*Math.sin((u-ph)*TAU); const rad=g*0.48*v*e; if(rad<0.6) continue; ctx.beginPath(); ctx.arc(x+a*g+(b%2?g/2:0),y+b*g,rad,0,TAU); ctx.fill()}
      break}
    case 'oval':{ // pill badge with a short word, breathing
      const e=cute?spring(it,1.6,0.5):E.expoOut(P(it,0,0.9)); const ow=w*0.8*e, oh=Math.min(h*0.62,ow*0.55)*(1+0.02*Math.sin(t*2+i));
      const cand=[...lines(),...titleWords()].filter(Boolean).sort((a,b2)=>a.length-b2.length); const word=cand[i%Math.max(1,Math.min(3,cand.length))]||'';
      ctx.save(); ctx.translate(cx,cy); ctx.fillStyle=ac; ctx.beginPath(); ctx.ellipse(0,0,Math.max(0,ow/2),Math.max(0,oh/2),0,0,TAU); ctx.fill();
      const sz=stepFit(ctx,[word],ow*0.68,oh*0.5,2,1.0); txt(ctx,word,0,sz*0.36,sz,onCol(ac)); ctx.restore(); break}
    case 'lens':{ // ring with a grid inside and soft blobs floating behind it
      const R0=m*0.38*(cute?spring(it,1.5,0.5):E.expoOut(P(it,0,1.0))); if(R0<4) break;
      ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R0,0,TAU); ctx.clip(); ctx.fillStyle=p.paper; ctx.fillRect(x,y,w,h);
      for(let k=0;k<4;k++){const bx=cx+Math.sin(t*0.6+k*1.7)*R0*0.55, by=cy+Math.cos(t*0.5+k*2.3)*R0*0.55; const gr=ctx.createRadialGradient(bx,by,0,bx,by,R0*0.45); gr.addColorStop(0,ac); gr.addColorStop(1,'rgba(255,255,255,0)'); ctx.fillStyle=gr; ctx.fillRect(x,y,w,h)}
      ctx.strokeStyle=p.ink; ctx.globalAlpha=0.35; ctx.lineWidth=1; const gs=R0/7; for(let gx=cx-R0;gx<=cx+R0;gx+=gs){ctx.beginPath(); ctx.moveTo(gx,cy-R0); ctx.lineTo(gx,cy+R0); ctx.stroke()} for(let gy=cy-R0;gy<=cy+R0;gy+=gs){ctx.beginPath(); ctx.moveTo(cx-R0,gy); ctx.lineTo(cx+R0,gy); ctx.stroke()}
      ctx.restore(); ctx.strokeStyle=[p.c1,p.c2,p.c3,p.c4].find(c=>c!==fill&&c!==ac)||fg; ctx.lineWidth=Math.max(6,R0*0.12); ctx.beginPath(); ctx.arc(cx,cy,R0,0,TAU); ctx.stroke(); break}
    case 'bands':{ // textile-like stripes in the palette, widths vary, slow drift
      const r=rng(i*131+7); const vert=w<h*1.3; const L=vert?w:h; const cols=[p.c1,p.c2,p.c3,p.c4,p.paper,p.ink].filter(c=>c!==fill);
      const seq=[]; let tot=0; while(tot<L*2.2){const bw=L*(r()<0.3?0.015+r()*0.02:0.05+r()*0.16); seq.push([bw,cols[Math.floor(r()*cols.length)]]); tot+=bw}
      const off=(t*L*0.04)%tot; const e=E.expoOut(P(it,0,1.1));
      ctx.save(); ctx.globalAlpha=0.95; let pos=-off;
      for(let rep=0;rep<2;rep++) for(const [bw,c] of seq){ctx.fillStyle=c; if(vert) ctx.fillRect(x+pos,y,bw+0.5,h*e); else ctx.fillRect(x,y+pos,w*e,bw+0.5); pos+=bw; if(pos>L) break}
      ctx.restore(); break}
    case 'wave':{
      const n=cute?3:5; const e=E.expoOut(P(it,0,1.0)); ctx.strokeStyle=fg; ctx.lineWidth=Math.max(3,m*(cute?0.05:0.018)); ctx.lineCap=cute?'round':'butt';
      for(let k=0;k<n;k++){const yy=y+h*(k+1)/(n+1); ctx.beginPath(); for(let s=0;s<=w*e;s+=6){const ph=s/(w)*TAU*(cute?1.5:3)-t*2.2+k*0.8; ctx.lineTo(x+s,yy+Math.sin(ph)*h*0.07)} ctx.stroke()}
      break}
  }
}

// ---------- timeline ----------
let CACHE={};
function layouts(){
  const gkey=geoKey(); if(S.overKey!==gkey){S.over={}; S.overKey=gkey}
  const edited=S.cells&&S.cellsKey===gkey;
  const key=JSON.stringify([gkey,S.gutter,S.pad,heroKind(),S.blank,S.textMix,S.plainMix,S.cseed,edited?S.cells:0]);
  if(CACHE.key===key) return CACHE;
  const A0=genLayout(S.seed), B=genLayout(S.seed+1); const A=edited?S.cells.map(c=>Object.assign({},c)):A0;
  const types=assign(A0,S.cseed);
  {const r=rng(S.cseed*101+9); let nn=0; const tot=S.cols*S.rows; types.forEach((t,i)=>{if(t!=='prod'&&t!=='title'&&A[i].w*A[i].h<=tot*0.1&&r()<S.blank/100){types[i]=nn===0?'note':(nn%2?'notedot':'plainGround'); nn++}})}
  // map B rects onto A cells by size rank (largest stays the product)
  const ia=[...A.keys()].sort((i,j)=>A[j].w*A[j].h-A[i].w*A[i].h), ib=[...B.keys()].sort((i,j)=>B[j].w*B[j].h-B[i].w*B[i].h);
  const Bm=new Array(A.length); ia.forEach((a,k)=>{Bm[a]=B[ib[k]]||A[a]});
  CACHE={key,A,B:edited?A.map(c=>Object.assign({},c)):Bm,types}; return CACHE;
}
const TEXTT={has:t=>!!t&&(t.startsWith('tx:')||t==='note'||t==='letter')};
function geoKey(){return JSON.stringify([S.cols,S.rows,S.count,S.variance,S.bias,S.seed,S.aspect])}
// final per-cell content and colour after the user's edits
const LEGACY={title:'tx:headline',note2:'tx:stack',count:'tx:stat',spec:'tx:info',oval:'tx:badge',cta:'tx:cta',ticker:'tx:ticker'};
function finalTypes(){const L=layouts(); const t=L.types.map((x,i)=>{const v=(S.over[i]&&S.over[i].type)||x; return LEGACY[v]||v});
  if(t.indexOf('prod')<0){const big=[...t.keys()].sort((i,j)=>L.A[j].w*L.A[j].h-L.A[i].w*L.A[i].h)[0]; t[big]='prod'}
  if(t.filter(x=>x==='prod').length>1){let seen=false; t.forEach((x,i)=>{if(x==='prod'){if(seen) t[i]=L.types[i]==='prod'?'plain':L.types[i]; seen=true}})}
  return t}
function finalFills(types){const L=layouts(); const f=colours(L.A,types,S.cseed); return f.map((c,i)=>(S.over[i]&&S.over[i].fill)||c)}
function shuffleT(){return S.dur*0.48}
function rectsAt(t,W,H){
  const L=layouts(); const sp=S.shuffle?E.expoInOut(P(t,shuffleT(),0.95)):0;
  return L.A.map((a,i)=>{const pa=toPx(a,W,H), pb=toPx(L.B[i],W,H); return {x:lerp(pa.x,pb.x,sp),y:lerp(pa.y,pb.y,sp),w:lerp(pa.w,pb.w,sp),h:lerp(pa.h,pb.h,sp)}});
}
// override (live morph while editing): displayed = lerp(from, timeline, k)
let MORPH=null;
function startMorph(fromRects,now){MORPH={from:fromRects,start:now}}
let LAST=[], LASTTY=[], LASTFILL=[];
function render(ctx,t,{now=null,live=false}={}){
  const [W,H]=size(); if(ctx.canvas.width!==W||ctx.canvas.height!==H){ctx.canvas.width=W; ctx.canvas.height=H}
  textures(W,H);
  const p=S.pal; const L=layouts();
  ctx.save(); ctx.fillStyle=p.ground; ctx.fillRect(0,0,W,H);
  let rects=rectsAt(t,W,H);
  if(live&&MORPH&&now!==null){const k=E.expoInOut(clamp((now-MORPH.start)/650)); if(k>=1) MORPH=null; else rects=rects.map((r,i)=>{const f=MORPH.from[i]; if(!f) return r; return {x:lerp(f.x,r.x,k),y:lerp(f.y,r.y,k),w:lerp(f.w,r.w,k),h:lerp(f.h,r.h,k)}})}
  LAST=rects;
  const TY=finalTypes(); const fills=finalFills(TY); LASTTY=TY; LASTFILL=fills;
  const prodI=TY.indexOf('prod'); const pr=rects[prodI]; const pcx=pr.x+pr.w/2, pcy=pr.y+pr.h/2;
  const sp=S.shuffle?Math.sin(Math.PI*P(t,shuffleT(),0.95)):0;
  const order=[...rects.keys()]; if(S.style==='chaos'){const rank=i=>i===prodI?1:(TEXTT.has(TY[i])?2:0); order.sort((a,b)=>rank(a)-rank(b))}
  order.forEach(i=>{const R=rects[i];
    const d=Math.hypot(R.x+R.w/2-pcx,R.y+R.h/2-pcy)/Math.max(W,H);
    const delay=0.1+d*0.7; const type=TY[i];
    const rad=Math.min(S.radius,R.w/2,R.h/2);
    ctx.save();
    if(S.style==='chaos'){ // tilted, overlapping stickers; every cell rolls its own shape and attitude
      const r=rng(S.seed*977+i*131); CC=r()<0.55; const calm=TEXTT.has(type)?0.35:(i===prodI?0.5:1); const rot=(r()-0.5)*0.32*calm, dx=(r()-0.5)*S.gutter*4*calm, dy=(r()-0.5)*S.gutter*4*calm, sc=1+(r()-0.4)*0.14*calm;
      const shp=r(); const rad2=shp<0.3?0:shp<0.55?Math.min(R.w,R.h)/2:shp<0.8?Math.max(S.radius,18):6;
      const e=spring(t-delay*0.8,1.5,0.38); if(e<=0){CC=null; ctx.restore(); return}
      const wob=Math.sin(t*1.3+i*1.7)*0.012;
      ctx.translate(R.x+R.w/2+dx,R.y+R.h/2+dy); ctx.rotate(rot*(2-e)+wob); ctx.scale(e*sc,e*sc); ctx.translate(-R.w/2,-R.h/2);
      const RR={x:0,y:0,w:R.w,h:R.h}; const so=Math.max(6,Math.min(R.w,R.h)*0.03);
      if(r()<0.6){rr(ctx,so,so,R.w,R.h,rad2); ctx.fillStyle=S.pal.ink; ctx.fill()}
      rr(ctx,0,0,R.w,R.h,rad2); ctx.fillStyle=fills[i]; ctx.fill(); if(r()<0.5){ctx.lineWidth=Math.max(3,so*0.6); ctx.strokeStyle=S.pal.ink; ctx.stroke()} ctx.clip();
      cell(ctx,type,RR,t,t-delay-0.2,fills[i],i); CC=null;
    } else if(S.style==='cute'){
      const e=spring(t-delay,1.7,0.52); if(e<=0){ctx.restore(); return}
      const sq=sp*0.05; ctx.translate(R.x+R.w/2,R.y+R.h/2); ctx.scale(e*(1-sq),e*(1-sq*0.6)); ctx.translate(-R.w/2,-R.h/2);
      const RR={x:0,y:0,w:R.w,h:R.h}; rr(ctx,0,0,R.w,R.h,rad); ctx.fillStyle=fills[i]; ctx.fill(); ctx.clip();
      cell(ctx,type,RR,t,t-delay-0.2,fills[i],i);
    } else {
      const e=E.expoOut(P(t,delay,0.9)); if(e<=0){ctx.restore(); return}
      ctx.beginPath(); ctx.rect(R.x,R.y,R.w,R.h); ctx.clip(); const off=(1-e)*R.h; ctx.translate(0,off);
      rr(ctx,R.x,R.y,R.w,R.h,rad); ctx.fillStyle=fills[i]; ctx.fill(); ctx.clip();
      cell(ctx,type,R,t,t-delay-0.25,fills[i],i);
    }
    ctx.restore();
  });
  ctx.restore();
  grain(ctx,t,W,H);
}

// ---------- random style ----------
function randomPalette(r){
  const VIVID=['meadow','rose','snow','clay','pasture','cobalt','wrapper','market','soda','lemon','volt','tomint','spec'];
  const keys=[...VIVID,...VIVID,...VIVID,...Object.keys(PRESETS)]; const base=PRESETS[keys[Math.floor(r()*keys.length)]];
  const out=Object.assign({},base);
  const cs=[base.c1,base.c2,base.c3,base.c4].sort(()=>r()-0.5); [out.c1,out.c2,out.c3,out.c4]=cs;
  // sometimes the strongest colour becomes the ground (poster look), if text still reads on it
  if(r()<0.35&&lum(base.ground)>0.5){const g=out.c1; if(Math.max(contrast(g,out.ink),contrast(g,out.paper))>3){out.c1=out.ground; out.ground=g}}
  out.name=base.name+(out.ground!==base.ground||cs[0]!==base.c1?' · 换位':'');
  return out;
}

// palettes used only by the draw button (never listed in the panel)
const HIDDEN=[
 ['晚霞汽水','#FF6F59','#FFF4E6','#1D1A2F','#FFD23F','#3D5AFE','#FF9EC7','#00B894'],
 ['蓝莓奶昔','#5B5FEF','#F6F2FF','#120F2E','#FFB4D6','#FFE066','#2EC4B6','#FF5E5B'],
 ['西瓜','#FF4F6D','#FFF7EE','#1B1B1B','#2FBF71','#FFD166','#0E7C4A','#FFC2CF'],
 ['芒果','#FFB627','#FFF8E8','#2A1B0F','#FF5E3A','#1E64FF','#FFE6A7','#00A676'],
 ['泳池','#29B6F6','#F2FBFF','#0B2239','#FF7A59','#FFE14D','#00897B','#FF8FB1'],
 ['橄榄霓虹','#1E2A1A','#F4F1E6','#1E2A1A','#C6F432','#FF6B35','#7FD1FF','#F7C8E0'],
 ['樱花地铁','#F7A1C4','#FFF5F9','#2B1636','#3A3FD9','#FFE45E','#FF4D4D','#6FE3C1'],
 ['可乐','#D7263D','#FFF3E3','#1A0A0A','#FFC857','#1B998B','#F4A6B7','#2E294E'],
 ['电子柠檬','#E8FF4F','#FFFFF2','#111111','#7B5CFF','#FF5C8A','#00C2A8','#FF9A3C'],
 ['深海霓虹','#0B132B','#EEF2FF','#0B132B','#5BC0EB','#FDE74C','#E55934','#9BC53D'],
 ['番茄蓝','#FF5A36','#F8F4EC','#161616','#2D5BFF','#FFD24C','#F9B8C8','#0F9D58'],
 ['奶油紫','#B8A1FF','#FBF8FF','#211640','#FFDE59','#FF6F91','#3A86FF','#FF9F43'],
 ['热带','#00A878','#FFF9EC','#062B20','#FF6B6B','#FFD93D','#FF9F1C','#4D96FF'],
 ['粉橘','#FF8C61','#FFF5EC','#2B1810','#FFD6E0','#6A4CFF','#FFE26A','#2EC4B6'],
 ['复古电视','#F2E8CF','#FFFFFF','#1D1D1B','#E63946','#1D3557','#F4A261','#2A9D8F'],
 ['果冻','#FF66C4','#FFF2FA','#2A0F2A','#FFE600','#00C3FF','#8A5CFF','#3DDC84'],
 ['海盐','#CDEBFF','#FFFFFF','#0F2D4A','#FF6F61','#2F80ED','#FFC75F','#00B894'],
 ['焦糖','#C4622D','#FBEFE3','#2A140A','#F7C873','#3C6E71','#F4B6C2','#284B63'],
 ['酸梅','#6A1B4D','#FCEFF6','#2B0A1F','#FF9AA2','#FFD670','#7AE7C7','#E85D75'],
 ['黄昏电车','#FF9F1C','#FFF6E5','#231A0F','#2EC4B6','#E71D36','#011627','#CBF3F0'],
 ['蜜桃苏打','#FFC4B8','#FFF8F5','#3A1F1A','#FF5D73','#3E7BFA','#FFE57F','#42D6A4'],
 ['冰川','#E3F4FF','#FFFFFF','#0D1B2A','#415A77','#FF7B54','#FFD56B','#7BDFF2'],
 ['霓虹夜','#14051F','#F2E9FF','#14051F','#FF2E88','#00F5D4','#FEE440','#9B5DE5'],
 ['番红花','#F15BB5','#FFF0F8','#22091A','#FEE440','#00BBF9','#00F5D4','#9B5DE5'],
 ['草莓牛奶','#FFD1DC','#FFF8FA','#3B1C2A','#FF4F79','#FFB703','#8ECAE6','#219EBC'],
 ['赛博薄荷','#00E0B0','#F0FFFA','#032B24','#FF4365','#2A2AFF','#FFE45C','#FF9AD5'],
 ['老电影','#E9D8A6','#FBF6E9','#001219','#AE2012','#005F73','#EE9B00','#94D2BD'],
 ['蓝调','#1446A0','#F4F6FF','#0A1A3A','#DB3069','#F5D547','#EBEBD3','#3DDC97'],
 ['橙子汽水','#FF7A00','#FFF5E8','#1F1300','#FFE45E','#2F4BFF','#FF4D8D','#0BBF8A'],
 ['葡萄','#7B2CBF','#F7F0FF','#1A0833','#FFB3C6','#FFD60A','#3BCEAC','#FF6B6B'],
 ['青柠','#A7E22E','#FAFFF0','#13200A','#FF5E5B','#2B59C3','#FFF07C','#F5A6E6'],
 ['杂志红','#E63946','#FFF4F0','#1A0A0C','#FFB703','#1D3557','#A8DADC','#FB8500'],
 ['沙滩','#F6E3BA','#FFFCF3','#2A2116','#FF6B6B','#4ECDC4','#1A535C','#FFE66D'],
 ['迷幻','#FFE600','#FFFFF0','#1A1A1A','#FF0080','#7928CA','#00DFD8','#FF4D4D'],
 ['森林派对','#2D6A4F','#F7F3E9','#0B1F15','#F9C74F','#F94144','#90BE6D','#F8961E'],
 ['珊瑚','#FF6F61','#FFF6F3','#2A1110','#6B5B95','#FFD166','#88D8B0','#F7CAC9'],
 ['靛蓝','#283CF0','#F3F4FF','#0A0F3D','#FF9EAA','#FFE156','#2EDFA7','#FF5F1F'],
 ['奶茶','#D8B4A0','#FFF8F2','#2E1E17','#E85D75','#1F7A8C','#F4D35E','#8C5E58'],
 ['马卡龙','#BDE0FE','#FFFFFF','#1D2A3A','#FFAFCC','#CDB4DB','#FFD166','#06D6A0'],
 ['晴空食堂','#8CC8F2','#FFFFFF','#111111','#1BA34A','#F2251C','#FFE600','#0B2D5C'],
 ['白瓷','#F2F2EF','#FFFFFF','#111111','#2A6EF2','#1BA34A','#F2251C','#FFE600'],
 ['亮黄午餐','#FFFFFF','#F4F4F4','#111111','#FFE600','#1BA34A','#F2251C','#8CC8F2'],
 ['深蓝碗','#0B2D5C','#F4F6FA','#0B2D5C','#8CC8F2','#2A6EF2','#F2251C','#FFE600'],
 ['朋克','#111111','#F5F5F0','#111111','#FF3366','#00E5FF','#FFEA00','#7CFF4F'],
].map(a=>({name:a[0],ground:a[1],paper:a[2],ink:a[3],c1:a[4],c2:a[5],c3:a[6],c4:a[7]}));
// perceptual generator (OKLCH) for endless new combinations
function oklch(L,C,h){const a=C*Math.cos(h*TAU), b=C*Math.sin(h*TAU);
  const l_=L+0.3963377774*a+0.2158037573*b, m_=L-0.1055613458*a-0.0638541728*b, s_=L-0.0894841775*a-1.2914855480*b;
  const l=l_**3, m=m_**3, q=s_**3;
  let r=4.0767416621*l-3.3077115913*m+0.2309699292*q, g=-1.2684380046*l+2.6097574011*m-0.3413193965*q, bl=-0.0041960863*l-0.7034186147*m+1.7076147010*q;
  const f=v=>v<=0.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-0.055; return [f(r),f(g),f(bl)]}
function okHex(L,C,h){h=((h%1)+1)%1; if(C>0.08){if(h>0.21&&h<0.34) L=Math.max(L,0.87); else if(h>0.13&&h<=0.21) L=Math.max(L,0.7); else if(h>0.34&&h<0.42) L=Math.max(L,0.62)} let c=C; for(let k=0;k<30;k++){const v=oklch(L,c,h); if(v.every(x=>x>=-0.001&&x<=1.001)) return toHex(...v.map(x=>clamp(x)*255)); c*=0.92} return toHex(...oklch(L,0,h).map(x=>clamp(x)*255))}
const WORDS=['晚风','糖纸','电车','汽水','霓虹','海盐','果冻','柠檬','晴天','黄昏','夜樱','极光','橙光','薄雾','蜜桃','周五','街角','唱片','露营','游泳池','烟花','月台','冰沙','胶片'];
function genPalette(r){
  for(let tries=0;tries<20;tries++){
    const h=r(); const schemes=[[0,0.42,0.58,0.08],[0,1/3,2/3,0.16],[0,0.08,0.5,0.92],[0,0.25,0.5,0.75],[0,0.5,0.12,0.62]];
    const sc=schemes[Math.floor(r()*schemes.length)].map(o=>(h+o)%1).sort(()=>r()-0.5);
    const LC=[[0.68,0.2],[0.78,0.16],[0.88,0.1],[0.55,0.18]].sort(()=>r()-0.5);
    const acc=sc.map((hh,i)=>okHex(LC[i][0]+(r()-0.5)*0.06,LC[i][1],hh));
    const gt=r(); let ground, ink=okHex(0.2,0.04,(h+0.65)%1), paper=okHex(0.975,0.015,(h+0.1)%1);
    if(gt<0.45){ground=okHex(0.66+r()*0.1,0.19,(h+0.5*Math.floor(r()*2))%1)}
    else if(gt<0.8){ground=okHex(0.94,0.035,h)}
    else {ground=okHex(0.19,0.045,(h+0.6)%1); ink=ground}
    const all=[ground,...acc];
    let ok=true; for(let i=0;i<all.length;i++) for(let j=i+1;j<all.length;j++){const a=hex(all[i]),b=hex(all[j]); if(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])<55) ok=false}
    if(!ok) continue;
    const w1=Math.floor(r()*WORDS.length); let w2=Math.floor(r()*WORDS.length); if(w2===w1) w2=(w2+5)%WORDS.length;
    return {name:WORDS[w1]+'×'+WORDS[w2],ground,paper,ink,c1:acc[0],c2:acc[1],c3:acc[2],c4:acc[3],gen:true};
  }
  return Object.assign({},HIDDEN[0]);
}
function hiddenPalette(r){const b=Object.assign({},HIDDEN[Math.floor(r()*HIDDEN.length)]); const cs=[b.c1,b.c2,b.c3,b.c4].sort(()=>r()-0.5); [b.c1,b.c2,b.c3,b.c4]=cs; return b}
const CURATED=[
  {style:'spec',pal:'番茄蓝',hero:'stack',cols:12,rows:6,count:9,variance:55,bias:0,gutter:12,pad:20,radius:4},
  {style:'cute',pal:'果冻',hero:'sun',cols:10,rows:6,count:9,variance:50,bias:15,gutter:16,pad:26,radius:30},
  {style:'spec',pal:'靛蓝',hero:'arch',cols:14,rows:8,count:12,variance:80,bias:30,gutter:10,pad:16,radius:2},
  {style:'cute',pal:'晚霞汽水',hero:'type',cols:12,rows:7,count:10,variance:60,bias:-20,gutter:18,pad:28,radius:34},
  {style:'spec',pal:'霓虹夜',hero:'stack',cols:12,rows:6,count:8,variance:70,bias:-30,gutter:8,pad:14,radius:0},
  {style:'cute',pal:'草莓牛奶',hero:'arch',cols:9,rows:5,count:9,variance:40,bias:10,gutter:14,pad:22,radius:40},
  {style:'spec',pal:'老电影',hero:'sun',cols:16,rows:9,count:13,variance:85,bias:0,gutter:8,pad:16,radius:3},
  {style:'cute',pal:'热带',hero:'stack',cols:8,rows:5,count:7,variance:30,bias:30,gutter:20,pad:32,radius:44},
  {style:'spec',pal:'杂志红',hero:'type',cols:12,rows:6,count:10,variance:65,bias:20,gutter:12,pad:20,radius:6},
  {style:'cute',pal:'迷幻',hero:'arch',cols:11,rows:6,count:11,variance:55,bias:-10,gutter:16,pad:24,radius:28},
];
function fitGrid(cols,rows){const [W,H]=size(); const k=Math.sqrt((W/H)/(16/9)); S.cols=clamp(Math.round(cols*k),3,16); S.rows=clamp(Math.round(rows/k),2,14)}
// tier: 'N' free random (hue-shifted palette) | 'R' library palette | 'SR' library palette + bold proportions | 'SSR' hand-picked combo
const HEROES=['type','arch','sun','stack'];
// tier: 'N' freshly generated colours | 'R' hidden library | 'SR' hidden library + bold proportions | 'SSR' hand-picked combo
function randomize(seed,{tier='N',keepPal=false}={}){
  const r=rng(seed); const keep=keepPal?Object.assign({},S.pal):null;
  if(tier==='SSR'){const c=CURATED[Math.floor(r()*CURATED.length)]; const keepImg=IMG&&S.hero==='image'; Object.assign(S,{blank:0},c,{pal:Object.assign({},HIDDEN.find(h=>h.name===c.pal)||HIDDEN[0])}); fitGrid(c.cols,c.rows); S.seed=Math.floor(r()*1e6); if(keepImg) S.hero='image'; if(keep) S.pal=keep; return c}
  {const q=r(); S.style=q<0.36?'cute':q<0.72?'spec':'chaos'}
  S.pal=tier==='N'?genPalette(r):hiddenPalette(r);
  if(r()<0.3&&lum(S.pal.ground)>0.6){const g=S.pal.c1; if(Math.max(contrast(g,S.pal.ink),contrast(g,S.pal.paper))>3){S.pal.c1=S.pal.ground; S.pal.ground=g}}
  S.hero=(IMG&&S.hero==='image')?'image':HEROES[Math.floor(r()*HEROES.length)];
  const [W,H]=size(); const ar=W/H;
  S.cols=Math.round(lerp(6,14,r())*Math.sqrt(ar)/Math.sqrt(16/9)); S.cols=clamp(S.cols,4,16);
  S.rows=clamp(Math.round(S.cols/ar*lerp(0.8,1.2,r())),3,14);
  S.count=Math.round(lerp(6,14,r()));
  if(tier==='SR'){S.variance=r()<0.5?Math.round(lerp(85,100,r())):Math.round(lerp(0,15,r())); S.bias=Math.round((r()<0.5?-1:1)*lerp(55,90,r())); S.count=Math.round(lerp(5,18,r()))}
  else {S.variance=Math.round(lerp(20,95,r())); S.bias=Math.round(lerp(-60,60,r()))}
  S.gutter=Math.round(S.style==='spec'?lerp(4,16,r()):lerp(10,28,r())); S.pad=Math.round(lerp(S.gutter,S.gutter*2.2,r()));
  S.radius=Math.round(S.style==='spec'?lerp(0,8,r()):lerp(18,48,r()));
  S.blank=0; S.textMix=Math.round(lerp(20,50,r())); S.plainMix=Math.round(lerp(0,35,r()));
  S.seed=Math.floor(r()*1e6);
  if(keep) S.pal=keep;
}

// ---------- quality check: score a candidate without drawing it ----------
const MC=document.createElement('canvas').getContext('2d');
function quality(){
  const [W,H]=size(); const L=layouts(); const TY=finalTypes(); const FI=finalFills(TY); const sc=scale(); const p=S.pal; let pen=0;
  const geo=[L.A.map(c=>toPx(c,W,H)), L.B.map(c=>toPx(c,W,H))];
  for(const RS of (S.shuffle?geo:[geo[0]])){
    RS.forEach((R,i)=>{const t=TY[i], f=FI[i], w=R.w, h=R.h; const fg=onCol(f);
      const ct=contrast(f,fg);
      if(TEXTT.has(t)&&ct<3) pen+=4; else if(ct<1.6&&t!=='plain'&&t!=='plainGround') pen+=1;
      if(t.startsWith('tx:')){const q=txFit(t.slice(3),i,R); if(q.bad) pen+=q.bad}
      if(t==='title'){const sz=stepFit(MC,S.text.title.split('\n'),w*0.84,h*0.78,0,1.0); if(sz<sc[3]) pen+=6; else if(sz<sc[2]) pen+=3}
      if(t==='note2'&&line(i)){const sz=stepFit(MC,[line(i)],w*0.84,h*0.5,1,1.0); if(sz<sc[4]) pen+=4; else if(sz<sc[3]) pen+=2}
      if(t==='count'){const L2=lines(); const str=L2.find(l=>/\d/.test(l))||line(i)||''; const sz=stepFit(MC,[str],w*0.84,h*0.7,0,1.0); if(sz<sc[3]) pen+=3}
      if(t==='ticker'&&h<sc[3]*1.3) pen+=2;
      if(t==='spec'){const n=Math.max(1,lines().length); if(h*0.8/n*0.55<sc[5]||w<sc[3]*6) pen+=4}
      if(t==='cta'&&(h<sc[3]*1.8||w<sc[3]*5)) pen+=3;
      if(t==='prod'){const a=w*h/(W*H), mn=Math.min(w,h)/Math.min(W,H); if(a<0.1) pen+=5; if(mn<0.24) pen+=4;
        if(heroKind()==='type'){const sz=stepFit(MC,S.text.title.split('\n'),w*0.88,h*0.84,0,0.94); if(sz<sc[2]) pen+=4}}
      if(!['plainGround','note','notedot'].includes(t)){const a=hex(f), g=hex(p.ground); if(Math.hypot(a[0]-g[0],a[1]-g[1],a[2]-g[2])<28) pen+=2}
      else if(w*h>W*H*0.12) pen+=5;
      if(t==='plain'&&w*h>W*H*0.12) pen+=5;
    });
    // neighbouring cells that are almost the same colour read as one blob
    for(let i=0;i<RS.length;i++) for(let j=i+1;j<RS.length;j++){const a=RS[i], b=RS[j]; const gap=S.gutter+2;
      const touch=!(a.x+a.w+gap<b.x||b.x+b.w+gap<a.x||a.y+a.h+gap<b.y||b.y+b.h+gap<a.y); if(!touch) continue;
      if(['plainGround','note','notedot'].includes(TY[i])||['plainGround','note','notedot'].includes(TY[j])) continue;
      const A=hex(FI[i]), B=hex(FI[j]); if(Math.hypot(A[0]-B[0],A[1]-B[1],A[2]-B[2])<34) pen+=2}
  }
  if(!TY.some(t=>TEXTT.has(t))&&heroKind()!=='type') pen+=4;
  {const cnt={}; TY.forEach(t=>{cnt[t]=(cnt[t]||0)+1}); ['tx:headline','tx:promo','tx:ticker','tx:cta','tx:info','tx:stat','tx:badge','tx:quote','tx:vert','dial','swatch','letter','note'].forEach(t=>{if(cnt[t]>1) pen+=3*(cnt[t]-1)})}
  return pen;
}
function lockedCount(){return Object.values(S.over).filter(o=>o&&o.lock).length}
// draw a new combination, try several candidates and keep the cleanest
function drawBest(seed,opts={}){
  const locks=lockedCount(); let best=null, bestPen=1e9;
  const keepOver=JSON.parse(JSON.stringify(S.over)); const keepCells=S.cells?JSON.parse(JSON.stringify(S.cells)):null, keepCK=S.cellsKey; const geo={aspect:S.aspect,style:S.style,cols:S.cols,rows:S.rows,count:S.count,variance:S.variance,bias:S.bias,seed:S.seed,gutter:S.gutter,pad:S.pad,radius:S.radius,hero:S.hero,blank:S.blank,textMix:S.textMix,plainMix:S.plainMix};
  for(let k=0;k<14;k++){
    const sd=seed+k*7919;
    if(locks){ // keep layout + locked cells; re-roll colours and the unlocked content
      Object.assign(S,geo); const r=rng(sd); if(!opts.keepPal) S.pal=(opts.tier==='N'?genPalette(r):hiddenPalette(r)); S.cseed=Math.floor(r()*1e6);
      const o={}; Object.entries(keepOver).forEach(([i,v])=>{if(v&&v.lock) o[i]=v}); S.over=o; S.overKey=geoKey(); S.cells=keepCells?JSON.parse(JSON.stringify(keepCells)):null; S.cellsKey=keepCK;
    } else {randomize(sd,opts); S.cseed=Math.floor(rng(sd+3)()*1e6); S.over={}; S.overKey=geoKey(); S.cells=null}
    const pen=quality(); if(pen<bestPen){bestPen=pen; best=getStyle()} if(pen===0) break;
  }
  setStyle(best); return bestPen;
}
const FIELDS=['aspect','style','hero','blank','textMix','plainMix','pal','cols','rows','count','variance','bias','gutter','pad','radius','seed','cseed','over','overKey','cells','cellsKey'];
function getStyle(){const o={}; FIELDS.forEach(k=>{o[k]=(k==='pal'||k==='over'||k==='cells')?JSON.parse(JSON.stringify(S[k])):S[k]}); return o}
function setStyle(o){FIELDS.forEach(k=>{if(k in o) S[k]=(k==='pal'||k==='over'||k==='cells')?JSON.parse(JSON.stringify(o[k])):o[k]})}
window.GRIDKIT={S,getCells:()=>layouts().A.map(c=>Object.assign({},c)),setCells:a=>{S.cells=a.map(c=>Object.assign({},c)); S.cellsKey=geoKey()},cellPx:c=>{const [W,H]=size(); return toPx(c,W,H)},unit:()=>{const [W,H]=size(); const g=S.gutter,p=S.pad; return {ux:(W-2*p-(S.cols-1)*g)/S.cols+g, uy:(H-2*p-(S.rows-1)*g)/S.rows+g}},shuffleT,PRESETS,SIZES,size,render,randomize,drawBest,quality,lockedCount,getTypes:()=>finalTypes(),getFills:()=>finalFills(finalTypes()),baseTypes:()=>layouts().types,TXL,txContent,txDefault,TYPES,getStyle,setStyle,startMorph,getRects:()=>LAST,heroKind,setImage:img=>{IMG=img; IMGALPHA=false; if(img){try{const c=document.createElement('canvas'); c.width=64; c.height=64; const g=c.getContext('2d'); g.drawImage(img,0,0,64,64); const d=g.getImageData(0,0,64,64).data; for(let k=3;k<d.length;k+=4){if(d[k]<240){IMGALPHA=true;break}}}catch(e){}}},rng};
})();

