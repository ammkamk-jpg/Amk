  // ---------- snipe celebration: animation, vibration, sound ----------
  // Sounds are synthesised with WebAudio (no files). iOS only allows audio after a tap, so the
  // audio context is unlocked when you tap Start (or a sound button in settings).
  var SOUNDS = [['Off', 0], ['Coins', 1], ['Arcade', 2], ['Boom', 3]];
  var audioCtx = null;
  function unlockAudio() {
    try {
      if (!audioCtx) { var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; audioCtx = new AC(); }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var b = audioCtx.createBuffer(1, 1, 22050), s = audioCtx.createBufferSource(); s.buffer = b; s.connect(audioCtx.destination); s.start(0);
    } catch (e) {}
  }
  function tone(type, f0, f1, t0, dur, vol) {
    var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + t0;
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(t0, dur, vol) {
    var n = Math.floor(audioCtx.sampleRate * dur), b = audioCtx.createBuffer(1, n, audioCtx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var s = audioCtx.createBufferSource(), g = audioCtx.createGain(), f = audioCtx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = vol; s.buffer = b;
    s.connect(f); f.connect(g); g.connect(audioCtx.destination); s.start(audioCtx.currentTime + t0);
  }
  function playSound(kind) {
    if (!kind || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      if (kind === 1) { tone('square', 988, 988, 0, 0.09, 0.12); tone('square', 1319, 1319, 0.08, 0.42, 0.12); tone('triangle', 2637, 2637, 0.16, 0.25, 0.05); }
      else if (kind === 2) { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone('square', f, f, i * 0.07, 0.12, 0.09); }); tone('sawtooth', 1047, 2093, 0.36, 0.35, 0.06); }
      else if (kind === 3) { tone('sine', 150, 38, 0, 0.7, 0.55); noise(0, 0.45, 0.35); tone('triangle', 1568, 1568, 0.12, 0.6, 0.08); tone('triangle', 2093, 2093, 0.22, 0.6, 0.06); }
    } catch (e) {}
  }

  // Vibration: Android has navigator.vibrate. iPhone Safari doesn't, but tapping an iOS 18
  // "switch" checkbox gives a haptic tick, so we tap a hidden one a few times.
  var hapticEl = null;
  function vibrate() {
    try { if (navigator.vibrate && navigator.vibrate([70, 50, 140, 50, 220])) return; } catch (e) {}
    try {
      if (!hapticEl) {
        hapticEl = document.createElement('label'); hapticEl.style.cssText = 'position:fixed;left:-99px;top:0;opacity:0;pointer-events:none';
        hapticEl.innerHTML = '<input type="checkbox" switch>'; document.body.appendChild(hapticEl);
      }
      [0, 120, 240].forEach(function (d) { setTimeout(function () { try { hapticEl.click(); } catch (e) {} }, d); });
    } catch (e) {}
  }

  // The over-the-top part: flash, shockwaves, "SNIPED!", a burst of coins + confetti, screen shake.
  function celebrate(name, price, profit) {
    if (cfg.vibrate) vibrate();
    playSound(cfg.sound | 0);
    try {
      var old = document.getElementById('fs-fx'); if (old) old.parentNode.removeChild(old);
      var fx = document.createElement('div'); fx.id = 'fs-fx';
      fx.innerHTML = '<div class="fx-flash"></div><div class="fx-ring"></div><div class="fx-ring r2"></div><div class="fx-ring r3"></div><canvas></canvas>' +
        '<div class="fx-txt"><div class="fx-big">SNIPED!</div><div class="fx-name">' + esc(name) + '</div><div class="fx-meta">' + fmt(price) + (profit != null ? ' <span>+' + fmt(profit) + '</span>' : '') + '</div></div>';
      document.body.appendChild(fx);
      var lock = document.getElementById('fs-lock'); if (lock) { lock.classList.remove('shake'); void lock.offsetWidth; lock.classList.add('shake'); }
      burst(fx.querySelector('canvas'));
      setTimeout(function () { fx.classList.add('out'); }, 2300);
      setTimeout(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); }, 2900);
    } catch (e) {}
  }
  function burst(cv) {
    var w = window.innerWidth, h = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr; var c = cv.getContext('2d'); c.scale(dpr, dpr);
    var cols = ['#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#fde68a'], parts = [];
    for (var i = 0; i < 150; i++) {
      var a = Math.random() * Math.PI * 2, sp = 4 + Math.random() * 11, coin = i % 3 === 0;
      parts.push({ x: w / 2, y: h * 0.42, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 5, r: coin ? 5 + Math.random() * 4 : 3 + Math.random() * 4,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, coin: coin, col: cols[i % cols.length] });
    }
    var t0 = Date.now();
    (function frame() {
      var t = Date.now() - t0; if (t > 2700) return;
      c.clearRect(0, 0, w, h);
      parts.forEach(function (p) {
        p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.globalAlpha = Math.max(0, 1 - t / 2700);
        if (p.coin) { c.scale(Math.abs(Math.cos(p.rot * 2)) + 0.15, 1); c.fillStyle = '#fbbf24'; c.beginPath(); c.arc(0, 0, p.r, 0, 7); c.fill(); c.fillStyle = '#fde68a'; c.beginPath(); c.arc(-p.r * 0.25, -p.r * 0.25, p.r * 0.45, 0, 7); c.fill(); }
        else { c.fillStyle = p.col; c.fillRect(-p.r, -p.r / 2.5, p.r * 2, p.r / 1.25); }
        c.restore();
      });
      requestAnimationFrame(frame);
    })();
  }
