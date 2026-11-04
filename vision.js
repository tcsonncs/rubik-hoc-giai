/* vision.js - nhận màu khối Rubik từ mẫu màu đo được (phần tính toán thuần, không đụng camera/giao diện).
   Vào: samples[mặt] = 9 màu [r,g,b] (đọc từ ngoài nhìn vào, trái sang phải, trên xuống dưới), mặt là U,R,F,D,L,B theo TÂM của mặt đó.
   Ra: state 54 ô cho cube.js, độ chắc từng ô, danh sách ô nghi ngờ.
   Cách làm: lấy màu 6 tâm làm màu chuẩn của chính khối này (bù ánh sáng và loại nhãn), phân loại ô theo khoảng cách Lab,
   ép đúng 9 ô mỗi màu bằng gán tối ưu (Hungarian), tinh chỉnh màu chuẩn vài vòng, rồi thử xoay mặt / đổi chỗ ô nghi ngờ nếu khối không hợp lệ. */
(function (root) {
  'use strict';
  var C = root.Cube || require('./cube.js');
  var FACES = C.FACES;

  // ---------- màu ----------
  function srgb2lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function rgbToLab(rgb) {
    var r = srgb2lin(rgb[0]), g = srgb2lin(rgb[1]), b = srgb2lin(rgb[2]);
    var x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    var y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b);
    var z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
    function f(t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; }
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  var WL = 0.6; // độ sáng ít quan trọng hơn sắc độ (ánh sáng đổi thì độ sáng đổi trước)
  function dist(a, b) { var dl = (a[0] - b[0]) * WL, da = a[1] - b[1], db = a[2] - b[2]; return Math.sqrt(dl * dl + da * da + db * db); }

  function rgbToHsv(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d > 0) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx === 0 ? 0 : d / mx, mx];
  }
  // đoán thô một màu thuộc mặt nào (chỉ để kiểm tra ô tâm có phải mặt đang cần quét không); null nếu không chắc
  function nominal(rgb) {
    var hsv = rgbToHsv(rgb), h = hsv[0], s = hsv[1], v = hsv[2];
    if (v < 0.18) return null;
    if (s < 0.28 && v > 0.45) return 'D';
    if (s < 0.38) return null;
    if (h < 11 || h >= 335) return 'L';
    if (h < 38) return 'R';
    if (h < 78) return 'U';
    if (h >= 85 && h < 175) return 'F';
    if (h >= 185 && h < 265) return 'B';
    return null;
  }

  // ---------- gán tối ưu ----------
  function hungarian(cost) {
    var n = cost.length, u = [], v = [], p = [], way = [], i, j;
    for (i = 0; i <= n; i++) { u.push(0); v.push(0); p.push(0); way.push(0); }
    for (i = 1; i <= n; i++) {
      p[0] = i;
      var j0 = 0, minv = [], used = [];
      for (j = 0; j <= n; j++) { minv.push(Infinity); used.push(false); }
      do {
        used[j0] = true;
        var i0 = p[j0], delta = Infinity, j1 = 0;
        for (j = 1; j <= n; j++) if (!used[j]) {
          var cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
        for (j = 0; j <= n; j++) { if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta; }
        j0 = j1;
      } while (p[j0] !== 0);
      do { var jb = way[j0]; p[j0] = p[jb]; j0 = jb; } while (j0);
    }
    var ans = new Array(n);
    for (j = 1; j <= n; j++) ans[p[j] - 1] = j - 1;
    return ans;
  }

  // ---------- phân loại 54 ô ----------
  // trả về { state, margin[54], low[], dist }
  // Mỗi mặt có thể chụp dưới ánh sáng khác nhau: ngoài màu chuẩn của 6 màu, còn ước lượng độ lệch Lab riêng của từng mặt.
  function classify(samples) {
    var raw = [], k, i;
    FACES.forEach(function (face) { raw.push(samples[face].map(rgbToLab)); });
    var refs = FACES.map(function (face, fi) { return raw[fi][4].slice(); });
    var shift = FACES.map(function () { return [0, 0, 0]; });
    function adj(fi, k2) { var l = raw[fi][k2], sh = shift[fi]; return [l[0] - sh[0], l[1] - sh[1], l[2] - sh[2]]; }
    var assign = null;
    for (var iter = 0; iter < 8; iter++) {
      var cells = [];
      FACES.forEach(function (face, fi) { for (var q = 0; q < 9; q++) if (q !== 4) cells.push({ idx: fi * 9 + q, fi: fi, k: q, lab: adj(fi, q) }); });
      var cost = [];
      for (i = 0; i < 48; i++) {
        var row = [];
        for (var c = 0; c < 6; c++) { var d = dist(cells[i].lab, refs[c]); for (var r = 0; r < 8; r++) row.push(d); }
        cost.push(row);
      }
      var a = hungarian(cost).map(function (col) { return Math.floor(col / 8); });
      var same = assign && a.every(function (x, q) { return x === assign[q]; });
      assign = a;
      // màu chuẩn mới = trung bình các ô đã gán (đã bù lệch), tâm tính gấp đôi
      var sum = refs.map(function (rf, ci) { var cl = adj(ci, 4); return [cl[0] * 2, cl[1] * 2, cl[2] * 2, 2]; });
      for (i = 0; i < 48; i++) { var sm = sum[assign[i]]; sm[0] += cells[i].lab[0]; sm[1] += cells[i].lab[1]; sm[2] += cells[i].lab[2]; sm[3]++; }
      refs = sum.map(function (sm) { return [sm[0] / sm[3], sm[1] / sm[3], sm[2] / sm[3]]; });
      if (same && iter > 1) break;
      // độ lệch riêng từng mặt: trung bình phần dư (tâm nặng gấp 3), giảm chấn
      FACES.forEach(function (face, fi) {
        var acc = [0, 0, 0], w = 0, q;
        for (q = 0; q < 9; q++) {
          var lab = raw[fi][q], ref = q === 4 ? refs[fi] : refs[assign[cells.findIndex(function (cc) { return cc.idx === fi * 9 + q; })]];
          var wt = q === 4 ? 3 : 1;
          acc[0] += (lab[0] - ref[0]) * wt; acc[1] += (lab[1] - ref[1]) * wt; acc[2] += (lab[2] - ref[2]) * wt; w += wt;
        }
        shift[fi] = [shift[fi][0] * 0.3 + acc[0] / w * 0.7, shift[fi][1] * 0.3 + acc[1] / w * 0.7, shift[fi][2] * 0.3 + acc[2] / w * 0.7];
      });
    }
    var finalCells = [];
    FACES.forEach(function (face, fi) { for (var q = 0; q < 9; q++) if (q !== 4) finalCells.push({ idx: fi * 9 + q, lab: adj(fi, q) }); });
    var state = new Array(54), margin = new Array(54), dists = new Array(54), low = [];
    FACES.forEach(function (face, fi) { state[fi * 9 + 4] = face; margin[fi * 9 + 4] = 99; dists[fi * 9 + 4] = 0; });
    for (i = 0; i < 48; i++) {
      var col = assign[i], dd = refs.map(function (rf) { return dist(finalCells[i].lab, rf); });
      var mine = dd[col], other = Infinity;
      for (var q2 = 0; q2 < 6; q2++) if (q2 !== col && dd[q2] < other) other = dd[q2];
      state[finalCells[i].idx] = FACES[col];
      margin[finalCells[i].idx] = other - mine;
      dists[finalCells[i].idx] = mine;
    }
    for (i = 0; i < 54; i++) if (margin[i] < 14) low.push(i);
    return { state: state, margin: margin, low: low, dist: dists };
  }

  // ---------- sửa lỗi xoay mặt ----------
  function rot90(g) { return [g[6], g[3], g[0], g[7], g[4], g[1], g[8], g[5], g[2]]; }
  function fixRotations(state) {
    if (C.validate(state).ok) return { state: state, rot: [0, 0, 0, 0, 0, 0], ok: true, changed: false };
    var vers = FACES.map(function (f, fi) {
      var g = state.slice(fi * 9, fi * 9 + 9), out = [g];
      for (var t = 1; t < 4; t++) { g = rot90(g); out.push(g); }
      return out;
    });
    var best = null, bestCost = 99;
    for (var m = 1; m < 4096; m++) {
      var ks = [], x = m, cost = 0, i;
      for (i = 0; i < 6; i++) { var d = x % 4; ks.push(d); x = (x - d) / 4; cost += d === 3 ? 1 : d; }
      if (cost >= bestCost) continue;
      var st = [];
      for (i = 0; i < 6; i++) st = st.concat(vers[i][ks[i]]);
      if (C.validate(st).ok) { best = { state: st, rot: ks }; bestCost = cost; }
    }
    return best ? { state: best.state, rot: best.rot, ok: true, changed: true } : { state: state, rot: [0, 0, 0, 0, 0, 0], ok: false, changed: false };
  }

  // ---------- đổi chỗ hai ô nghi ngờ ----------
  function repair(state, low) {
    if (C.validate(state).ok) return { state: state, ok: true, changed: [] };
    var cand = low.filter(function (i) { return i % 9 !== 4; }).slice(0, 14);
    for (var a = 0; a < cand.length; a++) for (var b = a + 1; b < cand.length; b++) {
      var i = cand[a], j = cand[b];
      if (state[i] === state[j]) continue;
      var st = state.slice(); st[i] = state[j]; st[j] = state[i];
      if (C.validate(st).ok) return { state: st, ok: true, changed: [i, j] };
    }
    return { state: state, ok: false, changed: [] };
  }

  // ---------- đường ống đầy đủ ----------
  function readCube(samples) {
    var cl = classify(samples);
    var state = cl.state, notes = [], low = cl.low.slice();
    var fx = fixRotations(state);
    if (fx.changed) { state = fx.state; notes.push('rot'); }
    var rp = repair(state, low);
    if (rp.changed.length) { state = rp.state; notes.push('swap'); rp.changed.forEach(function (c) { if (low.indexOf(c) < 0) low.push(c); }); }
    var v = C.validate(state);
    return { state: state, low: low, margin: cl.margin, valid: v.ok, problems: v.problems, notes: notes, rotations: fx.rot };
  }

  var API = { rgbToLab: rgbToLab, dist: dist, nominal: nominal, hungarian: hungarian, classify: classify, fixRotations: fixRotations, repair: repair, readCube: readCube, rot90: rot90 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Vision = API;
})(typeof window !== 'undefined' ? window : this);
