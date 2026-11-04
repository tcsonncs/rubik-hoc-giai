/* learn.js - màn hướng dẫn giải từng bước, luyện tập có đồng hồ và sao, đố nhanh nhận ra tình huống. */
(function () {
  'use strict';
  var A = window.RubikApp, C = window.Cube, S = window.Solver, L = window.Lessons, St = window.Store;
  var view = A.view;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  function fmt(ms) {
    var t = Math.floor(ms / 100) / 10, m = Math.floor(t / 60), s = (t - m * 60).toFixed(1);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  var opt = St.get();

  /* ===================== HƯỚNG DẪN GIẢI ===================== */
  var G = null;

  function startGuide() {
    var st = A.getState();
    if (!C.validate(st).ok) { A.toast('Khối chưa hợp lệ. Bấm “Kiểm tra” để xem chỗ sai.'); $('btnCheck').click(); return; }
    if (C.isSolved(st)) { A.toast('Khối đã giải xong rồi. Hãy đảo khối hoặc tô lại khối đang cầm.'); return; }
    var res = S.solve(st);
    if (!res.ok) { A.toast(res.error); return; }
    var flat = [], states = [st], cur = st;
    res.stages.forEach(function (sg, si) {
      sg.steps.forEach(function (sp, ti) {
        sp.moves.forEach(function (m, mi) { flat.push({ si: si, ti: ti, mi: mi, move: m }); cur = C.applyMove(cur, m); states.push(cur); });
      });
    });
    G = { res: res, flat: flat, i: 0, auto: false, timer: null, busy: false, token: 0 };
    A.setMode('guide');
    renderGuide(true);
  }

  function stopAuto() {
    if (G) { G.auto = false; clearTimeout(G.timer); }
    $('gAuto').textContent = '▶ Tự chạy';
  }
  function leaveGuide() { stopAuto(); L.stopSpeak(); G = null; A.setMode('edit'); }

  function renderProgress(si) {
    var ol = $('gProg');
    ol.innerHTML = '';
    G.res.stages.forEach(function (sg, k) {
      var li = el('li', k < si || (si < 0 && true) ? 'done' : k === si ? 'now' : '', String(k + 1));
      if (sg.steps.length === 0 && k >= (si < 0 ? 0 : si)) li.className = 'skip';
      li.title = sg.name;
      ol.appendChild(li);
    });
  }

  function renderGuide(speak) {
    var total = G.flat.length;
    $('gWhy').hidden = true;
    $('gPrev').disabled = G.i === 0;
    if (G.i >= total) {
      renderProgress(-1);
      $('gStage').textContent = '🎉 Xong rồi!';
      $('gGoal').textContent = '';
      $('gMove').innerHTML = '';
      $('gText').textContent = 'Khối đã được giải xong. Bấm “Thoát” rồi “Đảo ngẫu nhiên” để thử lại, hoặc vào “Luyện tập”.';
      $('gSeq').innerHTML = '';
      $('btnWhy').hidden = true;
      $('gNext').textContent = 'Xong ✔'; $('gNext').disabled = true; $('gAuto').disabled = true;
      view.clearArrow(); view.highlight([]);
      stopAuto();
      if (opt.voice && speak) L.speak('Khối đã được giải xong. Giỏi lắm!');
      return;
    }
    var it = G.flat[G.i], sg = G.res.stages[it.si], sp = sg.steps[it.ti], d = L.describeMove(it.move);
    renderProgress(it.si);
    $('btnWhy').hidden = false;
    $('gNext').textContent = 'Tiếp ▶'; $('gNext').disabled = false; $('gAuto').disabled = false;
    $('gStage').textContent = 'Giai đoạn ' + sg.id + '/7 · ' + sg.name;
    $('gGoal').textContent = (it.ti === 0 && it.mi === 0 ? sg.intro + ' ' : '') + 'Đích: ' + sg.goal;
    var bm = $('gMove');
    bm.innerHTML = '';
    bm.appendChild(el('span', 'sym ' + d.kind, d.sym));
    bm.appendChild(el('span', 'dsc', d.text));
    $('gText').textContent = sp.text.replace(/'/g, '′') + '  (bước ' + (it.ti + 1) + '/' + sg.steps.length + ')';
    var seq = $('gSeq');
    seq.innerHTML = '';
    sp.moves.forEach(function (m, k) { seq.appendChild(el('span', k < it.mi ? 'done' : k === it.mi ? 'cur' : '', m.replace("'", '′'))); });
    $('gWhy').textContent = sp.why;
    var face = it.move[0], tk = ++G.token;
    view.highlight(L.layerCells(face), 'guide');
    view.showFace(face, opt.anim ? 380 : 0).then(function () { if (G && tk === G.token) view.showArrow(it.move); });
    view.showArrow(it.move);
    if (opt.voice && speak) L.speak((it.mi === 0 ? sp.text + ' ' : '') + d.speak);
  }

  function stepGuide(dir) {
    if (!G || G.busy) return Promise.resolve();
    if (dir > 0 && G.i >= G.flat.length) return Promise.resolve();
    if (dir < 0 && G.i === 0) return Promise.resolve();
    G.busy = true;
    view.clearArrow(); view.highlight([]);
    var m = dir > 0 ? G.flat[G.i].move : C.invertMove(G.flat[G.i - 1].move);
    var ms = opt.anim ? 380 : 0;
    var p = A.goMove(m, ms);
    G.i += dir;
    return p.then(function () { if (!G) return; G.busy = false; renderGuide(true); });
  }

  function tick() {
    if (!G || !G.auto) return;
    if (G.i >= G.flat.length) { stopAuto(); return; }
    stepGuide(1).then(function () { if (G && G.auto) G.timer = setTimeout(tick, opt.voice ? 2200 : 650); });
  }

  $('btnGuide').addEventListener('click', startGuide);
  $('gNext').addEventListener('click', function () { stopAuto(); stepGuide(1); });
  $('gPrev').addEventListener('click', function () { stopAuto(); stepGuide(-1); });
  $('gAuto').addEventListener('click', function () {
    if (!G) return;
    if (G.auto) { stopAuto(); return; }
    G.auto = true; $('gAuto').textContent = '⏸ Dừng';
    tick();
  });
  $('btnWhy').addEventListener('click', function () { var w = $('gWhy'); w.hidden = !w.hidden; });
  $('gExit').addEventListener('click', leaveGuide);
  $('gLost').addEventListener('click', function () {
    leaveGuide();
    A.toast('Hãy tô lại khối con đang cầm cho giống thật, rồi bấm “Hướng dẫn giải” để tính lại từ chỗ này.');
  });
  function refreshToggles() {
    $('gVoice').textContent = opt.voice ? '🔊 Đọc to: bật' : '🔇 Đọc to: tắt';
    $('gAnim').textContent = opt.anim ? '🎬 Hoạt hình: bật' : '🎬 Hoạt hình: tắt';
  }
  $('gVoice').addEventListener('click', function () {
    St.setOpt('voice', !opt.voice); opt = St.get(); refreshToggles();
    if (opt.voice) { if (!L.speak('Đã bật đọc to.')) { A.toast('Máy này chưa có giọng tiếng Việt, nên không đọc to (tránh đọc nhầm tiếng Anh). iPhone và trình duyệt Edge thường có sẵn.'); St.setOpt('voice', false); opt = St.get(); refreshToggles(); } }
    else L.stopSpeak();
  });
  $('gAnim').addEventListener('click', function () { St.setOpt('anim', !opt.anim); opt = St.get(); refreshToggles(); });
  refreshToggles();

  /* ===================== LUYỆN TẬP ===================== */
  var P = null;

  function renderStars() {
    var ul = $('pStars');
    ul.innerHTML = '';
    S.STAGES.forEach(function (sg) {
      var n = opt.stars[sg.id] || 0;
      var li = el('li', n ? 'got' : '');
      li.appendChild(el('span', 'nm', sg.id + '. ' + sg.name));
      li.appendChild(el('span', 'st', '★'.repeat(n) + '☆'.repeat(3 - n)));
      ul.appendChild(li);
    });
    $('pBest').textContent = opt.best !== null ? 'Kỷ lục giải xong: ' + fmt(opt.best) + ' · đã giải ' + opt.solves + ' lần.' : 'Chưa có kỷ lục. Hãy giải xong một khối để ghi kỷ lục.';
  }
  function stopTimer() { if (P && P.timerId) { clearInterval(P.timerId); P.timerId = null; } }
  function startPractice() {
    A.setMode('practice');
    P = { running: false, timerId: null, t0: 0, hints: {}, awarded: {}, maxDone: 0, scrambling: false };
    $('pTimer').textContent = '0:00.0';
    $('pHintBox').hidden = true;
    opt = St.get(); renderStars();
    $('pInfo').textContent = 'Bấm “Đảo và bắt đầu”: khối được đảo, đồng hồ chạy, bạn giải bằng các nút quay bên dưới. Kẹt thì bấm “Gợi ý”.';
  }
  function leavePractice() { stopTimer(); P = null; A.setMode('edit'); }

  $('btnPractice').addEventListener('click', startPractice);
  $('pExit').addEventListener('click', leavePractice);
  $('pStart').addEventListener('click', function () {
    if (!P || P.scrambling || view.isBusy()) return;
    stopTimer(); P.running = false; P.scrambling = true; P.hints = {}; P.awarded = {};
    $('pHintBox').hidden = true; $('pTimer').textContent = '0:00.0';
    A.setState(C.solved());
    var seq = C.scramble(20);
    seq.reduce(function (p, m) { return p.then(function () { return A.goMove(m, 110); }); }, Promise.resolve()).then(function () {
      if (!P) return;
      P.scrambling = false; P.running = true; P.t0 = performance.now();
      P.maxDone = S.currentStage(A.getState()) - 1;
      P.timerId = setInterval(function () { $('pTimer').textContent = fmt(performance.now() - P.t0); }, 100);
      showPracticeInfo();
    });
  });
  function showPracticeInfo() {
    var k = S.currentStage(A.getState());
    $('pInfo').textContent = k > 7 ? 'Khối đã giải xong!' : 'Đang làm: giai đoạn ' + k + ' · ' + S.STAGES[k - 1].name + '. ' + S.STAGES[k - 1].goal;
  }
  $('pHint').addEventListener('click', function () {
    if (!P || !P.running) { A.toast('Hãy bấm “Đảo và bắt đầu” trước.'); return; }
    var st = A.getState(), k = S.currentStage(st);
    if (k > 7) return;
    var res = S.solve(st);
    if (!res.ok) { A.toast(res.error); return; }
    var sg = res.stages.filter(function (x) { return x.steps.length; })[0], sp = sg.steps[0];
    P.hints[k] = (P.hints[k] || 0) + 1;
    var box = $('pHintBox');
    box.hidden = false;
    box.textContent = '💡 ' + sp.text.replace(/'/g, '′') + '  Nước đầu tiên: ' + L.movesLabel([sp.moves[0]]) + '.';
    var face = sp.moves[0][0];
    view.highlight(L.layerCells(face), 'guide');
    view.showFace(face, 380);
    view.showArrow(sp.moves[0]);
  });
  A.on(function () {
    if (!P || !P.running) return;
    view.clearArrow(); view.highlight([]); $('pHintBox').hidden = true;
    var st = A.getState(), done = S.currentStage(st) - 1;
    for (var k = P.maxDone + 1; k <= done; k++) {
      if (P.awarded[k]) continue;
      P.awarded[k] = true;
      var h = P.hints[k] || 0, n = h === 0 ? 3 : h <= 2 ? 2 : 1;
      St.giveStars(k, n);
      if (k < 7) A.toast('Xong giai đoạn ' + k + ' (' + S.STAGES[k - 1].name + '): ' + '★'.repeat(n));
    }
    if (done > P.maxDone) P.maxDone = done;
    opt = St.get(); renderStars();
    if (done >= 7) {
      var ms = performance.now() - P.t0;
      P.running = false; stopTimer();
      $('pTimer').textContent = fmt(ms);
      var isBest = St.recordSolve(ms); opt = St.get(); renderStars();
      $('pInfo').textContent = '🎉 Giải xong trong ' + fmt(ms) + (isBest ? ' — kỷ lục mới!' : '.');
    } else showPracticeInfo();
  });

  /* ===================== ĐỐ NHANH ===================== */
  var Q = null;
  function newQuiz() {
    var want = L.SHAPE_KEYS[Math.floor(Math.random() * 4)];
    var q = L.makeQuiz(want);
    Q = { state: q.state, shape: q.shape, answered: false };
    var grid = $('qGrid'); grid.innerHTML = '';
    var edgeOn = {};
    L.yellowEdges(q.state).forEach(function (f) { edgeOn[f] = true; });
    // vị trí trong lưới 3x3 nhìn từ trên: hàng 0 là phía sau, hàng 2 là phía trước
    var cells = ['c', 'B', 'c', 'L', 'M', 'R', 'c', 'F', 'c'];
    cells.forEach(function (k) {
      var d = el('div', 'qc ' + (k === 'M' || edgeOn[k] ? 'y' : 'g'));
      grid.appendChild(d);
    });
    var opts = $('qOpts'); opts.innerHTML = '';
    L.SHAPE_KEYS.forEach(function (key) {
      var b = el('button', '', L.SHAPES[key].name);
      b.type = 'button';
      b.addEventListener('click', function () { answer(key); });
      opts.appendChild(b);
    });
    $('qRes').innerHTML = '';
    $('qNext').hidden = true;
    scoreLine();
  }
  function scoreLine() { opt = St.get(); $('qScore').textContent = opt.quizAll ? 'Tổng cộng đúng ' + opt.quizOk + '/' + opt.quizAll + ' câu.' : ''; }
  function answer(key) {
    if (!Q || Q.answered) return;
    Q.answered = true;
    var ok = key === Q.shape, sh = L.SHAPES[Q.shape];
    St.recordQuiz(ok);
    var r = $('qRes'); r.innerHTML = '';
    var box = el('div', ok ? 'ok' : 'bad2', (ok ? '✔ Đúng rồi! ' : '✘ Chưa đúng. Đây là: ' + sh.name + '. ') + sh.how + ' ' + sh.todo);
    r.appendChild(box);
    Array.prototype.forEach.call($('qOpts').children, function (b) { b.disabled = true; });
    $('qNext').hidden = false;
    scoreLine();
  }
  $('btnQuiz').addEventListener('click', function () { A.setMode('quiz'); newQuiz(); });
  $('qNext').addEventListener('click', newQuiz);
  $('qExit').addEventListener('click', function () { Q = null; A.setMode('edit'); });

  /* ===================== SAO LƯU ===================== */
  $('btnBackup').addEventListener('click', function () {
    try {
      var blob = new Blob([St.exportJSON()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'rubik-sao-ky-luc.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      A.toast('Đã tạo tệp rubik-sao-ky-luc.json.');
    } catch (e) { A.toast('Máy này không tạo được tệp sao lưu.'); }
  });

  window.__learn = { get G() { return G; }, get P() { return P; }, get Q() { return Q; } };
})();
