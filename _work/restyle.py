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
/* 弹窗内的素材选择行 */
.popimgs{display:grid;grid-template-columns:repeat(4,1fr);grid-gap:8px;margin-top:8px}
.pimg{width:100%;aspect-ratio:1;border:0;border-radius:12px;padding:0;cursor:pointer;
  background-size:cover;background-position:center;background-color:var(--hover);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.07)}
.pimg[aria-pressed="true"]{box-shadow:0 0 0 2px var(--ink)}
.pimg.none{display:flex;align-items:center;justify-content:center;font-size:11px;
  color:var(--muted);background:var(--hover);border:1px dashed var(--hair2)}

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
.gitem{width:100%;aspect-ratio:1;box-sizing:border-box;border:0;border-radius:14px;padding:0;cursor:pointer;background-size:cover;background-position:center;
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
"""


def apply_restyle(css):
    """把视觉层追加到样式表末尾（同权重下后者生效）"""
    return css + '\n' + RESTYLE
