/* solver.js - bộ giải Layer by Layer 7 giai đoạn cho khối 3x3 (tư thế: tâm trắng ở dưới, xanh lá ở trước).
   Chạy trên mức "mảnh" (12 cạnh, 8 góc) cho nhanh; lời giải cuối cùng luôn được thử lại trên 54 ô.
   Giai đoạn 1 dùng tìm kiếm ngắn (IDDFS) có ràng buộc không phá cạnh đã xong; các giai đoạn còn lại dùng công thức chuẩn.
   Kết quả: { ok, stages:[{id,name,goal,intro,why,steps:[{text,why,moves}]}], total } */
(function (root) {
  'use strict';
  var C = root.Cube || require('./cube.js');
  var E = C.EDGES, K = C.CORNERS, NAME = C.COLOR_NAME;
  var FI = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };
  var OPP = { 0: 3, 3: 0, 1: 4, 4: 1, 2: 5, 5: 2 };

  // ---------- bảng chuyển mảnh theo từng nước quay ----------
  function tables(list) {
    var at = {};
    list.forEach(function (p, s) { p.idx.forEach(function (st, k) { at[st] = [s, k]; }); });
    var T = {};
    C.MOVES.forEach(function (m) {
      var P = C.PERM[m];
      T[m] = list.map(function (p) { return p.idx.map(function (st) { return at[P[st]]; }); });
    });
    return T;
  }
  var EM = tables(E), KM = tables(K);

  function setKey(faces) { return faces.slice().sort().join(''); }
  var EID = {}, KID = {};
  E.forEach(function (p, i) { EID[setKey(p.faces)] = i; });
  K.forEach(function (p, i) { KID[setKey(p.faces)] = i; });

  // trạng thái mảnh: es[p] = ô cạnh p đang đứng, eo[p] = vị trí của màu đầu của mảnh trong ô đó (cạnh 0/1, góc 0/1/2)
  function fromFacelets(st) {
    var ps = { es: [], eo: [], cs: [], co: [] };
    E.forEach(function (sl, s) {
      var obs = sl.idx.map(function (i) { return st[i]; });
      var id = EID[setKey(obs)];
      if (id === undefined) throw new Error('Cạnh không hợp lệ');
      ps.es[id] = s; ps.eo[id] = obs.indexOf(E[id].faces[0]);
    });
    K.forEach(function (sl, s) {
      var obs = sl.idx.map(function (i) { return st[i]; });
      var id = KID[setKey(obs)];
      if (id === undefined) throw new Error('Góc không hợp lệ');
      ps.cs[id] = s; ps.co[id] = obs.indexOf(K[id].faces[0]);
    });
    return ps;
  }
  function applyP(ps, m) {
    var a = EM[m], b = KM[m], r = { es: [], eo: [], cs: [], co: [] }, t, p;
    for (p = 0; p < 12; p++) { t = a[ps.es[p]][ps.eo[p]]; r.es[p] = t[0]; r.eo[p] = t[1]; }
    for (p = 0; p < 8; p++) { t = b[ps.cs[p]][ps.co[p]]; r.cs[p] = t[0]; r.co[p] = t[1]; }
    return r;
  }
  function applyList(ps, list) { list.forEach(function (m) { ps = applyP(ps, m); }); return ps; }
  function edgeOk(ps, p) { return ps.es[p] === p && ps.eo[p] === 0; }
  function cornerOk(ps, p) { return ps.cs[p] === p && ps.co[p] === 0; }

  // ---------- rút gọn danh sách nước quay ----------
  function qt(m) { return m.length === 1 ? 1 : m[1] === '2' ? 2 : 3; }
  function norm(list) {
    var out = [];
    list.forEach(function (m) {
      var last = out[out.length - 1];
      if (last && last[0] === m[0]) {
        var q = (qt(last) + qt(m)) % 4;
        out.pop();
        if (q) out.push(m[0] + ['', '2', "'"][q - 1]);
      } else out.push(m);
    });
    return out;
  }

  // ---------- xoay "hệ quy chiếu" quanh trục đứng: F->R->B->L->F ----------
  var MAPF = { F: 'R', R: 'B', B: 'L', L: 'F', U: 'U', D: 'D' };
  function mapFace(f, g) { for (var i = 0; i < g; i++) f = MAPF[f]; return f; }
  function rot(list, g) { return list.map(function (m) { return mapFace(m[0], g) + m.slice(1); }); }
  function A(s) { return s.split(' '); }
  function frameOfPair(a, b) {
    for (var g = 0; g < 4; g++) {
      var x = mapFace('F', g), y = mapFace('R', g);
      if ((x === a && y === b) || (x === b && y === a)) return g;
    }
    throw new Error('Không tìm được hệ quy chiếu');
  }
  function sides(sl) { return sl.faces.filter(function (f) { return f !== 'U' && f !== 'D'; }); }

  // ---------- công thức ----------
  var SEXY = A("R U R' U'");
  var OUT_R = A("R U R'");
  var INS_R = A("U R U' R' U' F' U F");
  var INS_L = A("U' L' U L U F U' F'");
  var CROSS_A = A("F R U R' U' F'");
  var CROSS_L = A("F U R U' R' F'");
  var EDGE_A = A("R U R' U R U2 R' U");
  var CORNER_A = A("U R U' L' U R' U' L");
  var TWIST = A("R' D' R D");

  function nm(c) { return NAME[c]; }
  var SIDE = { F: 'trước', R: 'phải', B: 'sau', L: 'trái' };
  function pieceName(p, list) { return list[p].faces.map(nm).join('–'); }

  var STAGES = [
    { id: 1, name: 'Dấu cộng trắng', goal: 'Bốn cạnh trắng nằm ở mặt dưới, mỗi cạnh có màu còn lại khớp với tâm mặt bên.',
      intro: 'Ta bắt đầu bằng dấu cộng trắng ở mặt dưới. Chỉ cần 4 mảnh cạnh có màu trắng.',
      why: 'Dấu cộng là khung của lớp 1. Mỗi cạnh phải khớp màu với tâm mặt bên, nếu không các góc sau này sẽ không vào đúng.' },
    { id: 2, name: 'Góc trắng', goal: 'Cả lớp dưới là một mặt trắng, các mặt bên có hàng dưới đúng màu.',
      intro: 'Đưa từng góc trắng vào chỗ của nó, ở phía dưới.',
      why: 'Công thức R U R′ U′ chỉ lay động một góc, nên lặp lại sẽ đưa góc xuống đúng chiều mà không phá dấu cộng.' },
    { id: 3, name: 'Lớp giữa', goal: 'Hai lớp dưới đã đúng: mỗi mặt bên có hai hàng cùng màu.',
      intro: 'Chèn 4 cạnh không có màu vàng và không có màu trắng vào lớp giữa.',
      why: 'Cạnh ở lớp trên đã nằm sát đúng mặt, ta chỉ cần quyết định chèn sang phải hay sang trái.' },
    { id: 4, name: 'Dấu cộng vàng', goal: 'Bốn cạnh của mặt vàng đều hướng mặt vàng lên trên (hình dấu cộng).',
      intro: 'Bây giờ làm lớp cuối. Trước hết tạo dấu cộng vàng ở mặt trên.',
      why: 'Công thức F R U R′ U′ F′ lật hai cạnh vàng cùng lúc. Nhìn hình vàng (chấm, chữ L, đường thẳng) để biết cần xoay lớp trên thế nào.' },
    { id: 5, name: 'Khớp cạnh vàng', goal: 'Bốn cạnh vàng khớp màu với tâm mặt bên.',
      intro: 'Xoay lớp trên cho các cạnh vàng khớp màu tâm của mặt bên.',
      why: 'Khi hai cạnh kề nhau đã khớp, công thức đổi chỗ hai cạnh còn lại, nên cả bốn sẽ khớp.' },
    { id: 6, name: 'Góc vàng về chỗ', goal: 'Bốn góc vàng nằm đúng vị trí (chưa cần đúng chiều).',
      intro: 'Đưa 4 góc vàng về đúng ô của chúng, giữa hai cạnh có màu giống chúng.',
      why: 'Công thức này đổi chỗ ba góc theo vòng tròn, trong khi một góc đúng chỗ đứng yên và các cạnh không đổi.' },
    { id: 7, name: 'Xoay góc vàng', goal: 'Khối được giải xong.',
      intro: 'Bước cuối: xoay từng góc vàng cho mặt vàng hướng lên.',
      why: 'Lặp R′ D′ R D xoay đúng một góc tại chỗ. Hai lớp dưới tạm xáo trộn nhưng sẽ trở lại khi xong cả bốn góc.' }
  ];

  // ---------- giai đoạn 1: tìm kiếm ngắn ----------
  function searchEdge(ps, id, keep, maxD) {
    var ids = keep.concat([id]), n = ids.length, i;
    var s0 = ids.map(function (p) { return ps.es[p]; }), o0 = ids.map(function (p) { return ps.eo[p]; });
    function done(s, o) { for (var q = 0; q < n; q++) if (s[q] !== ids[q] || o[q] !== 0) return false; return true; }
    if (done(s0, o0)) return [];
    var path = [];
    function dfs(s, o, d, last) {
      for (var mi = 0; mi < 18; mi++) {
        var m = C.MOVES[mi], f = FI[m[0]];
        if (f === last) continue;
        if (last >= 0 && OPP[f] === last && f < last) continue;
        var T = EM[m], s2 = new Array(n), o2 = new Array(n);
        for (var q = 0; q < n; q++) { var t = T[s[q]][o[q]]; s2[q] = t[0]; o2[q] = t[1]; }
        if (d === 1) { if (done(s2, o2)) { path.push(m); return true; } continue; }
        path.push(m);
        if (dfs(s2, o2, d - 1, f)) return true;
        path.pop();
      }
      return false;
    }
    for (var d = 1; d <= maxD; d++) { path = []; if (dfs(s0, o0, d, -1)) return path.slice(); }
    return null;
  }

  // ---------- các hàm hỗ trợ cho giai đoạn sau ----------
  function ids(list, pred) { var r = []; list.forEach(function (p, i) { if (pred(p)) r.push(i); }); return r; }
  var D_EDGES = ids(E, function (p) { return p.faces.indexOf('D') >= 0; });
  var D_CORNERS = ids(K, function (p) { return p.faces.indexOf('D') >= 0; });
  var MID_EDGES = ids(E, function (p) { return p.faces.indexOf('U') < 0 && p.faces.indexOf('D') < 0; });
  var U_EDGES = ids(E, function (p) { return p.faces.indexOf('U') >= 0; });
  var U_CORNERS = ids(K, function (p) { return p.faces.indexOf('U') >= 0; });
  function allOk(ps, list, fn) { return list.every(function (p) { return fn(ps, p); }); }

  function stageDonePS(ps, k) {
    if (k >= 1 && !allOk(ps, D_EDGES, edgeOk)) return false;
    if (k >= 2 && !allOk(ps, D_CORNERS, cornerOk)) return false;
    if (k >= 3 && !allOk(ps, MID_EDGES, edgeOk)) return false;
    if (k >= 4 && !U_EDGES.every(function (p) { return ps.eo[p] === 0; })) return false;
    if (k >= 5 && !allOk(ps, U_EDGES, edgeOk)) return false;
    if (k >= 6 && !U_CORNERS.every(function (p) { return ps.cs[p] === p; })) return false;
    if (k >= 7 && !allOk(ps, U_CORNERS, cornerOk)) return false;
    return true;
  }
  function stageDone(state, k) { return stageDonePS(fromFacelets(state), k); }
  function currentStage(state) {
    var ps = fromFacelets(state);
    for (var k = 1; k <= 7; k++) if (!stageDonePS(ps, k)) return k;
    return 8;
  }

  // ---------- giải ----------
  function solve(state) {
    var v = C.validate(state);
    if (!v.ok) return { ok: false, error: 'Khối chưa hợp lệ, hãy bấm “Kiểm tra” để sửa.', problems: v.problems };
    var ps = fromFacelets(state);
    var stages = STAGES.map(function (s) { return { id: s.id, name: s.name, goal: s.goal, intro: s.intro, why: s.why, steps: [] }; });
    function step(k, text, why, moves) {
      moves = norm(moves);
      if (!moves.length) return;
      ps = applyList(ps, moves);
      stages[k - 1].steps.push({ text: text, why: why, moves: moves });
    }

    try {
      // ---- 1. dấu cộng trắng ----
      D_EDGES.forEach(function (id) {
        if (edgeOk(ps, id)) return;
        var keep = D_EDGES.filter(function (p) { return p !== id && edgeOk(ps, p); });
        var path = searchEdge(ps, id, keep, 9);
        if (!path) throw new Error('Không tìm được lời giải dấu cộng');
        var sd = sides(E[id]);
        step(1, 'Đưa cạnh ' + pieceName(id, E) + ' vào giữa mặt trắng và mặt ' + nm(sd[0]) + '.',
          'Cạnh trắng–' + nm(sd[0]) + ' phải nằm giữa tâm trắng và tâm ' + nm(sd[0]) + '. Các cạnh trắng đã đặt xong được giữ nguyên.', path);
      });

      if (!stageDonePS(ps, 1)) throw new Error('GĐ1 hỏng');
      // ---- 2. góc trắng ----
      D_CORNERS.forEach(function (id) {
        if (cornerOk(ps, id)) return;
        var sd = sides(K[id]), name = pieceName(id, K);
        var s = ps.cs[id];
        if (K[s].faces.indexOf('D') >= 0) {
          var g0 = frameOfPair.apply(null, sides(K[s]));
          step(2, 'Góc ' + name + ' đang ở lớp dưới nhưng chưa đúng. Đưa nó lên lớp trên.',
            'Chỉ khi lên lớp trên ta mới xoay được nó tới chỗ thuận lợi.', rot(OUT_R, g0));
        }
        var g = frameOfPair(sd[0], sd[1]);
        var upSlot = KID[setKey(['U', mapFace('F', g), mapFace('R', g)])];
        var turns = [], tmp = ps;
        while (tmp.cs[id] !== upSlot) { tmp = applyP(tmp, 'U'); turns.push('U'); if (turns.length > 3) throw new Error('Không xoay được góc'); }
        step(2, 'Xoay lớp trên để góc ' + name + ' nằm ngay phía trên chỗ của nó (giữa mặt ' + nm(sd[0]) + ' và mặt ' + nm(sd[1]) + ').',
          'Chỗ của góc nằm ngay bên dưới. Lớp trên xoay thoải mái vì chưa làm xong.', turns);
        var rep = [], tp = ps, n = 0, sexy = rot(SEXY, g);
        do { sexy.forEach(function (m) { tp = applyP(tp, m); rep.push(m); }); n++; } while (!cornerOk(tp, id) && n < 6);
        if (!cornerOk(tp, id)) throw new Error('Góc không vào được');
        step(2, 'Lặp lại “' + sexy.join(' ') + '” ' + n + ' lần cho đến khi góc ' + name + ' vào đúng chỗ, mặt trắng hướng xuống.',
          'Mỗi lần lặp, góc xoay một nấc rồi xuống chỗ. Lặp đủ 1, 3 hoặc 5 lần thì mặt trắng hướng xuống.', rep);
      });

      if (!stageDonePS(ps, 2)) throw new Error('GĐ2 hỏng');
      // ---- 3. lớp giữa ----
      for (var guard = 0; guard < 30 && !allOk(ps, MID_EDGES, edgeOk); guard++) {
        var unsolved = MID_EDGES.filter(function (p) { return !edgeOk(ps, p); });
        var inU = unsolved.filter(function (p) { return E[ps.es[p]].faces.indexOf('U') >= 0; });
        if (inU.length) {
          var id3 = inU[0], sl = E[ps.es[id3]];
          var cTop = ps.eo[id3] === 0 ? E[id3].faces[0] : E[id3].faces[1];
          var cSide = ps.eo[id3] === 0 ? E[id3].faces[1] : E[id3].faces[0];
          var t3 = [], tmp3 = ps;
          while (E[tmp3.es[id3]].faces[1] !== cSide) { tmp3 = applyP(tmp3, 'U'); t3.push('U'); if (t3.length > 3) throw new Error('Không xoay được cạnh'); }
          var g3 = 0;
          while (mapFace('F', g3) !== cSide) g3++;
          var right = cTop === mapFace('R', g3);
          step(3, 'Cạnh ' + pieceName(id3, E) + ': xoay lớp trên cho màu ' + nm(cSide) + ' ở mặt bên trùng tâm ' + nm(cSide) + ', rồi chèn sang ' + (right ? 'phải' : 'trái') + '.',
            'Màu ' + nm(cSide) + ' của cạnh đã khớp tâm ' + nm(cSide) + '. Màu ' + nm(cTop) + ' nằm ở bên ' + (right ? 'phải' : 'trái') + ' nên chèn sang ' + (right ? 'phải' : 'trái') + '.',
            t3.concat(rot(right ? INS_R : INS_L, g3)));
        } else {
          var id3b = unsolved[0], sl3 = E[ps.es[id3b]];
          var g3b = frameOfPair(sl3.faces[0], sl3.faces[1]);
          step(3, 'Cạnh ' + pieceName(id3b, E) + ' đang ở lớp giữa nhưng sai chỗ. Đẩy nó lên lớp trên bằng công thức chèn.',
            'Dùng công thức chèn ở chính ô đó: cạnh sai sẽ bật lên lớp trên, rồi ta chèn lại cho đúng.', rot(INS_R, g3b));
        }
      }
      if (!allOk(ps, MID_EDGES, edgeOk)) throw new Error('Lớp giữa chưa xong');

      if (!stageDonePS(ps, 3)) throw new Error('GĐ3 hỏng');
      // ---- 4. dấu cộng vàng ----
      function orientedSides(p) { return U_EDGES.filter(function (id) { return p.eo[id] === 0; }).map(function (id) { return sides(E[p.es[id]])[0]; }).sort().join(''); }
      for (guard = 0; guard < 6; guard++) {
        var ori = U_EDGES.filter(function (id) { return ps.eo[id] === 0; }).length;
        if (ori === 4) break;
        var pick = null, why4 = STAGES[3].why, txt;
        if (ori === 0) {
          pick = { turns: [], alg: CROSS_A };
          txt = 'Mặt vàng chỉ có một chấm. Làm “' + CROSS_A.join(' ') + '”.';
        } else {
          var cand = [];
          for (var k4 = 0; k4 < 4; k4++) {
            var t4 = []; for (var q4 = 0; q4 < k4; q4++) t4.push('U');
            var base = applyList(ps, t4);
            var os = orientedSides(base);
            cand.push({ turns: t4, set: os, base: base });
          }
          var isLine = (orientedSides(ps) === 'BF' || orientedSides(ps) === 'LR');
          var found = null;
          cand.forEach(function (c) {
            if (found) return;
            var alg = isLine ? CROSS_A : CROSS_L;
            if (U_EDGES.every(function (id) { return applyList(c.base, alg).eo[id] === 0; })) found = { turns: c.turns, alg: alg, set: c.set };
          });
          if (!found) throw new Error('Không tìm được cách tạo dấu cộng vàng');
          pick = found;
          txt = isLine ? 'Mặt vàng có một đường thẳng. Xoay lớp trên cho đường thẳng nằm ngang (trái–phải), rồi làm “' + CROSS_A.join(' ') + '”.'
            : 'Mặt vàng có hình chữ L. Xoay lớp trên cho chữ L nằm ở phía sau và bên trái, rồi làm “' + CROSS_L.join(' ') + '”.';
        }
        step(4, txt, why4, pick.turns.concat(pick.alg));
      }
      if (!U_EDGES.every(function (id) { return ps.eo[id] === 0; })) throw new Error('Dấu cộng vàng chưa xong');

      // ---- 5. khớp cạnh vàng ----
      function matched(p) { return U_EDGES.filter(function (id) { return p.es[id] === id; }); }
      for (guard = 0; guard < 6 && matched(ps).length < 4; guard++) {
        var done5 = null, best = null;
        for (var k5 = 0; k5 < 4; k5++) {
          var t5 = []; for (var q5 = 0; q5 < k5; q5++) t5.push('U');
          var b5 = applyList(ps, t5), m5 = matched(b5);
          if (m5.length === 4) { done5 = t5; break; }
          if (m5.length === 2 && !best) {
            var ls = m5.map(function (id) { return sides(E[id])[0]; });
            for (var f5 = 0; f5 < 4; f5++) {
              var a5 = mapFace('B', f5), b5s = mapFace('R', f5);
              if ((ls[0] === a5 && ls[1] === b5s) || (ls[0] === b5s && ls[1] === a5)) { best = { turns: t5, f: f5 }; break; }
            }
          }
        }
        if (done5) {
          step(5, 'Xoay lớp trên cho cả bốn cạnh vàng khớp màu với tâm mặt bên.', STAGES[4].why, done5);
        } else if (best) {
          step(5, 'Hai cạnh kề nhau đã khớp. Cầm khối sao cho chúng ở phía sau và bên phải, rồi làm “' + rot(EDGE_A, best.f).join(' ') + '”.', STAGES[4].why, best.turns.concat(rot(EDGE_A, best.f)));
        } else {
          step(5, 'Chưa có hai cạnh kề nhau khớp. Làm “' + EDGE_A.join(' ') + '” một lần để đổi chỗ, rồi xem lại.', STAGES[4].why, EDGE_A);
        }
      }
      if (matched(ps).length < 4) throw new Error('Cạnh vàng chưa khớp');

      // ---- 6. góc vàng về chỗ ----
      var fixedFaces = K[(function () {
        var s = applyList(fromFacelets(C.solved()), CORNER_A);
        for (var i = 0; i < U_CORNERS.length; i++) if (s.cs[U_CORNERS[i]] === U_CORNERS[i]) return U_CORNERS[i];
        return U_CORNERS[0];
      })()].faces;
      for (guard = 0; guard < 6; guard++) {
        var inPlace = U_CORNERS.filter(function (id) { return ps.cs[id] === id; });
        if (inPlace.length === 4) break;
        var g6 = 0, txt6;
        if (inPlace.length === 1) {
          for (g6 = 0; g6 < 4; g6++) if (KID[setKey(fixedFaces.map(function (f) { return mapFace(f, g6); }))] === inPlace[0]) break;
          var fx = K[inPlace[0]].faces;
          txt6 = 'Góc ' + pieceName(inPlace[0], K) + ' đã đúng chỗ. Giữ nó ở góc phía ' + 'định sẵn và làm “' + CORNER_A.join(' ') + '”.';
          txt6 = 'Góc ' + pieceName(inPlace[0], K) + ' đã đúng chỗ (giữ nguyên). Làm “' + rot(CORNER_A, g6).join(' ') + '” để đổi chỗ ba góc còn lại.';
        } else {
          txt6 = 'Chưa có góc nào đúng chỗ. Làm “' + CORNER_A.join(' ') + '” một lần, rồi xem lại.';
        }
        step(6, txt6, STAGES[5].why, rot(CORNER_A, g6));
      }
      if (!U_CORNERS.every(function (id) { return ps.cs[id] === id; })) throw new Error('Góc vàng chưa về chỗ');

      // ---- 7. xoay góc vàng ----
      var UFR = KID[setKey(['U', 'F', 'R'])];
      for (var c7 = 0; c7 < 4; c7++) {
        var cid = ps.cs.indexOf(UFR);
        var rep7 = [], tp7 = ps, n7 = 0;
        while ((tp7.cs[cid] !== UFR || tp7.co[cid] !== 0) && n7 < 8) { TWIST.forEach(function (m) { tp7 = applyP(tp7, m); rep7.push(m); }); n7++; }
        if (tp7.cs[cid] !== UFR || tp7.co[cid] !== 0) throw new Error('Góc không xoay được');
        var nameC = pieceName(cid, K);
        if (n7) step(7, 'Giữ góc ' + nameC + ' ở góc trước–phải phía trên. Lặp “' + TWIST.join(' ') + '” ' + n7 + ' lần cho đến khi mặt vàng hướng lên.', STAGES[6].why, rep7);
        step(7, 'Xoay lớp trên (U) để đưa góc vàng kế tiếp tới góc trước–phải.', 'Chỉ xoay lớp trên: các góc đã đúng chiều đi theo.', ['U']);
      }
      var fin = [];
      for (var q7 = 0; q7 < 4 && !stageDonePS(ps, 7); q7++) { fin.push('U'); ps = applyP(ps, 'U'); }
      if (!stageDonePS(ps, 7)) throw new Error('Góc vàng chưa xong');
      if (fin.length) stages[6].steps.push({ text: 'Xoay lớp trên cho hai lớp khớp màu với mặt bên. Khối đã được giải xong!', why: 'Bốn góc đã đúng chiều, chỉ còn xoay lớp trên cho thẳng hàng.', moves: norm(fin) });
    } catch (e) {
      if (typeof process !== 'undefined' && process.env && process.env.RUBIK_DEBUG) { console.log(e.message); for (var kk = 1; kk <= 7; kk++) console.log(' GĐ' + kk + ' ' + stageDonePS(ps, kk)); console.log(' ' + JSON.stringify(ps)); }
      return { ok: false, error: 'Không giải được: ' + e.message };
    }

    // thử lại toàn bộ trên 54 ô
    var all = [];
    stages.forEach(function (s) { s.steps.forEach(function (st) { all = all.concat(st.moves); }); });
    // gộp bước "xoay lớp trên" cuối giai đoạn 7 vào bước kế (không đổi nội dung)
    if (!C.isSolved(C.applyAlg(state, all))) return { ok: false, error: 'Lời giải không về khối nguyên (lỗi nội bộ).' };
    return { ok: true, stages: stages, total: all.length, moves: all };
  }

  var API = { solve: solve, STAGES: STAGES, stageDone: stageDone, currentStage: currentStage, norm: norm, rot: rot };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Solver = API;
})(typeof window !== 'undefined' ? window : this);
