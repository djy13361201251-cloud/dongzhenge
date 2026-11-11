# ============================================================ 视觉重构
# 参考 Google Labs：奶油底 + 大圆角 + 几何色块 + 药丸控件；去掉细线描边与网格纸
RESTYLE = r"""
/* ===== 视觉语言：奶油底 / 大圆角 / 药丸控件 / 几何色块 ===== */
:root{
  --paper:#F9F3EE; --mat:#F4EDE6; --sheet:#FFFFFF; --hover:#F1E9E1; --fill:#EFE7DF;
  --ink:#141414; --ink2:#33302C; --muted:#8C8578; --dim:#B9B1A6;
  --hair:rgba(20,20,20,.08); --hair2:rgba(20,20,20,.14);
  --blue:#4285F4; --green:#3EDC81; --pink:#F9C5F5; --yellow:#F9C846; --orange:#FA8443;
  --R:28px; --gap:14px;
}
body{font-size:13.5px;background:var(--paper)}

/* 卡片：无描边，仅极浅投影 */
.cell{border:0;background:var(--sheet);border-radius:var(--R);box-shadow:0 1px 2px rgba(60,40,20,.05)}

/* 舞台：奶油底 + 饱和的大块几何，呼应参考图 */
.desk{background-color:var(--mat);
  background-image:
    radial-gradient(42% 34% at 4% 4%,   rgba(66,133,244,.72), rgba(66,133,244,0) 70%),
    radial-gradient(38% 30% at 97% 97%, rgba(249,200,70,.82), rgba(249,200,70,0) 72%),
    radial-gradient(30% 26% at 95% 3%,  rgba(62,220,129,.60), rgba(62,220,129,0) 72%),
    radial-gradient(34% 28% at 3% 97%,  rgba(249,197,245,.80), rgba(249,197,245,0) 74%),
    radial-gradient(26% 22% at 50% 100%,rgba(250,132,67,.55), rgba(250,132,67,0) 72%);
  background-size:auto;background-position:0 0;background-repeat:no-repeat}
.stage canvas{border-radius:0;box-shadow:0 20px 54px -26px rgba(60,40,20,.46)}

/* 按钮：药丸 */
.btn{border:0;border-radius:999px;background:var(--fill);padding:8px 17px;font-weight:600;color:var(--ink)}
.btn:hover{background:#E7DCD2;border-color:transparent}
.btn.ink{background:var(--ink);color:#fff}
.btn.ink:hover{background:#000}
.btn.sm{border-radius:999px;padding:7px 14px}
.btn:disabled{background:var(--fill);border-color:transparent}
.drawrow .btn{padding-top:6px;padding-bottom:6px}

/* 抽一张：大圆角黑块 */
.drawbtn{border-radius:24px}
.drawbtn b{letter-spacing:-.02em}

/* 分段控件：药丸组 */
.seg{border:0;border-radius:999px;background:var(--hover);padding:4px}
.seg button{border-left:0;border-radius:999px;color:var(--ink2)}
.seg button:hover{background:rgba(20,20,20,.05)}
.seg button[aria-pressed="true"]{background:var(--ink);color:#fff}

/* tab：浮起的药丸条，选中即实心 */
.tabs{border-bottom:0;background:var(--hover);border-radius:999px;padding:5px;margin:11px 12px 2px}
.tabs::after{display:none}
.tabs button{border-radius:999px;color:var(--ink2)}
.tabs button:hover{color:var(--ink)}
.tabs button[aria-selected="true"]{background:var(--ink);color:#fff}

/* 输入 */
input[type=text],textarea,select{border:0;border-radius:14px;background:var(--hover)}
input[type=text]:hover,textarea:hover,select:hover{border-color:transparent;background:#EDE4DB}
input[type=text]:focus,textarea:focus,select:focus{box-shadow:0 0 0 2px var(--ink);border-color:transparent}

/* 色卡与色块 */
.sw{border-radius:11px}
.sw:hover{transform:translateY(-3px)}
.sw[aria-pressed="true"]{outline:2px solid var(--ink);outline-offset:2px}
.colors input{border:0;border-radius:11px}
.five label{border-radius:16px;box-shadow:none}
.five label:hover{transform:translateY(-3px)}
.popcols button{border-radius:11px;box-shadow:none}
.popcols button[aria-pressed="true"]{outline:2px solid var(--ink);outline-offset:2px}

/* 文字卡片 */
.txc{border:0;background:var(--hover);border-radius:20px}
.txc:hover,.txc.on{background:#EFE6DD}
.txc.flash{animation:flash 1s var(--soft)}

/* 画布上的浮层 */
.pop{border:0;border-radius:24px;box-shadow:0 28px 70px -24px rgba(50,30,10,.40)}
.pophead{border-bottom:1px solid var(--hair)}
.pop .x{border:0;background:var(--hover);color:var(--ink)}
.pop .x:hover{background:#E7DCD2}
.badge{border:0;border-radius:999px;box-shadow:0 8px 22px -8px rgba(0,0,0,.26)}
.selbox{border-radius:14px;box-shadow:0 0 0 4px rgba(255,255,255,.85)}
.hovbox{border-radius:14px}
.lockpin{border-radius:999px}

/* 稀有度：用色块表达 */
.result b{border:0}
.result[data-tier="SSR"] b,.badge[data-tier="SSR"] b{background:var(--yellow);color:#141414}
.result[data-tier="SR"] b,.badge[data-tier="SR"] b{background:var(--blue);color:#fff}
.result[data-tier="R"] b,.badge[data-tier="R"] b{background:var(--hover);color:var(--ink)}

/* 滑杆：更粗的轨道与更大的圆钮 */
input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:3px}
input[type=range]::-webkit-slider-thumb{width:18px;height:18px;margin-top:-7px;box-shadow:0 1px 4px rgba(0,0,0,.26)}
input[type=range]::-moz-range-track{height:4px;border-radius:3px}
input[type=range]::-moz-range-progress{height:4px;border-radius:3px}
input[type=range]::-moz-range-thumb{width:14px;height:14px;border-width:3px}

/* 开关 */
.toggle input{width:34px;height:20px;border:0;background:var(--hair2)}
.toggle input::after{width:14px;height:14px;left:3px;top:3px}
.toggle input:checked::after{transform:translateX(14px)}

.prog{height:3px;border-radius:3px}
.prog span{border-radius:3px}
.thumb{border:0;border-radius:11px}
/* 字体项：悬停删除，与其他素材层级一致 */
.fontwrap{position:relative;display:inline-flex}
.fontdel{position:absolute;right:-5px;top:-5px;width:16px;height:16px;border-radius:50%;border:0;
  background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;
  cursor:pointer;padding:0;opacity:0;transform:scale(.7);transition:opacity .16s,transform .18s var(--spring);
  box-shadow:0 2px 6px rgba(0,0,0,.28);z-index:2}
.fontwrap:hover .fontdel,.fontwrap:focus-within .fontdel{opacity:1;transform:scale(1)}
.fontdel:hover{background:#000}

/* 素材缩略图：悬停删除 */
.gwrap{position:relative;display:block;min-width:0}
.gwrap .gitem{width:100%;display:block}
.gdel{position:absolute;right:-5px;top:-5px;width:17px;height:17px;border-radius:50%;border:0;
  background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;
  cursor:pointer;padding:0;opacity:0;transform:scale(.7);
  transition:opacity .16s,transform .18s var(--spring);box-shadow:0 2px 6px rgba(0,0,0,.28);z-index:2}
.gwrap:hover .gdel,.gwrap:focus-within .gdel{opacity:1;transform:scale(1)}
.gdel:hover{background:#000}

/* 按钮行：抵消兼容层的负边距，避免与上方内容粘连 */
#p-color .row,#p-assets .row,#inspPop .row{margin-top:6px!important}
#p-color .row + .grp{margin-top:16px}
#p-assets .row + .grp{margin-top:16px}
#inspPop .row{margin-top:10px!important}
.row > .hint{margin-left:8px}

/* 字体选择列表 */
.fontlist{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px}
.fontitem{border:0;border-radius:999px;padding:8px 14px;font:inherit;font-size:13px;
  background:var(--hover);color:var(--ink);cursor:pointer;max-width:100%;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:background .18s}
.fontitem:hover{background:#E7DCD2}
.fontitem[aria-pressed="true"]{background:var(--ink);color:#fff}
/* 素材面板：上传区更宽松 */
#p-assets .gallery{grid-template-columns:repeat(4,1fr)}
#p-assets .row{gap:8px}

/* 上下文面板：格子编辑不再是浮层，改为右侧主视图 */
.inspview{padding:14px 18px 18px;display:flex;flex-direction:column;gap:12px;
  animation:paneIn .32s var(--soft) both}
.inspview[hidden]{display:none!important}
.inspview .pophead{margin:-4px -4px 2px;padding:0 0 10px;border-bottom:1px solid var(--hair);
  display:flex;align-items:center;gap:10px}
.popback{border:0;background:var(--hover);border-radius:999px;padding:6px 12px;font:inherit;
  font-size:12px;font-weight:600;color:var(--ink2);cursor:pointer;white-space:nowrap}
.popback:hover{background:#E7DCD2;color:var(--ink)}
.inspview .pophead #popTitle{margin-left:auto;font-size:13px;font-weight:700;color:var(--muted)}
.inspview .pop .x, .inspview .x{width:28px;height:28px;border:0;background:var(--hover);
  border-radius:50%;cursor:pointer;color:var(--ink);font-size:15px;line-height:1}
.inspview .x:hover{background:#E7DCD2}
.inspview .popcols button{height:34px}
.inspview .popacts .btn{padding:9px 10px}
.inspview .popacts{grid-gap:8px}

/* 进入格子编辑时，页签条淡出，避免两个导航并存 */
.tabs.is-dim{opacity:.34;pointer-events:none;transition:opacity .25s}

/* 选中框在画布上常驻，且不与面板重叠 */
.selbox{border-radius:12px;box-shadow:0 0 0 3px rgba(255,255,255,.9)}

/* 画布不再被浮层挤压 */
.stage canvas{border-radius:0}
.pop{position:static;width:auto;max-height:none;overflow:visible;background:none;
  box-shadow:none;border-radius:0}

/* 弹窗内的素材选择行：正方形用 padding-top 撑，Chrome 61 没有 aspect-ratio */
.popimgs{display:grid;grid-template-columns:repeat(4,1fr);grid-gap:8px;margin-top:8px}
.pimgwrap{position:relative;display:block;min-width:0;padding-top:100%}
.pimgwrap > .pimg{position:absolute;left:0;top:0;width:100%;height:100%}
.pimg{width:100%;border:0;border-radius:12px;padding:0;cursor:pointer;box-sizing:border-box;
  background-size:cover;background-position:center;background-color:var(--hover);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.07)}
.pimg[aria-pressed="true"]{box-shadow:0 0 0 2px var(--ink)}
.pimg.none{display:flex;align-items:center;justify-content:center;font-size:11px;
  color:var(--muted);background:var(--hover);border:1px dashed var(--hair2)}
.pimg.vid::before{content:"";position:absolute;left:6px;bottom:6px;width:0;height:0;
  border-left:9px solid #fff;border-top:6px solid transparent;border-bottom:6px solid transparent;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))}
.pimgdel{position:absolute;right:-5px;top:-5px;width:17px;height:17px;border-radius:50%;border:0;
  background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;
  cursor:pointer;padding:0;opacity:0;transform:scale(.7);
  transition:opacity .16s,transform .18s var(--spring);box-shadow:0 2px 6px rgba(0,0,0,.28);z-index:2}
.pimgwrap:hover .pimgdel,.pimgwrap:focus-within .pimgdel{opacity:1;transform:scale(1)}
.pimgdel:hover{background:#000}

/* 色卡：色彩库 3 列更宽松；我的色卡用弹性列避免被压扁 */
#presets{grid-template-columns:repeat(3,1fr)!important;grid-gap:10px}
#mine{grid-template-columns:repeat(auto-fill,minmax(88px,1fr));grid-gap:10px}
#presets .sw,#mine .sw{height:26px}
.lib{grid-gap:10px}

/* 五色块：内边距更足，底标不被圆角切掉 */
.five label{border-radius:18px;min-width:0}
.five label:first-child::after{left:9px;top:7px;font-size:11px}

/* 三入口并列时自动换行，不被压 */
.row{row-gap:8px}

/* 色卡：渐变条 + 悬停删除 */
#presets .sw, #mine .sw{border-radius:11px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}
.swwrap{position:relative;display:block;min-width:0}
.swwrap .sw{width:100%;display:block}
.swdel{position:absolute;right:-5px;top:-5px;width:17px;height:17px;border-radius:50%;border:0;
  background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:center;
  cursor:pointer;padding:0;opacity:0;transform:scale(.7);transition:opacity .16s,transform .18s var(--spring);
  box-shadow:0 2px 6px rgba(0,0,0,.28);z-index:2}
.swwrap:hover .swdel,.swwrap:focus-within .swdel{opacity:1;transform:scale(1)}
.swdel:hover{background:#000}

/* 上传：照片 / 视频 两个入口并列 */
.row > label[data-kind]{cursor:pointer}
.row > label[data-kind="video"]{background:var(--ink);color:#fff}
.row > label[data-kind="video"]:hover{background:#000}

/* 缩略图列表 */
.gallery{display:grid;grid-template-columns:repeat(5,1fr);grid-gap:8px;margin:0 0 10px 0;width:100%;box-sizing:border-box}
.gwrap{position:relative;display:block;min-width:0;padding-top:100%}
.gwrap .gitem{position:absolute;left:0;top:0;height:100%}
.gitem{width:100%;box-sizing:border-box;border:0;border-radius:14px;padding:0;cursor:pointer;background-size:cover;background-position:center;
  background-color:var(--hover);transition:transform .3s var(--spring),box-shadow .2s;position:relative}
.gitem:hover{transform:translateY(-2px)}
.gitem[aria-pressed="true"]{box-shadow:0 0 0 2px var(--ink)}
.gitem.vid::before{content:"";position:absolute;left:6px;bottom:6px;width:0;height:0;
  border-left:11px solid #fff;border-top:7px solid transparent;border-bottom:7px solid transparent;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}
.gitem[aria-pressed="true"]::after{content:"";position:absolute;right:6px;bottom:6px;width:14px;height:14px;border-radius:50%;
  background:var(--ink);box-shadow:inset 0 0 0 3px #fff}

/* 全屏演示：只留海报，暗场铺满 */
/* 顶栏只留退出按钮，其余隐藏 */
body.stageonly .top{display:flex!important;position:fixed;right:16px;top:16px;left:auto;z-index:120;
  min-height:0;padding:0;background:none}
body.stageonly .top > *:not(#fs){display:none!important}
body.stageonly .side,
body.stageonly .dock,
body.stageonly .editHint{display:none!important}
body.stageonly{background:#0b0b0d;overflow:hidden}
body.stageonly .app{height:100vh;max-width:none;padding:0}
body.stageonly .main{display:block;flex:none;height:100vh;margin:0!important;padding:0!important;grid-gap:0}
body.stageonly .desk{position:static;height:100vh;width:100%;border-radius:0;padding:0;
  background-image:none;background-color:#0b0b0d;display:flex;align-items:center;justify-content:center}
body.stageonly .stage{height:100vh;width:100%;max-height:none;min-height:0;padding:0;
  display:flex;align-items:center;justify-content:center;flex:none}
body.stageonly .stage canvas{border-radius:0;box-shadow:none;
  max-width:100vw;max-height:100vh;width:auto!important;height:auto!important;object-fit:contain}
body.stageonly #fs{position:fixed;right:20px;top:20px;z-index:99;
  background:rgba(255,255,255,.14);color:#fff;border:0;
  -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
body.stageonly #fs:hover{background:rgba(255,255,255,.26)}

/* 侧栏高度链：paneWrap 必须是 flex 容器，里面的 .pane 才能拿到 flex:1 自己滚动，
   否则内容会把面板撑出窗口，底部被裁掉一截。 */
#paneWrap{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
#paneWrap > .pane{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;
  padding-bottom:24px;-webkit-overflow-scrolling:touch}
#paneWrap > .pane::after{content:"";display:block;height:8px}
.side{overflow:hidden}

/* 上传按钮：透明 input 铺满按钮，手指点到的就是 input 本身 */
.filebtn{position:relative;overflow:hidden;cursor:pointer}
.fileov{position:absolute;left:0;top:0;width:100%;height:100%;margin:0!important;padding:0;
  opacity:0;cursor:pointer;font-size:0;z-index:1}

/* ===== 手机端 ===== */
html,body{overflow-x:hidden}
@media (max-width:640px){
  /* 顶栏：品牌一行，三个操作等分一行，不再横向溢出 */
  .top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-gap:8px;
    align-items:center;padding:0;min-height:0}
  .top > *{margin:0!important}
  .top .brand{grid-column:1 / -1;height:40px}
  .top #fs,.top #png,.top #mp4{width:100%;min-width:0;height:40px;padding-left:8px;padding-right:8px;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;justify-content:center}
  /* 底部让出 Home 指示条 */
  .app{padding-bottom:24px;padding-bottom:calc(24px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))!important}
}
/* 小红书容器：顶部让出状态栏 + 导航胶囊（返回 / 分享 / 更多） */
.in-xhs .app{padding-top:56px;padding-top:calc(48px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))!important}

/* 全屏演示的退出按钮：放在底部居中。右上角会被小红书的导航胶囊（分享 / 更多）盖住 */
body.stageonly #fs{position:fixed!important;display:inline-flex!important;left:50%;right:auto;top:auto;
  bottom:32px;bottom:calc(32px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
  transform:translateX(-50%);z-index:300;height:44px;width:auto!important;padding:0 24px;margin:0!important;
  border-radius:22px;background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.28);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);font-size:15px}
/* 全屏演示：盖过小红书顶部留白与手机固定布局，画面按剩余高度完整放下；锁定角标、选框不显示 */
body.stageonly .app{padding:0!important;height:100vh;height:var(--appH,100vh)!important;max-width:none}
body.stageonly .main,body.stageonly .desk,body.stageonly .stage{height:100vh;height:var(--appH,100vh)!important;margin:0!important}
body.stageonly .stage canvas{max-height:100vh;max-height:var(--appH,100vh)}
.in-xhs.stageonly .stage,.in-xhs .stageonly .stage,body.in-xhs.stageonly .stage{box-sizing:border-box;
  padding-top:48px;padding-top:calc(48px + var(--safe-area-inset-top, env(safe-area-inset-top, 0px)))}
.in-xhs.stageonly .stage canvas,.in-xhs .stageonly .stage canvas{
  max-height:calc(100vh - 56px);max-height:calc(var(--appH,100vh) - 48px - var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) - 8px)}
body.stageonly .lockpin,body.stageonly .selbox,body.stageonly .hovbox,body.stageonly .badge{display:none!important}
body.stageonly .toast{bottom:96px;bottom:calc(96px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))}

/* 小红书内「上传视频」：保留按钮，暂不可点 */
.filebtn.off{opacity:.4;pointer-events:none;cursor:default}
.filebtn.off .fileov{display:none}
/* 小红书内「上传视频」测试中角标 */
.filebtn .beta{display:inline-block;margin-left:4px;padding:0 8px;height:20px;line-height:20px;border-radius:10px;
  background:#FFD43B;color:#141414;font-size:11px;font-weight:700;vertical-align:middle}

/* 口播模式：进度条上的卡点刻度 + 卡点工具条 */
.scrubwrap{position:relative;flex:1;min-width:0;display:flex;align-items:center}
.scrubwrap > input[type=range]{width:100%}
.cuemarks{position:absolute;left:8px;right:8px;top:50%;height:0;pointer-events:none}
.cuemarks i{position:absolute;top:-8px;width:4px;height:16px;margin-left:-2px;border-radius:2px;background:#FF4FA3;
  box-shadow:0 0 0 2px var(--sheet)}
.vorow{flex:0 0 100%;width:100%;margin-top:12px}
.vobar{display:flex;align-items:center;flex-wrap:wrap}
.vobar > *{margin:0 8px 8px 0!important}
.votag{display:inline-block;height:24px;line-height:24px;padding:0 12px;border-radius:12px;background:#FF4FA3;color:#fff;
  font-size:12px;font-weight:700}
.cuelist{display:flex;flex-wrap:wrap}
.cue{display:inline-flex;align-items:center;margin:0 8px 8px 0;border-radius:16px;background:var(--hover);overflow:hidden}
.cue > button{border:0;background:none;font:inherit;font-size:12px;color:var(--ink);cursor:pointer;height:32px;padding:0 12px}
.cue > .cuedel{padding:0 12px 0 4px;color:var(--muted);font-size:16px}
.cue.on{background:var(--ink)}
.cue.on > button{color:#fff}
.vo-on .editHint{display:none}

/* 浮动提示：手机上状态栏文字不可见，消息从底部浮出 */
.toast{position:fixed;left:16px;right:16px;bottom:24px;bottom:calc(24px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
  z-index:200;margin:0 auto;max-width:480px;padding:12px 16px;border-radius:16px;background:rgba(20,20,20,.92);color:#fff;
  font-size:14px;line-height:1.5;text-align:center;opacity:0;transform:translateY(12px);pointer-events:none;
  transition:opacity .2s,transform .25s var(--spring)}
.toast.on{opacity:1;transform:translateY(0)}

/* 手机：演示 / 导出 挪到「抽一张」卡片底部，三等分 */
.acts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-gap:8px;margin-top:12px}
.acts > *{margin:0!important}
.acts .btn{width:100%;min-width:0;height:40px;padding-left:8px;padding-right:8px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;justify-content:center}
/* 窄屏是上下堆叠：画布卡片按内容高度走，时间轴不再被拉伸成一大块空白 */
@media (max-width:1000px){
  .main{display:block!important}
  .main > .side{margin-top:16px;height:auto}
  .desk{height:auto!important}
  .dock{align-content:flex-start;flex-wrap:wrap!important}
  .dock .editHint{flex:0 0 100%;width:100%;max-width:100%;box-sizing:border-box}
}
@media (max-width:640px){
  .top{display:flex;min-height:40px}
  .stage{padding:12px}
}
/* 手机：上半部分（顶栏 + 画布 + 时间轴）固定不动，只有下面的操作区自己滚动，方便录屏。
   --appH 由脚本写入 window.innerHeight（iOS 的 100vh 会把浏览器工具栏算进去）。 */
@media (max-width:640px){
  html,body{height:100%;overflow:hidden!important;overscroll-behavior:none}
  .app{height:100vh;height:var(--appH,100vh);box-sizing:border-box;display:flex!important;flex-direction:column;
    overflow:hidden;padding-bottom:0!important}
  .app > .top{flex:none}
  .main{display:flex!important;flex-direction:column;align-items:stretch!important;flex:1;min-height:0;width:100%}
  .main > .desk,.main > .side{width:100%;box-sizing:border-box;align-self:stretch}
  .main > .desk{flex:none}
  .main > .side{flex:1;min-height:0;height:auto!important;margin-top:12px;overflow-x:hidden;overflow-y:auto!important;
    overscroll-behavior:contain;border-radius:var(--R) var(--R) 0 0;
    padding-bottom:24px;padding-bottom:calc(24px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))}
  .side .insp,.side #paneWrap{display:block;height:auto;overflow:visible}
  .side #paneWrap > .pane{overflow:visible;height:auto}
  .dock{padding-top:8px;padding-bottom:8px}
  .dock .editHint{display:none}
}
"""


def apply_restyle(css):
    """把视觉层追加到样式表末尾（同权重下后者生效）"""
    return css + '\n' + RESTYLE
