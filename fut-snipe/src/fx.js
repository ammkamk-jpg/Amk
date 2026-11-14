  // ---------- snipe celebration: animation, vibration, sound ----------
  // Sounds are synthesised with WebAudio (no files). iOS only allows audio after a tap, so the
  // audio context is unlocked when you tap Start (or a sound button in settings).
  var SOUNDS = [['Off', 0], ['Chime', 1], ['Coins', 2], ['Pop', 3]];
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
      if (kind === 1) { tone('sine', 1319, 1319, 0, 0.5, 0.18); tone('sine', 1976, 1976, 0.09, 0.6, 0.12); }
      else if (kind === 2) { tone('square', 988, 988, 0, 0.09, 0.08); tone('square', 1319, 1319, 0.08, 0.38, 0.08); }
      else if (kind === 3) { tone('sine', 660, 1320, 0, 0.12, 0.2); }
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

  // A purchase banner like an iOS notification: green tick, player, price and profit.
  function celebrate(name, price, profit) {
    if (cfg.vibrate) vibrate();
    playSound(cfg.sound | 0);
    try {
      var old = document.getElementById('fs-toast'); if (old && old.parentNode) old.parentNode.removeChild(old);
      var t = document.createElement('div'); t.id = 'fs-toast';
      t.innerHTML = '<div class="ic">✓</div><div class="tx"><b>Bought ' + esc(name) + '</b><span>' + fmt(price) + ' coins' + (profit != null ? ' · +' + fmt(profit) + ' profit' : '') + '</span></div>';
      document.body.appendChild(t);
      requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add('in'); }); });
      setTimeout(function () { t.classList.remove('in'); }, 2600);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 3200);
    } catch (e) {}
  }
