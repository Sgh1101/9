/* ============================================================
   3D 전투 화면 — 들판 위에서 병사들이 걷고, 찌르고, 베고, 활을 당기는 재생
   전투 계산은 battle.js(격자 턴제)가 하고, 여기서는 그 이벤트를 받아
   관절 모델(몸통·팔·다리·말)을 움직여 실제 전장처럼 보여 준다.
   ============================================================ */
'use strict';

const Battle3D = typeof THREE === 'undefined' ? null : (() => {
  let renderer = null, scene, camera, wrap, overlay, sun, hemi, board, unitsG, fxG;
  let U = {}, tweens = [], events = [], idx = 0, timer = null, spd = 1, done = true, onDone = null, onLog = null, raf = 0, last = 0, clk = 0, opts = {};
  let roundEl, bannerEl, shake = 0, intro = 0, vf = 0, hf = 0, fullDist = 16, guardT = 0;
  const cam = { x: 0, z: 0, d: 16 }; let PITCH = 0.78, endView = false, camSign = -1, zoomK = 1;
  const view = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0 }; // 사용자가 돌린 시점 (기본 시점에 더해진다)
  const GY = 0.05; // 발이 닿는 높이
  const SX = 1.35; // 격자보다 가로로 넓게 퍼진 평원
  const bx = (x) => (x - BW / 2 + 0.5) * SX, bz = (y) => y - BH / 2 + 0.5;
  const jit = (r) => { if (!r.j) { const h = [...String(r.s.uid)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7); r.j = r.s.isBuilding || r.s.isGiant ? [0, 0] : [((h % 100) / 100 - 0.5) * 0.34, (((h >> 7) % 100) / 100 - 0.5) * 0.34]; } return r.j; };
  const wpos = (r, x, y) => { const j = jit(r); return new THREE.Vector3(bx(x) + j[0], GY, bz(y) + j[1]); };
  const v3 = new THREE.Vector3(), v3b = new THREE.Vector3();
  let M = null;
  const SH = {}; const shared = (k, make) => SH[k] || (SH[k] = keepAll(make()));
  function keepAll(x) { x.userData.keep = true; return x; }
  // 전투마다 새로 만든 지오메트리·재질 정리 (공유·캐시된 것은 제외)
  function disposeTree(o) { o.traverse(c => { if (c.geometry && !c.geometry.userData.keep) c.geometry.dispose(); if (c.material && !c.material.userData.keep) c.material.dispose(); }); }
  const keep = (g) => { g.userData.keep = true; return g; }; const own = (m) => { m.userData.own = true; return m; };
  function mats() { if (M) return M; M = { toon: MAT3.toon(), toonI: MAT3.toon(), sway: MAT3.swaying(), outline: MAT3.outline(0.022), basic: new THREE.MeshBasicMaterial({ vertexColors: true }) }; for (const m of Object.values(M)) m.userData.keep = true; return M; }
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t) => t * t;

  function ensure(container) {
    if (renderer) { if (renderer.domElement.parentNode !== container) { container.appendChild(renderer.domElement); container.appendChild(overlay); } wrap = container; return true; }
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); } catch (e) { renderer = null; return false; }
    if (!renderer.getContext()) { renderer = null; return false; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'battle-canvas';
    wrap = container; container.appendChild(renderer.domElement);
    overlay = document.createElement('div'); overlay.className = 'b-overlay'; container.appendChild(overlay);
    scene = new THREE.Scene(); scene.background = new THREE.Color('#bfe9ff'); scene.fog = new THREE.Fog('#bfe9ff', 18, 44);
    camera = new THREE.PerspectiveCamera(36, 1.6, 0.1, 100);
    hemi = new THREE.HemisphereLight('#eef8ff', '#9fc97f', 0.5); scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff2da', 0.78); sun.position.set(-5, 12, 7); sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536);
    const sc = sun.shadow.camera; sc.left = -11; sc.right = 11; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 40; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
    scene.add(sun);
    unitsG = new THREE.Group(); fxG = new THREE.Group(); scene.add(unitsG); scene.add(fxG);
    mats();
    return true;
  }
  function size() {
    const w = Math.max(280, wrap.clientWidth);
    endView = window.innerHeight > window.innerWidth * 1.15; // 세로 화면
    PITCH = endView ? 0.82 : 0.64; camSign = (opts.playerSide || 'A') === 'A' ? -1 : 1;
    const h = endView ? Math.round(Math.min(w * 1.45, Math.max(320, window.innerHeight - 330))) : Math.round(Math.min(470, Math.max(250, w * 0.62)));
    renderer.setSize(w, h); camera.aspect = w / h;
    vf = camera.fov * Math.PI / 180; hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    fullDist = endView ? fitDist(4.6, 7.8 * SX) : fitDist(7.6 * SX, 4.6);
    camera.updateProjectionMatrix();
    overlay.style.width = w + 'px'; overlay.style.height = h + 'px';
  }

  /* ── 전장: 격자 없는 들판 ─────────────────────────────── */
  function buildBoard(o) {
    if (board) { scene.remove(board); disposeTree(board); }
    board = new THREE.Group(); scene.add(board);
    const sid = o.season || 'spring'; const rng = srand(o.seed || 7);
    const sky = { spring: '#bfe9ff', summer: '#aee3ff', autumn: '#ffe2c2', winter: '#dbe8f5' }[sid];
    scene.background.set(sky); scene.fog.color.set(sky);
    const G1 = { spring: '#8fd468', summer: '#7cc95a', autumn: '#d8be62', winter: '#eef5fa' }[sid], G2 = { spring: '#a6e07e', summer: '#93d96d', autumn: '#e6cf74', winter: '#e3ecf4' }[sid], DIRT = { spring: '#cfbf93', summer: '#c8b98a', autumn: '#c9ad78', winter: '#dcdad2' }[sid];
    // 땅: 정점색 노이즈 (풀밭 + 밟힌 흙길), 살짝 울퉁불퉁
    const W = Math.round(BW * SX) + 14, H = BH + 10, seg = 2;
    const geo = new THREE.PlaneGeometry(W, H, W * seg, H * seg); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3); const c1 = new THREE.Color(G1), c2 = new THREE.Color(G2), cd = new THREE.Color(DIRT), tmp = new THREE.Color();
    const nz = (x, z, k) => { const s = Math.sin(x * 1.7 + k) * Math.cos(z * 2.3 + k * 0.7) + Math.sin(x * 0.6 - z * 0.9 + k) * 0.6; return s / 1.6; };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i); const inside = Math.abs(x) < BW * SX / 2 + 0.8 && Math.abs(z) < BH / 2 + 0.6;
      pos.setY(i, inside ? 0.03 + nz(x, z, 3) * 0.03 : 0.04 + nz(x, z, 9) * 0.05); // 받침 상자(-0.1) 위에 늘 떠 있게
      const n = nz(x, z, 1); tmp.copy(c1).lerp(c2, n * 0.5 + 0.5);
      const road = Math.max(0, 1 - Math.abs(z + nz(x, 0, 5) * 1.2) / 1.6) * (inside ? 1 : 0.3); const patch = Math.max(0, nz(x * 0.7, z * 0.7, 7) - 0.62) * 1.6;
      tmp.lerp(cd, Math.min(0.55, road * 0.45 + patch * 0.5));
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, M.toon); ground.receiveShadow = true; board.add(ground);
    const P = MDL.P;
    const base = [P('box', '#c38c5c', [0, -0.36, 0], [W, 0.5, H]), P('box', '#f7e4ad', [0, -0.62, 0], [W + 4, 0.08, H + 4])];
    const bm = new THREE.Mesh(MDL.bake(base), M.toon); bm.receiveShadow = true; board.add(bm);
    // 풀·꽃 (들판 전체에)
    if (sid !== 'winter') {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
      const gm = new THREE.InstancedMesh(MDL.grass(), M.toonI, 320); gm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(320 * 3).fill(1), 3);
      for (let i = 0; i < 320; i++) { const x = (rng() - 0.5) * (BW * SX + 8), z = (rng() - 0.5) * (BH + 6); e.set(0, rng() * 6, 0); q.setFromEuler(e); const s = 1.1 + rng() * 0.9; sv.set(s, s, s); pv.set(x, 0.01, z); m4.compose(pv, q, sv); gm.setMatrixAt(i, m4); }
      gm.instanceMatrix.needsUpdate = true; board.add(gm);
      const fcols = ['#ff9cc2', '#ffffff', '#9ad7ff']; const flw = fcols.map(c => { const im = new THREE.InstancedMesh(MDL.flower(c), M.toonI, 24); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(24 * 3).fill(1), 3); im.count = 0; return im; });
      for (let i = 0; i < 60; i++) { const im = flw[i % 3]; const x = (rng() - 0.5) * (BW * SX + 8), z = (rng() - 0.5) * (BH + 6); e.set(0, rng() * 6, 0); q.setFromEuler(e); sv.set(1.3, 1.3, 1.3); pv.set(x, 0.01, z); m4.compose(pv, q, sv); im.setMatrixAt(im.count++, m4); }
      flw.forEach(im => { im.instanceMatrix.needsUpdate = true; board.add(im); });
    }
    // 가장자리 나무·바위, 양 진영 천막·깃발
    const deco = [];
    const treeN = o.terrain === 'forest' ? 26 : 14, rockN = o.terrain === 'hill' ? 16 : 6;
    const HW = BW * SX / 2; const edge = () => { const side = Math.floor(rng() * 4); const tt = rng(); if (side === 0) return [-HW - 1.4 - rng() * 2.2, (tt - 0.5) * (BH + 3)]; if (side === 1) return [HW + 1.4 + rng() * 2.2, (tt - 0.5) * (BH + 3)]; if (side === 2) return [(tt - 0.5) * (HW * 2 + 6), -BH / 2 - 1.2 - rng() * 1.8]; return [(tt - 0.5) * (HW * 2 + 6), BH / 2 + 1.6 + rng() * 1.6]; };
    const canC = { spring: '#9be27a', summer: '#5fc14f', autumn: '#ff9a3c', winter: '#f4f8ff' }[sid];
    for (let k = 0; k < treeN; k++) { const [x, z] = edge(); const s = 0.9 + rng() * 0.6; deco.push(...MDL.grp([P('cyl8', '#8f6038', [0, 0.14, 0], [0.09, 0.3, 0.09]), rng() < 0.5 ? P('ico1', k % 3 === 0 && sid === 'autumn' ? '#f2c84b' : canC, [0, 0.46, 0], [0.5, 0.46, 0.5]) : P('cone6', sid === 'winter' ? '#3d8a5a' : '#4fa868', [0, 0.45, 0], [0.5, 0.7, 0.5])], [x, 0, z], [0, rng() * 6, 0], s)); }
    for (let k = 0; k < rockN; k++) { const [x, z] = edge(); deco.push(P('dodec', ['#a29bb2', '#b3adc1'][k % 2], [x, 0.05, z], [0.5 + rng() * 0.5, 0.35, 0.45], [0.2, rng() * 6, 0])); }
    for (let k = 0; k < 3; k++) { deco.push(P('dodec', '#9a93a8', [(rng() - 0.5) * HW * 2, 0.02, (rng() - 0.5) * BH], [0.22, 0.1, 0.18], [0, rng() * 6, 0])); }
    for (let k = 0; k < 5; k++) { const x = (rng() - 0.5) * HW * 1.6, z = (rng() - 0.5) * BH; deco.push(MDL.seg([x, 0, z], [x + 0.2, 0.9, z + 0.1], 0.02, '#8f6038')); deco.push(P('cone', '#d3dcea', [x + 0.22, 0.98, z + 0.11], [0.06, 0.16, 0.06], [0.1, 0, -0.2])); } // 땅에 꽂힌 창
    for (const [side, c, x] of [['A', o.colorA, -HW - 1.1], ['D', o.colorD, HW + 1.1]]) {
      if (!c) continue; const dir = side === 'A' ? 1 : -1;
      deco.push(MDL.seg([x, 0, -BH / 2 + 0.4], [x, 1.7, -BH / 2 + 0.4], 0.03, '#8f6038')); deco.push(P('box', c, [x + dir * 0.32, 1.48, -BH / 2 + 0.4], [0.64, 0.4, 0.03])); deco.push(P('box', MDL.shade(c, 0.8), [x + dir * 0.32, 1.33, -BH / 2 + 0.41], [0.64, 0.07, 0.03]));
      deco.push(P('cone6', '#f3e2bd', [x - dir * 1.1, 0.4, BH / 2 - 0.6], [1.3, 0.8, 1.3])); deco.push(P('cone6', c, [x - dir * 1.1, 0.68, BH / 2 - 0.6], [0.7, 0.4, 0.7])); deco.push(P('box', '#3b3449', [x - dir * 1.1 + dir * 0.55, 0.18, BH / 2 - 0.6], [0.08, 0.3, 0.26]));
    }
    const dm = new THREE.Mesh(MDL.bake(deco), M.toon); dm.castShadow = true; dm.receiveShadow = true; board.add(dm);
    hemi.intensity = sid === 'winter' ? 0.56 : 0.5;
  }

  /* ── 유닛 (관절 모델) ────────────────────────────────── */
  const THRUST = new Set(['spear', 'javelin', 'halberd', 'shortspear', 'lance']), SLASH = new Set(['sword', 'longsword', 'axe', 'bigaxe', 'club', 'hammer', 'dagger', 'glaive']);
  function colorsOf(s) { return s.side === 'A' ? [opts.colorA || '#ffc93d', opts.trimA] : [opts.colorD || '#ff6f7d', opts.trimD]; }
  function part(r, geo, pos) { if (!geo) return null; const m = new THREE.Mesh(geo, r.mat); m.castShadow = true; if (pos) m.position.set(pos[0], pos[1], pos[2]); const ol = new THREE.Mesh(geo, M.outline); m.add(ol); r.rig.add(m); return m; }
  function addUnit(s, delay = 0) {
    const g = new THREE.Group(); const inner = new THREE.Group(); const rig = new THREE.Group(); g.add(inner); inner.add(rig);
    const mat = own(M.toon.clone()); mat.emissive = new THREE.Color('#000000');
    const r = { s, g, inner, rig, mat, parts: {}, alive: true, x: s.x, y: s.y, k: 1, height: 1, kind: 'unit', w: null, walking: 0, wp: Math.random() * 6, pose: { armR: 0, armL: 0, armRz: 0, armLz: 0, lean: 0, lunge: 0, squash: 0, busy: false }, statuses: new Set(), fx: {}, hp: s.hp, maxHp: s.maxHp, shield: s.shield || 0 };
    let height = 1;
    if (s.isBuilding) {
      const [c] = colorsOf(s); const geo = s.name && s.name.includes('요새') ? MDL.fort(c) : MDL.wall(c);
      r.parts.body = part(r, geo); r.parts.body.children[0].visible = false; r.kind = 'building'; r.k = 1.05; height = (geo.boundingBox ? geo.boundingBox.max.y : 1) * r.k;
    } else if (s.monsterId) {
      const geo = MDL.monster(s.monsterId); r.parts.body = part(r, geo); r.kind = 'monster'; r.k = s.isGiant ? 2.3 : 1.12; height = (geo.boundingBox ? geo.boundingBox.max.y : 1) * r.k;
    } else {
      const [c, tr] = colorsOf(s); const rigG = MDL.unitRig(s.typeId, c, tr, s.heroId ? heroCape(s.heroId) : !!s.hero);
      r.k = 1.15; r.w = rigG.w;
      if (rigG.siege) { r.parts.body = part(r, rigG.body); r.kind = 'siege'; height = rigG.body.boundingBox.max.y * r.k; }
      else {
        r.kind = rigG.rider ? 'rider' : 'foot';
        if (rigG.mount) r.parts.mount = part(r, rigG.mount);
        r.parts.body = part(r, rigG.body); r.parts.armR = part(r, rigG.armR, rigG.pivR); r.parts.armL = part(r, rigG.armL, rigG.pivL);
        r.parts.legL = part(r, rigG.legL, rigG.hipL); r.parts.legR = part(r, rigG.legR, rigG.hipR);
        r.sh = rigG.sh; height = (rigG.body.boundingBox.max.y + 0.1) * r.k;
      }
    }
    inner.scale.setScalar(r.k); r.height = height;
    const face = s.side === 'A' ? Math.PI / 2 : -Math.PI / 2; inner.rotation.y = s.isBuilding ? 0 : face; r.face = face; r.tyaw = inner.rotation.y;
    g.position.copy(wpos(r, s.x, s.y));
    const bub = new THREE.Mesh(shared('bub', () => keep(new THREE.SphereGeometry(0.62, 16, 12))), own(new THREE.MeshBasicMaterial({ color: '#8fe3ff', transparent: true, opacity: 0, depthWrite: false }))); bub.scale.setScalar(s.isGiant ? 2.3 : 1); bub.position.y = 0.45 * (s.isGiant ? 2 : 1); g.add(bub); r.bub = bub;
    unitsG.add(g);
    const hpEl = document.createElement('div'); hpEl.className = 'hpb ' + (s.side === 'A' ? 'a' : 'd') + (s.hero ? ' hero' : '');
    hpEl.innerHTML = `${s.hero ? `<span class="hn">${esc(s.hero)}</span>` : ''}<span class="bar"><i class="f"></i><i class="s"></i></span><span class="st"></span>`;
    overlay.appendChild(hpEl);
    Object.assign(r, { hpEl, fill: hpEl.querySelector('.f'), shEl: hpEl.querySelector('.s'), stEl: hpEl.querySelector('.st') });
    U[s.uid] = r; updHp(r);
    inner.scale.setScalar(0.001);
    tw(0.42, (t) => inner.scale.setScalar(r.k * easeBack(t)), null, delay);
    return r;
  }
  function updHp(r) { r.fill.style.width = Math.max(0, r.hp / r.maxHp * 100) + '%'; r.shEl.style.width = Math.min(100, r.shield / r.maxHp * 100) + '%'; r.fill.className = 'f' + (r.hp / r.maxHp < 0.3 ? ' low' : ''); r.bub.material.opacity = r.shield > 0 ? 0.22 : 0; }
  // 매 프레임: 걷기·숨쉬기·자세를 관절에 반영
  function guardCheck() {
    const list = Object.values(U).filter(r => r.alive);
    for (const r of list) {
      if (r.kind !== 'foot' && r.kind !== 'rider') continue;
      let best = null, bd = 9;
      for (const o of list) { if (o.s.side === r.s.side) continue; const d = r.g.position.distanceTo(o.g.position); if (d < bd) { bd = d; best = o; } }
      r.guard = best && bd < 2.1 && r.w !== 'bow' && r.w !== 'crossbow' && r.w !== 'heavycrossbow' ? 1 : 0;
      if (best && bd < 2.1 && !r.walking && !r.pose.busy) faceTo(r, best.g.position.x, best.g.position.z);
      else if (r.tyaw == null) r.tyaw = r.inner.rotation.y;
    }
  }
  function animate(r, dt) {
    const p = r.pose, P = r.parts;
    r.gdK = r.gdK == null ? 0 : r.gdK + (((r.guard && !r.walking && !p.busy) ? 1 : 0) - r.gdK) * (1 - Math.exp(-dt * 6)); const gd = r.gdK; // 대치 중: 무기를 앞으로, 방패를 올린다 (서서히)
    turnStep(r, dt);
    if (r.walking) r.wp += dt * 11;
    const w = r.walking, ph = r.wp, idle = Math.sin(clk * 2.2 + r.wp) * 0.03;
    if (P.legL) { P.legL.rotation.x = Math.sin(ph) * 0.75 * w; P.legR.rotation.x = -Math.sin(ph) * 0.75 * w; }
    if (P.armR) { P.armR.rotation.x = p.armR + (p.busy ? 0 : -Math.sin(ph) * 0.45 * w + idle) + gd * (0.75 + Math.sin(clk * 3 + r.wp) * 0.12); P.armR.rotation.z = p.armRz; }
    if (P.armL) { P.armL.rotation.x = p.armL + (p.busy ? 0 : Math.sin(ph) * 0.45 * w - idle) - gd * (r.sh ? 0.8 : 0.2); P.armL.rotation.z = p.armLz + (r.sh ? -0.15 : 0); }
    if (gd && P.body) p.lean = p.lean || 0.12;
    if (P.body && r.kind !== 'building') { P.body.rotation.x = p.lean; P.body.rotation.z = (r.kind === 'monster' ? 0 : Math.sin(ph) * 0.05 * w); }
    const bob = r.kind === 'rider' ? Math.abs(Math.sin(ph * 0.9)) * 0.09 * w : r.kind === 'foot' ? Math.abs(Math.sin(ph)) * 0.05 * w : r.kind === 'monster' ? Math.abs(Math.sin(ph * 1.3)) * 0.12 * w : 0;
    r.rig.position.y = bob; r.rig.position.z = p.lunge;
    if (P.mount) P.mount.rotation.x = -Math.sin(ph * 0.9) * 0.08 * w;
    const sq = 1 + p.squash; r.rig.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    if (r.kind === 'monster' || r.kind === 'siege') { const b = 1 + Math.sin(clk * 2.6 + r.wp) * 0.02; P.body.scale.set(b, 1 / b, b); }
  }

  /* ── 트윈 ────────────────────────────────────────────── */
  function tw(dur, fn, end, delayMs = 0) { tweens.push({ t0: clk + delayMs / 1000 / spd, dur: dur / spd, fn, end }); }
  // 자세 트윈: 키프레임 [t, 값] 목록을 보간
  const smooth = (t) => t * t * (3 - 2 * t);
  function kf(frames, t) { for (let i = 1; i < frames.length; i++) if (t <= frames[i][0]) { const a = frames[i - 1], b = frames[i]; return lerp(a[1], b[1], smooth((t - a[0]) / (b[0] - a[0] || 1))); } return frames[frames.length - 1][1]; }

  /* ── 효과 ────────────────────────────────────────────── */
  function float(r, text, cls) {
    const el = document.createElement('div'); el.className = 'ft ' + (cls || ''); el.textContent = text; overlay.appendChild(el);
    const p = r.g.position.clone(); p.y += r.height + 0.35; const jx = (Math.random() - 0.5) * 0.4; place(el, p);
    tw(0.9, (t) => { v3.set(p.x + jx, p.y + t * 0.9, p.z); place(el, v3); el.style.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3; el.style.scale = t < 0.15 ? 0.6 + t / 0.15 * 0.6 : 1.2 - Math.min(0.2, (t - 0.15)); }, () => el.remove());
  }
  function place(el, p) { v3.copy(p).project(camera); const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight; el.style.transform = `translate(${((v3.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v3.y) / 2 * h).toFixed(1)}px) translate(-50%, -100%)`; }
  function puff(pos, color = '#ffffff', n = 6, size = 0.18) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(shared('puff', () => new THREE.IcosahedronGeometry(1, 0)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })); m.userData.s = size;
      const a = i / n * Math.PI * 2, dir = new THREE.Vector3(Math.cos(a), 0.6 + Math.random() * 0.6, Math.sin(a)).multiplyScalar(0.5 + Math.random() * 0.4);
      m.position.copy(pos); fxG.add(m);
      tw(0.5, (t) => { m.position.set(pos.x + dir.x * easeOut(t), pos.y + dir.y * easeOut(t), pos.z + dir.z * easeOut(t)); m.scale.setScalar(m.userData.s * (1 - t * 0.7)); m.material.opacity = 0.9 * (1 - t); }, () => { fxG.remove(m); m.material.dispose(); });
    }
  }
  function dust(pos, n = 4) { puff(pos.clone().setY(0.08), '#e9dcc0', n, 0.14); }
  function sparkle(pos, color) {
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(MDL.star(), new THREE.MeshBasicMaterial({ color })); m.scale.setScalar(0.35); fxG.add(m);
      const ox = (Math.random() - 0.5) * 0.6, oz = (Math.random() - 0.5) * 0.4;
      tw(0.7, (t) => { m.position.set(pos.x + ox, pos.y + t * 0.9, pos.z + oz); m.rotation.z = t * 4; m.scale.setScalar(0.35 * (1 - t)); }, () => { fxG.remove(m); m.material.dispose(); }, i * 60);
    }
  }
  // 칼·창이 닿는 순간의 번쩍임 (대상 앞에서)
  function slash(pos, color = '#ffffff') {
    const m = new THREE.Mesh(shared('slashG', () => keep(new THREE.PlaneGeometry(0.9, 0.18))), own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })));
    m.position.copy(pos); m.rotation.set(0, Math.random() * Math.PI, 0.6 + Math.random() * 0.8); fxG.add(m);
    tw(0.22, (t) => { m.scale.set(0.4 + t * 1.2, 1 - t * 0.6, 1); m.material.opacity = 0.95 * (1 - t); }, () => { fxG.remove(m); m.material.dispose(); });
    sparkle(pos, color === '#ffffff' ? '#ffe08a' : color);
  }
  function ring(r, color) {
    const m = new THREE.Mesh(shared('sring', () => new THREE.TorusGeometry(0.4, 0.06, 6, 28)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    m.rotation.x = Math.PI / 2; m.position.copy(r.g.position); m.position.y += 0.08; fxG.add(m);
    tw(0.55, (t) => { m.scale.setScalar(0.6 + t * 1.8); m.material.opacity = 0.9 * (1 - t); }, () => { fxG.remove(m); m.material.dispose(); });
  }
  // 무기 끝 위치 (투사체 출발점)
  function weaponTip(a) {
    const P = a.parts; const src = P.armR || P.body; src.getWorldPosition(v3b);
    const dir = new THREE.Vector3(Math.sin(a.inner.rotation.y), 0, Math.cos(a.inner.rotation.y));
    v3b.add(dir.multiplyScalar(0.35)).add(new THREE.Vector3(0, a.kind === 'siege' ? 0.6 : 0.25, 0)); return v3b.clone();
  }
  function projectile(a, b, kind, delayMs = 0) {
    let geo, sc = 1, arc = 1;
    const tid = a.s.typeId || '', mid = a.s.monsterId || '', w = a.w;
    if (tid === 'siege_cat') { geo = MDL.stone(); arc = 2.2; }
    else if (mid === 'skunk' || mid === 'g_rat' || mid === 'g_goat') geo = shared('blob', () => new THREE.IcosahedronGeometry(0.16, 1));
    else if (THRUST.has(w) && w !== 'lance') { geo = MDL.javelin(); sc = 0.9; arc = 1.2; }
    else if (tid === 'bow_fire') geo = MDL.arrow('#ff7a2f'); else if (tid === 'bow_poison') geo = MDL.arrow('#9b6cff');
    else { geo = MDL.arrow(); if (tid === 'siege_bal' || tid === 'bow_heavy') { sc = 1.5; arc = 0.4; } if (w === 'crossbow') arc = 0.5; }
    const mat = geo.attributes.color ? M.toon : shared('blobM' + (mid === 'skunk' ? 'g' : 'p'), () => new THREE.MeshToonMaterial({ color: mid === 'skunk' ? '#9be36b' : '#c9a2ff', gradientMap: MAT3.grad }));
    const m = new THREE.Mesh(geo, mat); m.scale.setScalar(sc); m.castShadow = true; m.visible = false; fxG.add(m);
    const p1 = b.g.position.clone(); p1.y += b.height * 0.5;
    let p0 = null, d = 1, hgt = 0, dur = 0.3; const prev = new THREE.Vector3();
    tw(dur, (t) => {
      if (!p0) { p0 = weaponTip(a); d = p0.distanceTo(p1); hgt = (0.3 + d * 0.1) * arc; m.visible = true; }
      prev.copy(m.position); m.position.lerpVectors(p0, p1, t); m.position.y += Math.sin(Math.PI * t) * hgt; if (t > 0.01) m.lookAt(prev.lerp(m.position, 2)); else m.lookAt(p1);
    }, () => { fxG.remove(m); if (kind === 'skill') puff(p1, '#fff3a8', 5, 0.12); }, delayMs);
    if (tid === 'bow_fire') { const fl = new THREE.Mesh(shared('fire', () => new THREE.SphereGeometry(0.1, 8, 6)), shared('fireM', () => new THREE.MeshBasicMaterial({ color: '#ffb347' }))); m.add(fl); fl.position.z = 0.25; }
    return dur * 1000;
  }
  function flash(r, color = '#ff3b3b') { r.mat.emissive.set(color); tw(0.2, (t) => r.mat.emissive.setRGB(...(new THREE.Color(color).multiplyScalar(1 - t)).toArray()), () => r.mat.emissive.set('#000000')); }
  function setStatus(r, id, on) {
    if (on) r.statuses.add(id); else r.statuses.delete(id);
    const names = [...r.statuses].map(k => STATUS_NAMES[k]).filter(Boolean).slice(0, 3);
    r.stEl.textContent = names.join(' · ');
    if (id === 'stun') {
      if (on && !r.fx.stun) { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(MDL.star(), shared('starY', () => new THREE.MeshBasicMaterial({ color: '#ffd23f' }))); st.scale.setScalar(0.32); const a = i / 3 * Math.PI * 2; st.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); g.add(st); } g.position.y = r.height + 0.12; r.g.add(g); r.fx.stun = g; }
      if (!on && r.fx.stun) { r.g.remove(r.fx.stun); r.fx.stun = null; }
    }
    const glow = { poison: '#8ee36b', skunk: '#8ee36b', plague: '#b1d66b', burn: '#ff8a3c', bleed: '#ff5d6c', fear: '#b98cff', link: '#ff8fd0', mark: '#ff5d6c' };
    if (glow[id]) {
      if (on && !r.fx[id]) { const m = new THREE.Mesh(shared('ring', () => keep(new THREE.TorusGeometry(0.42, 0.035, 4, 24))), own(new THREE.MeshBasicMaterial({ color: glow[id], transparent: true, opacity: 0.8 }))); m.scale.setScalar(r.s.isGiant ? 2.2 : 1); m.rotation.x = Math.PI / 2; m.position.y = id === 'mark' ? r.height + 0.25 : 0.05 + Object.keys(r.fx).length * 0.03; r.g.add(m); r.fx[id] = m; }
      if (!on && r.fx[id]) { r.g.remove(r.fx[id]); delete r.fx[id]; }
    }
  }
  function faceTo(r, tx, tz, now) { const dx = tx - r.g.position.x, dz = tz - r.g.position.z; if (Math.abs(dx) + Math.abs(dz) < 0.01 || r.s.isBuilding) return; r.tyaw = Math.atan2(dx, dz); if (now) r.inner.rotation.y = r.tyaw; }
  function turnStep(r, dt) { if (r.tyaw == null || r.spin) return; let d = r.tyaw - r.inner.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); r.inner.rotation.y += d * (1 - Math.exp(-dt * 14)); }

  /* ── 공격 동작 ───────────────────────────────────────── */
  // 공격 종류별 자세 키프레임을 재생하고, 타격이 들어가는 시각(ms)을 돌려준다
  function attackAnim(a, b, isSkill) {
    const p = a.pose, d = a.g.position.distanceTo(b.g.position), ranged = d > 1.6 || a.kind === 'building' || a.kind === 'siege';
    const w = a.w; const S = isSkill ? 1.25 : 1;
    const sk = isSkill && a.s.typeId && UNITS[a.s.typeId] ? UNITS[a.s.typeId].skill : null;
    const run = (dur, fn, end) => { p.busy = true; tw(dur, fn, () => { p.busy = false; p.armR = p.armL = p.armRz = p.armLz = p.lean = p.lunge = 0; if (end) end(); }); };
    const hitPos = () => b.g.position.clone().setY(b.height * 0.5).lerp(a.g.position.clone().setY(b.height * 0.5), 0.3);
    const later = (ms, fn) => setTimeout(fn, ms / spd);
    if (a.kind === 'foot' || a.kind === 'rider') {
      // ── 스킬 전용 동작 ──
      if (sk === 'volley' || sk === 'scatter') { // 연사·분산: 화살 3발
        run(0.8, (t) => { p.armR = kf([[0, 0], [0.15, 1.45], [0.85, 1.45], [1, 0]], t); p.armL = kf([[0, 0], [0.2, -1.0], [0.3, 0.3], [0.45, -1.0], [0.55, 0.3], [0.7, -1.0], [0.8, 0.3], [1, 0]], t); p.lean = -0.1; });
        let fl = 0; for (let i = 0; i < 3; i++) fl = projectile(a, b, 'skill', 240 + i * 200); return 240 + fl;
      }
      if (sk === 'thrust' || sk === 'disarm') { // 연속 찌르기 두 번 + 깊은 돌진
        run(0.7, (t) => { p.armR = kf([[0, 0], [0.2, -0.8], [0.35, 1.6], [0.5, 0.2], [0.65, 1.7], [0.85, 1.4], [1, 0]], t); p.lean = kf([[0, 0], [0.2, -0.2], [0.35, 0.35], [0.5, 0.1], [0.65, 0.4], [1, 0]], t); p.lunge = kf([[0, 0], [0.2, -0.15], [0.35, 0.55], [0.5, 0.35], [0.65, 0.7], [1, 0]], t); });
        later(240, () => { if (b.alive) slash(hitPos(), '#ffffff'); }); later(450, () => { if (b.alive) slash(hitPos(), '#ffe08a'); dust(b.g.position, 3); }); return 260;
      }
      if (sk === 'javelin') { // 투창 2개
        run(0.7, (t) => { p.armR = kf([[0, 0], [0.2, -1.3], [0.35, 1.7], [0.5, -1.2], [0.65, 1.7], [1, 0]], t); p.lean = kf([[0, 0], [0.2, -0.2], [0.35, 0.3], [0.5, -0.2], [0.65, 0.3], [1, 0]], t); p.lunge = kf([[0, 0], [0.35, 0.25], [0.5, 0.05], [0.65, 0.3], [1, 0]], t); });
        const f1 = projectile(a, b, 'skill', 230); projectile(a, b, 'skill', 440); return 230 + f1;
      }
      if (sk === 'whirl' || sk === 'sweep' || sk === 'storm') { // 회전 베기
        const y0 = a.inner.rotation.y; a.spin = true; run(0.6, (t) => { a.inner.rotation.y = y0 + easeOut(t) * Math.PI * 2; p.armR = kf([[0, 0], [0.15, 1.3], [0.85, 1.4], [1, 0]], t); p.armRz = kf([[0, 0], [0.15, -1.2], [0.85, -1.2], [1, 0]], t); p.lean = 0.15; p.lunge = kf([[0, 0], [0.5, 0.25], [1, 0]], t); }, () => { a.inner.rotation.y = y0; a.spin = false; });
        later(200, () => { ring(a, '#ffffff'); if (b.alive) slash(hitPos(), '#ffffff'); }); later(380, () => { if (b.alive) slash(hitPos(), '#ffe08a'); }); return 220;
      }
      if (sk === 'flurry') { // 난무: 빠른 세 번 베기
        run(0.75, (t) => { p.armR = kf([[0, 0], [0.12, -2.0], [0.25, 1.8], [0.37, -1.6], [0.5, 1.8], [0.62, -1.6], [0.75, 1.9], [1, 0]], t); p.armRz = kf([[0, 0], [0.25, 0.5], [0.5, -0.5], [0.75, 0.3], [1, 0]], t); p.lunge = kf([[0, 0], [0.25, 0.35], [0.5, 0.3], [0.75, 0.4], [1, 0]], t); p.lean = 0.25; });
        for (const ms of [190, 370, 550]) later(ms, () => { if (b.alive) slash(hitPos(), '#ffffff'); }); return 200;
      }
      if (sk === 'leap') { // 도약: 높이 뛰어올라 내리찍기
        const p0 = a.g.position.clone(), dir = b.g.position.clone().sub(p0).setY(0).normalize().multiplyScalar(Math.min(0.9, p0.distanceTo(b.g.position) - 0.6));
        run(0.6, (t) => { const k = Math.sin(Math.PI * Math.min(1, t * 1.25)); a.g.position.set(p0.x + dir.x * easeOut(Math.min(1, t * 1.25)), GY + k * 1.3, p0.z + dir.z * easeOut(Math.min(1, t * 1.25))); p.armR = kf([[0, 0], [0.4, -2.2], [0.75, 1.9], [1, 0]], t); p.lean = kf([[0, 0], [0.4, -0.3], [0.8, 0.4], [1, 0]], t); }, () => a.g.position.copy(p0));
        later(440, () => { shake = 0.15; dust(b.g.position, 7); if (b.alive) slash(hitPos(), '#ffe08a'); }); return 450;
      }
      if (sk === 'charge' || sk === 'breakthrough') { // 돌격: 크게 들이받기
        run(0.55, (t) => { p.armR = kf([[0, 0], [0.2, -0.6], [0.45, 1.5], [0.75, 1.4], [1, 0]], t); p.lean = kf([[0, 0], [0.2, -0.15], [0.45, 0.4], [1, 0]], t); p.lunge = kf([[0, 0], [0.2, -0.3], [0.45, 0.9], [0.7, 0.7], [1, 0]], t); });
        later(60, () => dust(a.g.position, 5)); later(240, () => { shake = 0.12; if (b.alive) { slash(hitPos(), '#ffffff'); dust(b.g.position, 5); } }); return 250;
      }
      if (sk === 'smash' || sk === 'execute') { // 내려찍기: 크게 들었다가 쾅
        run(0.6, (t) => { p.armR = kf([[0, 0], [0.4, -2.6], [0.55, 2.0], [0.8, 1.8], [1, 0]], t); p.lean = kf([[0, 0], [0.4, -0.3], [0.55, 0.45], [1, 0]], t); p.lunge = kf([[0, 0], [0.4, -0.1], [0.55, 0.4], [1, 0]], t); });
        later(330, () => { shake = 0.14; dust(b.g.position, 6); if (b.alive) slash(hitPos(), '#ffe08a'); }); return 340;
      }
      if (sk === 'guard' || sk === 'stance' || sk === 'taunt') { // 방패 올리기 / 도발
        run(0.6, (t) => { p.armL = kf([[0, 0], [0.3, -1.3], [0.8, -1.3], [1, 0]], t); p.lean = kf([[0, 0], [0.3, -0.15], [1, 0]], t); if (sk === 'taunt') p.armR = kf([[0, 0], [0.3, -2.4], [0.5, -2.0], [0.7, -2.4], [1, 0]], t); });
        later(200, () => ring(a, sk === 'taunt' ? '#ff6f7d' : '#8fe3ff')); return 260;
      }
      if (sk === 'rally') { // 격려: 무기 들어 외치기
        run(0.7, (t) => { p.armR = kf([[0, 0], [0.25, -2.6], [0.75, -2.4], [1, 0]], t); p.lean = kf([[0, 0], [0.25, -0.2], [1, 0]], t); a.rig.position.y = Math.abs(Math.sin(t * 12)) * 0.1 * (t < 0.8 ? 1 : 0); });
        later(220, () => ring(a, '#ffd23f')); return 300;
      }
      if (sk === 'hitrun') { // 치고 빠지기: 쏘고 뒤로 물러서기
        const p0 = a.g.position.clone(), back = p0.clone().sub(b.g.position).setY(0).normalize().multiplyScalar(0.5);
        run(0.7, (t) => { p.armR = kf([[0, 0], [0.2, 1.45], [0.5, 1.45], [0.7, 0]], t); p.armL = kf([[0, 0], [0.25, -1.0], [0.4, 0.3], [1, 0]], t); const k = Math.max(0, (t - 0.5) / 0.5); a.g.position.set(p0.x + back.x * easeOut(k), GY, p0.z + back.z * easeOut(k)); }, () => { a.g.position.copy(p0); });
        return 240 + projectile(a, b, 'skill', 240);
      }
      if (w === 'bow') { // 활: 시위를 당겼다가 놓는다
        run(0.5, (t) => { p.armR = kf([[0, 0], [0.2, 1.45], [0.75, 1.45], [1, 0]], t); p.armL = kf([[0, 0], [0.3, -0.9], [0.5, -1.05], [0.55, 0.3], [1, 0]], t); p.lean = kf([[0, 0], [0.3, -0.12], [0.6, 0.1], [1, 0]], t); });
        return 270 + projectile(a, b, isSkill ? 'skill' : '', 270);
      }
      if (w === 'crossbow' || w === 'heavycrossbow') { run(0.45, (t) => { p.armR = kf([[0, 0], [0.3, 1.2], [0.5, 1.0], [0.6, 1.3], [1, 0]], t); p.lean = kf([[0, 0], [0.5, -0.05], [0.6, 0.12], [1, 0]], t); }); return 230 + projectile(a, b, isSkill ? 'skill' : '', 230); }
      if (ranged && THRUST.has(w)) { // 투창
        run(0.5, (t) => { p.armR = kf([[0, 0], [0.3, -1.3], [0.5, 1.7], [1, 0]], t); p.lean = kf([[0, 0], [0.3, -0.2], [0.5, 0.3], [1, 0]], t); p.lunge = kf([[0, 0], [0.5, 0.25], [1, 0]], t); });
        return 240 + projectile(a, b, isSkill ? 'skill' : '', 240);
      }
      if (THRUST.has(w) || (w === 'glaive' && a.kind === 'rider')) { // 찌르기
        run(0.46 * S, (t) => { p.armR = kf([[0, 0], [0.25, -0.7], [0.5, 1.55], [0.7, 1.4], [1, 0]], t); p.lean = kf([[0, 0], [0.25, -0.15], [0.5, 0.3], [1, 0]], t); p.lunge = kf([[0, 0], [0.25, -0.1], [0.5, 0.42], [0.75, 0.3], [1, 0]], t); });
        setTimeout(() => { if (b.alive) slash(hitPos(), '#ffffff'); }, 210 * S / spd);
        return 220 * S;
      }
      if (SLASH.has(w)) { // 내려베기
        run(0.5 * S, (t) => { p.armR = kf([[0, 0], [0.3, -2.2], [0.5, 1.9], [0.75, 1.6], [1, 0]], t); p.armRz = kf([[0, 0], [0.3, -0.5], [0.5, 0.4], [1, 0]], t); p.lean = kf([[0, 0], [0.3, -0.2], [0.5, 0.35], [1, 0]], t); p.lunge = kf([[0, 0], [0.3, -0.08], [0.55, 0.35], [1, 0]], t); });
        setTimeout(() => { if (b.alive) slash(hitPos(), '#ffffff'); }, 230 * S / spd);
        return 240 * S;
      }
      // 무기 없음(중방패 등): 방패로 밀어붙이기
      run(0.42 * S, (t) => { p.armL = kf([[0, 0], [0.3, -0.5], [0.5, 1.2], [1, 0]], t); p.lunge = kf([[0, 0], [0.3, -0.1], [0.5, 0.45], [1, 0]], t); p.lean = kf([[0, 0], [0.5, 0.25], [1, 0]], t); });
      setTimeout(() => { if (b.alive) dust(b.g.position, 4); }, 200 * S / spd);
      return 210 * S;
    }
    if (a.kind === 'siege' || a.kind === 'building') { // 병기·성벽: 반동 + 투사체
      run(0.4, (t) => { p.lean = kf([[0, 0], [0.2, -0.12], [0.5, 0.06], [1, 0]], t); p.lunge = kf([[0, 0], [0.2, -0.15], [1, 0]], t); });
      return 140 + projectile(a, b, isSkill ? 'skill' : '', 140);
    }
    // 몬스터: 덮치기 (원거리면 뱉기)
    if (ranged) { run(0.4, (t) => { p.squash = kf([[0, 0], [0.3, 0.25], [0.5, -0.15], [1, 0]], t); }); return 200 + projectile(a, b, isSkill ? 'skill' : '', 200); }
    const p0 = a.g.position.clone(), dir = b.g.position.clone().sub(p0).setY(0).normalize().multiplyScalar(0.45);
    run(0.42 * S, (t) => { const k = Math.sin(Math.PI * t); a.g.position.set(p0.x + dir.x * k, GY + k * 0.35, p0.z + dir.z * k); p.squash = kf([[0, 0], [0.2, -0.25], [0.5, 0.2], [1, 0]], t); }, () => a.g.position.copy(p0));
    setTimeout(() => { if (b.alive) slash(hitPos(), '#ffd0d0'); }, 200 * S / spd);
    return 210 * S;
  }

  /* ── 재생 ────────────────────────────────────────────── */
  function open(container, res, o) {
    if (!ensure(container)) return false;
    close(true);
    opts = o || {}; spd = 1; done = false; onDone = opts.onDone; onLog = opts.onLog; events = res.events; idx = 0; clk = 0; tweens = []; shake = 0; intro = 1; running.length = 0; for (const h of chunkTimers) clearTimeout(h); chunkTimers = [];
    for (const c of [...unitsG.children, ...fxG.children]) disposeTree(c);
    U = {}; while (unitsG.children.length) unitsG.remove(unitsG.children[0]); while (fxG.children.length) fxG.remove(fxG.children[0]); overlay.innerHTML = '';
    roundEl = document.createElement('div'); roundEl.className = 'b-round'; roundEl.textContent = '준비'; overlay.appendChild(roundEl);
    bannerEl = document.createElement('div'); bannerEl.className = 'b-banner'; overlay.appendChild(bannerEl);
    buildBoard(opts); size(); cam.x = 0; cam.z = 0; cam.d = fullDist; zoomK = 1; view.yaw = view.tyaw = 0; view.pitch = view.tpitch = 0;
    last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
    timer = setTimeout(step, 250);
    return true;
  }
  // 유닛 한 명의 턴(이동·공격과 그 결과)을 한 묶음으로 보고, 서로 다른 병사의 묶음은 겹쳐서 재생한다
  const running = []; // { units:Set, timers:[] }
  let chunkTimers = [];
  function unitsOf(ch) { const u = new Set(); for (const e of ch) { if (e.uid) u.add(e.uid); if (e.tid) u.add(e.tid); if (e.from) u.add(e.from); if (e.unit) u.add(e.unit.uid); } return u; }
  function step() {
    if (done) return;
    if (idx >= events.length) { if (running.length) { timer = setTimeout(step, 80); return; } finish(); return; }
    const first = events[idx]; const chunk = [first];
    const isTurn = first.t === 'move' || first.t === 'attack';
    if (isTurn) { let k = idx + 1; while (k < events.length) { const e = events[k]; if (e.t === 'round' || e.t === 'end' || e.t === 'init' || e.t === 'spawn' || ((e.t === 'move' || e.t === 'attack') && e.uid !== first.uid)) break; chunk.push(e); k++; } }
    const mine = unitsOf(chunk);
    // 같은 병사가 얽힌 묶음이 돌고 있으면 기다린다 (라운드 표시는 모두 끝난 뒤)
    const clash = running.some(rc => [...mine].some(u => rc.units.has(u))) || (!isTurn && running.length);
    if (clash || running.length >= 3) { timer = setTimeout(step, 60); return; }
    idx += chunk.length;
    const rc = { units: mine, timers: [] }; running.push(rc);
    let i = 0; const next = () => { if (done) return; if (i >= chunk.length) { running.splice(running.indexOf(rc), 1); return; } const d = apply(chunk[i++], true); const h = setTimeout(next, d / spd); rc.timers.push(h); chunkTimers.push(h); };
    next();
    timer = setTimeout(step, (isTurn ? 170 : 40) / spd);
  }
  function apply(e, anim) {
    const R = (id) => U[id];
    switch (e.t) {
      case 'init': {
        e.units.forEach((s, i) => addUnit(s, anim ? i * 25 : 0));
        if (!anim) return 0;
        banner('전투 시작!', 'start');
        // 양 군이 평원 양쪽에서 달려 들어온다
        for (const r of Object.values(U)) {
          if (r.kind === 'building') continue;
          const to = r.g.position.clone(); const far = r.s.side === 'A' ? -4.5 : 4.5; r.g.position.x += far;
          const d = 0.25 + Math.random() * 0.25, dur = r.kind === 'rider' ? 0.8 : r.kind === 'siege' ? 1.5 : 1.1;
          tw(dur, (t) => { r.walking = 1; r.g.position.x = to.x + far * (1 - easeOut(t)); }, () => { r.walking = 0; r.g.position.copy(to); dust(r.g.position, 2); }, 500 + d * 1000);
          if (r.kind === 'foot' || r.kind === 'rider') tw(0.6, (t) => { r.pose.busy = true; r.pose.armR = -2.4 + Math.sin(t * 14) * 0.25; }, () => { r.pose.busy = false; r.pose.armR = 0; }, 400 + d * 1000);
        }
        return 2300;
      }
      case 'spawn': { const r = addUnit(e.unit, 0); if (anim) puff(r.g.position.clone().setY(0.6), '#ffffff', 6); return 260; }
      case 'round': roundEl.textContent = '턴 ' + e.n; return anim ? 140 : 0;
      case 'move': {
        const r = R(e.uid); if (!r || !r.alive) return 0; const path = e.path; const last = path[path.length - 1];
        if (!anim) { r.g.position.copy(wpos(r, last[0], last[1])); r.x = last[0]; r.y = last[1]; return 0; }
        const from = r.g.position.clone(); const pts = [from, ...path.map(p => wpos(r, p[0], p[1]))];
        const per = r.kind === 'rider' ? 0.11 : r.kind === 'siege' ? 0.22 : 0.15; faceTo(r, pts[1].x, pts[1].z); r.walking = 1;
        const n = pts.length - 1; const ease = (t) => n > 1 ? t : smooth(t);
        tw(per * n + 0.08, (t0) => { const t = ease(Math.min(1, t0 * (per * n + 0.08) / (per * n))); const f = t * n; const i = Math.min(n - 1, Math.floor(f)); const lt = f - i; r.g.position.lerpVectors(pts[i], pts[i + 1], lt); if (lt < 0.2) faceTo(r, pts[i + 1].x, pts[i + 1].z); r.walking = t < 1 ? 1 : 0; }, () => { r.g.position.copy(pts[n]); r.walking = 0; if (r.kind === 'rider') dust(r.g.position, 3); });
        r.x = last[0]; r.y = last[1];
        return 80 + 70 * (pts.length - 1);
      }
      case 'attack': {
        const a = R(e.uid), b = R(e.tid); if (!a || !b || !a.alive) return 0; if (!anim) return 0;
        faceTo(a, b.g.position.x, b.g.position.z, true);
        if (e.skill) { ring(a, '#ffd23f'); bubble(a, e.skill); }
        return Math.round(attackAnim(a, b, !!e.skill));
      }
      case 'dmg': {
        const r = R(e.uid); if (!r) return 0; r.hp = e.hp; updHp(r); if (!anim) return 0;
        if (e.amount > 0) {
          flash(r, e.fixed ? '#b05cff' : '#ff3030'); float(r, '-' + e.amount, e.crit ? 'crit' : e.fixed ? 'fixed' : ''); puff(r.g.position.clone().setY(r.height * 0.55), e.fixed ? '#d9b0ff' : '#ff8a94', e.crit ? 6 : 3, 0.09);
          const from = e.from && U[e.from]; const p0 = r.g.position.clone(); const kb = from ? r.g.position.clone().sub(from.g.position).setY(0).normalize().multiplyScalar(r.kind === 'building' ? 0 : 0.16) : new THREE.Vector3();
          tw(0.3, (t) => { const k = Math.sin(Math.PI * smooth(t)); r.g.position.set(p0.x + kb.x * k, GY, p0.z + kb.z * k); r.pose.squash = -0.18 * k; r.pose.lean = (r.kind === 'foot' || r.kind === 'rider') ? -0.3 * k : 0; }, () => { r.g.position.copy(p0); r.pose.squash = 0; if (!r.pose.busy) r.pose.lean = 0; });
          if (e.crit) { shake = 0.18; float(r, '치명!', 'critword'); }
        }
        return 75;
      }
      case 'heal': { const r = R(e.uid); if (!r) return 0; r.hp = e.hp; updHp(r); if (anim && e.amount > 0) { float(r, '+' + e.amount, 'heal'); sparkle(r.g.position.clone().setY(0.6), '#7ee081'); } return anim ? 55 : 0; }
      case 'shield': { const r = R(e.uid); if (!r) return 0; const up = e.shield > r.shield; r.shield = e.shield; updHp(r); if (anim && up) { r.bub.scale.setScalar(0.4); tw(0.3, (t) => r.bub.scale.setScalar(0.4 + easeBack(t) * 0.6)); } if (anim && e.absorbed) { float(r, '막음 ' + e.absorbed, 'shield'); if (r.sh && !r.pose.busy) { r.pose.busy = true; tw(0.3, (t) => { r.pose.armL = -Math.sin(Math.PI * t) * 1.2; r.pose.lean = -Math.sin(Math.PI * t) * 0.15; }, () => { r.pose.busy = false; r.pose.armL = 0; r.pose.lean = 0; }); } } return anim ? 25 : 0; }
      case 'dodge': { const r = R(e.uid); if (!r || !anim) return 0; float(r, '회피!', 'dodge'); const p0 = r.g.position.clone(); const side = new THREE.Vector3(Math.cos(r.inner.rotation.y), 0, -Math.sin(r.inner.rotation.y)).multiplyScalar(0.4); tw(0.3, (t) => { const k = Math.sin(Math.PI * t); r.g.position.set(p0.x + side.x * k, GY + k * 0.15, p0.z + side.z * k); r.pose.lean = -0.25 * k; }, () => { r.g.position.copy(p0); r.pose.lean = 0; }); return 70; }
      case 'status': { const r = R(e.uid); if (!r) return 0; setStatus(r, e.id, e.on); if (anim && e.on && STATUS_NAMES[e.id]) float(r, STATUS_NAMES[e.id], 'status'); return anim ? 35 : 0; }
      case 'skip': { const r = R(e.uid); if (!r || !anim) return 0; float(r, e.why, 'status'); const z0 = r.inner.rotation.z; tw(0.3, (t) => { r.inner.rotation.z = z0 + Math.sin(t * 20) * 0.1 * (1 - t); }, () => r.inner.rotation.z = z0); return 80; }
      case 'banner': { if (!anim) return 0; const c = (e.side === 'A' ? opts.colorA : opts.colorD) || '#ffffff'; const m = new THREE.Mesh(MDL.flag(c), M.toon); const pole = new THREE.Mesh(shared('bpole', () => keep(MDL.bake([MDL.seg([0, 0, 0], [0, 0.9, 0], 0.014, '#8f6038')]))), M.toon); pole.position.set(bx(e.x), GY, bz(e.y)); m.position.set(bx(e.x), GY + 0.8, bz(e.y)); fxG.add(pole); fxG.add(m); return 120; }
      case 'die': {
        const r = R(e.uid); if (!r) return 0; r.alive = false; r.hpEl.remove();
        if (!anim) { unitsG.remove(r.g); return 0; }
        const p = r.g.position.clone(); p.y = 0.5; puff(p, '#ffffff', 7, r.s.isGiant ? 0.4 : 0.2);
        r.mat.transparent = true; const y0 = r.g.position.y; const dirZ = (Math.random() < 0.5 ? -1 : 1) * 0.25; r.walking = 0; r.pose.busy = true;
        tw(0.7, (t) => { const k = smooth(easeIn(Math.min(1, t * 1.25))); r.inner.rotation.x = -k * 1.45; r.inner.rotation.z = k * dirZ; r.pose.armR = -k * 1.6; r.pose.armL = -k * 1.2; r.g.position.y = y0 - t * 0.1; r.mat.opacity = t < 0.5 ? 1 : 1 - (t - 0.5) * 2; if (t > 0.5) r.rig.traverse(c => { if (c.material === M.outline) c.visible = false; }); }, () => unitsG.remove(r.g));
        setTimeout(() => dust(r.g.position, 5), 220 / spd);
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
    // 이긴 쪽은 무기를 들어 올리며 환호
    for (const r of Object.values(U)) if (r.alive && r.s.side === winner && (r.kind === 'foot' || r.kind === 'rider')) { const ph = Math.random() * 2; tw(1.6, (t) => { r.pose.busy = true; r.pose.armR = -2.6 + Math.sin(t * 10 + ph) * 0.3; r.pose.armL = -0.6; r.rig.position.y = Math.abs(Math.sin(t * 9 + ph)) * 0.18; }, () => { r.pose.busy = false; r.pose.armR = r.pose.armL = 0; }, Math.random() * 300); }
    if (win) confetti();
    if (onDone) onDone(winner);
  }
  function confetti() {
    const cols = ['#ffd23f', '#ff6f7d', '#59b4ff', '#4fd18b', '#ac78ff', '#ffffff'];
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(shared('conf', () => keep(new THREE.PlaneGeometry(0.16, 0.24))), shared('confM' + (i % cols.length), () => new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide })));
      const x = (Math.random() - 0.5) * 12, z = (Math.random() - 0.5) * 6, rs = Math.random() * 5 + 2;
      fxG.add(m);
      tw(2.2, (t) => { m.position.set(x + Math.sin(t * 6 + i) * 0.4, 7 - t * 7.5, z); m.rotation.set(t * rs, t * rs * 0.7, 0); }, () => fxG.remove(m), Math.random() * 600);
    }
  }
  function skip() {
    if (!renderer || done) return; clearTimeout(timer); for (const h of chunkTimers) clearTimeout(h); chunkTimers = []; running.length = 0;
    while (idx < events.length) { const e = events[idx++]; if (e.t === 'end') continue; apply(e, false); }
    for (const t of tweens.splice(0)) { try { t.fn(1); if (t.end) t.end(); } catch (e) { /* 무시 */ } }
    overlay.querySelectorAll('.ft, .skill-bubble').forEach(el => el.remove());
    for (const r of Object.values(U)) { r.inner.scale.setScalar(r.k); r.walking = 0; r.pose = { armR: 0, armL: 0, armRz: 0, armLz: 0, lean: 0, lunge: 0, squash: 0, busy: false }; if (r.alive) { r.g.position.copy(wpos(r, r.x, r.y)); r.inner.rotation.set(0, r.inner.rotation.y, 0); } }
    finish();
  }
  function setSpeed(s) { spd = s; }
  function close(keep) { clearTimeout(timer); for (const h of chunkTimers) clearTimeout(h); chunkTimers = []; running.length = 0; cancelAnimationFrame(raf); raf = 0; if (!keep) { done = true; } }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; clk += dt;
    for (const t of tweens.slice()) { if (clk < t.t0) continue; const k = Math.min(1, (clk - t.t0) / t.dur); t.fn(k); if (k >= 1) { tweens.splice(tweens.indexOf(t), 1); if (t.end) t.end(); } }
    for (const r of Object.values(U)) {
      if (!r.alive) continue;
      animate(r, dt);
      if (r.fx.stun) r.fx.stun.rotation.y += dt * 4;
      place(r.hpEl, v3.copy(r.g.position).setY(r.g.position.y + r.height + 0.12));
    }
    intro = Math.max(0, intro - dt * 1.2);
    guardT -= dt; if (guardT <= 0) { guardT = 0.25; guardCheck(); }
    frameCamera(dt);
    const e = easeOut(1 - intro), d = cam.d + (1 - e) * 5;
    const kv = 1 - Math.exp(-dt * 8); view.yaw += (view.tyaw - view.yaw) * kv; view.pitch += (view.tpitch - view.pitch) * kv;
    const pitch = Math.max(0.28, Math.min(1.35, PITCH + view.pitch)), yaw = (endView ? (camSign < 0 ? -Math.PI / 2 : Math.PI / 2) : 0) + view.yaw + Math.sin(clk * 0.35) * 0.012;
    camera.position.set(cam.x + Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d + 0.3, cam.z + Math.cos(yaw) * Math.cos(pitch) * d);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt); }
    camera.lookAt(cam.x, 0.5, cam.z);
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
      const ax = Math.max(endView ? 2.2 : 2.8, (maxx - minx) / 2 + 0.9), az = Math.max(endView ? 2.0 : 1.8, (maxz - minz) / 2 + 0.8);
      td = Math.min(fullDist, Math.max(endView ? 6.5 : 7.0, endView ? fitDist(az, ax) : fitDist(ax, az)));
    }
    td *= zoomK;
    const k = 1 - Math.exp(-dt * 2.2); cam.x += (tx - cam.x) * k; cam.z += (tz - cam.z) * k; cam.d += (td - cam.d) * k;
  }

  function zoomBy(f) { zoomK = Math.max(0.35, Math.min(1.4, zoomK * f)); }
  function orbit(dx, dy) { view.tyaw -= dx * 0.008; view.tpitch = Math.max(-0.5, Math.min(0.6, view.tpitch + dy * 0.006)); }
  function resetView() { zoomK = 1; view.tyaw = 0; view.tpitch = 0; }
  return { open, skip, setSpeed, close, resize, zoomBy, orbit, resetView, get ok() { return !!renderer; }, get memory() { return renderer ? Object.assign({}, renderer.info.memory) : null; } };
})();
