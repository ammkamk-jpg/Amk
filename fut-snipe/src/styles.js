  // ---------- styles ----------
  // iOS dark look: black background, grouped grey cards, system blue for actions, green/red for
  // money only. No gradients, no glow, one font (the system font).
  var C_BG = '#000', C_CARD = '#1c1c1e', C_CARD2 = '#2c2c2e', C_CARD3 = '#3a3a3c', C_LINE = 'rgba(84,84,88,.55)';
  var C_TXT = '#fff', C_MUT = 'rgba(235,235,245,.6)', C_MUT2 = 'rgba(235,235,245,.3)';
  var C_BLUE = '#0a84ff', C_OK = '#30d158', C_RED = '#ff453a', C_ORANGE = '#ff9f0a', C_YELLOW = '#ffd60a';
  var FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",system-ui,"Helvetica Neue",sans-serif';
  var NUM = 'font-variant-numeric:tabular-nums;';
  var CSS =
    '#fs-panel *,#fs-fab,#fs-fab *,#fs-lock *,#fs-toast *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}' +
    '#fs-panel button,#fs-lock button{font-family:' + FONT + ';cursor:pointer}' +
    // panel
    '#fs-panel{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;font:15px/1.4 ' + FONT + ';color:' + C_TXT + ';background:' + C_BG + ';-webkit-font-smoothing:antialiased}' +
    '#fs-panel.open{display:flex;animation:fsfade .2s ease-out}@keyframes fsfade{from{opacity:0}to{opacity:1}}' +
    '#fs-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px 8px;padding-top:max(12px,env(safe-area-inset-top))}' +
    '#fs-head .t{font-weight:700;font-size:28px;letter-spacing:-.4px}#fs-head .v{font-size:12px;color:' + C_MUT2 + ';margin-left:8px;font-weight:500}' +
    '#fs-head .coins{font-size:15px;font-weight:400;color:' + C_MUT + ';' + NUM + '}#fs-head .coins:after{content:" coins"}' +
    '#fs-min{background:' + C_CARD2 + ';color:' + C_MUT + ';border:0;border-radius:50%;width:30px;height:30px;font-size:13px;font-weight:700;margin-left:8px}' +
    '#fs-body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch;padding:12px 16px;padding-bottom:max(28px,env(safe-area-inset-bottom));width:100%;max-width:560px;margin:0 auto;overflow-x:hidden}' +
    // tabs: one segmented control
    '#fs-tiles{display:flex;gap:2px;margin:2px 16px 4px;padding:2px;background:' + C_CARD + ';border-radius:9px;max-width:528px;align-self:center;width:calc(100% - 32px)}' +
    '.fs-tile{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:7px 4px;border-radius:7px;color:' + C_TXT + ';font-size:13px;font-weight:500;transition:background .15s}' +
    '.fs-tile.on{background:' + C_CARD3 + ';font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.4)}' +
    '.fs-tile .ti{width:7px;height:7px;border-radius:50%;display:none}.fs-tile .ti.live{display:block;background:' + C_OK + '}' +
    // iOS grouped list (Settings app style)
    '.ios-h{font-size:13px;line-height:1.3;color:' + C_MUT + ';text-transform:uppercase;padding:22px 16px 7px}.ios-h:empty{padding:8px 0 0}#fs-body>.ios-h:first-child,#fs-block+.ios-h{padding-top:10px}' +
    '.ios-group{background:' + C_CARD + ';border-radius:10px;overflow:hidden}' +
    '.ios-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:44px;padding:11px 16px;position:relative;background:transparent;border:0;color:' + C_TXT + ';font:17px/1.3 ' + FONT + ';text-align:left}' +
    '.ios-row+.ios-row:before{content:"";position:absolute;left:16px;right:0;top:0;border-top:.5px solid ' + C_LINE + '}' +
    '.ios-row .k{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ios-row .k.muted{color:' + C_MUT + '}' +
    '.ios-row .v{flex:none;color:' + C_MUT + ';' + NUM + 'text-align:right}.ios-row .v.strong{color:' + C_TXT + ';font-weight:600}' +
    '.ios-row .v.g,.ios-row .v .g{color:' + C_OK + '}.ios-row .v.r,.ios-row .v .r{color:' + C_RED + '}' +
    '.ios-row.big .k{font-size:20px;font-weight:600;letter-spacing:-.3px}.ios-row.big .k.muted{font-size:17px;font-weight:400}' +
    '.ios-row.link{cursor:pointer}.ios-row.link:active{background:' + C_CARD2 + '}.ios-row .v i{font-style:normal;color:' + C_MUT2 + ';font-size:20px;margin-left:8px;vertical-align:-1px}' +
    '.ios-f{font-size:13px;line-height:1.35;color:' + C_MUT + ';padding:7px 16px 0}.ios-f:empty{display:none}' +
    '#fs-start{margin-top:22px}' +
    // grouped cards
    '.fs-card,.fs-target,.fs-sect,.fs-safe,.fs-dc{background:' + C_CARD + ';border-radius:12px;margin-bottom:12px}' +
    '.fs-card{overflow:hidden}.fs-ch{font-size:13px;color:' + C_MUT + ';padding:12px 16px 0}' +
    '.fs-cols{display:grid;grid-template-columns:1fr 1fr 1fr}' +
    '.fs-cols .c{padding:6px 16px 12px;border-right:.5px solid ' + C_LINE + '}.fs-cols .c:last-child{border-right:0}' +
    '.fs-cols .l{font-size:12px;color:' + C_MUT + '}' +
    '.fs-cols .v{font-size:20px;font-weight:600;margin-top:2px;' + NUM + '}.fs-cols .v.c{color:' + C_BLUE + '}.fs-cols .v.g{color:' + C_OK + '}.fs-cols .v.r{color:' + C_ORANGE + '}' +
    '.fs-cols.c4{grid-template-columns:repeat(4,1fr)}.fs-cols.c4 .c{padding:6px 12px 12px}' +
    // controls
    '.fs-sw{width:51px;height:31px;flex:none;border-radius:999px;background:' + C_CARD3 + ';position:relative;transition:background .2s}.fs-sw.on{background:' + C_OK + '}' +
    '.fs-sw:after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,.3);transition:transform .2s}.fs-sw.on:after{transform:translateX(20px)}' +
    '.fs-segw{display:flex;gap:2px;padding:2px;background:' + C_CARD2 + ';border-radius:9px}' +
    '.fs-sg{flex:1;background:transparent;color:' + C_TXT + ';border:0;border-radius:7px;padding:6px 8px;font-size:13px;font-weight:500;white-space:nowrap}.fs-sg.on{background:' + C_CARD3 + ';font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.4)}' +
    '.fs-range{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:999px;background:' + C_CARD3 + ';outline:none;margin:10px 0 2px}' +
    '.fs-range::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35)}' +
    '.fs-num{width:116px;flex:none;background:' + C_CARD2 + ';border:0;color:' + C_TXT + ';border-radius:8px;padding:8px 10px;font:500 16px ' + FONT + ';text-align:right;' + NUM + 'outline:none}.fs-num:focus{box-shadow:0 0 0 2px ' + C_BLUE + '}' +
    // buttons
    '.fs-btn{position:relative;width:100%;border:0;border-radius:12px;padding:14px 16px;font-size:17px;font-weight:600;transition:opacity .15s}.fs-btn:active{opacity:.7}' +
    '.fs-go{background:' + C_BLUE + ';color:#fff}.fs-stop{background:' + C_RED + ';color:#fff}' +
    '.fs-btn .sub{display:block;font-size:12px;font-weight:400;opacity:.8;margin-top:2px}' +
    '.fs-more{width:100%;background:' + C_CARD + ';border:0;color:' + C_BLUE + ';border-radius:12px;padding:13px;font-size:15px;font-weight:500;margin-top:10px}.fs-more:active{opacity:.6}' +
    '.fs-mini{display:flex;gap:8px;margin-top:6px}.fs-mini button{flex:1;background:' + C_CARD2 + ';color:' + C_BLUE + ';border:0;border-radius:10px;padding:10px;font-size:13px;font-weight:500}' +
    '#fs-block{color:' + C_ORANGE + ';font-size:13px;margin:0 2px 10px}#fs-block:empty{display:none}' +
    '#fs-status{font-size:13px;color:' + C_MUT + ';margin:12px 2px 0;text-align:center}' +
    '#fs-log{margin:8px 0 0;max-height:90px;overflow:auto;white-space:pre-wrap;color:' + C_MUT2 + ';font-size:11px;line-height:1.5}#fs-log:empty{display:none}' +
    '#fs-act{font-size:13px;color:' + C_MUT + ';text-align:center;margin:10px 2px 0}#fs-act:empty{display:none}' +
    // list rows (saved searches, trades, market, sessions, bulk groups)
    '.fs-item,.fs-trade,.fs-mrow,.fs-sale,.fs-bkg{display:flex;align-items:center;gap:12px;background:' + C_CARD + ';border:0;border-radius:0;padding:11px 16px;margin:0;position:relative}' +
    '.fs-item:after,.fs-trade:after,.fs-mrow:after,.fs-sale:after,.fs-bkg:after{content:"";position:absolute;left:16px;right:0;bottom:0;border-bottom:.5px solid ' + C_LINE + '}' +
    '.fs-item:first-child,.fs-trade:first-child,.fs-mrow:first-child,.fs-sale:first-child,.fs-bkg:first-of-type{border-top-left-radius:12px;border-top-right-radius:12px}' +
    '.fs-item:last-child,.fs-trade:last-of-type,.fs-mrow:last-child,.fs-sale:last-child,.fs-bkg:last-of-type{border-bottom-left-radius:12px;border-bottom-right-radius:12px;margin-bottom:12px}' +
    '.fs-item:last-child:after,.fs-trade:last-of-type:after,.fs-mrow:last-child:after,.fs-sale:last-child:after,.fs-bkg:last-of-type:after{display:none}' +
    '.fs-item{justify-content:space-between}.fs-item .nm,.fs-sale .nm{font-weight:500;font-size:15px}.fs-item .de,.fs-sale .de{font-size:12px;color:' + C_MUT + ';margin-top:1px}' +
    '.fs-item .act{display:flex;gap:8px}.fs-item .act button{border:0;border-radius:999px;padding:6px 14px;font-size:13px;font-weight:600}' +
    '.fs-load{background:' + C_BLUE + ';color:#fff}.fs-del{background:' + C_CARD2 + ';color:' + C_MUT + '}' +
    '.fs-empty{text-align:center;color:' + C_MUT + ';font-size:14px;padding:28px 12px;background:' + C_CARD + ';border-radius:12px;margin-bottom:12px}' +
    '.fs-bar{height:4px;border-radius:999px;background:' + C_CARD3 + ';overflow:hidden;margin-top:6px}.fs-bar i{display:block;height:100%;border-radius:999px}' +
    '.fs-sale{justify-content:space-between}' +
    // section headers + settings rows (iOS grouped list)
    '.fs-sect{padding:0 16px}.fs-sect>.fs-set:first-child{border-top:0}.fs-sect-h{font-size:13px;color:' + C_MUT + ';text-transform:uppercase;letter-spacing:.2px;padding:18px 16px 7px;font-weight:400}' +
    '.fs-sect>.fs-sect-h{padding:12px 0 6px;margin:0}' +
    '.fs-set{padding:11px 0;border-top:.5px solid ' + C_LINE + '}.fs-sect>.fs-sect-h+.fs-set,.fs-sect>.fs-sect-h+div>.fs-set:first-child{border-top:0}' +
    '.fs-set .top{display:flex;align-items:center;justify-content:space-between;gap:12px}.fs-set .nm{font-size:15px;font-weight:400;color:' + C_TXT + '}' +
    '.fs-set>.fs-segw{margin-top:8px}.fs-set .sv{color:' + C_MUT + ';white-space:nowrap;' + NUM + '}' +
    '.ds{font-size:12.5px;line-height:1.4;color:' + C_MUT + ';margin-top:4px}' +
    '#fs-keep .fs-set:first-child{border-top:.5px solid ' + C_LINE + '}' +
    '.fs-det{margin-bottom:12px;border-radius:12px;background:' + C_CARD + '}' +
    '.fs-det>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:13px 16px;font-size:15px;color:' + C_TXT + '}' +
    '.fs-det>summary::-webkit-details-marker{display:none}.fs-det>summary>span{flex:1}.fs-det>summary small{font-size:15px;color:' + C_MUT + '}' +
    '.fs-det>summary::after{content:"";width:8px;height:8px;border-right:2px solid ' + C_MUT2 + ';border-bottom:2px solid ' + C_MUT2 + ';transform:rotate(-45deg);margin:0 2px 0 4px;transition:transform .2s}' +
    '.fs-det[open]>summary::after{transform:rotate(45deg)}' +
    '.fs-det>.in{padding:0 16px 6px;border-top:.5px solid ' + C_LINE + '}.fs-det>.in>.fs-set:first-child{border-top:0}' +
    '.fs-det>.in>.fs-item,.fs-det>.in>.fs-sale{margin-left:-16px;margin-right:-16px}.fs-det>.in>.fs-empty{background:transparent;padding:16px 0}' +
    // sniper view
    '.fs-target{padding:14px 16px 12px}' +
    '.fs-target .tt-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px}' +
    '.fs-target .k{font-size:12px;color:' + C_MUT + '}.fs-target .nm{font-size:22px;font-weight:700;letter-spacing:-.3px}' +
    '.fs-target .mode{flex:none;font-size:12px;font-weight:500;color:' + C_MUT + ';background:' + C_CARD2 + ';border-radius:999px;padding:4px 10px}' +
    '.fs-target .fs-cols .c{padding:4px 10px 2px}.fs-target .fs-cols .c:first-child{padding-left:0}.fs-target .sub{font-size:12.5px;color:' + C_MUT + ';margin-top:8px}' +
    '.fs-sell{display:flex;align-items:center;gap:8px;width:100%;margin-top:10px;background:' + C_CARD2 + ';border:0;border-radius:10px;padding:10px 12px;color:' + C_TXT + ';font:400 14px ' + FONT + ';text-align:left}' +
    '.fs-sell b{font-weight:600;' + NUM + '}.fs-sell i{font-style:normal;font-size:12px;color:' + C_MUT + '}.fs-sell span{margin-left:auto;color:' + C_BLUE + ';font-size:14px}' +
    '.fs-run{display:grid;grid-template-columns:repeat(4,1fr);margin-top:12px;background:' + C_CARD + ';border-radius:12px}' +
    '.fs-run div{padding:10px 4px;text-align:center;border-right:.5px solid ' + C_LINE + '}.fs-run div:last-child{border-right:0}' +
    '.fs-run span{display:block;font-size:11px;color:' + C_MUT + '}.fs-run b{font-size:17px;font-weight:600;' + NUM + '}.fs-run b.g{color:' + C_OK + '}.fs-run b.r{color:' + C_RED + '}' +
    // market view
    '.fs-mkt{position:relative;width:220px;max-width:76%;margin:4px auto 4px}.fs-mkt svg{width:100%;display:block}' +
    '.fs-mkt .mv{position:absolute;left:0;right:0;bottom:2px;text-align:center}.fs-mkt .mv b{display:block;font-size:40px;font-weight:700;line-height:1;letter-spacing:-1px;' + NUM + '}.fs-mkt .mv span{font-size:13px;color:' + C_MUT + '}' +
    '.fs-mrow .nm{flex:1;min-width:0;font-weight:500;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fs-mrow .de{font-size:12px;color:' + C_MUT + ';font-weight:400}' +
    '.fs-mrow .msp{width:60px;height:20px;flex:none}.fs-mrow .pr{text-align:right;flex:none}.fs-mrow .pr b{display:block;font-size:15px;font-weight:600;' + NUM + '}.fs-mrow .pr span{font-size:12px;color:' + C_MUT + '}' +
    '.fs-mrow .pr .up{color:' + C_OK + '}.fs-mrow .pr .down{color:' + C_RED + '}' +
    // hub
    '.fs-dash{display:grid;grid-template-columns:1.25fr 1fr;gap:12px;margin-bottom:0}' +
    '.fs-dc{position:relative;overflow:hidden;padding:14px 16px 12px;min-height:140px}' +
    '.fs-dc .dh{font-size:13px;color:' + C_MUT + '}.fs-dc .di{display:none}' +
    '.fs-dc .dv{font-size:30px;font-weight:700;letter-spacing:-.6px;margin:6px 0 2px;' + NUM + '}' +
    '.fs-dc .dsub{font-size:12.5px;color:' + C_MUT + ';margin-top:2px;position:relative;z-index:1}.fs-dc .dsub b{color:' + C_TXT + ';font-weight:600}.fs-dc .dsub.up{color:' + C_OK + '}.fs-dc .dsub.down{color:' + C_RED + '}' +
    '.fs-dc .spark{position:absolute;left:0;right:0;bottom:0;width:100%;height:40px}' +
    '.fs-dc .dpair{display:flex;gap:12px;margin:8px 0 6px}.fs-dc .dpair div{flex:1}.fs-dc .dpair b{display:block;font-size:24px;font-weight:700;' + NUM + '}.fs-dc .dpair span{font-size:12px;color:' + C_MUT + '}' +
    '.fs-safe{display:flex;align-items:center;gap:12px;padding:12px 16px}' +
    '.fs-safe .ico{flex:none;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;color:#fff;background:' + C_OK + '}' +
    '.fs-safe.warn .ico{background:' + C_ORANGE + '}.fs-safe.stop .ico{background:' + C_RED + '}' +
    '.fs-safe .tx{flex:1;min-width:0}.fs-safe .k{font-size:12px;color:' + C_MUT + '}.fs-safe .t{font-size:15px;font-weight:600}.fs-safe .h{font-size:12px;color:' + C_MUT + '}' +
    '.fs-safe .chip{flex:none;font-size:13px;color:' + C_MUT + ';' + NUM + '}' +
    '.fs-tradebar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:4px 0 10px}.fs-tradebar .fs-segw{flex:1;max-width:260px}' +
    '.fs-upd{background:transparent;border:0;color:' + C_MUT + ';padding:6px 2px;font-size:13px}.fs-upd b{color:' + C_BLUE + ';font-weight:500}' +
    '.fs-trade .av{flex:none;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;color:' + C_TXT + ';background:' + C_CARD3 + '}' +
    '.fs-trade .nm{flex:1;min-width:0;font-weight:500;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fs-trade .nm span{color:' + C_MUT + ';font-weight:400}' +
    '.fs-trade .nm i{font-style:normal;font-size:11px;color:' + C_MUT + ';border:.5px solid ' + C_LINE + ';border-radius:4px;padding:0 4px;margin-left:4px}.fs-trade .de{font-size:12px;color:' + C_MUT + '}' +
    '.fs-trade .pf{font-weight:600;font-size:15px;' + NUM + 'color:' + C_MUT + '}.fs-trade .pf.open{color:' + C_TXT + '}.fs-trade .pf.pos{color:' + C_OK + '}.fs-trade .pf.neg{color:' + C_RED + '}' +
    '.fs-trade .stt{flex:none;font-size:12px;color:' + C_MUT + ';width:46px;text-align:right}' +
    '#fs-h-trades>.fs-more{margin:-4px 0 12px}' +
    '.fs-hubbtns{display:flex;flex-direction:column;margin:0 0 12px;background:' + C_CARD + ';border-radius:12px;overflow:hidden}' +
    '.fs-hb{display:flex;flex-direction:column;align-items:flex-start;gap:1px;width:100%;text-align:left;background:transparent;border:0;border-top:.5px solid ' + C_LINE + ';padding:11px 16px;color:' + C_BLUE + '}.fs-hb:first-child{border-top:0}.fs-hb:active{background:' + C_CARD2 + '}' +
    '.fs-hb b{font-size:15px;font-weight:400}.fs-hb span{font-size:12.5px;color:' + C_MUT + '}' +
    // bulk list
    '.fs-bk-head{display:flex;align-items:center;gap:6px;margin:0 0 12px}.fs-bk-head b{font-size:17px;font-weight:600;flex:1;text-align:center;margin-right:58px}' +
    '.fs-bk-back{border:0;background:transparent;color:' + C_BLUE + ';padding:6px 0;font-size:17px;width:58px;text-align:left}' +
    '.fs-bk-card{padding:6px 16px 6px}' +
    '.fs-bkg{width:100%;text-align:left;color:' + C_TXT + ';justify-content:space-between}' +
    '.fs-bkg .nm{font-weight:500;font-size:15px}.fs-bkg i,.fs-bk-sel i{font-style:normal;color:' + C_MUT + ';font-weight:400}.fs-bkg .ct{font-size:13px;color:' + C_MUT + '}.fs-bkg .ct b{font-size:15px;color:' + C_TXT + ';font-weight:600}' +
    '.fs-bk-sel{font-weight:700;font-size:20px;display:flex;align-items:baseline;gap:8px;padding:8px 0 8px}.fs-bk-sel span{margin-left:auto;font-size:13px;color:' + C_MUT + ';font-weight:400}' +
    '.fs-bk-err{color:' + C_RED + ';font-size:13px;padding:8px 0 4px}' +
    // floating button
    '#fs-fab{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:54px;height:54px;border-radius:50%;background:' + C_CARD2 + ';color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 20px rgba(0,0,0,.45);border:.5px solid rgba(255,255,255,.12);touch-action:none;user-select:none;-webkit-user-select:none}' +
    '#fs-fab svg{width:22px;height:22px}#fs-fab.glide{transition:left .45s cubic-bezier(.22,1,.36,1),top .45s cubic-bezier(.22,1,.36,1)}#fs-fab.drag{transform:scale(1.08)}' +
    '#fs-fab .dot{position:absolute;top:4px;right:4px;width:12px;height:12px;border-radius:50%;background:' + C_OK + ';border:2px solid ' + C_CARD2 + ';display:none}#fs-fab.run .dot{display:block}' +
    // price tag on cards
    '.fs-badge{position:absolute;left:0;top:0;z-index:6;padding:1px 8px;border-radius:999px;background:rgba(28,28,30,.92);color:#fff;font:600 11px/1.5 ' + FONT + ';' + NUM + 'white-space:nowrap;pointer-events:none;box-shadow:0 1px 4px rgba(0,0,0,.4)}' +
    // running screen
    '#fs-lock{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:max(20px,env(safe-area-inset-top)) 16px max(20px,env(safe-area-inset-bottom));background:rgba(0,0,0,.94);color:' + C_TXT + ';font:15px/1.4 ' + FONT + ';text-align:center;-webkit-font-smoothing:antialiased}' +
    '#fs-lock.show{display:flex}' +
    '#fs-lock .lspin{width:34px;height:34px;border-radius:50%;border:3px solid ' + C_CARD3 + ';border-top-color:' + C_TXT + ';animation:fsspin .9s linear infinite}@keyframes fsspin{to{transform:rotate(360deg)}}' +
    '#fs-lock .lbig{font-size:28px;font-weight:700;letter-spacing:-.4px}' +
    '#fs-lock .lstat{font-size:15px;color:' + C_MUT + ';min-height:20px;max-width:360px}' +
    '#fs-lock .lrow{display:grid;grid-template-columns:repeat(4,1fr);width:100%;max-width:400px;background:' + C_CARD + ';border-radius:12px}' +
    '#fs-lock .lrow div{padding:10px 4px;font-size:11px;color:' + C_MUT + ';border-right:.5px solid ' + C_LINE + '}#fs-lock .lrow div:last-child{border-right:0}' +
    '#fs-lock .lrow b{display:block;font-size:18px;font-weight:600;color:' + C_TXT + ';' + NUM + 'margin-top:2px}#fs-lock .lrow .pf b{color:' + C_OK + '}' +
    '#fs-lock .lsub{font-size:12.5px;color:' + C_MUT + ';max-width:360px}' +
    '#fs-lock .lbtns{display:flex;gap:10px;width:100%;max-width:400px;margin-top:4px}#fs-lock .lbtns button{flex:1;border:0;border-radius:12px;padding:14px;font-size:17px;font-weight:600}' +
    '#fs-lstop{background:' + C_RED + ';color:#fff}#fs-lhide{background:' + C_CARD2 + ';color:' + C_TXT + '}' +
    // live feed
    '.fs-feed{width:100%;max-width:400px;display:flex;flex-direction:column;max-height:34vh;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;text-align:left;background:' + C_CARD + ';border-radius:12px}' +
    '.fs-feed:empty{display:none}#fs-body .fs-feed{max-width:none;max-height:260px;margin:12px 0 0}' +
    '.fs-fl{flex:none;display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:.5px solid ' + C_LINE + ';color:' + C_TXT + ';font-size:13px;line-height:1.3}.fs-fl:first-child{border-top:0}' +
    '.fs-fl .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-fl .tm{color:' + C_MUT2 + ';font-size:12px;' + NUM + '}' +
    '.fs-fl:before{content:"";width:6px;height:6px;border-radius:50%;background:' + C_CARD3 + ';flex:none}' +
    '.fs-fl.check:before{background:' + C_ORANGE + '}.fs-fl.price:before,.fs-fl.list:before{background:' + C_BLUE + '}.fs-fl.stop:before{background:' + C_RED + '}' +
    '.fs-fl.hit{font-weight:600}.fs-fl.hit:before{background:' + C_OK + '}.fs-fl.hit .tx{color:' + C_OK + '}' +
    // purchase banner (like an iOS notification)
    '#fs-toast{position:fixed;left:50%;top:max(10px,env(safe-area-inset-top));z-index:2147483647;width:min(92vw,400px);transform:translate(-50%,-140%);transition:transform .45s cubic-bezier(.2,.9,.25,1);display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:rgba(44,44,46,.96);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);box-shadow:0 10px 30px rgba(0,0,0,.45);color:#fff;font:15px/1.3 ' + FONT + ';pointer-events:none}' +
    '#fs-toast.in{transform:translate(-50%,0)}#fs-toast .ic{flex:none;width:34px;height:34px;border-radius:9px;background:' + C_OK + ';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px}' +
    '#fs-toast .tx{min-width:0}#fs-toast b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#fs-toast span{font-size:13px;color:' + C_MUT + ';' + NUM + '}';
