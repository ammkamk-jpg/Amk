  // ---------- styles ----------
  var CSS =
    '#fs-panel *,#fs-fab,#fs-fab *{box-sizing:border-box}#fs-body{overflow-x:hidden}' +
    '#fs-lock{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(7,11,18,.975);color:#eaf0f6;font:14px/1.45 -apple-system,system-ui,sans-serif;text-align:center;padding:24px;touch-action:none;-webkit-user-select:none;user-select:none}' +
    '#fs-lock.show{display:flex}' +
    '#fs-lock .spin{width:56px;height:56px;border-radius:50%;border:4px solid #1b2838;border-top-color:#00CAF6;animation:fsspin 1s linear infinite}' +
    '@keyframes fsspin{to{transform:rotate(360deg)}}' +
    '#fs-lock .lbig{font-size:21px;font-weight:800}#fs-lock .lstat{font-size:14px;color:#00CAF6;font-weight:700;min-height:18px}' +
    '#fs-lock .lrow{display:flex;gap:26px;margin-top:2px}#fs-lock .lrow div{font-size:11px;color:#8ea0b5;text-transform:uppercase;letter-spacing:.4px}#fs-lock .lrow b{display:block;font-size:22px;color:#fff;font-weight:800;margin-top:2px}' +
    '#fs-lock .lsub{font-size:12px;color:#7f93a8;max-width:300px}' +
    '#fs-lock .lbtns{display:flex;gap:10px;margin-top:8px}#fs-lock .lbtns button{border:0;border-radius:12px;padding:14px 24px;font-size:15px;font-weight:800}' +
    '#fs-lstop{background:#FF5D0B;color:#fff}#fs-lhide{background:#1b2838;color:#cdd8e4}' +
    '.fs-r.rcol{flex-direction:column;align-items:stretch;gap:8px}.fs-r.rcol .lab{justify-content:flex-start;width:100%}.fs-r.rcol .sv{margin-left:auto;color:#00CAF6;font-weight:800}' +
    '.fs-range{-webkit-appearance:none;appearance:none;width:100%;height:6px;border-radius:4px;background:#2a3a4c;outline:none;margin:2px 0}.fs-range::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#00CAF6;border:3px solid #0b1017;box-shadow:0 1px 4px rgba(0,0,0,.4)}' +
    '.fs-hint{font-size:11px;color:#8ea0b5;padding:0 12px 10px;margin-top:-4px}' +
    '#fs-fab{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:58px;height:58px;border-radius:30px;background:#00CAF6;color:#05222c;font-size:26px;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(0,0,0,.5);cursor:pointer;font-family:-apple-system,system-ui,sans-serif}' +
    '#fs-fab .dot{position:absolute;top:8px;right:8px;width:12px;height:12px;border-radius:6px;background:#19e67d;border:2px solid #05222c;display:none}' +
    '#fs-fab.run .dot{display:block}' +
    '.fs-badge{position:absolute;left:50%;bottom:5px;transform:translateX(-50%);z-index:6;padding:1px 9px;border-radius:9px;background:#0b1620;border:1.5px solid #00CAF6;color:#eaf6ff;font:800 12px/1.35 -apple-system,system-ui,sans-serif;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.45);pointer-events:none}' +
    '#fs-panel{position:fixed;inset:0;z-index:2147483647;display:none;flex-direction:column;font:14px/1.45 -apple-system,system-ui,"SF Pro Text",Roboto,sans-serif;color:#eaf0f6;background:#0b1017}' +
    '#fs-panel.open{display:flex}' +
    '#fs-head{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;padding-top:max(13px,env(safe-area-inset-top));background:linear-gradient(180deg,#152030,#101722);border-bottom:1px solid #223041}' +
    '#fs-head .t{font-weight:800;letter-spacing:.3px;font-size:17px}#fs-head .v{opacity:.5;font-size:11px;margin-left:6px}' +
    '#fs-head .coins{font-size:14px;font-weight:700;color:#f3c969;background:#1b2838;border-radius:10px;padding:7px 12px}' +
    '#fs-min{background:#1b2838;color:#cdd8e4;border:0;border-radius:10px;width:38px;height:38px;font-size:19px;margin-left:10px}' +
    '#fs-tabs{display:flex;gap:6px;padding:10px 14px 0;background:#101722}' +
    '.fs-tab{flex:1;text-align:center;padding:10px;border-radius:10px 10px 0 0;background:#0e1620;color:#8ea0b5;font-weight:700;font-size:13px}' +
    '.fs-tab.on{background:#0b1017;color:#00CAF6;box-shadow:inset 0 -2px 0 #00CAF6}' +
    '#fs-body{flex:1;overflow:auto;padding:14px;padding-bottom:max(24px,env(safe-area-inset-bottom));width:100%;max-width:520px;margin:0 auto}' +
    '.fs-hero{background:linear-gradient(135deg,#0f2630,#121c28);border:1px solid #1d4350;border-radius:16px;padding:16px;margin-bottom:12px;text-align:center}' +
    '.fs-hero .big{font-size:34px;font-weight:900;color:#00CAF6;letter-spacing:.5px}' +
    '.fs-hero .sub{font-size:12px;color:#8ea0b5;margin-top:2px}' +
    '.fs-hero .prof{font-size:15px;font-weight:800;margin-top:8px}' +
    '.fs-card{background:#121c28;border:1px solid #223041;border-radius:14px;overflow:hidden;margin-bottom:11px}' +
    '.fs-ch{font-size:9.5px;letter-spacing:.6px;color:#6f8498;text-transform:uppercase;padding:9px 12px 0}' +
    '.fs-cols{display:grid;grid-template-columns:1fr 1fr 1fr}' +
    '.fs-cols .c{padding:7px 10px 11px;border-right:1px solid #1b2836}.fs-cols .c:last-child{border-right:0}' +
    '.fs-cols .l{font-size:9px;letter-spacing:.4px;color:#6f8498;text-transform:uppercase}' +
    '.fs-cols .v{font-size:16px;font-weight:800;margin-top:3px}.fs-cols .v.c{color:#00CAF6}.fs-cols .v.g{color:#19e67d}.fs-cols .v.r{color:#ff8a5c}' +
    '.fs-life{font-size:11px;color:#7f93a8;text-align:center;padding:0 0 9px;margin-top:-2px}' +
    '.fs-rows{background:#141f2c;border:1px solid #223041;border-radius:14px;margin-bottom:11px;overflow:hidden}' +
    '.fs-r{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #1b2836}.fs-r:last-child{border-bottom:0}' +
    '.fs-r .lab{display:flex;align-items:center;gap:9px;color:#cdd8e4}.fs-r .ic{width:17px;text-align:center;opacity:.85}' +
    '.fs-r input[type=number]{width:92px;background:#0c131b;border:1px solid #223041;color:#eaf0f6;border-radius:8px;padding:7px 8px;font-size:13px;text-align:right}' +
    '.fs-sw{width:44px;height:26px;border-radius:14px;background:#2a3a4c;position:relative;transition:.15s}.fs-sw.on{background:#00CAF6}.fs-sw:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:.15s}.fs-sw.on:after{left:21px}' +
    '.fs-segw{display:flex;gap:4px}.fs-sg{background:#0c131b;color:#9fb0c3;border:1px solid #223041;border-radius:8px;padding:6px 9px;font-size:12px;font-weight:600}.fs-sg.on{background:#00CAF6;color:#05222c;border-color:#00CAF6}' +
    '.fs-btn{width:100%;border:0;border-radius:13px;padding:15px;font-size:16px;font-weight:800;letter-spacing:.2px}' +
    '.fs-go{background:#00CAF6;color:#05222c}.fs-stop{background:#FF5D0B;color:#fff}' +
    '.fs-btn .sub{display:block;font-size:11px;font-weight:600;opacity:.8;margin-top:2px}' +
    '.fs-mini{display:flex;gap:8px;margin-top:9px}.fs-mini button{flex:1;background:#1b2838;color:#9fb0c3;border:0;border-radius:10px;padding:9px;font-size:12px;font-weight:600}' +
    '#fs-block{color:#ff9a6b;font-size:11.5px;margin:0 0 10px}' +
    '#fs-status{font-size:12px;color:#8ea0b5;margin:10px 2px 0;text-align:center}' +
    '#fs-log{margin:8px 0 0;max-height:104px;overflow:auto;white-space:pre-wrap;color:#7f93a8;font-size:11px;line-height:1.5}' +
    '.fs-sec summary{cursor:pointer;color:#8ea0b5;font-size:12px;padding:4px 2px;list-style:none}.fs-sec summary::-webkit-details-marker{display:none}.fs-sec summary:before{content:"⚙︎ ";opacity:.7}' +
    '.fs-item{display:flex;align-items:center;justify-content:space-between;background:#121c28;border:1px solid #223041;border-radius:12px;padding:12px;margin-bottom:9px}' +
    '.fs-item .nm{font-weight:700;font-size:14px}.fs-item .de{font-size:11px;color:#7f93a8;margin-top:2px}' +
    '.fs-item .act{display:flex;gap:7px}.fs-item .act button{border:0;border-radius:9px;padding:9px 13px;font-size:12px;font-weight:700}' +
    '.fs-load{background:#00CAF6;color:#05222c}.fs-del{background:#2a3a4c;color:#cdd8e4}' +
    '.fs-empty{text-align:center;color:#6f8498;font-size:13px;padding:30px 10px}' +
    '.fs-bar{height:7px;border-radius:4px;background:#1b2836;overflow:hidden;margin-top:6px}.fs-bar i{display:block;height:100%;background:#19e67d}' +
    '.fs-srow{display:flex;justify-content:space-between;align-items:center;padding:11px 12px;border-bottom:1px solid #1b2836}.fs-srow:last-child{border:0}' +
    '.fs-segw{flex-wrap:wrap;justify-content:flex-end;max-width:62%}' +
    '.fs-go .sub,.fs-stop .sub{display:block}#fs-act{font-size:12.5px;color:#00CAF6;font-weight:700;text-align:center;margin:10px 2px 0;min-height:17px}';
