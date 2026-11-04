/* scan.js - quét 6 mặt khối Rubik bằng camera (hoặc ảnh có sẵn), đọc màu bằng vision.js, đưa kết quả vào màn tô màu.
   Ảnh chỉ xử lý trong máy, không lưu, không gửi đi đâu. */
(function () {
  'use strict';
  var A = window.RubikApp, C = window.Cube, V = window.Vision, L = window.Lessons, St = window.Store;
  var $ = function (id) { return document.getElementById(id); };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  // thứ tự quét: bốn mặt bên (xoay khối sang trái), rồi mặt trên, mặt dưới
  var ORDER = ['F', 'R', 'B', 'L', 'U', 'D'];
  var STEPS = {
    F: { name: 'xanh lá', text: 'Cầm khối cho tâm xanh lá hướng về camera, mặt vàng ở phía trên.' },
    R: { name: 'cam', text: 'Xoay khối sang trái một phần tư vòng: tâm cam hướng về camera, mặt vàng vẫn ở phía trên.' },
    B: { name: 'xanh dương', text: 'Xoay tiếp sang trái một phần tư vòng: tâm xanh dương hướng về camera, mặt vàng vẫn ở phía trên.' },
    L: { name: 'đỏ', text: 'Xoay tiếp sang trái một phần tư vòng: tâm đỏ hướng về camera, mặt vàng vẫn ở phía trên.' },
    U: { name: 'vàng', text: 'Xoay tiếp sang trái cho xanh lá ra trước, rồi ngả đỉnh khối về phía camera: tâm vàng hướng camera, mặt xanh dương nằm ở phía trên hình.' },
    D: { name: 'trắng', text: 'Đưa khối về tư thế đầu (xanh lá ở trước), rồi ngả đáy khối về phía camera: tâm trắng hướng camera, mặt xanh lá nằm ở phía trên hình.' }
  };
  // khối màu lạ: không biết tên màu, gọi theo thứ tự quét
  var STEPS_ODD = {
    F: 'Cầm khối cho một mặt BẤT KỲ hướng về camera (mặt này là mặt 1), và một mặt khác ở phía trên. Giữ nguyên cách cầm này cho cả khối.',
    R: 'Xoay khối sang trái một phần tư vòng: mặt mới hướng về camera, mặt trên vẫn ở phía trên.',
    B: 'Xoay tiếp sang trái một phần tư vòng: mặt mới hướng về camera, mặt trên vẫn ở phía trên.',
    L: 'Xoay tiếp sang trái một phần tư vòng: mặt mới hướng về camera, mặt trên vẫn ở phía trên.',
    U: 'Xoay tiếp sang trái cho mặt 1 ra trước, rồi ngả đỉnh khối về phía camera: mặt trên hướng camera, mặt 3 nằm ở phía trên hình.',
    D: 'Đưa khối về tư thế đầu (mặt 1 ở trước), rồi ngả đáy khối về phía camera: mặt dưới hướng camera, mặt 1 nằm ở phía trên hình.'
  };
  var NAMES = { U: 'vàng', R: 'cam', F: 'xanh lá', D: 'trắng', L: 'đỏ', B: 'xanh dương' };
  var CSSCOL = { U: 'var(--U)', R: 'var(--R)', F: 'var(--F)', D: 'var(--D)', L: 'var(--L)', B: 'var(--B)' };

  var S = null;           // { step, samples, raw, stream, timer, hist, cool, photo }
  var work = document.createElement('canvas');
  var audio = null;

  // ---------- lấy mẫu màu ----------
  function median(a) { a.sort(function (x, y) { return x - y; }); return a[a.length >> 1]; }
  function medianRGB(data) {
    var r = [], g = [], b = [];
    for (var i = 0; i < data.length; i += 4) { r.push(data[i]); g.push(data[i + 1]); b.push(data[i + 2]); }
    return [median(r), median(g), median(b)];
  }
  // 9 ô từ khung video: vuông giữa, lưới chiếm 78%
  function sampleVideo(v) {
    var vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return null;
    var s = Math.min(vw, vh), side = 0.78 * s, x0 = (vw - side) / 2, y0 = (vh - side) / 2;
    work.width = 150; work.height = 150;
    var ctx = work.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, x0, y0, side, side, 0, 0, 150, 150);
    var out = [];
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
      out.push(medianRGB(ctx.getImageData(c * 50 + 16, r * 50 + 16, 18, 18).data));
    }
    return out;
  }

  // ---------- giao diện ----------
  function renderDots() {
    var ol = $('sDots'); ol.innerHTML = '';
    ORDER.forEach(function (f, i) {
      var li = el('li', i < S.step ? 'done' : i === S.step ? 'now' : '', String(i + 1));
      li.title = 'Mặt tâm ' + NAMES[f];
      ol.appendChild(li);
    });
  }
  function renderDone() {
    var box = $('sDone'); box.innerHTML = '';
    ORDER.forEach(function (f, i) {
      var m = el('div', 'mini' + (S.samples[f] ? '' : ' empty'));
      for (var k = 0; k < 9; k++) {
        var c = el('i');
        var rgb = S.samples[f] && S.samples[f][k];
        c.style.background = rgb ? 'rgb(' + rgb.map(Math.round).join(',') + ')' : 'var(--btn)';
        m.appendChild(c);
      }
      if (i === S.step) m.style.borderColor = 'var(--accent)';
      box.appendChild(m);
    });
  }
  function renderStep() {
    var f = ORDER[S.step];
    renderDots(); renderDone();
    $('sTitle').textContent = S.odd ? 'Mặt ' + (S.step + 1) + '/6 (khối màu lạ)' : 'Mặt ' + (S.step + 1) + '/6 · tâm ' + NAMES[f].toUpperCase();
    $('sText').textContent = S.odd ? STEPS_ODD[f] : STEPS[f].text;
    $('sOdd').textContent = S.odd ? '🎨 Khối màu lạ: BẬT (bấm “Chụp ngay” cho từng mặt)' : '🎨 Khối màu lạ: tắt';
    $('sOdd').disabled = S.step > 0;
    $('sBar').style.width = '0%';
    $('sRedo').disabled = S.step === 0;
    S.hist = []; S.cool = performance.now() + 900;
    if (St.get().voice) L.speak('Mặt ' + (S.step + 1) + ' trên 6. ' + (S.odd ? STEPS_ODD[f] : STEPS[f].text));
  }
  function status(t) { $('sStatus').textContent = t; }

  function beep() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain();
      o.type = 'sine'; o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.12);
    } catch (e) { /* không có âm thanh thì thôi */ }
    try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(30); } catch (e2) { /* bỏ qua */ }
  }

  // ---------- chốt một mặt ----------
  function capture(rgb9) {
    if (!S) return;
    var f = ORDER[S.step];
    if (S.odd) {
      var lc = V.rgbToLab(rgb9[4]), dup = false;
      ORDER.forEach(function (g) { if (S.samples[g] && V.dist(lc, V.rgbToLab(S.samples[g][4])) < 14) dup = true; });
      if (dup) { status('Tâm mặt này gần giống màu tâm một mặt đã quét. Hãy đưa mặt khác vào khung (hoặc bấm “Chụp lại mặt trước”).'); return; }
    }
    S.samples[f] = rgb9;
    beep();
    S.step++;
    if (S.step >= ORDER.length) { finish(); return; }
    renderStep();
    status(S.odd ? 'Đã chụp mặt ' + S.step + '. Tiếp theo: mặt ' + (S.step + 1) + '.' : 'Đã chụp mặt ' + NAMES[f] + '. Tiếp theo: mặt ' + NAMES[ORDER[S.step]] + '.');
  }

  function finish() {
    var samples = S.samples;
    var res = V.readCube(samples);
    var odd = !!S.odd, real = null;
    if (odd) { real = {}; C.FACES.forEach(function (f) { real[f] = samples[f][4].map(Math.round); }); }
    stopScan(true);
    A.setRealColors(real);
    A.setState(res.state);
    A.setMode('edit');
    A.ring(res.low);
    var note = res.notes.indexOf('rot') >= 0 ? ' App đã tự xoay lại một số mặt cho khớp.' : '';
    if (res.notes.indexOf('swap') >= 0) note += ' App đã đổi chỗ hai ô nghi ngờ cho khớp.';
    if (res.valid) {
      A.toast((odd ? 'Khối màu lạ: xem bảng đổi màu (chấm màu thật = màu trong app). ' : '') + 'Đã đọc xong 6 mặt.' + note + (res.low.length ? ' Ô viền cam là ô chưa chắc: so với khối thật rồi chạm để sửa.' : ' So với khối thật rồi bấm “Hướng dẫn giải”.'));
    } else {
      A.toast('Đọc xong nhưng khối chưa hợp lệ.' + note + ' Xem chỗ báo lỗi bên dưới và chạm ô để sửa.');
      $('btnCheck').click();
    }
    window.__scanResult = res;
  }

  // ---------- vòng đọc camera ----------
  function tick() {
    if (!S || S.photo) return;
    var v = $('sVideo');
    var cells = sampleVideo(v);
    if (!cells) return;
    var f = ORDER[S.step], now = performance.now();
    if (S.odd) { status('Khối màu lạ: đưa mặt vào khung rồi bấm “📸 Chụp ngay”.'); $('sBar').style.width = '0%'; return; }
    var nom = V.nominal(cells[4]);
    if (now < S.cool) { $('sBar').style.width = '0%'; return; }
    if (nom === null) { status('Đưa khối vào giữa khung, cho tâm trùng ô giữa.'); S.hist = []; $('sBar').style.width = '0%'; return; }
    if (nom !== f) { status('Đang thấy mặt tâm ' + NAMES[nom] + '. Cần mặt tâm ' + NAMES[f] + '.'); S.hist = []; $('sBar').style.width = '0%'; return; }
    var labs = cells.map(V.rgbToLab);
    S.hist.push({ t: now, labs: labs, rgb: cells });
    while (S.hist.length && now - S.hist[0].t > 1000) S.hist.shift();
    var span = now - S.hist[0].t, steady = true;
    if (S.hist.length >= 4) {
      for (var k = 0; k < 9 && steady; k++) {
        var m = [0, 0, 0];
        S.hist.forEach(function (h) { m[0] += h.labs[k][0]; m[1] += h.labs[k][1]; m[2] += h.labs[k][2]; });
        m = m.map(function (x) { return x / S.hist.length; });
        S.hist.forEach(function (h) { if (V.dist(h.labs[k], m) > 12) steady = false; });
      }
      if (!steady) { S.hist = S.hist.slice(-1); $('sBar').style.width = '0%'; status('Giữ khối thật yên trong khung…'); return; }
    }
    $('sBar').style.width = Math.min(100, span / 9) + '%';
    status('Giữ yên…');
    if (span >= 900) {
      // lấy trung vị các khung gần nhất cho đỡ nhiễu
      var avg = [];
      for (var q = 0; q < 9; q++) avg.push([0, 1, 2].map(function (c) { return median(S.hist.map(function (h) { return h.rgb[q][c]; })); }));
      capture(avg);
    }
  }

  function showCameraUI(on) {
    $('sVideo').hidden = !on;
    $('sBox').classList.toggle('photo', !on);
  }

  async function startScan() {
    S = { step: 0, samples: {}, stream: null, timer: null, hist: [], cool: 0, photo: null, odd: false };
    A.setMode('scan');
    renderStep();
    status('Đang mở camera…');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no-api');
      var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (!S) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
      S.stream = stream;
      var v = $('sVideo');
      v.srcObject = stream; v.setAttribute('playsinline', ''); v.muted = true;
      await v.play();
      showCameraUI(true);
      status('Camera đã mở. Đưa khối vào khung.');
      S.timer = setInterval(tick, 120);
    } catch (e) {
      showCameraUI(false);
      status('Không mở được camera' + (e && e.name === 'NotAllowedError' ? ' (chưa cho phép). Vào Cài đặt → Safari → Camera, chọn “Cho phép”.' : '.') + ' Bạn vẫn có thể bấm “Chọn ảnh” để dùng ảnh chụp sẵn.');
    }
  }
  function stopScan(keepSamples) {
    if (!S) return;
    clearInterval(S.timer);
    if (S.stream) S.stream.getTracks().forEach(function (t) { t.stop(); });
    var v = $('sVideo'); v.srcObject = null;
    leavePhoto();
    if (!keepSamples) S = null; else S = null;
  }

  // ---------- đường ảnh có sẵn: kéo 4 góc ----------
  var photoQ = null, drag = -1;
  function leavePhoto() {
    if (S) S.photo = null;
    $('sPhoto').hidden = true; $('sOver').hidden = true; $('sPhotoBtns').hidden = true;
    $('sBox').classList.remove('photo');
    if (S && S.stream) showCameraUI(true);
  }
  function drawOver() {
    var cv = $('sOver'), ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.lineWidth = 3; ctx.strokeStyle = '#ff2fa8'; ctx.fillStyle = '#ff2fa8';
    ctx.beginPath(); photoQ.forEach(function (p, i) { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.closePath(); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,.9)';
    function pt(u, v) {
      var a = photoQ[0], b = photoQ[1], c = photoQ[2], d = photoQ[3];
      return { x: (1 - v) * ((1 - u) * a.x + u * b.x) + v * ((1 - u) * d.x + u * c.x), y: (1 - v) * ((1 - u) * a.y + u * b.y) + v * ((1 - u) * d.y + u * c.y) };
    }
    [1 / 3, 2 / 3].forEach(function (t) {
      var p1 = pt(t, 0), p2 = pt(t, 1), p3 = pt(0, t), p4 = pt(1, t);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.moveTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.stroke();
    });
    photoQ.forEach(function (p) { ctx.beginPath(); ctx.arc(p.x, p.y, 14, 0, 7); ctx.fill(); });
  }
  function useImage(img) {
    if (!S) return;
    S.photo = true;
    var N = 720, cv = $('sPhoto'), ov = $('sOver');
    cv.width = N; cv.height = N; ov.width = N; ov.height = N;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, N, N);
    var sc = Math.min(N / img.width, N / img.height), w = img.width * sc, h = img.height * sc;
    ctx.drawImage(img, (N - w) / 2, (N - h) / 2, w, h);
    var m = N * 0.2;
    photoQ = [{ x: m, y: m }, { x: N - m, y: m }, { x: N - m, y: N - m }, { x: m, y: N - m }];
    $('sVideo').hidden = true; cv.hidden = false; ov.hidden = false; $('sPhotoBtns').hidden = false;
    $('sBox').classList.add('photo');
    drawOver();
    status('Kéo bốn chấm hồng về bốn góc của mặt khối, rồi bấm “Dùng ảnh này”.');
  }
  function samplePhoto() {
    var cv = $('sPhoto'), ctx = cv.getContext('2d', { willReadFrequently: true });
    var a = photoQ[0], b = photoQ[1], c = photoQ[2], d = photoQ[3];
    function pt(u, v) { return { x: (1 - v) * ((1 - u) * a.x + u * b.x) + v * ((1 - u) * d.x + u * c.x), y: (1 - v) * ((1 - u) * a.y + u * b.y) + v * ((1 - u) * d.y + u * c.y) }; }
    var side = (Math.hypot(b.x - a.x, b.y - a.y) + Math.hypot(d.x - a.x, d.y - a.y)) / 2, r = Math.max(3, side / 3 * 0.18);
    var out = [];
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) {
      var p = pt((j + 0.5) / 3, (i + 0.5) / 3);
      var x = Math.max(0, Math.min(cv.width - 2 * r, p.x - r)), y = Math.max(0, Math.min(cv.height - 2 * r, p.y - r));
      out.push(medianRGB(ctx.getImageData(Math.round(x), Math.round(y), Math.round(2 * r), Math.round(2 * r)).data));
    }
    return out;
  }
  (function bindPhoto() {
    var ov = $('sOver');
    function pos(e) { var r = ov.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * ov.width, y: (e.clientY - r.top) / r.height * ov.height }; }
    ov.addEventListener('pointerdown', function (e) {
      if (!photoQ) return;
      ov.setPointerCapture(e.pointerId);
      var p = pos(e), best = -1, bd = 1e9;
      photoQ.forEach(function (q, i) { var dd = Math.hypot(q.x - p.x, q.y - p.y); if (dd < bd) { bd = dd; best = i; } });
      drag = bd < 90 ? best : -1;
    });
    ov.addEventListener('pointermove', function (e) { if (drag < 0) return; var p = pos(e); photoQ[drag] = { x: Math.max(0, Math.min(ov.width, p.x)), y: Math.max(0, Math.min(ov.height, p.y)) }; drawOver(); });
    ov.addEventListener('pointerup', function () { drag = -1; });
    ov.addEventListener('pointercancel', function () { drag = -1; });
  })();

  // ---------- nút ----------
  $('btnScan').addEventListener('click', startScan);
  $('sExit').addEventListener('click', function () { stopScan(false); A.setMode('edit'); });
  $('sShot').addEventListener('click', function () {
    if (!S) return;
    if (S.photo) { capture(samplePhoto()); leavePhoto(); return; }
    var cells = sampleVideo($('sVideo'));
    if (!cells) { status('Chưa có hình từ camera. Hãy chờ camera mở hoặc bấm “Chọn ảnh”.'); return; }
    capture(cells);
  });
  $('sRedo').addEventListener('click', function () {
    if (!S || S.step === 0) return;
    S.step--; delete S.samples[ORDER[S.step]];
    renderStep(); status(S.odd ? 'Quét lại mặt ' + (S.step + 1) + '.' : 'Quét lại mặt tâm ' + NAMES[ORDER[S.step]] + '.');
  });
  $('sOdd').addEventListener('click', function () { if (!S || S.step > 0) return; S.odd = !S.odd; renderStep(); status(S.odd ? 'Khối màu lạ: bật.' : 'Khối màu lạ: tắt.'); });
  $('sPick').addEventListener('click', function () { $('sFile').value = ''; $('sFile').click(); });
  $('sFile').addEventListener('change', function () {
    var f = $('sFile').files && $('sFile').files[0];
    if (!f || !S) return;
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); useImage(img); };
    img.onerror = function () { URL.revokeObjectURL(url); status('Không đọc được ảnh này.'); };
    img.src = url;
  });
  $('sUse').addEventListener('click', function () { if (S && S.photo) { capture(samplePhoto()); leavePhoto(); } });
  $('sCancel').addEventListener('click', function () { leavePhoto(); status('Đã bỏ ảnh.'); });

  window.__scan = { get S() { return S; }, useImage: useImage, capture: capture, sampleVideo: sampleVideo };
})();
