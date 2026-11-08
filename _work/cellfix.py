# -*- coding: utf-8 -*-
"""格子平等化 / 素材按身份绑定 / 删除即复原

1. 彻底删掉「主视觉格」：没有 prod 类型、没有 S.hero 渲染分支、没有「设为主视觉」。
2. 素材绑定从「格子序号」改为「素材 id」：重排版式、删除素材都不会串格。
3. 删素材 / 清空素材库时，用到它的格子自动还原，不再留「素材」占位字。
4. 选中任一格子，面板第一行就是素材：点即替换、悬停可删、可直接上传。
"""


def apply(js, must, fail):
    # ---------------------------------------------------------------- 主视觉摘除
    js = must(
        "const LEGACY={title:'tx:headline',note2:'tx:stack',count:'tx:stat',"
        "spec:'tx:info',oval:'tx:badge',cta:'tx:cta',ticker:'tx:ticker'};",
        "const LEGACY={title:'tx:headline',note2:'tx:stack',count:'tx:stat',"
        "spec:'tx:info',oval:'tx:badge',cta:'tx:cta',ticker:'tx:ticker',prod:'tx:headline'};",
        js, 'legacy prod')

    # 帧帧强制注入 prod —— 这是「点素材被覆盖」和「串格」的总根因
    js = must(
        "function finalTypes(){const L=layouts(); const t=L.types.map((x,i)=>{"
        "const v=(S.over[i]&&S.over[i].type)||x; return LEGACY[v]||v});\n"
        "  if(t.indexOf('prod')<0){const big=[...t.keys()].sort((i,j)=>L.A[j].w*L.A[j].h-L.A[i].w*L.A[i].h)[0]; t[big]='prod'}\n"
        "  if(t.filter(x=>x==='prod').length>1){let seen=false; t.forEach((x,i)=>{if(x==='prod'){if(seen) t[i]=L.types[i]==='prod'?'plain':L.types[i]; seen=true}})}\n"
        "  return t}",
        "function finalTypes(){const L=layouts(); return L.types.map((x,i)=>{\n"
        "  const o=S.over[i]||{}; const v=o.type||x; const r=LEGACY[v]||v;\n"
        "  // 素材格没有绑定就把这一格还给原本的内容，不再画“素材”占位\n"
        "  if(r==='img'&&!o.aid) return LEGACY[L.types[i]]||L.types[i];\n"
        "  return r})}",
        js, 'finalTypes no hero')

    # 布局分配：不再钦点某一格
    js = must(
        "  const pi=[...rects.keys()].sort((i,j)=>sq(j)-sq(i))[0]; out[pi]='prod';\n"
        "  // title in the widest remaining cell\n"
        "  let ti=idx.filter(i=>i!==pi).filter(i=>px[i].w/px[i].h>1.1&&px[i].h>90)"
        ".sort((i,j)=>rects[j].w*rects[j].h-rects[i].w*rects[i].h)[0];\n"
        "  if(ti===undefined) ti=idx.find(i=>i!==pi); if(ti!==undefined&&heroKind()!=='type') out[ti]='tx:headline';",
        "  // 没有主视觉格：只在最宽的格子里放大标题，其余一视同仁\n"
        "  let ti=idx.filter(i=>px[i].w/px[i].h>1.1&&px[i].h>90)"
        ".sort((i,j)=>rects[j].w*rects[j].h-rects[i].w*rects[i].h)[0];\n"
        "  if(ti===undefined) ti=idx[0]; if(ti!==undefined) out[ti]='tx:headline';",
        js, 'assign no prod')

    js = must(
        "  const prodI=TY.indexOf('prod'); const pr=rects[prodI]; const pcx=pr.x+pr.w/2, pcy=pr.y+pr.h/2;",
        "  const prodI=-1; const pcx=W/2, pcy=H/2;",
        js, 'render prodI')

    js = must(
        "    case 'prod':{ hero(ctx,R,t,it,fill,fg,ac,i,cute); break}",
        "    case 'prod':{ break}  // 主视觉格已取消，只给旧数据兜底",
        js, 'drop prod case')

    # ---------------------------------------------------------------- 素材注册表（闭包内）
    js = must(
        "let IMG=null; let CELLIMG={};",
        r"""let IMG=null; let CELLIMG={};
// 素材按 id 登记：渲染层拿到的是可绘制的 img / video 元素 / 抽帧
let ASSETS={};
// 硬规则：用户亲手贴上去的素材，除非他删素材或复原画面，否则必须一直可见。
// 这份清单和版式解耦，换排列 / 抽卡 / 改参数把 S.over 清空后，会据此把素材重新贴回来。
let MUST_SHOW=[];
function cellAsset(i){
  const o=S.over[i]; if(!o||!o.aid) return null;
  const a=ASSETS[o.aid]; if(!a) return null;
  if(a.el && a.el.readyState>=2) return a.el;
  if(a.frames && a.frames.length>1){
    const n=Math.floor(performance.now()/(1000/15))%a.frames.length;
    return a.frames[n];
  }
  return a.img||a.el||null;
}
function assetSize(im){
  return [im.videoWidth||im.naturalWidth||im.width||1,
          im.videoHeight||im.naturalHeight||im.height||1];
}
// 每帧渲染前对齐一次。硬规则，不留例外：
//   素材数量 > 格子数 时，自动把格子数提到够用为止，绝不牺牲素材。
//   只有用户删掉素材 / 复原画面，素材才会离开画面。
function pinAssets(){
  for(let k=MUST_SHOW.length-1;k>=0;k--){ if(!ASSETS[MUST_SHOW[k]]) MUST_SHOW.splice(k,1) }
  if(!MUST_SHOW.length) return;

  // ① 格子数必须容得下所有必现素材
  const need0=MUST_SHOW.length;
  const maxCells=S.cols*S.rows;
  if(S.count<need0) S.count=Math.min(need0,maxCells);
  if(S.count<need0){                       // 格子确实不够：先加行，再加列
    while(S.count<need0 && S.rows<14){ S.rows++; S.count=Math.min(need0,S.cols*S.rows) }
    while(S.count<need0 && S.cols<16){ S.cols++; S.count=Math.min(need0,S.cols*S.rows) }
  }

  const placed={};
  const L=layouts(); const n=L.A.length;
  if(!n) return;
  // 超出格子范围的旧绑定是无效的：它不会被绘制，却会被误判成「已放置」，
  // 于是素材凭空消失。这里先清掉，再按真实格子重新安置。
  Object.keys(S.over).forEach(function(k){
    const i=+k, o=S.over[k];
    if(!o) return;
    if(i>=n && o.aid){ if(o.prev) o.type=o.prev; else delete o.type; delete o.aid; delete o.prev;
      if(!Object.keys(o).length) delete S.over[k]; }
  });
  Object.keys(S.over).forEach(function(k){
    const i=+k, o=S.over[k];
    if(!o||!o.aid) return;
    if(i<n && (o.type==='img'||o.aid)) placed[o.aid]=1;
  });
  const need=MUST_SHOW.filter(function(id){ return !placed[id] });
  if(!need.length){ S.overKey=geoKey(); return }

  const cand=[];
  for(let i=0;i<n;i++){
    const o=S.over[i]||{};
    if(o.aid) continue;          // 已经放了别的素材，不抢
    const t=LEGACY[L.types[i]]||L.types[i];
    // 优先占装饰格；用户改过内容的格子放后面，但照样征用——素材必现优先于一切
    let sc=0;
    if((t||'').indexOf('tx:')===0) sc+=10;
    if(o.lock) sc+=20;
    if(o.type||o.txt) sc+=100;
    cand.push({i:i, sc:sc});
  }
  cand.sort(function(a,b){ return a.sc-b.sc });
  need.forEach(function(id,k){
    const c=cand[k]; if(!c) return;
    const o=S.over[c.i]||(S.over[c.i]={});
    o.type='img'; o.aid=id;
  });
  S.overKey=geoKey();            // 别让 layouts() 下一帧又把刚补的绑定清掉
}""",
        js, 'asset registry')

    # 渲染入口：先补素材，再定类型
    js = must(
        "  const TY=finalTypes(); const fills=finalFills(TY); LASTTY=TY; LASTFILL=fills;",
        "  pinAssets();\n"
        "  const TY=finalTypes(); const fills=finalFills(TY); LASTTY=TY; LASTFILL=fills;",
        js, 'render pinAssets')

    js = must(
        "setCellImage:(i,im)=>{ if(im) CELLIMG[i]=im; else delete CELLIMG[i]; },",
        "setCellImage:(i,im)=>{ if(im) CELLIMG[i]=im; else delete CELLIMG[i]; },"
        "setAsset:(id,o)=>{ if(o) ASSETS[id]=o; else delete ASSETS[id] },"
        "dropAsset:id=>{ delete ASSETS[id]; const k=MUST_SHOW.indexOf(id); if(k>=0) MUST_SHOW.splice(k,1) },"
        "clearAssets:()=>{ ASSETS={}; MUST_SHOW=[] },"
        "pinAsset:id=>{ if(id&&MUST_SHOW.indexOf(id)<0) MUST_SHOW.push(id) },"
        "unpinAsset:id=>{ const k=MUST_SHOW.indexOf(id); if(k>=0) MUST_SHOW.splice(k,1) },",
        js, 'asset api')

    # 素材格：cover 铺满，靠拖动缩放调整
    js = must(
        "    case 'img':{\n"
        "      const im=CELLIMG[i]||null;\n"
        "      if(im){\n"
        "        const k=Math.max(w/im.width,h/im.height);\n"
        "        const iw=im.width*k, ih=im.height*k;\n"
        "        ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();\n"
        "        ctx.drawImage(im, x+(w-iw)/2, y+(h-ih)/2, iw, ih);\n"
        "        ctx.restore();\n"
        "      } else {\n"
        "        ctx.save(); ctx.fillStyle=fg; ctx.globalAlpha=.35;\n"
        "        ctx.font=font(lab,700); ctx.textAlign='center'; ctx.textBaseline='middle';\n"
        "        ctx.fillText('素材', cx, cy); ctx.restore();\n"
        "      }\n"
        "      break}",
        "    case 'img':{\n"
        "      const im=cellAsset(i);\n"
        "      if(im){\n"
        "        const sz=assetSize(im);\n"
        "        const k=Math.max(w/sz[0],h/sz[1]);\n"
        "        const iw=sz[0]*k, ih=sz[1]*k;\n"
        "        ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();\n"
        "        ctx.drawImage(im, x+(w-iw)/2, y+(h-ih)/2, iw, ih);\n"
        "        ctx.restore();\n"
        "      }\n"
        "      break}",
        js, 'img cover by asset')

    # 面板标题里给素材格一个名字
    js = must(
        "const DN={letter:'大字母',",
        "const DN={img:'素材',letter:'大字母',",
        js, 'DN img')

    # ---------------------------------------------------------------- 格子面板素材行
    js = must(
        "function refreshPopImage(){\n"
        "  var row=$('popImgRow'); if(!row) return;\n"
        "  row.hidden = false;          // 常驻：点格子即可选素材或直接上传\n"
        "  var ty=G.getTypes()[SEL];\n"
        "  var box=$('popImgList'); box.innerHTML='';\n"
        "  GALLERY.forEach(function(g,gi){\n"
        "    var b=document.createElement('button');\n"
        "    b.type='button'; b.className='pimg';\n"
        "    b.style.backgroundImage='url('+g.src+')';\n"
        "    b.setAttribute('aria-label','素材 '+(gi+1));\n"
        "    var cur=G.getCellImage?G.getCellImage(SEL):null;\n"
        "    if(cur===g.img) b.setAttribute('aria-pressed','true');\n"
        "    b.onclick=function(){\n"
        "      pushUndo();\n"
        "      G.setCellImage(SEL, g.img);\n"
        "      if(g.el){ try{g.el.play()}catch(e){} }\n"
        "      if(G.getTypes()[SEL]!=='img'){ Object.assign(over(SEL),{type:'img'}) }\n"
        "      sync(); syncPop(); refreshPopImage();\n"
        "    };\n"
        "    box.appendChild(b);\n"
        "  });\n"
        "  var none=document.createElement('button');\n"
        "  none.type='button'; none.className='pimg none'; none.textContent='无';\n"
        "  none.onclick=function(){ pushUndo(); G.setCellImage(SEL,null); syncPop(); refreshPopImage() };\n"
        "  box.appendChild(none);\n"
        "}",

        r"""// ---- 素材库：一条素材一个稳定 id；格子按 id 记绑定，重排不会串格
var ASSET_SEQ=0;
function assetById(id){ for(var k=0;k<GALLERY.length;k++){ if(GALLERY[k].id===id) return GALLERY[k] } return null }
function syncAsset(g){ if(g&&g.id) G.setAsset(g.id,{img:g.img, el:g.el, frames:g.frames}) }
function ensurePlaying(g){ if(!g) return; if(g.el){ try{ var p=g.el.play(); if(p&&p.catch) p.catch(function(){}) }catch(e){} } }

// 把素材贴到某一格，并记住这一格原本是什么
function bindCellAsset(i,g){
  if(!g||i<0) return;
  pushUndo(); syncAsset(g); ensurePlaying(g);
  G.pinAsset(g.id);                 // 进了「必须可见」清单
  var o=S.over[i]||(S.over[i]={});
  if(!o.aid && o.type!=='img') o.prev=o.type||null;
  o.type='img'; o.aid=g.id;
  if(typeof renderGallery==='function') renderGallery();
}
// 只把素材从这一格拿掉；素材本身还在库里，仍会出现在别的格子上
function unbindCell(i){
  var o=S.over[i]; if(!o||!o.aid) return;
  if(o.prev) o.type=o.prev; else delete o.type;
  delete o.aid; delete o.prev;
}
// 素材被删掉了，凡是用到它的格子都还原
function unbindAsset(gid){
  Object.keys(S.over).forEach(function(k){
    var o=S.over[k]; if(!o||o.aid!==gid) return;
    if(o.prev) o.type=o.prev; else delete o.type;
    delete o.aid; delete o.prev;
  });
}
function unbindAll(){
  Object.keys(S.over).forEach(function(k){
    var o=S.over[k]; if(!o||!o.aid) return;
    if(o.prev) o.type=o.prev; else delete o.type;
    delete o.aid; delete o.prev;
  });
}

// ---- 格子面板第一行：点即用、悬停可删、直接上传
function refreshPopImage(){
  var row=$('popImgRow'); if(!row) return;
  row.hidden = SEL<0; if(SEL<0) return;
  var box=$('popImgList'); box.innerHTML='';
  var cur=(S.over[SEL]&&S.over[SEL].aid)||null;
  GALLERY.forEach(function(g,gi){
    var w=document.createElement('div'); w.className='pimgwrap';
    var b=document.createElement('button');
    b.type='button'; b.className='pimg'+(g.isVideo?' vid':'');
    b.style.backgroundImage='url('+g.src+')';
    b.setAttribute('aria-label','第 '+(gi+1)+' 个素材');
    if(cur===g.id) b.setAttribute('aria-pressed','true');
    b.onclick=function(){ bindCellAsset(SEL,g); sync(); syncPop(); };
    var x=document.createElement('button');
    x.type='button'; x.className='pimgdel';
    x.setAttribute('aria-label','删除第 '+(gi+1)+' 个素材');
    x.innerHTML='<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">'
      +'<path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
    x.onclick=function(e){ e.stopPropagation(); delAsset(gi) };
    w.appendChild(b); w.appendChild(x);
    box.appendChild(w);
  });
  var none=document.createElement('button');
  none.type='button'; none.className='pimg none';
  none.textContent=GALLERY.length?'不用':'先上传';
  none.onclick=function(){
    pushUndo();
    var o=S.over[SEL];
    if(o&&o.aid) G.unpinAsset(o.aid);   // 同时撤掉「必须可见」，否则会被自动搬回来
    unbindCell(SEL); sync(); syncPop();
  };
  box.appendChild(none);
}""",
        js, 'refreshPopImage by asset id')

    # ---------------------------------------------------------------- 面板文案 / 下拉
    js = must(
        "const ty=G.getTypes()[SEL], fi=G.getFills()[SEL]; const isHero=ty==='prod'; const o=S.over[SEL]||{};\n"
        "  $('popTitle').textContent=isHero?'主视觉格':(TN[ty]||'格子');",
        "const ty=G.getTypes()[SEL], fi=G.getFills()[SEL]; const o=S.over[SEL]||{};\n"
        "  $('popTitle').textContent=(TN[ty]||'格子');",
        js, 'popTitle')

    js = must(
        "  if(isHero){Object.entries(HN).forEach(([k,v])=>{if(k==='image'&&!hasImg) return; "
        "const op=document.createElement('option'); op.value='hero:'+k; op.textContent=v; sel.appendChild(op)}); "
        "sel.value='hero:'+(S.hero==='auto'?'type':S.hero); if(GALLERY.length){const gi=document.createElement('optgroup'); "
        "gi.label='上传素材'; GALLERY.forEach(function(g,gi2){const oi=document.createElement('option'); "
        "oi.value='heroimg:'+gi2; oi.textContent='素材 '+(gi2+1)+(g.isVideo?'（视频）':''); gi.appendChild(oi)}); "
        "sel.appendChild(gi); if(HERO_IMG){const at=GALLERY.findIndex(function(g){return g.img===HERO_IMG}); "
        "if(at>=0) sel.value='heroimg:'+at}}}\n  else {",
        "  {",
        js, 'remove isHero dropdown')

    js = must(
        "    if(GALLERY.length){const gi=document.createElement('optgroup'); gi.label='上传素材';"
        "const oi=document.createElement('option'); oi.value='img'; oi.textContent='图片素材'; "
        "gi.appendChild(oi); sel.appendChild(gi);}\n"
        "    const g3=document.createElement('optgroup'); g3.label='其他'; "
        "const op=document.createElement('option'); op.value='prod'; op.textContent='设为主视觉'; "
        "g3.appendChild(op); sel.appendChild(g3); sel.value=ty}",
        "    if(GALLERY.length||ty==='img'){const gi=document.createElement('optgroup'); "
        "gi.label='上传素材';const oi=document.createElement('option'); oi.value='img'; "
        "oi.textContent='素材'; gi.appendChild(oi); sel.appendChild(gi);}\n"
        "    sel.value=ty}",
        js, 'remove prod option')

    js = must("  const isTx=!isHero&&ty.startsWith('tx:'); $('popText').hidden=!isTx;",
              "  const isTx=ty.startsWith('tx:'); $('popText').hidden=!isTx;",
              js, 'isTx')

    js = must(
        "$('popType').onchange=e=>{const v=e.target.value; if(v.startsWith('heroimg:')){pushUndo(); "
        "applyGallery(+v.slice(8)); sync(); syncPop(); return} if(v.startsWith('hero:')){pushUndo(); morph(); "
        "S.hero=v.slice(5); sync(); syncPop(); return}\n"
        "  if(v==='prod'){pushUndo(); const ty=G.getTypes(); const old=ty.indexOf('prod'); "
        "if(old>=0) over(old).type=G.baseTypes()[SEL]==='prod'?'plain':(G.baseTypes()[SEL]||'plain'); "
        "over(SEL).type='prod'; syncPop(); return}\n"
        "  setOver(SEL,{type:v})};",
        "$('popType').onchange=e=>{const v=e.target.value;"
        " if(v==='img'&&!GALLERY.length){ $('popFileAll').click(); return }"
        " setOver(SEL,{type:v})};",
        js, 'popType onchange')

    js = must(
        "$('popNext').onclick=()=>{const ty=G.getTypes()[SEL]; if(ty==='prod'){const ks=Object.keys(HN)"
        ".filter(k=>k!=='image'||hasImg); const cur=S.hero==='auto'?'type':S.hero; pushUndo(); "
        "S.hero=ks[(ks.indexOf(cur)+1)%ks.length]; sync(); syncPop(); return}\n"
        "  const pool=",
        "$('popNext').onclick=()=>{const ty=G.getTypes()[SEL];\n  const pool=",
        js, 'popNext')

    js = must(
        "  ty.forEach((t,i)=>{if(t&&t.startsWith('tx:')&&TXN[t.slice(3)]) out.push({i,l:t.slice(3)}); "
        "else if(t==='prod'&&G.heroKind()==='type') out.push({i,l:'@hero'})});",
        "  ty.forEach((t,i)=>{if(t&&t.startsWith('tx:')&&TXN[t.slice(3)]) out.push({i,l:t.slice(3)})});",
        js, 'txCells no hero')

    js = must("    const name=l==='@hero'?'主视觉大字':TXN[l].name;",
              "    const name=TXN[l]?TXN[l].name:'文字';",
              js, 'buildTx name')

    js = must(
        "    const fields=l==='@hero'?[['h','主标题',1]]:TXN[l].f; "
        "const cur=l==='@hero'?{h:S.text.title}:G.txContent(l,i);",
        "    const fields=TXN[l].f; const cur=G.txContent(l,i);",
        js, 'buildTx fields')

    js = must(
        "      inp.oninput=()=>{autoH(inp); if(l==='@hero'){S.text.title=inp.value; sync()} else "
        "{const o=over(i); o.txt=Object.assign({},o.txt||{},{[k]:inp.value}); if(SEL===i)"
        "{$('popFields').dataset.for=''; syncPop()}} loadFonts()};",
        "      inp.oninput=()=>{autoH(inp); const o=over(i); "
        "o.txt=Object.assign({},o.txt||{},{[k]:inp.value}); if(SEL===i){$('popFields').dataset.for=''; syncPop()} loadFonts()};",
        js, 'buildTx oninput')

    # ---------------------------------------------------------------- 上传
    js = must(
        "    GALLERY=GALLERY.concat(results).slice(-12);\n"
        "    // 不自动应用：只入库，等用户点选",
        "    results.forEach(function(g){ g.id='a'+(++ASSET_SEQ); syncAsset(g) });\n"
        "    GALLERY=GALLERY.concat(results).slice(-12);\n"
        "    // 素材面板只入库；格子面板上传才贴到当前这一格",
        js, 'onPick ids')

    # 在 finish() 末尾贴到当前格
    js = must(
        "    st.textContent=failed.length?('有 '+failed.length+' 个文件读不了：'+failed.join('、')):'';\n"
        "    input.value='';\n"
        "    renderGallery();",
        "    st.textContent=failed.length?('有 '+failed.length+' 个文件读不了：'+failed.join('、')):'';\n"
        "    if(input.id==='popFileAll' && SEL>=0 && results.length) bindCellAsset(SEL, results[0]);\n"
        "    input.value='';\n"
        "    renderGallery();",
        js, 'onPick bind to cell')

    js = must(
        "function applyGallery(i){\n"
        "  var g=GALLERY[i]; if(!g) return;\n"
        "  pauseAllVideos();\n"
        "  HERO_IMG=g.img;\n"
        "  G.setImage(g.img);\n"
        "  hasImg=true;\n"
        "  if(g.el){\n"
        "    try{ g.el.currentTime=0; var pr=g.el.play(); if(pr&&pr.catch) pr.catch(function(){}); }catch(e){}\n"
        "  } else if(g.frames && g.frames.length>1){\n"
        "    var n=0;\n"
        "    g.timer=setInterval(function(){\n"
        "      n=(n+1)%g.frames.length;\n"
        "      G.setImage(g.frames[n]);\n"
        "    }, 1000/VID_FPS);\n"
        "  }\n"
        "  morph(); S.hero='image'; sync();\n"
        "  ['thumb','thumb2'].forEach(function(id){var e=$(id); if(e){e.src=g.src; e.hidden=false}});\n"
        "  if($('clear')) $('clear').hidden=false;\n"
        "  if($('imgRow')) $('imgRow').hidden=false;\n"
        "  renderGallery();\n"
        "}",
        "function applyGallery(i){\n"
        "  var g=GALLERY[i]; if(!g) return;\n"
        "  // 没有全局主视觉：贴到当前选中的格子\n"
        "  if(SEL>=0){ bindCellAsset(SEL,g); sync(); syncPop(); return }\n"
        "  if($('assetMsg')) $('assetMsg').textContent='先在画面里点一个格子，再点素材。';\n"
        "  renderGallery();\n"
        "}",
        js, 'applyGallery to selection')

    js = must(
        "    if(HERO_IMG===g.img) b.setAttribute('aria-pressed','true');\n"
        "    b.onclick=function(){ applyGallery(i) };",
        "    var curA=(SEL>=0&&S.over[SEL]&&S.over[SEL].aid)||null;\n"
        "    if(curA===g.id) b.setAttribute('aria-pressed','true');\n"
        "    b.onclick=function(){ applyGallery(i) };",
        js, 'gallery pressed by id')

    js = must(
        "  if(!GALLERY.length){box.hidden=true; return}\n  box.hidden=false;",
        "  if(!GALLERY.length){box.hidden=true; if($('clear')) $('clear').hidden=true; return}\n"
        "  box.hidden=false; if($('clear')) $('clear').hidden=false;",
        js, 'clear visibility')

    # ---------------------------------------------------------------- 删除 / 清空
    js = must(
        "function delAsset(idx){\n"
        "  var g=GALLERY[idx]; if(!g) return;\n"
        "  pauseAllVideos();\n"
        "  if(g.el){ try{g.el.pause(); g.el.remove()}catch(e){} }\n"
        "  if(g.timer) clearInterval(g.timer);\n"
        "  GALLERY.splice(idx,1);\n"
        "  if(HERO_IMG===g.img){ HERO_IMG=null; if(GALLERY.length) applyGallery(0); else "
        "{ G.setImage(null); hasImg=false; S.hero='type'; morph(); sync() } }\n"
        "  else { morph(); sync() }\n"
        "  if(typeof refreshPopImage==='function') refreshPopImage();\n"
        "  renderGallery();\n"
        "  if($('assetMsg')) $('assetMsg').textContent='已删除该素材。';\n"
        "}",
        "function delAsset(idx){\n"
        "  var g=GALLERY[idx]; if(!g) return;\n"
        "  if(g.el){ try{g.el.pause()}catch(e){} }\n"
        "  if(g.timer) clearInterval(g.timer);\n"
        "  var gid=g.id;\n"
        "  GALLERY.splice(idx,1);\n"
        "  G.dropAsset(gid);\n"
        "  unbindAsset(gid);            // 用到它的格子自动还原\n"
        "  if(typeof refreshPopImage==='function') refreshPopImage();\n"
        "  renderGallery();\n"
        "  if($('assetMsg')) $('assetMsg').textContent='已删除该素材，格子已复原。';\n"
        "  sync();\n"
        "}",
        js, 'delAsset restores cells')

    js = must(
        "clearImg=function(){\n"
        "  pauseAllVideos();\n"
        "  GALLERY.forEach(function(g){ if(g.timer) clearInterval(g.timer); "
        "if(g.el){try{g.remove()}catch(e){}} });\n"
        "  GALLERY=[]; HERO_IMG=null; _clearImg(); renderGallery();\n"
        "};",
        "clearImg=function(){\n"
        "  GALLERY.forEach(function(g){ if(g.timer) clearInterval(g.timer);\n"
        "    if(g.el){ try{g.pause()}catch(e){} } });\n"
        "  GALLERY=[];\n"
        "  G.clearAssets();\n"
        "  unbindAll();                       // 画面随清空一起复原\n"
        "  G.setImage(null); hasImg=false;\n"
        "  if($('thumb')) $('thumb').hidden=true;\n"
        "  if($('clear')) $('clear').hidden=true;\n"
        "  if($('imgRow')) $('imgRow').hidden=true;\n"
        "  ['file','filev','fileall','popFileAll'].forEach(function(id){ var e=$(id); if(e) e.value='' });\n"
        "  if($('assetMsg')) $('assetMsg').textContent='素材已清空，格子已复原。';\n"
        "  if(typeof refreshPopImage==='function') refreshPopImage();\n"
        "  renderGallery(); sync();\n"
        "};",
        js, 'clearImg restores cells')

    # ---------------------------------------------------------------- 「锁定」语义写死
    # 锁定 = 冻结这一格的「内容 + 颜色」：抽卡、换配色、换字体都不动它。
    # 位置和大小不锁，仍跟随版式。可多选：面板里一键锁全部 / 解全部。
    js = must(
        "$('popLock').onclick=()=>{const ty=G.getTypes()[SEL], fi=G.getFills()[SEL]; "
        "const o=S.over[SEL]||{}; if(o.lock) setOver(SEL,{lock:false}); "
        "else setOver(SEL,{lock:true,type:ty,fill:fi})};",
        """$('popLock').onclick=()=>{const ty=G.getTypes()[SEL], fi=G.getFills()[SEL];
  const o=S.over[SEL]||{};
  if(o.lock){ setOver(SEL,{lock:false}); }
  else { setOver(SEL,{lock:true,type:ty,fill:fi}); showMeta(); }
  syncPop()};
$('popLock').title='锁定这一格的内容和颜色：抽卡、换配色时保持不变。位置和大小不锁。';

// ---- 多选锁定：一键锁住全部格子 / 全部解开
var ALL_LOCK=false;
function refreshLockAll(){
  var b=$('lockAll'); if(!b) return;
  b.hidden = !GALLERY.length;
  b.textContent = ALL_LOCK?'解锁全部':'锁定全部';
  b.setAttribute('aria-pressed', String(ALL_LOCK));
}
if($('lockAll')) $('lockAll').onclick=function(){
  pushUndo();
  const ty=G.getTypes(), fi=G.getFills();
  if(ALL_LOCK){
    Object.keys(S.over).forEach(function(k){ const o=S.over[k]; if(o) o.lock=false });
    ALL_LOCK=false;
  } else {
    for(let i=0;i<ty.length;i++){ const o=over(i); o.lock=true; o.type=ty[i]; o.fill=fi[i] }
    ALL_LOCK=true;
  }
  if(typeof refreshLockAll==='function') refreshLockAll();
  sync(); if(SEL>=0) syncPop();
};
function showMeta(){ if($('assetMsg')) $('assetMsg').textContent='这一格已锁定：内容和颜色不再随抽卡改变。'; }""",
        js, 'lock semantics')

    # 面板上把锁定的含义写在按钮旁边
    js = must(
        "  $('popLock').setAttribute('aria-pressed',String(!!o.lock)); "
        "$('popLock').textContent=o.lock?'已锁定':'锁定';",
        "  $('popLock').setAttribute('aria-pressed',String(!!o.lock)); "
        "$('popLock').textContent=o.lock?'已锁定内容':'锁定内容';\n"
        "  if(typeof refreshLockAll==='function') refreshLockAll();",
        js, 'lock label')

    # 提示文案改成说清楚锁的是什么
    js = must(
        "  $('popHint').textContent=SWAP>=0?'再点另一格完成交换（Esc 取消）':"
        "(o.lock?'抽卡时这一格会保持现在的内容和颜色。':'');",
        "  $('popHint').textContent=SWAP>=0?'再点另一格完成交换（Esc 取消）':"
        "(o.lock?'已锁定：抽卡、换配色都保持这一格的内容和颜色；位置和大小仍随版式变化。':'');",
        js, 'lock hint')

    # ---------------------------------------------------------------- 几何变化不再抹掉素材
    # 原代码在版式变化瞬间 S.over={} 全清，素材要等下一帧才被补回来 —— 中间就是「消失」。
    # 改成：清空时把素材绑定先摘出来，由 pinAssets 立刻重新安置，一帧都不缺。
    js = must(
        "  const gkey=geoKey(); if(S.overKey!==gkey){S.over={}; S.overKey=gkey}",
        "  const gkey=geoKey();\n"
        "  if(S.overKey!==gkey){\n"
        "    const keep={};              // 素材绑定跨版式存活\n"
        "    Object.keys(S.over).forEach(function(k){ const o=S.over[k]; if(o&&o.aid) keep[o.aid]=1 });\n"
        "    S.over={}; S.overKey=gkey;\n"
        "    if(MUST_SHOW.length||Object.keys(keep).length){ pinAssets() }\n"
        "  }",
        js, 'geoKey keeps assets')

    js = must(
        "    } else {randomize(sd,opts); S.cseed=Math.floor(rng(sd+3)()*1e6); S.over={}; S.overKey=geoKey(); S.cells=null}",
        "    } else {randomize(sd,opts); S.cseed=Math.floor(rng(sd+3)()*1e6); S.over={}; S.overKey=geoKey(); S.cells=null;"
        " if(MUST_SHOW.length) pinAssets()}",
        js, 'drawBest keeps assets')

        # ---------------------------------------------------------------- 文字卡不再互相遮挡
    # autoH() 在面板隐藏时量 scrollHeight=0，会把 textarea 锁成 2px，切回来文字就叠在一起。
    # 改成：可见才量；量到 0 就不写死高度；页签切换后统一重算。
    js = must(
        "function autoH(el){if(el.tagName==='TEXTAREA'){el.style.height='auto'; "
        "el.style.height=el.scrollHeight+2+'px'}}",
        "function autoH(el){ if(!el||el.tagName!=='TEXTAREA') return;\n"
        "  if(!el.offsetParent && el.getClientRects().length===0) return;  // 面板不可见时不量\n"
        "  el.style.height='auto';\n"
        "  var h=el.scrollHeight; if(h>0) el.style.height=h+'px'; }\n"
        "function autoHAll(){ document.querySelectorAll('#txlist textarea').forEach(autoH) }",
        js, 'autoH measure guard')

    # 切到文案页签、或窗口尺寸变化后，重新量一次
    js = must(
        "setInterval(buildTx,250);",
        "setInterval(buildTx,250);\n"
        "window.addEventListener('resize',function(){ setTimeout(autoHAll,60) });\n"
        "document.addEventListener('click',function(e){\n"
        "  var b=e.target&&e.target.closest?e.target.closest('[role=tab],[data-p]'):null;\n"
        "  if(b) setTimeout(autoHAll,80);\n"
        "},true);\n"
        "setTimeout(autoHAll,120);",
        js, 'autoH on tab switch')

    return js
