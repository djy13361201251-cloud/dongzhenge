// 动真格 · 口播成片导演脚本
// 逐帧调用 FILM.frame(n) 得到第 n 帧（30fps，1080×1920）。所有卡点时间来自 words.json（语音识别逐字时间）。
(function(){
const G=window.GRIDKIT, S=G.S, W=1080, H=1920, FPS=30;
const pc=document.createElement('canvas'); pc.width=W; pc.height=H; const pctx=pc.getContext('2d');
const out=document.createElement('canvas'); out.width=W; out.height=H; const octx=out.getContext('2d');
let WORDS=[];

// ---------------------------------------------------------------- 找词：第一次在 after 之后说到 txt 的时间
const norm=s=>String(s).replace(/[，。,.、！？!?\s]/g,'');
function at(txt,after=0,end=false){
  const want=norm(txt);
  for(let i=0;i<WORDS.length;i++){
    if(WORDS[i].start<after-1e-6) continue;
    let acc='';
    for(let j=i;j<WORDS.length;j++){
      acc+=norm(WORDS[j].word);
      if(acc.length>=want.length){ if(acc.startsWith(want)) return end?WORDS[j].end:WORDS[i].start; break }
      if(!want.startsWith(acc)) break;
    }
  }
  throw new Error('找不到词：'+txt+' @'+after);
}

// ---------------------------------------------------------------- 版式（6 列 × 12 行）
// role: face=口播 / kw=关键词 / 其余为工具内的格子类型；f=底色键
const LAYOUTS={
  F1:[{r:[0,0,6,7],role:'face'},{r:[0,7,6,2],role:'kw',f:'paper'},{r:[0,9,2,3],role:'dots',f:'c1'},{r:[2,9,2,3],role:'face_',f:'c2'},{r:[4,9,2,3],role:'halftone',f:'c3'}],
  F2:[{r:[0,0,4,8],role:'face'},{r:[4,0,2,3],role:'sparkle',f:'c2'},{r:[4,3,2,5],role:'bands',f:'c1'},{r:[0,8,6,2],role:'kw',f:'paper'},{r:[0,10,3,2],role:'checker',f:'c4'},{r:[3,10,3,2],role:'wave',f:'c3'}],
  F3:[{r:[0,0,6,2],role:'kw',f:'paper'},{r:[0,2,6,6],role:'face'},{r:[0,8,2,4],role:'letter',f:'c1'},{r:[2,8,4,2],role:'stripes',f:'c2'},{r:[2,10,2,2],role:'dots',f:'c4'},{r:[4,10,2,2],role:'shape',f:'c3'}],
  F4:[{r:[0,0,6,2],role:'kw',f:'paper'},{r:[0,2,2,4],role:'dial',f:'c3'},{r:[2,2,4,7],role:'face'},{r:[0,6,2,3],role:'swatch',f:'c1'},{r:[0,9,4,3],role:'halftone',f:'c2'},{r:[4,9,2,3],role:'sparkle',f:'c4'}],
  T1:[{r:[0,0,6,3],role:'tx:headline',f:'paper',txt:{h:'动真格'}},
      {r:[0,3,6,2],role:'tx:stack',f:'c1',txt:{h:'风格化动效海报',s:'不会 AE 也能做'}},
      {r:[0,5,4,4],role:'tx:body',f:'paper',txt:{h:'正文',b:'抽一张 换版式与配色\n三种风格 随时切换'}},
      {r:[4,5,2,4],role:'dots',f:'c2'},
      {r:[0,9,4,3],role:'tx:cta',f:'c4',txt:{h:'立即体验'}},
      {r:[4,9,2,3],role:'face_',f:'c3'}],
  P1:[{r:[0,0,6,2],role:'kw',f:'paper'},{r:[0,2,6,4],role:'bands',f:'c1'},{r:[0,6,3,3],role:'swatch',f:'c2'},{r:[3,6,3,3],role:'halftone',f:'c3'},{r:[0,9,3,3],role:'photo',f:'paper'},{r:[3,9,3,3],role:'dots',f:'c4'}],
};
const PHOTO_PAL={name:'吸色',ground:'#D7F25B',paper:'#FFFFFF',ink:'#141414',c1:'#FF4FA3',c2:'#2F6BFF',c3:'#FFD43B',c4:'#7B4DFF'};

// ---------------------------------------------------------------- 导演状态
let D, EV=[], evI=0, lastT=-1;
function freshD(){ return {scene:null, restartT:0, sel:[], mode:'grid', zoom:null, drag:null, dirty:true} }
function sceneOf(o){ return {layout:o.layout, style:o.style||'spec', pal:o.pal, kw:o.kw||'', mods:{}, swap:null} }

function applyScene(t){
  const sc=D.scene; if(!sc) return;
  let L=LAYOUTS[sc.layout];
  // 拖缝：口播格与右侧列之间的分界线随时间移动
  let rects=L.map(c=>c.r.slice());
  if(D.drag&&t>=D.drag.t0){
    const k=dragX(t), fi=L.findIndex(c=>c.role==='face');
    const base=L[fi].r[2]; const nx=base+k;
    rects[fi][2]=nx;
    L.forEach((c,i)=>{ if(i!==fi&&c.r[0]>=base&&c.r[1]<L[fi].r[1]+L[fi].r[3]){ rects[i][0]=nx; rects[i][2]=6-nx } });
  }
  if(sc.swap){ const [a,b]=sc.swap; const tmp=rects[a]; rects[a]=rects[b]; rects[b]=tmp }
  const pal=typeof sc.pal==='string'?G.PRESETS[sc.pal]:sc.pal;
  Object.assign(S,{aspect:'9:16',cols:6,rows:12,count:L.length,seed:7,variance:50,bias:0,shuffle:false,dur:600,
    style:sc.style, pal:Object.assign({},pal),
    gutter:sc.style==='spec'?14:20, pad:sc.style==='chaos'?44:28, radius:sc.style==='spec'?4:30});
  G.setCells(rects.map(r=>({x:r[0],y:r[1],w:r[2],h:r[3]})));
  G.getTypes();                         // 触发版式重建，之后再写每格设定
  S.over={};
  L.forEach((c,i)=>{
    const m=sc.mods[i]||{}, o=S.over[i]={};
    const role=m.role||c.role;
    o.fill=S.pal[m.f||c.f||'paper'];
    if(role==='face'){ o.type='img'; o.aid='vo' }
    else if(role==='photo'){ o.type='img'; o.aid='photo' }
    else if(role==='kw'){ o.type='tx:headline'; o.txt={h:sc.kw}; o.al='c'; o.sz=1 }
    else if(role==='face_'){ o.type='face' }
    else { o.type=role; if(c.txt||m.txt) o.txt=Object.assign({},c.txt||{},m.txt||{}) }
  });
  D.dirty=false;
}
function dragX(t){
  const {t0,t1}=D.drag; const u=Math.min(1,Math.max(0,(t-t0)/(t1-t0)));
  // 0 → +1 → -0.6 → 0（拉宽、再收窄、回位）
  const key=[[0,0],[0.35,1],[0.75,-0.6],[1,0]];
  for(let i=1;i<key.length;i++){ if(u<=key[i][0]){ const a=key[i-1],b=key[i], p=(u-a[0])/(b[0]-a[0]), e=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2; return a[1]+(b[1]-a[1])*e } }
  return 0;
}

// ---------------------------------------------------------------- 卡点脚本
function build(){
  EV=[];
  const LEAD=0.1;   // 画面比声音提前 3 帧切，落点更准
  const ev=(t,fn,lead=LEAD)=>EV.push({t:Math.max(0,t-lead),fn});
  const scene=(t,o)=>ev(t,d=>{ d.scene=sceneOf(o); d.restartT=Math.max(0,t-LEAD); d.sel=[]; d.dirty=true });
  const kw=(t,k)=>ev(t,d=>{ d.scene.kw=k; d.dirty=true });
  const mod=(t,i,m)=>ev(t,d=>{ d.scene.mods[i]=Object.assign({},d.scene.mods[i]||{},m); d.dirty=true });
  const sel=(t,...ix)=>ev(t,d=>{ d.sel=ix });
  const mode=(t,m)=>ev(t,d=>{ d.mode=m },0);
  const type=(t,full,step=0.1)=>{ for(let k=1;k<=full.length;k++) kw(t+(k-1)*step,full.slice(0,k)) };

  // A · 开场钩子（口播在格子里）
  scene(0,{layout:'F1',style:'spec',pal:'tomint',kw:'不会 AE'});
  scene(at('丝滑'),{layout:'F2',style:'spec',pal:'lemon',kw:'丝滑动效'});
  kw(at('海报'),'动效海报');
  scene(at('粘览'),{layout:'F3',style:'cute',pal:'soda',kw:'活动信息'});
  kw(at('更有趣'),'更有趣');
  scene(at('Cloud'),{layout:'F4',style:'spec',pal:'volt',kw:'Claude 出品'});
  kw(at('小工具'),'动效小工具');
  kw(at('打开网页'),'打开就能用');

  // B · 抽一张
  scene(at('抽一张'),{layout:'F1',style:'spec',pal:'meadow',kw:'抽一张'});
  scene(at('抽卡'),{layout:'F3',style:'cute',pal:'rose',kw:'风格抽卡'});
  scene(at('每抽一次'),{layout:'F2',style:'spec',pal:'pasture',kw:'每抽一次'});
  scene(at('排版'),{layout:'F4',style:'spec',pal:'pasture',kw:'换排版'});
  scene(at('配色',14),{layout:'F4',style:'spec',pal:'cobalt',kw:'换配色'});
  kw(at('满意'),'直到满意');

  // C · 三种风格（逐字落点）
  kw(at('三种风格'),'三种风格');
  scene(at('混乱'),{layout:'F1',style:'chaos',pal:'market',kw:'混乱'});
  scene(at('可爱'),{layout:'F1',style:'cute',pal:'candy',kw:'可爱'});
  scene(at('规整'),{layout:'F1',style:'spec',pal:'spec',kw:'规整'});

  // D · 单格修改（选中框 + 实际变化）
  scene(at('单独修改'),{layout:'F2',style:'spec',pal:'snow',kw:'单独修改'});
  sel(at('点击它'),2);
  mod(at('切换格式'),2,{role:'dial'}); kw(at('切换格式'),'切换版式');
  sel(at('改文字'),3); kw(at('改文字')-0.01,''); type(at('改文字'),'改文字内容');
  sel(at('切换颜色'),4); mod(at('颜色',25),4,{f:'c2'}); kw(at('切换颜色')+0.4,'换颜色');
  sel(at('交换位置'),1,5); kw(at('交换位置'),'交换位置');
  ev(at('位置',26),d=>{ d.scene.swap=[1,5]; d.dirty=true });

  // E · 拖动缝隙
  sel(at('你也可以',27),);
  kw(at('拖动'),'拖动缝隙');
  ev(at('拖动'),d=>{ d.drag={t0:at('拖动'),t1:at('大小',29,true)}; d.dirty=true });
  kw(at('里面的文字'),'跟着变化');
  ev(at('里面的文字'),d=>{ d.drag=null; d.dirty=true });

  // F · 混乱模式
  scene(at('如果你觉得'),{layout:'F3',style:'spec',pal:'navy',kw:'太规整？'});
  scene(at('混乱模式'),{layout:'F3',style:'chaos',pal:'volt',kw:'混乱模式'});
  kw(at('鬼马'),'更鬼马');
  kw(at('灵动'),'更灵动');

  // G · 文字层级（不露脸）
  scene(at('文字部分'),{layout:'T1',style:'spec',pal:'cobalt'});
  sel(at('主标题'),0); sel(at('副标题'),1); sel(at('正文'),2); sel(at('按钮',44),4);
  sel(at('在右边'));
  const swapT=at('换成');
  scene(swapT,{layout:'T1',style:'spec',pal:'cobalt'});
  mod(swapT,0,{txt:{h:'夏日市集'}}); mod(swapT,1,{txt:{h:'WEEKEND MARKET',s:'11.08 周六'}});
  mod(swapT,2,{txt:{h:'上海 · 西岸美术馆',b:'免费入场\n现场音乐与手作'}}); mod(swapT,4,{txt:{h:'立即报名'}});

  // H · 配色（不露脸）
  scene(at('另外'),{layout:'P1',style:'spec',pal:'soda',kw:'配色'});
  scene(at('配色库'),{layout:'P1',style:'spec',pal:'lemon',kw:'配色库'});
  ev(at('选择',53),d=>{ d.scene.pal='volt'; d.dirty=true });
  kw(at('自己选择'),'自选颜色');
  ev(at('颜色',55.5),d=>{ d.scene.pal=Object.assign({},G.PRESETS.tomint,{c1:'#7B4DFF',name:'自选'}); d.dirty=true });
  sel(at('拖入图片'),4); kw(at('拖入图片'),'拖图吸色');
  scene(at('吸色'),{layout:'P1',style:'spec',pal:PHOTO_PAL,kw:'一键吸色'});

  // I · 全屏口播 → 拉远回到格子
  mode(at('我也'),'full');
  const zEnd=at('这样',62,true);
  ev(zEnd,d=>{ d.mode='zoom'; d.zoom={t0:zEnd,t1:zEnd+0.8}; d.scene=sceneOf({layout:'F1',style:'spec',pal:'tomint',kw:'就像这样'}); d.restartT=zEnd; d.sel=[]; d.dirty=true },0);
  mode(zEnd+0.8,'grid');

  // J · 结尾
  kw(at('目前',63),'已上线');
  kw(at('小红书'),'小红书');
  kw(at('点击笔记'),'笔记下方小工具');

  EV.sort((a,b)=>a.t-b.t);
}

function applyUpTo(t){
  if(t<lastT){ D=freshD(); evI=0 }
  while(evI<EV.length&&EV[evI].t<=t+1e-6){ EV[evI].fn(D); evI++ }
  lastT=t;
}

// ---------------------------------------------------------------- 素材
function loadImg(src){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=()=>rej(new Error('load '+src)); im.src=src }) }
const pad5=n=>String(n).padStart(5,'0');
let PHOTO=null;
function easeIO(p){ p=Math.min(1,Math.max(0,p)); return p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2 }

function drawSel(r,alpha){
  octx.save(); octx.globalAlpha=alpha;
  octx.lineWidth=10; octx.strokeStyle='#FFFFFF'; roundRect(octx,r.x-8,r.y-8,r.w+16,r.h+16,18); octx.stroke();
  octx.lineWidth=5; octx.strokeStyle='#141414'; roundRect(octx,r.x-8,r.y-8,r.w+16,r.h+16,18); octx.stroke();
  octx.restore();
}
function roundRect(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath() }
function cover(c,im){ const k=Math.max(W/im.width,H/im.height); c.drawImage(im,(W-im.width*k)/2,(H-im.height*k)/2,im.width*k,im.height*k) }

// ---------------------------------------------------------------- 逐帧
async function frame(n){
  const t=n/FPS;
  const face=await loadImg('vo/'+pad5(n+1)+'.jpg');
  G.setAsset('vo',{img:face,fx:0.48,fy:0.36});
  G.setAsset('photo',{img:PHOTO});
  G.setVoAid('vo');
  applyUpTo(t);
  if(D.dirty||D.drag) applyScene(t);

  if(D.mode==='full'){ cover(octx,face); return out.toDataURL('image/jpeg',0.92) }

  // 卡点后入场加速：前 0.5 秒按 3 倍速走完入场，之后恢复常速，避免短间隔卡点时画面还是空的
  const raw=Math.max(0,t-D.restartT), pt=raw<0.4?0.55+raw*3:1.75+(raw-0.4);
  G.render(pctx,pt);
  const R=G.getRects();
  octx.clearRect(0,0,W,H);
  if(D.mode==='zoom'&&D.zoom){
    const e=easeIO((t-D.zoom.t0)/(D.zoom.t1-D.zoom.t0));
    const fi=LAYOUTS[D.scene.layout].findIndex(c=>c.role==='face'), fr=R[fi];
    const k0=Math.max(W/fr.w,H/fr.h), k=k0+(1-k0)*e;
    const cx=fr.x+fr.w/2, cy=fr.y+fr.h/2;
    // 镜头：e=0 时口播格放大铺满屏幕，e=1 时回到整张海报
    const tx=(W/2)+(cx-W/2)*e, ty=(H/2)+(cy-H/2)*e;
    octx.save(); octx.setTransform(k,0,0,k,tx-k*cx,ty-k*cy);
    octx.drawImage(pc,0,0);
    octx.restore();
    const fa=1-easeIO(e/0.35);
    if(fa>0){ octx.save(); octx.globalAlpha=fa; cover(octx,face); octx.restore() }
  } else {
    octx.drawImage(pc,0,0);
  }
  D.sel.forEach(i=>{ if(R[i]) drawSel(R[i],1) });
  return out.toDataURL('image/jpeg',0.92);
}

window.FILM={
  async init(){
    WORDS=(await (await fetch('words.json')).json()).segments.flatMap(s=>s.words);
    PHOTO=await loadImg('photo.png');
    if(document.fonts&&document.fonts.ready) await document.fonts.ready;
    D=freshD(); build(); lastT=-1;
    return {events:EV.length, frames:Math.floor(WORDS[WORDS.length-1].end*FPS)};
  },
  frame,
  cues(){ return EV.map(e=>+e.t.toFixed(2)) }
};
})();
