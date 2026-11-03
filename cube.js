/* cube.js - mô hình khối Rubik 3x3: 54 ô, 6 mặt, 18 nước quay, kiểm tra hợp lệ.
   Tư thế chuẩn: tâm TRẮNG ở dưới (D), XANH LÁ ở trước (F).
   Mỗi ô lưu ký tự mặt mà màu của nó thuộc về (U,R,F,D,L,B) = màu của ô tâm mặt đó.
   Thứ tự ô: U 0-8, R 9-17, F 18-26, D 27-35, L 36-44, B 45-53 (mỗi mặt đọc từ ngoài nhìn vào, trái sang phải, trên xuống dưới).
   Toạ độ: x phải, y lên, z ra phía trước. */
(function (root) {
  'use strict';

  var FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
  var NORMAL = { U: [0, 1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, -1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
  var FACE_NAME = { U: 'mặt trên', R: 'mặt phải', F: 'mặt trước', D: 'mặt dưới', L: 'mặt trái', B: 'mặt sau' };
  var COLOR_NAME = { U: 'vàng', R: 'cam', F: 'xanh lá', D: 'trắng', L: 'đỏ', B: 'xanh dương' };
  var MOVES = [];
  FACES.forEach(function (f) { MOVES.push(f, f + "'", f + '2'); });

  // Vị trí (x,y,z) của ô thứ c trong hàng r của mặt f
  function facePos(f, r, c) {
    switch (f) {
      case 'U': return [-1 + c, 1, -1 + r];
      case 'R': return [1, 1 - r, 1 - c];
      case 'F': return [-1 + c, 1 - r, 1];
      case 'D': return [-1 + c, -1, 1 - r];
      case 'L': return [-1, 1 - r, -1 + c];
      default: return [1 - c, 1 - r, -1]; // B
    }
  }

  var POS = [], NRM = [], FACE_OF = [];
  FACES.forEach(function (f, fi) {
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
      POS.push(facePos(f, r, c));
      NRM.push(NORMAL[f]);
      FACE_OF.push(f);
    }
  });
  var INDEX_BY_KEY = {};
  for (var i = 0; i < 54; i++) INDEX_BY_KEY[POS[i].join(',') + '|' + NRM[i].join(',')] = i;

  // quay 90 độ theo chiều kim đồng hồ khi nhìn từ phía mặt f vào (lần k = 1,2,3)
  function rot(v, n, times) {
    // quay quanh trục n góc -90 độ: v' = -(n x v) + n(n.v)... dùng công thức Rodrigues với góc -90
    var out = v;
    for (var t = 0; t < times; t++) {
      var cx = n[1] * out[2] - n[2] * out[1];
      var cy = n[2] * out[0] - n[0] * out[2];
      var cz = n[0] * out[1] - n[1] * out[0];
      var d = n[0] * out[0] + n[1] * out[1] + n[2] * out[2];
      // góc -90: v' = n(n.v) - n x v
      out = [n[0] * d - cx, n[1] * d - cy, n[2] * d - cz];
    }
    return out;
  }

  // Hoán vị ô: PERM[move][i] = vị trí mới của ô i. new[PERM[i]] = old[i]
  var PERM = {};
  FACES.forEach(function (f) {
    var n = NORMAL[f];
    [1, 2, 3].forEach(function (times) {
      var p = [];
      for (var i = 0; i < 54; i++) {
        var d = POS[i][0] * n[0] + POS[i][1] * n[1] + POS[i][2] * n[2];
        if (d !== 1) { p.push(i); continue; }
        var np = rot(POS[i], n, times), nn = rot(NRM[i], n, times);
        p.push(INDEX_BY_KEY[np.join(',') + '|' + nn.join(',')]);
      }
      PERM[f + (times === 1 ? '' : times === 2 ? '2' : "'")] = p;
    });
  });

  function solved() {
    var s = [];
    for (var i = 0; i < 54; i++) s.push(FACE_OF[i]);
    return s;
  }

  function applyMove(state, move) {
    var p = PERM[move];
    if (!p) throw new Error('Nước quay không có: ' + move);
    var out = new Array(54);
    for (var i = 0; i < 54; i++) out[p[i]] = state[i];
    return out;
  }

  function parseAlg(alg) {
    if (Array.isArray(alg)) return alg.slice();
    var t = String(alg).replace(/’|‘/g, "'").trim();
    return t ? t.split(/\s+/) : [];
  }

  function applyAlg(state, alg) {
    var s = state;
    parseAlg(alg).forEach(function (m) { s = applyMove(s, m); });
    return s;
  }

  function invertMove(m) {
    return m.length === 1 ? m + "'" : m[1] === "'" ? m[0] : m;
  }

  function invertAlg(alg) {
    return parseAlg(alg).reverse().map(invertMove);
  }

  function equal(a, b) {
    for (var i = 0; i < 54; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function isSolved(s) { return equal(s, solved()); }

  function scramble(n, rng) {
    rng = rng || Math.random;
    var seq = [], last = '';
    while (seq.length < (n || 25)) {
      var f = FACES[Math.floor(rng() * 6)];
      if (f === last) continue;
      last = f;
      seq.push(f + ['', "'", '2'][Math.floor(rng() * 3)]);
    }
    return seq;
  }

  // ---------- Khối thành các mảnh (góc, cạnh) ----------
  function cubiePositions(kind) {
    // kind 3: góc (|x|=|y|=|z|=1), kind 2: cạnh (một toạ độ bằng 0)
    var list = [];
    for (var x = -1; x <= 1; x++) for (var y = -1; y <= 1; y++) for (var z = -1; z <= 1; z++) {
      var nz = (x !== 0) + (y !== 0) + (z !== 0);
      if (nz !== kind) continue;
      var faces = [];
      FACES.forEach(function (f) {
        var n = NORMAL[f];
        if (n[0] * x + n[1] * y + n[2] * z === 1) faces.push(f);
      });
      list.push({ pos: [x, y, z], faces: faces });
    }
    return list;
  }

  function stickerAt(pos, face) {
    return INDEX_BY_KEY[pos.join(',') + '|' + NORMAL[face].join(',')];
  }

  // Góc: sắp theo chiều kim đồng hồ khi nhìn từ ngoài, bắt đầu từ mặt U/D
  var CORNERS = cubiePositions(3).map(function (c) {
    var ud = c.faces.filter(function (f) { return f === 'U' || f === 'D'; })[0];
    var others = c.faces.filter(function (f) { return f !== ud; });
    var a = NORMAL[ud], b = NORMAL[others[0]], d = NORMAL[others[1]];
    // tích hỗn hợp a . (b x d): dương = ngược chiều kim đồng hồ khi nhìn từ ngoài
    var tri = a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0]);
    var order = tri > 0 ? [ud, others[1], others[0]] : [ud, others[0], others[1]];
    return { pos: c.pos, faces: order, idx: order.map(function (f) { return stickerAt(c.pos, f); }) };
  });

  // Cạnh: mặt đầu theo thứ tự ưu tiên trục U/D > F/B > R/L
  var PRIORITY = { U: 0, D: 0, F: 1, B: 1, R: 2, L: 2 };
  var EDGES = cubiePositions(2).map(function (c) {
    var order = c.faces.slice().sort(function (a, b) { return PRIORITY[a] - PRIORITY[b]; });
    return { pos: c.pos, faces: order, idx: order.map(function (f) { return stickerAt(c.pos, f); }) };
  });

  function sameSet(a, b) {
    return a.length === b.length && a.every(function (x) { return b.indexOf(x) >= 0; });
  }

  function cellLabel(i) {
    var f = FACE_OF[i], k = i % 9;
    return FACE_NAME[f] + ', hàng ' + (Math.floor(k / 3) + 1) + ', cột ' + (k % 3 + 1);
  }

  // Trả về { ok, problems:[{text, cells}] }
  function validate(state) {
    var problems = [];
    var i;
    function add(text, cells) { problems.push({ text: text, cells: cells || [] }); }

    // 1. ô trống
    var blanks = [];
    for (i = 0; i < 54; i++) if (!state[i] || FACES.indexOf(state[i]) < 0) blanks.push(i);
    if (blanks.length) {
      add('Còn ' + blanks.length + ' ô chưa tô màu. Chạm vào ô rồi chọn màu để tô đủ 54 ô.', blanks);
      return { ok: false, problems: problems };
    }

    // 2. tâm
    var seenCenter = {};
    var centerBad = false;
    for (var fi = 0; fi < 6; fi++) {
      var ci = fi * 9 + 4;
      if (seenCenter[state[ci]] !== undefined) centerBad = true;
      seenCenter[state[ci]] = ci;
    }
    if (centerBad) {
      add('Sáu ô tâm phải có sáu màu khác nhau, vì tâm không bao giờ đổi chỗ khi quay khối.', [4, 13, 22, 31, 40, 49]);
      return { ok: false, problems: problems };
    }
    // màu theo tâm -> chữ mặt chuẩn
    var colorToFace = {};
    for (fi = 0; fi < 6; fi++) colorToFace[state[fi * 9 + 4]] = FACES[fi];
    var norm = state.map(function (c) { return colorToFace[c]; });

    // 3. mỗi màu 9 ô
    FACES.forEach(function (f) {
      var cells = [];
      for (var j = 0; j < 54; j++) if (norm[j] === f) cells.push(j);
      if (cells.length !== 9) {
        add('Có ' + cells.length + ' ô màu ' + COLOR_NAME[f] + ' (khối thật phải có đúng 9 ô mỗi màu). ' +
          (cells.length > 9 ? 'Thừa ' + (cells.length - 9) + ' ô, hãy tìm ô tô nhầm.' : 'Thiếu ' + (9 - cells.length) + ' ô.'), cells);
      }
    });
    if (problems.length) return { ok: false, problems: problems };

    // 4. từng góc, từng cạnh có thật không
    var cornerPerm = [], cornerTwist = 0, usedC = {}, k;
    CORNERS.forEach(function (pc, pi) {
      var obs = pc.idx.map(function (j) { return norm[j]; });
      var found = -1, shift = 0;
      for (var s = 0; s < CORNERS.length; s++) {
        var sc = CORNERS[s].faces;
        if (!sameSet(sc, obs)) continue;
        for (var r = 0; r < 3; r++) {
          if (sc[0] === obs[r] && sc[1] === obs[(r + 1) % 3] && sc[2] === obs[(r + 2) % 3]) { found = s; shift = r; }
        }
        if (found < 0) found = -2 - s; // đủ màu nhưng bị lật gương
        break;
      }
      if (found === -1) {
        var dup = obs.filter(function (c, q) { return obs.indexOf(c) !== q; }).length > 0;
        var opp = obs.some(function (a) { return obs.some(function (b) { return a !== b && PRIORITY[a] === PRIORITY[b]; }); });
        add('Góc ở ' + pc.faces.map(function (f) { return FACE_NAME[f]; }).join(' – ') + ' có ba màu ' +
          obs.map(function (c) { return COLOR_NAME[c]; }).join(', ') + (dup ? ' (trùng màu)' : opp ? ' (có hai màu đối diện nhau)' : '') +
          ' nên khối thật không có góc như vậy. Hãy chạm các ô này để sửa.', pc.idx);
        return;
      }
      if (found <= -2) {
        add('Góc ở ' + pc.faces.map(function (f) { return FACE_NAME[f]; }).join(' – ') + ' có đủ ba màu nhưng xếp ngược chiều (như soi gương), khối thật không thể có. Hãy đổi chỗ hai ô của góc này.', pc.idx);
        return;
      }
      if (usedC[found]) {
        add('Có hai góc giống hệt nhau (' + CORNERS[found].faces.map(function (f) { return COLOR_NAME[f]; }).join(', ') + '). Mỗi góc chỉ có một mảnh duy nhất.', pc.idx.concat(usedC[found].idx));
        return;
      }
      usedC[found] = pc;
      cornerPerm[pi] = found;
      cornerTwist += shift;
    });
    var edgePerm = [], edgeFlip = 0, usedE = {};
    EDGES.forEach(function (pe, pi) {
      var obs = pe.idx.map(function (j) { return norm[j]; });
      var found = -1, flip = 0;
      for (var s = 0; s < EDGES.length; s++) {
        if (sameSet(EDGES[s].faces, obs)) { found = s; flip = obs[0] === EDGES[s].faces[0] ? 0 : 1; break; }
      }
      if (found < 0) {
        add('Cạnh ở ' + pe.faces.map(function (f) { return FACE_NAME[f]; }).join(' – ') + ' có hai màu ' +
          obs.map(function (c) { return COLOR_NAME[c]; }).join(' và ') + ' nên khối thật không có cạnh như vậy. Hãy chạm các ô này để sửa.', pe.idx);
        return;
      }
      if (usedE[found]) {
        add('Có hai cạnh giống hệt nhau (' + EDGES[found].faces.map(function (f) { return COLOR_NAME[f]; }).join(' và ') + '). Mỗi cạnh chỉ có một mảnh duy nhất.', pe.idx.concat(usedE[found].idx));
        return;
      }
      usedE[found] = pe;
      edgePerm[pi] = found;
      edgeFlip += flip;
    });
    if (problems.length) return { ok: false, problems: problems };

    // 5. xoắn góc, lật cạnh, chẵn lẻ
    if (cornerTwist % 3 !== 0) {
      add('Có một góc bị xoay sai: khối thật không thể có một góc đứng một mình xoay lệch như vậy (tổng xoay các góc phải chia hết cho 3). Hãy kiểm tra lại màu 8 góc.', [].concat.apply([], CORNERS.map(function (c) { return c.idx; })));
    }
    if (edgeFlip % 2 !== 0) {
      add('Có một cạnh bị lật ngược: khối thật không thể có một cạnh đứng một mình bị lật như vậy. Hãy kiểm tra lại màu 12 cạnh.', [].concat.apply([], EDGES.map(function (c) { return c.idx; })));
    }
    if (parity(cornerPerm) !== parity(edgePerm)) {
      add('Có hai mảnh đổi chỗ cho nhau (một cặp góc hoặc một cặp cạnh bị hoán đổi): quay khối thật không thể ra như vậy. Hãy kiểm tra lại vị trí các mảnh.', []);
    }
    return { ok: problems.length === 0, problems: problems };
  }

  function parity(p) {
    var seen = {}, par = 0;
    for (var i = 0; i < p.length; i++) {
      if (seen[i]) continue;
      var len = 0, j = i;
      while (!seen[j]) { seen[j] = true; j = p[j]; len++; }
      par += len - 1;
    }
    return par % 2;
  }

  var API = {
    FACES: FACES, MOVES: MOVES, NORMAL: NORMAL, FACE_NAME: FACE_NAME, COLOR_NAME: COLOR_NAME,
    POS: POS, NRM: NRM, FACE_OF: FACE_OF, PERM: PERM, CORNERS: CORNERS, EDGES: EDGES,
    solved: solved, applyMove: applyMove, applyAlg: applyAlg, parseAlg: parseAlg,
    invertMove: invertMove, invertAlg: invertAlg, equal: equal, isSolved: isSolved,
    scramble: scramble, validate: validate, cellLabel: cellLabel
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Cube = API;
})(typeof window !== 'undefined' ? window : this);
