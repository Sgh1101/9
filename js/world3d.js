/* ============================================================
   3D 월드맵 — 300×300(9만 칸) 섬
   섬 전체를 한꺼번에 그리지 않고, 카메라 주변 창(window)만 인스턴스로 채운다.
   카메라가 창 가운데에서 몇 칸 벗어나면 그 자리로 창을 다시 채운다.
   정적 레이어(타일·나무·바위·꽃)는 창이 옮겨질 때, 동적 레이어(영토·몬스터…)는
   상태가 바뀔 때만 다시 만든다.
   ============================================================ */
'use strict';

const World3D = typeof THREE === 'undefined' ? null : (() => {
  let renderer = null, scene, camera, root, dyn, container, labelLayer;
  const cam = { tx: 0, tz: 0, dist: 15, yaw: 0.35, tdist: 15, tyaw: 0.35, ttx: 0, ttz: 0, orbit: 0 };
  const L = {};            // 인스턴스 레이어
  let N = 300, R = 16, RMAX = 26, WS = 33, ox = 0, oy = 0, cellI = new Int32Array(0), cellN = 0;
  let built = false, lastSig = '', sigT = 0, seasonId = '', winKey = '', quality = 'high';
  let sun, hemi, water, sky = new THREE.Color('#aee3ff');
  const groups = { castles: {}, forts: {}, ruins: {}, giants: {}, armies: {} };
  let sel, selArrow, clouds = [], boat, particles, pData = null, island = null;
  const labels = new Map(); let labelPool = [];
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

  const wx = (x) => x - N / 2 + 0.5, wz = (y) => y - N / 2 + 0.5;
  const tx = (X) => Math.round(X + N / 2 - 0.5);
  const rnd01 = (x, y, k) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };
  // 타일 윗면 높이 (지형만으로 결정)
  function hAt(i) { const ty = TER.type[i], d = TER.deco[i]; return ty === 2 ? 0.44 + (d % 3) * 0.04 + (TER.lv[i] >= 3 ? 0.04 : 0) : ty === 1 ? 0.32 : ty === 4 ? 0.36 : ty === 3 ? 0.34 : 0.28 + (d % 2) * 0.02; }
  function hXY(x, y) { x = clamp(Math.round(x), 0, N - 1); y = clamp(Math.round(y), 0, N - 1); return hAt(y * N + x); }
  const inWin = (x, y, m = 0) => x >= ox - m && y >= oy - m && x < ox + WS + m && y < oy + WS + m;

  /* ── 초기화 ──────────────────────────────────────────── */
  function init(cont) {
    container = cont;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch (e) { renderer = null; return false; }
    if (!renderer.getContext()) return false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'stage-canvas';
    container.appendChild(renderer.domElement);
    labelLayer = document.createElement('div'); labelLayer.className = 'labels'; container.appendChild(labelLayer);
    scene = new THREE.Scene(); scene.background = sky.clone(); scene.fog = new THREE.Fog(sky.clone(), 30, 80);
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
    hemi = new THREE.HemisphereLight('#eef8ff', '#9fc97f', 0.5); scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff2da', 0.72); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun); scene.add(sun.target);
    try { quality = localStorage.getItem('acres9_quality') || (matchMedia('(pointer: coarse)').matches ? 'mid' : 'high'); } catch (e) { quality = 'high'; }
    applyQuality();
    resize();
    return true;
  }
  function castFor() { if (!L.tiles) return; const hi = quality === 'high'; for (const k of ['trunk', 'canR', 'canP', 'rock', 'wheat', 'wheatS', 'logs', 'mine', 'tent']) if (L[k]) L[k].castShadow = hi; for (const k in (L.mon || {})) L.mon[k].castShadow = hi; }
  function winRadius() { return quality === 'low' ? 18 : quality === 'mid' ? 22 : 26; }
  function applyQuality() {
    if (!renderer) return; castFor();
    const pr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(quality === 'low' ? 1 : quality === 'mid' ? Math.min(pr, 1.5) : Math.min(pr, 2));
    renderer.shadowMap.enabled = quality !== 'low'; sun.castShadow = quality !== 'low';
    sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    if (built && winRadius() !== RMAX) build(true);
    cam.tdist = Math.min(cam.tdist, maxDist());
    resize();
  }
  function setQuality(q) { quality = q; try { localStorage.setItem('acres9_quality', q); } catch (e) {} applyQuality(); }
  function getQuality() { return quality; }
  function resize() { if (!renderer) return; const w = container.clientWidth || 1, h = container.clientHeight || 1; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const maxDist = () => Math.round(RMAX * 1.1);
  // 지금 확대 정도·화면 비율에서 보이는 만큼만 창을 잡는다
  function wantR() { const asp = camera ? camera.aspect : 1; return clamp(Math.ceil(Math.max(0.5, 0.36 * asp) * Math.max(cam.dist, cam.tdist) * 1.25 + 3), 10, RMAX); }

  const SH = {}; const shared = (k, make) => SH[k] || (SH[k] = make());
  /* ── 공용 재질 ───────────────────────────────────────── */
  let M = null;
  function mats() {
    if (M) return M;
    M = { toon: MAT3.toon(), toonI: MAT3.toon(), bob: MAT3.bobbing(), sway: MAT3.swaying(), outline: MAT3.outline(0.03), basic: new THREE.MeshBasicMaterial({ vertexColors: true }) };
    return M;
  }

  function inst(geo, mat, cap, opts = {}) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
    m.count = 0; m.frustumCulled = false; m.castShadow = !!opts.cast; m.receiveShadow = !!opts.recv;
    // r128: 같은 재질을 쓰는 인스턴스 메시는 모두 instanceColor를 가져야 한다
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3).fill(1), 3);
    (opts.parent || root).add(m); return m;
  }
  function put(m, i, x, y, z, s = 1, ry = 0, sx, sy, sz) {
    tmpE.set(0, ry, 0); tmpQ.setFromEuler(tmpE); tmpV.set(x, y, z);
    tmpS.set(sx != null ? sx : s, sy != null ? sy : s, sz != null ? sz : s);
    tmpM.compose(tmpV, tmpQ, tmpS); m.setMatrixAt(i, tmpM);
  }
  function setCol(m, i, hex) { tmpC.set(hex); m.instanceColor.setXYZ(i, tmpC.r, tmpC.g, tmpC.b); }
  function done(m, n) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

  /* ── 색 ──────────────────────────────────────────────── */
  const GROUND = {
    spring: { plain: '#8fd468', forest: '#69ba55', hill: '#c7a97e', capital: '#e6d6b4', ruin: '#bfb2db' },
    summer: { plain: '#78c957', forest: '#55ab49', hill: '#c2a277', capital: '#e6d6b4', ruin: '#bfb2db' },
    autumn: { plain: '#dcc062', forest: '#c09f4e', hill: '#c39c72', capital: '#e6d6b4', ruin: '#bfb2db' },
    winter: { plain: '#eef5fa', forest: '#dfe9f1', hill: '#d9dde6', capital: '#eceef2', ruin: '#d6d1e8' },
  };
  const BASEC = {}; for (const s in GROUND) { BASEC[s] = {}; for (const k in GROUND[s]) BASEC[s][k] = new THREE.Color(GROUND[s][k]); }
  const CANOPY = { spring: ['#9be27a', '#86d672', '#ffc2dc'], summer: ['#5fc14f', '#4cae46', '#6fd05a'], autumn: ['#ff9a3c', '#f2c84b', '#e8603f'], winter: ['#f4f8ff', '#eaf2fb', '#ffffff'] };
  const PINE = { spring: '#4fa868', summer: '#3f9a5c', autumn: '#4f9461', winter: '#3d8a5a' };
  const ownCol = {};
  function factionColor(fid) { const f = G.factions[fid]; const c = f ? f.color : '#999999'; return ownCol[c] || (ownCol[c] = new THREE.Color(c)); }
  function tileColor(i, owner, sid) {
    const ty = TYPES[TER.type[i]], lv = TER.lv[i];
    tmpC.copy(BASEC[sid][ty] || BASEC[sid].plain);
    tmpC.offsetHSL(0, 0, (TER.deco[i] % 3) * 0.03 - 0.03);
    if (lv >= 3 && !owner && ty !== 'ruin' && ty !== 'capital') tmpC.offsetHSL(0.02, -0.05, -0.035 * (lv - 2));
    if (owner) tmpC.lerp(factionColor(owner), 0.32);
    return tmpC;
  }

  /* ── 월드 구성 (한 번) ───────────────────────────────── */
  function disposeTree(o) { o.traverse(c => { if (c.isInstancedMesh) c.dispose && c.dispose(); if (c.geometry && !c.geometry.userData.keep) c.geometry.dispose(); }); }
  function build(keepCam) {
    if (!renderer) return;
    mats();
    if (root) { scene.remove(root); disposeTree(root); }
    root = new THREE.Group(); scene.add(root);
    dyn = new THREE.Group(); root.add(dyn);
    for (const k of Object.keys(groups)) groups[k] = {};
    for (const [, el] of labels) el.remove(); labels.clear(); labelPool.forEach(e => e.remove()); labelPool = [];
    N = G.N; RMAX = winRadius(); R = wantR(); WS = R * 2 + 1; seasonId = ''; lastSig = ''; winKey = '';
    const cap = (RMAX * 2 + 1) * (RMAX * 2 + 1); cellI = new Int32Array(cap);
    const mt = M, P = MDL.P;
    // 섬·모래사장·바다 (섬 전체는 납작한 받침 하나)
    const isl = [];
    isl.push(P('box', '#c38c5c', [0, -0.18, 0], [N + 0.3, 0.42, N + 0.3]));
    isl.push(P('box', '#86b95a', [0, 0.0, 0], [N + 0.36, 0.08, N + 0.36]));
    isl.push(P('box', '#a8754a', [0, -0.3, 0], [N + 0.32, 0.06, N + 0.32]));
    isl.push(P('box', '#f7e4ad', [0, -0.42, 0], [N + 2.2, 0.08, N + 2.2]));
    isl.push(P('box', '#bff0ff', [0, -0.47, 0], [N + 3.6, 0.04, N + 3.6]));
    island = new THREE.Mesh(MDL.bake(isl), mt.toon); island.receiveShadow = true; root.add(island);
    water = new THREE.Mesh(new THREE.PlaneGeometry(N + 600, N + 600), new THREE.MeshToonMaterial({ color: '#7ad0f0', gradientMap: MAT3.grad }));
    water.rotation.x = -Math.PI / 2; water.position.y = -0.5; water.receiveShadow = true; root.add(water);
    // 물 위 바위·돛단배 (섬 둘레)
    const deco = []; for (let i = 0; i < 90; i++) { const side = i % 4, f = (Math.floor(i / 4) + rnd01(i, 1, 1)) / 23 - 0.5; const off = N / 2 + 2.6 + (i % 3) * 0.8; const x = side === 0 ? f * N : side === 1 ? f * N : side === 2 ? -off : off, z = side === 0 ? -off : side === 1 ? off : f * N; deco.push(P('dodec', i % 2 ? '#b9b3c6' : '#a59fb4', [x, -0.45, z], [0.7 + (i % 4) * 0.25, 0.5, 0.6 + (i % 3) * 0.2], [0.2, i, 0])); }
    const rocksW = new THREE.Mesh(MDL.bake(deco), mt.toon); rocksW.castShadow = true; root.add(rocksW);
    const bp = [P('sph', '#ffffff', [0, 0, 0], [0.7, 0.36, 1.6]), P('box', '#c08a55', [0, 0.1, 0], [0.6, 0.1, 1.3]), MDL.seg([0, 0.1, 0], [0, 1.5, 0], 0.03, '#8f6038'), P('box', '#ffffff', [0, 0.85, 0.32], [0.04, 1.1, 0.6], [0, 0, 0]), P('box', '#ff6f7d', [0, 1.5, 0.12], [0.03, 0.12, 0.24])];
    boat = new THREE.Mesh(MDL.bake(bp), mt.toon); boat.castShadow = true; root.add(boat);
    // 구름 (카메라 주변을 흘러간다)
    clouds = []; for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(MDL.cloud(), mt.toon); const s = 1.2 + rnd01(i, 3, 1) * 1.6; c.scale.set(s, s * 0.7, s); c.userData = { s, v: 0.25 + rnd01(i, 7, 5) * 0.35, ox: (rnd01(i, 1, 2) - 0.5) * 50, oz: (rnd01(i, 5, 4) - 0.5) * 40 }; c.position.y = 7 + rnd01(i, 2, 3) * 3; c.castShadow = true; root.add(c); clouds.push(c); }

    // 창 레이어 (용량 = 창 칸 수)
    L.tiles = inst(MDL.tileGeoLite(), mt.toonI, cap, { recv: true });
    L.trunk = inst(MDL.trunk(), mt.sway, cap * 3, { cast: true });
    L.canR = inst(MDL.canopyRound(), mt.sway, cap * 3, { cast: true });
    L.canP = inst(MDL.canopyPine(), mt.sway, cap * 3, { cast: true });
    L.snow = inst(MDL.pineSnow(), mt.sway, cap * 3, {});
    L.rock = inst(MDL.rock(), mt.toonI, cap * 2, { cast: true });
    L.flowers = ['#ff9cc2', '#ffffff', '#9ad7ff'].map(c => inst(MDL.flower(c), mt.toonI, cap * 2, {}));
    L.grass = inst(MDL.grass(), mt.toonI, cap * 2, {});
    // 동적 레이어
    L.border = inst(shared('borderG', () => { const g = new THREE.BoxGeometry(1, 1, 1); g.userData.keep = true; return g; }), shared('borderM', () => new THREE.MeshToonMaterial({ gradientMap: MAT3.grad })), 4 * cap, { parent: dyn });
    L.wheat = inst(MDL.wheat(false), mt.sway, cap, { cast: true, parent: dyn }); L.wheatS = inst(MDL.wheat(true), mt.sway, cap, { cast: true, parent: dyn });
    L.logs = inst(MDL.logs(), mt.toonI, cap, { cast: true, parent: dyn }); L.mine = inst(MDL.mine(), mt.toonI, cap, { cast: true, parent: dyn });
    L.tent = inst(MDL.tent(), mt.toonI, cap, { cast: true, parent: dyn });
    L.protect = inst(shared('protG', () => { const g = new THREE.TorusGeometry(0.34, 0.016, 4, 24); g.userData.keep = true; return g; }), shared('protM', () => new THREE.MeshBasicMaterial({ color: '#c9f6ff', transparent: true, opacity: 0.6, depthWrite: false })), cap, { parent: dyn });
    L.mon = {};
    for (const id of Object.keys(MONSTERS)) { if (MONSTERS[id].kind === 'giant') continue; L.mon[id] = inst(MDL.monsterLOD(id), mt.bob, Math.ceil(cap / 2), { cast: true, parent: dyn }); }
    // 선택 표시
    const sp = []; for (const s of [-1, 1]) { sp.push(P('box', '#ffffff', [0, 0, s * 0.45], [0.96, 0.05, 0.06])); sp.push(P('box', '#ffffff', [s * 0.45, 0, 0], [0.06, 0.05, 0.96])); }
    sel = new THREE.Mesh(MDL.bake(sp), mt.basic); root.add(sel); sel.visible = false;
    selArrow = new THREE.Mesh(MDL.bake([P('cone', '#ffd04f', [0, 0, 0], [0.32, 0.4, 0.32], [Math.PI, 0, 0]), P('cyl', '#ffd04f', [0, 0.3, 0], [0.14, 0.3, 0.14])]), mt.toon); selArrow.castShadow = true; root.add(selArrow); selArrow.visible = false;
    // 계절 입자
    const pc = 420; const pg = new THREE.BufferGeometry(); pData = new Float32Array(pc * 3); const pv = new Float32Array(pc * 3);
    for (let i = 0; i < pc; i++) { pData[i * 3] = (Math.random() - 0.5) * 30; pData[i * 3 + 1] = Math.random() * 10; pData[i * 3 + 2] = (Math.random() - 0.5) * 30; pv[i * 3] = Math.random() * 6.28; pv[i * 3 + 1] = 0.6 + Math.random() * 0.6; pv[i * 3 + 2] = Math.random(); }
    pg.setAttribute('position', new THREE.BufferAttribute(pData, 3)); pg.userData = { v: pv };
    particles = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.16, map: dotTex(), transparent: true, depthWrite: false, color: '#ffffff' }));
    particles.frustumCulled = false; root.add(particles);
    built = true; castFor();
    if (!keepCam) focus(G.factions.P.cap[0], G.factions.P.cap[1], true);
    updateCamera(0);
    ensureWindow(true);
  }
  let _dot = null;
  function dotTex() { if (_dot) return _dot; const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 2, 16, 16, 15); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); _dot = new THREE.CanvasTexture(c); return _dot; }

  /* ── 창 채우기 (정적: 타일·나무·바위·꽃·풀) ─────────── */
  const SPOTS = [[-0.27, -0.25], [0.26, -0.18], [-0.2, 0.26], [0.3, 0.28]];
  function ensureWindow(force) {
    const cx = clamp(tx(cam.tx), 0, N - 1), cy = clamp(tx(cam.tz), 0, N - 1);
    const mx = ox + R, my = oy + R;
    const sid = season().id;
    const key = sid + '|' + (TER.ver || 0);
    const r = wantR(), lim = Math.max(4, Math.floor(R * 0.3));
    const far = Math.abs(cx - mx) > lim || Math.abs(cy - my) > lim || r > R || r < R - 4;
    if (!force && !far && key === winKey) return false;
    if (force || far) { R = r; WS = R * 2 + 1; ox = clamp(cx - R, 0, Math.max(0, N - WS)); oy = clamp(cy - R, 0, Math.max(0, N - WS)); }
    winKey = key; seasonId = sid;
    let n = 0, tr = 0, cr = 0, cp = 0, sn = 0, ri = 0, gi = 0; const fc = [0, 0, 0];
    const x1 = Math.min(N, ox + WS), y1 = Math.min(N, oy + WS);
    const winter = sid === 'winter';
    for (let y = oy; y < y1; y++) for (let x = ox; x < x1; x++) {
      const i = y * N + x, h = hAt(i), X = wx(x), Z = wz(y);
      cellI[n] = i; put(L.tiles, n, X, 0, Z, 1, 0, 1, h, 1); n++;
      if (TER.gref[i] >= 0) continue;
      const ty = TER.type[i], d = TER.deco[i];
      if (ty === 1) {
        const k1 = 2 + (d % 2);
        for (let k = 0; k < k1; k++) {
          const sp = SPOTS[(k + d) % 4]; const px = X + sp[0] + (rnd01(x, y, k) - 0.5) * 0.12, pz = Z + sp[1] + (rnd01(y, x, k + 3) - 0.5) * 0.12;
          const pine = rnd01(x, y, k + 9) < 0.42, s = 0.6 + rnd01(x, y, k + 5) * 0.3, ry = rnd01(x, y, k + 7) * 6;
          put(L.trunk, tr++, px, h, pz, s, ry);
          if (pine) { put(L.canP, cp, px, h, pz, s, ry); setCol(L.canP, cp++, PINE[sid]); if (winter) put(L.snow, sn++, px, h, pz, s, ry); }
          else { put(L.canR, cr, px, h, pz, s, ry); setCol(L.canR, cr++, CANOPY[sid][Math.floor(rnd01(x, y, k + 11) * 3)]); }
        }
        if (!winter) { const a = rnd01(x, y, 30) * 6.28, r = 0.18 + rnd01(y, x, 31) * 0.18; put(L.grass, gi++, X + Math.cos(a) * r, h, Z + Math.sin(a) * r, 1.4, a); }
      } else if (ty === 2) {
        const k1 = 1 + (d % 2);
        for (let k = 0; k < k1; k++) { const sp = SPOTS[(k * 2 + d) % 4]; put(L.rock, ri, X + sp[0] * 0.9, h - 0.02, Z + sp[1] * 0.9, 0.7 + rnd01(x, y, k) * 0.5, rnd01(y, x, k) * 6); setCol(L.rock, ri++, ['#a29bb2', '#9089a2', '#b3adc1'][(d + k) % 3]); }
      } else if (ty === 0 && !winter) {
        const nf = d % 3 === 0 ? 2 : 1;
        for (let k = 0; k < nf; k++) { const ci = Math.floor(rnd01(x, y, k + 20) * 3); const sp = SPOTS[(k * 3 + d) % 4]; put(L.flowers[ci], fc[ci]++, X + sp[0] * 1.1, h, Z + sp[1] * 1.1, 1.3, rnd01(x, y, k) * 6); }
        const a = rnd01(x, y, 30) * 6.28, rr = 0.18 + rnd01(y, x, 31) * 0.18; put(L.grass, gi++, X + Math.cos(a) * rr, h, Z + Math.sin(a) * rr, 1.4, a);
      }
    }
    cellN = n;
    done(L.tiles, n); done(L.trunk, tr); done(L.canR, cr); done(L.canP, cp); done(L.snow, sn); done(L.rock, ri); done(L.grass, gi);
    L.flowers.forEach((m, k) => done(m, fc[k]));
    const pcol = { spring: '#ffc4dd', summer: '#fff7a8', autumn: '#ffb04a', winter: '#ffffff' }[sid];
    particles.material.color.set(pcol); particles.material.size = winter ? 0.17 : 0.14; particles.visible = sid !== 'summer';
    lastSig = '';
    refresh(true);
    return true;
  }

  /* ── 동적 레이어 ─────────────────────────────────────── */
  function signature() {
    const now = G.time; let prot = 0;
    for (let k = 0; k < cellN; k++) { const t = TILES[cellI[k]]; if (t && t.protect > now) prot++; }
    let alive = ''; for (const f of Object.values(G.factions)) alive += f.alive === false ? 0 : 1;
    return G.ver + '|' + ox + ',' + oy + '|' + prot + '|' + alive + '|' + G.player.buildings.capital + '|' + Object.keys(G.factions).length;
  }
  function refresh(force) {
    const sig = signature(); if (!force && sig === lastSig) return; lastSig = sig;
    const sid = seasonId, now = G.time;
    // 타일 색
    for (let k = 0; k < cellN; k++) { const i = cellI[k], t = TILES[i]; const c = tileColor(i, t && t.owner, sid); L.tiles.instanceColor.setXYZ(k, c.r, c.g, c.b); }
    L.tiles.instanceColor.needsUpdate = true;
    // 정찰 범위: 내 영토에서 4칸, 다른 세력 영토에서 2칸까지 몬스터가 보인다 (창 안만 계산)
    const seen = new Uint8Array(WS * WS);
    for (const fid of Object.keys(OWNED)) {
      const r = fid === 'P' ? 4 : 2;
      for (const i of OWNED[fid]) {
        const x0 = i % N, y0 = (i / N) | 0; if (!inWin(x0, y0, r)) continue;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx - ox, y = y0 + dy - oy; if (x >= 0 && y >= 0 && x < WS && y < WS) seen[y * WS + x] = 1; }
      }
    }
    // 경계선·영지 소품·몬스터
    let bi = 0, w = 0, ws = 0, lg = 0, mn = 0, tn = 0, pr = 0; const mc = {}; for (const k in L.mon) mc[k] = 0;
    const capM = L.wheat.instanceMatrix.count, monCap = L.mon[Object.keys(L.mon)[0]].instanceMatrix.count;
    const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (let k = 0; k < cellN; k++) {
      const i = cellI[k], x0 = i % N, y0 = (i / N) | 0, t = TILES[i];
      const h = hAt(i), X = wx(x0), Z = wz(y0);
      const owner = t ? t.owner : null;
      if (owner) {
        const col = G.factions[owner] ? G.factions[owner].color : '#999';
        for (const [dx, dy] of sides) { const nx = x0 + dx, ny = y0 + dy; const nt = nx >= 0 && ny >= 0 && nx < N && ny < N ? TILES[ny * N + nx] : null; if (nt && nt.owner === owner) continue; const horiz = dy !== 0; put(L.border, bi, X + dx * 0.43, h + 0.02, Z + dy * 0.43, 1, 0, horiz ? 0.94 : 0.09, 0.07, horiz ? 0.09 : 0.94); setCol(L.border, bi++, col); }
        if (TER.gref[i] < 0 && !t.fort && w + ws < capM) {
          const ty = TER.type[i], d = TER.deco[i];
          if (ty === 0) { if ((x0 * 7 + y0 * 3) % 6 === 0) put(L.wheatS, ws++, X, h, Z, 1, (d % 4) * 1.57); else put(L.wheat, w++, X, h, Z, 1, (d % 4) * 1.57); }
          else if (ty === 1) put(L.logs, lg++, X + 0.05, h, Z + 0.12, 0.9, (d % 4) * 1.57);
          else if (ty === 2) put(L.mine, mn++, X, h, Z + 0.05, 1, (d % 4) * 1.57);
        }
      }
      if (t && t.protect > now) { tmpE.set(Math.PI / 2, 0, 0); tmpQ.setFromEuler(tmpE); tmpV.set(X, h + 0.05, Z); tmpS.set(1, 1, 1); tmpM.compose(tmpV, tmpQ, tmpS); L.protect.setMatrixAt(pr++, tmpM); }
      if (!owner && TER.gref[i] < 0 && TER.type[i] !== 3 && seen[(y0 - oy) * WS + (x0 - ox)]) {
        const tt = tileI(i), ms = tt.monsters; if (!ms || !ms.length) continue;
        const lv = TER.lv[i], ruin = TER.type[i] === 4;
        const lvS = 0.46 + lv * 0.05, ry = (rnd01(x0, y0, 50) - 0.5) * 1.6;
        const bandit = ms[0].id.startsWith('b_');
        if (bandit && !ruin) put(L.tent, tn++, X - 0.2, h, Z - 0.2, 0.75, 0.6);
        const a = ms[0].id; if (L.mon[a] && mc[a] < monCap) put(L.mon[a], mc[a]++, X + (ruin ? 0.28 : 0.04), h, Z + (ruin ? 0.3 : 0.1), lvS * (bandit ? 0.85 : 1), ry);
        if (ms.length > 1 && !ruin) { const b = ms[1].id; if (L.mon[b] && mc[b] < monCap) put(L.mon[b], mc[b]++, X + 0.26, h, Z - 0.12, lvS * 0.78 * (b.startsWith('b_') ? 0.85 : 1), ry + 0.6); }
      }
    }
    done(L.border, bi); done(L.wheat, w); done(L.wheatS, ws); done(L.logs, lg); done(L.mine, mn); done(L.tent, tn); done(L.protect, pr);
    for (const k in L.mon) done(L.mon[k], mc[k]);
    // 거점 (창 안에 있는 것만)
    const keepC = new Set();
    for (const f of Object.values(G.factions)) {
      if (!f.cap || !inWin(f.cap[0], f.cap[1], 1)) continue;
      const t = tileAt(f.cap[0], f.cap[1]); if (!t) continue;
      const owner = t.owner || f.id; const F = G.factions[owner] || f; const color = F.color;
      const lv = f.id === 'P' ? G.player.buildings.capital : f.capLv || Math.min(15, 1 + Math.floor(G.time / 1440) * 4);
      const key = f.id, cur = groups.castles[key], want = color + ':' + Math.min(3, Math.floor(lv / 5)) + ':' + f.cap.join(','); keepC.add(key);
      if (cur && cur.userData.want === want) continue;
      if (cur) { root.remove(cur); disposeTree(cur); }
      const g = new THREE.Group(); g.position.set(wx(t.x), hAt(t.i), wz(t.y)); g.userData.want = want; g.userData.fid = f.id;
      const m = new THREE.Mesh(MDL.castle(color, lv), M.toon); m.castShadow = true; m.receiveShadow = true; g.add(m);
      const kh = 0.42 + Math.min(3, Math.floor(lv / 5)) * 0.08;
      const fl = new THREE.Mesh(MDL.flag(color), M.toon); fl.position.set(0, 0.08 + kh + 0.55, -0.02); fl.castShadow = true; g.add(fl); g.userData.flag = fl;
      const lamps = new THREE.Group(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(shared('lamp', () => { const s = new THREE.SphereGeometry(0.045, 8, 6); s.userData.keep = true; return s; }), shared('lampM', () => new THREE.MeshBasicMaterial({ color: '#ffd76a' }))); l.position.set(sx * 0.38, 0.4, sz * 0.38 + sz * 0.11); lamps.add(l); } g.add(lamps); g.userData.lamps = lamps;
      root.add(g); groups.castles[key] = g;
    }
    for (const k of Object.keys(groups.castles)) if (!keepC.has(k)) { root.remove(groups.castles[k]); disposeTree(groups.castles[k]); delete groups.castles[k]; }
    // 요새
    const fortKeys = new Set();
    for (const fid of Object.keys(FORTS)) for (const i of FORTS[fid]) {
      const x = i % N, y = (i / N) | 0; if (!inWin(x, y)) continue;
      const t = TILES[i]; if (!t || !t.owner) continue;
      const key = x + ',' + y; fortKeys.add(key); const color = G.factions[t.owner] ? G.factions[t.owner].color : '#999'; const cur = groups.forts[key];
      if (cur && cur.userData.color === color) continue; if (cur) root.remove(cur);
      const g = new THREE.Group(); g.position.set(wx(x), hAt(i), wz(y)); g.userData.color = color;
      const m = new THREE.Mesh(MDL.fort(color), M.toon); m.castShadow = true; g.add(m);
      const fl = new THREE.Mesh(MDL.flag(color), M.toon); fl.position.set(0, 1.12, 0); g.add(fl); g.userData.flag = fl; root.add(g); groups.forts[key] = g;
    }
    for (const k of Object.keys(groups.forts)) if (!fortKeys.has(k)) { root.remove(groups.forts[k]); delete groups.forts[k]; }
    // 유적
    const ruinKeys = new Set();
    for (const [x, y] of G.ruins) {
      if (!inWin(x, y)) continue; const key = x + ',' + y; ruinKeys.add(key);
      let g = groups.ruins[key];
      if (!g) {
        g = new THREE.Group(); g.position.set(wx(x), hAt(y * N + x), wz(y));
        const m = new THREE.Mesh(MDL.ruin(), M.toon); m.castShadow = true; m.receiveShadow = true; g.add(m);
        const cr = new THREE.Mesh(MDL.crystal(), new THREE.MeshToonMaterial({ color: '#c89bff', emissive: '#7a3cff', emissiveIntensity: 0.45, gradientMap: MAT3.grad, vertexColors: true }));
        cr.position.y = 1.15; cr.castShadow = true; g.add(cr); g.userData.crystal = cr; root.add(g); groups.ruins[key] = g;
      }
      const t = tileAt(x, y); const c = t.owner && G.factions[t.owner] ? G.factions[t.owner].color : '#c89bff';
      g.userData.crystal.material.color.set(c); g.userData.crystal.material.emissive.set(t.owner ? c : '#7a3cff');
    }
    for (const k of Object.keys(groups.ruins)) if (!ruinKeys.has(k)) { const g = groups.ruins[k]; root.remove(g); g.userData.crystal.material.dispose(); delete groups.ruins[k]; }
    // 거대 야수
    const gKeys = new Set();
    for (const gr of G.giants) {
      if (gr.dead || !inWin(gr.x, gr.y, 1)) continue; const key = gr.x + ',' + gr.y; gKeys.add(key);
      if (groups.giants[key]) continue;
      const g = new THREE.Group(); g.position.set(wx(gr.x), hAt(gr.y * N + gr.x), wz(gr.y));
      const geo = MDL.monster(gr.id);
      const m = new THREE.Mesh(geo, M.toon); m.scale.setScalar(1.9); m.castShadow = true; m.rotation.y = 0.5; g.add(m);
      const o = new THREE.Mesh(geo, M.outline); o.scale.setScalar(1.9); o.rotation.y = 0.5; g.add(o);
      const ring = new THREE.Mesh(shared('gRing', () => { const r = new THREE.TorusGeometry(1.45, 0.05, 4, 40); r.userData.keep = true; return r; }), shared('gRingM', () => new THREE.MeshBasicMaterial({ color: '#ff5d6c' }))); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
      g.userData = { body: m, ol: o, ring, id: gr.id }; root.add(g); groups.giants[key] = g;
    }
    for (const k of Object.keys(groups.giants)) if (!gKeys.has(k)) { root.remove(groups.giants[k]); delete groups.giants[k]; }
  }

  /* ── 부대 ────────────────────────────────────────────── */
  function allArmies() { const extra = typeof NET !== 'undefined' && NET.armies ? NET.armies() : []; return extra.length ? G.armies.concat(extra) : G.armies; }
  function armyGroup(a) {
    const g = new THREE.Group(); const f = G.factions[a.owner] || { color: '#999999', dark: '#666666' }; const color = f.color, trim = f.dark;
    const types = a.owner === 'P' ? a.units.map(id => { const s = soldierById(id); return s ? s.type : null; }).filter(Boolean) : (a.types || (a.specs || []).map(s => s.typeId)).filter(Boolean);
    const uniq = [...new Set(types)].slice(0, 3); if (!uniq.length) uniq.push('spear_long');
    const offs = [[0, 0.12], [-0.22, -0.1], [0.22, -0.12]];
    uniq.forEach((ty, i) => { const m = new THREE.Mesh(MDL.unit(ty, color, trim, false), M.toon); m.scale.setScalar(i ? 0.42 : 0.5); m.position.set(offs[i][0], 0, offs[i][1]); m.castShadow = true; g.add(m); const o = new THREE.Mesh(m.geometry, M.outline); o.scale.copy(m.scale); o.position.copy(m.position); g.add(o); });
    const pole = new THREE.Mesh(shared('pole', () => MDL.bake([MDL.seg([0, 0, 0], [0, 0.9, 0], 0.012, '#8f6038')])), M.toon); pole.position.set(-0.12, 0, -0.2); g.add(pole);
    const fl = new THREE.Mesh(MDL.flag(color), M.toon); fl.position.set(-0.12, 0.82, -0.2); g.add(fl); g.userData.flag = fl;
    g.userData.n = types.length; return g;
  }
  function updateArmies(t) {
    const seen = new Set();
    for (const a of allArmies()) {
      if (!inWin(Math.round(a.x), Math.round(a.y), 2)) continue;
      const key = String(a.key || a.id);
      seen.add(key); let g = groups.armies[key];
      if (!g) { g = armyGroup(a); root.add(g); groups.armies[key] = g; }
      const moving = a.state !== 'wait';
      const hop = moving ? Math.abs(Math.sin(t * 9 + (a.id || 0))) * 0.08 : 0;
      g.position.set(wx(a.x), hXY(a.x, a.y) + hop, wz(a.y));
      if (moving) { const dx = a.to[0] - a.from[0], dy = a.to[1] - a.from[1]; if (dx || dy) g.rotation.y = Math.atan2(dx, dy); }
      if (g.userData.flag) g.userData.flag.rotation.y = Math.sin(t * 4 + (a.id || 0)) * 0.3;
      g.userData.a = a;
    }
    for (const k of Object.keys(groups.armies)) if (!seen.has(k)) { root.remove(groups.armies[k]); delete groups.armies[k]; }
  }

  /* ── 낮·밤 ───────────────────────────────────────────── */
  const SKY = { day: new THREE.Color('#aee3ff'), dusk: new THREE.Color('#ffc59a'), night: new THREE.Color('#3d4a86') };
  function dayLight() {
    const h = (G.time % 1440) / 60;
    let d; if (h >= 7 && h <= 17) d = 1; else if (h > 17 && h < 20) d = 1 - (h - 17) / 3; else if (h > 5 && h < 7) d = (h - 5) / 2; else d = 0;
    const dusk = (h > 16 && h < 20) ? 1 - Math.abs(h - 18.3) / 2.3 : (h > 5 && h < 7.5 ? 1 - Math.abs(h - 6.3) / 1.4 : 0);
    sky.copy(SKY.night).lerp(SKY.day, d).lerp(SKY.dusk, Math.max(0, dusk) * 0.6);
    scene.background.copy(sky); scene.fog.color.copy(sky);
    sun.intensity = 0.32 + 0.5 * d; sun.color.set(dusk > 0.2 ? '#ffd2a8' : d < 0.3 ? '#b9c6ff' : '#fff2da');
    hemi.intensity = 0.44 + 0.1 * d; hemi.color.set(d < 0.3 ? '#9fb2ff' : '#eef8ff');
    for (const g of Object.values(groups.castles)) g.userData.lamps.visible = d < 0.5;
    return d;
  }

  /* ── 카메라 ──────────────────────────────────────────── */
  function focus(x, y, instant) {
    cam.ttx = wx(x); cam.ttz = wz(y);
    // 멀리 뛸 때는 날아가지 않고 바로 옮긴다 (가는 길의 창을 매번 채우지 않게)
    if (instant || Math.abs(cam.ttx - cam.tx) > R || Math.abs(cam.ttz - cam.tz) > R) { cam.tx = cam.ttx; cam.tz = cam.ttz; }
  }
  function panBy(dx, dy) {
    const k = cam.dist / (container.clientHeight || 600) * 1.25;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    cam.ttx += (-dx * cy - dy * sy) * k; cam.ttz += (dx * sy - dy * cy) * k;
    const lim = N / 2; cam.ttx = clamp(cam.ttx, -lim, lim); cam.ttz = clamp(cam.ttz, -lim, lim);
    cam.tx = cam.ttx; cam.tz = cam.ttz;
  }
  function zoomBy(f) { cam.tdist = clamp(cam.tdist * f, 5, maxDist()); }
  function rotateBy(r) { cam.tyaw += r; }
  function orbit(on) { cam.orbit = on ? 1 : 0; }
  function center() { return [clamp(tx(cam.tx), 0, N - 1), clamp(tx(cam.tz), 0, N - 1)]; }
  function updateCamera(dt) {
    const k = 1 - Math.pow(0.0015, dt);
    cam.tx += (cam.ttx - cam.tx) * k; cam.tz += (cam.ttz - cam.tz) * k; cam.dist += (cam.tdist - cam.dist) * k; cam.yaw += (cam.tyaw - cam.yaw) * k;
    if (cam.orbit) { cam.tyaw += dt * 0.08; }
    const pitch = 0.78 + Math.min(1, Math.max(0, (cam.dist - 6) / 36)) * 0.36;
    camera.position.set(cam.tx + Math.sin(cam.yaw) * Math.cos(pitch) * cam.dist, Math.sin(pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * Math.cos(pitch) * cam.dist);
    camera.lookAt(cam.tx, 0.3, cam.tz);
    // 창 바깥은 안개로 흐리게
    scene.fog.near = cam.dist * 1.1 + R * 0.25; scene.fog.far = cam.dist * 1.25 + R * 1.05;
    const s = Math.max(9, cam.dist * 0.95);
    sun.position.set(cam.tx - 7, 16, cam.tz + 9); sun.target.position.set(cam.tx, 0, cam.tz); sun.target.updateMatrixWorld();
    const sc = sun.shadow.camera; if (sc.right !== s) { sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 1; sc.far = 60; sc.updateProjectionMatrix(); }
  }

  /* ── 이름표 ──────────────────────────────────────────── */
  function label(key, cls, html, x, y, z) {
    tmpV.set(x, y, z).project(camera);
    const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.15 && Math.abs(tmpV.y) < 1.15;
    if (!vis) return;
    let el = labels.get(key);
    if (!el) { el = labelPool.pop() || document.createElement('div'); labelLayer.appendChild(el); labels.set(key, el); el._html = null; }
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    if (el.className !== 'lb ' + cls) el.className = 'lb ' + cls;
    el.style.display = '';
    el.style.transform = `translate(${((tmpV.x + 1) / 2 * container.clientWidth).toFixed(1)}px, ${((1 - tmpV.y) / 2 * container.clientHeight).toFixed(1)}px) translate(-50%, -100%)`;
    el._seen = true;
  }
  function near(x, y, k) { return Math.abs(wx(x) - cam.tx) <= cam.dist * k && Math.abs(wz(y) - cam.tz) <= cam.dist * k; }
  function updateLabels() {
    for (const [, el] of labels) el._seen = false;
    for (const f of Object.values(G.factions)) {
      if (!f.cap || !near(f.cap[0], f.cap[1], 1.6)) continue;
      const t = tileAt(f.cap[0], f.cap[1]); if (!t) continue; const owner = t.owner || f.id; const F = G.factions[owner] || f;
      const hp = f.id === 'P' ? G.player.capHp : f.capHp; const hearts = '♥'.repeat(Math.max(0, hp || 0)) + '♡'.repeat(Math.max(0, CONST.CAP_HP - (hp || 0)));
      const lv = f.id === 'P' ? ` Lv${G.player.buildings.capital}` : f.capLv ? ` Lv${f.capLv}` : '';
      const on = f.online ? '<b class="on"></b>' : '';
      label('cap' + f.id, 'cap' + (f.id === 'P' ? ' me' : ''), f.alive !== false || f.id === 'P' ? `${on}<i style="background:${F.color}"></i>${esc(f.name)}${lv}<span class="hp">${hearts}</span>` : `<i style="background:${F.color}"></i>${esc(f.name)} 함락`, wx(t.x), hAt(t.i) + 1.35, wz(t.y));
    }
    for (const k of Object.keys(groups.ruins)) { const [x, y] = k.split(',').map(Number); if (!near(x, y, 1.6)) continue; const t = tileAt(x, y); const big = G.ruins.findIndex(r => r[0] === x && r[1] === y) === 12; label('ruin' + k, 'ruin', `${t.owner && G.factions[t.owner] ? `<i style="background:${G.factions[t.owner].color}"></i>` : ''}${big ? '대유적' : '유적'} Lv${t.ruin}`, wx(x), hAt(t.i) + 1.6, wz(y)); }
    for (const [k, g] of Object.entries(groups.giants)) { const [x, y] = k.split(',').map(Number); if (!near(x, y, 1.6)) continue; label('giant' + k, 'giant', `${MONSTERS[g.userData.id].name}`, wx(x), hAt(y * N + x) + 2.2, wz(y)); }
    for (const g of Object.values(groups.armies)) { const a = g.userData.a; if (!a) continue; const n = a.owner === 'P' ? a.units.length : a.n || (a.specs || []).length; const tr = a.troop ? (G.player.troops.find(x => x.id === a.troop) || {}).name : ''; label('army' + (a.key || a.id), 'army' + (a.owner === 'P' ? '' : ' foe'), `${tr ? esc(tr) + ' ' : ''}${a.state === 'wait' ? '주둔' : a.state === 'return' ? '귀환' : '진군'} ${n}`, g.position.x, g.position.y + 1.05, g.position.z); }
    // 확장 가능한 인접 타일의 레벨 배지 (가까이 볼 때)
    if (cam.dist < 20 && OWNED.P) {
      const seen = new Set();
      for (const i of OWNED.P) {
        const x0 = i % N, y0 = (i / N) | 0; if (!near(x0, y0, 0.8)) continue;
        for (const n of neighbors(x0, y0)) {
          if (n.owner === 'P' || seen.has(n.i)) continue; seen.add(n.i);
          if (!near(n.x, n.y, 0.75)) continue;
          const cnt = n.monsters ? n.monsters.length : 0; const foe = n.owner ? 'foe' : '';
          label('lv' + n.i, 'lv ' + foe + (n.lv >= 4 ? ' hard' : ''), `Lv${n.lv}${cnt > 1 ? ' ×' + cnt : ''}`, wx(n.x), hAt(n.i) + 0.08, wz(n.y) + 0.42);
        }
      }
    }
    for (const [k, el] of labels) if (!el._seen) { el.style.display = 'none'; labels.delete(k); labelPool.push(el); }
  }

  /* ── 매 프레임 ───────────────────────────────────────── */
  let clock = 0;
  function frame(dt, selected) {
    if (!renderer || !built) return;
    clock += dt; MAT3.time.value = clock;
    updateCamera(dt);
    let moved = ensureWindow(false);
    sigT -= dt; if (sigT <= 0 && !moved) { sigT = 0.3; refresh(false); }
    const d = dayLight();
    // 애니메이션
    for (const c of clouds) { c.userData.ox += c.userData.v * dt; if (c.userData.ox > 30) c.userData.ox = -30; c.position.x = cam.tx + c.userData.ox; c.position.z = cam.tz + c.userData.oz; const dc = c.position.distanceTo(camera.position), f = clamp((dc - 9) / 12, 0, 1), s = c.userData.s; c.visible = f > 0.02; c.scale.set(s * f, s * 0.7 * f, s * f); } // 카메라 가까이 오면 작아져 화면을 가리지 않는다
    if (boat) { const a = clock * 0.01; const r = N / 2 + 4.2; boat.position.set(Math.cos(a) * r, -0.42 + Math.sin(clock * 2) * 0.04, Math.sin(a) * r); boat.rotation.y = -a; boat.rotation.z = Math.sin(clock * 1.7) * 0.06; }
    for (const g of Object.values(groups.castles)) g.userData.flag.rotation.y = Math.sin(clock * 3 + g.position.x) * 0.35;
    for (const g of Object.values(groups.forts)) g.userData.flag.rotation.y = Math.sin(clock * 3 + g.position.z) * 0.35;
    L.protect.material.opacity = 0.4 + Math.sin(clock * 3) * 0.2;
    for (const g of Object.values(groups.ruins)) { const c = g.userData.crystal; c.rotation.y = clock * 1.2; c.position.y = 1.15 + Math.sin(clock * 2 + g.position.x) * 0.08; c.material.emissiveIntensity = 0.35 + (1 - d) * 0.5; }
    for (const g of Object.values(groups.giants)) { const b = 1 + Math.sin(clock * 1.6) * 0.03; g.userData.body.scale.set(1.9 * b, 1.9 / b, 1.9 * b); g.userData.ol.scale.copy(g.userData.body.scale); g.userData.ring.material.color.setHSL(0.98, 0.9, 0.6 + Math.sin(clock * 4) * 0.1); }
    updateArmies(clock);
    // 선택
    if (selected && tileAt(selected[0], selected[1])) { const [sx, sy] = selected, h = hXY(sx, sy); sel.visible = selArrow.visible = true; sel.position.set(wx(sx), h + 0.03, wz(sy)); selArrow.position.set(wx(sx), h + 1.05 + Math.abs(Math.sin(clock * 4)) * 0.22, wz(sy)); selArrow.rotation.y = clock * 2; } else sel.visible = selArrow.visible = false;
    // 입자
    if (particles.visible) {
      const pos = particles.geometry.attributes.position, v = particles.geometry.userData.v, win = seasonId === 'winter';
      for (let i = 0; i < pos.count; i++) {
        let x = pData[i * 3], y = pData[i * 3 + 1], z = pData[i * 3 + 2];
        y -= dt * (win ? 0.9 : 0.55) * v[i * 3 + 1]; x += Math.sin(clock * 1.3 + v[i * 3]) * dt * (win ? 0.25 : 0.6) + dt * 0.25; z += Math.cos(clock * 1.1 + v[i * 3]) * dt * 0.2;
        if (y < 0) { y = 8 + Math.random() * 3; x = (Math.random() - 0.5) * cam.dist * 2.2; z = (Math.random() - 0.5) * cam.dist * 2.2; }
        pData[i * 3] = x; pData[i * 3 + 1] = y; pData[i * 3 + 2] = z;
      }
      particles.position.set(cam.tx, 0, cam.tz); pos.needsUpdate = true;
    }
    updateLabels();
    renderer.render(scene, camera);
  }

  /* ── 선택 ────────────────────────────────────────────── */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
  function pick(clientX, clientY) {
    if (!built) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(L.tiles, false);
    if (hits.length && hits[0].instanceId != null && hits[0].instanceId < cellN) { const i = cellI[hits[0].instanceId]; return [i % N, (i / N) | 0]; }
    // 창 밖(납작한 받침)을 눌렀을 때는 평면과 만나는 곳
    if (ray.ray.intersectPlane(plane, tmpV)) { const x = tx(tmpV.x), y = tx(tmpV.z); if (x >= 0 && y >= 0 && x < N && y < N) return [x, y]; }
    return null;
  }

  // 타일 중심의 화면 좌표 (테스트·안내용)
  function tileToScreen(x, y) { if (!tileAt(x, y)) return null; tmpV.set(wx(x), hXY(x, y), wz(y)).project(camera); const r = renderer.domElement.getBoundingClientRect(); return [r.left + (tmpV.x + 1) / 2 * r.width, r.top + (1 - tmpV.y) / 2 * r.height]; }
  function setActive(on) { if (labelLayer) labelLayer.style.display = on ? "" : "none"; }
  return { init, build, frame, resize, pick, panBy, zoomBy, rotateBy, focus, orbit, center, setQuality, getQuality, tileToScreen, setActive, get ready() { return built; }, get renderer() { return renderer; }, get window() { return { ox, oy, WS }; }, get dist() { return cam.dist; } };
})();
