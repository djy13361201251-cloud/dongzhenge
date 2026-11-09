# -*- coding: utf-8 -*-
"""用户改过的文字：与素材同一条硬规则——除非用户自己「还原」，否则永远保留且可见。

原逻辑把每格文字存在 S.over[格子序号].txt，抽卡 / 换排列 / 改参数时 S.over 被清空，
文字就退回预设。改为：
  · 文字另存一份按「板式」记的记忆 TXT_MEM[板式][字段]，与版式解耦；
  · txContent 先读这一格的改动，再读记忆，最后才用预设；
  · pinTexts：每帧检查，改过的板式如果在新版式里不存在，就征用一格放回去（避开素材格与锁定格）；
  · 「还原」这一格才清掉对应记忆。
"""


def apply(js, must, fail):
    js = must(
        "let ASSETS={};",
        r"""let ASSETS={};
// 用户改过的文字，按板式记忆，跨版式存活
let TXT_MEM={};
function memHas(l){ const m=TXT_MEM[l]; return !!m && Object.keys(m).length>0 }
function pinTexts(){
  const ls=Object.keys(TXT_MEM).filter(memHas);
  if(!ls.length) return;
  const L=layouts(); const n=L.A.length; if(!n) return;
  const cur=L.types.map(function(x,i){ const o=S.over[i]||{}; const v=o.type||x; return LEGACY[v]||v });
  const need=ls.filter(function(l){ return cur.indexOf('tx:'+l)<0 });
  if(!need.length) return;
  const sz=size(), W=sz[0], H=sz[1];
  const cand=[];
  for(let i=0;i<n;i++){
    const o=S.over[i]||{};
    if(o.aid||o.lock) continue;                                   // 素材格、锁定格不动
    const t=cur[i]||'';
    if(t.indexOf('tx:')===0 && memHas(t.slice(3))) continue;      // 已经承载别的改动文字
    cand.push({i:i, p:toPx(L.A[i],W,H), tx:t.indexOf('tx:')===0});
  }
  need.forEach(function(l){
    if(!cand.length) return;
    let bk=-1, bs=-1;
    cand.forEach(function(c,k){
      const a=c.p.w/c.p.h, mn=Math.min(c.p.w,c.p.h);
      const s=(txEligible(l,a,mn)?2e9:0)+(c.tx?0:1e9)+c.p.w*c.p.h;  // 放得下优先，其次占装饰格，再按面积
      if(s>bs){ bs=s; bk=k }
    });
    const c=cand.splice(bk,1)[0];
    const o=S.over[c.i]||(S.over[c.i]={});
    o.type='tx:'+l;
  });
  if(need.length>cand.length && S.count<S.cols*S.rows) S.count++;   // 格子不够就加一格
  S.overKey=geoKey();
}""",
        js, 'text memory')

    # 读取：这一格的改动 > 板式记忆 > 预设
    js = must(
        "function txContent(l,i){const d=txDefault(l,i); const o=(S.over[i]&&S.over[i].txt)||{};",
        "function txContent(l,i){const d=txDefault(l,i); const o=Object.assign({},TXT_MEM[l]||{},(S.over[i]&&S.over[i].txt)||{});",
        js, 'txContent reads memory')

    # 每帧、版式重建、抽卡后都对齐一次
    js = must("  pinAssets();\n  const TY=finalTypes();",
              "  pinAssets(); pinTexts();\n  const TY=finalTypes();", js, 'render pinTexts')
    js = must("    if(MUST_SHOW.length||Object.keys(keep).length){ pinAssets() }",
              "    if(MUST_SHOW.length||Object.keys(keep).length){ pinAssets() }\n    pinTexts();",
              js, 'layouts pinTexts')
    js = must(" if(MUST_SHOW.length) pinAssets()}",
              " if(MUST_SHOW.length) pinAssets(); pinTexts()}", js, 'drawBest pinTexts')

    js = must(
        "clearAssets:()=>{ ASSETS={}; MUST_SHOW=[] },",
        "clearAssets:()=>{ ASSETS={}; MUST_SHOW=[] },"
        "memTxt:(l,k,v)=>{ if(!l) return; (TXT_MEM[l]=TXT_MEM[l]||{})[k]=v },"
        "clearTxt:l=>{ delete TXT_MEM[l] },",
        js, 'text memory api')

    # 写入：两个编辑入口都同步记忆
    js = must(
        "inp.oninput=()=>{const o=over(SEL); o.txt=Object.assign({},o.txt||{},{[k]:inp.value}); loadFonts()};",
        "inp.oninput=()=>{const o=over(SEL); o.txt=Object.assign({},o.txt||{},{[k]:inp.value}); G.memTxt(l,k,inp.value); loadFonts()};",
        js, 'popFields remember')
    js = must(
        "inp.oninput=()=>{autoH(inp); const o=over(i); o.txt=Object.assign({},o.txt||{},{[k]:inp.value});",
        "inp.oninput=()=>{autoH(inp); const o=over(i); o.txt=Object.assign({},o.txt||{},{[k]:inp.value}); G.memTxt(l,k,inp.value);",
        js, 'txlist remember')

    # 「还原」这一格：清掉它的文字记忆与素材绑定，才允许消失
    js = must(
        "$('popReset').onclick=()=>{pushUndo(); delete S.over[SEL]; $('popFields').dataset.for=''; syncPop()};",
        "$('popReset').onclick=()=>{pushUndo(); const ty=G.getTypes()[SEL]||''; const o=S.over[SEL]||{};"
        " if(ty.indexOf('tx:')===0) G.clearTxt(ty.slice(3)); if(o.aid) G.unpinAsset(o.aid);"
        " delete S.over[SEL]; $('popFields').dataset.for=''; syncPop()};",
        js, 'reset clears memory')
    return js
