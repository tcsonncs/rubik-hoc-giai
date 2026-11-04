/* store.js - sao theo giai đoạn, kỷ lục, tuỳ chọn. Chỉ lưu trong máy (localStorage), không tên, không ảnh. */
(function (root) {
  'use strict';
  var KEY = 'rubik.gd3';

  function load() {
    var d = { stars: {}, best: null, solves: 0, quizOk: 0, quizAll: 0, voice: false, anim: true };
    try {
      var raw = root.localStorage.getItem(KEY);
      if (raw) { var o = JSON.parse(raw); for (var k in d) if (o && o[k] !== undefined) d[k] = o[k]; }
    } catch (e) { /* dùng mặc định */ }
    return d;
  }
  var data = load();
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* bỏ qua */ } }

  var API = {
    get: function () { return data; },
    setOpt: function (k, v) { data[k] = v; save(); },
    // trả true nếu là số sao cao nhất từ trước đến nay của giai đoạn đó
    giveStars: function (stage, n) {
      var cur = data.stars[stage] || 0;
      if (n > cur) { data.stars[stage] = n; save(); return true; }
      return false;
    },
    recordSolve: function (ms) {
      data.solves++;
      var isBest = data.best === null || ms < data.best;
      if (isBest) data.best = ms;
      save();
      return isBest;
    },
    recordQuiz: function (ok) { data.quizAll++; if (ok) data.quizOk++; save(); },
    exportJSON: function () { return JSON.stringify({ app: 'Rubik học giải', xuatLuc: new Date().toISOString(), du_lieu: data }, null, 2); },
    reset: function () { data = { stars: {}, best: null, solves: 0, quizOk: 0, quizAll: 0, voice: data.voice, anim: data.anim }; save(); }
  };
  root.Store = API;
})(typeof window !== 'undefined' ? window : this);
