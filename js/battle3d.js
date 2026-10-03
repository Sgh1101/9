/* ============================================================
   3D 전투 화면 — 전투 이벤트를 귀여운 애니메이션으로 재생
   ============================================================ */
'use strict';

const Battle3D = typeof THREE === 'undefined' ? null : (() => {
  let renderer = null, scene, camera, wrap, overlay, sun, hemi, board, unitsG, fxG;
  let U = {}, tweens = [], events = [], idx = 0, timer = null, spd = 1, done = true, onDone = null, onLog = null, raf = 0, last = 0, clk = 0, opts = {};
  let roundEl, bannerEl, shake = 0, intro = 0, vf = 0, hf = 0, fullDist = 16;
  const cam = { x: 0, z: 0, d: 16 }; let PITCH = 0.86, endView = false, camSign = -1;
  const bx = (x) => x - BW / 2 + 0.5, bz = (y) => y - BH / 2 + 0.5;
  const v3 = new THREE.Vector3();
  let M = null;

  function mats() { if (M) return M; M = { toon: MAT3.toon(), toonI: MAT3.toon(), sway: MAT3.swaying(), outline: MAT3.outline(0.022), basic: new THREE.MeshBasicMaterial({ vertexColors: true }) }; return M; }

  function ensure(container) {
    if (renderer) { if (renderer.domElement.parentNode !== container) { container.appendChild(renderer.domElement); container.appendChild(overlay); } wrap = container; return true; }
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { renderer = null; return false; }
    if (!renderer.getContext()) { renderer = null; return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'battle-canvas';
    wrap = container; container.appendChild(renderer.domElement);
    overlay = document.createElement('div'); overlay.className = 'b-overlay'; container.appendChild(overlay);
    scene = new THREE.Scene(); scene.background = new THREE.Color('#bfe9ff'); scene.fog = new THREE.Fog('#bfe9ff', 18, 40);
    camera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 100);
    hemi = new THREE.HemisphereLight('#eef8ff', '#9fc97f', 0.5); scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff2da', 0.75); sun.position.set(-5, 12, 7); sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536);
    const sc = sun.shadow.camera; sc.left = -10; sc.right = 10; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 40; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
    scene.add(sun);
    unitsG = new THREE.Group(); fxG = new THREE.Group(); scene.add(unitsG); scene.add(fxG);
    mats();
    return true;
  }
  function size() {
    const w = Math.max(280, wrap.clientWidth);
    endView = window.innerHeight > window.innerWidth * 1.15; // 세로 화면
    PITCH = endView ? 0.98 : 0.86; camSign = (opts.playerSide || 'A') === 'A' ? -1 : 1;
    const h = endView ? Math.round(Math.min(w * 1.45, Math.max(320, window.innerHeight - 330))) : Math.round(Math.min(470, Math.max(250, w * 0.62)));
    renderer.setSize(w, h); camera.aspect = w / h;
    vf = camera.fov * Math.PI / 180; hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    fullDist = endView ? fitDist(4.6, 7.8) : fitDist(7.6, 4.6);
    camera.updateProjectionMatrix();
    overlay.style.width = w + 'px'; overlay.style.height = h + 'px';
  }

  /* ── 전장 ────────────────────────────────────────────── */
  function buildBoard(o) {
    if (board) { scene.remove(board); }
    board = new THREE.Group(); scene.add(board);
    const sid = o.season || 'spring';
    const sky = { spring: '#bfe9ff', summer: '#aee3ff', autumn: '#ffe2c2', winter: '#dbe8f5' }[sid];
    scene.background.set(sky); scene.fog.color.set(sky);
    const c1 = { spring: '#9ddc73', summer: '#86d061', autumn: '#e0c56a', winter: '#eef5fa' }[sid], c2 = { spring: '#8fd166', summer: '#79c457', autumn: '#d4b85d', winter: '#e2ecf3' }[sid];
    const tiles = new THREE.InstancedMesh(MDL.tileGeo(), M.toonI, BW * BH); tiles.receiveShadow = true;
    tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BW * BH * 3), 3);
    const m4 = new THREE.Matrix4(), col = new THREE.Color(); let i = 0;
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      const h = 0.24 + ((x * 7 + y * 13) % 3) * 0.015;
      m4.makeScale(1, h, 1).setPosition(bx(x), 0, bz(y)); tiles.setMatrixAt(i, m4);
      col.set((x + y) % 2 ? c1 : c2); if (x < 5) col.lerp(new THREE.Color(o.colorA || '#ffc93d'), 0.1); if (x > 8) col.lerp(new THREE.Color(o.colorD || '#ff6f7d'), 0.08);
      tiles.setColorAt(i, col); i++;
    }
    board.add(tiles);
    const P = MDL.P, base = [];
    base.push(P('box', '#7cae50', [0, 0.0, 0], [BW + 0.5, 0.08, BH + 0.5]), P('box', '#c38c5c', [0, -0.25, 0], [BW + 0.42, 0.45, BH + 0.42]), P('box', '#f7e4ad', [0, -0.5, 0], [BW + 6, 0.08, BH + 6]));
    const bm = new THREE.Mesh(MDL.bake(base), M.toon); bm.receiveShadow = true; board.add(bm);
    // 가장자리 나무·바위·꽃 (지형에 따라)
    const deco = []; const rng = srand(o.seed || 7);
    const treeN = o.terrain === 'forest' ? 22 : 12, rockN = o.terrain === 'hill' ? 14 : 5;
    const edge = () => { const side = Math.floor(rng() * 4); const tt = rng(); if (side === 0) return [-BW / 2 - 0.9 - rng() * 1.6, (tt - 0.5) * (BH + 2)]; if (side === 1) return [BW / 2 + 0.9 + rng() * 1.6, (tt - 0.5) * (BH + 2)]; if (side === 2) return [(tt - 0.5) * (BW + 3), -BH / 2 - 0.9 - rng() * 1.2]; return [(tt - 0.5) * (BW + 3), BH / 2 + 1.6 + rng() * 1.2]; };
    const canC = { spring: '#9be27a', summer: '#5fc14f', autumn: '#ff9a3c', winter: '#f4f8ff' }[sid];
    for (let k = 0; k < treeN; k++) { const [x, z] = edge(); const s = 0.9 + rng() * 0.5; deco.push(...MDL.grp([P('cyl8', '#8f6038', [0, 0.14, 0], [0.09, 0.3, 0.09]), rng() < 0.5 ? P('ico1', k % 3 === 0 && sid === 'autumn' ? '#f2c84b' : canC, [0, 0.46, 0], [0.5, 0.46, 0.5]) : P('cone6', sid === 'winter' ? '#3d8a5a' : '#4fa868', [0, 0.45, 0], [0.5, 0.7, 0.5])], [x, -0.46, z], [0, rng() * 6, 0], s)); }
    for (let k = 0; k < rockN; k++) { const [x, z] = edge(); deco.push(P('dodec', ['#a29bb2', '#b3adc1'][k % 2], [x, -0.4, z], [0.5 + rng() * 0.5, 0.35, 0.45], [0.2, rng() * 6, 0])); }
    if (sid !== 'winter') for (let k = 0; k < 16; k++) { const [x, z] = edge(); deco.push(...MDL.grp([P('oct', ['#ff9cc2', '#ffffff', '#9ad7ff'][k % 3], [0, 0.1, 0], 0.09), P('oct', '#ffd23f', [0, 0.12, 0], 0.05)], [x, -0.46, z], [0, 0, 0], 1.4)); }
    // 진영 깃발
    for (const [side, c, x] of [['A', o.colorA, -BW / 2 - 0.6], ['D', o.colorD, BW / 2 + 0.6]]) { if (!c) continue; deco.push(MDL.seg([x, -0.46, -BH / 2 + 0.2], [x, 1.5, -BH / 2 + 0.2], 0.03, '#8f6038')); deco.push(P('box', c, [x + (side === 'A' ? 0.3 : -0.3), 1.3, -BH / 2 + 0.2], [0.6, 0.36, 0.03])); deco.push(P('box', MDL.shade(c, 0.8), [x + (side === 'A' ? 0.3 : -0.3), 1.18, -BH / 2 + 0.21], [0.6, 0.06, 0.03])); }
    const dm = new THREE.Mesh(MDL.bake(deco), M.toon); dm.castShadow = true; dm.receiveShadow = true; board.add(dm);
    hemi.intensity = sid === 'winter' ? 0.56 : 0.5;
  }

  /* ── 유닛 ────────────────────────────────────────────── */
  function geoFor(s) {
    if (s.isBuilding) return s.name && s.name.includes('요새') ? MDL.fort(s.side === 'A' ? opts.colorA : opts.colorD) : MDL.wall(s.side === 'A' ? opts.colorA : opts.colorD);
    if (s.monsterId) return MDL.monster(s.monsterId);
    const c = s.side === 'A' ? opts.colorA : opts.colorD; const tr = s.side === 'A' ? opts.trimA : opts.trimD;
    return MDL.unit(s.typeId, c || '#ffc93d', tr, s.heroId ? heroCape(s.heroId) : !!s.hero);
  }
  function addUnit(s, delay = 0) {
    const g = new THREE.Group(); const geo = geoFor(s);
    const mat = M.toon.clone(); mat.emissive = new THREE.Color('#000000');
    const body = new THREE.Mesh(geo, mat); body.castShadow = true;
    const k = s.isGiant ? 2.3 : s.isBuilding ? 1.05 : s.monsterId ? 1.12 : 1.15;
    const inner = new THREE.Group(); inner.add(body);
    let ol = null; if (!s.isBuilding) { ol = new THREE.Mesh(geo, M.outline); inner.add(ol); }
    inner.scale.setScalar(k); g.add(inner);
    const face = s.side === 'A' ? Math.PI / 2 : -Math.PI / 2; inner.rotation.y = s.isBuilding ? 0 : face;
    g.position.set(bx(s.x), 0.26, bz(s.y));
    const bub = new THREE.Mesh(new THREE.SphereGeometry(0.62 * (s.isGiant ? 2.3 : 1), 16, 12), new THREE.MeshBasicMaterial({ color: '#8fe3ff', transparent: true, opacity: 0, depthWrite: false })); bub.position.y = 0.45 * (s.isGiant ? 2 : 1); g.add(bub);
    unitsG.add(g);
    const hpEl = document.createElement('div'); hpEl.className = 'hpb ' + (s.side === 'A' ? 'a' : 'd') + (s.hero ? ' hero' : '');
    hpEl.innerHTML = `${s.hero ? `<span class="hn">${esc(s.hero)}</span>` : ''}<span class="bar"><i class="f"></i><i class="s"></i></span><span class="st"></span>`;
    overlay.appendChild(hpEl);
    const height = (geo.boundingBox ? geo.boundingBox.max.y : 1) * k;
    const r = { s, g, inner, body, ol, mat, bub, hpEl, fill: hpEl.querySelector('.f'), shEl: hpEl.querySelector('.s'), stEl: hpEl.querySelector('.st'), hp: s.hp, maxHp: s.maxHp, shield: s.shield || 0, alive: true, x: s.x, y: s.y, face, height, k, statuses: new Set(), fx: {} };
    U[s.uid] = r; updHp(r);
    inner.scale.setScalar(0.001);
    tw(0.42, (t) => inner.scale.setScalar(k * easeBack(t)), null, delay);
    return r;
  }
  function updHp(r) { r.fill.style.width = Math.max(0, r.hp / r.maxHp * 100) + '%'; r.shEl.style.width = Math.min(100, r.shield / r.maxHp * 100) + '%'; r.fill.className = 'f' + (r.hp / r.maxHp < 0.3 ? ' low' : ''); r.bub.material.opacity = r.shield > 0 ? 0.22 : 0; }

  /* ── 트윈 ────────────────────────────────────────────── */
  function tw(dur, fn, end, delayMs = 0) { tweens.push({ t0: clk + delayMs / 1000 / spd, dur: dur / spd, fn, end }); }
  const easeBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /* ── 효과 ────────────────────────────────────────────── */
  function float(r, text, cls) {
    const el = document.createElement('div'); el.className = 'ft ' + (cls || ''); el.textContent = text; overlay.appendChild(el);
    const p = r.g.position.clone(); p.y += r.height + 0.35; const jx = (Math.random() - 0.5) * 0.4; place(el, p);
    tw(0.9, (t) => { v3.set(p.x + jx, p.y + t * 0.9, p.z); place(el, v3); el.style.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3; el.style.scale = t < 0.15 ? 0.6 + t / 0.15 * 0.6 : 1.2 - Math.min(0.2, (t - 0.15)); }, () => el.remove());
  }
  function place(el, p) { v3.copy(p).project(camera); const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight; el.style.transform = `translate(${((v3.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v3.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%)`; }
  function puff(pos, color = '#ffffff', n = 6, size = 0.18) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      const a = i / n * Math.PI * 2, dir = new THREE.Vector3(Math.cos(a), 0.6 + Math.random() * 0.6, Math.sin(a)).multiplyScalar(0.5 + Math.random() * 0.4);
      m.position.copy(pos); fxG.add(m);
      tw(0.5, (t) => { m.position.set(pos.x + dir.x * easeOut(t), pos.y + dir.y * easeOut(t), pos.z + dir.z * easeOut(t)); m.scale.setScalar(1 - t * 0.7); m.material.opacity = 0.9 * (1 - t); }, () => { fxG.remove(m); m.geometry.dispose(); });
    }
  }
  function sparkle(pos, color) {
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(MDL.star(), new THREE.MeshBasicMaterial({ color })); m.scale.setScalar(0.35); fxG.add(m);
      const ox = (Math.random() - 0.5) * 0.6, oz = (Math.random() - 0.5) * 0.4;
      tw(0.7, (t) => { m.position.set(pos.x + ox, pos.y + t * 0.9, pos.z + oz); m.rotation.z = t * 4; m.scale.setScalar(0.35 * (1 - t)); }, () => fxG.remove(m), i * 60);
    }
  }
  function ring(r, color) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    m.rotation.x = Math.PI / 2; m.position.copy(r.g.position); m.position.y += 0.08; fxG.add(m);
    tw(0.55, (t) => { m.scale.setScalar(0.6 + t * 1.8); m.material.opacity = 0.9 * (1 - t); }, () => { fxG.remove(m); m.geometry.dispose(); });
  }
  function projectile(a, b, kind) {
    let geo, sc = 1;
    const tid = a.s.typeId || '', mid = a.s.monsterId || '';
    if (tid === 'siege_cat') geo = MDL.stone();
    else if (mid === 'skunk' || mid === 'g_rat' || mid === 'g_goat') { geo = new THREE.IcosahedronGeometry(0.16, 1); }
    else if (tid === 'bow_fire') geo = MDL.arrow('#ff7a2f'); else if (tid === 'bow_poison') geo = MDL.arrow('#9b6cff'); else { geo = MDL.arrow(); if (tid === 'siege_bal' || tid === 'bow_heavy') sc = 1.5; }
    const mat = geo.attributes.color ? M.toon : new THREE.MeshToonMaterial({ color: mid === 'skunk' ? '#9be36b' : '#c9a2ff', gradientMap: MAT3.grad });
    const m = new THREE.Mesh(geo, mat); m.scale.setScalar(sc); m.castShadow = true; fxG.add(m);
    const p0 = a.g.position.clone(); p0.y += a.height * 0.55; const p1 = b.g.position.clone(); p1.y += b.height * 0.5;
    const d = p0.distanceTo(p1), hgt = 0.5 + d * 0.12, dur = 0.16 + d * 0.025;
    const prev = new THREE.Vector3();
    tw(dur, (t) => { prev.copy(m.position); m.position.lerpVectors(p0, p1, t); m.position.y += Math.sin(Math.PI * t) * hgt; if (t > 0.01) m.lookAt(prev.lerp(m.position, 2)); }, () => { fxG.remove(m); if (kind === 'skill') puff(p1, '#fff3a8', 5, 0.12); });
    if (tid === 'bow_fire') { const fl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffb347' })); m.add(fl); fl.position.z = 0.25; }
  }
  function flash(r, color = '#ff3b3b') { r.mat.emissive.set(color); tw(0.2, (t) => r.mat.emissive.setRGB(...(new THREE.Color(color).multiplyScalar(1 - t)).toArray()), () => r.mat.emissive.set('#000000')); }
  function setStatus(r, id, on) {
    if (on) r.statuses.add(id); else r.statuses.delete(id);
    const names = [...r.statuses].map(k => STATUS_NAMES[k]).filter(Boolean).slice(0, 3);
    r.stEl.textContent = names.join(' · ');
    if (id === 'stun') {
      if (on && !r.fx.stun) { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(MDL.star(), new THREE.MeshBasicMaterial({ color: '#ffd23f' })); st.scale.setScalar(0.32); const a = i / 3 * Math.PI * 2; st.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); g.add(st); } g.position.y = r.height + 0.12; r.g.add(g); r.fx.stun = g; }
      if (!on && r.fx.stun) { r.g.remove(r.fx.stun); r.fx.stun = null; }
    }
    const glow = { poison: '#8ee36b', skunk: '#8ee36b', plague: '#b1d66b', burn: '#ff8a3c', bleed: '#ff5d6c', fear: '#b98cff', link: '#ff8fd0', mark: '#ff5d6c' };
    if (glow[id]) {
      if (on && !r.fx[id]) { const m = new THREE.Mesh(new THREE.TorusGeometry(0.42 * (r.s.isGiant ? 2.2 : 1), 0.035, 4, 24), new THREE.MeshBasicMaterial({ color: glow[id], transparent: true, opacity: 0.8 })); m.rotation.x = Math.PI / 2; m.position.y = id === 'mark' ? r.height + 0.25 : 0.05 + Object.keys(r.fx).length * 0.03; r.g.add(m); r.fx[id] = m; }
      if (!on && r.fx[id]) { r.g.remove(r.fx[id]); delete r.fx[id]; }
    }
  }
  function faceTo(r, tx, tz) { const dx = tx - r.g.position.x, dz = tz - r.g.position.z; if (Math.abs(dx) + Math.abs(dz) < 0.01 || r.s.isBuilding) return; r.inner.rotation.y = Math.atan2(dx, dz); }

  /* ── 재생 ────────────────────────────────────────────── */
  function open(container, res, o) {
    if (!ensure(container)) return false;
    close(true);
    opts = o || {}; spd = 1; done = false; onDone = opts.onDone; onLog = opts.onLog; events = res.events; idx = 0; clk = 0; tweens = []; shake = 0; intro = 1;
    U = {}; while (unitsG.children.length) unitsG.remove(unitsG.children[0]); while (fxG.children.length) fxG.remove(fxG.children[0]); overlay.innerHTML = '';
    roundEl = document.createElement('div'); roundEl.className = 'b-round'; roundEl.textContent = '준비'; overlay.appendChild(roundEl);
    bannerEl = document.createElement('div'); bannerEl.className = 'b-banner'; overlay.appendChild(bannerEl);
    buildBoard(opts); size(); cam.x = 0; cam.z = 0; cam.d = fullDist;
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    timer = setTimeout(step, 250);
    return true;
  }
  function step() {
    if (done && idx >= events.length) return;
    if (idx >= events.length) { finish(); return; }
    const e = events[idx++]; let delay = 0;
    delay = apply(e, true);
    timer = setTimeout(step, delay / spd);
  }
  function apply(e, anim) {
    const R = (id) => U[id];
    switch (e.t) {
      case 'init': e.units.forEach((s, i) => addUnit(s, anim ? i * 35 : 0)); if (anim) banner('전투 시작!', 'start'); return anim ? 600 + e.units.length * 25 : 0;
      case 'spawn': { const r = addUnit(e.unit, 0); if (anim) puff(r.g.position.clone().setY(0.6), '#ffffff', 6); return 260; }
      case 'round': roundEl.textContent = '턴 ' + e.n; return anim ? 140 : 0;
      case 'move': {
        const r = R(e.uid); if (!r || !r.alive) return 0; const path = e.path; const last = path[path.length - 1];
        if (!anim) { r.g.position.set(bx(last[0]), 0.26, bz(last[1])); r.x = last[0]; r.y = last[1]; return 0; }
        const from = r.g.position.clone(); const pts = [from, ...path.map(p => new THREE.Vector3(bx(p[0]), 0.26, bz(p[1])))];
        const segD = 0.13; faceTo(r, pts[1].x, pts[1].z);
        tw(segD * (pts.length - 1), (t) => { const f = t * (pts.length - 1); const i = Math.min(pts.length - 2, Math.floor(f)); const lt = f - i; r.g.position.lerpVectors(pts[i], pts[i + 1], lt); r.g.position.y = 0.26 + Math.sin(Math.PI * lt) * 0.28; r.inner.scale.set(r.k * (1 + Math.sin(Math.PI * lt) * 0.06), r.k * (1 - Math.sin(Math.PI * lt) * 0.08 + 0.04), r.k); if (lt < 0.1) faceTo(r, pts[i + 1].x, pts[i + 1].z); }, () => { r.g.position.copy(pts[pts.length - 1]); r.inner.scale.setScalar(r.k); });
        r.x = last[0]; r.y = last[1];
        return 120 + 60 * (pts.length - 1);
      }
      case 'attack': {
        const a = R(e.uid), b = R(e.tid); if (!a || !b || !a.alive) return 0; if (!anim) return 0;
        faceTo(a, b.g.position.x, b.g.position.z);
        if (e.skill) { ring(a, '#ffd23f'); bubble(a, e.skill); }
        const d = a.g.position.distanceTo(b.g.position);
        if (d > (b.s.isGiant || a.s.isGiant ? 2.6 : 1.6) || a.s.isBuilding) projectile(a, b, e.skill ? 'skill' : '');
        else { const p0 = a.g.position.clone(), dir = b.g.position.clone().sub(p0).setY(0).normalize().multiplyScalar(0.38); tw(0.22, (t) => { const k = Math.sin(Math.PI * t); a.g.position.set(p0.x + dir.x * k, 0.26 + k * (e.skill ? 0.35 : 0.08), p0.z + dir.z * k); }, () => a.g.position.copy(p0)); }
        if (e.skill) { const s0 = a.k; tw(0.3, (t) => { a.inner.scale.setScalar(s0 * (1 + Math.sin(Math.PI * t) * 0.18)); }, () => a.inner.scale.setScalar(s0)); }
        return e.skill ? 300 : 150;
      }
      case 'dmg': {
        const r = R(e.uid); if (!r) return 0; r.hp = e.hp; updHp(r); if (!anim) return 0;
        if (e.amount > 0) { flash(r, e.fixed ? '#b05cff' : '#ff3030'); float(r, '-' + e.amount, e.crit ? 'crit' : e.fixed ? 'fixed' : ''); const p0 = r.inner.position.clone(); tw(0.16, (t) => { r.inner.position.x = p0.x + Math.sin(t * 30) * 0.05 * (1 - t); }, () => r.inner.position.copy(p0)); if (e.crit) { shake = 0.18; float(r, '치명!', 'critword'); } }
        return 75;
      }
      case 'heal': { const r = R(e.uid); if (!r) return 0; r.hp = e.hp; updHp(r); if (anim && e.amount > 0) { float(r, '+' + e.amount, 'heal'); sparkle(r.g.position.clone().setY(0.6), '#7ee081'); } return anim ? 55 : 0; }
      case 'shield': { const r = R(e.uid); if (!r) return 0; const up = e.shield > r.shield; r.shield = e.shield; updHp(r); if (anim && up) { r.bub.scale.setScalar(0.4); tw(0.3, (t) => r.bub.scale.setScalar(0.4 + easeBack(t) * 0.6)); } if (anim && e.absorbed) float(r, '막음 ' + e.absorbed, 'shield'); return anim ? 25 : 0; }
      case 'dodge': { const r = R(e.uid); if (!r || !anim) return 0; float(r, '회피!', 'dodge'); const p0 = r.inner.position.clone(); tw(0.25, (t) => { r.inner.position.z = p0.z + Math.sin(Math.PI * t) * 0.35; }, () => r.inner.position.copy(p0)); return 70; }
      case 'status': { const r = R(e.uid); if (!r) return 0; setStatus(r, e.id, e.on); if (anim && e.on && STATUS_NAMES[e.id]) float(r, STATUS_NAMES[e.id], 'status'); return anim ? 35 : 0; }
      case 'skip': { const r = R(e.uid); if (!r || !anim) return 0; float(r, e.why, 'status'); const z0 = r.inner.rotation.z; tw(0.3, (t) => { r.inner.rotation.z = z0 + Math.sin(t * 20) * 0.1 * (1 - t); }, () => r.inner.rotation.z = z0); return 80; }
      case 'die': {
        const r = R(e.uid); if (!r) return 0; r.alive = false; r.hpEl.remove();
        if (!anim) { unitsG.remove(r.g); return 0; }
        const p = r.g.position.clone(); p.y = 0.5; puff(p, '#ffffff', 7, r.s.isGiant ? 0.4 : 0.2);
        r.mat.transparent = true; const y0 = r.g.position.y;
        tw(0.45, (t) => { r.inner.rotation.x = -easeOut(t) * 1.4; r.g.position.y = y0 - t * 0.2; r.mat.opacity = 1 - t; if (r.ol) r.ol.visible = t < 0.4; }, () => unitsG.remove(r.g));
        return 170;
      }
      case 'log': if (onLog) onLog(e); return 0;
      case 'end': { if (anim) finish(e.winner); return 0; }
    }
    return 0;
  }
  function bubble(r, text) { const el = document.createElement('div'); el.className = 'skill-bubble'; el.textContent = text; overlay.appendChild(el); const p = r.g.position.clone(); p.y += r.height + 0.6; place(el, p); tw(1.1, (t) => { v3.copy(p); v3.y += t * 0.3; place(el, v3); el.style.opacity = t < 0.8 ? 1 : (1 - t) / 0.2; el.style.scale = t < 0.12 ? 0.5 + t / 0.12 * 0.5 : 1; }, () => el.remove()); }
  function banner(text, cls) { bannerEl.textContent = text; bannerEl.className = 'b-banner show ' + (cls || ''); if (cls === 'start') setTimeout(() => { if (bannerEl.className.includes('start')) bannerEl.className = 'b-banner'; }, 900); }
  function finish(winner) {
    if (done) return; done = true;
    if (winner === undefined) { const endE = events.find(e => e.t === 'end'); winner = endE ? endE.winner : 'draw'; }
    const mine = opts.playerSide || 'A'; const win = winner === mine, draw = winner === 'draw';
    banner(win ? '승리!' : draw ? '무승부' : '패배…', win ? 'win' : draw ? 'draw' : 'lose');
    if (win) confetti();
    if (onDone) onDone(winner);
  }
  function confetti() {
    const cols = ['#ffd23f', '#ff6f7d', '#59b4ff', '#4fd18b', '#ac78ff', '#ffffff'];
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.24), new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide }));
      const x = (Math.random() - 0.5) * 12, z = (Math.random() - 0.5) * 6, rs = Math.random() * 5 + 2;
      fxG.add(m);
      tw(2.2, (t) => { m.position.set(x + Math.sin(t * 6 + i) * 0.4, 7 - t * 7.5, z); m.rotation.set(t * rs, t * rs * 0.7, 0); }, () => fxG.remove(m), Math.random() * 600);
    }
  }
  function skip() {
    if (!renderer || done) return; clearTimeout(timer);
    while (idx < events.length) { const e = events[idx++]; if (e.t === 'end') continue; apply(e, false); }
    for (const t of tweens.splice(0)) { try { t.fn(1); if (t.end) t.end(); } catch (e) { /* 무시 */ } }
    overlay.querySelectorAll('.ft, .skill-bubble').forEach(el => el.remove());
    for (const r of Object.values(U)) { r.inner.scale.setScalar(r.k); r.inner.position.set(0, 0, 0); if (r.alive) r.g.position.set(bx(r.x), 0.26, bz(r.y)); }
    finish();
  }
  function setSpeed(s) { spd = s; }
  function close(keep) { clearTimeout(timer); cancelAnimationFrame(raf); raf = 0; if (!keep) { done = true; } }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clk += dt;
    for (const t of tweens.slice()) { if (clk < t.t0) continue; const k = Math.min(1, (clk - t.t0) / t.dur); t.fn(k); if (k >= 1) { tweens.splice(tweens.indexOf(t), 1); if (t.end) t.end(); } }
    // 대기 동작: 숨쉬기
    for (const r of Object.values(U)) {
      if (!r.alive) continue;
      if (r.fx.stun) r.fx.stun.rotation.y += dt * 4;
      place(r.hpEl, v3.copy(r.g.position).setY(r.g.position.y + r.height + 0.12));
    }
    intro = Math.max(0, intro - dt * 1.2);
    frameCamera(dt);
    const e = easeOut(1 - intro), d = cam.d + (1 - e) * 5;
    if (endView) camera.position.set(cam.x + camSign * Math.cos(PITCH) * d, Math.sin(PITCH) * d + 0.3, cam.z + Math.sin(clk * 0.35) * 0.18);
    else camera.position.set(cam.x + Math.sin(clk * 0.35) * 0.18, Math.sin(PITCH) * d + 0.3, cam.z + Math.cos(PITCH) * d);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt); }
    camera.lookAt(cam.x, 0.45, cam.z);
    renderer.render(scene, camera);
  }
  function resize() { if (renderer && wrap) size(); }
  function fitDist(ex, ez) { return Math.max(ex / Math.tan(hf / 2), (ez * 0.82 + 0.9) / Math.tan(vf / 2)) * 1.04; }
  function frameCamera(dt) {
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, n = 0;
    for (const r of Object.values(U)) { if (!r.alive) continue; const p = r.g.position, m = r.s.isGiant ? 1.6 : 0.6; minx = Math.min(minx, p.x - m); maxx = Math.max(maxx, p.x + m); minz = Math.min(minz, p.z - m); maxz = Math.max(maxz, p.z + m); n++; }
    let tx = 0, tz = 0, td = fullDist;
    if (n) {
      tx = (minx + maxx) / 2; tz = (minz + maxz) / 2;
      const ax = Math.max(endView ? 2.6 : 3.4, (maxx - minx) / 2 + 1.2), az = Math.max(endView ? 2.4 : 2.2, (maxz - minz) / 2 + 1.0);
      td = Math.min(fullDist, Math.max(endView ? 7.5 : 8.5, endView ? fitDist(az, ax) : fitDist(ax, az)));
    }
    const k = 1 - Math.exp(-dt * 2.2); cam.x += (tx - cam.x) * k; cam.z += (tz - cam.z) * k; cam.d += (td - cam.d) * k;
  }

  return { open, skip, setSpeed, close, resize, get ok() { return !!renderer; } };
})();
