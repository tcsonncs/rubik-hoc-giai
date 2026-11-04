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

  // ---- khối màu lạ: nhớ màu thật của 6 tâm để đổi sang màu trong app ----
  var REALKEY = 'rubik-realcolors', realColors = null;
  try { realColors = JSON.parse(localStorage.getItem(REALKEY) || 'null'); } catch (e) { realColors = null; }
  function renderReal() {
    Array.prototype.forEach.call($('palette').children, function (b) {
      var sw = b.querySelector('.sw'); if (!sw) return;
      var old = sw.querySelector('.real'); if (old) sw.removeChild(old);
      var k = b.dataset.k;
      if (realColors && k && realColors[k]) { var d = document.createElement('i'); d.className = 'real'; d.style.background = 'rgb(' + realColors[k].join(',') + ')'; sw.appendChild(d); }
    });
    ['realMap', 'gRealMap'].forEach(function (id) {
      var box = $(id); if (!box) return;
      box.innerHTML = '';
      box.hidden = !realColors;
      if (!realColors) return;
      var b = document.createElement('b'); b.textContent = 'Khối màu lạ: chấm màu thật của khối = màu trong app'; box.appendChild(b);
      var ul = document.createElement('ul');
      C.FACES.forEach(function (f) {
        var li = document.createElement('li');
        var dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = 'rgb(' + realColors[f].join(',') + ')';
        var tx = document.createElement('span'); tx.textContent = '= ' + C.COLOR_NAME[f];
        li.appendChild(dot); li.appendChild(tx); ul.appendChild(li);
      });
      box.appendChild(ul);
    });
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
  function paint(i) {
    if (view && view.isBusy()) return;
    if (!brush) { toast('Đang ở chế độ “Chỉ xem”. Chọn một màu ở bảng màu để tô.'); return; }
    if (i % 9 === 4) { toast('Ô tâm không đổi được: tâm của khối thật luôn đứng yên.'); return; }
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
      b.textContent = pr.text;
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
  renderReal();
  setMode('edit');

  window.RubikApp = {
    getState: function () { return state.slice(); },
    setState: function (st) { state = st.slice(); history = []; clearResult(); refreshAll(); },
    view: view, toast: toast, setMode: setMode, clearResult: clearResult, ring: showRing,
    setRealColors: function (m) {
      realColors = m || null;
      try { if (m) localStorage.setItem(REALKEY, JSON.stringify(m)); else localStorage.removeItem(REALKEY); } catch (e) { /* bỏ qua */ }
      renderReal();
    },
    goMove: function (m, ms) { return doMove(m, false, ms, true); },
    on: function (fn) { listeners.push(fn); }
  };

  // cho phép thử tự động
  window.__rubik = { get state() { return state; }, view: view, paint: paint, doMove: doMove, setBrush: function (b) { brush = b; refreshPalette(); } };
})();
