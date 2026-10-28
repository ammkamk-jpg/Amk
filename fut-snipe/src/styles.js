  // ---------- styles ----------
  // Look: deep night background, frosted-glass cards, a cyan -> violet accent gradient, green for money.
  var C_BG = '#06080d', C_GLASS = 'rgba(255,255,255,.045)', C_LINE = 'rgba(255,255,255,.08)', C_TXT = '#eef2f8', C_MUT = '#8b95a8';
  var C_A1 = '#22d3ee', C_A2 = '#a78bfa', C_OK = '#34d399', C_WARN = '#fb923c', GRAD = 'linear-gradient(135deg,' + C_A1 + ',' + C_A2 + ')';
  var FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text",system-ui,Roboto,sans-serif';
  var CSS =
    '#fs-panel *,#fs-fab,#fs-fab *,#fs-lock *,#fs-fx *{box-sizing:border-box}#fs-body{overflow-x:hidden}' +
    // panel
    '#fs-panel{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;font:14px/1.45 ' + FONT + ';color:' + C_TXT + ';background:radial-gradient(120% 60% at 100% 0%,rgba(167,139,250,.16),transparent 60%),radial-gradient(90% 50% at 0% 10%,rgba(34,211,238,.13),transparent 60%),' + C_BG + '}' +
    '#fs-panel.open{display:flex;animation:fsfade .25s ease-out}@keyframes fsfade{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}' +
    '#fs-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;padding-top:max(14px,env(safe-area-inset-top))}' +
    '#fs-head .t{font-weight:900;font-size:21px;letter-spacing:-.3px;background:' + GRAD + ';-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '#fs-head .t2{font-size:10px;font-weight:800;letter-spacing:3px;color:' + C_MUT + ';margin-left:7px}#fs-head .v{font-size:10px;color:#5d6678;margin-left:6px}' +
    '#fs-head .coins{font-size:13px;font-weight:800;color:#fde68a;background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:999px;padding:7px 12px}' +
    '#fs-min{background:' + C_GLASS + ';color:' + C_TXT + ';border:1px solid ' + C_LINE + ';border-radius:999px;width:36px;height:36px;font-size:15px;margin-left:8px}' +
    '#fs-tabs{display:flex;gap:4px;margin:4px 16px 0;padding:4px;background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:14px}' +
    '.fs-tab{flex:1;text-align:center;padding:8px;border-radius:10px;color:' + C_MUT + ';font-weight:700;font-size:13px;transition:.2s}' +
    '.fs-tab.on{background:rgba(255,255,255,.09);color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.3)}' +
    '#fs-body{flex:1;overflow:auto;padding:14px 16px;padding-bottom:max(28px,env(safe-area-inset-bottom));width:100%;max-width:520px;margin:0 auto}' +
    // hero
    '.fs-hero{position:relative;overflow:hidden;background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:22px;padding:18px 16px;margin-bottom:12px;text-align:center}' +
    '.fs-hero:before{content:"";position:absolute;inset:-1px;border-radius:22px;padding:1px;background:' + GRAD + ';-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;opacity:.55;pointer-events:none}' +
    '.fs-hero .l{font-size:10px;letter-spacing:2px;color:' + C_MUT + ';text-transform:uppercase;font-weight:700}' +
    '.fs-hero .big{font-size:42px;font-weight:900;letter-spacing:-1px;line-height:1.1;margin-top:4px;background:' + GRAD + ';-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '.fs-hero .sub{font-size:12px;color:' + C_MUT + ';margin-top:4px}' +
    '.fs-hero .prof{display:inline-block;margin-top:10px;font-size:13px;font-weight:800;color:' + C_OK + ';background:rgba(52,211,153,.1);border:1px solid rgba(52,211,153,.3);border-radius:999px;padding:5px 12px}.fs-hero .prof:empty{display:none}' +
    // cards / stats
    '.fs-card{background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:18px;overflow:hidden;margin-bottom:12px}' +
    '.fs-ch{font-size:10px;letter-spacing:1.6px;color:' + C_MUT + ';text-transform:uppercase;font-weight:700;padding:11px 14px 0}' +
    '.fs-cols{display:grid;grid-template-columns:1fr 1fr 1fr}' +
    '.fs-cols .c{padding:6px 14px 12px;border-right:1px solid ' + C_LINE + '}.fs-cols .c:last-child{border-right:0}' +
    '.fs-cols .l{font-size:9.5px;letter-spacing:1px;color:' + C_MUT + ';text-transform:uppercase}' +
    '.fs-cols .v{font-size:18px;font-weight:850;margin-top:2px;font-variant-numeric:tabular-nums}.fs-cols .v.c{color:' + C_A1 + '}.fs-cols .v.g{color:' + C_OK + '}.fs-cols .v.r{color:' + C_WARN + '}' +
    '.fs-life{font-size:11px;color:#6b7487;text-align:center;padding:0 0 11px}' +
    // settings rows
    '.fs-rows{background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:18px;margin-bottom:12px;overflow:hidden}' +
    '.fs-r{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;border-bottom:1px solid ' + C_LINE + '}.fs-r:last-child{border-bottom:0}' +
    '.fs-r .lab{display:flex;align-items:center;gap:10px;color:#dbe2ee;font-size:13.5px}.fs-r .ic{width:18px;text-align:center}' +
    '.fs-r.rcol{flex-direction:column;align-items:stretch;gap:9px}.fs-r.rcol .lab{width:100%}.fs-r.rcol .sv{margin-left:auto;color:' + C_A1 + ';font-weight:800}' +
    '.fs-r input[type=number]{width:96px;background:rgba(0,0,0,.35);border:1px solid ' + C_LINE + ';color:' + C_TXT + ';border-radius:10px;padding:8px 10px;font-size:14px;font-weight:700;text-align:right}' +
    '.fs-sw{width:46px;height:28px;flex:none;border-radius:999px;background:rgba(255,255,255,.14);position:relative;transition:.2s}.fs-sw.on{background:' + GRAD + '}.fs-sw:after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.35);transition:.2s cubic-bezier(.3,1.4,.5,1)}.fs-sw.on:after{left:21px}' +
    '.fs-segw{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:64%}.fs-sg{background:rgba(0,0,0,.3);color:#b3bccb;border:1px solid ' + C_LINE + ';border-radius:999px;padding:6px 11px;font-size:12px;font-weight:700;transition:.15s}.fs-sg.on{background:' + GRAD + ';color:#0b0f1a;border-color:transparent}' +
    '.fs-range{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:999px;background:rgba(255,255,255,.12);outline:none;margin:2px 0}.fs-range::-webkit-slider-thumb{-webkit-appearance:none;width:24px;height:24px;border-radius:50%;background:#fff;border:0;box-shadow:0 0 0 4px rgba(34,211,238,.35),0 2px 6px rgba(0,0,0,.4)}' +
    '.fs-hint{font-size:11px;color:' + C_MUT + ';padding:0 14px 10px;margin-top:-4px}' +
    // buttons
    '.fs-btn{position:relative;overflow:hidden;width:100%;border:0;border-radius:18px;padding:16px;font-size:17px;font-weight:900;letter-spacing:.3px;transition:transform .12s}.fs-btn:active{transform:scale(.97)}' +
    '.fs-go{background:' + GRAD + ';color:#0b0f1a;box-shadow:0 10px 30px -8px rgba(34,211,238,.55)}' +
    '.fs-go:after{content:"";position:absolute;top:0;left:-60%;width:40%;height:100%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.45),transparent);animation:fssheen 3.2s ease-in-out infinite}@keyframes fssheen{0%,55%{left:-60%}100%{left:130%}}' +
    '.fs-stop{background:linear-gradient(135deg,#fb7185,#fb923c);color:#fff;box-shadow:0 10px 30px -8px rgba(251,113,133,.55)}' +
    '.fs-btn .sub{display:block;font-size:11px;font-weight:650;opacity:.75;margin-top:3px;letter-spacing:0}' +
    '.fs-mini{display:flex;gap:8px;margin-top:10px}.fs-mini button{flex:1;background:' + C_GLASS + ';color:#b3bccb;border:1px solid ' + C_LINE + ';border-radius:12px;padding:10px;font-size:12px;font-weight:700}' +
    '#fs-block{color:' + C_WARN + ';font-size:12px;margin:0 0 10px}#fs-block:empty{display:none}' +
    '#fs-status{font-size:12px;color:' + C_MUT + ';margin:12px 2px 0;text-align:center}' +
    '#fs-log{margin:8px 0 0;max-height:90px;overflow:auto;white-space:pre-wrap;color:#6b7487;font-size:11px;line-height:1.5}#fs-log:empty{display:none}' +
    '.fs-sec{margin-top:4px}.fs-sec summary{cursor:pointer;color:' + C_MUT + ';font-size:12px;font-weight:700;padding:8px 4px;list-style:none}.fs-sec summary::-webkit-details-marker{display:none}.fs-sec summary:before{content:"›";display:inline-block;margin-right:7px;transition:.2s}.fs-sec[open] summary:before{transform:rotate(90deg)}' +
    '#fs-act{font-size:13px;color:' + C_A1 + ';font-weight:800;text-align:center;margin:12px 2px 0;min-height:18px}' +
    // filters / stats tabs
    '.fs-item{display:flex;align-items:center;justify-content:space-between;background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:16px;padding:13px 14px;margin-bottom:9px}' +
    '.fs-item .nm{font-weight:800;font-size:14px}.fs-item .de{font-size:11px;color:' + C_MUT + ';margin-top:2px}' +
    '.fs-item .act{display:flex;gap:7px}.fs-item .act button{border:0;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:800}' +
    '.fs-load{background:' + GRAD + ';color:#0b0f1a}.fs-del{background:rgba(255,255,255,.1);color:' + C_TXT + '}' +
    '.fs-empty{text-align:center;color:' + C_MUT + ';font-size:13px;padding:34px 10px}' +
    '.fs-bar{height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:7px}.fs-bar i{display:block;height:100%;border-radius:999px;background:' + C_OK + '}' +
    '.fs-srow{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid ' + C_LINE + '}.fs-srow:last-child{border:0}' +
    // hub
    '.fs-cols.c4{grid-template-columns:repeat(4,1fr)}.fs-cols.c4 .c{padding:6px 10px 12px}' +
    '.fs-hubbtns{display:flex;flex-direction:column;gap:8px;margin-top:10px}' +
    '.fs-hb{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:16px;padding:13px 15px;color:' + C_TXT + ';font-family:' + FONT + ';transition:transform .12s}.fs-hb:active{transform:scale(.98)}' +
    '.fs-hb b{font-size:14.5px;font-weight:850}.fs-hb span{font-size:11.5px;color:' + C_MUT + '}' +
    '.fs-sale{display:flex;justify-content:space-between;align-items:center;gap:10px;background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:14px;padding:10px 14px;margin-bottom:7px}' +
    '.fs-sale .nm{font-weight:800;font-size:13.5px}.fs-sale .de{font-size:11px;color:' + C_MUT + ';margin-top:1px}.fs-sale .pf{font-weight:900;font-size:15px;color:' + C_MUT + '}.fs-sale .pf.pos{color:' + C_OK + '}.fs-sale .pf.neg{color:' + C_WARN + '}' +
    '.fs-sale .pk{font-size:9.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#0b0f1a;background:' + GRAD + ';border-radius:999px;padding:1px 6px;vertical-align:2px}' +
    // hub dashboard
    '.fs-dash{display:grid;grid-template-columns:1.3fr 1fr;gap:10px;margin-bottom:10px}' +
    '.fs-dc{position:relative;overflow:hidden;background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:20px;padding:13px 14px 12px;min-height:150px}' +
    '.fs-dc.ac{border-color:rgba(34,211,238,.3)}' +
    '.fs-dc .dh{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:' + C_MUT + ';font-weight:800}' +
    '.fs-dc .di{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;background:rgba(255,255,255,.07);color:' + C_TXT + ';font-size:10px;letter-spacing:-2px}' +
    '.fs-dc .dv{font-size:30px;font-weight:950;letter-spacing:-1px;margin:8px 0 4px;font-variant-numeric:tabular-nums}' +
    '.fs-dc .dsub{font-size:11.5px;color:' + C_MUT + ';margin-top:3px;position:relative;z-index:1}.fs-dc .dsub b{color:' + C_A1 + '}.fs-dc .dsub.up{color:' + C_OK + '}.fs-dc .dsub.down{color:#fb7185}' +
    '.fs-dc .spark{position:absolute;left:0;right:0;bottom:0;width:100%;height:46px;opacity:.9}' +
    '.fs-dpair,.fs-dc .dpair{display:flex;gap:12px;margin:10px 0 8px}.fs-dc .dpair div{flex:1}.fs-dc .dpair b{display:block;font-size:24px;font-weight:950;font-variant-numeric:tabular-nums}.fs-dc .dpair span{font-size:9.5px;letter-spacing:1px;text-transform:uppercase;color:' + C_MUT + '}' +
    '.fs-dc.ac .dsub b{color:' + C_TXT + '}' +
    '.fs-safe{display:flex;align-items:center;gap:12px;background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:18px;padding:12px 14px;margin-bottom:12px}' +
    '.fs-safe .ico{flex:none;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:950;font-size:18px;color:#0b0f1a;background:' + C_OK + ';box-shadow:0 0 18px rgba(52,211,153,.45)}' +
    '.fs-safe.warn .ico{background:#fbbf24;box-shadow:0 0 18px rgba(251,191,36,.45)}.fs-safe.stop .ico{background:#fb7185;box-shadow:0 0 18px rgba(251,113,133,.45)}' +
    '.fs-safe .tx{flex:1;min-width:0}.fs-safe .k{font-size:9.5px;letter-spacing:1.6px;text-transform:uppercase;color:' + C_MUT + ';font-weight:800}.fs-safe .t{font-size:16px;font-weight:900}.fs-safe .h{font-size:10.5px;color:#6b7487}' +
    '.fs-safe .chip{flex:none;font-size:12px;font-weight:850;color:' + C_OK + ';background:rgba(52,211,153,.12);border:1px solid rgba(52,211,153,.3);border-radius:999px;padding:6px 11px}' +
    '.fs-safe.warn .chip{color:#fbbf24;background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.3)}.fs-safe.stop .chip{color:#fb7185;background:rgba(251,113,133,.12);border-color:rgba(251,113,133,.3)}' +
    '.fs-tradebar{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:2px 0 9px}' +
    '.fs-upd{background:transparent;border:1px solid ' + C_LINE + ';color:' + C_MUT + ';border-radius:999px;padding:6px 11px;font-size:11.5px;font-family:' + FONT + '}.fs-upd b{color:' + C_TXT + '}' +
    '.fs-trade{display:flex;align-items:center;gap:11px;background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:16px;padding:10px 12px;margin-bottom:7px;animation:fsin .35s both}' +
    '.fs-trade .av{flex:none;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;color:#2b2210;background:linear-gradient(135deg,#fde68a,#d4a537);box-shadow:inset 0 0 0 2px rgba(255,255,255,.35)}' +
    '.fs-trade .nm{flex:1;min-width:0;font-weight:800;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fs-trade .nm span{color:' + C_MUT + ';font-weight:700}.fs-trade .nm i{font-style:normal;font-size:9px;font-weight:900;letter-spacing:1px;text-transform:uppercase;color:#0b0f1a;background:' + GRAD + ';border-radius:999px;padding:1px 6px;vertical-align:2px}.fs-trade .de{font-size:10.5px;color:#6b7487;font-weight:600}' +
    '.fs-trade .pf{font-weight:900;font-size:14px;font-variant-numeric:tabular-nums;color:' + C_MUT + '}.fs-trade .pf.open{color:' + C_A1 + '}.fs-trade .pf.pos{color:' + C_OK + '}.fs-trade .pf.neg{color:#fb7185}' +
    '.fs-trade .stt{flex:none;font-size:11px;font-weight:850;border-radius:999px;padding:5px 10px}.fs-trade .stt:before{content:"✓ "}' +
    '.fs-trade .stt.b{color:' + C_A1 + ';background:rgba(34,211,238,.12)}.fs-trade .stt.s{color:' + C_OK + ';background:rgba(52,211,153,.14)}' +
    '.fs-more{width:100%;background:transparent;border:1px dashed ' + C_LINE + ';color:' + C_MUT + ';border-radius:14px;padding:9px;font-size:12px;font-weight:800;font-family:' + FONT + '}' +
    // floating button
    '#fs-fab{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:58px;height:58px;border-radius:50%;background:' + GRAD + ';color:#0b0f1a;font-size:25px;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 28px -6px rgba(34,211,238,.6),0 0 0 3px rgba(255,255,255,.08);cursor:pointer;font-family:' + FONT + ';touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}' +
    '#fs-fab.glide{transition:left .5s cubic-bezier(.22,1,.36,1),top .5s cubic-bezier(.22,1,.36,1)}#fs-fab.drag{transform:scale(1.12);opacity:.92}' +
    '#fs-fab .dot{position:absolute;top:6px;right:6px;width:13px;height:13px;border-radius:50%;background:' + C_OK + ';border:2px solid #0b0f1a;display:none;animation:fsping2 1.4s infinite}#fs-fab.run .dot{display:block}' +
    '@keyframes fsping2{0%{box-shadow:0 0 0 0 rgba(52,211,153,.7)}100%{box-shadow:0 0 0 10px rgba(52,211,153,0)}}' +
    // price tag on cards
    '.fs-badge{position:absolute;left:0;top:0;z-index:6;padding:2px 9px;border-radius:999px;background:rgba(6,8,13,.88);border:1.5px solid transparent;background-image:linear-gradient(rgba(6,8,13,.92),rgba(6,8,13,.92)),' + GRAD + ';background-origin:border-box;background-clip:padding-box,border-box;color:#fff;font:800 12px/1.35 ' + FONT + ';white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.5);pointer-events:none}' +
    // running screen
    '#fs-lock{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(80% 50% at 50% 30%,rgba(34,211,238,.12),transparent 70%),rgba(6,8,13,.97);color:' + C_TXT + ';font:14px/1.45 ' + FONT + ';text-align:center;padding:24px;padding-top:max(24px,env(safe-area-inset-top));touch-action:none;-webkit-user-select:none;user-select:none}' +
    '#fs-lock.show{display:flex}#fs-lock.shake{animation:fsshake .5s cubic-bezier(.36,.07,.19,.97)}' +
    '@keyframes fsshake{10%,90%{transform:translate(-2px,1px)}20%,80%{transform:translate(4px,-2px)}30%,50%,70%{transform:translate(-7px,3px)}40%,60%{transform:translate(7px,-3px)}}' +
    '#fs-lock .radar{position:relative;width:96px;height:96px;border-radius:50%;border:1px solid rgba(34,211,238,.35);background:radial-gradient(circle,rgba(34,211,238,.18) 0 2px,transparent 3px),repeating-radial-gradient(circle,transparent 0 15px,rgba(34,211,238,.12) 16px 17px)}' +
    '#fs-lock .radar:before{content:"";position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,rgba(34,211,238,.55),transparent 28%);animation:fsspin 1.8s linear infinite}' +
    '#fs-lock .radar:after{content:"";position:absolute;inset:-6px;border-radius:50%;border:1px solid rgba(167,139,250,.35);animation:fsping3 2.4s ease-out infinite}' +
    '@keyframes fsspin{to{transform:rotate(360deg)}}@keyframes fsping3{from{transform:scale(.9);opacity:1}to{transform:scale(1.35);opacity:0}}' +
    '#fs-lock .lbig{font-size:22px;font-weight:900;letter-spacing:-.3px}#fs-lock .lbig b{background:' + GRAD + ';-webkit-background-clip:text;background-clip:text;color:transparent}' +
    '#fs-lock .lstat{font-size:14px;color:' + C_A1 + ';font-weight:800;min-height:18px}' +
    '#fs-lock .lrow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%;max-width:380px}#fs-lock .lrow div{background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';border-radius:14px;padding:8px 4px;font-size:9.5px;color:' + C_MUT + ';text-transform:uppercase;letter-spacing:1px}#fs-lock .lrow b{display:block;font-size:18px;color:#fff;font-weight:900;margin-top:1px;letter-spacing:0;font-variant-numeric:tabular-nums}#fs-lock .lrow .pf b{color:' + C_OK + '}' +
    '#fs-lock .lsub{font-size:12px;color:' + C_MUT + ';max-width:330px}' +
    '#fs-lock .lbtns{display:flex;gap:10px;margin-top:6px}#fs-lock .lbtns button{border:0;border-radius:999px;padding:13px 28px;font-size:15px;font-weight:900}' +
    '#fs-lstop{background:linear-gradient(135deg,#fb7185,#fb923c);color:#fff}#fs-lhide{background:rgba(255,255,255,.1);color:' + C_TXT + '}' +
    // live feed
    '.fs-feed{width:100%;max-width:380px;display:flex;flex-direction:column;gap:5px;max-height:36vh;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;text-align:left;margin-top:2px;padding-bottom:18px;-webkit-mask:linear-gradient(#000 85%,transparent);scrollbar-width:none}.fs-feed::-webkit-scrollbar{display:none}' +
    '.fs-fl{flex:none}' +
    '#fs-body .fs-feed{max-width:none;max-height:240px;margin:10px 0 0}' +
    '.fs-fl{display:flex;align-items:center;gap:9px;padding:8px 12px;border-radius:12px;background:' + C_GLASS + ';border:1px solid ' + C_LINE + ';color:#d5dce8;font-size:12.5px;line-height:1.3;animation:fsin .4s cubic-bezier(.2,.9,.3,1.25) both}' +
    '.fs-fl .tx{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.fs-fl .tm{color:#6b7487;font-size:11px;font-variant-numeric:tabular-nums}' +
    '.fs-fl:before{content:"";width:7px;height:7px;border-radius:50%;background:#4b5466;flex:none}' +
    '.fs-fl.miss:first-child:before{background:' + C_A1 + ';animation:fsping 1.1s ease-out infinite}' +
    '.fs-fl.check:before{background:#fbbf24}.fs-fl.price:before{background:' + C_A1 + '}.fs-fl.list:before{background:' + C_A2 + '}.fs-fl.break:before{background:' + C_MUT + '}.fs-fl.stop:before{background:#fb7185}' +
    '.fs-fl.hit{background:linear-gradient(90deg,rgba(52,211,153,.22),rgba(255,255,255,.04));border-color:rgba(52,211,153,.6);color:#d1fae5;font-weight:800;animation:fsin .4s cubic-bezier(.2,.9,.3,1.25) both,fsglow 1.8s ease-out}.fs-fl.hit:before{background:' + C_OK + '}' +
    '.fs-fl:first-child{border-color:rgba(34,211,238,.3)}' +
    '@keyframes fsin{from{opacity:0;transform:translateY(-14px) scale(.95)}to{opacity:1;transform:none}}' +
    '@keyframes fsping{0%{box-shadow:0 0 0 0 rgba(34,211,238,.7)}100%{box-shadow:0 0 0 9px rgba(34,211,238,0)}}' +
    '@keyframes fsglow{0%{box-shadow:0 0 0 0 rgba(52,211,153,.8)}100%{box-shadow:0 0 0 16px rgba(52,211,153,0)}}' +
    // snipe celebration
    '#fs-fx{position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:' + FONT + ';transition:opacity .6s}#fs-fx.out{opacity:0}#fs-fx canvas{position:absolute;inset:0;width:100%;height:100%}' +
    '#fs-fx:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(6,8,13,.85),rgba(6,8,13,.45) 75%);animation:fsfade .25s ease-out}' +
    '#fs-fx .fx-flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.95),rgba(52,211,153,.5) 30%,transparent 70%);animation:fxflash .7s ease-out forwards}@keyframes fxflash{from{opacity:1}to{opacity:0}}' +
    '#fs-fx .fx-ring{position:absolute;left:50%;top:42%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:4px solid ' + C_OK + ';animation:fxring 1.1s cubic-bezier(.1,.8,.3,1) forwards}#fs-fx .fx-ring.r2{border-color:' + C_A1 + ';animation-delay:.12s}#fs-fx .fx-ring.r3{border-color:' + C_A2 + ';animation-delay:.24s}' +
    '@keyframes fxring{from{transform:scale(.2);opacity:1}to{transform:scale(18);opacity:0;border-width:1px}}' +
    '#fs-fx .fx-txt{position:absolute;left:0;right:0;top:42%;transform:translateY(-50%);text-align:center}' +
    '#fs-fx .fx-big{font-size:min(19vw,92px);font-weight:950;font-style:italic;letter-spacing:-3px;line-height:1;background:linear-gradient(135deg,#fff,' + C_OK + ' 40%,' + C_A1 + ' 70%,' + C_A2 + ');-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 6px 24px rgba(52,211,153,.55));animation:fxpop .7s cubic-bezier(.2,1.6,.4,1) both}' +
    '@keyframes fxpop{0%{transform:scale(3) rotate(-8deg);opacity:0;filter:blur(8px)}60%{transform:scale(.9) rotate(2deg);opacity:1;filter:blur(0)}100%{transform:scale(1) rotate(-3deg)}}' +
    '#fs-fx .fx-name{margin-top:10px;font-size:20px;font-weight:900;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.6);animation:fxup .5s .25s both}' +
    '#fs-fx .fx-meta{margin-top:6px;font-size:16px;font-weight:800;color:#d5dce8;animation:fxup .5s .35s both}#fs-fx .fx-meta span{color:' + C_OK + ';background:rgba(6,8,13,.7);border:1px solid rgba(52,211,153,.5);border-radius:999px;padding:3px 10px;margin-left:6px}' +
    '@keyframes fxup{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}';
