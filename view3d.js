/* view3d.js - khối Rubik 3D bằng three.js: kéo để xoay, hoạt hình quay từng lớp, chạm ô để tô màu.
   Các ô dán (sticker) đứng yên trong 27 mảnh nhỏ; khi quay một lớp chỉ tạm gom 9 mảnh vào "trục quay",
   quay xong thì trả lại chỗ cũ và tô lại màu theo trạng thái mới. */
(function (root) {
  'use strict';
  var C = root.Cube, T = root.THREE;

  var COLORS = { U: 0xffd500, R: 0xff6a00, F: 0x00a651, D: 0xf4f4f4, L: 0xd7263d, B: 0x1f5fd6, '.': 0x8a8f98 };

  function create(host) {
    var renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';

    var scene = new T.Scene();
    var camera = new T.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 11.5);
    var cube = new T.Group();
    scene.add(cube);
    var pivot = new T.Group();
    cube.add(pivot);

    var bodyMat = new T.MeshBasicMaterial({ color: 0x14161a });
    var bodyGeo = new T.BoxGeometry(0.97, 0.97, 0.97);
    var stickGeo = new T.PlaneGeometry(0.82, 0.82);
    var ringGeo = new T.PlaneGeometry(0.97, 0.97);
    var ringMat = new T.MeshBasicMaterial({ color: 0xff8a00 });
    var cubies = {}, stickers = [], rings = [], stickerMats = [];

    function key(p) { return p.join(','); }
    for (var i = 0; i < 54; i++) {
      var p = C.POS[i], k = key(p);
      if (!cubies[k]) {
        var g = new T.Group();
        g.position.set(p[0], p[1], p[2]);
        g.add(new T.Mesh(bodyGeo, bodyMat));
        cube.add(g);
        cubies[k] = { group: g, pos: p };
      }
      var n = new T.Vector3(C.NRM[i][0], C.NRM[i][1], C.NRM[i][2]);
      var q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), n);
      var mat = new T.MeshBasicMaterial({ color: COLORS['.'] });
      var s = new T.Mesh(stickGeo, mat);
      s.position.copy(n.clone().multiplyScalar(0.488));
      s.quaternion.copy(q);
      s.userData.index = i;
      cubies[k].group.add(s);
      var r = new T.Mesh(ringGeo, ringMat);
      r.position.copy(n.clone().multiplyScalar(0.486));
      r.quaternion.copy(q);
      r.visible = false;
      cubies[k].group.add(r);
      stickers.push(s); rings.push(r); stickerMats.push(mat);
    }

    // ---- tư thế xem ----
    var VIEW_FRONT = new T.Quaternion().setFromEuler(new T.Euler(0.5, -0.6, 0, 'XYZ'));
    var VIEW_BOTTOM = new T.Quaternion().setFromEuler(new T.Euler(-0.5, 0.6, 0, 'XYZ'));
    cube.quaternion.copy(VIEW_FRONT);

    var dirty = true, animating = false, queue = [];
    function draw() { dirty = true; }
    function loop() {
      if (dirty) { renderer.render(scene, camera); dirty = false; }
      requestAnimationFrame(loop);
    }
    loop();

    function resize() {
      var w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.z = camera.aspect < 1 ? 11.5 / camera.aspect * 0.92 : 11.5;
      camera.updateProjectionMatrix();
      draw();
    }
    window.addEventListener('resize', resize);
    resize();

    // ---- kéo để xoay, chạm để tô ----
    var tapCb = null, down = null, ray = new T.Raycaster(), mouse = new T.Vector2();
    var el = renderer.domElement;
    el.addEventListener('pointerdown', function (e) {
      el.setPointerCapture(e.pointerId);
      down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
    });
    el.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - down.lx, dy = e.clientY - down.ly;
      if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 6) down.moved = true;
      down.lx = e.clientX; down.ly = e.clientY;
      if (down.moved) {
        var qy = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), dx * 0.011);
        var qx = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), dy * 0.011);
        cube.quaternion.premultiply(qy).premultiply(qx);
        draw();
      }
    });
    function up(e) {
      if (!down) return;
      var moved = down.moved; down = null;
      if (moved || !tapCb || animating) return;
      var rect = el.getBoundingClientRect();
      mouse.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      var hit = ray.intersectObjects(stickers, false)[0];
      if (hit) tapCb(hit.object.userData.index);
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', function () { down = null; });

    function setState(state) {
      for (var j = 0; j < 54; j++) stickerMats[j].color.setHex(COLORS[state[j]] !== undefined ? COLORS[state[j]] : COLORS['.']);
      draw();
    }

    function highlight(cells) {
      var set = {};
      (cells || []).forEach(function (c) { set[c] = true; });
      for (var j = 0; j < 54; j++) rings[j].visible = !!set[j];
      draw();
    }

    // quay một lớp có hoạt hình; newState được tô ngay khi quay xong
    function runMove(move, ms, newState, done) {
      var face = move[0], n = C.NORMAL[face];
      var times = move.length === 1 ? 1 : move[1] === '2' ? 2 : 3;
      var angle = -Math.PI / 2 * times;
      if (times === 3) angle = Math.PI / 2;
      var layer = [];
      Object.keys(cubies).forEach(function (k) {
        var c = cubies[k];
        if (c.pos[0] * n[0] + c.pos[1] * n[1] + c.pos[2] * n[2] === 1) layer.push(c.group);
      });
      layer.forEach(function (g) { pivot.add(g); });
      var axis = new T.Vector3(n[0], n[1], n[2]);
      var t0 = performance.now();
      animating = true;
      function step(now) {
        var t = Math.min(1, (now - t0) / ms);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pivot.quaternion.setFromAxisAngle(axis, angle * e);
        draw();
        if (t < 1) { requestAnimationFrame(step); return; }
        layer.forEach(function (g) { cube.add(g); });
        pivot.quaternion.identity();
        if (newState) setState(newState);
        animating = false;
        done();
      }
      requestAnimationFrame(step);
    }

    function pump() {
      if (animating || !queue.length) return;
      var it = queue.shift();
      if (it.ms <= 0) { setState(it.newState); it.resolve(); pump(); return; }
      runMove(it.move, it.ms, it.newState, function () { it.resolve(); pump(); });
    }

    return {
      setState: setState,
      highlight: highlight,
      animate: function (move, ms, newState) {
        return new Promise(function (resolve) {
          queue.push({ move: move, ms: ms, newState: newState, resolve: resolve });
          pump();
        });
      },
      isBusy: function () { return animating || queue.length > 0; },
      onTap: function (cb) { tapCb = cb; },
      resetView: function () { cube.quaternion.copy(VIEW_FRONT); draw(); },
      bottomView: function () { cube.quaternion.copy(VIEW_BOTTOM); draw(); },
      resize: resize,
      // dùng khi thử: toạ độ màn hình của một ô
      screenOf: function (idx) {
        var v = new T.Vector3();
        stickers[idx].getWorldPosition(v);
        v.project(camera);
        var rect = el.getBoundingClientRect();
        return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
      }
    };
  }

  root.View3D = { create: create, COLORS: COLORS };
})(window);
