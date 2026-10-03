/* ============================================================
   3D 월드맵 — 바다 위 디오라마 섬
   정적 레이어(타일·나무·바위·꽃)는 한 번, 동적 레이어(영토·몬스터·밀밭…)는
   타일 상태가 바뀔 때만 다시 만든다. 대부분 InstancedMesh.
   ============================================================ */
'use strict';

const World3D = typeof THREE === 'undefined' ? null : (() => {
  let renderer = null, scene, camera, root, dyn, container, labelLayer;
  const cam = { tx: 0, tz: 0, dist: 15, yaw: 0.35, tdist: 15, tyaw: 0.35, ttx: 0, ttz: 0, orbit: 0 };
  const L = {};            // 인스턴스 레이어
  let tileH = [];          // 타일 윗면 높이
  let N = 40, built = false, lastSig = '', sigT = 0, seasonId = '', quality = 'high', scout = null;
  let sun, hemi, water, sky = new THREE.Color('#aee3ff');
  const groups = { castles: {}, forts: {}, ruins: {}, giants: {}, armies: {} };
  let sel, selArrow, clouds = [], boat, particles, pData = null;
  const labels = new Map(); let labelPool = [];
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

  const wx = (x) => x - N / 2 + 0.5, wz = (y) => y - N / 2 + 0.5;
  const rnd01 = (x, y, k) => { const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453; return s - Math.floor(s); };

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
  function applyQuality() {
    if (!renderer) return; castFor();
    const pr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(quality === 'low' ? 1 : quality === 'mid' ? Math.min(pr, 1.5) : Math.min(pr, 2));
    renderer.shadowMap.enabled = quality !== 'low'; sun.castShadow = quality !== 'low';
    sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    resize();
  }
  function setQuality(q) { quality = q; try { localStorage.setItem('acres9_quality', q); } catch (e) {} applyQuality(); }
  function getQuality() { return quality; }
  function resize() { if (!renderer) return; const w = container.clientWidth || 1, h = container.clientHeight || 1; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }

  const SH = {}; const shared = (k, make) => SH[k] || (SH[k] = make());
  /* ── 공용 재질 ───────────────────────────────────────── */
  let M = null;
  function mats() {
    if (M) return M;
    M = { toon: MAT3.toon(), toonI: MAT3.toon(), bob: MAT3.bobbing(), sway: MAT3.swaying(), outline: MAT3.outline(0.03), basic: new THREE.MeshBasicMaterial({ vertexColors: true }) };
    return M;
  }

  /* ── 타일 지오메트리 (둥근 블록, 윗면 밝게·옆면 어둡게) ─ */
  const makeTileGeo = () => MDL.tileGeo();

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

  /* ── 색 ──────────────────────────────────────────────── */
  const GROUND = {
    spring: { plain: '#8fd468', forest: '#69ba55', hill: '#c7a97e', capital: '#e6d6b4', ruin: '#bfb2db' },
    summer: { plain: '#78c957', forest: '#55ab49', hill: '#c2a277', capital: '#e6d6b4', ruin: '#bfb2db' },
    autumn: { plain: '#dcc062', forest: '#c09f4e', hill: '#c39c72', capital: '#e6d6b4', ruin: '#bfb2db' },
    winter: { plain: '#eef5fa', forest: '#dfe9f1', hill: '#d9dde6', capital: '#eceef2', ruin: '#d6d1e8' },
  };
  const CANOPY = { spring: ['#9be27a', '#86d672', '#ffc2dc'], summer: ['#5fc14f', '#4cae46', '#6fd05a'], autumn: ['#ff9a3c', '#f2c84b', '#e8603f'], winter: ['#f4f8ff', '#eaf2fb', '#ffffff'] };
  const PINE = { spring: '#4fa868', summer: '#3f9a5c', autumn: '#4f9461', winter: '#3d8a5a' };
  function tileColor(t, sid) {
    const base = new THREE.Color(GROUND[sid][t.type] || GROUND[sid].plain);
    const v = (t.deco % 3) * 0.03; base.offsetHSL(0, 0, v - 0.03);
    if (t.lv >= 3 && !t.owner && t.type !== 'ruin' && t.type !== 'capital') base.offsetHSL(0.02, -0.05, -0.035 * (t.lv - 2));
    if (t.owner) base.lerp(new THREE.Color(G.factions[t.owner].color), 0.32);
    return base;
  }

  /* ── 월드 구성 ────────────────────────────────────────── */
  function dispose(o) { o.traverse(c => { if (c.isInstancedMesh) c.dispose && c.dispose(); }); }
  function build() {
    if (!renderer) return;
    mats();
    if (root) { scene.remove(root); dispose(root); }
    root = new THREE.Group(); scene.add(root);
    dyn = new THREE.Group(); root.add(dyn);
    for (const k of Object.keys(groups)) groups[k] = {};
    for (const [, el] of labels) el.remove(); labels.clear(); labelPool.forEach(e => e.remove()); labelPool = [];
    N = G.N; seasonId = ''; lastSig = '';
    const mt = M;
    // 섬·모래사장·바다
    const isl = []; const P = MDL.P;
    isl.push(P('box', '#c38c5c', [0, -0.18, 0], [N + 0.3, 0.42, N + 0.3]));
    isl.push(P('box', '#7cae50', [0, 0.0, 0], [N + 0.36, 0.08, N + 0.36]));
    isl.push(P('box', '#a8754a', [0, -0.3, 0], [N + 0.32, 0.06, N + 0.32]));
    isl.push(P('box', '#f7e4ad', [0, -0.42, 0], [N + 2.2, 0.08, N + 2.2]));
    isl.push(P('box', '#bff0ff', [0, -0.47, 0], [N + 3.6, 0.04, N + 3.6]));
    const island = new THREE.Mesh(MDL.bake(isl), mt.toon); island.receiveShadow = true; root.add(island);
    water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshToonMaterial({ color: '#7ad0f0', gradientMap: MAT3.grad }));
    water.rotation.x = -Math.PI / 2; water.position.y = -0.5; water.receiveShadow = true; root.add(water);
    // 물 위 바위·돛단배
    const deco = []; for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + 0.3; const r = N / 2 + 2.6 + (i % 3) * 0.8; deco.push(P('dodec', i % 2 ? '#b9b3c6' : '#a59fb4', [Math.cos(a) * r, -0.45, Math.sin(a) * r], [0.7 + (i % 4) * 0.25, 0.5, 0.6 + (i % 3) * 0.2], [0.2, a, 0])); }
    const rocksW = new THREE.Mesh(MDL.bake(deco), mt.toon); rocksW.castShadow = true; root.add(rocksW);
    const bp = [P('sph', '#ffffff', [0, 0, 0], [0.7, 0.36, 1.6]), P('box', '#c08a55', [0, 0.1, 0], [0.6, 0.1, 1.3]), MDL.seg([0, 0.1, 0], [0, 1.5, 0], 0.03, '#8f6038'), P('box', '#ffffff', [0, 0.85, 0.32], [0.04, 1.1, 0.6], [0, 0, 0]), P('box', '#ff6f7d', [0, 1.5, 0.12], [0.03, 0.12, 0.24])];
    boat = new THREE.Mesh(MDL.bake(bp), mt.toon); boat.castShadow = true; root.add(boat);
    // 구름
    clouds = []; for (let i = 0; i < 9; i++) { const c = new THREE.Mesh(MDL.cloud(), mt.toon); const s = 1.2 + rnd01(i, 3, 1) * 1.6; c.scale.set(s, s * 0.7, s); c.position.set((rnd01(i, 1, 2) - 0.5) * (N + 20), 7 + rnd01(i, 2, 3) * 3, (rnd01(i, 5, 4) - 0.5) * (N + 14)); c.castShadow = true; c.userData.v = 0.25 + rnd01(i, 7, 5) * 0.35; root.add(c); clouds.push(c); }

    // 타일
    tileH = new Array(N * N);
    L.tiles = inst(makeTileGeo(), mt.toonI, N * N, { recv: true, color: true });
    for (const t of G.map) {
      const h = t.type === 'hill' ? 0.44 + (t.deco % 3) * 0.04 + (t.lv >= 3 ? 0.04 : 0) : t.type === 'forest' ? 0.32 : t.type === 'ruin' ? 0.36 : t.type === 'capital' ? 0.34 : 0.28 + (t.deco % 2) * 0.02;
      const i = t.y * N + t.x; tileH[i] = h;
      put(L.tiles, i, wx(t.x), 0, wz(t.y), 1, 0, 1, h, 1);
    }
    L.tiles.count = N * N; L.tiles.instanceMatrix.needsUpdate = true;
    // 나무·바위·꽃·풀
    const forest = G.map.filter(t => t.type === 'forest' && !t.giantRef), hills = G.map.filter(t => t.type === 'hill' && !t.giantRef), plains = G.map.filter(t => t.type === 'plain' && !t.giantRef);
    L.trunk = inst(MDL.trunk(), mt.sway, forest.length * 3, { cast: true });
    L.canR = inst(MDL.canopyRound(), mt.sway, forest.length * 3, { cast: true, color: true });
    L.canP = inst(MDL.canopyPine(), mt.sway, forest.length * 3, { cast: true, color: true });
    L.snow = inst(MDL.pineSnow(), mt.sway, forest.length * 3, {});
    L.trees = [];
    const spots = [[-0.27, -0.25], [0.26, -0.18], [-0.2, 0.26], [0.3, 0.28]];
    for (const t of forest) {
      const n = 2 + (t.deco % 2);
      for (let k = 0; k < n; k++) {
        const sp = spots[(k + t.deco) % 4]; const jx = (rnd01(t.x, t.y, k) - 0.5) * 0.12, jz = (rnd01(t.y, t.x, k + 3) - 0.5) * 0.12;
        const pine = rnd01(t.x, t.y, k + 9) < 0.42; const s = 0.6 + rnd01(t.x, t.y, k + 5) * 0.3;
        L.trees.push({ x: wx(t.x) + sp[0] + jx, y: tileH[t.y * N + t.x], z: wz(t.y) + sp[1] + jz, s, pine, ry: rnd01(t.x, t.y, k + 7) * 6, c: Math.floor(rnd01(t.x, t.y, k + 11) * 3) });
      }
    }
    L.rock = inst(MDL.rock(), mt.toonI, hills.length * 2, { cast: true, color: true });
    let ri = 0; for (const t of hills) { const n = 1 + (t.deco % 2); for (let k = 0; k < n; k++) { const sp = spots[(k * 2 + t.deco) % 4]; put(L.rock, ri, wx(t.x) + sp[0] * 0.9, tileH[t.y * N + t.x] - 0.02, wz(t.y) + sp[1] * 0.9, 0.7 + rnd01(t.x, t.y, k) * 0.5, rnd01(t.y, t.x, k) * 6); setCol(L.rock, ri, ['#a29bb2', '#9089a2', '#b3adc1'][(t.deco + k) % 3]); ri++; } }
    L.rock.count = ri; L.rock.instanceMatrix.needsUpdate = true; L.rock.instanceColor.needsUpdate = true;
    const fcols = ['#ff9cc2', '#ffffff', '#9ad7ff'];
    L.flowers = fcols.map(c => inst(MDL.flower(c), mt.toonI, plains.length * 2, {}));
    const fc = [0, 0, 0];
    for (const t of plains) for (let k = 0; k < 2; k++) { const ci = Math.floor(rnd01(t.x, t.y, k + 20) * 3); const sp = spots[(k * 3 + t.deco) % 4]; put(L.flowers[ci], fc[ci]++, wx(t.x) + sp[0] * 1.1, tileH[t.y * N + t.x], wz(t.y) + sp[1] * 1.1, 1.3, rnd01(t.x, t.y, k) * 6); }
    L.flowers.forEach((m, i) => { m.count = fc[i]; m.instanceMatrix.needsUpdate = true; });
    L.grass = inst(MDL.grass(), mt.toonI, (plains.length + forest.length) * 2, {});
    let gi = 0; for (const t of plains.concat(forest)) for (let k = 0; k < 2; k++) { const a = rnd01(t.x, t.y, k + 30) * 6.28, r = 0.18 + rnd01(t.y, t.x, k + 31) * 0.18; put(L.grass, gi++, wx(t.x) + Math.cos(a) * r, tileH[t.y * N + t.x], wz(t.y) + Math.sin(a) * r, 1.4, a); }
    L.grass.count = gi; L.grass.instanceMatrix.needsUpdate = true;

    // 동적 레이어 그릇
    L.border = inst(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshToonMaterial({ gradientMap: MAT3.grad }), 4 * N * N, { color: true, parent: dyn });
    L.wheat = inst(MDL.wheat(false), mt.sway, N * N, { cast: true, parent: dyn }); L.wheatS = inst(MDL.wheat(true), mt.sway, N * N, { cast: true, parent: dyn });
    L.logs = inst(MDL.logs(), mt.toonI, N * N, { cast: true, parent: dyn }); L.mine = inst(MDL.mine(), mt.toonI, N * N, { cast: true, parent: dyn });
    L.tent = inst(MDL.tent(), mt.toonI, N * N, { cast: true, parent: dyn });
    L.protect = inst(new THREE.TorusGeometry(0.34, 0.016, 4, 24), new THREE.MeshBasicMaterial({ color: '#c9f6ff', transparent: true, opacity: 0.6, depthWrite: false }), N * N, { parent: dyn });
    L.mon = {}; L.monOl = {};
    for (const id of Object.keys(MONSTERS)) { if (MONSTERS[id].kind === 'giant') continue; L.mon[id] = inst(MDL.monsterLOD(id), mt.bob, N * N, { cast: true, parent: dyn }); }
    // 유적 (정적 구조 + 수정)
    for (const t of G.map) if (t.type === 'ruin') {
      const g = new THREE.Group(); g.position.set(wx(t.x), tileH[t.y * N + t.x], wz(t.y));
      const m = new THREE.Mesh(MDL.ruin(), mt.toon); m.castShadow = true; m.receiveShadow = true; g.add(m);
      const cr = new THREE.Mesh(MDL.crystal(), new THREE.MeshToonMaterial({ color: '#c89bff', emissive: '#7a3cff', emissiveIntensity: 0.45, gradientMap: MAT3.grad, vertexColors: true }));
      cr.position.y = 1.15; cr.castShadow = true; g.add(cr); g.userData.crystal = cr; root.add(g); groups.ruins[t.x + ',' + t.y] = g;
    }
    // 거대 야수
    for (const t of G.map) if (t.giant) {
      const g = new THREE.Group(); g.position.set(wx(t.x), tileH[t.y * N + t.x], wz(t.y));
      const m = new THREE.Mesh(MDL.monster(t.giant.id), mt.toon); m.scale.setScalar(1.9); m.castShadow = true; m.rotation.y = 0.5; g.add(m);
      const o = new THREE.Mesh(MDL.monster(t.giant.id), mt.outline); o.scale.setScalar(1.9); o.rotation.y = 0.5; g.add(o);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 4, 40), new THREE.MeshBasicMaterial({ color: '#ff5d6c' })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
      g.userData = { body: m, ol: o, ring, key: t.x + ',' + t.y }; root.add(g); groups.giants[t.x + ',' + t.y] = g;
    }
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
    updateSeason(true); refresh(true);
    focus(G.factions.P.cap[0], G.factions.P.cap[1], true);
  }
  let _dot = null;
  function dotTex() { if (_dot) return _dot; const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 2, 16, 16, 15); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); _dot = new THREE.CanvasTexture(c); return _dot; }

  /* ── 계절 ────────────────────────────────────────────── */
  function updateSeason(force) {
    const sid = season().id; if (!force && sid === seasonId) return; seasonId = sid;
    let tr = 0, cr = 0, cp = 0, sn = 0;
    for (const t of L.trees) {
      put(L.trunk, tr++, t.x, t.y, t.z, t.s, t.ry);
      if (t.pine) { put(L.canP, cp, t.x, t.y, t.z, t.s, t.ry); setCol(L.canP, cp++, PINE[sid]); if (sid === 'winter') put(L.snow, sn++, t.x, t.y, t.z, t.s, t.ry); }
      else { put(L.canR, cr, t.x, t.y, t.z, t.s, t.ry); setCol(L.canR, cr++, CANOPY[sid][t.c]); }
    }
    for (const [m, c] of [[L.trunk, tr], [L.canR, cr], [L.canP, cp], [L.snow, sn]]) { m.count = c; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    L.flowers.forEach(m => m.visible = sid !== 'winter'); L.grass.visible = sid !== 'winter';
    const pcol = { spring: '#ffc4dd', summer: '#fff7a8', autumn: '#ffb04a', winter: '#ffffff' }[sid];
    particles.material.color.set(pcol); particles.material.size = sid === 'winter' ? 0.17 : 0.14; particles.visible = sid !== 'summer';
    lastSig = ''; // 타일 색 다시
  }

  /* ── 동적 레이어 ─────────────────────────────────────── */
  function signature() {
    let s = ''; const now = G.time;
    for (const t of G.map) s += (t.owner || '-') + (t.fort ? 'f' : '') + (t.monsters && t.monsters.length ? t.monsters.length + t.monsters[0].id[0] + t.monsters[0].id[2] : '0') + (t.protect > now ? 'p' : '') + (t.giant ? 'g' : '') + (t.ruin || '');
    for (const f of Object.values(G.factions)) s += f.alive ? 1 : 0;
    return s + G.player.buildings.capital;
  }
  function refresh(force) {
    const sig = signature(); if (!force && sig === lastSig) return; lastSig = sig;
    const sid = seasonId;
    // 타일 색
    for (const t of G.map) { const c = tileColor(t, sid); L.tiles.instanceColor.setXYZ(t.y * N + t.x, c.r, c.g, c.b); }
    L.tiles.instanceColor.needsUpdate = true;
    // 경계선
    let bi = 0;
    for (const t of G.map) if (t.owner) {
      const h = tileH[t.y * N + t.x] + 0.02, col = G.factions[t.owner].color;
      const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (const [dx, dy] of sides) { const n = tileAt(t.x + dx, t.y + dy); if (n && n.owner === t.owner) continue; const horiz = dy !== 0; put(L.border, bi, wx(t.x) + dx * 0.43, h, wz(t.y) + dy * 0.43, 1, 0, horiz ? 0.94 : 0.09, 0.07, horiz ? 0.09 : 0.94); setCol(L.border, bi++, col); }
    }
    L.border.count = bi; L.border.instanceMatrix.needsUpdate = true; L.border.instanceColor.needsUpdate = true;
    // 정찰 범위: 플레이어 영토에서 4칸, 다른 세력 영토에서 2칸까지 몬스터가 보인다
    const seen = new Uint8Array(N * N);
    for (const t of G.map) if (t.owner) { const r = t.owner === 'P' ? 4 : 2; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = t.x + dx, y = t.y + dy; if (x >= 0 && y >= 0 && x < N && y < N) seen[y * N + x] = 1; } }
    scout = seen;
    // 영지 소품
    let w = 0, ws = 0, lg = 0, mn = 0, tn = 0, pr = 0; const mc = {}; for (const k in L.mon) mc[k] = 0;
    for (const t of G.map) {
      const i = t.y * N + t.x, h = tileH[i], x = wx(t.x), z = wz(t.y);
      if (t.owner && !t.giantRef && !t.fort) {
        if (t.type === 'plain') { if ((t.x * 7 + t.y * 3) % 6 === 0) put(L.wheatS, ws++, x, h, z, 1, (t.deco % 4) * 1.57); else put(L.wheat, w++, x, h, z, 1, (t.deco % 4) * 1.57); }
        if (t.type === 'forest') put(L.logs, lg++, x + 0.05, h, z + 0.12, 0.9, (t.deco % 4) * 1.57);
        if (t.type === 'hill') put(L.mine, mn++, x, h, z + 0.05, 1, (t.deco % 4) * 1.57);
      }
      if (t.protect > G.time) { tmpE.set(Math.PI / 2, 0, 0); tmpQ.setFromEuler(tmpE); tmpV.set(x, h + 0.05, z); tmpS.set(1, 1, 1); tmpM.compose(tmpV, tmpQ, tmpS); L.protect.setMatrixAt(pr++, tmpM); }
      if (!t.owner && t.monsters && t.monsters.length && !t.giantRef && seen[i]) {
        const lvS = 0.46 + t.lv * 0.05; const ry = (rnd01(t.x, t.y, 50) - 0.5) * 1.6;
        const bandit = t.monsters[0].id.startsWith('b_');
        if (bandit && t.type !== 'ruin') put(L.tent, tn++, x - 0.2, h, z - 0.2, 0.75, 0.6);
        const a = t.monsters[0].id; if (L.mon[a]) put(L.mon[a], mc[a]++, x + (t.type === 'ruin' ? 0.28 : 0.04), h, z + (t.type === 'ruin' ? 0.3 : 0.1), lvS * (bandit ? 0.85 : 1), ry);
        if (t.monsters.length > 1 && t.type !== 'ruin') { const b = t.monsters[1].id; if (L.mon[b]) put(L.mon[b], mc[b]++, x + 0.26, h, z - 0.12, lvS * 0.78 * (b.startsWith('b_') ? 0.85 : 1), ry + 0.6); }
      }
    }
    for (const [m, c] of [[L.wheat, w], [L.wheatS, ws], [L.logs, lg], [L.mine, mn], [L.tent, tn], [L.protect, pr]]) { m.count = c; m.instanceMatrix.needsUpdate = true; }
    for (const k in L.mon) { L.mon[k].count = mc[k]; L.mon[k].instanceMatrix.needsUpdate = true; }
    // 거점
    for (const f of Object.values(G.factions)) {
      const t = tileAt(f.cap[0], f.cap[1]); const owner = t.owner || f.id; const color = G.factions[owner].color;
      const lv = owner === 'P' ? G.player.buildings.capital : Math.min(15, 1 + Math.floor(G.time / 1440) * 4);
      const key = f.id, cur = groups.castles[key], want = color + ':' + Math.min(3, Math.floor(lv / 5));
      if (cur && cur.userData.want === want) continue;
      if (cur) root.remove(cur);
      const g = new THREE.Group(); g.position.set(wx(t.x), tileH[t.y * N + t.x], wz(t.y)); g.userData.want = want; g.userData.fid = f.id;
      const m = new THREE.Mesh(MDL.castle(color, lv), M.toon); m.castShadow = true; m.receiveShadow = true; g.add(m);
      const kh = 0.42 + Math.min(3, Math.floor(lv / 5)) * 0.08;
      const fl = new THREE.Mesh(MDL.flag(color), M.toon); fl.position.set(0, 0.08 + kh + 0.55, -0.02); fl.castShadow = true; g.add(fl); g.userData.flag = fl;
      const lamps = new THREE.Group(); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = new THREE.Mesh(shared('lamp', () => new THREE.SphereGeometry(0.045, 8, 6)), shared('lampM', () => new THREE.MeshBasicMaterial({ color: '#ffd76a' }))); l.position.set(sx * 0.38, 0.4, sz * 0.38 + sz * 0.11); lamps.add(l); } g.add(lamps); g.userData.lamps = lamps;
      root.add(g); groups.castles[key] = g;
    }
    // 요새
    const fortKeys = new Set();
    for (const t of G.map) if (t.fort && t.owner) {
      const key = t.x + ',' + t.y; fortKeys.add(key); const color = G.factions[t.owner].color; const cur = groups.forts[key];
      if (cur && cur.userData.color === color) continue; if (cur) root.remove(cur);
      const g = new THREE.Group(); g.position.set(wx(t.x), tileH[t.y * N + t.x], wz(t.y)); g.userData.color = color;
      const m = new THREE.Mesh(MDL.fort(color), M.toon); m.castShadow = true; g.add(m);
      const fl = new THREE.Mesh(MDL.flag(color), M.toon); fl.position.set(0, 1.12, 0); g.add(fl); g.userData.flag = fl; root.add(g); groups.forts[key] = g;
    }
    for (const k of Object.keys(groups.forts)) if (!fortKeys.has(k)) { root.remove(groups.forts[k]); delete groups.forts[k]; }
    // 유적 수정 색
    for (const [k, g] of Object.entries(groups.ruins)) { const [x, y] = k.split(',').map(Number); const t = tileAt(x, y); const c = t.owner ? G.factions[t.owner].color : '#c89bff'; g.userData.crystal.material.color.set(c); g.userData.crystal.material.emissive.set(t.owner ? c : '#7a3cff'); }
    // 거대 야수 생존
    for (const [k, g] of Object.entries(groups.giants)) { const [x, y] = k.split(',').map(Number); g.visible = !!tileAt(x, y).giant; }
  }

  /* ── 부대 ────────────────────────────────────────────── */
  function armyGroup(a) {
    const g = new THREE.Group(); const f = G.factions[a.owner]; const color = f.color, trim = f.dark;
    const types = a.owner === 'P' ? a.units.map(id => { const s = soldierById(id); return s ? s.type : null; }).filter(Boolean) : (a.specs || []).map(s => s.typeId).filter(Boolean);
    const uniq = [...new Set(types)].slice(0, 3); if (!uniq.length) uniq.push('spear_long');
    const offs = [[0, 0.12], [-0.22, -0.1], [0.22, -0.12]];
    uniq.forEach((ty, i) => { const m = new THREE.Mesh(MDL.unit(ty, color, trim, false), M.toon); m.scale.setScalar(i ? 0.42 : 0.5); m.position.set(offs[i][0], 0, offs[i][1]); m.castShadow = true; g.add(m); const o = new THREE.Mesh(m.geometry, M.outline); o.scale.copy(m.scale); o.position.copy(m.position); g.add(o); });
    const pole = new THREE.Mesh(shared('pole', () => MDL.bake([MDL.seg([0, 0, 0], [0, 0.9, 0], 0.012, '#8f6038')])), M.toon); pole.position.set(-0.12, 0, -0.2); g.add(pole);
    const fl = new THREE.Mesh(MDL.flag(color), M.toon); fl.position.set(-0.12, 0.82, -0.2); g.add(fl); g.userData.flag = fl;
    g.userData.n = types.length; return g;
  }
  function updateArmies(t) {
    const seen = new Set();
    for (const a of G.armies) {
      seen.add(a.id); let g = groups.armies[a.id];
      if (!g) { g = armyGroup(a); root.add(g); groups.armies[a.id] = g; }
      const tx = Math.round(a.x), ty = Math.round(a.y); const t0 = tileAt(clamp(tx, 0, N - 1), clamp(ty, 0, N - 1));
      const h = t0 ? tileH[t0.y * N + t0.x] : 0.3;
      const moving = a.state !== 'wait';
      const hop = moving ? Math.abs(Math.sin(t * 9 + a.id)) * 0.08 : 0;
      g.position.set(wx(a.x), h + hop, wz(a.y));
      if (moving) { const dx = a.to[0] - a.from[0], dy = a.to[1] - a.from[1]; if (dx || dy) g.rotation.y = Math.atan2(dx, dy); }
      if (g.userData.flag) g.userData.flag.rotation.y = Math.sin(t * 4 + a.id) * 0.3;
    }
    for (const k of Object.keys(groups.armies)) if (!seen.has(+k)) { root.remove(groups.armies[k]); delete groups.armies[k]; }
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
  function focus(x, y, instant) { cam.ttx = wx(x); cam.ttz = wz(y); if (instant) { cam.tx = cam.ttx; cam.tz = cam.ttz; } }
  function panBy(dx, dy) {
    const k = cam.dist / (container.clientHeight || 600) * 1.25;
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    cam.ttx += (-dx * cy - dy * sy) * k; cam.ttz += (dx * sy - dy * cy) * k;
    const lim = N / 2 + 1; cam.ttx = clamp(cam.ttx, -lim, lim); cam.ttz = clamp(cam.ttz, -lim, lim);
    cam.tx = cam.ttx; cam.tz = cam.ttz;
  }
  function zoomBy(f) { cam.tdist = clamp(cam.tdist * f, 5, 46); }
  function rotateBy(r) { cam.tyaw += r; }
  function orbit(on) { cam.orbit = on ? 1 : 0; }
  function updateCamera(dt) {
    const k = 1 - Math.pow(0.0015, dt);
    cam.tx += (cam.ttx - cam.tx) * k; cam.tz += (cam.ttz - cam.tz) * k; cam.dist += (cam.tdist - cam.dist) * k; cam.yaw += (cam.tyaw - cam.yaw) * k;
    if (cam.orbit) { cam.tyaw += dt * 0.08; }
    const pitch = 0.78 + Math.min(1, Math.max(0, (cam.dist - 6) / 36)) * 0.36;
    camera.position.set(cam.tx + Math.sin(cam.yaw) * Math.cos(pitch) * cam.dist, Math.sin(pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * Math.cos(pitch) * cam.dist);
    camera.lookAt(cam.tx, 0.3, cam.tz);
    scene.fog.near = cam.dist * 1.5; scene.fog.far = cam.dist * 3.6 + 20;
    const s = Math.max(9, cam.dist * 0.95);
    sun.position.set(cam.tx - 7, 16, cam.tz + 9); sun.target.position.set(cam.tx, 0, cam.tz); sun.target.updateMatrixWorld();
    const sc = sun.shadow.camera; if (sc.right !== s) { sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s; sc.near = 1; sc.far = 60; sc.updateProjectionMatrix(); }
  }

  /* ── 이름표 ──────────────────────────────────────────── */
  function label(key, cls, html, x, y, z) {
    let el = labels.get(key);
    if (!el) { el = labelPool.pop() || document.createElement('div'); labelLayer.appendChild(el); labels.set(key, el); el._html = null; }
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
    if (el.className !== 'lb ' + cls) el.className = 'lb ' + cls;
    tmpV.set(x, y, z).project(camera);
    const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.15 && Math.abs(tmpV.y) < 1.15;
    if (!vis) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.transform = `translate(${((tmpV.x + 1) / 2 * container.clientWidth).toFixed(1)}px, ${((1 - tmpV.y) / 2 * container.clientHeight).toFixed(1)}px) translate(-50%, -100%)`;
    el._seen = true;
  }
  function updateLabels() {
    for (const [, el] of labels) el._seen = false;
    for (const f of Object.values(G.factions)) {
      const t = tileAt(f.cap[0], f.cap[1]); const owner = t.owner || f.id; const F = G.factions[owner];
      const hp = f.id === 'P' ? G.player.capHp : f.capHp; const hearts = '♥'.repeat(Math.max(0, hp)) + '♡'.repeat(Math.max(0, CONST.CAP_HP - hp));
      const lv = f.id === 'P' ? ` Lv${G.player.buildings.capital}` : '';
      label('cap' + f.id, 'cap', f.alive || f.id === 'P' ? `<i style="background:${F.color}"></i>${esc(f.name)}${lv}<span class="hp">${hearts}</span>` : `<i style="background:${F.color}"></i>${esc(f.name)} 함락`, wx(t.x), tileH[t.y * N + t.x] + 1.35, wz(t.y));
    }
    for (const k of Object.keys(groups.ruins)) { const [x, y] = k.split(',').map(Number); const t = tileAt(x, y); label('ruin' + k, 'ruin', `${t.owner ? `<i style="background:${G.factions[t.owner].color}"></i>` : ''}유적 Lv${t.ruin}`, wx(x), tileH[y * N + x] + 1.6, wz(y)); }
    for (const [k, g] of Object.entries(groups.giants)) { const [x, y] = k.split(',').map(Number); if (!tileAt(x, y).giant) continue; label('giant' + k, 'giant', `${MONSTERS[tileAt(x, y).giant.id].name}`, wx(x), tileH[y * N + x] + 2.2, wz(y)); }
    for (const a of G.armies) { const g = groups.armies[a.id]; if (!g) continue; const n = a.owner === 'P' ? a.units.length : (a.specs || []).length; label('army' + a.id, 'army' + (a.owner === 'P' ? '' : ' foe'), `${a.state === 'wait' ? '주둔' : a.state === 'return' ? '귀환' : '진군'} ${n}`, g.position.x, g.position.y + 1.05, g.position.z); }
    // 확장 가능한 인접 타일의 레벨 배지 (가까이 볼 때)
    if (cam.dist < 20) {
      const seen = new Set();
      for (const t of G.map) if (t.owner === 'P') for (const n of neighbors(t.x, t.y)) {
        if (n.owner === 'P' || seen.has(n)) continue; seen.add(n);
        if (Math.abs(wx(n.x) - cam.tx) > cam.dist * 0.75 || Math.abs(wz(n.y) - cam.tz) > cam.dist * 0.75) continue;
        const cnt = n.monsters ? n.monsters.length : 0; const foe = n.owner ? 'foe' : '';
        label('lv' + n.x + ',' + n.y, 'lv ' + foe + (n.lv >= 4 ? ' hard' : ''), `Lv${n.lv}${cnt > 1 ? ' ×' + cnt : ''}`, wx(n.x), tileH[n.y * N + n.x] + 0.08, wz(n.y) + 0.42);
      }
    }
    for (const [k, el] of labels) if (!el._seen) { el.style.display = 'none'; labels.delete(k); labelPool.push(el); }
  }

  /* ── 매 프레임 ───────────────────────────────────────── */
  let clock = 0;
  function frame(dt, selected) {
    if (!renderer || !built) return;
    clock += dt; MAT3.time.value = clock;
    sigT -= dt; if (sigT <= 0) { sigT = 0.3; updateSeason(false); refresh(false); }
    updateCamera(dt);
    const d = dayLight();
    // 애니메이션
    for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > N / 2 + 14) c.position.x = -N / 2 - 14; }
    if (boat) { const a = clock * 0.05; const r = N / 2 + 4.2; boat.position.set(Math.cos(a) * r, -0.42 + Math.sin(clock * 2) * 0.04, Math.sin(a) * r); boat.rotation.y = -a; boat.rotation.z = Math.sin(clock * 1.7) * 0.06; }
    for (const g of Object.values(groups.castles)) g.userData.flag.rotation.y = Math.sin(clock * 3 + g.position.x) * 0.35;
    for (const g of Object.values(groups.forts)) g.userData.flag.rotation.y = Math.sin(clock * 3 + g.position.z) * 0.35;
    L.protect.material.opacity = 0.4 + Math.sin(clock * 3) * 0.2;
    for (const g of Object.values(groups.ruins)) { const c = g.userData.crystal; c.rotation.y = clock * 1.2; c.position.y = 1.15 + Math.sin(clock * 2 + g.position.x) * 0.08; c.material.emissiveIntensity = 0.35 + (1 - d) * 0.5; }
    for (const g of Object.values(groups.giants)) if (g.visible) { const b = 1 + Math.sin(clock * 1.6) * 0.03; g.userData.body.scale.set(1.9 * b, 1.9 / b, 1.9 * b); g.userData.ol.scale.copy(g.userData.body.scale); g.userData.ring.material.color.setHSL(0.98, 0.9, 0.6 + Math.sin(clock * 4) * 0.1); }
    updateArmies(clock);
    // 선택
    if (selected) { const t = tileAt(selected[0], selected[1]); if (t) { const h = tileH[t.y * N + t.x]; sel.visible = selArrow.visible = true; sel.position.set(wx(t.x), h + 0.03, wz(t.y)); selArrow.position.set(wx(t.x), h + 1.05 + Math.abs(Math.sin(clock * 4)) * 0.22, wz(t.y)); selArrow.rotation.y = clock * 2; } } else sel.visible = selArrow.visible = false;
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
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    if (!built) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObject(L.tiles, false);
    if (hits.length && hits[0].instanceId != null) { const i = hits[0].instanceId; return [i % N, Math.floor(i / N)]; }
    return null;
  }
  function snapshotPortrait() { return null; }

  // 타일 중심의 화면 좌표 (테스트·안내용)
  function tileToScreen(x, y) { const t = tileAt(x, y); if (!t) return null; tmpV.set(wx(x), tileH[y * N + x], wz(y)).project(camera); const r = renderer.domElement.getBoundingClientRect(); return [r.left + (tmpV.x + 1) / 2 * r.width, r.top + (1 - tmpV.y) / 2 * r.height]; }
  return { init, build, frame, resize, pick, panBy, zoomBy, rotateBy, focus, orbit, setQuality, getQuality, tileToScreen, get ready() { return built; }, get renderer() { return renderer; } };
})();
