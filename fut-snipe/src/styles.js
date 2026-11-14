  // ---------- styles ----------
  // Dark navy with a light-cyan accent: big soft cards, a tile bar at the top, a summary card with
  // three numbers, icon rows with a value and a chevron, one big cyan action button. Green = money.
  var C_BG = '#121722', C_CARD = '#1a2030', C_CARD2 = '#222a3b', C_CARD3 = '#2c3549', C_LINE = 'rgba(255,255,255,.07)';
  var C_TXT = '#eef2f8', C_MUT = '#8a94a8', C_MUT2 = '#5d677c';
  var C_CYAN = '#5ac8f5', C_CYAN_BG = 'rgba(90,200,245,.12)', C_OK = '#4ade80', C_RED = '#f87171', C_ORANGE = '#fb923c', C_GOLD = '#e8c766';
  var FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",system-ui,"Helvetica Neue",sans-serif';
  var NUM = 'font-variant-numeric:tabular-nums;';
  var CAPS = 'text-transform:uppercase;letter-spacing:1.4px;font-size:11.5px;font-weight:600;color:' + C_MUT + ';';
  var CSS =
    '#fs-panel *,#fs-fab,#fs-fab *,#fs-lock *,#fs-toast *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}' +
    '#fs-panel button,#fs-lock button{font-family:' + FONT + ';cursor:pointer}' +
    '#fs-panel svg.i,#fs-lock svg.i{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
    // panel + header
    '#fs-panel{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;font:15px/1.4 ' + FONT + ';color:' + C_TXT + ';background:' + C_BG + ';-webkit-font-smoothing:antialiased}' +
    '#fs-panel.open{display:flex;animation:fsfade .2s ease-out}@keyframes fsfade{from{opacity:0}to{opacity:1}}' +
    '#fs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px 10px;padding-top:max(12px,env(safe-area-inset-top))}' +
    '#fs-head .brand{display:flex;align-items:center;gap:10px}#fs-head .logo{width:34px;height:34px;border-radius:10px;background:' + C_CYAN_BG + ';color:' + C_CYAN + ';display:flex;align-items:center;justify-content:center}' +
    '#fs-head .t{font-weight:800;font-style:italic;font-size:22px;letter-spacing:-.3px}#fs-head .v{font-size:11px;color:' + C_MUT2 + ';margin-left:6px;font-style:normal;font-weight:500}' +
    '#fs-head .coins{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:700;color:' + C_TXT + ';' + NUM + 'background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:12px;padding:7px 11px}' +
    '#fs-head .coins:before{content:"";width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff3c4,' + C_GOLD + ' 55%,#b8952f);box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.25)}' +
    '#fs-min{background:' + C_CARD + ';color:' + C_TXT + ';border:1px solid ' + C_LINE + ';border-radius:50%;width:38px;height:38px;font-size:15px;margin-left:8px}' +
    '#fs-body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:14px 16px;padding-bottom:max(28px,env(safe-area-inset-bottom));width:100%;max-width:560px;margin:0 auto;overflow-x:hidden}' +
    // tile bar
    '#fs-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:0 16px;max-width:528px;align-self:center;width:calc(100% - 32px)}' +
    '.fs-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:74px;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:14px;padding:8px 4px;color:' + C_MUT + ';transition:border-color .15s,background .15s}' +
    '.fs-tile.on{border-color:rgba(90,200,245,.55);background:#1c2638;color:' + C_TXT + '}' +
    '.fs-tile .ti{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:' + C_CARD3 + ';color:' + C_TXT + '}.fs-tile.on .ti{background:' + C_CYAN_BG + ';color:' + C_CYAN + '}' +
    '.fs-tile .ti.live{color:' + C_OK + ';background:rgba(74,222,128,.14)}' +
    '.fs-tile .tl{' + CAPS + 'font-size:10.5px;color:inherit}' +
    '.fs-tile .tg{position:relative;width:50px;height:32px}.fs-tile .tg svg{width:50px;height:29px}.fs-tile .tg b{position:absolute;left:0;right:0;bottom:-2px;text-align:center;font-size:14px;font-weight:800;color:' + C_TXT + ';' + NUM + '}' +
    // section titles
    '.ios-h,.fs-sect-h{' + CAPS + 'padding:20px 2px 9px}.ios-h:empty{padding:6px 0 0}#fs-block+.ios-h{padding-top:4px}' +
    // summary card (Sniper)
    '.sx-sum{background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:18px;padding:16px 16px 0;overflow:hidden}' +
    '.sx-k{' + CAPS + '}.sx-name{font-size:24px;font-weight:800;letter-spacing:-.4px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sx-name.muted{color:' + C_MUT + ';font-weight:600;font-size:20px}' +
    '.sx-sub{font-size:14px;color:' + C_MUT + ';margin-top:2px}' +
    '.sx-3{display:grid;grid-template-columns:repeat(3,1fr);margin:14px -16px 0;background:' + C_CARD2 + ';border-top:1px solid ' + C_LINE + '}' +
    '.sx-3>div{padding:12px 14px 13px;border-right:1px solid ' + C_LINE + ';min-width:0}.sx-3>div:last-child{border-right:0}' +
    '.sx-3 span{display:block;' + CAPS + 'font-size:10.5px;letter-spacing:1.2px}.sx-3 b{display:block;font-size:20px;font-weight:800;margin-top:4px;' + NUM + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sx-3 b.g{color:' + C_OK + '}' +
    '.sx-3 small{display:block;font-size:12px;color:' + C_MUT + ';margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.sx-note{display:flex;gap:8px;font-size:13px;line-height:1.4;color:' + C_MUT + ';padding:10px 4px 2px}.sx-note:before{content:"i";flex:none;width:16px;height:16px;border-radius:50%;border:1px solid ' + C_MUT2 + ';color:' + C_MUT + ';font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;margin-top:1px}.sx-note:empty{display:none}' +
    // icon rows
    '.sx-rows{background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:18px;overflow:hidden;margin-top:14px}' +
    '.sx-row{display:flex;align-items:center;gap:14px;width:100%;min-height:56px;padding:12px 16px;background:transparent;border:0;border-top:1px solid ' + C_LINE + ';color:' + C_TXT + ';font:16px ' + FONT + ';text-align:left}.sx-row:first-child{border-top:0}.sx-row:active{background:' + C_CARD2 + '}' +
    '.sx-row .ic{flex:none;color:' + C_MUT + ';display:flex}.sx-row .k{flex:1;min-width:0}.sx-row .v{font-weight:700;' + NUM + 'white-space:nowrap}' +
    '.sx-row .chev{flex:none;width:9px;height:9px;border-right:2px solid ' + C_MUT2 + ';border-bottom:2px solid ' + C_MUT2 + ';transform:rotate(-45deg);margin:0 3px 0 2px}' +
    // stats tiles
    '.sx-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:14px}' +
    '.sx-stats>div{background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:14px;padding:12px 4px;text-align:center}' +
    '.sx-stats b{display:block;font-size:20px;font-weight:800;' + NUM + '}.sx-stats b.g{color:' + C_OK + '}.sx-stats b.r{color:' + C_RED + '}.sx-stats span{display:block;' + CAPS + 'font-size:9.5px;letter-spacing:1px;margin-top:2px}' +
    // generic cards
    '.fs-card,.fs-sect,.fs-safe,.fs-dc{background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:18px;margin-bottom:12px}' +
    '.fs-card{overflow:hidden}.fs-ch{' + CAPS + 'padding:14px 16px 0}' +
    '.fs-cols{display:grid;grid-template-columns:1fr 1fr 1fr}.fs-cols .c{padding:6px 16px 14px;border-right:1px solid ' + C_LINE + '}.fs-cols .c:last-child{border-right:0}' +
    '.fs-cols .l{' + CAPS + 'font-size:10.5px}.fs-cols .v{font-size:22px;font-weight:800;margin-top:3px;' + NUM + '}.fs-cols .v.c{color:' + C_CYAN + '}.fs-cols .v.g{color:' + C_OK + '}.fs-cols .v.r{color:' + C_ORANGE + '}' +
    '.fs-cols.c4{grid-template-columns:repeat(4,1fr)}.fs-cols.c4 .c{padding:6px 12px 14px}' +
    // controls
    '.fs-sw{width:51px;height:31px;flex:none;border-radius:999px;background:' + C_CARD3 + ';position:relative;transition:background .2s}.fs-sw.on{background:' + C_CYAN + '}' +
    '.fs-sw:after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.3);transition:transform .2s}.fs-sw.on:after{transform:translateX(20px)}' +
    '.fs-segw{display:flex;gap:2px;padding:3px;background:#10141e;border:1px solid ' + C_LINE + ';border-radius:12px}' +
    '.fs-sg{flex:1;background:transparent;color:' + C_MUT + ';border:0;border-radius:9px;padding:8px 8px;font-size:14px;font-weight:600;white-space:nowrap}.fs-sg.on{background:' + C_CARD3 + ';color:' + C_TXT + '}' +
    '.fs-range{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:999px;background:' + C_CARD3 + ';outline:none;margin:10px 0 2px}' +
    '.fs-range::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35)}' +
    '.fs-num{width:120px;flex:none;background:#10141e;border:1px solid ' + C_LINE + ';color:' + C_TXT + ';border-radius:10px;padding:9px 11px;font:700 16px ' + FONT + ';text-align:right;' + NUM + 'outline:none}.fs-num:focus{border-color:' + C_CYAN + '}' +
    // buttons
    '.fs-btn{position:relative;width:100%;border:0;border-radius:16px;padding:15px 16px;font-size:18px;font-weight:700;transition:opacity .15s;margin-top:16px}.fs-btn:active{opacity:.75}' +
    '.fs-go{background:' + C_CYAN + ';color:#fff;text-shadow:0 1px 1px rgba(0,60,90,.25)}.fs-stop{background:' + C_RED + ';color:#fff}' +
    '.fs-btn .sub{display:block;font-size:13px;font-weight:500;opacity:.9;margin-top:1px}' +
    '.fs-more{width:100%;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';color:' + C_CYAN + ';border-radius:14px;padding:13px;font-size:15px;font-weight:600;margin-top:10px}.fs-more:active{opacity:.7}' +
    '.fs-mini{display:flex;gap:8px;margin-top:6px}.fs-mini button{flex:1;background:' + C_CARD2 + ';color:' + C_TXT + ';border:1px solid ' + C_LINE + ';border-radius:12px;padding:11px;font-size:13px;font-weight:600}' +
    '#fs-block{color:' + C_ORANGE + ';font-size:13px;margin:0 2px 10px}#fs-block:empty{display:none}' +
    '#fs-status{font-size:13px;color:' + C_MUT + ';margin:14px 2px 0;text-align:center}' +
    '#fs-log{margin:8px 0 0;max-height:90px;overflow:auto;white-space:pre-wrap;color:' + C_MUT2 + ';font-size:11px;line-height:1.5}#fs-log:empty{display:none}' +
    '#fs-act{font-size:13px;color:' + C_MUT + ';text-align:center;margin:10px 2px 0}#fs-act:empty{display:none}' +
    // list rows (saved searches, trades, market, sessions, bulk groups)
    '.fs-item,.fs-trade,.fs-mrow,.fs-sale,.fs-bkg{display:flex;align-items:center;gap:12px;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:16px;padding:13px 16px;margin:0 0 8px;color:' + C_TXT + '}' +
    '.fs-item{justify-content:space-between}.fs-item .nm,.fs-sale .nm{font-weight:600;font-size:15px}.fs-item .de,.fs-sale .de{font-size:12.5px;color:' + C_MUT + ';margin-top:1px}' +
    '.fs-item .act{display:flex;gap:8px}.fs-item .act button{border:0;border-radius:10px;padding:7px 14px;font-size:13px;font-weight:700}' +
    '.fs-load{background:' + C_CYAN + ';color:#fff}.fs-del{background:' + C_CARD3 + ';color:' + C_MUT + '}' +
    '.fs-empty{text-align:center;color:' + C_MUT + ';font-size:14px;padding:28px 12px;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:16px;margin-bottom:12px}' +
    '.fs-bar{height:4px;border-radius:999px;background:' + C_CARD3 + ';overflow:hidden;margin-top:7px}.fs-bar i{display:block;height:100%;border-radius:999px}' +
    '.fs-sale{justify-content:space-between}' +
    // settings rows
    '.fs-sect{padding:2px 16px}' +
    '.fs-set{padding:13px 0;border-top:1px solid ' + C_LINE + '}.fs-sect>.fs-set:first-child{border-top:0}' +
    '.fs-set .top{display:flex;align-items:center;justify-content:space-between;gap:12px}.fs-set .nm{font-size:16px;font-weight:600;color:' + C_TXT + '}' +
    '.fs-set>.fs-segw{margin-top:9px}.fs-set .sv{color:' + C_CYAN + ';font-weight:700;white-space:nowrap;' + NUM + '}' +
    '.ds{font-size:13px;line-height:1.4;color:' + C_MUT + ';margin-top:5px}' +
    '#fs-keep .fs-set:first-child{border-top:1px solid ' + C_LINE + '}' +
    '.fs-det{margin-bottom:10px;border-radius:16px;background:' + C_CARD + ';border:1px solid ' + C_LINE + '}' +
    '.fs-det>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;min-height:54px;padding:12px 16px;font-size:16px;color:' + C_TXT + '}' +
    '.fs-det>summary::-webkit-details-marker{display:none}.fs-det>summary>span{flex:1}.fs-det>summary small{font-size:14px;font-weight:700;color:' + C_TXT + '}' +
    '.fs-det>summary::after{content:"";width:9px;height:9px;border-right:2px solid ' + C_MUT2 + ';border-bottom:2px solid ' + C_MUT2 + ';transform:rotate(45deg);margin:-4px 3px 0 4px;transition:transform .2s}' +
    '.fs-det[open]>summary::after{transform:rotate(-135deg);margin-top:4px}' +
    '.fs-det>.in{padding:0 16px 8px;border-top:1px solid ' + C_LINE + '}.fs-det>.in>.fs-set:first-child{border-top:0}' +
    '.fs-det>.in>.fs-item{margin:8px 0 0;background:' + C_CARD2 + '}.fs-det>.in>.fs-empty{background:transparent;border:0;padding:16px 0}' +
    // market
    '.fs-mkt{position:relative;width:220px;max-width:76%;margin:4px auto 4px}.fs-mkt svg{width:100%;display:block}' +
    '.fs-mkt .mv{position:absolute;left:0;right:0;bottom:2px;text-align:center}.fs-mkt .mv b{display:block;font-size:42px;font-weight:800;line-height:1;letter-spacing:-1px;' + NUM + '}.fs-mkt .mv span{font-size:13px;color:' + C_MUT + '}' +
    '.fs-mrow .nm{flex:1;min-width:0;font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fs-mrow .de{font-size:12px;color:' + C_MUT + ';font-weight:400}' +
    '.fs-mrow .msp{width:60px;height:20px;flex:none}.fs-mrow .pr{text-align:right;flex:none}.fs-mrow .pr b{display:block;font-size:15px;font-weight:700;' + NUM + '}.fs-mrow .pr span{font-size:12px;color:' + C_MUT + '}' +
    '.fs-mrow .pr .up{color:' + C_OK + '}.fs-mrow .pr .down{color:' + C_RED + '}' +
    // hub
    '.fs-dash{display:grid;grid-template-columns:1.3fr 1fr;gap:10px;margin-bottom:0}' +
    '.fs-dc{position:relative;overflow:hidden;padding:15px 16px 12px;min-height:150px}' +
    '.fs-dc .dh{' + CAPS + '}.fs-dc .di{display:none}' +
    '.fs-dc .dv{font-size:32px;font-weight:800;letter-spacing:-.6px;margin:8px 0 4px;' + NUM + '}' +
    '.fs-dc .dsub{font-size:13px;color:' + C_MUT + ';margin-top:3px;position:relative;z-index:1}.fs-dc .dsub b{color:' + C_CYAN + ';font-weight:700}.fs-dc .dsub.up{color:' + C_OK + '}.fs-dc .dsub.down{color:' + C_RED + '}' +
    '.fs-dc .spark{position:absolute;left:0;right:0;bottom:0;width:100%;height:44px}' +
    '.fs-dc .dpair{display:flex;gap:12px;margin:10px 0 8px}.fs-dc .dpair div{flex:1}.fs-dc .dpair b{display:block;font-size:26px;font-weight:800;' + NUM + '}.fs-dc .dpair span{' + CAPS + 'font-size:9.5px;letter-spacing:.5px}' +
    '.fs-dc.ac .dsub b{color:' + C_TXT + '}' +
    '.fs-safe{display:flex;align-items:center;gap:13px;padding:13px 16px}' +
    '.fs-safe .ico{flex:none;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;color:#fff;background:' + C_OK + '}' +
    '.fs-safe.warn .ico{background:' + C_ORANGE + '}.fs-safe.stop .ico{background:' + C_RED + '}' +
    '.fs-safe .tx{flex:1;min-width:0}.fs-safe .k{' + CAPS + 'font-size:10.5px}.fs-safe .t{font-size:17px;font-weight:700}.fs-safe .h{font-size:12px;color:' + C_MUT + '}' +
    '.fs-safe .chip{flex:none;font-size:13px;font-weight:700;color:' + C_OK + ';background:rgba(74,222,128,.12);border-radius:999px;padding:6px 11px}' +
    '.fs-safe.warn .chip{color:' + C_ORANGE + ';background:rgba(251,146,60,.13)}.fs-safe.stop .chip{color:' + C_RED + ';background:rgba(248,113,113,.13)}' +
    '.fs-tradebar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0 10px}.fs-tradebar .fs-segw{flex:1;max-width:270px}' +
    '.fs-upd{background:transparent;border:1px solid ' + C_LINE + ';color:' + C_MUT + ';border-radius:12px;padding:8px 11px;font-size:13px}.fs-upd b{color:' + C_TXT + ';font-weight:600}' +
    '.fs-trade .av{flex:none;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;color:#3b2f0e;background:radial-gradient(circle at 35% 30%,#fff1b8,' + C_GOLD + ' 60%,#a8862a)}' +
    '.fs-trade .nm{flex:1;min-width:0;font-weight:600;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fs-trade .nm span{color:' + C_MUT + ';font-weight:500}' +
    '.fs-trade .nm i{font-style:normal;font-size:11px;color:' + C_MUT + ';border:1px solid ' + C_LINE + ';border-radius:6px;padding:0 5px;margin-left:4px}.fs-trade .de{font-size:12px;color:' + C_MUT + '}' +
    '.fs-trade .pf{font-weight:800;font-size:15px;' + NUM + 'color:' + C_MUT + '}.fs-trade .pf.open{color:' + C_CYAN + '}.fs-trade .pf.pos{color:' + C_OK + '}.fs-trade .pf.neg{color:' + C_RED + '}' +
    '.fs-trade .stt{flex:none;font-size:12.5px;font-weight:700;border-radius:999px;padding:5px 10px}.fs-trade .stt:before{content:"✓ "}' +
    '.fs-trade .stt.b{color:' + C_CYAN + ';background:' + C_CYAN_BG + '}.fs-trade .stt.s{color:' + C_OK + ';background:rgba(74,222,128,.13)}' +
    '#fs-h-trades>.fs-more{margin:0 0 12px}' +
    '.fs-hubbtns{display:flex;flex-direction:column;gap:8px;margin:4px 0 12px}' +
    '.fs-hb{display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:16px;padding:14px 16px;color:' + C_TXT + '}.fs-hb:active{background:' + C_CARD2 + '}' +
    '.fs-hb .ic{flex:none;width:44px;height:44px;border-radius:12px;background:' + C_CYAN_BG + ';color:' + C_CYAN + ';display:flex;align-items:center;justify-content:center}' +
    '.fs-hb .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}.fs-hb b{font-size:16px;font-weight:700}.fs-hb .tx span{font-size:13px;color:' + C_MUT + '}' +
    '.fs-hb .chev{flex:none;width:30px;height:30px;border-radius:50%;background:' + C_CARD3 + ';position:relative}.fs-hb .chev:after{content:"";position:absolute;left:9px;top:10px;width:8px;height:8px;border-right:2px solid ' + C_TXT + ';border-bottom:2px solid ' + C_TXT + ';transform:rotate(-45deg)}' +
    // bulk list
    '.fs-bk-head{display:flex;align-items:center;gap:6px;margin:0 0 12px}.fs-bk-head b{font-size:18px;font-weight:700;flex:1;text-align:center;margin-right:64px}' +
    '.fs-bk-back{border:0;background:transparent;color:' + C_CYAN + ';padding:6px 0;font-size:17px;width:64px;text-align:left}' +
    '.fs-bk-card{padding:8px 16px 8px;border-radius:18px}' +
    '.fs-bkg{width:100%;text-align:left;justify-content:space-between}' +
    '.fs-bkg .nm{font-weight:600;font-size:16px}.fs-bkg i,.fs-bk-sel i{font-style:normal;color:' + C_MUT + ';font-weight:500}.fs-bkg .ct{font-size:13px;color:' + C_MUT + '}.fs-bkg .ct b{font-size:16px;color:' + C_TXT + ';font-weight:800}' +
    '.fs-bk-sel{font-weight:800;font-size:22px;display:flex;align-items:baseline;gap:8px;padding:8px 0 8px}.fs-bk-sel span{margin-left:auto;font-size:13px;color:' + C_MUT + ';font-weight:500}' +
    '.fs-bk-err{color:' + C_RED + ';font-size:13px;padding:8px 0 4px}' +
    // floating button
    '#fs-fab{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:56px;height:56px;border-radius:50%;background:' + C_CYAN + ';color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 22px rgba(0,0,0,.4);touch-action:none;user-select:none;-webkit-user-select:none}' +
    '#fs-fab svg{width:24px;height:24px}#fs-fab.glide{transition:left .45s cubic-bezier(.22,1,.36,1),top .45s cubic-bezier(.22,1,.36,1)}#fs-fab.drag{transform:scale(1.08)}' +
    '#fs-fab .dot{position:absolute;top:3px;right:3px;width:13px;height:13px;border-radius:50%;background:' + C_OK + ';border:2px solid ' + C_BG + ';display:none}#fs-fab.run .dot{display:block}' +
    // price tag on cards
    '.fs-badge{position:absolute;left:0;top:0;z-index:6;padding:1px 8px;border-radius:999px;background:rgba(18,23,34,.94);border:1px solid rgba(90,200,245,.5);color:#fff;font:700 11px/1.5 ' + FONT + ';' + NUM + 'white-space:nowrap;pointer-events:none}' +
    // running screen
    '#fs-lock{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:max(20px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom));background:rgba(18,23,34,.97);color:' + C_TXT + ';font:15px/1.4 ' + FONT + ';text-align:center;-webkit-font-smoothing:antialiased}' +
    '#fs-lock.show{display:flex}' +
    '#fs-lock .lspin{width:40px;height:40px;border-radius:50%;border:3px solid ' + C_CARD3 + ';border-top-color:' + C_CYAN + ';animation:fsspin .9s linear infinite}@keyframes fsspin{to{transform:rotate(360deg)}}' +
    '#fs-lock .lbig{font-size:28px;font-weight:800;font-style:italic;letter-spacing:-.4px}' +
    '#fs-lock .lstat{font-size:15px;color:' + C_CYAN + ';font-weight:600;min-height:20px;max-width:360px}' +
    '#fs-lock .lrow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%;max-width:420px}' +
    '#fs-lock .lrow div{background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:14px;padding:10px 4px;' + CAPS + 'font-size:9.5px;letter-spacing:1px}' +
    '#fs-lock .lrow b{display:block;font-size:19px;font-weight:800;color:' + C_TXT + ';' + NUM + 'margin-top:3px;letter-spacing:0}#fs-lock .lrow .pf b{color:' + C_OK + '}' +
    '#fs-lock .lsub{font-size:13px;color:' + C_MUT + ';max-width:380px}' +
    '#fs-lock .lbtns{display:flex;gap:10px;width:100%;max-width:420px;margin-top:4px}#fs-lock .lbtns button{flex:1;border:0;border-radius:16px;padding:15px;font-size:17px;font-weight:700}' +
    '#fs-lstop{background:' + C_RED + ';color:#fff}#fs-lhide{background:' + C_CARD2 + ';color:' + C_TXT + ';border:1px solid ' + C_LINE + '!important}' +
    // live feed
    '.fs-feed{width:100%;max-width:420px;display:flex;flex-direction:column;gap:6px;max-height:34vh;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;text-align:left}' +
    '.fs-feed:empty{display:none}#fs-body .fs-feed{max-width:none;max-height:260px;margin:14px 0 0}' +
    '.fs-fl{flex:none;display:flex;align-items:center;gap:10px;padding:10px 14px;background:' + C_CARD + ';border:1px solid ' + C_LINE + ';border-radius:12px;color:' + C_TXT + ';font-size:13.5px;line-height:1.3}' +
    '.fs-fl .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-fl .tm{color:' + C_MUT2 + ';font-size:12px;' + NUM + '}' +
    '.fs-fl:before{content:"";width:7px;height:7px;border-radius:50%;background:' + C_CARD3 + ';flex:none}' +
    '.fs-fl.check:before{background:' + C_ORANGE + '}.fs-fl.price:before,.fs-fl.list:before{background:' + C_CYAN + '}.fs-fl.stop:before{background:' + C_RED + '}' +
    '.fs-fl.hit{font-weight:700;border-color:rgba(74,222,128,.45);background:rgba(74,222,128,.08)}.fs-fl.hit:before{background:' + C_OK + '}.fs-fl.hit .tx{color:' + C_OK + '}' +
    // purchase banner
    '#fs-toast{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));z-index:2147483647;width:min(92vw,420px);transform:translate(-50%,-140%);transition:transform .45s cubic-bezier(.2,.9,.25,1);display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:rgba(26,32,48,.97);border:1px solid rgba(74,222,128,.35);box-shadow:0 12px 30px rgba(0,0,0,.45);color:#fff;font:15px/1.3 ' + FONT + ';pointer-events:none}' +
    '#fs-toast.in{transform:translate(-50%,0)}#fs-toast .ic{flex:none;width:36px;height:36px;border-radius:50%;background:' + C_OK + ';color:#0b2a16;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px}' +
    '#fs-toast .tx{min-width:0}#fs-toast b{display:block;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#fs-toast span{font-size:13px;color:' + C_MUT + ';' + NUM + '}';
