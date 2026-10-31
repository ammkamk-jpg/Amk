  // ---------- mascot: an animated character that idles on the running screen and reacts ----------
  // Her animations come from the separate "TangaTolga Mascot" pack script (tangatolga-mascot.user.js,
  // installed once): full-resolution transparent animated WebPs + mp3 voice clips, set as
  // window.__ttMascot. Keeping them out of the bot keeps its updates small.
  var MASCOT_SIZES = [['S', 200], ['M', 260], ['L', 320], ['XL', 400]];
  function mascotPack() { var p = window.__ttMascot; return p && p.idle ? p : null; }
  var mascotVoices = {}, mascotTimer = null, mascotN = 0, mascotBroken = false;
  function mascotOn() { return !!(cfg.mascot && mascotPack() && !mascotBroken); }
  // A unique #fragment makes the browser start a play-once animation from its first frame again.
  function mascotSrc(kind) { return mascotPack()[kind] + '#' + (++mascotN); }
  function mascotIdleHTML() { return mascotOn() ? '<div class="tt-mascot"><img alt="" src="' + mascotPack().idle + '"></div>' : '<div class="radar"></div>'; }

  function mascotVoice(kind) {
    var b64 = mascotPack() && mascotPack()[kind + 'Mp3'];
    if (!cfg.mascotVoice || !b64 || !audioCtx) return;
    var play = function (buf) { try { var s = audioCtx.createBufferSource(), g = audioCtx.createGain(); g.gain.value = .9; s.buffer = buf; s.connect(g); g.connect(audioCtx.destination); s.start(); } catch (e) {} };
    if (mascotVoices[kind]) return play(mascotVoices[kind]);
    try {
      var bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      audioCtx.decodeAudioData(bytes.buffer, function (buf) { mascotVoices[kind] = buf; play(buf); }, function () {});
    } catch (e) {}
  }

  // kind 'win' (after a snipe) or 'sad' (bot stopped): she pops up big with a speech bubble.
  function mascotReact(kind, line1, line2) {
    if (!mascotOn()) return;
    try {
      var el = document.getElementById('tt-react');
      if (!el) { el = document.createElement('div'); el.id = 'tt-react'; document.body.appendChild(el); }
      el.className = kind; el.innerHTML = '';
      var img = new Image(); img.alt = ''; img.onerror = function () { mascotBroken = true; el.className = ''; };
      img.src = mascotSrc(kind);
      var bub = document.createElement('div'); bub.className = 'tt-bubble';
      bub.innerHTML = '<b>' + esc(line1) + '</b>' + (line2 ? '<span>' + esc(line2) + '</span>' : '');
      el.appendChild(img); el.appendChild(bub);
      void el.offsetWidth; el.classList.add('show');
      mascotVoice(kind);
      clearTimeout(mascotTimer);
      mascotTimer = setTimeout(function () { el.classList.remove('show'); el.classList.add('out'); }, kind === 'win' ? 3100 : 2900);
    } catch (e) {}
  }
