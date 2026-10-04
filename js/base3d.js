/* ============================================================
   요새 안 — 성벽으로 둘러싼 10×10 부지
   본관(4×3), 건물(2×2), 망루·장식(1×1), 집결지(4×3, 부대가 모이는 곳).
   월드맵과 같은 WebGL 렌더러를 빌려 자기 장면을 그린다.
   ============================================================ */
'use strict';

const Base3D = typeof THREE === 'undefined' ? null : (() => {
  let renderer = null, container = null, scene, camera, root, labelLayer, sun, hemi;
  const cam = { tx: 0, tz: 0.6, dist: 15, yaw: 0.5, tdist: 15, tyaw: 0.5, ttx: 0, ttz: 0.6 };
  let built = false, sig = '', ghost = null, ghostKey = '', selMesh = null, clock = 0;
  const items = {}; // key → { g, fp, kind, lv, pop }
  let troopsG = null, troopSig = '', puffs = [];
  const labels = new Map(); let labelPool = [];
  const tmpV = new THREE.Vector3();
  const W = () => BASE.W, H = () => BASE.H;
  // 칸 좌표 → 장면 좌표 (칸의 왼쪽 위 모서리)
  const cx = (x) => x - BASE.W / 2, cz = (y) => y - BASE.H / 2;
  const P = (...a) => MDL.P(...a), seg = (...a) => MDL.seg(...a);
  const M = {};

  function init(r, cont) {
    renderer = r; container = cont; if (!renderer) return false;
    labelLayer = document.createElement('div'); labelLayer.className = 'labels base-labels'; labelLayer.style.display = 'none'; container.appendChild(labelLayer);
    scene = new THREE.Scene(); scene.background = new THREE.Color('#bfe9ff'); scene.fog = new THREE.Fog('#bfe9ff', 30, 60);
    camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
    hemi = new THREE.HemisphereLight('#eef8ff', '#9fc97f', 0.55); scene.add(hemi);
    sun = new THREE.DirectionalLight('#fff2da', 0.75); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 50; sc.updateProjectionMatrix();
    sun.position.set(-6, 14, 8); scene.add(sun); scene.add(sun.target);
    M.toon = MAT3.toon(); M.outline = MAT3.outline(0.025);
    M.ghostOk = new THREE.MeshBasicMaterial({ color: '#5fe08f', transparent: true, opacity: 0.45, depthWrite: false });
    M.ghostBad = new THREE.MeshBasicMaterial({ color: '#ff6f7d', transparent: true, opacity: 0.45, depthWrite: false });
    M.puff = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, depthWrite: false });
    return true;
  }
  function resize() { if (!camera || !container) return; const w = container.clientWidth || 1, h = container.clientHeight || 1; camera.aspect = w / h; camera.updateProjectionMatrix(); }

  /* ── 모델 ────────────────────────────────────────────── */
  const tierOf = (lv) => lv >= 15 ? 3 : lv >= 10 ? 2 : lv >= 5 ? 1 : 0;
  // 박공지붕 집 한 채
  function house(p, x, z, w, h, d, wall, roof, o = {}) {
    const y0 = o.y0 || 0.1;
    p.push(P('box', wall, [x, y0 + h / 2, z], [w, h, d]));
    const rh = o.rh || 0.42;
    p.push(P('tri', roof, [x, y0 + h + rh / 2 - 0.01, z], [(d + 0.16) / 0.866, rh / 0.75, w + 0.16], [0, Math.PI / 2, 0]));
    if (!o.noDoor) { p.push(P('box', '#7a5236', [x, y0 + 0.17, z + d / 2 + 0.005], [0.2, 0.34, 0.03])); p.push(P('sph', MDL.C.gold, [x + 0.06, y0 + 0.17, z + d / 2 + 0.025], 0.03)); }
    for (const s of [-1, 1]) if (w > 0.7) { p.push(P('box', '#bfe8ff', [x + s * w * 0.3, y0 + h * 0.62, z + d / 2 + 0.005], [0.14, 0.14, 0.02])); p.push(P('box', '#ffffff', [x + s * w * 0.3, y0 + h * 0.62 - 0.09, z + d / 2 + 0.012], [0.18, 0.03, 0.03])); }
  }
  function flagPole(p, x, z, h, color) { p.push(seg([x, 0.1, z], [x, h, z], 0.015, MDL.C.wood2)); p.push(P('box', color, [x + 0.12, h - 0.08, z], [0.24, 0.15, 0.015])); p.push(P('sph', MDL.C.gold, [x, h + 0.02, z], 0.035)); }
  function pad(p, c, w = 1.88, d = 1.88) { p.push(P('box', c, [0, 0.05, 0], [w, 0.1, d])); }
  function crate(p, x, y, z, s = 0.22) { p.push(P('box', '#d9a35b', [x, y + s / 2, z], s)); p.push(P('box', '#b07a3c', [x, y + s / 2, z + s / 2 + 0.002], [s * 0.9, 0.03, 0.01])); }
  function dummy(p, x, z) { p.push(seg([x, 0.1, z], [x, 0.62, z], 0.025, MDL.C.wood2)); p.push(seg([x - 0.16, 0.48, z], [x + 0.16, 0.48, z], 0.02, MDL.C.wood2)); p.push(P('sph', '#f3e2bd', [x, 0.5, z], [0.2, 0.26, 0.16])); p.push(P('sph', '#f3e2bd', [x, 0.72, z], 0.14)); p.push(P('box', '#ff6f7d', [x, 0.5, z + 0.085], [0.08, 0.08, 0.01])); }
  function pony(p, x, z, c = '#b8794a') { p.push(P('box', c, [x, 0.36, z], [0.36, 0.18, 0.16])); for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(seg([x + sx * 0.13, 0.1, z + sz * 0.05], [x + sx * 0.13, 0.3, z + sz * 0.05], 0.025, c)); p.push(seg([x + 0.16, 0.4, z], [x + 0.24, 0.55, z], 0.05, c)); p.push(P('box', c, [x + 0.29, 0.56, z], [0.16, 0.09, 0.09])); p.push(P('box', '#5c4434', [x + 0.2, 0.6, z], [0.08, 0.1, 0.03])); p.push(P('sph', '#2a2238', [x + 0.32, 0.59, z + 0.045], 0.02)); }
  function bParts(id, color, lv) {
    const p = [], t = tierOf(lv), C = MDL.C, roof = color, roofD = MDL.shade(color, 0.78);
    switch (id) {
      case 'barracks': // 군영: 긴 막사 + 무기 걸이 + 깃발
        pad(p, '#e3d3ae');
        house(p, -0.15, -0.35, 1.3, 0.55, 0.8, '#f6ead2', roof);
        p.push(seg([0.45, 0.1, 0.55], [0.45, 0.55, 0.55], 0.02, C.wood2)); p.push(seg([0.85, 0.1, 0.55], [0.85, 0.55, 0.55], 0.02, C.wood2)); p.push(seg([0.43, 0.48, 0.55], [0.87, 0.48, 0.55], 0.018, C.wood2));
        for (let i = 0; i < 3; i++) { const x = 0.52 + i * 0.13; p.push(seg([x, 0.12, 0.6], [x, 0.78, 0.5], 0.012, C.wood)); p.push(P('cone', C.steel, [x, 0.82, 0.495], [0.05, 0.1, 0.05], [-0.15, 0, 0])); }
        p.push(P('cyl', '#ff5d6c', [-0.55, 0.5, 0.07], [0.2, 0.02, 0.2], [Math.PI / 2, 0, 0])); p.push(P('cyl', '#fff', [-0.55, 0.5, 0.08], [0.1, 0.02, 0.1], [Math.PI / 2, 0, 0]));
        if (t >= 1) { p.push(P('cone6', '#f3e2bd', [-0.6, 0.38, 0.55], [0.5, 0.56, 0.5])); p.push(P('box', '#3b3449', [-0.6, 0.2, 0.78], [0.12, 0.18, 0.03])); }
        flagPole(p, 0.82, -0.7, 1.15 + t * 0.15, color); if (t >= 2) flagPole(p, -0.85, -0.7, 1.05, color);
        if (t >= 3) p.push(P('box', C.gold, [-0.15, 0.68, -0.35], [1.34, 0.04, 0.84]));
        break;
      case 'stable': // 마구간: 붉은 헛간 + 건초 + 망아지
        pad(p, '#e6d7a8');
        house(p, 0, -0.4, 1.4, 0.6, 0.75, '#e07a5f', '#8a4b3a', { noDoor: true });
        p.push(P('box', '#fff4e6', [0, 0.36, -0.02], [0.42, 0.5, 0.02])); p.push(seg([-0.19, 0.14, -0.005], [0.19, 0.58, -0.005], 0.015, '#fff4e6')); p.push(seg([0.19, 0.14, -0.005], [-0.19, 0.58, -0.005], 0.015, '#fff4e6'));
        p.push(P('box', '#c94f3d', [0, 0.36, -0.01], [0.38, 0.46, 0.01]));
        for (let i = 0; i < 2 + t; i++) p.push(P('cyl', '#f4d36b', [-0.65 + i * 0.22, 0.2, 0.5 + (i % 2) * 0.1], [0.2, 0.2, 0.2], [0, 0, Math.PI / 2]));
        for (let i = 0; i < 4; i++) p.push(seg([0.25 + i * 0.2, 0.1, 0.82], [0.25 + i * 0.2, 0.4, 0.82], 0.018, C.wood)); p.push(seg([0.2, 0.32, 0.82], [0.88, 0.32, 0.82], 0.015, C.wood));
        pony(p, 0.5, 0.45); if (t >= 2) pony(p, 0.2, 0.62, '#f2f0ea');
        flagPole(p, -0.85, -0.82, 1.1, color);
        break;
      case 'smithy': // 대장간: 돌집 + 굴뚝 + 모루 + 화로
        pad(p, '#d8d2c6');
        p.push(P('box', '#b9b3c6', [-0.2, 0.42, -0.3], [1.1, 0.64, 0.85])); p.push(P('tri', '#6c6a80', [-0.2, 0.92, -0.3], [1.0 / 0.866, 0.38 / 0.75, 1.24], [0, Math.PI / 2, 0]));
        p.push(P('box', '#7a5236', [-0.2, 0.27, 0.13], [0.24, 0.34, 0.03]));
        p.push(P('box', '#9a93a8', [0.42, 0.8, -0.55], [0.22, 1.3, 0.22])); p.push(P('box', '#5a5070', [0.42, 1.47, -0.55], [0.28, 0.06, 0.28]));
        p.push(P('box', '#8d8a99', [0.55, 0.24, 0.35], [0.5, 0.28, 0.4])); p.push(P('box', '#ff8a3c', [0.55, 0.39, 0.35], [0.36, 0.04, 0.28])); p.push(P('box', '#ffd23f', [0.55, 0.405, 0.35], [0.2, 0.03, 0.16]));
        p.push(P('box', '#4a4458', [-0.45, 0.22, 0.55], [0.18, 0.2, 0.12])); p.push(P('box', '#5c566b', [-0.45, 0.36, 0.55], [0.34, 0.08, 0.16])); p.push(seg([-0.3, 0.42, 0.6], [-0.18, 0.55, 0.62], 0.015, C.wood2)); p.push(P('box', C.steel2, [-0.18, 0.56, 0.62], [0.1, 0.05, 0.06]));
        if (t >= 1) for (let i = 0; i < 2; i++) { p.push(seg([-0.85 + i * 0.12, 0.1, 0.1], [-0.85 + i * 0.12, 0.62, 0.0], 0.012, C.wood)); p.push(P('box', C.steel, [-0.85 + i * 0.12, 0.7, -0.02], [0.05, 0.18, 0.02])); }
        if (t >= 2) p.push(P('sph', C.gold, [0.42, 1.55, -0.55], 0.08));
        break;
      case 'factory': // 공장: 작업장 + 큰 톱니바퀴 + 투석기
        pad(p, '#e0d2b4');
        house(p, -0.3, -0.38, 1.1, 0.62, 0.8, '#d9c29a', roofD);
        { const gx = 0.55, gy = 0.85, gz = -0.12; p.push(P('cyl', '#a29bb2', [gx, gy, gz], [0.48, 0.08, 0.48], [Math.PI / 2, 0, 0])); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; p.push(P('box', '#a29bb2', [gx + Math.cos(a) * 0.27, gy + Math.sin(a) * 0.27, gz], [0.09, 0.09, 0.08], [0, 0, a])); } p.push(P('cyl', '#5c566b', [gx, gy, gz + 0.02], [0.12, 0.1, 0.12], [Math.PI / 2, 0, 0])); p.push(seg([gx, 0.1, gz], [gx, gy, gz], 0.04, C.wood2)); }
        p.push(P('box', C.wood, [0.2, 0.18, 0.52], [0.6, 0.1, 0.3])); for (const s of [-1, 1]) for (const d of [-1, 1]) p.push(P('cyl8', C.wood2, [0.2 + s * 0.24, 0.12, 0.52 + d * 0.17], [0.14, 0.04, 0.14], [Math.PI / 2, 0, 0]));
        p.push(seg([0.05, 0.22, 0.52], [0.5, 0.62, 0.52], 0.025, C.wood2)); p.push(P('hemi', C.wood, [0.52, 0.6, 0.52], [0.14, 0.08, 0.14], [Math.PI, 0, 0])); p.push(P('ico', '#9a95a6', [0.52, 0.64, 0.52], 0.09));
        flagPole(p, -0.85, 0.7, 1.0 + t * 0.15, color);
        break;
      case 'ground': // 연병장: 모래 마당 + 허수아비 + 과녁 + 울타리
        p.push(P('box', '#f0d9a0', [0, 0.05, 0], [1.9, 0.1, 1.9]));
        for (let i = 0; i < 9; i++) for (const s of [-1, 1]) { p.push(seg([-0.9 + i * 0.225, 0.1, s * 0.9], [-0.9 + i * 0.225, 0.32, s * 0.9], 0.02, C.wood)); p.push(seg([s * 0.9, 0.1, -0.9 + i * 0.225], [s * 0.9, 0.32, -0.9 + i * 0.225], 0.02, C.wood)); }
        for (const s of [-1, 1]) { p.push(seg([-0.9, 0.26, s * 0.9], [0.9, 0.26, s * 0.9], 0.014, C.wood)); p.push(seg([s * 0.9, 0.26, -0.9], [s * 0.9, 0.26, 0.9], 0.014, C.wood)); }
        dummy(p, -0.45, -0.35); dummy(p, 0.0, -0.45); if (t >= 1) dummy(p, 0.45, -0.35);
        { const tx0 = 0.4, tz0 = 0.4; p.push(seg([tx0, 0.1, tz0 - 0.08], [tx0, 0.5, tz0], 0.02, C.wood2)); for (let k = 0; k < 3; k++) p.push(P('cyl', k % 2 ? '#ffffff' : '#ff5d6c', [tx0, 0.55, tz0 + 0.03 + k * 0.004], [0.42 - k * 0.13, 0.02, 0.42 - k * 0.13], [Math.PI / 2 - 0.2, 0, 0])); }
        if (t >= 2) for (let k = 0; k < 3; k++) p.push(P('box', '#d9a35b', [-0.5 + k * 0.12, 0.13, 0.5], [0.1, 0.06, 0.3]));
        break;
      case 'hall': // 영웅전당: 계단 + 기둥 + 지붕 + 황금 별
        p.push(P('box', '#efe9f6', [0, 0.06, 0], [1.88, 0.12, 1.88])); p.push(P('box', '#e2daee', [0, 0.16, -0.1], [1.6, 0.1, 1.5]));
        p.push(P('box', '#f8f4ff', [0, 0.55, -0.35], [1.2, 0.7, 0.7]));
        for (let i = 0; i < 4; i++) p.push(P('cyl', '#ffffff', [-0.48 + i * 0.32, 0.55, 0.3], [0.12, 0.7, 0.12]));
        p.push(P('box', '#ffffff', [0, 0.94, -0.05], [1.36, 0.08, 1.28]));
        p.push(P('tri', roof, [0, 1.12, -0.05], [1.36 / 0.866, 0.32 / 0.75, 1.34], [0, Math.PI / 2, 0]));
        p.push(P('box', '#7a5236', [0, 0.4, 0.005], [0.24, 0.4, 0.03]));
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; p.push(P('cone4', C.gold, [Math.sin(a) * 0.09, 1.42 + Math.cos(a) * 0.09, 0.05], [0.09, 0.16, 0.04], [0, 0, -a])); } p.push(P('sphL', C.gold, [0, 1.42, 0.05], 0.12));
        for (const s of [-1, 1]) { p.push(P('box', color, [s * 0.75, 0.62, 0.32], [0.16, 0.5, 0.02])); p.push(P('sph', C.gold, [s * 0.75, 0.9, 0.32], 0.04)); }
        if (t >= 2) for (const s of [-1, 1]) { p.push(P('box', '#e2daee', [s * 0.75, 0.24, 0.72], [0.2, 0.18, 0.2])); p.push(P('sph', C.gold, [s * 0.75, 0.45, 0.72], 0.12)); }
        break;
      case 'warehouse': // 창고: 큰 헛간 + 상자 + 자루
        pad(p, '#e8dcc0');
        house(p, 0, -0.3, 1.5, 0.7, 0.95, '#d9b48a', '#a0694a', { rh: 0.5 });
        crate(p, 0.5, 0.1, 0.55); crate(p, 0.73, 0.1, 0.55); crate(p, 0.6, 0.32, 0.55); if (t >= 1) { crate(p, -0.65, 0.1, 0.6); crate(p, -0.65, 0.32, 0.6); }
        for (let i = 0; i < 2 + t; i++) p.push(P('sph', '#f3e2bd', [-0.2 + i * 0.16, 0.2, 0.55 + (i % 2) * 0.08], [0.16, 0.2, 0.16]));
        p.push(P('box', '#ffd04f', [-0.45, 0.24, 0.25], [0.2, 0.2, 0.2])); p.push(P('box', '#9fd36b', [0.0, 0.2, 0.3], [0.16, 0.16, 0.16]));
        break;
      case 'hospital': // 병원: 흰 집 + 빨간 십자 + 침대
        pad(p, '#eaf4f2');
        house(p, 0, -0.3, 1.3, 0.6, 0.85, '#ffffff', '#7fd6c6');
        p.push(P('box', '#ff5d6c', [0, 0.95, 0.15], [0.36, 0.1, 0.02])); p.push(P('box', '#ff5d6c', [0, 0.95, 0.15], [0.1, 0.36, 0.02]));
        p.push(P('box', '#c08a55', [0.5, 0.18, 0.5], [0.5, 0.08, 0.3])); p.push(P('box', '#ffffff', [0.5, 0.24, 0.5], [0.46, 0.05, 0.28])); p.push(P('box', '#9ad7ff', [0.6, 0.27, 0.5], [0.24, 0.04, 0.26])); p.push(P('sph', '#ffffff', [0.33, 0.29, 0.5], [0.12, 0.06, 0.16]));
        p.push(P('cyl', '#ffffff', [-0.55, 0.32, 0.55], [0.3, 0.44, 0.3])); p.push(P('cone', '#7fd6c6', [-0.55, 0.64, 0.55], [0.36, 0.22, 0.36]));
        break;
      case 'embassy': // 대사관: 둥근 지붕 2층 건물 + 깃발 여러 개
        pad(p, '#efe6d6');
        p.push(P('box', '#fff8ee', [0, 0.45, -0.3], [1.3, 0.7, 0.9])); p.push(P('box', '#f5ead8', [0, 0.92, -0.3], [0.9, 0.3, 0.7]));
        p.push(P('hemi', roof, [0, 1.07, -0.3], [0.6, 0.45, 0.6])); p.push(P('sph', MDL.C.gold, [0, 1.32, -0.3], 0.07));
        for (const s of [-1, 0, 1]) p.push(P('box', '#bfe8ff', [s * 0.38, 0.55, 0.155], [0.16, 0.22, 0.02]));
        p.push(P('box', '#7a5236', [0, 0.27, 0.155], [0.22, 0.34, 0.03]));
        { const cols = ['#4fb0ff', '#ff6f7d', '#3fd08f', '#a77bff', '#ff9a3c']; for (let i = 0; i < 3 + Math.min(2, t); i++) flagPole(p, -0.8 + i * 0.4, 0.75, 0.9 + (i % 2) * 0.1, cols[i]); }
        break;
      case 'tower': // 망루 (1×1)
        p.push(P('cyl', '#efe9de', [0, 0.45 + t * 0.08, 0], [0.56, 0.9 + t * 0.16, 0.56])); p.push(P('cyl', '#d9d1c2', [0, 0.95 + t * 0.16, 0], [0.7, 0.12, 0.7]));
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; p.push(P('box', '#d9d1c2', [Math.sin(a) * 0.3, 1.06 + t * 0.16, Math.cos(a) * 0.3], [0.1, 0.12, 0.1])); }
        p.push(P('cone', roof, [0, 1.32 + t * 0.16, 0], [0.62, 0.42, 0.62])); p.push(P('box', '#5a5070', [0, 0.6, 0.285], [0.08, 0.16, 0.02]));
        p.push(seg([0, 1.5 + t * 0.16, 0], [0, 1.75 + t * 0.16, 0], 0.01, MDL.C.wood2)); p.push(P('box', color, [0.08, 1.7 + t * 0.16, 0], [0.16, 0.1, 0.01]));
        break;
      case 'flowers': // 꽃밭
        p.push(P('box', '#a8754a', [0, 0.08, 0], [0.86, 0.14, 0.86])); p.push(P('box', '#7a5236', [0, 0.155, 0], [0.76, 0.02, 0.76]));
        { const fc = ['#ff9cc2', '#ffd23f', '#ffffff', '#9ad7ff', '#ff6f7d']; let k = 0; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const x = -0.25 + i * 0.25, z = -0.25 + j * 0.25; p.push(seg([x, 0.16, z], [x, 0.3, z], 0.012, '#58b860')); p.push(P('ico', fc[k++ % 5], [x, 0.32, z], 0.1)); p.push(P('sph', '#ffd23f', [x, 0.35, z], 0.04)); } }
        break;
      case 'lamp': // 가로등
        p.push(P('cyl', '#5a5070', [0, 0.08, 0], [0.2, 0.08, 0.2])); p.push(seg([0, 0.1, 0], [0, 0.95, 0], 0.025, '#5a5070'));
        p.push(P('box', '#5a5070', [0, 0.97, 0], [0.2, 0.03, 0.2])); p.push(P('box', '#ffe9a0', [0, 1.06, 0], [0.15, 0.16, 0.15])); p.push(P('cone4', '#5a5070', [0, 1.2, 0], [0.26, 0.14, 0.26], [0, Math.PI / 4, 0]));
        break;
      case 'fountain': // 분수
        p.push(P('cyl', '#d9d1c2', [0, 0.12, 0], [0.86, 0.18, 0.86])); p.push(P('cyl', '#7ad0f0', [0, 0.2, 0], [0.74, 0.04, 0.74]));
        p.push(P('cyl', '#efe9de', [0, 0.38, 0], [0.12, 0.4, 0.12])); p.push(P('cyl', '#d9d1c2', [0, 0.56, 0], [0.36, 0.06, 0.36])); p.push(P('cyl', '#9ce3ff', [0, 0.6, 0], [0.3, 0.03, 0.3])); p.push(P('sph', '#bdf0ff', [0, 0.68, 0], 0.1));
        break;
    }
    return p;
  }
  function model(id, color, lv) { return MDL.get(`base:${id}:${color}:${id === 'tower' ? Math.min(3, Math.floor(lv / 3)) : tierOf(lv)}`, () => bParts(id, color, id === 'tower' ? Math.min(3, Math.floor(lv / 3)) * 5 : lv)); }
  function scaffold(w, h) { return MDL.get(`scaf:${w}x${h}`, () => { const p = [], hw = w / 2 - 0.1, hd = h / 2 - 0.1; for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(seg([sx * hw, 0.1, sz * hd], [sx * hw, 1.1, sz * hd], 0.03, MDL.C.wood)); for (const y of [0.45, 0.85]) for (const s of [-1, 1]) { p.push(P('box', MDL.C.wood2, [0, y, s * hd], [w - 0.15, 0.05, 0.12])); p.push(P('box', MDL.C.wood2, [s * hw, y, 0], [0.12, 0.05, h - 0.15])); } p.push(P('cone4', '#ffd04f', [hw * 0.6, 0.18, hd + 0.05], [0.18, 0.3, 0.18])); return p; }); }

  /* ── 장면 구성 (한 번) ───────────────────────────────── */
  function buildStatic() {
    const p = [], Wd = BASE.W, Hd = BASE.H, col = G.factions.P.color;
    // 잔디 언덕 받침
    p.push(P('box', '#c38c5c', [0, -0.45, 0], [Wd + 5, 0.8, Hd + 5])); p.push(P('box', '#86c95a', [0, -0.02, 0], [Wd + 5.1, 0.1, Hd + 5.1]));
    p.push(P('box', '#e9e2d3', [0, 0.04, 0], [Wd + 0.2, 0.06, Hd + 0.2])); // 안마당 포장
    // 집결지 (모래 + 테두리)
    const R = BASE.RALLY; p.push(P('box', '#f2dca6', [cx(R.x + R.w / 2), 0.075, cz(R.y + R.h / 2)], [R.w - 0.06, 0.03, R.h - 0.06]));
    for (const s of [-1, 1]) { p.push(P('box', '#d9b97a', [cx(R.x + R.w / 2), 0.09, cz(R.y + R.h / 2) + s * (R.h / 2 - 0.03)], [R.w, 0.03, 0.06])); p.push(P('box', '#d9b97a', [cx(R.x + R.w / 2) + s * (R.w / 2 - 0.03), 0.09, cz(R.y + R.h / 2)], [0.06, 0.03, R.h])); }
    // 바둑판 이음새 (칸이 보이게)
    for (let i = 1; i < Wd; i++) { p.push(P('box', '#ddd5c4', [cx(i), 0.072, 0], [0.025, 0.01, Hd])); p.push(P('box', '#ddd5c4', [0, 0.072, cz(i)], [Wd, 0.01, 0.025])); }
    // 성벽 + 모서리 탑 + 정문(아래쪽 가운데)
    const wallH = 0.7, t = 0.32, hw = Wd / 2 + t / 2, hd = Hd / 2 + t / 2;
    const wall = (x, z, w, d) => { p.push(P('box', '#efe9de', [x, wallH / 2, z], [w, wallH, d])); const n = Math.round(Math.max(w, d) / 0.36); for (let i = 0; i < n; i++) { if (i % 2) continue; const f = (i + 0.5) / n - 0.5; p.push(P('box', '#e2dacb', [x + (w > d ? f * w : 0), wallH + 0.08, z + (w > d ? 0 : f * d)], [w > d ? 0.18 : t, 0.16, w > d ? t : 0.18])); } };
    wall(0, -hd, Wd + t * 2, t); wall(-hw, 0, t, Hd); wall(hw, 0, t, Hd);
    const gate = 1.6; wall(-(Wd / 4 + gate / 4), hd, Wd / 2 - gate / 2 + t, t); wall(Wd / 4 + gate / 4, hd, Wd / 2 - gate / 2 + t, t);
    for (const s of [-1, 1]) { p.push(P('cyl', '#efe9de', [s * gate / 2, 0.55, hd], [0.5, 1.1, 0.5])); p.push(P('cone', col, [s * gate / 2, 1.3, hd], [0.6, 0.45, 0.6])); }
    p.push(P('box', '#efe9de', [0, 0.95, hd], [gate, 0.3, t])); p.push(P('box', col, [0, 0.95, hd + t / 2 + 0.01], [gate * 0.7, 0.16, 0.02]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.push(P('cyl', '#f4efe4', [sx * hw, 0.6, sz * hd], [0.66, 1.2, 0.66])); p.push(P('cone', col, [sx * hw, 1.46, sz * hd], [0.8, 0.55, 0.8])); }
    // 바깥 나무·바위
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2, r = Wd / 2 + 1.4 + (i % 3) * 0.35; const x = Math.cos(a) * r, z = Math.sin(a) * r * 1.0; if (Math.abs(x) < 1.3 && z > 0) continue; p.push(P('cyl5', MDL.C.wood2, [x, 0.25, z], [0.12, 0.4, 0.12])); p.push(P('ico1', i % 3 ? '#6fd05a' : '#9be27a', [x, 0.66, z], [0.62, 0.56, 0.62])); }
    // 정문 앞 길
    p.push(P('box', '#e3cfa0', [0, 0.03, hd + 1.4], [1.2, 0.04, 2.6]));
    const m = new THREE.Mesh(MDL.bake(p), M.toon); m.receiveShadow = true; m.castShadow = true; root.add(m);
    // 집결지 깃발
    const fl = new THREE.Mesh(MDL.get('rflag:' + col, () => [seg([0, 0, 0], [0, 1.3, 0], 0.02, MDL.C.wood2), P('box', col, [0.2, 1.18, 0], [0.4, 0.24, 0.02]), P('sph', MDL.C.gold, [0, 1.33, 0], 0.05)]), M.toon);
    fl.position.set(cx(R.x) + 0.2, 0.09, cz(R.y) + 0.2); fl.castShadow = true; root.add(fl);
  }
  function build() {
    if (!renderer || !G) return;
    if (root) { scene.remove(root); root.traverse(c => { if (c.geometry && !c.geometry.userData.keep) c.geometry.dispose(); }); }
    root = new THREE.Group(); scene.add(root);
    for (const k of Object.keys(items)) delete items[k];
    troopsG = null; troopSig = ''; puffs = []; sig = ''; ghost = null; ghostKey = '';
    for (const [, el] of labels) el.remove(); labels.clear(); labelPool.forEach(e => e.remove()); labelPool = [];
    buildStatic();
    // 선택 테두리
    const sp = []; for (const s of [-1, 1]) { sp.push(P('box', '#ffffff', [0, 0, s * 0.5], [1.02, 0.04, 0.05])); sp.push(P('box', '#ffffff', [s * 0.5, 0, 0], [0.05, 0.04, 1.02])); }
    M.sel = M.sel || new THREE.MeshBasicMaterial({ vertexColors: true }); selMesh = new THREE.Mesh(MDL.bake(sp), M.sel); selMesh.visible = false; root.add(selMesh);
    built = true; refresh(true);
  }

  /* ── 건물 배치 (상태가 바뀌면) ───────────────────────── */
  function entries() {
    const B = G.player.base, out = [];
    for (const [id, at] of Object.entries(B.layout)) { const lv = G.player.buildings[id] || 0; const q = G.player.buildQueue.find(x => x.id === id && x.ex == null); out.push({ key: id, kind: id, fp: footprint(id, at), lv, q }); }
    B.extras.forEach((e, k) => { const q = G.player.buildQueue.find(x => x.ex === k); out.push({ key: 'x' + k, kind: e.id, fp: footprint(e.id, [e.x, e.y]), lv: e.lv, q }); });
    return out;
  }
  function signature() { const P = G.player; return JSON.stringify([P.base, P.buildings, P.buildQueue.map(q => (q.ex != null ? 'x' + q.ex : q.id)), G.factions.P.color]); }
  function refresh(force) {
    const s = signature(); if (!force && s === sig) return; sig = s;
    const col = G.factions.P.color; const seen = new Set();
    for (const e of entries()) {
      seen.add(e.key);
      const want = `${e.kind}:${e.fp.x},${e.fp.y}:${e.kind === 'capital' ? Math.min(3, Math.floor(e.lv / 5)) : e.kind === 'tower' ? Math.min(3, Math.floor(e.lv / 3)) : tierOf(e.lv)}:${e.lv > 0 ? 1 : 0}:${e.q ? 1 : 0}:${col}`;
      const cur = items[e.key];
      if (cur && cur.want === want) { cur.e = e; continue; }
      const grew = cur && cur.e && cur.e.lv < e.lv;
      if (cur) root.remove(cur.g);
      const g = new THREE.Group(); g.position.set(cx(e.fp.x + e.fp.w / 2), 0.07, cz(e.fp.y + e.fp.h / 2));
      if (e.kind === 'capital') {
        const m = new THREE.Mesh(MDL.castle(col, e.lv), M.toon); m.scale.setScalar(3.1); m.castShadow = true; m.receiveShadow = true; g.add(m);
        const fl = new THREE.Mesh(MDL.flag(col), M.toon); const kh = 0.42 + Math.min(3, Math.floor(e.lv / 5)) * 0.08; fl.scale.setScalar(3.1); fl.position.set(0, (0.08 + kh + 0.55) * 3.1, -0.06); g.add(fl); g.userData.flag = fl;
      } else if (e.lv > 0 || BASE_EXTRAS[e.kind]) {
        const m = new THREE.Mesh(model(e.kind, col, Math.max(1, e.lv)), M.toon); m.castShadow = true; m.receiveShadow = true; g.add(m);
        if (e.kind === 'smithy') g.userData.chimney = new THREE.Vector3(0.42, 1.5, -0.55);
        if (e.kind === 'fountain') g.userData.fountain = true;
      }
      if (e.q || e.lv === 0 && !BASE_EXTRAS[e.kind] || (e.kind === 'tower' && e.lv === 0)) { const sc = new THREE.Mesh(scaffold(e.fp.w, e.fp.h), M.toon); sc.castShadow = true; g.add(sc); g.userData.scaf = sc; }
      root.add(g); items[e.key] = { g, want, e, pop: grew || (cur && !cur.e.lv && e.lv) ? 1 : 0 };
    }
    for (const k of Object.keys(items)) if (!seen.has(k)) { root.remove(items[k].g); delete items[k]; }
  }

  /* ── 집결지의 부대 ───────────────────────────────────── */
  function updateTroops() {
    const PL = G.player; const col = G.factions.P.color, trim = G.factions.P.dark;
    const tsig = JSON.stringify(PL.troops.map(t => [t.id, troopReady(t).map(s => s.type + (s.hero ? 'h' : '')), t.members.length])) + col;
    if (tsig === troopSig) return; troopSig = tsig;
    if (troopsG) root.remove(troopsG);
    troopsG = new THREE.Group(); root.add(troopsG);
    const R = BASE.RALLY; const n = PL.troops.length; const cols = Math.min(3, n), rows = Math.ceil(n / 3);
    PL.troops.forEach((tr, k) => {
      const c = k % 3, r = Math.floor(k / 3); const cw = R.w / cols, rh = R.h / Math.max(1, rows);
      const ox = cx(R.x) + cw * (c + 0.5), oz = cz(R.y) + rh * (r + 0.5);
      const ready = troopReady(tr).slice(0, 9);
      const per = Math.ceil(Math.sqrt(ready.length || 1));
      ready.forEach((s, i) => {
        const ix = i % per, iz = Math.floor(i / per);
        const m = new THREE.Mesh(MDL.unit(s.type, col, trim, s.hero ? heroCape(s.hero.heroId) : false), M.toon);
        const sc = Math.min(0.42, (cw * 0.8) / Math.max(1, per) * 0.9);
        m.scale.setScalar(sc); m.position.set(ox + (ix - (per - 1) / 2) * sc * 1.05, 0.09, oz + (iz - (Math.ceil(ready.length / per) - 1) / 2) * sc * 1.1); m.castShadow = true; m.userData.ph = i * 0.7 + k;
        troopsG.add(m);
      });
      // 부대 깃발
      const fl = new THREE.Mesh(MDL.get('tflag:' + col, () => [seg([0, 0, 0], [0, 0.75, 0], 0.012, MDL.C.wood2), P('box', col, [0.12, 0.66, 0], [0.24, 0.15, 0.015])]), M.toon); fl.position.set(ox - cw * 0.42, 0.09, oz - rh * 0.38); troopsG.add(fl);
      troopsG.userData['t' + tr.id] = [ox, oz - rh * 0.38];
    });
  }

  /* ── 놓을 자리 미리 보기 ─────────────────────────────── */
  function setGhost(kind, x, y, ok) {
    const key = kind ? `${kind}:${x},${y}:${ok}` : ''; if (key === ghostKey) return; ghostKey = key;
    if (ghost) { root.remove(ghost); ghost = null; }
    if (!kind) return;
    const fp = footprint(kind, [x, y]);
    ghost = new THREE.Group(); ghost.position.set(cx(fp.x + fp.w / 2), 0.08, cz(fp.y + fp.h / 2));
    const pl = new THREE.Mesh(MDL.get('ghostPad', () => [P('box', '#ffffff', [0, 0, 0], [1, 0.05, 1])]), ok ? M.ghostOk : M.ghostBad); pl.scale.set(fp.w - 0.06, 1, fp.h - 0.06); ghost.add(pl);
    const m = new THREE.Mesh(model(kind, G.factions.P.color, 1), ok ? M.ghostOk : M.ghostBad); m.position.y = 0.02; ghost.add(m);
    root.add(ghost);
  }
  function select(fp) { if (!selMesh) return; if (!fp) { selMesh.visible = false; return; } selMesh.visible = true; selMesh.scale.set(fp.w, 1, fp.h); selMesh.position.set(cx(fp.x + fp.w / 2), 0.1, cz(fp.y + fp.h / 2)); }

  /* ── 카메라 ──────────────────────────────────────────── */
  function panBy(dx, dy) { const k = cam.dist / (container.clientHeight || 600) * 1.25; const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw); cam.ttx = clamp(cam.ttx + (-dx * c - dy * s) * k, -5, 5); cam.ttz = clamp(cam.ttz + (dx * s - dy * c) * k, -5, 6); cam.tx = cam.ttx; cam.tz = cam.ttz; }
  // 화면 비율에 맞춰 성벽 전체가 들어오는 거리
  function fitDist() { const a = camera ? camera.aspect : 1, tv = Math.tan(THREE.MathUtils.degToRad(17)), th = tv * a; return clamp(Math.max(7.2 / th, 7.4 / tv), 9, 60); }
  function zoomBy(f) { cam.tdist = clamp(cam.tdist * f, 5, fitDist() * 1.35); }
  function rotateBy(r) { cam.tyaw += r; }
  function focus() { cam.ttx = 0; cam.ttz = 0.6; cam.tdist = fitDist(); cam.dist = cam.tdist; }
  function updateCamera(dt) {
    const k = 1 - Math.pow(0.0015, dt);
    cam.tx += (cam.ttx - cam.tx) * k; cam.tz += (cam.ttz - cam.tz) * k; cam.dist += (cam.tdist - cam.dist) * k; cam.yaw += (cam.tyaw - cam.yaw) * k;
    const pitch = 0.86 + Math.min(1, Math.max(0, (cam.dist - 6) / 30)) * 0.22;
    camera.position.set(cam.tx + Math.sin(cam.yaw) * Math.cos(pitch) * cam.dist, Math.sin(pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * Math.cos(pitch) * cam.dist);
    camera.lookAt(cam.tx, 0.4, cam.tz);
  }

  /* ── 이름표 ──────────────────────────────────────────── */
  function label(key, cls, html, x, y, z) {
    tmpV.set(x, y, z).project(camera); if (tmpV.z >= 1 || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) return;
    let el = labels.get(key); if (!el) { el = labelPool.pop() || document.createElement('div'); labelLayer.appendChild(el); labels.set(key, el); el._html = null; }
    if (el._html !== html) { el.innerHTML = html; el._html = html; } if (el.className !== 'lb ' + cls) el.className = 'lb ' + cls;
    el.style.display = ''; el.style.transform = `translate(${((tmpV.x + 1) / 2 * container.clientWidth).toFixed(1)}px, ${((1 - tmpV.y) / 2 * container.clientHeight).toFixed(1)}px) translate(-50%, -100%)`; el._seen = true;
  }
  function updateLabels() {
    for (const [, el] of labels) el._seen = false;
    for (const it of Object.values(items)) {
      const e = it.e; const name = e.kind === 'capital' ? '본관' : BUILDINGS[e.kind] ? BUILDINGS[e.kind].name : BASE_EXTRAS[e.kind].name;
      if (BASE_EXTRAS[e.kind] && BASE_EXTRAS[e.kind].deco) continue;
      const q = e.q; const h = e.kind === 'capital' ? 3.4 : e.kind === 'tower' ? 2.1 : 1.6;
      const html = q ? `${name} <b>Lv${e.lv}→${e.lv + 1}</b><span class="qb"><i style="width:${Math.round((1 - q.remain / q.total) * 100)}%"></i></span>${durStr(q.remain)}` : `${name} <b>Lv${e.lv}</b>`;
      label('b' + e.key, 'bld' + (q ? ' work' : ''), html, it.g.position.x, h, it.g.position.z);
    }
    if (troopsG) for (const tr of G.player.troops) { const at = troopsG.userData['t' + tr.id]; if (!at) continue; const ready = troopReady(tr).length; const out = G.armies.some(a => a.owner === 'P' && a.troop === tr.id); label('t' + tr.id, 'army', `${esc(tr.name)} ${ready}/${tr.members.length}${out ? ' · 출전' : ''}`, at[0], 1.0, at[1]); }
    for (const [k, el] of labels) if (!el._seen) { el.style.display = 'none'; labels.delete(k); labelPool.push(el); }
  }

  /* ── 매 프레임 ───────────────────────────────────────── */
  let refT = 0;
  function frame(dt) {
    if (!built) return;
    clock += dt; MAT3.time.value = clock;
    refT -= dt; if (refT <= 0) { refT = 0.25; refresh(false); updateTroops(); }
    updateCamera(dt);
    // 낮·밤 (월드와 같은 하늘)
    const h = (G.time % 1440) / 60; const d = h >= 7 && h <= 17 ? 1 : h > 17 && h < 20 ? 1 - (h - 17) / 3 : h > 5 && h < 7 ? (h - 5) / 2 : 0;
    scene.background.setRGB(0.24 + 0.51 * d, 0.29 + 0.6 * d, 0.53 + 0.47 * d); scene.fog.color.copy(scene.background); sun.intensity = 0.34 + 0.48 * d;
    // 애니메이션: 새로 지은 건물 통통, 공사장 망치질, 굴뚝 연기, 깃발
    for (const it of Object.values(items)) {
      const g = it.g;
      if (it.pop > 0) { it.pop = Math.max(0, it.pop - dt * 1.6); const s = 1 + Math.sin((1 - it.pop) * Math.PI * 3) * it.pop * 0.25; g.scale.set(s, 2 - s, s); } else g.scale.set(1, 1, 1);
      if (g.userData.scaf) g.userData.scaf.position.y = Math.abs(Math.sin(clock * 6)) * 0.03;
      if (g.userData.flag) g.userData.flag.rotation.y = Math.sin(clock * 3) * 0.3;
      if (g.userData.chimney && Math.random() < dt * 2.2) { const p = new THREE.Mesh(MDL.get('puff', () => [P('ico', '#ffffff', [0, 0, 0], 0.18)]), M.puff); p.position.copy(g.userData.chimney).add(g.position); p.userData.life = 0; root.add(p); puffs.push(p); }
    }
    for (const p of [...puffs]) { p.userData.life += dt; p.position.y += dt * 0.5; p.position.x += dt * 0.15; p.scale.setScalar(1 + p.userData.life); if (p.userData.life > 1.6) { root.remove(p); puffs.splice(puffs.indexOf(p), 1); } }
    if (troopsG) troopsG.children.forEach(m => { if (m.userData.ph != null) m.position.y = 0.09 + Math.abs(Math.sin(clock * 2.4 + m.userData.ph)) * 0.04; });
    updateLabels();
    renderer.render(scene, camera);
  }

  /* ── 누르기: 부지 칸 ─────────────────────────────────── */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.08);
  function pick(clientX, clientY) {
    if (!built) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // 건물을 먼저 맞히고, 아니면 바닥 칸
    const objs = Object.values(items).map(it => it.g);
    const hits = ray.intersectObjects(objs, true);
    if (hits.length) { let o = hits[0].object; while (o && o.parent !== root) o = o.parent; const it = Object.values(items).find(v => v.g === o); if (it) return { x: it.e.fp.x, y: it.e.fp.y, key: it.e.key }; }
    if (!ray.ray.intersectPlane(plane, tmpV)) return null;
    const x = Math.floor(tmpV.x + BASE.W / 2), y = Math.floor(tmpV.z + BASE.H / 2);
    if (x < 0 || y < 0 || x >= BASE.W || y >= BASE.H) return null;
    const R = BASE.RALLY; const rally = x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h;
    return { x, y, key: baseCells().get(x + ',' + y) || null, rally };
  }
  function cellToScreen(x, y) { tmpV.set(cx(x + 0.5), 0.1, cz(y + 0.5)).project(camera); const r = renderer.domElement.getBoundingClientRect(); return [r.left + (tmpV.x + 1) / 2 * r.width, r.top + (1 - tmpV.y) / 2 * r.height]; }
  function setActive(on) { if (labelLayer) labelLayer.style.display = on ? '' : 'none'; if (on) { resize(); refresh(true); } }
  return { init, build, frame, resize, pick, panBy, zoomBy, rotateBy, focus, setGhost, select, setActive, cellToScreen, get ready() { return built; } };
})();
