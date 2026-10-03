/* ============================================================
   귀여운 3D 모델 공장 (three.js r128)
   기본 도형(구·원기둥·원뿔·상자)을 정점색으로 "구워" 한 덩어리 지오메트리로 만든다.
   모든 모델: 발밑 중심이 원점, 정면이 +Z, 사람 키 ≈ 0.9
   ============================================================ */
'use strict';

const MDL = typeof THREE === 'undefined' ? null : (() => {
  const C = {
    skin: '#ffd9b6', blush: '#ff9cb2', eye: '#2a2238', white: '#ffffff', mouth: '#d25f73',
    steel: '#d3dcea', steel2: '#9fadc4', wood: '#c08a55', wood2: '#8f6038', gold: '#ffd04f', leather: '#a8764b',
    pants: '#5f5682', shoe: '#5c4434', hair: '#5d3c2e', red: '#ff5d6c', green: '#58c46d', purple: '#ac78ff', orange: '#ff9a3c',
    dark: '#3b3449', stone: '#ece6da', stone2: '#cfc7b8', canvas: '#f3e2bd',
  };

  /* ── 기본 도형 (단위 크기, 비인덱스) ───────────────────── */
  const PRIM = {};
  function prim(k) {
    if (PRIM[k]) return PRIM[k];
    let g;
    switch (k) {
      case 'sph': g = new THREE.SphereGeometry(0.5, 14, 10); break;
      case 'sphL': g = new THREE.SphereGeometry(0.5, 8, 6); break;
      case 'hemi': g = new THREE.SphereGeometry(0.5, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2); break;
      case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
      case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12); break;
      case 'cyl6': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6); break;
      case 'cyl8': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8); break;
      case 'cone': g = new THREE.ConeGeometry(0.5, 1, 12); break;
      case 'cone6': g = new THREE.ConeGeometry(0.5, 1, 6); break;
      case 'cone4': g = new THREE.ConeGeometry(0.5, 1, 4); break;
      case 'ico': g = new THREE.IcosahedronGeometry(0.5, 0); break;
      case 'ico1': g = new THREE.IcosahedronGeometry(0.5, 1); break;
      case 'oct': g = new THREE.OctahedronGeometry(0.5, 0); break;
      case 'tor': g = new THREE.TorusGeometry(0.5, 0.1, 6, 18); break;
      case 'torT': g = new THREE.TorusGeometry(0.5, 0.05, 4, 18); break;
      case 'dodec': g = new THREE.DodecahedronGeometry(0.5, 0); break;
      case 'sphXL': g = new THREE.SphereGeometry(0.5, 7, 5); break;
      case 'hemiL': g = new THREE.SphereGeometry(0.5, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2); break;
      case 'cyl5': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 5, 1, true); break;
      case 'cone5': g = new THREE.ConeGeometry(0.5, 1, 5, 1, true); break;
      default: throw new Error('prim ' + k);
    }
    if (g.index) g = g.toNonIndexed();
    PRIM[k] = g; return g;
  }

  /* ── 파츠 ─────────────────────────────────────────────── */
  // P(도형, 색, 위치, 크기(숫자|[x,y,z]), 회전([x,y,z]) | 쿼터니언)
  function P(g, c, p, s, r) { return { g, c, p, s: s == null ? 1 : s, r: r || null }; }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  // a→b를 잇는 원기둥(팔다리·자루·줄기)
  function seg(a, b, rad, c, g = 'cyl8') {
    _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
    const d = _b.clone().sub(_a); const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize());
    return { g, c, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], s: [rad * 2, len, rad * 2], r: q };
  }
  // 파츠 묶음에 부모 변환을 건다
  function grp(parts, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s));
    for (const pt of parts) pt.pm = pt.pm ? m.clone().multiply(pt.pm) : m.clone();
    return parts;
  }

  /* ── 굽기: 파츠 → 하나의 BufferGeometry (position, normal, color) ── */
  const _m = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();
  const LOD_MAP = { sph: 'sphXL', sphL: 'sphXL', hemi: 'hemiL', cyl: 'cyl5', cyl8: 'cyl5', cyl6: 'cyl5', cone: 'cone5', cone6: 'cone5', ico1: 'ico', tor: 'torT' };
  function lodParts(parts) {
    const out = [];
    for (const pt of parts) {
      const s = typeof pt.s === 'number' ? [pt.s, pt.s, pt.s] : pt.s;
      let k = 1; if (pt.pm) { const e = pt.pm.elements; k = Math.hypot(e[0], e[1], e[2]); }
      if (Math.max(s[0], s[1], s[2]) * k < 0.05 && pt.c !== C.eye) continue; // 하이라이트·수염 등 생략
      out.push(Object.assign({}, pt, { g: LOD_MAP[pt.g] || pt.g }));
    }
    return out;
  }
  function bake(parts, opts = {}) {
    if (opts.lod) parts = lodParts(parts);
    let total = 0; for (const pt of parts) total += prim(pt.g).attributes.position.count;
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    let o = 0;
    for (const pt of parts) {
      const g = prim(pt.g);
      const s = typeof pt.s === 'number' ? [pt.s, pt.s, pt.s] : pt.s;
      if (pt.r && pt.r.isQuaternion) _q.copy(pt.r); else { const r = pt.r || [0, 0, 0]; _e.set(r[0], r[1], r[2]); _q.setFromEuler(_e); }
      _v.set(pt.p[0], pt.p[1], pt.p[2]); _s.set(s[0], s[1], s[2]);
      _m.compose(_v, _q, _s); if (pt.pm) _m.premultiply(pt.pm);
      _nm.getNormalMatrix(_m);
      _c.set(pt.c);
      const PA = g.attributes.position.array, NA = g.attributes.normal.array, n = g.attributes.position.count;
      for (let i = 0; i < n; i++) {
        _v.set(PA[i * 3], PA[i * 3 + 1], PA[i * 3 + 2]).applyMatrix4(_m);
        pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
        _v.set(NA[i * 3], NA[i * 3 + 1], NA[i * 3 + 2]).applyMatrix3(_nm).normalize();
        nor[o * 3] = _v.x; nor[o * 3 + 1] = _v.y; nor[o * 3 + 2] = _v.z;
        let k = 1;
        if (opts.vgrad) { const yl = PA[i * 3 + 1] + 0.5; k = 1 - opts.vgrad * (1 - yl); }
        col[o * 3] = _c.r * k; col[o * 3 + 1] = _c.g * k; col[o * 3 + 2] = _c.b * k;
        o++;
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    bg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    bg.computeBoundingBox(); bg.computeBoundingSphere();
    return bg;
  }

  const cache = {};
  function get(key, build, opts) { if (!cache[key]) cache[key] = bake(build(), opts); return cache[key]; }

  /* ── 색 도우미 ─────────────────────────────────────────── */
  function shade(hex, k) { const c = new THREE.Color(hex); if (k < 1) c.multiplyScalar(k); else c.lerp(new THREE.Color('#ffffff'), k - 1); return '#' + c.getHexString(); }
  function mix(a, b, t) { const c = new THREE.Color(a).lerp(new THREE.Color(b), t); return '#' + c.getHexString(); }

  /* ── 얼굴 (모든 캐릭터 공통: 큰 눈 + 하이라이트 + 볼터치) ─ */
  function face(p, x0, y, z, sz = 1, o = {}) {
    for (const s of [-1, 1]) {
      p.push(P('sph', o.eye || C.eye, [x0 + s * 0.095 * sz, y, z], [0.075 * sz, 0.095 * sz, 0.05 * sz]));
      p.push(P('sphL', C.white, [x0 + s * 0.083 * sz, y + 0.022 * sz, z + 0.02 * sz], [0.03 * sz, 0.03 * sz, 0.02 * sz]));
      if (!o.noBlush) p.push(P('sphL', o.blush || C.blush, [x0 + s * 0.16 * sz, y - 0.068 * sz, z - 0.03 * sz], [0.085 * sz, 0.04 * sz, 0.03 * sz]));
      if (o.angry) p.push(P('box', C.eye, [x0 + s * 0.1 * sz, y + 0.085 * sz, z + 0.01 * sz], [0.11 * sz, 0.025 * sz, 0.02 * sz], [0, 0, s * 0.35]));
    }
    if (!o.noMouth) p.push(P('sphL', C.mouth, [x0, y - 0.075 * sz, z + 0.005], [0.05 * sz, 0.024 * sz, 0.02 * sz]));
  }

  /* ── 2등신 사람 ─────────────────────────────────────────── */
  // o: {main, trim, pants, hair, skin, y(앉은 높이), noLegs}
  function human(o) {
    const p = []; const Y = o.y || 0;
    const main = o.main, trim = o.trim || shade(main, 0.75);
    if (!o.noLegs) {
      for (const s of [-1, 1]) {
        p.push(P('cyl8', o.pants || C.pants, [s * 0.085, Y + 0.09, 0], [0.11, 0.16, 0.11]));
        p.push(P('sphL', o.shoe || C.shoe, [s * 0.085, Y + 0.025, 0.035], [0.13, 0.08, 0.18]));
      }
    }
    p.push(P('sph', main, [0, Y + 0.31, 0], [0.38, 0.37, 0.32]));                 // 몸통
    p.push(P('cyl', trim, [0, Y + 0.255, 0], [0.37, 0.055, 0.31]));              // 허리띠
    p.push(P('box', C.gold, [0, Y + 0.255, 0.155], [0.06, 0.05, 0.02]));         // 버클
    p.push(P('sph', shade(main, 1.25), [0, Y + 0.4, 0.07], [0.2, 0.1, 0.18]));    // 옷깃
    for (const s of [-1, 1]) p.push(P('sph', o.skin || C.skin, [s * 0.215, Y + 0.29, 0.03], 0.115)); // 손
    const HY = Y + 0.645;
    p.push(P('sph', o.skin || C.skin, [0, HY, 0], [0.53, 0.49, 0.49]));          // 머리
    face(p, 0, HY - 0.005, 0.215);
    if (o.hair !== false) {
      const hc = o.hair || C.hair;
      p.push(P('sph', hc, [0, HY + 0.045, -0.045], [0.55, 0.47, 0.49]));
      for (const s of [-1, 0, 1]) p.push(P('sphL', hc, [s * 0.11, HY + 0.16, 0.16 - Math.abs(s) * 0.03], [0.17, 0.1, 0.1], [0.3, 0, -s * 0.3])); // 앞머리
    }
    return { parts: p, HY, Y };
  }

  /* ── 모자 ──────────────────────────────────────────────── */
  function hat(p, kind, HY, main, trim, extra = {}) {
    switch (kind) {
      case 'helm': p.push(P('hemi', C.steel, [0, HY + 0.035, -0.01], [0.58, 0.55, 0.56])); p.push(P('cyl', C.steel2, [0, HY + 0.04, -0.01], [0.58, 0.04, 0.56])); p.push(P('sph', C.red, [0, HY + 0.33, -0.01], 0.1)); break;
      case 'helmPlume': p.push(P('hemi', C.steel, [0, HY + 0.035, -0.01], [0.58, 0.55, 0.56])); p.push(P('cyl', C.gold, [0, HY + 0.04, -0.01], [0.58, 0.04, 0.56])); p.push(P('sph', extra.plume || C.red, [0, HY + 0.33, -0.08], [0.09, 0.2, 0.3], [0.5, 0, 0])); break;
      case 'helmBrim': p.push(P('hemi', trim, [0, HY + 0.04, -0.01], [0.57, 0.52, 0.55])); p.push(P('cyl', shade(trim, 0.8), [0, HY + 0.05, 0], [0.7, 0.035, 0.68])); p.push(P('sph', C.gold, [0, HY + 0.3, 0], 0.07)); break;
      case 'helmFull': p.push(P('hemi', C.steel2, [0, HY + 0.03, -0.01], [0.6, 0.6, 0.58])); for (const s of [-1, 1]) p.push(P('box', C.steel2, [s * 0.25, HY - 0.06, 0.05], [0.06, 0.2, 0.18])); p.push(P('box', C.gold, [0, HY + 0.2, 0.2], [0.06, 0.16, 0.06])); break;
      case 'helmHorn': p.push(P('hemi', C.steel, [0, HY + 0.035, -0.01], [0.58, 0.55, 0.56])); for (const s of [-1, 1]) p.push(seg([s * 0.24, HY + 0.12, 0], [s * 0.36, HY + 0.33, 0], 0.035, '#fff4dc', 'cone')); break;
      case 'band': p.push(P('torT', trim, [0, HY + 0.1, 0], [0.54, 0.54, 0.6], [Math.PI / 2 + 0.1, 0, 0])); p.push(P('sphL', trim, [0, HY + 0.08, -0.3], [0.08, 0.06, 0.12])); p.push(seg([0, HY + 0.08, -0.3], [0.08, HY - 0.05, -0.36], 0.025, trim)); break;
      case 'topknot': p.push(P('sph', C.hair, [0, HY + 0.3, -0.04], 0.16)); p.push(P('cyl', trim, [0, HY + 0.24, -0.04], [0.14, 0.04, 0.14])); break;
      case 'feather': p.push(P('hemi', main, [0, HY + 0.07, -0.02], [0.56, 0.46, 0.54], [-0.12, 0, 0])); p.push(P('cyl', trim, [0, HY + 0.075, -0.02], [0.57, 0.04, 0.55])); p.push(P('sph', extra.feather || '#ffffff', [0.16, HY + 0.3, -0.1], [0.07, 0.3, 0.07], [-0.5, 0, -0.5])); break;
      case 'cap': p.push(P('cyl', main, [0, HY + 0.2, -0.01], [0.5, 0.14, 0.5])); p.push(P('box', trim, [0, HY + 0.15, 0.24], [0.32, 0.03, 0.16])); break;
      case 'goggle': for (const s of [-1, 1]) { p.push(P('cyl', C.dark, [s * 0.1, HY + 0.14, 0.2], [0.13, 0.06, 0.13], [Math.PI / 2 - 0.3, 0, 0])); p.push(P('cyl', '#9ee6ff', [s * 0.1, HY + 0.145, 0.235], [0.09, 0.02, 0.09], [Math.PI / 2 - 0.3, 0, 0])); } p.push(P('torT', C.dark, [0, HY + 0.12, 0], [0.54, 0.54, 0.6], [Math.PI / 2 + 0.15, 0, 0])); break;
      case 'bearhat': p.push(P('hemi', '#8a5a3a', [0, HY + 0.03, -0.01], [0.6, 0.58, 0.58])); for (const s of [-1, 1]) { p.push(P('sph', '#8a5a3a', [s * 0.2, HY + 0.27, 0], 0.13)); p.push(P('sph', '#f2b9a0', [s * 0.2, HY + 0.27, 0.04], 0.07)); } break;
      case 'hood': p.push(P('sph', main, [0, HY + 0.05, -0.05], [0.6, 0.56, 0.56])); p.push(seg([0, HY + 0.2, -0.22], [0, HY + 0.05, -0.42], 0.06, main, 'cone')); p.push(P('torT', trim, [0, HY - 0.02, 0.06], [0.48, 0.48, 0.5], [0.3, 0, 0])); break;
      case 'bandana': p.push(P('hemi', main, [0, HY + 0.05, -0.01], [0.57, 0.5, 0.55])); p.push(P('sphL', main, [0.05, HY + 0.05, -0.29], [0.12, 0.08, 0.1])); for (const s of [-1, 1]) p.push(seg([0.05, HY + 0.04, -0.3], [0.05 + s * 0.1, HY - 0.08, -0.34], 0.025, main)); break;
      case 'mask': p.push(P('box', C.dark, [0, HY + 0.02, 0.2], [0.5, 0.1, 0.12])); break;
      case 'bigHat': p.push(P('cyl', '#3b3449', [0, HY + 0.15, 0], [0.86, 0.04, 0.8])); p.push(P('cyl', '#3b3449', [0, HY + 0.28, 0], [0.42, 0.26, 0.42])); p.push(P('cyl', C.red, [0, HY + 0.18, 0], [0.43, 0.05, 0.43])); p.push(P('sph', C.red, [0.18, HY + 0.4, -0.1], [0.06, 0.3, 0.06], [-0.4, 0, -0.6])); break;
      case 'crown': p.push(P('cyl', C.gold, [0, HY + 0.22, 0], [0.34, 0.1, 0.34])); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; p.push(P('cone', C.gold, [Math.sin(a) * 0.15, HY + 0.3, Math.cos(a) * 0.15], [0.07, 0.1, 0.07])); } p.push(P('sph', extra.jewel || C.red, [0, HY + 0.22, 0.17], 0.065)); break;
    }
  }

  /* ── 무기 (오른손 x=+0.22, 왼손 x=-0.22, 손 높이 hy) ───── */
  function weapon(p, kind, hy, side = 1, o = {}) {
    const x = 0.235 * side, z = 0.05;
    switch (kind) {
      case 'spear': p.push(seg([x, hy - 0.2, z], [x, hy + 0.78, z], 0.022, C.wood)); p.push(P('cone', C.steel, [x, hy + 0.86, z], [0.075, 0.18, 0.075])); p.push(P('sphL', C.red, [x, hy + 0.74, z], [0.07, 0.06, 0.07])); break;
      case 'javelin': p.push(seg([x, hy - 0.1, z], [x, hy + 0.6, z], 0.02, C.wood)); p.push(P('cone', C.steel, [x, hy + 0.67, z], [0.06, 0.15, 0.06])); break;
      case 'halberd': p.push(seg([x, hy - 0.2, z], [x, hy + 0.82, z], 0.022, C.wood2)); p.push(P('cone', C.steel, [x, hy + 0.9, z], [0.06, 0.16, 0.06])); p.push(P('sph', C.steel, [x, hy + 0.68, z + 0.08], [0.03, 0.2, 0.17])); p.push(P('sphL', C.red, [x, hy + 0.58, z], 0.06)); break;
      case 'glaive': p.push(seg([x, hy - 0.2, z], [x, hy + 0.56, z], 0.026, C.wood2)); p.push(P('sph', C.steel, [x, hy + 0.78, z + 0.03], [0.035, 0.48, 0.16])); p.push(P('cyl', C.gold, [x, hy + 0.56, z], [0.07, 0.05, 0.07])); break;
      case 'longsword': p.push(seg([x, hy - 0.06, z], [x, hy + 0.06, z], 0.025, C.leather)); p.push(P('box', C.gold, [x, hy + 0.08, z], [0.05, 0.035, 0.17])); p.push(P('box', C.steel, [x, hy + 0.37, z], [0.022, 0.55, 0.075])); p.push(P('cone4', C.steel, [x, hy + 0.68, z], [0.022, 0.08, 0.075], [0, Math.PI / 4, 0])); break;
      case 'sword': p.push(seg([x, hy - 0.05, z], [x, hy + 0.04, z], 0.022, C.leather)); p.push(P('box', C.gold, [x, hy + 0.06, z], [0.04, 0.03, 0.14])); p.push(P('box', C.steel, [x, hy + 0.24, z], [0.02, 0.34, 0.065])); break;
      case 'shortspear': p.push(seg([x, hy - 0.15, z], [x, hy + 0.55, z], 0.02, C.wood)); p.push(P('cone', C.steel, [x, hy + 0.62, z], [0.065, 0.15, 0.065])); break;
      case 'hammer': p.push(seg([x, hy - 0.08, z], [x, hy + 0.36, z], 0.022, C.wood2)); p.push(P('box', C.steel2, [x, hy + 0.42, z], [0.14, 0.13, 0.22])); p.push(P('box', C.gold, [x, hy + 0.42, z], [0.15, 0.03, 0.23])); break;
      case 'axe': p.push(seg([x, hy - 0.08, z], [x, hy + 0.42, z], 0.022, C.wood2)); p.push(P('sph', C.steel, [x, hy + 0.36, z + 0.1], [0.03, 0.22, 0.17])); break;
      case 'club': p.push(seg([x, hy - 0.06, z], [x + 0.03 * side, hy + 0.38, z + 0.05], 0.035, C.wood2)); p.push(P('sph', C.wood, [x + 0.04 * side, hy + 0.42, z + 0.06], [0.13, 0.17, 0.13])); break;
      case 'dagger': p.push(P('box', C.steel, [x, hy + 0.12, z + 0.02], [0.02, 0.2, 0.05])); p.push(P('box', C.dark, [x, hy + 0.02, z], [0.04, 0.03, 0.08])); break;
      case 'bigaxe': p.push(seg([x, hy - 0.15, z], [x, hy + 0.6, z], 0.03, C.wood2)); p.push(P('sph', C.steel, [x, hy + 0.52, z + 0.14], [0.04, 0.34, 0.26])); p.push(P('sph', C.steel, [x, hy + 0.52, z - 0.1], [0.04, 0.22, 0.16])); break;
      case 'lance': p.push(seg([x, hy - 0.12, z - 0.15], [x, hy + 0.55, z + 0.75], 0.03, C.wood)); p.push(seg([x, hy + 0.55, z + 0.75], [x, hy + 0.68, z + 0.93], 0.045, C.steel, 'cone')); p.push(P('box', o.flag || C.red, [x, hy + 0.48, z + 0.6], [0.015, 0.12, 0.2], [0.65, 0, 0])); break;
      case 'bow': {
        const z0 = 0.13; p.push(seg([x, hy - 0.06, z0], [x, hy + 0.06, z0], 0.03, C.leather));
        p.push(seg([x, hy + 0.06, z0], [x, hy + 0.34, z0 - 0.1], 0.02, o.bowColor || C.wood2)); p.push(seg([x, hy - 0.06, z0], [x, hy - 0.34, z0 - 0.1], 0.02, o.bowColor || C.wood2));
        p.push(seg([x, hy + 0.34, z0 - 0.1], [x, hy - 0.34, z0 - 0.1], 0.006, '#ffffff'));
        if (o.arrow) { p.push(seg([x - 0.25 * side, hy, z0 - 0.12], [x + 0.02 * side, hy, z0 + 0.12], 0.012, C.wood)); p.push(P('sph', o.arrow, [x + 0.03 * side, hy, z0 + 0.14], 0.07)); }
        break;
      }
      case 'crossbow': {
        p.push(P('box', C.wood2, [0.05, hy + 0.04, 0.22], [0.07, 0.07, 0.36]));
        p.push(seg([0.05, hy + 0.06, 0.38], [0.3, hy + 0.06, 0.3], 0.018, C.steel2)); p.push(seg([0.05, hy + 0.06, 0.38], [-0.2, hy + 0.06, 0.3], 0.018, C.steel2));
        p.push(seg([0.3, hy + 0.06, 0.3], [-0.2, hy + 0.06, 0.3], 0.006, '#ffffff')); p.push(P('cone', C.steel, [0.05, hy + 0.09, 0.42], [0.035, 0.1, 0.035], [Math.PI / 2, 0, 0]));
        break;
      }
      case 'heavycrossbow': {
        p.push(P('box', C.wood2, [0.08, hy + 0.12, 0.2], [0.1, 0.1, 0.52]));
        p.push(seg([0.08, hy + 0.14, 0.44], [0.46, hy + 0.14, 0.32], 0.026, C.dark)); p.push(seg([0.08, hy + 0.14, 0.44], [-0.3, hy + 0.14, 0.32], 0.026, C.dark));
        p.push(seg([0.46, hy + 0.14, 0.32], [-0.3, hy + 0.14, 0.32], 0.008, '#ffffff')); p.push(P('cone', C.steel, [0.08, hy + 0.18, 0.5], [0.05, 0.14, 0.05], [Math.PI / 2, 0, 0]));
        p.push(P('cyl', '#9ee6ff', [0.08, hy + 0.21, 0.08], [0.06, 0.12, 0.06], [Math.PI / 2, 0, 0]));
        break;
      }
    }
  }
  function shield(p, kind, hy, main, trim) {
    const x = -0.26, z = 0.13;
    if (kind === 'round') { p.push(P('cyl', trim, [x, hy + 0.04, z - 0.01], [0.42, 0.04, 0.42], [Math.PI / 2, 0, 0])); p.push(P('cyl', main, [x, hy + 0.04, z + 0.01], [0.36, 0.04, 0.36], [Math.PI / 2, 0, 0])); p.push(P('sph', C.gold, [x, hy + 0.04, z + 0.035], [0.1, 0.1, 0.06])); }
    if (kind === 'tower') { p.push(P('box', C.steel2, [x + 0.02, hy + 0.1, z + 0.02], [0.36, 0.56, 0.06])); p.push(P('box', main, [x + 0.02, hy + 0.1, z + 0.055], [0.14, 0.5, 0.02])); for (const a of [-1, 1]) for (const b of [-1, 1]) p.push(P('sphL', C.gold, [x + 0.02 + a * 0.13, hy + 0.1 + b * 0.22, z + 0.06], 0.035)); }
    if (kind === 'kite') { p.push(P('sph', C.gold, [x, hy + 0.06, z - 0.005], [0.36, 0.5, 0.05])); p.push(P('sph', main, [x, hy + 0.06, z + 0.01], [0.3, 0.44, 0.05])); p.push(P('box', C.white, [x, hy + 0.08, z + 0.04], [0.04, 0.22, 0.01])); p.push(P('box', C.white, [x, hy + 0.12, z + 0.04], [0.14, 0.04, 0.01])); }
  }
  function back(p, kind, Y, o = {}) {
    if (kind === 'quiver') { p.push(seg([-0.06, Y + 0.18, -0.17], [0.1, Y + 0.5, -0.19], 0.065, C.leather)); for (let i = 0; i < 3; i++) { p.push(P('cone4', i === 1 ? C.red : C.white, [0.11 + i * 0.025 - 0.02, Y + 0.58 + (i % 2) * 0.03, -0.2], [0.05, 0.1, 0.02], [0, 0, -0.4])); } }
    if (kind === 'javelins') { p.push(seg([-0.2, Y + 0.1, -0.2], [0.18, Y + 0.72, -0.2], 0.016, C.wood)); p.push(seg([-0.14, Y + 0.08, -0.22], [0.24, Y + 0.68, -0.22], 0.016, C.wood)); p.push(P('cone', C.steel, [0.2, Y + 0.76, -0.2], [0.05, 0.12, 0.05], [0, 0, -0.55])); p.push(P('cone', C.steel, [0.26, Y + 0.72, -0.22], [0.05, 0.12, 0.05], [0, 0, -0.55])); }
    if (kind === 'cape') { p.push(P('sph', o.color || C.red, [0, Y + 0.3, -0.13], [0.42, 0.42, 0.12], [-0.12, 0, 0])); }
  }

  // 영웅 어깨띠 (정면에서 보이는 영웅 색)
  function sash(p, Y, c) { p.push(P('box', c, [0.01, Y + 0.32, 0.135], [0.075, 0.46, 0.06], [0, 0, 0.72])); p.push(P('sph', C.gold, [0.09, Y + 0.24, 0.16], 0.06)); }

  /* ── 조랑말 ────────────────────────────────────────────── */
  function horse(o) {
    const p = []; const body = o.body, dark = o.mane || shade(body, 0.6);
    p.push(P('sph', body, [0, 0.42, 0], [0.42, 0.36, 0.7]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.push(P('cyl8', body, [sx * 0.13, 0.15, sz * 0.21], [0.1, 0.3, 0.1])); p.push(P('cyl8', o.hoof || C.dark, [sx * 0.13, 0.02, sz * 0.21], [0.11, 0.05, 0.11])); }
    p.push(seg([0, 0.5, 0.25], [0, 0.66, 0.36], 0.11, body));                         // 목
    p.push(P('sph', body, [0, 0.72, 0.42], [0.3, 0.3, 0.36]));                        // 머리
    p.push(P('sph', o.snout || shade(body, 1.25), [0, 0.66, 0.57], [0.22, 0.18, 0.18])); // 주둥이
    for (const s of [-1, 1]) { p.push(P('sphL', C.eye, [s * 0.04, 0.665, 0.655], [0.025, 0.03, 0.02])); p.push(P('cone', body, [s * 0.08, 0.88, 0.36], [0.06, 0.12, 0.05])); }
    face(p, 0, 0.75, 0.56, 0.75, { noMouth: true });
    for (let i = 0; i < 5; i++) p.push(P('sphL', dark, [0, 0.86 - i * 0.07, 0.37 - i * 0.07], [0.09, 0.1, 0.1]));  // 갈기
    p.push(seg([0, 0.5, -0.32], [0, 0.3, -0.46], 0.07, dark, 'cone'));               // 꼬리
    p.push(P('box', o.saddle, [0, 0.62, -0.02], [0.4, 0.06, 0.3]));                   // 안장
    p.push(P('box', C.gold, [0, 0.6, -0.02], [0.42, 0.03, 0.08]));
    if (o.armor) { p.push(P('sph', C.steel2, [0, 0.43, 0.02], [0.45, 0.3, 0.6])); p.push(P('box', C.steel, [0, 0.82, 0.48], [0.12, 0.14, 0.08])); }
    return p;
  }

  /* ── 병종 외형 ─────────────────────────────────────────── */
  const LOOK = {
    spear_long: { hat: 'helm', w: 'spear' }, spear_pike: { hat: 'band', w: 'javelin', back: 'javelins' }, spear_ge: { hat: 'helm', w: 'halberd' },
    spear_modao: { hat: 'helmPlume', w: 'glaive' }, spear_sword: { hat: 'topknot', w: 'longsword' }, spear_dual: { hat: 'band', w: 'shortspear', w2: 'shortspear' },
    shield_sword: { hat: 'helmBrim', w: 'sword', sh: 'round' }, shield_spear: { hat: 'helmBrim', w: 'shortspear', sh: 'round' }, shield_heavy: { hat: 'helmFull', sh: 'tower' },
    shield_hammer: { hat: 'helmHorn', w: 'hammer', sh: 'round' }, shield_axe: { hat: 'helmHorn', w: 'axe', sh: 'round' }, shield_blade: { hat: 'helmBrim', w: 'sword', sh: 'kite' },
    bow_long: { hat: 'feather', w: 'bow', back: 'quiver' }, bow_cross: { hat: 'cap', w: 'crossbow' }, bow_heavy: { hat: 'goggle', w: 'heavycrossbow' },
    bow_hunter: { hat: 'bearhat', w: 'bow', back: 'quiver' }, bow_fire: { hat: 'feather', feather: C.orange, w: 'bow', arrow: '#ff7a2f', back: 'quiver' }, bow_poison: { hat: 'hood', hoodColor: '#9b6cff', w: 'bow', arrow: '#9b6cff', bowColor: '#6a4c8a' },
    cav_sword: { horse: '#b07a4e', hat: 'helm', w: 'sword' }, cav_spear: { horse: '#f4ece2', mane: '#c9b8a6', hat: 'helmPlume', w: 'lance' }, cav_glaive: { horse: '#4a4058', mane: '#2c2636', hat: 'helm', w: 'glaive' },
    cav_heavy: { horse: '#9a8f86', armor: true, hat: 'helmFull', w: 'lance' }, cav_bow: { horse: '#e9c48f', hat: 'feather', w: 'bow' }, cav_axe: { horse: '#8a5a3a', hat: 'helmHorn', w: 'axe' },
  };

  function unitParts(typeId, main, trim, heroMark) {
    if (typeId === 'siege_cat' || typeId === 'siege_bal') return siegeParts(typeId, main);
    const L = LOOK[typeId];
    let p = [];
    if (L.horse) {
      p = horse({ body: L.horse, mane: L.mane, saddle: main, armor: L.armor });
      const h = human({ main, trim, y: 0.47, noLegs: true });
      const rp = grp(h.parts, [0, 0, -0.04], [0, 0, 0], 0.85);
      hat(rp, L.hat, h.HY, main, trim, {}); grp(rp.slice(h.parts.length), [0, 0, -0.04], [0, 0, 0], 0.85);
      const wp = []; weapon(wp, L.w, h.Y + 0.29, 1, { flag: main, bowColor: L.bowColor }); grp(wp, [0, 0, -0.04], [0, 0, 0], 0.85);
      p = p.concat(rp, wp);
      if (heroMark) { const hc = typeof heroMark === 'string' ? heroMark : C.red; const cp = []; back(cp, 'cape', h.Y, { color: hc }); sash(cp, h.Y, hc); hat(cp, 'crown', h.HY + 0.12, main, trim, { jewel: hc }); grp(cp, [0, 0, -0.04], [0, 0, 0], 0.85); p = p.concat(cp); }
      return p;
    }
    const h = human({ main, trim, hair: L.hat === 'hood' || L.hat === 'helmFull' ? false : undefined });
    p = h.parts;
    hat(p, L.hat, h.HY, L.hoodColor || main, trim, { feather: L.feather });
    if (L.w) weapon(p, L.w, h.Y + 0.29, 1, { arrow: L.arrow, bowColor: L.bowColor });
    if (L.w2) weapon(p, L.w2, h.Y + 0.29, -1, {});
    if (L.sh) shield(p, L.sh, h.Y + 0.29, main, trim);
    if (L.back) back(p, L.back, h.Y);
    if (heroMark) { const hc = typeof heroMark === 'string' ? heroMark : C.red; back(p, 'cape', h.Y, { color: hc }); sash(p, h.Y, hc); hat(p, 'crown', h.HY + 0.12, main, trim, { jewel: hc }); }
    return p;
  }

  function siegeParts(typeId, main) {
    const p = [];
    p.push(P('box', C.wood, [0, 0.24, 0], [0.62, 0.12, 0.84]));
    p.push(P('box', C.wood2, [0, 0.31, 0], [0.66, 0.03, 0.88]));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.push(P('cyl', C.wood2, [sx * 0.35, 0.16, sz * 0.28], [0.32, 0.08, 0.32], [0, 0, Math.PI / 2])); p.push(P('cyl', C.gold, [sx * 0.39, 0.16, sz * 0.28], [0.1, 0.03, 0.1], [0, 0, Math.PI / 2])); }
    if (typeId === 'siege_cat') {
      for (const sx of [-1, 1]) p.push(P('box', C.wood2, [sx * 0.2, 0.5, -0.06], [0.07, 0.42, 0.07]));
      p.push(P('box', C.wood2, [0, 0.69, -0.06], [0.48, 0.07, 0.07]));
      p.push(seg([0, 0.36, -0.3], [0, 0.9, 0.24], 0.035, C.wood));
      p.push(P('hemi', C.wood2, [0, 0.9, 0.26], [0.22, -0.14, 0.22]));
      p.push(P('ico', '#9a95a6', [0, 0.95, 0.26], 0.16));
      p.push(P('box', C.dark, [0, 0.4, -0.34], [0.2, 0.16, 0.16]));
      p.push(seg([0.26, 0.33, -0.38], [0.26, 0.86, -0.38], 0.012, C.wood2)); p.push(P('box', main, [0.26, 0.8, -0.3], [0.015, 0.12, 0.17]));
    } else {
      p.push(P('box', C.wood2, [0, 0.44, 0], [0.1, 0.24, 0.1]));
      p.push(P('box', C.wood, [0, 0.58, 0.04], [0.12, 0.1, 0.78]));
      p.push(seg([0, 0.6, 0.38], [0.42, 0.6, 0.22], 0.03, C.dark)); p.push(seg([0, 0.6, 0.38], [-0.42, 0.6, 0.22], 0.03, C.dark));
      p.push(seg([0.42, 0.6, 0.22], [-0.42, 0.6, 0.22], 0.008, '#ffffff'));
      p.push(seg([0, 0.66, -0.2], [0, 0.66, 0.5], 0.02, C.wood2)); p.push(P('cone', C.steel, [0, 0.66, 0.56], [0.06, 0.14, 0.06], [Math.PI / 2, 0, 0]));
      p.push(seg([-0.26, 0.33, -0.38], [-0.26, 0.86, -0.38], 0.012, C.wood2)); p.push(P('box', main, [-0.26, 0.8, -0.3], [0.015, 0.12, 0.17]));
    }
    return p;
  }

  /* ── 네발 동물 ─────────────────────────────────────────── */
  function quad(o) {
    const p = []; const w = o.w || 0.44, h = o.h || 0.4, L = o.len || 0.64, legH = o.legH == null ? 0.16 : o.legH;
    const by = legH + h * 0.45;
    p.push(P('sph', o.body, [0, by, 0], [w, h, L]));
    if (o.belly) p.push(P('sph', o.belly, [0, by - h * 0.13, 0.03], [w * 0.8, h * 0.72, L * 0.84]));
    const lw = 0.11 * (o.legW || 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.push(P('cyl8', o.leg || o.body, [sx * w * 0.3, legH * 0.55, sz * L * 0.27], [lw, legH + 0.06, lw])); p.push(P('sphL', o.paw || shade(o.leg || o.body, 0.85), [sx * w * 0.3, 0.03, sz * L * 0.27 + 0.02], [lw * 1.15, 0.07, lw * 1.35])); }
    const hr = o.headR || 0.38; const hy = by + h * 0.32 + (o.headUp || 0.1); const hz = L * 0.4 + (o.headFwd || 0);
    p.push(P('sph', o.head || o.body, [0, hy, hz], [hr, hr * 0.92, hr * 0.9]));
    if (o.muzzle) p.push(P('sph', o.muzzle, [0, hy - hr * 0.16, hz + hr * 0.32], [hr * 0.52, hr * 0.38, hr * 0.4]));
    face(p, 0, hy + hr * 0.04, hz + hr * 0.4, hr / 0.5 * 0.9, { noMouth: true, angry: o.angry, eye: o.eyeColor });
    p.push(P('sphL', o.nose || C.eye, [0, hy - hr * 0.08, hz + hr * 0.5], [hr * 0.17, hr * 0.12, hr * 0.1]));
    const er = o.earR || hr * 0.3;
    if (o.ears === 'point') for (const s of [-1, 1]) { p.push(P('cone', o.earC || o.head || o.body, [s * hr * 0.3, hy + hr * 0.48, hz - 0.02], [er, er * 1.6, er * 0.7], [0, 0, -s * 0.25])); p.push(P('cone', '#ffc2c8', [s * hr * 0.3, hy + hr * 0.46, hz + 0.01], [er * 0.55, er * 1.1, er * 0.3], [0, 0, -s * 0.25])); }
    if (o.ears === 'round') for (const s of [-1, 1]) { p.push(P('sph', o.earC || o.head || o.body, [s * hr * 0.36, hy + hr * 0.42, hz - 0.03], [er * 1.2, er * 1.2, er * 0.6])); p.push(P('sph', '#ffc2c8', [s * hr * 0.36, hy + hr * 0.42, hz], [er * 0.65, er * 0.65, er * 0.3])); }
    if (o.ears === 'big') for (const s of [-1, 1]) { p.push(P('sph', o.earC || o.body, [s * hr * 0.62, hy + hr * 0.05, hz - hr * 0.2], [hr * 0.18, hr * 1.05, hr * 0.9], [0, s * 0.5, 0])); p.push(P('sph', '#ffc2c8', [s * hr * 0.66, hy + hr * 0.05, hz - hr * 0.12], [hr * 0.08, hr * 0.75, hr * 0.62], [0, s * 0.5, 0])); }
    const tz = -L * 0.5;
    if (o.tail === 'bushy') p.push(seg([0, by + 0.02, tz + 0.04], [0, by + 0.3, tz - 0.24], 0.1, o.tailC || o.body, 'sph'));
    if (o.tail === 'big') p.push(P('sph', o.tailC || o.body, [0, by + h * 0.6, tz - 0.12], [0.36, 0.55, 0.3], [-0.4, 0, 0]));
    if (o.tail === 'thin') p.push(seg([0, by, tz + 0.04], [0, by + 0.2, tz - 0.3], 0.025, o.tailC || o.body));
    if (o.tail === 'tuft') { p.push(seg([0, by, tz + 0.04], [0, by - 0.05, tz - 0.3], 0.025, o.body)); p.push(P('sph', o.tailC || C.hair, [0, by - 0.07, tz - 0.33], 0.1)); }
    if (o.tail === 'stub') p.push(P('sph', o.tailC || o.body, [0, by + 0.05, tz - 0.02], 0.12));
    if (o.extra) o.extra(p, { by, hy, hz, hr, w, h, L, legH });
    return p;
  }

  const MON = {
    boar: () => quad({ body: '#a8724a', belly: '#c99a70', head: '#a8724a', muzzle: '#f2a9a2', nose: '#d97f84', ears: 'point', tail: 'stub', len: 0.66, extra: (p, k) => { for (const s of [-1, 1]) p.push(P('cone', '#fff6dc', [s * 0.09, k.hy - 0.1, k.hz + k.hr * 0.42], [0.05, 0.12, 0.05], [0.3, 0, -s * 0.3])); for (let i = 0; i < 4; i++) p.push(P('sphL', '#6e4a30', [0, k.by + k.h * 0.45, 0.18 - i * 0.12], [0.09, 0.1, 0.12])); } }),
    wolf: () => quad({ body: '#a2aac0', belly: '#eef0f6', head: '#a2aac0', muzzle: '#eef0f6', ears: 'point', earR: 0.13, tail: 'bushy', tailC: '#a2aac0', legH: 0.2, extra: (p, k) => { p.push(P('torT', C.red, [0, k.hy - k.hr * 0.42, k.hz - 0.04], [0.36, 0.36, 0.5], [Math.PI / 2 - 0.2, 0, 0])); } }),
    cheetah: () => quad({ body: '#f6c65c', belly: '#fff0cc', muzzle: '#fff0cc', ears: 'round', earR: 0.09, tail: 'thin', legH: 0.22, w: 0.38, extra: (p, k) => { const sp = [[0.12, 0.1, 0.15], [-0.14, 0.12, 0.05], [0.15, 0.05, -0.12], [-0.1, 0.15, -0.18], [0.02, 0.2, 0], [-0.17, 0.02, 0.2], [0.17, 0.0, 0.25]]; for (const s of sp) p.push(P('sphL', '#5a4636', [s[0], k.by + s[1], s[2]], 0.055)); for (const s of [-1, 1]) p.push(seg([s * 0.09, k.hy - 0.02, k.hz + k.hr * 0.38], [s * 0.1, k.hy - 0.12, k.hz + k.hr * 0.36], 0.012, '#5a4636')); } }),
    skunk: () => quad({ body: '#3e3650', belly: '#3e3650', head: '#3e3650', muzzle: '#4c4360', nose: '#ff9cb2', ears: 'round', earR: 0.08, tail: 'big', tailC: '#3e3650', len: 0.56, legH: 0.12, extra: (p, k) => { p.push(P('sph', '#ffffff', [0, k.by + k.h * 0.38, 0], [0.12, 0.08, k.L * 0.9])); p.push(P('sph', '#ffffff', [0, k.by + k.h * 0.75, k.L * -0.6], [0.12, 0.42, 0.12], [-0.4, 0, 0])); p.push(P('sph', '#ffffff', [0, k.hy + k.hr * 0.3, k.hz + 0.08], [0.06, 0.16, 0.1])); } }),
    hedgehog: () => quad({ body: '#8b6a52', belly: '#f2d6b6', head: '#f2d6b6', nose: '#2a2238', ears: 'round', earR: 0.06, tail: 'none', legH: 0.08, len: 0.58, h: 0.44, headR: 0.3, headUp: -0.02, extra: (p, k) => { for (let i = 0; i < 18; i++) { const a = (i * 2.4) % (Math.PI * 2), t = (i / 18); const y = k.by + 0.06 + t * 0.18, z = -0.22 + (i % 6) * 0.07; p.push(P('cone6', '#6b4a36', [Math.sin(a) * 0.17 * (1 - t * 0.4), y + 0.05, z], [0.07, 0.16, 0.07], [-0.9 + t * 0.4, 0, Math.sin(a) * 0.6])); } } }),
    bison: () => quad({ body: '#7a5640', belly: '#8e6a52', head: '#5e3f2e', muzzle: '#a07a62', ears: 'none', tail: 'tuft', w: 0.52, h: 0.46, len: 0.72, angry: true, extra: (p, k) => { p.push(P('sph', '#5e3f2e', [0, k.by + 0.18, 0.12], [0.5, 0.44, 0.42])); for (const s of [-1, 1]) p.push(seg([s * 0.16, k.hy + 0.1, k.hz], [s * 0.3, k.hy + 0.26, k.hz + 0.02], 0.04, '#fff3d6', 'cone')); p.push(P('sph', '#5e3f2e', [0, k.hy - k.hr * 0.5, k.hz + 0.08], [0.14, 0.18, 0.1])); } }),
    tiger: () => quad({ body: '#ff9f43', belly: '#fff3e2', muzzle: '#fff3e2', ears: 'round', earR: 0.09, tail: 'thin', tailC: '#ff9f43', angry: true, extra: (p, k) => { for (let i = 0; i < 5; i++) p.push(P('box', '#3b3449', [0, k.by + 0.12, 0.22 - i * 0.11], [k.w * 0.98, 0.04, 0.04], [0, 0, 0.25 * (i % 2 ? 1 : -1)])); p.push(P('box', '#3b3449', [0, k.hy + k.hr * 0.36, k.hz + 0.08], [0.04, 0.09, 0.03])); for (const s of [-1, 1]) p.push(P('box', '#3b3449', [s * 0.12, k.hy + k.hr * 0.3, k.hz + 0.06], [0.03, 0.07, 0.03], [0, 0, s * 0.3])); } }),
    lion: () => quad({ body: '#f6c95f', belly: '#fde7b4', muzzle: '#fde7b4', ears: 'round', earR: 0.08, tail: 'tuft', tailC: '#c8782e', angry: true, extra: (p, k) => { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; p.push(P('sph', i % 2 ? '#d9822f' : '#c8692a', [Math.sin(a) * k.hr * 0.55, k.hy + Math.cos(a) * k.hr * 0.52, k.hz - 0.06], [0.2, 0.2, 0.16])); } } }),
    elephant: () => quad({ body: '#aeb8d0', belly: '#c4cde0', head: '#aeb8d0', ears: 'big', tail: 'thin', w: 0.56, h: 0.5, len: 0.74, legH: 0.2, legW: 1.6, headR: 0.42, nose: '#aeb8d0', extra: (p, k) => { p.push(seg([0, k.hy - 0.06, k.hz + k.hr * 0.42], [0, k.hy - 0.24, k.hz + k.hr * 0.62], 0.06, '#aeb8d0', 'cyl8')); p.push(seg([0, k.hy - 0.24, k.hz + k.hr * 0.62], [0, k.hy - 0.32, k.hz + k.hr * 0.82], 0.05, '#aeb8d0', 'cyl8')); for (const s of [-1, 1]) p.push(seg([s * 0.1, k.hy - 0.12, k.hz + k.hr * 0.38], [s * 0.12, k.hy - 0.2, k.hz + k.hr * 0.66], 0.025, '#fffaf0', 'cone')); } }),
    bear: () => quad({ body: '#9a663f', belly: '#c48f62', muzzle: '#e6c29b', ears: 'round', earR: 0.11, tail: 'stub', w: 0.52, h: 0.48, len: 0.62, legW: 1.4, headR: 0.42 }),
    lizard: () => quad({ body: '#6fca6c', belly: '#d7f0a6', head: '#6fca6c', ears: 'none', tail: 'none', legH: 0.06, h: 0.26, w: 0.36, len: 0.7, headR: 0.32, headUp: 0.0, extra: (p, k) => { p.push(seg([0, k.by - 0.02, -k.L * 0.45], [0, k.by - 0.08, -k.L * 1.05], 0.08, '#6fca6c', 'cone')); for (let i = 0; i < 3; i++) p.push(P('sphL', '#4fae55', [0, k.by + 0.11, 0.18 - i * 0.18], [0.12, 0.06, 0.1])); p.push(P('box', '#ff7d8f', [0, k.hy - 0.08, k.hz + k.hr * 0.5], [0.03, 0.01, 0.14])); } }),
    hornet: () => { const p = []; const y = 0.5; p.push(P('sph', '#ffd23f', [0, y, -0.1], [0.42, 0.4, 0.52])); for (let i = 0; i < 3; i++) p.push(P('cyl', '#3b3449', [0, y, -0.02 - i * 0.12], [0.4 - Math.abs(i - 1) * 0.04, 0.05, 0.38], [Math.PI / 2, 0, 0])); p.push(P('cone', '#3b3449', [0, y - 0.02, -0.42], [0.08, 0.18, 0.08], [-Math.PI / 2, 0, 0])); p.push(P('sph', '#ffd23f', [0, y + 0.08, 0.22], 0.36)); face(p, 0, y + 0.1, 0.38, 0.8, { noMouth: true, angry: true }); for (const s of [-1, 1]) { p.push(P('sph', '#e9f6ff', [s * 0.24, y + 0.3, -0.08], [0.26, 0.04, 0.18], [0, s * 0.3, s * 0.5])); p.push(seg([s * 0.06, y + 0.24, 0.3], [s * 0.12, y + 0.42, 0.36], 0.012, '#3b3449')); p.push(P('sphL', '#3b3449', [s * 0.12, y + 0.43, 0.36], 0.05)); p.push(seg([s * 0.1, y - 0.12, 0], [s * 0.14, y - 0.3, 0.04], 0.02, '#3b3449')); } return p; },
    g_rat: () => quad({ body: '#a9a2b8', belly: '#ddd7e8', muzzle: '#ddd7e8', nose: '#ff8fa8', ears: 'round', earR: 0.17, tail: 'none', w: 0.56, h: 0.5, len: 0.7, headR: 0.42, angry: true, eyeColor: '#d93a5b', extra: (p, k) => { for (let i = 0; i < 5; i++) p.push(P('sph', '#ffb3c6', [Math.sin(i) * 0.06, k.by - 0.02 + i * 0.02, -k.L * 0.5 - i * 0.1], 0.07)); for (const s of [-1, 1]) p.push(P('box', '#ffffff', [s * 0.03, k.hy - k.hr * 0.32, k.hz + k.hr * 0.45], [0.05, 0.08, 0.02])); for (const s of [-1, 1]) for (const d of [-1, 1]) p.push(seg([s * 0.1, k.hy - 0.06, k.hz + k.hr * 0.44], [s * 0.3, k.hy - 0.04 + d * 0.04, k.hz + k.hr * 0.4], 0.006, '#3b3449')); hat(p, 'crown', k.hy + k.hr * 0.18, '#fff', '#fff'); } }),
    g_gorilla: () => { const p = []; p.push(P('sph', '#5f5872', [0, 0.5, 0], [0.62, 0.62, 0.5])); p.push(P('sph', '#9d93b0', [0, 0.48, 0.13], [0.4, 0.42, 0.3])); for (const s of [-1, 1]) { p.push(seg([s * 0.3, 0.68, 0.02], [s * 0.42, 0.18, 0.12], 0.11, '#5f5872', 'sph')); p.push(P('sph', '#4a4458', [s * 0.42, 0.1, 0.14], [0.2, 0.15, 0.22])); p.push(P('cyl8', '#5f5872', [s * 0.14, 0.12, -0.02], [0.16, 0.22, 0.16])); } p.push(P('sph', '#5f5872', [0, 0.9, 0.06], [0.4, 0.38, 0.38])); p.push(P('sph', '#b9aecb', [0, 0.86, 0.2], [0.28, 0.24, 0.16])); face(p, 0, 0.92, 0.23, 0.85, { angry: true, noMouth: true }); p.push(P('box', '#3b3449', [0, 0.98, 0.21], [0.24, 0.035, 0.04])); hat(p, 'crown', 0.98, '#fff', '#fff'); return p; },
    g_goat: () => quad({ body: '#ffffff', belly: '#f2eee8', head: '#f6f0ea', muzzle: '#f6e6dc', nose: '#d99aa3', ears: 'point', earR: 0.08, tail: 'stub', angry: true, legH: 0.22, leg: '#e6dfd6', extra: (p, k) => { for (let i = 0; i < 10; i++) { const a = i * 1.7; p.push(P('sph', '#ffffff', [Math.sin(a) * 0.18, k.by + 0.1 + (i % 3) * 0.06, Math.cos(a) * 0.24], 0.2)); } for (const s of [-1, 1]) { p.push(P('tor', '#c9a77a', [s * 0.17, k.hy + 0.12, k.hz - 0.06], [0.2, 0.2, 0.26], [0, Math.PI / 2, 0])); } p.push(seg([0, k.hy - k.hr * 0.4, k.hz + 0.1], [0, k.hy - k.hr * 0.8, k.hz + 0.12], 0.04, '#f2eee8', 'cone')); hat(p, 'crown', k.hy + k.hr * 0.25, '#fff', '#fff'); } }),
  };

  // 산적: 사람 + 마스크/두건
  function banditParts(id) {
    const looks = {
      b_grunt: { main: '#8c7a62', trim: '#5f4f3c', hat: 'bandana', bandC: '#c4554f', w: 'club' },
      b_assassin: { main: '#3f3a52', trim: '#2a2638', hat: 'hood', hoodC: '#3f3a52', mask: true, w: 'dagger', w2: 'dagger' },
      b_blade: { main: '#a34a4a', trim: '#5f2f2f', hat: 'bandana', bandC: '#e0574f', w: 'longsword' },
      b_archer: { main: '#5d7a4c', trim: '#3d5232', hat: 'hood', hoodC: '#5d7a4c', w: 'bow', back: 'quiver' },
      b_boss: { main: '#6f3f5a', trim: '#3b2232', hat: 'bigHat', w: 'bigaxe', big: true },
    };
    if (id === 'b_rider') {
      let p = MON.boar(); grp(p, [0, 0, 0], [0, 0, 0], 1.25);
      const h = human({ main: '#8c6a4c', trim: '#5f4632', y: 0.46, noLegs: true });
      const rp = h.parts; hat(rp, 'bandana', h.HY, '#c4554f', '#c4554f'); weapon(rp, 'lance', h.Y + 0.29, 1, { flag: '#3b3449' });
      grp(rp, [0, 0.02, -0.08], [0, 0, 0], 0.82);
      return p.concat(rp);
    }
    const L = looks[id]; const h = human({ main: L.main, trim: L.trim, hair: L.hat === 'hood' ? false : undefined });
    const p = h.parts;
    hat(p, L.hat, h.HY, L.hoodC || L.bandC || L.main, L.trim);
    if (L.mask) hat(p, 'mask', h.HY, L.main, L.trim);
    weapon(p, L.w, h.Y + 0.29, 1, {}); if (L.w2) weapon(p, L.w2, h.Y + 0.29, -1, {}); if (L.back) back(p, L.back, h.Y);
    if (id === 'b_boss') { p.push(P('box', C.dark, [0.09, h.HY + 0.02, 0.23], [0.12, 0.1, 0.03])); p.push(P('box', C.dark, [0, h.HY + 0.06, 0.2], [0.5, 0.025, 0.02], [0, 0, 0.3])); grp(p, [0, 0, 0], [0, 0, 0], 1.25); }
    return p;
  }

  function monsterParts(id) { if (MON[id]) return MON[id](); return banditParts(id); }

  /* ── 건물·지형 소품 ────────────────────────────────────── */
  function castleParts(color, lv = 1) {
    const p = []; const dark = shade(color, 0.72);
    p.push(P('box', C.stone2, [0, 0.04, 0], [0.92, 0.08, 0.92]));
    for (const s of [-1, 1]) { p.push(P('box', C.stone, [0, 0.22, s * 0.38], [0.76, 0.3, 0.1])); p.push(P('box', C.stone, [s * 0.38, 0.22, 0], [0.1, 0.3, 0.76])); }
    for (let i = -3; i <= 3; i++) for (const s of [-1, 1]) { if (i % 2) continue; p.push(P('box', C.stone, [i * 0.1, 0.4, s * 0.38], [0.07, 0.07, 0.11])); p.push(P('box', C.stone, [s * 0.38, 0.4, i * 0.1], [0.11, 0.07, 0.07])); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p.push(P('cyl', '#f4efe4', [sx * 0.38, 0.3, sz * 0.38], [0.2, 0.52, 0.2])); p.push(P('cone', color, [sx * 0.38, 0.66, sz * 0.38], [0.27, 0.24, 0.27])); p.push(P('box', '#5a5070', [sx * 0.38, 0.38, sz * 0.38 + sz * 0.1], [0.04, 0.07, 0.02])); }
    const kh = 0.42 + Math.min(3, Math.floor(lv / 5)) * 0.08;
    p.push(P('box', '#faf6ee', [0, 0.08 + kh / 2, -0.02], [0.42, kh, 0.38]));
    p.push(P('cone4', color, [0, 0.08 + kh + 0.16, -0.02], [0.56, 0.34, 0.52], [0, Math.PI / 4, 0]));
    p.push(P('box', dark, [0, 0.08 + kh + 0.005, -0.02], [0.46, 0.04, 0.42]));
    for (const s of [-1, 1]) p.push(P('box', '#5a5070', [s * 0.1, 0.08 + kh * 0.62, 0.17], [0.06, 0.09, 0.02]));
    p.push(P('box', '#6a4a3a', [0, 0.16, 0.44], [0.16, 0.2, 0.03])); p.push(P('cyl', C.gold, [0, 0.26, 0.44], [0.17, 0.03, 0.03], [0, 0, Math.PI / 2]));
    p.push(seg([0, 0.08 + kh + 0.3, -0.02], [0, 0.08 + kh + 0.62, -0.02], 0.012, C.wood2));
    if (lv >= 10) for (const s of [-1, 1]) p.push(P('box', color, [s * 0.2, 0.28, 0.44], [0.08, 0.2, 0.01]));
    if (lv >= 15) for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(P('sph', C.gold, [sx * 0.38, 0.8, sz * 0.38], 0.06));
    return p;
  }
  function fortParts(color) {
    const p = [];
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const x = Math.sin(a) * 0.38, z = Math.cos(a) * 0.38; if (i === 0) continue; p.push(P('cyl8', C.wood, [x, 0.14, z], [0.09, 0.28, 0.09])); p.push(P('cone', C.wood, [x, 0.32, z], [0.09, 0.08, 0.09])); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(seg([sx * 0.13, 0, sz * 0.13], [sx * 0.11, 0.6, sz * 0.11], 0.025, C.wood2));
    p.push(P('box', C.wood, [0, 0.6, 0], [0.36, 0.05, 0.36])); for (const s of [-1, 1]) { p.push(P('box', C.wood2, [0, 0.66, s * 0.17], [0.36, 0.08, 0.02])); p.push(P('box', C.wood2, [s * 0.17, 0.66, 0], [0.02, 0.08, 0.36])); }
    p.push(P('cone4', color, [0, 0.84, 0], [0.5, 0.26, 0.5], [0, Math.PI / 4, 0]));
    p.push(seg([0, 0.95, 0], [0, 1.2, 0], 0.01, C.wood2));
    return p;
  }
  function ruinParts() {
    const p = []; const st = '#dcd3ea', st2 = '#b9aed0';
    p.push(P('cyl8', st2, [0, 0.05, 0], [0.92, 0.1, 0.92])); p.push(P('cyl8', st, [0, 0.12, 0], [0.78, 0.06, 0.78]));
    const hs = [0.62, 0.3, 0.55, 0.18, 0.66, 0.4];
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; const x = Math.sin(a) * 0.3, z = Math.cos(a) * 0.3; p.push(P('cyl8', st, [x, 0.15 + hs[i] / 2, z], [0.1, hs[i], 0.1])); if (hs[i] > 0.5) p.push(P('box', st2, [x, 0.17 + hs[i], z], [0.15, 0.04, 0.15])); if (i % 2 === 0) p.push(P('sphL', '#7ccf6a', [x + 0.04, 0.2 + hs[i] * 0.4, z + 0.04], [0.08, 0.12, 0.06])); }
    p.push(seg([-0.15, 0.2, -0.12], [0.18, 0.2, 0.05], 0.05, st, 'cyl8'));
    p.push(P('box', st2, [0, 0.83, 0.15], [0.48, 0.05, 0.1], [0, 0.6, 0]));
    return p;
  }
  function tentParts() { const p = []; p.push(P('cone6', '#e6c896', [0, 0.22, 0], [0.56, 0.46, 0.56])); p.push(P('cone6', '#c4554f', [0, 0.3, 0], [0.4, 0.3, 0.4])); p.push(P('box', '#3b3449', [0, 0.1, 0.2], [0.12, 0.18, 0.06])); p.push(seg([0, 0.4, 0], [0, 0.62, 0], 0.01, C.wood2)); p.push(P('box', '#c4554f', [0.06, 0.58, 0], [0.12, 0.07, 0.01])); for (let i = 0; i < 3; i++) p.push(seg([0.32 + i * 0.03, 0.02, 0.2], [0.42 - i * 0.03, 0.06, 0.32], 0.02, C.wood2)); p.push(P('cone6', '#ff9a3c', [0.37, 0.1, 0.26], [0.1, 0.16, 0.1])); p.push(P('cone6', '#ffd23f', [0.37, 0.08, 0.26], [0.06, 0.1, 0.06])); return p; }
  function wheatParts(scare) {
    const p = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const x = (i - 1) * 0.2 + (j % 2) * 0.04, z = (j - 1) * 0.2; p.push(seg([x, 0, z], [x, 0.22, z], 0.012, '#a5c24e')); p.push(P('sph', '#ffd25e', [x, 0.26, z], [0.06, 0.13, 0.06])); p.push(P('sph', '#ffd25e', [x + 0.05, 0.2, z], [0.04, 0.08, 0.04], [0, 0, -0.5])); }
    if (scare) { p.push(seg([0.32, 0, 0.32], [0.32, 0.42, 0.32], 0.015, C.wood2)); p.push(seg([0.2, 0.32, 0.32], [0.44, 0.32, 0.32], 0.012, C.wood2)); p.push(P('sph', '#f3e2bd', [0.32, 0.46, 0.32], 0.12)); p.push(P('cone', '#e0b04a', [0.32, 0.55, 0.32], [0.2, 0.08, 0.2])); p.push(P('sph', '#ff7d8f', [0.32, 0.3, 0.33], [0.14, 0.12, 0.1])); }
    return p;
  }
  function logParts() { const p = []; const lg = (x, y, z) => { p.push(P('cyl8', C.wood2, [x, y, z], [0.12, 0.42, 0.12], [0, 0, Math.PI / 2])); for (const s of [-1, 1]) p.push(P('cyl8', '#f1d6a8', [x + s * 0.212, y, z], [0.1, 0.01, 0.1], [0, 0, Math.PI / 2])); }; lg(0, 0.06, -0.06); lg(0, 0.06, 0.07); lg(0, 0.16, 0.005); p.push(P('cyl8', C.wood, [0.28, 0.06, 0.25], [0.18, 0.12, 0.18])); p.push(P('cyl8', '#f1d6a8', [0.28, 0.125, 0.25], [0.15, 0.01, 0.15])); p.push(seg([0.28, 0.13, 0.25], [0.2, 0.32, 0.25], 0.012, C.wood2)); p.push(P('box', C.steel, [0.2, 0.3, 0.25], [0.04, 0.08, 0.1])); return p; }
  function mineParts() { const p = []; p.push(P('ico1', '#9a93a8', [0, 0.12, -0.12], [0.62, 0.38, 0.46])); p.push(P('box', '#2b2533', [0, 0.11, 0.1], [0.16, 0.2, 0.06])); p.push(P('box', C.wood, [0, 0.23, 0.12], [0.24, 0.04, 0.05])); for (const s of [-1, 1]) p.push(P('box', C.wood, [s * 0.1, 0.11, 0.12], [0.04, 0.22, 0.05])); p.push(P('box', '#8d8a99', [0.24, 0.09, 0.27], [0.16, 0.08, 0.12])); for (const s of [-1, 1]) for (const d of [-1, 1]) p.push(P('cyl8', C.dark, [0.24 + s * 0.07, 0.04, 0.27 + d * 0.05], [0.05, 0.02, 0.05], [0, 0, Math.PI / 2])); p.push(P('oct', '#7fd6ff', [0.21, 0.15, 0.27], 0.07)); p.push(P('oct', C.gold, [0.27, 0.15, 0.26], 0.06)); return p; }
  function rockParts() { return [P('dodec', '#ffffff', [0, 0.1, 0], [0.34, 0.24, 0.3], [0.2, 0.4, 0])]; }
  function trunkParts() { return [P('cyl5', C.wood2, [0, 0.14, 0], [0.09, 0.3, 0.09])]; }
  function canopyRound() { return [P('ico1', '#ffffff', [0, 0.44, 0], [0.5, 0.46, 0.5]), P('ico', '#ffffff', [0.1, 0.64, 0.04], [0.3, 0.28, 0.3])]; }
  function canopyPine() { return [P('cone6', '#ffffff', [0, 0.34, 0], [0.48, 0.34, 0.48]), P('cone6', '#ffffff', [0, 0.52, 0], [0.38, 0.3, 0.38]), P('cone6', '#ffffff', [0, 0.68, 0], [0.26, 0.26, 0.26])]; }
  function pineSnow() { return [P('cone6', '#ffffff', [0, 0.75, 0], [0.18, 0.13, 0.18]), P('cone6', '#ffffff', [0, 0.58, 0], [0.3, 0.1, 0.3])]; }
  function flowerParts(c) { const p = [seg([0, 0, 0], [0, 0.1, 0], 0.01, '#58b860', 'cyl5')]; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; p.push(P('oct', c, [Math.sin(a) * 0.04, 0.11, Math.cos(a) * 0.04], [0.06, 0.04, 0.06])); } p.push(P('oct', '#ffd23f', [0, 0.12, 0], 0.045)); return p; }
  function grassParts() { const p = []; for (let i = 0; i < 3; i++) p.push(P('cone4', '#5dbb52', [(i - 1) * 0.035, 0.05, (i % 2) * 0.02], [0.04, 0.12, 0.03], [0, 0, (i - 1) * 0.35])); return p; }
  function cloudParts() { const p = []; const pts = [[0, 0, 0, 1], [0.6, -0.1, 0.1, 0.75], [-0.6, -0.12, 0, 0.7], [0.25, 0.25, -0.1, 0.7], [-0.25, 0.2, 0.15, 0.65]]; for (const [x, y, z, s] of pts) p.push(P('ico1', '#ffffff', [x, y, z], s)); return p; }
  function flagParts(color) { return [P('box', color, [0.11, 0, 0], [0.22, 0.14, 0.012]), P('box', shade(color, 0.8), [0.11, -0.04, 0.001], [0.22, 0.025, 0.013])]; }
  function crystalParts() { return [P('oct', '#ffffff', [0, 0, 0], [0.22, 0.36, 0.22])]; }
  function arrowParts(tip) { return [seg([0, 0, -0.25], [0, 0, 0.2], 0.012, C.wood), P('cone', tip || C.steel, [0, 0, 0.25], [0.05, 0.1, 0.05], [Math.PI / 2, 0, 0]), P('cone4', '#ffffff', [0, 0, -0.24], [0.08, 0.1, 0.01], [-Math.PI / 2, 0, 0])]; }
  function starParts() { const p = []; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; p.push(P('cone4', '#ffffff', [Math.sin(a) * 0.12, Math.cos(a) * 0.12, 0], [0.12, 0.2, 0.05], [0, 0, -a])); } p.push(P('sphL', '#ffffff', [0, 0, 0], 0.16)); return p; }

  /* ── 둥근 타일 블록 (윗면 밝게, 옆면 어둡게 — 인스턴스 색과 곱해진다) ── */
  let tileG = null;
  function tileGeo() {
    if (tileG) return tileG;
    const s = 0.41, r = 0.12, sh = new THREE.Shape();
    sh.moveTo(-s + r, -s); sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r); sh.lineTo(s, s - r); sh.quadraticCurveTo(s, s, s - r, s);
    sh.lineTo(-s + r, s); sh.quadraticCurveTo(-s, s, -s, s - r); sh.lineTo(-s, -s + r); sh.quadraticCurveTo(-s, -s, -s + r, -s);
    let g = new THREE.ExtrudeGeometry(sh, { depth: 1, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 3 });
    g.rotateX(-Math.PI / 2); g.translate(0, -0.06, 0);
    if (g.index) g = g.toNonIndexed();
    const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const ny = nor.getY(i), y = pos.getY(i); const k = ny > 0.55 ? 1 : 0.62 + 0.26 * Math.max(0, Math.min(1, (y + 0.06) / 1.0)); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); g.computeBoundingSphere();
    tileG = g; return g;
  }

  /* ── 공개 API ─────────────────────────────────────────── */
  return {
    C, shade, mix, bake, P, seg, grp, tileGeo,
    unit: (typeId, main, trim, hero) => get(`u:${typeId}:${main}:${trim || ''}:${hero ? (typeof hero === 'string' ? hero : 1) : 0}`, () => unitParts(typeId, main, trim || shade(main, 0.72), hero)),
    monster: (id) => get('m:' + id, () => monsterParts(id)),
    monsterLOD: (id) => get('mL:' + id, () => monsterParts(id), { lod: true }),
    unitLOD: (typeId, main, trim) => get(`uL:${typeId}:${main}`, () => unitParts(typeId, main, trim || shade(main, 0.72), false), { lod: true }),
    castle: (color, lv) => get(`castle:${color}:${Math.min(3, Math.floor(lv / 5))}`, () => castleParts(color, lv)),
    fort: (color) => get('fort:' + color, () => fortParts(color)),
    wall: (color) => get('wall:' + color, () => { const p = castleParts(color, 1); return grp(p, [0, 0, 0], [0, 0, 0], 1.1); }),
    ruin: () => get('ruin', ruinParts),
    tent: () => get('tent', tentParts, { lod: true }),
    wheat: (sc) => get('wheat' + (sc ? 'S' : ''), () => wheatParts(sc), { lod: true }),
    logs: () => get('logs', logParts, { lod: true }),
    mine: () => get('mine', mineParts, { lod: true }),
    rock: () => get('rock', rockParts),
    trunk: () => get('trunk', trunkParts),
    canopyRound: () => get('canR', canopyRound),
    canopyPine: () => get('canP', canopyPine),
    pineSnow: () => get('pineSnow', pineSnow),
    flower: (c) => get('flower' + c, () => flowerParts(c)),
    grass: () => get('grass', grassParts),
    cloud: () => get('cloud', cloudParts),
    flag: (c) => get('flag' + c, () => flagParts(c)),
    crystal: () => get('crystal', crystalParts),
    arrow: (tip) => get('arrow' + (tip || ''), () => arrowParts(tip)),
    star: () => get('star', starParts),
    stone: () => get('stoneball', () => [P('ico', '#9a95a6', [0, 0, 0], 0.22)]),
  };
})();

/* ── 재질 ─────────────────────────────────────────────────── */
const MAT3 = typeof THREE === 'undefined' ? null : (() => {
  const grad = new THREE.DataTexture(new Uint8Array([120, 120, 120, 178, 178, 178, 222, 222, 222, 255, 255, 255]), 4, 1, THREE.RGBFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
  const time = { value: 0 };
  function toon(extra = {}) { return new THREE.MeshToonMaterial(Object.assign({ vertexColors: true, gradientMap: grad }, extra)); }
  // 인스턴스마다 위치 기반 위상으로 통통 뛰는 재질 (몬스터)
  function bobbing() {
    const m = toon();
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
          float b = abs(sin(uTime * 2.6 + ph));
          transformed.y = transformed.y * (1.0 + (b - 0.5) * 0.08) + b * 0.07;
          transformed.xz *= 1.0 - (b - 0.5) * 0.04;
        #endif`);
    };
    return m;
  }
  // 바람에 흔들리는 나무
  function swaying() {
    const m = toon();
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = time;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 1.3;
          float k = max(0.0, transformed.y - 0.15);
          transformed.x += sin(uTime * 1.6 + ph) * 0.05 * k;
          transformed.z += cos(uTime * 1.3 + ph) * 0.03 * k;
        #endif`);
    };
    return m;
  }
  // 윤곽선 (법선 방향으로 부풀린 뒷면)
  function outline(thick = 0.022, color = '#3a2f4d') {
    return new THREE.ShaderMaterial({
      uniforms: { thickness: { value: thick }, color: { value: new THREE.Color(color) }, opacity: { value: 1 } },
      vertexShader: `uniform float thickness; void main(){ vec3 p = position + normal * thickness; vec4 mv = vec4(p, 1.0);
        #ifdef USE_INSTANCING
          mv = instanceMatrix * mv;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; uniform float opacity; void main(){ gl_FragColor = vec4(color, opacity); }`,
      side: THREE.BackSide, transparent: false,
    });
  }
  return { grad, time, toon, bobbing, swaying, outline, shared: { toon: null } };
})();
