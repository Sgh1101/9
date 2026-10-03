/* ============================================================
   초상화 — 3D 모델을 작은 이미지로 구워 패널·팝업에 쓴다.
   비동기로 하나씩 만들어 UI가 멈추지 않게 하고, WebGL이 없으면 2D 스프라이트로 대체.
   키 형식: "u:<병종>:<색>[:h]" · "m:<몬스터>" · "b:<castle|fort|ruin|tent>:<색>"
   ============================================================ */
'use strict';

const Portrait = (() => {
  const cache = {}; const queue = []; let busy = false;
  let r = null, scene, cam, mesh, ol, tried = false;
  const SIZE = 144;

  function setup() {
    if (tried) return !!r; tried = true;
    if (typeof THREE === 'undefined') return false;
    try {
      const c = document.createElement('canvas'); c.width = c.height = SIZE;
      r = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: true, preserveDrawingBuffer: true });
      if (!r.getContext()) { r = null; return false; }
      r.setPixelRatio(1); r.setSize(SIZE, SIZE, false); r.setClearColor(0x000000, 0);
      scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#f4fbff', '#a6c98a', 0.6));
      const d = new THREE.DirectionalLight('#fff3dc', 0.7); d.position.set(2, 4, 3); scene.add(d);
      cam = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
      mesh = new THREE.Mesh(new THREE.BufferGeometry(), MAT3.toon()); ol = new THREE.Mesh(new THREE.BufferGeometry(), MAT3.outline(0.02)); scene.add(mesh); scene.add(ol);
      return true;
    } catch (e) { r = null; return false; }
  }
  function geoOf(key) {
    const [k, a, b, h] = key.split(':');
    if (k === 'u') return MDL.unit(a, b, MDL.shade(b, 0.72), h === 'h');
    if (k === 'h') return MDL.unit(HEROES[a].unit, b, MDL.shade(b, 0.72), heroCape(a));
    if (k === 'm') return MDL.monster(a);
    if (k === 'b') { if (a === 'castle') return MDL.castle(b, 1); if (a === 'fort') return MDL.fort(b); if (a === 'ruin') return MDL.ruin(); if (a === 'tent') return MDL.tent(); }
    return null;
  }
  function render(key) {
    const geo = geoOf(key); if (!geo) return '';
    mesh.geometry = geo; ol.geometry = geo; ol.visible = key[0] !== 'b';
    const bs = geo.boundingSphere; const dist = bs.radius / Math.sin(14 * Math.PI / 180) * 0.98;
    cam.position.set(bs.center.x + dist * 0.42, bs.center.y + dist * 0.3, bs.center.z + dist * 0.86); cam.lookAt(bs.center.x, bs.center.y - bs.radius * 0.04, bs.center.z);
    r.render(scene, cam);
    return r.domElement.toDataURL('image/png');
  }
  function sprite2d(key) {
    const [k, a] = key.split(':');
    let name = 'spear';
    if (k === 'u') name = UNITS[a] ? UNITS[a].cls : 'spear'; else if (k === 'h') name = UNITS[HEROES[a].unit].cls; else if (k === 'm') name = monsterSprite(a); else name = a === 'ruin' ? 'ruin' : a === 'fort' || a === 'tent' ? 'fort' : 'capital';
    const c = typeof sprite === 'function' ? sprite(name, 48) : null; return c ? c.toDataURL() : '';
  }
  function pump() {
    if (busy) return; busy = true;
    const step = () => {
      const job = queue.shift(); if (!job) { busy = false; return; }
      if (!cache[job]) cache[job] = setup() ? render(job) : sprite2d(job);
      document.querySelectorAll(`img[data-pk="${CSS.escape(job)}"]`).forEach(img => { img.src = cache[job]; img.classList.add('ready'); });
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
  }
  // 패널 HTML 안에 넣는 <img>. 이미 있으면 바로, 없으면 대기열에 넣는다.
  function img(key, cls = '') {
    const src = cache[key];
    if (!src && !queue.includes(key)) { queue.push(key); pump(); }
    return `<img class="pt ${cls} ${src ? 'ready' : ''}" data-pk="${key}" alt="" ${src ? `src="${src}"` : ''}>`;
  }
  function unit(typeId, color, hero, cls) { return img(`u:${typeId}:${color || '#ffc23d'}${hero ? ':h' : ''}`, cls); }
  function monster(id, cls) { return img('m:' + id, cls); }
  function hero(hid, color, cls) { return img(`h:${hid}:${color || '#ffc23d'}`, cls); }
  function building(kind, color, cls) { return img(`b:${kind}:${color || '#ffc23d'}`, cls); }
  function warm(keys) { for (const k of keys) if (!cache[k] && !queue.includes(k)) queue.push(k); pump(); }
  return { img, unit, monster, hero, building, warm, get(key) { return cache[key]; } };
})();
