  // ---------- look: themes, your own wallpaper, falling petals ----------
  // Accent colours are CSS variables (see styles.js), so a theme switch recolours everything live.
  var THEMES = [
    { name: 'Classic', a1: '#22d3ee', a2: '#a78bfa', g1: '34,211,238', g2: '167,139,250', bg: '#06080d' },
    { name: 'Sakura', a1: '#ff7eb6', a2: '#c084fc', g1: '255,126,182', g2: '192,132,252', bg: '#0e0710' },
    { name: 'Neon', a1: '#f472b6', a2: '#22d3ee', g1: '244,114,182', g2: '34,211,238', bg: '#05040c' }
  ];
  var WALL_KEY = 'futSnipe.wall.v1', wallCache;
  function wallData() { if (wallCache === undefined) { try { wallCache = localStorage.getItem(WALL_KEY) || null; } catch (e) { wallCache = null; } } return wallCache; }

  function petalsHTML() {
    var h = '';
    for (var i = 0; i < 16; i++) {
      h += '<i class="tt-petal" style="left:' + rand(0, 98) + '%;--s:' + rand(9, 17) + 'px;--d:' + rand(9, 17) + 's;--w:-' + rand(0, 16) + 's"></i>';
    }
    return h;
  }
  function lookLayers() { return '<div class="tt-bg tt-wall"></div><div class="tt-bg tt-petals">' + petalsHTML() + '</div>'; }

  function applyLook() {
    var t = THEMES[cfg.theme | 0] || THEMES[0], st = document.getElementById('tt-theme');
    if (!st) { st = document.createElement('style'); st.id = 'tt-theme'; document.head.appendChild(st); }
    st.textContent = ':root{--tt-a1:' + t.a1 + ';--tt-a2:' + t.a2 + ';--tt-g1:' + t.g1 + ';--tt-g2:' + t.g2 + ';--tt-bg:' + t.bg +
      ';--tt-dim:' + (cfg.wallDim / 100) + ';--tt-blur:' + cfg.wallBlur + 'px;--tt-ms:' + cfg.mascotSize + 'px}';
    // running screen: the mascot instead of the radar (or back), when the switch changes
    var spot = document.querySelector('#fs-lock .radar, #fs-lock .tt-mascot');
    if (spot && spot.classList.contains('tt-mascot') !== mascotOn()) spot.outerHTML = mascotIdleHTML();
    var wall = wallData();
    ['fs-panel', 'fs-lock'].forEach(function (id) {
      var host = document.getElementById(id); if (!host) return;
      var on = !!wall && (id === 'fs-panel' || !!cfg.wallRun);
      host.classList.toggle('has-wall', on);
      var w = host.querySelector('.tt-wall'), img = on ? 'url("' + wall + '")' : '';
      if (w && w.__img !== img) { w.__img = img; w.style.backgroundImage = img; }
      var p = host.querySelector('.tt-petals'); if (p) p.style.display = cfg.petals ? '' : 'none';
    });
  }

  // Your picture from the phone, scaled to max 1400 px and saved as a JPEG (fits browser storage).
  function pickWallpaper(file) {
    if (!file || !/^image\//.test(file.type)) return;
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var k = Math.min(1, 1400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      var data = c.toDataURL('image/jpeg', 0.82);
      try { localStorage.setItem(WALL_KEY, data); wallCache = data; log('wallpaper set'); }
      catch (e) { wallCache = data; log('wallpaper too big to remember - it stays until you reload'); }
      applyLook(); render();
    };
    img.onerror = function () { URL.revokeObjectURL(url); log('could not open that picture'); render(); };
    img.src = url;
  }
  function removeWallpaper() { try { localStorage.removeItem(WALL_KEY); } catch (e) {} wallCache = null; applyLook(); render(); }
