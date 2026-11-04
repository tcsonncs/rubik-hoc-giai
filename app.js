/* app.js - giao diện: nhập màu 54 ô, quay 18 nước, kiểm tra khối. Dữ liệu chỉ ở localStorage.
   Màn hướng dẫn, luyện tập, đố nhanh nằm ở learn.js, nói chuyện với app qua window.RubikApp. */
(function () {
  'use strict';
  var C = window.Cube;
  var $ = function (id) { return document.getElementById(id); };
  var CSSVAR = { U: 'var(--U)', R: 'var(--R)', F: 'var(--F)', D: 'var(--D)', L: 'var(--L)', B: 'var(--B)', '.': 'var(--blank)' };
  var STORE = 'rubik.gd1.state', THEME = 'rubik.theme';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } }

  var state = C.solved(), history = [], brush = null, view = null, netCells = [], toastTimer = null, listeners = [];

  // đọc lại khối đã lưu
  (function () {
    var raw = lsGet(STORE);
    if (!raw) return;
    try {
      var s = JSON.parse(raw);
      if (Array.isArray(s) && s.length === 54 && s.every(function (c) { return 'URFDLB.'.indexOf(c) >= 0 && c.length === 1; })) state = s;
    } catch (e) { /* khối hỏng thì dùng khối nguyên */ }
  })();

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  // ---- giao diện sáng / tối ----
  function applyTheme(t) { if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme'); }
  applyTheme(lsGet(THEME));
  $('btnTheme').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next); lsSet(THEME, next);
  });

  // ---- hình trải ra ----
  var OFFS = { U: [0, 3], L: [3, 0], F: [3, 3], R: [3, 6], B: [3, 9], D: [6, 3] };
  (function buildNet() {
    var grid = [];
    for (var r = 0; r < 9; r++) { grid.push([]); for (var c = 0; c < 12; c++) grid[r].push(-1); }
    C.FACES.forEach(function (f, fi) {
      for (var k = 0; k < 9; k++) grid[OFFS[f][0] + Math.floor(k / 3)][OFFS[f][1] + k % 3] = fi * 9 + k;
    });
    var net = $('net');
    for (var rr = 0; rr < 9; rr++) for (var cc = 0; cc < 12; cc++) {
      var idx = grid[rr][cc];
      if (idx < 0) { var g = document.createElement('div'); g.className = 'gap'; net.appendChild(g); continue; }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'c'; b.dataset.i = idx;
      b.setAttribute('aria-label', C.cellLabel(idx));
      if (idx % 9 === 4) b.textContent = '•';
      b.addEventListener('click', function (e) { paint(+e.currentTarget.dataset.i); });
      net.appendChild(b); netCells[idx] = b;
    }
  })();

  // ---- bảng màu ----
  function buildPalette() {
    var p = $('palette');
    var items = [{ k: null, name: 'Chỉ xem' }].concat(C.FACES.map(function (f) { return { k: f, name: C.COLOR_NAME[f][0].toUpperCase() + C.COLOR_NAME[f].slice(1) }; }));
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.k = it.k || '';
      b.setAttribute('aria-checked', it.k === brush ? 'true' : 'false');
      b.innerHTML = '<span class="sw" style="background:' + (it.k ? CSSVAR[it.k] : 'transparent') + '">' + (it.k ? '' : '✋') + '</span><span>' + it.name + '</span>' + (it.k ? '<span class="cnt" data-c="' + it.k + '"></span>' : '');
      b.addEventListener('click', function () { brush = it.k; refreshPalette(); });
      p.appendChild(b);
    });
  }
  function refreshPalette() {
    var counts = {};
    state.forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
    Array.prototype.forEach.call($('palette').children, function (b) {
      b.setAttribute('aria-checked', (b.dataset.k || null) === brush ? 'true' : 'false');
      var cnt = b.querySelector('.cnt');
      if (cnt) { var n = counts[b.dataset.k] || 0; cnt.textContent = n + '/9'; cnt.classList.toggle('bad', n !== 9); }
    });
  }
  buildPalette();

  // ---- màu riêng của khối: app dùng đúng 6 màu và tên của khối đang cầm ----
  var REALKEY = 'rubik-realcolors', NAMEKEY = 'rubik-realnames', realColors = null, realNames = null;
  try { realColors = JSON.parse(localStorage.getItem(REALKEY) || 'null'); realNames = JSON.parse(localStorage.getItem(NAMEKEY) || 'null'); } catch (e) { realColors = null; realNames = null; }
  function toHex(rgb) { return '#' + rgb.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function fromHex(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
  // đoán tên tiếng Việt của một màu
  function guessName(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    var sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), h = 0;
    if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
    if (l < 0.16) return 'đen';
    if (sat < 0.2) return l > 0.78 ? 'trắng' : l > 0.45 ? 'bạc' : 'xám';
    if (h < 15 || h >= 345) return l < 0.3 ? 'nâu' : 'đỏ';
    if (h < 40) return l < 0.42 ? 'nâu' : 'cam';
    if (h < 70) return 'vàng';
    if (h < 165) return 'xanh lá';
    if (h < 200) return l > 0.58 ? 'xanh nhạt' : 'xanh ngọc';
    if (h < 250) return l > 0.58 ? 'xanh nhạt' : l < 0.3 ? 'xanh đậm' : 'xanh dương';
    if (h < 290) return 'tím';
    return 'hồng';
  }
  function autoNames(m) {
    var out = {}, used = {};
    C.FACES.forEach(function (f) {
      var n = guessName(m[f]), k = 2, base = n;
      while (used[n]) { n = base + ' ' + k; k++; }
      used[n] = 1; out[f] = n;
    });
    return out;
  }
  function saveReal() {
    try {
      if (realColors) { localStorage.setItem(REALKEY, JSON.stringify(realColors)); localStorage.setItem(NAMEKEY, JSON.stringify(realNames)); }
      else { localStorage.removeItem(REALKEY); localStorage.removeItem(NAMEKEY); }
    } catch (e) { /* bỏ qua */ }
  }
  var DEFHEX = { U: '#ffd500', R: '#ff6a00', F: '#00a651', D: '#f4f4f4', L: '#d7263d', B: '#1f5fd6' };
  var TRKEEP = null;
  function translateStatic() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-tr]'), function (el) {
      if (el.dataset.orig === undefined) el.dataset.orig = el.innerHTML;
      el.innerHTML = C.tr(el.dataset.orig);
    });
  }
  function applyColors() {
    var root = document.documentElement.style;
    C.FACES.forEach(function (f) {
      if (realColors) root.setProperty('--' + f, 'rgb(' + realColors[f].map(Math.round).join(',') + ')'); else root.removeProperty('--' + f);
      window.View3D.COLORS[f] = parseInt((realColors ? toHex(realColors[f]) : DEFHEX[f]).slice(1), 16);
    });
    C.setCustomNames(realColors ? realNames : null);
    Array.prototype.forEach.call($('palette').children, function (b) {
      var k = b.dataset.k; if (!k) return;
      var nm = b.children[1]; if (nm) { var t = C.cname(k); nm.textContent = t.charAt(0).toUpperCase() + t.slice(1); }
    });
    translateStatic();
    renderReal();
    if (view) view.setState(state);
    renderNet();
  }
  function renderReal() {
    var box = $('realMap'), g = $('gRealMap');
    if (g) {
      g.innerHTML = ''; g.hidden = !realColors;
      if (realColors) {
        var b0 = document.createElement('b'); b0.textContent = 'Màu của khối này'; g.appendChild(b0);
        var ul0 = document.createElement('ul');
        C.FACES.forEach(function (f) {
          var li = document.createElement('li');
          var dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = 'rgb(' + realColors[f].map(Math.round).join(',') + ')';
          var tx = document.createElement('span'); tx.textContent = C.cname(f) + ' (' + C.FACE_NAME[f] + ')';
          li.appendChild(dot); li.appendChild(tx); ul0.appendChild(li);
        });
        g.appendChild(ul0);
      }
    }
    if (!box) return;
    var wasOpen = box.open;
    box.innerHTML = '';
    var sm = document.createElement('summary'); sm.textContent = realColors ? '🎨 Màu của khối này (đang dùng màu riêng)' : '🎨 Chỉnh màu cho đúng khối của em'; box.appendChild(sm);
    var hint = document.createElement('p'); hint.className = 'hint small';
    hint.textContent = 'Mỗi dòng là một màu của khối thật. Chạm ô màu để chọn lại màu, gõ tên màu theo cách em gọi. Mọi chỗ trong app sẽ dùng đúng màu và tên này.';
    box.appendChild(hint);
    var ul = document.createElement('ul'); ul.className = 'edlist';
    C.FACES.forEach(function (f) {
      var li = document.createElement('li');
      var pick = document.createElement('input'); pick.type = 'color'; pick.value = realColors ? toHex(realColors[f]) : DEFHEX[f];
      pick.setAttribute('aria-label', 'Màu của ' + C.FACE_NAME[f]);
      var nm = document.createElement('input'); nm.type = 'text'; nm.maxLength = 14; nm.value = C.cname(f);
      nm.setAttribute('aria-label', 'Tên màu của ' + C.FACE_NAME[f]);
      var lb = document.createElement('small'); lb.textContent = C.FACE_NAME[f] + (f === 'D' ? ' (đặt ở dưới)' : f === 'F' ? ' (đặt ở trước)' : '');
      function commit() {
        if (!realColors) { realColors = {}; realNames = {}; C.FACES.forEach(function (g2) { realColors[g2] = fromHex(DEFHEX[g2]); realNames[g2] = C.COLOR_NAME[g2]; }); }
        realColors[f] = fromHex(pick.value);
        var n = nm.value.trim(); if (n) realNames[f] = n.toLowerCase();
        saveReal(); applyColors(); $('realMap').open = true;
      }
      pick.addEventListener('change', commit); nm.addEventListener('change', commit);
      li.appendChild(pick); li.appendChild(nm); li.appendChild(lb); ul.appendChild(li);
    });
    box.appendChild(ul);
    var rs = document.createElement('button'); rs.type = 'button'; rs.className = 'ghost'; rs.textContent = '↺ Về màu chuẩn (trắng, vàng, xanh, đỏ…)';
    rs.addEventListener('click', function () { realColors = null; realNames = null; saveReal(); applyColors(); });
    box.appendChild(rs);
    box.open = wasOpen;
  }

  function renderNet() {
    for (var i = 0; i < 54; i++) netCells[i].style.background = CSSVAR[state[i]] || CSSVAR['.'];
  }
  function refreshAll() {
    renderNet(); refreshPalette();
    if (view) view.setState(state);
    lsSet(STORE, JSON.stringify(state));
  }
  function clearResult() { $('result').innerHTML = ''; showRing([]); }
  function showRing(cells) {
    var set = {};
    cells.forEach(function (c) { set[c] = true; });
    for (var i = 0; i < 54; i++) netCells[i].classList.toggle('ring', !!set[i]);
    if (view) view.highlight(cells);
  }

  // ---- tô màu ----
  var centerEdit = false;   // sau “Chỉ chụp, tôi tự sửa”: cho sửa cả ô tâm vì app có thể đọc sai tâm
  function paint(i) {
    if (view && view.isBusy()) return;
    if (!brush) { toast('Đang ở chế độ “Chỉ xem”. Chọn một màu ở bảng màu để tô.'); return; }
    if (i % 9 === 4 && !centerEdit) { toast('Ô tâm không đổi được: tâm của khối thật luôn đứng yên.'); return; }
    if (state[i] === brush) return;
    state = state.slice(); state[i] = brush;
    history = [];
    clearResult(); refreshAll();
  }

  // ---- quay khối ----
  (function buildMoves() {
    var box = $('moves');
    ['', "'", '2'].forEach(function (suf) {
      C.FACES.forEach(function (f) {
        var m = f + suf, b = document.createElement('button');
        b.type = 'button'; b.textContent = m; b.dataset.m = m;
        b.setAttribute('aria-label', 'Quay ' + C.FACE_NAME[f] + (suf === "'" ? ' ngược chiều kim đồng hồ' : suf === '2' ? ' nửa vòng' : ' theo chiều kim đồng hồ'));
        b.addEventListener('click', function () { doMove(m, true); });
        box.appendChild(b);
      });
    });
  })();

  function doMove(m, record, ms, silent) {
    clearResult();
    var next = C.applyMove(state, m);
    state = next;
    if (record) history.push(m);
    lsSet(STORE, JSON.stringify(state));
    renderNet(); refreshPalette();
    var p = view.animate(m, ms === undefined ? 260 : ms, next);
    if (!silent) listeners.forEach(function (fn) { fn(m); });
    return p;
  }

  // ---- các màn: edit (tô màu), guide (hướng dẫn), practice (luyện tập), quiz (đố nhanh) ----
  function setMode(mode) {
    document.body.dataset.mode = mode;
    Array.prototype.forEach.call(document.querySelectorAll('[data-modes]'), function (el) {
      el.hidden = el.dataset.modes.split(',').indexOf(mode) < 0;
    });
    if (view) { view.clearArrow(); if (mode !== 'edit') showRing([]); requestAnimationFrame(function () { view.resize(); }); }
    window.scrollTo(0, 0);
  }

  $('btnUndo').addEventListener('click', function () {
    if (!history.length) { toast('Chưa có nước quay nào để quay lại.'); return; }
    var m = C.invertMove(history.pop());
    doMove(m, false);
  });
  $('btnScramble').addEventListener('click', function () {
    var seq = C.scramble(20);
    history = []; clearResult();
    seq.reduce(function (p, m) { return p.then(function () { return doMove(m, true, 110); }); }, Promise.resolve());
  });
  $('btnSolved').addEventListener('click', function () {
    if (view.isBusy()) return;
    state = C.solved(); history = []; clearResult(); refreshAll();
    toast('Đã đặt về khối nguyên.');
  });
  $('btnFront').addEventListener('click', function () { view.resetView(); });
  $('btnBottom').addEventListener('click', function () { view.bottomView(); });

  // ---- kiểm tra ----
  $('btnCheck').addEventListener('click', function () {
    var box = $('result');
    box.innerHTML = ''; showRing([]);
    var v = C.validate(state);
    if (v.ok) {
      var d = document.createElement('div');
      d.className = 'ok';
      d.textContent = C.isSolved(state) ? '✔ Khối này hợp lệ và đã được giải xong!' : '✔ Khối này hợp lệ: khối thật có thể ra như vậy và giải được.';
      box.appendChild(d);
      return;
    }
    v.problems.forEach(function (pr) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'bad';
      b.textContent = C.tr(pr.text);
      if (pr.cells.length) {
        var s = document.createElement('small'); s.textContent = '👆 Chạm để xem ô nghi ngờ'; b.appendChild(s);
        b.addEventListener('click', function () { showRing(pr.cells); });
      }
      box.appendChild(b);
    });
    var first = v.problems.filter(function (p) { return p.cells.length; })[0];
    if (first) showRing(first.cells);
  });

  // ---- khởi động ----
  view = window.View3D.create($('view'));
  view.onTap(paint);
  refreshAll();
  applyColors();
  setMode('edit');

  window.RubikApp = {
    getState: function () { return state.slice(); },
    setState: function (st) { state = st.slice(); history = []; clearResult(); refreshAll(); },
    view: view, toast: toast, setMode: setMode, clearResult: clearResult, ring: showRing,
    setCenterEdit: function (on) { centerEdit = !!on; },
    setRealColors: function (m) {
      realColors = m || null; realNames = m ? autoNames(m) : null;
      saveReal(); applyColors();
    },
    goMove: function (m, ms) { return doMove(m, false, ms, true); },
    on: function (fn) { listeners.push(fn); }
  };

  // cho phép thử tự động
  window.__rubik = { get state() { return state; }, view: view, paint: paint, doMove: doMove, setBrush: function (b) { brush = b; refreshPalette(); } };
})();
