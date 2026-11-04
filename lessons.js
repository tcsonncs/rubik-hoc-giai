/* lessons.js - lời giải thích tiếng Việt, mô tả nước quay, câu đố nhận ra tình huống, đọc to. */
(function (root) {
  'use strict';
  var C = root.Cube || require('./cube.js');

  var FACE_SHORT = { U: 'mặt trên (vàng)', R: 'mặt phải (cam)', F: 'mặt trước (xanh lá)', D: 'mặt dưới (trắng)', L: 'mặt trái (đỏ)', B: 'mặt sau (xanh dương)' };

  // { sym: "R ↻", kind: 'cw'|'ccw'|'half', text: 'Quay mặt phải (cam) …' }
  function describeMove(m) {
    var f = m[0], suf = m.slice(1);
    var sym = f + (suf === "'" ? '′ ↺' : suf === '2' ? '2 ↻↻' : ' ↻');
    var how = suf === "'" ? 'ngược chiều kim đồng hồ' : suf === '2' ? 'nửa vòng (quay hai lần)' : 'theo chiều kim đồng hồ';
    return {
      sym: sym,
      kind: suf === "'" ? 'ccw' : suf === '2' ? 'half' : 'cw',
      text: 'Quay ' + FACE_SHORT[f] + ' ' + how + ' khi nhìn thẳng vào mặt đó.',
      speak: 'Quay ' + FACE_SHORT[f].replace(/ \(.*\)/, '') + ' ' + how + '.'
    };
  }
  function movesLabel(list) { return list.map(function (m) { return m.replace("'", '′'); }).join(' '); }

  // các ô của lớp bị quay (mặt 9 ô + 12 ô cạnh bên), dùng để tô sáng
  function layerCells(face) {
    var n = C.NORMAL[face], out = [];
    for (var i = 0; i < 54; i++) {
      var p = C.POS[i];
      if (p[0] * n[0] + p[1] * n[1] + p[2] * n[2] === 1) out.push(i);
    }
    return out;
  }

  // ---------- đố nhanh: nhận ra hình vàng ----------
  var SHAPES = {
    dot:   { name: 'Chấm', how: 'Chỉ có một chấm vàng ở giữa.', todo: 'Làm F R U R′ U′ F′ một lần. Sau đó sẽ thành chữ L hoặc đường thẳng, rồi xem lại.' },
    L:     { name: 'Chữ L', how: 'Hai cạnh vàng kề nhau, tạo thành chữ L.', todo: 'Xoay lớp trên cho chữ L nằm ở phía sau và bên trái, rồi làm F U R U′ R′ F′.' },
    line:  { name: 'Đường thẳng', how: 'Hai cạnh vàng đối diện nhau, tạo một đường thẳng.', todo: 'Xoay lớp trên cho đường thẳng nằm ngang (trái–phải), rồi làm F R U R′ U′ F′.' },
    cross: { name: 'Dấu cộng', how: 'Cả bốn cạnh đều vàng.', todo: 'Đã có dấu cộng vàng! Sang bước tiếp: khớp cạnh vàng với tâm mặt bên.' }
  };
  var SHAPE_KEYS = ['dot', 'L', 'line', 'cross'];

  function yellowEdges(state) {
    var r = [];
    C.EDGES.forEach(function (e) { if (e.faces[0] === 'U' && state[e.idx[0]] === 'U') r.push(e.faces[1]); });
    return r;
  }
  function shapeOf(state) {
    var e = yellowEdges(state);
    if (e.length === 4) return 'cross';
    if (e.length === 0) return 'dot';
    if (e.length === 2) return (e.indexOf('F') >= 0 && e.indexOf('B') >= 0) || (e.indexOf('L') >= 0 && e.indexOf('R') >= 0) ? 'line' : 'L';
    return null;
  }

  var QMACROS = ["F R U R' U' F'", "F U R U' R' F'", "R U R' U R U2 R'", "U", "U'", "U2"];
  // trả về { state, shape }: khối hai lớp dưới đã xong, lớp trên xáo bằng các công thức
  function makeQuiz(want, rng) {
    rng = rng || Math.random;
    for (var tries = 0; tries < 400; tries++) {
      var st = C.solved();
      var n = 2 + Math.floor(rng() * 3);
      for (var i = 0; i < n; i++) st = C.applyAlg(st, QMACROS[Math.floor(rng() * QMACROS.length)]);
      st = C.applyAlg(st, ['', 'U', "U'", 'U2'][Math.floor(rng() * 4)]);
      var sh = shapeOf(st);
      if (sh && sh === want) return { state: st, shape: sh };
    }
    // dự phòng: dựng trực tiếp
    var base = C.applyAlg(C.solved(), want === 'dot' ? "F R U R' U' F' U2 F R U R' U' F'" : want === 'L' ? "F U R U' R' F'" : want === 'line' ? "F R U R' U' F'" : '');
    return { state: base, shape: shapeOf(base) || want };
  }

  // ---------- đọc to ----------
  var voice = null;
  function pickVoice() {
    if (voice || !root.speechSynthesis) return voice;
    var vs = root.speechSynthesis.getVoices() || [];
    voice = vs.filter(function (v) { return /^vi/i.test(v.lang); })[0] || null;
    return voice;
  }
  function speak(text) {
    if (!root.speechSynthesis || !root.SpeechSynthesisUtterance) return false;
    root.speechSynthesis.cancel();
    var u = new root.SpeechSynthesisUtterance(text.replace(/[′’']/g, ' phẩy ').replace(/[↻↺]/g, ''));
    u.lang = 'vi-VN';
    var v = pickVoice(); if (v) u.voice = v;
    u.rate = 0.95;
    root.speechSynthesis.speak(u);
    return true;
  }
  function stopSpeak() { if (root.speechSynthesis) root.speechSynthesis.cancel(); }
  if (root.speechSynthesis) root.speechSynthesis.onvoiceschanged = function () { voice = null; pickVoice(); };

  var API = { describeMove: describeMove, movesLabel: movesLabel, layerCells: layerCells, SHAPES: SHAPES, SHAPE_KEYS: SHAPE_KEYS,
    shapeOf: shapeOf, yellowEdges: yellowEdges, makeQuiz: makeQuiz, speak: speak, stopSpeak: stopSpeak, FACE_SHORT: FACE_SHORT };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Lessons = API;
})(typeof window !== 'undefined' ? window : this);
