/* ============================================================
   월드 — 타일맵, 경제, 건설/모집/훈련 타이머, 행군, AI 세력, 계절, 승리 조건, 저장
   ============================================================ */
'use strict';

const FACTION_DEFS = [
  { id: 'P',  name: '나의 연맹',  color: '#ffc23d', dark: '#e08a12' },
  { id: 'F1', name: '북방 연맹',  color: '#4fb0ff', dark: '#2a7fd0' },
  { id: 'F2', name: '동부 연맹',  color: '#ff6f7d', dark: '#d94457' },
  { id: 'F3', name: '남부 연맹',  color: '#3fd08f', dark: '#20a066' },
];

let G = null; // 전역 게임 상태

/* 유틸 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const keyOf = (x, y) => x + ',' + y;
function fmt(n) { n = Math.floor(n); return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n); }
function timeStr(min) { const d = Math.floor(min / 1440) + 1, h = Math.floor(min % 1440 / 60), m = Math.floor(min % 60); return `${d}일차 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
function durStr(min) { min = Math.ceil(min); if (min < 60) return min + '분'; const h = Math.floor(min / 60); return h + '시간 ' + (min % 60) + '분'; }

// 간단 노이즈
function makeNoise(seed) {
  let s = seed >>> 0; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const N = 16, g = []; for (let i = 0; i < N * N; i++) g.push(r());
  return (x, y) => { const fx = x / 3.6, fy = y / 3.6, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const v = (i, j) => g[((i % N + N) % N) + ((j % N + N) % N) * N];
    const sm = (t) => t * t * (3 - 2 * t);
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sm(tx), b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sm(tx);
    return a + (b - a) * sm(ty); };
}

/* ── 새 게임 ─────────────────────────────────────────────── */
function newGame() {
  const N = CONST.MAP;
  const seed = Math.floor(Math.random() * 1e9);
  const noise = makeNoise(seed), noise2 = makeNoise(seed ^ 0x9e3779b9);
  G = {
    seed, time: 8 * 60, speed: 1, paused: false, started: Date.now(), lastReal: Date.now(),
    map: [], N, log: [], toasts: [], over: null,
    factions: {}, armies: [], nextId: 1, pendingBattles: [], stats: { battles: 0, wins: 0, kills: 0, lost: 0 },
    settings: { autoReturn: true, anim: true },
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = noise(x, y), n2 = noise2(x, y);
    const type = n < 0.36 ? 'forest' : n > 0.64 ? 'hill' : 'plain';
    G.map.push({ x, y, type, lv: 1, owner: null, monsters: null, protect: 0, deco: Math.floor(n2 * 7), ruin: 0, fort: null, giant: null, giantRef: null });
  }
  // 세력 거점
  const caps = { P: [7, 20], F1: [20, 6], F2: [33, 20], F3: [20, 33] };
  for (const f of FACTION_DEFS) {
    G.factions[f.id] = { id: f.id, name: f.name, color: f.color, dark: f.dark, cap: caps[f.id], alive: true, power: 1, tiles: 0, lastExpand: 0, lastAttack: 0, score: 0, capHp: CONST.CAP_HP, capMax: CONST.CAP_HP };
  }
  const distCap = (x, y) => Math.min(...Object.values(caps).map(c => Math.max(Math.abs(c[0] - x), Math.abs(c[1] - y))));
  for (const t of G.map) {
    const d = distCap(t.x, t.y);
    t.lv = d <= 3 ? 1 : d <= 6 ? 2 : d <= 9 ? 3 : d <= 13 ? 4 : 5;
    if (t.lv >= 2 && Math.random() < 0.08) t.lv = Math.min(5, t.lv + 1);
    t.monsters = genMonsters(t.lv);
  }
  // 거점 주변 3칸: 평야·숲·구릉이 고르게 섞이도록 보정
  for (const f of FACTION_DEFS) {
    const [cx, cy] = caps[f.id]; const ring = [];
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) { if (!dx && !dy) continue; const t = tileAt(cx + dx, cy + dy); if (t) ring.push(t); }
    shuffle(ring); const kinds = ['plain', 'forest', 'hill'];
    ring.forEach((t, i) => { if (i < ring.length * 0.75) t.type = kinds[i % 3]; });
  }
  // 거점 설정
  for (const f of FACTION_DEFS) {
    const [cx, cy] = caps[f.id]; const t = tileAt(cx, cy);
    t.type = 'capital'; t.owner = f.id; t.monsters = null; t.lv = 1;
    G.factions[f.id].tiles = 1;
    if (f.id !== 'P') for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = tileAt(cx + dx, cy + dy); n.owner = f.id; n.monsters = null; G.factions[f.id].tiles++; }
  }
  // 거대 야수 (Lv3 자원지, 3×3)
  const giantSpots = [[8, 8], [32, 8], [32, 32], [8, 32]];
  giantSpots.forEach((s, i) => {
    const [gx, gy] = s; const id = GIANTS[i % 3];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const t = tileAt(gx + dx, gy + dy); t.giantRef = [gx, gy]; t.monsters = null; t.lv = 3; }
    const c = tileAt(gx, gy); c.giant = { id, scale: 1, items: [randomItem(pick(EQUIP_ORDER)), randomItem(pick(EQUIP_ORDER))] };
  });
  // 유적
  const ruinSpots = [[20, 20], [13, 13], [27, 13], [27, 27], [13, 27]];
  for (const [rx, ry] of ruinSpots) { const t = tileAt(rx, ry); if (t.giantRef) continue; t.type = 'ruin'; t.ruin = 1; t.lv = 4; t.monsters = genMonsters(4, true); }
  // 플레이어
  G.player = {
    res: { food: 600, wood: 400, stone: 250 }, scroll: 0, frags: {}, cap: 3000,
    buildings: { capital: 1, barracks: 1, warehouse: 1 }, buildQueue: [],
    soldiers: [], recruitQueue: [], trainQueue: [], craftQueue: [], items: [], heroes: {},
    equipPool: shuffle([...EQUIP_ORDER]).slice(0, 8), policy: 'none', hospital: [],
    territory: 1, usage: {}, nextSoldier: 1, dailyClaimed: -1, special: {}, capHp: CONST.CAP_HP,
  };
  for (let i = 0; i < 2; i++) addSoldier('spear_long', 1);
  addLog('1에이커에서 시작합니다. 주변 황야를 점령해 영토를 넓히세요.', 'sys');
  return G;
}
function srand(seed) { let t = seed >>> 0; return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function tileAt(x, y) { if (x < 0 || y < 0 || x >= G.N || y >= G.N) return null; return G.map[y * G.N + x]; }
function neighbors(x, y) { const out = []; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (!dx && !dy) continue; const t = tileAt(x + dx, y + dy); if (t) out.push(t); } return out; }

function genMonsters(lv, ruin = false) {
  const scale = 1 + (lv - 1) * 0.55;
  const list = [];
  if (lv >= 4 || ruin) {
    const n = lv + (ruin ? 2 : 0);
    for (let i = 0; i < n; i++) list.push({ id: pick(lv >= 5 ? BANDITS : BANDITS.slice(0, 5)), scale: scale * 0.9 });
    if (lv >= 5 || ruin) list.push({ id: 'b_boss', scale: scale * 0.8 });
    return list;
  }
  const pool = lv === 1 ? ['boar', 'wolf', 'boar', 'hornet'] : lv === 2 ? ['wolf', 'cheetah', 'skunk', 'hedgehog', 'boar', 'bison'] : ['tiger', 'lion', 'bison', 'bear', 'elephant', 'lizard', 'skunk'];
  const n = lv === 1 ? 1 + (Math.random() < 0.4 ? 1 : 0) : lv + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) list.push({ id: pick(pool), scale });
  return list;
}

/* ── 로그/알림 ──────────────────────────────────────────── */
function addLog(text, kind = 'info') { G.log.unshift({ t: G.time, text, kind }); if (G.log.length > 120) G.log.pop(); if (kind !== 'info') toast(text, kind); }
function toast(text, kind) { G.toasts.push({ text, kind, until: Date.now() + 3500 }); }

/* ── 병사 ──────────────────────────────────────────────── */
function addSoldier(typeId, lv = 1) { const s = { id: G.player.nextSoldier++, type: typeId, lv, hero: null, weapon: null, armor: null, special: null, army: null }; G.player.soldiers.push(s); return s; }
function soldierById(id) { return G.player.soldiers.find(s => s.id === id); }
function soldierName(s) { const t = UNITS[s.type]; return `${t.name} Lv${s.lv}${s.hero ? ' ·' + HEROES[s.hero.heroId].name : ''}`; }
function maxSoldierLv() { const b = G.player.buildings.barracks || 0; return b >= 20 ? 6 : b >= 15 ? 5 : b >= 10 ? 4 : b >= 5 ? 3 : 2; }
function usageCoeff(typeId) { const n = G.player.soldiers.filter(s => s.type === typeId).length + G.player.recruitQueue.filter(q => q.type === typeId).length; return clamp(1 + Math.max(0, n - 4) * 0.12, 1, 2.2); }
function recruitCost(typeId) { const c = UNITS[typeId].cost, k = usageCoeff(typeId); const out = {}; for (const r in c) out[r] = Math.round(c[r] * k); return out; }
function recruitTime(typeId) { const t = UNITS[typeId]; return Math.round((t.cls === 'siege' ? 14 : t.cls === 'cav' ? 8 : 5) * usageCoeff(typeId)); }
function canAfford(cost) { return Object.keys(cost).every(r => (G.player.res[r] || 0) >= cost[r]); }
function pay(cost) { for (const r in cost) G.player.res[r] -= cost[r]; }
function costStr(c) { return Object.keys(c).map(r => `${RES_NAME[r]} ${fmt(c[r])}`).join(' · '); }
const RES_NAME = { food: '식량', wood: '목재', stone: '석재' };

function unitAvailable(typeId) {
  const t = UNITS[typeId]; const b = G.player.buildings;
  if (t.cls === 'cav') return (b.stable || 0) >= t.unlock;
  if (t.cls === 'siege') return (b.factory || 0) >= t.unlock;
  return (b.barracks || 0) >= t.unlock;
}
function recruit(typeId) {
  if (!unitAvailable(typeId)) return '건물 레벨이 부족합니다.';
  const cost = recruitCost(typeId); if (!canAfford(cost)) return '자원이 부족합니다.';
  if (G.player.recruitQueue.length >= 5) return '모집 대기열이 가득 찼습니다.';
  pay(cost); G.player.recruitQueue.push({ type: typeId, remain: recruitTime(typeId), total: recruitTime(typeId) }); return null;
}
function trainCost(s) { return { food: Math.round(50 * Math.pow(s.lv, 1.6) + 30), stone: Math.round(12 * Math.pow(s.lv, 1.6)) }; }
function trainTime(s) { return Math.max(2, Math.round(s.lv * 8 * (1 - 0.03 * (G.player.buildings.ground || 0)))); }
function train(s) {
  if (UNITS[s.type].cls === 'siege') return '병기는 훈련할 수 없습니다.';
  if (!G.player.buildings.ground) return '연병장이 필요합니다.';
  if (s.lv >= maxSoldierLv()) return `군영 레벨이 부족합니다 (현재 최대 Lv${maxSoldierLv()}).`;
  if (s.army) return '출전 중인 병사는 훈련할 수 없습니다.';
  if (G.player.trainQueue.find(q => q.sid === s.id)) return '이미 훈련 중입니다.';
  const c = trainCost(s); if (!canAfford(c)) return '자원이 부족합니다.';
  pay(c); G.player.trainQueue.push({ sid: s.id, remain: trainTime(s), total: trainTime(s) }); return null;
}
function returnItems(s) { for (const k of ['weapon', 'armor', 'special']) if (s[k]) { G.player.items.push(s[k]); s[k] = null; } }
function dismiss(s) { if (s.army) return '출전 중'; G.player.soldiers = G.player.soldiers.filter(x => x !== s); returnItems(s); if (s.type === 'siege_bal' && G.player.recruitQueue.length) G.player.recruitQueue[0].remain = 0; return null; }

/* ── 건물 ──────────────────────────────────────────────── */
function buildCost(id) { const lv = (G.player.buildings[id] || 0) + 1; return BUILDINGS[id].cost(lv); }
function buildTime(id) { const lv = (G.player.buildings[id] || 0) + 1; return BUILDINGS[id].time(lv) * 3; }
function build(id) {
  const b = BUILDINGS[id]; const cur = G.player.buildings[id] || 0; const cap = G.player.buildings.capital;
  if (cur >= b.max) return '최대 레벨입니다.';
  if (id !== 'capital' && cur + 1 > cap) return '거점 레벨을 넘을 수 없습니다.';
  if (b.req && cap < b.req) return `거점 Lv${b.req} 필요`;
  if (G.player.buildQueue.length >= 2) return '건설 대기열(2)이 가득 찼습니다.';
  if (G.player.buildQueue.find(q => q.id === id)) return '이미 건설 중입니다.';
  const c = buildCost(id); if (!canAfford(c)) return '자원이 부족합니다.';
  pay(c); G.player.buildQueue.push({ id, remain: buildTime(id), total: buildTime(id) }); return null;
}
function storageCap() { return 3000 + Math.round(1500 * Math.pow(G.player.buildings.warehouse || 0, 1.4)) + 400 * G.player.buildings.capital; }
function territoryCap() { return 8 + G.player.buildings.capital * 6; }
function armyCap() { return Math.min(24, 3 + G.player.buildings.capital); }
function maxArmies() { return 1 + Math.floor(G.player.buildings.capital / 5); }

/* ── 경제 ──────────────────────────────────────────────── */
function season() { const d = Math.floor(G.time / CONST.MINUTES_PER_DAY); return SEASONS[Math.min(3, Math.floor(d / CONST.DAYS_PER_SEASON))]; }
function hourOf() { return Math.floor(G.time % 1440 / 60); }
function pvpOpen(fid) { if (fid && G.factions[fid] && !G.factions[fid].alive) return true; const h = hourOf(); return h >= CONST.PVP_START && h < CONST.PVP_END; }
function production() {
  const s = season(); const out = { food: 60, wood: 45, stone: 35 };
  for (const t of G.map) if (t.owner === 'P' && t.type !== 'capital') {
    const p = tileProduction(t.lv);
    if (t.type === 'plain') out.food += p; else if (t.type === 'forest') out.wood += p; else if (t.type === 'hill') out.stone += p; else if (t.type === 'ruin') { out.food += p * 0.4; out.wood += p * 0.4; out.stone += p * 0.4; }
  }
  out.food *= s.food * (G.player.policy === 'harvest' ? 1.2 : 1); out.wood *= s.mat; out.stone *= s.mat;
  out.upkeep = G.player.soldiers.reduce((a, so) => a + UNITS[so.type].food, 0) + G.player.hospital.length * 1;
  out.foodNet = out.food - out.upkeep;
  return out;
}

/* ── 영웅 초상화 ────────────────────────────────────────── */
function heroState(hid) { return G.player.heroes[hid] || null; }
function rollHero(hid, gradeIdx) {
  const h = HEROES[hid]; const q = clamp((gradeIdx - 1) / 7 + (Math.random() * 0.1 - 0.05), 0, 1);
  const r = HERO_RANGES[hid] || [0, 0];
  const st = { grade: gradeIdx, fails: 0, hp: Math.round(lerpRange(h.hp, q)), atk: Math.round(lerpRange(h.atk, q)), v1: Math.round(lerpRange(r, q)), talent: null };
  const tier = gradeIdx >= 7 ? 'high' : gradeIdx >= 5 ? 'mid' : gradeIdx >= 3 ? 'basic' : null;
  if (tier) st.talent = pick(TALENTS[tier]).id;
  return st;
}
function unlockHero(hid) {
  const h = HEROES[hid]; const need = HERO_UNLOCK_COST; const have = G.player.frags[h.unit] || 0;
  if (G.player.heroes[hid]) return '이미 보유 중';
  if ((G.player.buildings.hall || 0) < 1) return '영웅전당이 필요합니다.';
  if (have < need) return `${UNITS[h.unit].name} 잔편 ${need}개 필요 (보유 ${have})`;
  G.player.frags[h.unit] -= need;
  // 해제 전 → 표 0행
  const g = drawGrade(0); G.player.heroes[hid] = rollHero(hid, g);
  addLog(`${h.name} 초상화 해제! ${GRADES[g]}`, 'good'); return null;
}
function drawGrade(cur, st) {
  const rows = GRADE_TABLE[cur]; if (!rows) return cur;
  // 천장
  if (st && st.fails >= GRADE_PITY[cur]) { st.fails = 0; return cur + 1; }
  const r = Math.random() * 100;
  // 누적 확률(높은 등급부터)
  let acc = 0; const sorted = [...rows].sort((a, b) => b[0] - a[0]);
  for (const [g, p] of sorted) { acc += p; if (r < acc) { if (st) st.fails = 0; return g; } }
  if (st) st.fails++;
  return cur === 0 ? 1 : cur; // 해제 전은 실패해도 7급
}
function rerollHero(hid) {
  const st = G.player.heroes[hid]; const h = HEROES[hid];
  if (!st) return '보유하지 않은 영웅';
  if (st.grade >= 8) return '이미 운명 등급입니다.';
  const have = G.player.frags[h.unit] || 0; if (have < REROLL_COST) return `${UNITS[h.unit].name} 잔편 ${REROLL_COST}개 필요 (보유 ${have})`;
  G.player.frags[h.unit] -= REROLL_COST;
  const before = st.grade; const g = drawGrade(st.grade, st);
  const fails = st.fails; const nst = rollHero(hid, Math.max(g, before)); nst.fails = fails; nst.grade = Math.max(g, before);
  // 재그리기 시 재능도 랜덤으로 바뀜 (등급 유지 시에도)
  G.player.heroes[hid] = nst;
  // 공봉된 병사에도 반영
  for (const s of G.player.soldiers) if (s.hero && s.hero.heroId === hid) s.hero = heroAttach(hid);
  if (nst.grade > before) { addLog(`${h.name} ${GRADES[before]} → ${GRADES[nst.grade]} 승급!`, 'good'); return null; }
  return `등급 유지 (${GRADES[before]}). 재능이 다시 굴려졌습니다. 천장 ${fails}/${GRADE_PITY[before]}`;
}
function heroAttach(hid) { const st = G.player.heroes[hid]; return { heroId: hid, name: HEROES[hid].name, hp: st.hp, atk: st.atk, v1: st.v1, talent: st.talent, grade: st.grade }; }
function assignHero(s, hid) {
  if (hid === null) { s.hero = null; return null; }
  const h = HEROES[hid]; if (h.unit !== s.type) return `${h.name}은(는) ${UNITS[h.unit].name}에게만 공봉할 수 있습니다.`;
  if (!G.player.heroes[hid]) return '보유하지 않은 영웅';
  const other = G.player.soldiers.find(x => x.hero && x.hero.heroId === hid); if (other && other !== s) other.hero = null;
  s.hero = heroAttach(hid); return null;
}

/* ── 장비 ──────────────────────────────────────────────── */
function randomItem(id) { const e = EQUIPMENT[id]; const it = { uid: Math.random().toString(36).slice(2, 8), id, name: e.name, slot: e.slot }; if (e.hp) it.hp = irnd(e.hp[0], e.hp[1]); if (e.atk) it.atk = irnd(e.atk[0], e.atk[1]); if (e.v) it.v = irnd(e.v[0], e.v[1]); return it; }
function itemDesc(it) { const e = EQUIPMENT[it.id]; let d = e.desc.replace('{v}', it.v); const st = []; if (it.hp) st.push('HP +' + it.hp); if (it.atk) st.push('공격 +' + it.atk); return (st.length ? st.join(', ') + '. ' : '') + d; }
function craftCost(id) { const lv = EQUIPMENT[id].lv; return { wood: 40 + lv * 15, stone: 70 + lv * 35 }; }
function craft(id) {
  const e = EQUIPMENT[id]; if (!G.player.equipPool.includes(id)) return '이번 대전의 장비 효과 풀에 없습니다.';
  if ((G.player.buildings.smithy || 0) < e.lv) return `대장간 Lv${e.lv} 필요`;
  if (G.player.craftQueue.length >= 3) return '제작 대기열이 가득 찼습니다.';
  const c = craftCost(id); if (!canAfford(c)) return '자원이 부족합니다.';
  pay(c); G.player.craftQueue.push({ id, remain: 4 + e.lv, total: 4 + e.lv }); return null;
}
function craftSpecial(typeId) {
  const sp = SPECIAL_EQUIP[typeId]; if (!sp) return '해당 병종의 전용 장비 데이터가 공개되어 있지 않습니다.';
  const sm = G.player.buildings.smithy || 0; const have = G.player.items.filter(i => i.special === typeId).length + G.player.soldiers.filter(s => s.special && s.special.special === typeId).length;
  if (sm < 10) return '대장간 Lv10 필요'; if (have >= 1 && sm < 18) return '두 번째 전용 장비는 대장간 Lv18 필요'; if (have >= 2) return '전용 장비는 병종당 2개까지';
  const c = { wood: 600, stone: 600 }; if (!canAfford(c)) return '자원이 부족합니다.';
  pay(c); const it = { uid: Math.random().toString(36).slice(2, 8), id: 'special', special: typeId, name: sp.name, slot: 'special', hp: irnd(sp.hp[0], sp.hp[1]), atk: irnd(sp.atk[0], sp.atk[1]), desc: sp.desc };
  G.player.items.push(it); return null;
}
function equip(s, it) {
  if (it.slot === 'special') { if (it.special !== s.type) return '다른 병종의 전용 장비'; if (s.special) G.player.items.push(s.special); s.special = it; }
  else if (it.slot === 'weapon') { if (UNITS[s.type].cls === 'siege' && it.id === 'heal_sword') return '병기는 치료검을 쓸 수 없습니다.'; if (s.weapon) G.player.items.push(s.weapon); s.weapon = it; }
  else { if (s.armor) G.player.items.push(s.armor); s.armor = it; }
  G.player.items = G.player.items.filter(x => x !== it); return null;
}
function unequip(s, slot) { const it = s[slot]; if (!it) return; s[slot] = null; G.player.items.push(it); }

/* ── 부대 / 행군 ────────────────────────────────────────── */
function armySpeed(ids) { let sp = 999; for (const id of ids) { const s = soldierById(id); if (s) sp = Math.min(sp, CLASS_INFO[UNITS[s.type].cls].speed); } if (G.player.policy === 'horn') sp *= 1.25; return sp === 999 ? 62 : sp; }
function originFor(x, y) {
  // 거점 또는 가장 가까운 자기 요새
  let best = G.factions.P.cap, bd = 1e9;
  for (const t of G.map) if (t.owner === 'P' && (t.type === 'capital' || t.fort === 'P')) { const d = Math.max(Math.abs(t.x - x), Math.abs(t.y - y)); if (d < bd) { bd = d; best = [t.x, t.y]; } }
  return best;
}
function canTarget(t) {
  if (!t) return '없는 타일';
  if (t.owner === 'P' && t.type === 'capital') return '거점은 대기 중인 병사가 자동으로 지켜요.';
  if (t.owner === 'P') return null; // 주둔
  const adj = neighbors(t.x, t.y).some(n => n.owner === 'P') || G.map.some(f => f.owner === 'P' && f.fort === 'P' && Math.max(Math.abs(f.x - t.x), Math.abs(f.y - t.y)) <= 3);
  if (giantOf(t)) { const c = giantOf(t); const adjG = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const n of neighbors(c.x + dx, c.y + dy)) if (n.owner === 'P') adjG.push(n);
    if (!adjG.length) return '영토와 인접하지 않은 타일입니다.'; return null; }
  if (!adj) return '영토와 인접하지 않은 타일입니다. (요새 3칸 이내는 가능)';
  if (t.owner && t.owner !== 'P' && !pvpOpen(t.owner)) return `적 영지는 ${CONST.PVP_START}:00~${CONST.PVP_END}:00에만 공격할 수 있습니다.`;
  if (t.owner && t.owner !== 'P' && t.protect > G.time) return `점령 보호 중 (${durStr(t.protect - G.time)} 남음)`;
  if (!t.owner && G.player.territory >= territoryCap()) return `영토 상한(${territoryCap()})에 도달했습니다. 거점을 올리세요.`;
  return null;
}
function sendArmy(ids, tx, ty, stay) {
  const t = tileAt(tx, ty); const err = canTarget(t); if (err) return err;
  if (!ids.length) return '병사를 선택하세요.'; if (ids.length > armyCap()) return `부대 최대 인원은 ${armyCap()}명입니다.`;
  if (G.armies.filter(a => a.owner === 'P').length >= maxArmies()) return `동시 출전 부대 수 ${maxArmies()} 초과`;
  for (const id of ids) { const s = soldierById(id); if (!s || s.army) return '이미 출전 중인 병사가 있습니다.'; if (G.player.trainQueue.find(q => q.sid === id)) return '훈련 중인 병사가 있습니다.'; }
  const [ox, oy] = originFor(tx, ty); const dist = Math.max(Math.abs(tx - ox), Math.abs(ty - oy)) || 1;
  const a = { id: G.nextId++, owner: 'P', units: [...ids], from: [ox, oy], to: [tx, ty], dist, progress: 0, speed: armySpeed(ids), state: 'march', stay: !!stay, x: ox, y: oy };
  for (const id of ids) soldierById(id).army = a.id;
  G.armies.push(a); addLog(`부대가 (${tx},${ty})로 출발. 도착까지 ${durStr(dist / a.speed * 60)}`, 'info'); return null;
}
function recallArmy(a) { if (a.state === 'wait') { a.state = 'return'; a.from = [...a.to]; a.to = originFor(a.x, a.y); a.dist = Math.max(Math.abs(a.to[0] - a.from[0]), Math.abs(a.to[1] - a.from[1])) || 1; a.progress = 0; } }
function disbandArmy(a) { for (const id of a.units) { const s = soldierById(id); if (s) s.army = null; } G.armies = G.armies.filter(x => x !== a); }

function soldierSpec(s) { return { uid: 's' + s.id, soldierId: s.id, typeId: s.type, lv: s.lv, hero: s.hero, weapon: s.weapon, armor: s.armor, special: s.special }; }
function giantOf(t) { if (!t.giantRef) return null; const c = tileAt(t.giantRef[0], t.giantRef[1]); return c && c.giant ? c : null; }
function playerWall(t) {
  const cl = G.player.buildings.capital;
  if (t.type === 'capital') return { isBuilding: true, name: '거점 성벽', hp: 400 + 220 * cl, atk: 8 + 4 * cl, range: 3 };
  if (t.fort === 'P') return { isBuilding: true, name: '요새', hp: 300 + 120 * cl, atk: 6 + 3 * cl, range: 3 };
  return null;
}
function tileDefenders(t) {
  // 수비군 spec 배열과 설명
  if (t.owner === 'P') {
    const st = G.armies.find(a => a.owner === 'P' && a.state === 'wait' && a.x === t.x && a.y === t.y);
    const specs = t.type === 'capital' ? G.player.soldiers.filter(s => !s.army).map(soldierSpec) : st ? st.units.map(id => soldierSpec(soldierById(id))) : [];
    const wall = playerWall(t); if (wall) specs.push(wall);
    return { specs, label: t.type === 'capital' ? '거점 수비군' : st ? '주둔 부대' : t.fort ? '요새 수비' : '수비 없음', army: st };
  }
  if (t.owner) return { specs: factionGarrison(t.owner, t), label: `${G.factions[t.owner].name} 수비군` };
  const g = giantOf(t);
  if (g) return { specs: [{ monsterId: g.giant.id, scale: g.giant.scale * season().monster, giantItems: g.giant.items }], label: MONSTERS[g.giant.id].name, giant: g };
  if (t.monsters && t.monsters.length) return { specs: t.monsters.map(m => ({ monsterId: m.id, scale: m.scale * season().monster })), label: t.monsters.map(m => MONSTERS[m.id].name).join(', ') };
  return { specs: [], label: '비어 있음' };
}
const FACTION_ROSTER = ['spear_long', 'shield_sword', 'bow_long', 'spear_pike', 'cav_sword', 'spear_ge', 'cav_spear', 'bow_cross', 'shield_spear', 'shield_heavy', 'spear_sword', 'bow_hunter', 'cav_glaive', 'shield_hammer', 'bow_heavy', 'spear_dual'];
function factionGarrison(fid, t, attack) {
  const f = G.factions[fid]; const day = G.time / 1440;
  const isCap = t.type === 'capital';
  // 같은 타일·같은 6시간 구간에서는 같은 구성이 나오도록 고정 (예측 = 실제)
  const rnd = srand((t.x || 0) * 7919 + (t.y || 0) * 104729 + fid.charCodeAt(fid.length - 1) * 31 + Math.floor(G.time / 360) * 1013 + (attack ? 77 : 0) + G.seed);
  const n = clamp(Math.round(3 + day * 2 + ((t.lv || 1) - 1) * 0.8 + (isCap ? 4 : 0) + (t.ruin ? 2 : 0)), 3, 18);
  const lv = clamp(1 + Math.floor(day * 1.1) + (isCap ? 1 : 0), 1, 6);
  const mul = 1 + day * 0.04;
  const pool = FACTION_ROSTER.slice(0, Math.min(FACTION_ROSTER.length, 4 + Math.floor(day * 3)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const ty = pool[Math.floor(rnd() * pool.length)];
    const sp = { typeId: ty, lv, hpMul: mul, atkMul: mul };
    if (day >= 1.5 && rnd() < 0.35) { const id = EQUIP_ORDER[Math.floor(rnd() * 12)]; const e = EQUIPMENT[id]; const it = { id, name: e.name, slot: e.slot }; if (e.hp) it.hp = Math.round(lerpRange(e.hp, 0.5)); if (e.atk) it.atk = Math.round(lerpRange(e.atk, 0.5)); if (e.v) it.v = Math.round(lerpRange(e.v, 0.5)); sp[e.slot] = it; }
    if (day >= 2.5 && i === 0) { const hs = HERO_ORDER.filter(h => HEROES[h].unit === ty); if (hs.length) { const hid = hs[Math.floor(rnd() * hs.length)]; const H = HEROES[hid]; const q = 0.4; sp.hero = { heroId: hid, name: H.name, hp: Math.round(lerpRange(H.hp, q)), atk: Math.round(lerpRange(H.atk, q)), v1: Math.round(lerpRange(HERO_RANGES[hid] || [0, 0], q)), talent: null, grade: 4 }; } }
    out.push(sp);
  }
  if (!attack && isCap) out.push({ isBuilding: true, name: '거점 성벽', hp: Math.round(500 + 350 * day), atk: Math.round(12 + 6 * day), range: 3 });
  if (!attack && t.fort) out.push({ isBuilding: true, name: '요새', hp: Math.round(350 + 200 * day), atk: Math.round(10 + 4 * day), range: 3 });
  return out;
}

/* 도착 처리 */
function arrive(a) {
  const t = tileAt(a.to[0], a.to[1]);
  if (a.owner !== 'P') return;
  if (t.owner === 'P') { a.state = 'wait'; a.x = t.x; a.y = t.y; addLog(`부대가 (${t.x},${t.y})에 주둔했습니다.`, 'info'); return; }
  const def = tileDefenders(t);
  const err = (t.owner && t.owner !== 'P' && !pvpOpen(t.owner)) ? 'PvP 시간이 아닙니다' : (t.owner && t.protect > G.time) ? '점령 보호 중입니다' : (!t.owner && !giantOf(t) && G.player.territory >= territoryCap()) ? `영토 상한(${territoryCap()})에 도달했습니다` : null;
  if (err) { addLog(`(${t.x},${t.y}) 공격 취소: ${err}`, 'warn'); returnHome(a); return; }
  if (!def.specs.length) { captureTile(t, 'P'); addLog(`(${t.x},${t.y}) 무혈 점령`, 'good'); afterBattleReturn(a, t); return; }
  const atk = a.units.map(id => soldierSpec(soldierById(id)));
  const foeOwner = t.owner || null;
  const reward0 = { lv: t.lv, ruin: !!t.ruin, giant: !!def.giant, types: a.units.map(id => soldierById(id).type) };
  const res = quickBattle(atk, def.specs, { policy: G.player.policy, capitalLv: G.player.buildings.capital });
  G.stats.battles++;
  applyLosses(a, res);
  if (res.winner === 'A') {
    G.stats.wins++;
    const reward = rewardFor(reward0);
    if (def.giant) { const c = def.giant; c.giant = null; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) captureTile(tileAt(c.x + dx, c.y + dy), 'P'); addLog(`거대 야수 ${def.label} 처치! 자원지 9칸 확보`, 'good'); }
    else {
      const wasCap = t.type === 'capital' && t.owner && t.owner !== 'P';
      const prevOwner = t.owner;
      if (wasCap && --G.factions[prevOwner].capHp > 0) {
        addLog(`${G.factions[prevOwner].name} 거점 성벽 돌파! 내구 ${G.factions[prevOwner].capHp}/${G.factions[prevOwner].capMax} — ${reward}`, 'good');
      } else {
        captureTile(t, 'P');
        if (wasCap) eliminateFaction(prevOwner);
        addLog(`(${t.x},${t.y}) 점령 성공! ${reward}`, 'good');
      }
    }
  } else {
    G.stats.lost++;
    addLog(`(${t.x},${t.y}) 공격 실패 (${res.winner === 'draw' ? '턴 초과 철수' : '전멸'})`, 'bad');
  }
  G.pendingBattles.push({ res, tile: [t.x, t.y], label: def.label, attacker: 'P', time: G.time, terrain: t.type, foe: foeOwner });
  afterBattleReturn(a, t, res.winner === 'A');
}
function afterBattleReturn(a, t, won) {
  a.units = a.units.filter(id => soldierById(id));
  if (!a.units.length) { disbandArmy(a); return; }
  if (won !== false && a.stay && t.owner === 'P') { a.state = 'wait'; a.x = t.x; a.y = t.y; a.to = [t.x, t.y]; return; }
  returnHome(a);
}
function returnHome(a) { a.state = 'return'; a.from = [a.to[0], a.to[1]]; a.x = a.from[0]; a.y = a.from[1]; a.to = originFor(a.from[0], a.from[1]); a.dist = Math.max(Math.abs(a.to[0] - a.from[0]), Math.abs(a.to[1] - a.from[1])) || 1; a.progress = 0; }
function applyLosses(a, res) {
  const hp = G.player.buildings.hospital || 0; const p = hp ? 0.3 + 0.05 * hp : 0;
  for (const u of res.units) if (u.side === 'A' && u.soldierId && !u.alive) {
    const s = soldierById(u.soldierId); if (!s) continue;
    G.player.soldiers = G.player.soldiers.filter(x => x !== s); s.army = null;
    if (Math.random() < p) { G.player.hospital.push({ soldier: s, remain: 30 }); addLog(`${soldierName(s)} 입원 (30분 후 복귀)`, 'info'); }
    else { for (const k of ['weapon', 'armor', 'special']) if (s[k]) G.player.items.push(s[k]); G.stats.kills++; }
  }
  for (const u of res.units) if (u.side === 'A' && u.soldierId && u.alive) { const s = soldierById(u.soldierId); if (s && u.kills > 0 && s.lv < maxSoldierLv() && Math.random() < 0.08 * u.kills && UNITS[s.type].cls !== 'siege') { s.lv++; addLog(`${UNITS[s.type].name}이(가) 전투 경험으로 Lv${s.lv}이 되었다`, 'info'); } }
}
function rewardFor(r) {
  const lv = r.lv; const types = r.types.filter(x => UNITS[x].cls !== 'siege'); const ft = types.length ? pick(types) : pick(UNIT_ORDER.filter(u => unitAvailable(u)));
  const n = 2 + lv * 2 + (r.ruin ? 6 : 0) + (r.giant ? 12 : 0);
  G.player.frags[ft] = (G.player.frags[ft] || 0) + n; G.player.scroll += lv;
  const res = { food: 40 * lv, wood: 30 * lv, stone: 20 * lv }; for (const k in res) G.player.res[k] += res[k];
  return `${UNITS[ft].name} 잔편 +${n}, 두루마리 +${lv}`;
}
function captureTile(t, fid) {
  const prev = t.owner;
  if (prev && G.factions[prev]) G.factions[prev].tiles--;
  if (prev === 'P') G.player.territory--;
  t.owner = fid; t.monsters = null; t.protect = G.time + CONST.PROTECT_MIN; if (t.fort && t.fort !== fid) t.fort = fid;
  if (t.ruin && prev && prev !== fid) t.ruin = Math.max(1, t.ruin - 3);
  if (fid === 'P') G.player.territory++; if (G.factions[fid]) G.factions[fid].tiles++;
  // 주둔 부대 퇴각
  if (prev === 'P') { const st = G.armies.find(a => a.owner === 'P' && a.state === 'wait' && a.x === t.x && a.y === t.y); if (st) returnHome(st); }
}
function eliminateFaction(fid) {
  const f = G.factions[fid]; f.alive = false; let n = 0;
  for (const t of G.map) if (t.owner === fid) { captureTile(t, 'P'); n++; }
  addLog(`${f.name} 맹주 거점 함락! 영지 ${n}칸이 넘어왔습니다.`, 'good');
}

/* 요새 / 유적 */
function buildFort(t) {
  if (t.owner !== 'P' || t.type !== 'plain' && t.type !== 'forest' && t.type !== 'hill') return '자기 영토의 일반 타일에만 지을 수 있습니다.';
  const n = G.map.filter(x => x.fort === 'P').length; const max = Math.floor(G.player.buildings.capital / 4);
  if (n >= max) return `요새 수 상한 (${max}). 거점 Lv4마다 +1`;
  const c = { wood: 500, stone: 700 }; if (!canAfford(c)) return '자원이 부족합니다.';
  pay(c); t.fort = 'P'; addLog(`(${t.x},${t.y})에 요새 건설. 3칸 이내 출전 가능`, 'good'); return null;
}
function ruinCost(t) { return { wood: 100 * t.ruin + 100, stone: 100 * t.ruin + 100, food: 60 * t.ruin }; }
function upgradeRuin(t) {
  if (t.owner !== 'P' || !t.ruin) return '보유한 유적이 아닙니다.';
  if (t.ruin >= CONST.RUIN_WIN_LV) return '최대 레벨';
  const c = ruinCost(t); if (!canAfford(c)) return '자원이 부족합니다. ' + costStr(c);
  pay(c); t.ruin++; addLog(`유적 (${t.x},${t.y}) Lv${t.ruin}`, 'good'); checkVictory(); return null;
}

/* ── AI 세력 ───────────────────────────────────────────── */
function aiGoals(f, day) {
  // 유적 + (0.6일 이후) 플레이어 영토 — 플레이어 쪽은 가중치를 더 준다
  const goals = G.map.filter(t => t.ruin && t.owner !== f.id).map(t => ({ x: t.x, y: t.y, w: 1 }));
  if (day >= 0.6) { const c = G.factions.P.cap; goals.push({ x: c[0], y: c[1], w: day >= 1 ? 0.55 : 0.8 }); }
  return goals;
}
function aiTick() {
  const day = G.time / 1440;
  for (const f of Object.values(G.factions)) {
    if (f.id === 'P' || !f.alive) continue;
    f.power = 1 + day * 0.6 + f.tiles * 0.02;
    // 확장: 20분마다, 목표(유적·플레이어)를 향해
    if (G.time - f.lastExpand >= 22 && f.tiles < 10 + day * 18) {
      f.lastExpand = G.time;
      const allow = 1 + Math.floor(day * 1.4);
      const seen = new Set(); const cands = [];
      for (const t of G.map) if (t.owner === f.id) for (const n of neighbors(t.x, t.y)) { const k = n.x * 100 + n.y; if (seen.has(k)) continue; seen.add(k); if (!n.owner && !n.giantRef && n.lv <= allow) cands.push(n); }
      if (cands.length && Math.random() < 0.85) {
        const goals = aiGoals(f, day);
        let best = null, bs = 1e9;
        for (const c of cands) { let d = 60; for (const g of goals) d = Math.min(d, Math.max(Math.abs(g.x - c.x), Math.abs(g.y - c.y)) * g.w); const sc = d + Math.random() * 3; if (sc < bs) { bs = sc; best = c; } }
        if (best.ruin) best.ruin = 1;
        captureTile(best, f.id);
      }
      // 거대 야수
      if (day > 1.6 && Math.random() < 0.06) { const g = G.map.find(t => t.giant && [-2, -1, 0, 1, 2].some(dx => [-2, -1, 0, 1, 2].some(dy => { const n = tileAt(t.x + dx, t.y + dy); return n && n.owner === f.id; }))); if (g) { g.giant = null; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const n = tileAt(g.x + dx, g.y + dy); if (!n.owner) captureTile(n, f.id); } } }
    }
    // 유적 성장: 4시간마다 60% (하루 약 3.6레벨)
    if (G.time % 240 === 0) for (const t of G.map) if (t.owner === f.id && t.ruin && t.ruin < CONST.RUIN_WIN_LV && Math.random() < 0.6) t.ruin++;
    // 플레이어 공격 (PvP 시간, 하룻밤 최대 3회)
    const night = Math.floor((G.time - CONST.PVP_START * 60) / 1440);
    if (f.night !== night) { f.night = night; f.attacks = 0; }
    if (pvpOpen() && day >= 1 && f.attacks < 3 && G.time - f.lastAttack >= 40) {
      f.lastAttack = G.time;
      const border = G.map.filter(t => t.owner === 'P' && t.protect <= G.time && neighbors(t.x, t.y).some(n => n.owner === f.id));
      if (border.length && Math.random() < 0.55) {
        f.attacks++;
        border.sort((a, b) => (b.ruin ? 2 : 0) - (a.ruin ? 2 : 0) || Math.random() - 0.5);
        aiAttack(f, border[0]);
      }
    }
    // 세력 간 전쟁 (간략)
    if (pvpOpen() && Math.random() < 0.02) { const others = Object.values(G.factions).filter(o => o.id !== 'P' && o.id !== f.id && o.alive); const o = pick(others); if (o) { const b = G.map.filter(t => t.owner === o.id && t.type !== 'capital' && neighbors(t.x, t.y).some(n => n.owner === f.id)); if (b.length && f.power > o.power * 0.9) captureTile(pick(b), f.id); } }
  }
  checkVictory();
}
function aiAttack(f, t) {
  // 가까운 자기 영토(2~6칸 떨어진 곳)에서 부대가 출발해 행군해 온다
  let best = null, bd = 99;
  for (const o of G.map) if (o.owner === f.id) { const d = Math.max(Math.abs(o.x - t.x), Math.abs(o.y - t.y)); const sc = Math.abs(d - 4); if (sc < bd) { bd = sc; best = o; } }
  if (!best) return;
  const specs = factionGarrison(f.id, { x: t.x, y: t.y, lv: 3, type: 'plain' }, true);
  const dist = Math.max(Math.abs(best.x - t.x), Math.abs(best.y - t.y)) || 1;
  G.armies.push({ id: G.nextId++, owner: f.id, units: [], specs, from: [best.x, best.y], to: [t.x, t.y], dist, progress: 0, speed: 48, state: 'march', x: best.x, y: best.y });
  addLog(`${f.name} 부대 ${specs.length}기가 (${t.x},${t.y})로 진군 중! 약 ${durStr(dist / 48 * 60)} 후 도착`, 'warn');
}
function aiArrive(a) {
  G.armies = G.armies.filter(x => x !== a);
  const f = G.factions[a.owner]; const t = tileAt(a.to[0], a.to[1]);
  if (!f || !f.alive || !t || t.owner !== 'P') return;
  if (!pvpOpen()) { addLog(`${f.name} 부대가 PvP 시간이 끝나 물러갔습니다.`, 'info'); return; }
  const def = tileDefenders(t);
  if (!def.specs.length) { captureTile(t, f.id); addLog(`${f.name}이(가) 무방비 영지 (${t.x},${t.y})를 점령했습니다!`, 'bad'); return; }
  const res = quickBattle(a.specs, def.specs, { policy: G.player.policy, defenderIsPlayer: true, capitalLv: G.player.buildings.capital });
  G.stats.battles++;
  // 수비 손실
  const hp = G.player.buildings.hospital || 0; const p = hp ? 0.3 + 0.05 * hp : 0;
  for (const u of res.units) if (u.side === 'D' && u.soldierId && !u.alive) { const s = soldierById(u.soldierId); if (!s) continue; G.player.soldiers = G.player.soldiers.filter(x => x !== s); if (s.army) { const ar = G.armies.find(x => x.id === s.army); if (ar) ar.units = ar.units.filter(id => id !== s.id); } if (Math.random() < p) G.player.hospital.push({ soldier: s, remain: 30 }); else { returnItems(s); G.stats.kills++; } }
  G.armies = G.armies.filter(x => x.owner !== 'P' || x.units.length);
  G.pendingBattles.push({ res, tile: [t.x, t.y], label: f.name + ' 침공', attacker: f.id, time: G.time, defense: true, terrain: t.type });
  if (res.winner === 'A') {
    if (t.type === 'capital') { G.player.capHp--; if (G.player.capHp > 0) { addLog(`${f.name}의 침공으로 거점 성벽 손상! 내구 ${G.player.capHp}/${CONST.CAP_HP}`, 'bad'); } else { captureTile(t, f.id); addLog(`${f.name}에게 거점이 함락되었습니다!`, 'bad'); checkDefeat(true); } }
    else { captureTile(t, f.id); addLog(`${f.name}의 침공 — (${t.x},${t.y}) 함락!`, 'bad'); }
  } else { G.stats.wins++; addLog(`${f.name}의 침공을 (${t.x},${t.y})에서 막아냈습니다.`, 'good'); }
}

/* ── 승리 / 패배 ────────────────────────────────────────── */
function scoreOf(fid) { let s = 0; for (const t of G.map) if (t.owner === fid) { s += 1; if (t.ruin) s += t.ruin * 3; } return s; }
function checkVictory() {
  if (G.over || G.overAck) return;
  for (const fid of Object.keys(G.factions)) {
    const ruins = G.map.filter(t => t.owner === fid && t.ruin);
    if (ruins.some(r => r.ruin >= CONST.RUIN_WIN_LV) || ruins.filter(r => r.ruin >= CONST.RUIN_WIN_COUNT_LV).length >= CONST.RUIN_WIN_COUNT) { endGame(fid === 'P' ? 'win' : 'lose', fid === 'P' ? '유적 승리! 유적 조건을 먼저 달성했습니다.' : `${G.factions[fid].name}이(가) 유적 조건을 먼저 달성했습니다.`); return; }
  }
  if (Object.values(G.factions).filter(f => f.id !== 'P' && f.alive).length === 0) endGame('win', '최후 혈전 승리! 모든 맹주 거점을 함락했습니다.');
}
function checkDefeat(capFallen) { if (G.over || G.overAck) return; if (capFallen || tileAt(...G.factions.P.cap).owner !== 'P') endGame('lose', '거점이 함락되었습니다.'); }
function endGame(result, reason) {
  if (G.overAck) return;
  const ranks = Object.values(G.factions).map(f => ({ name: f.name, score: scoreOf(f.id), id: f.id })).sort((a, b) => b.score - a.score);
  G.over = { result, reason, ranks, time: G.time }; G.paused = true;
  addLog(reason, result === 'win' ? 'good' : 'bad');
}

/* ── 틱 ────────────────────────────────────────────────── */
function tick(minutes) {
  if (G.over) return;
  const P = G.player;
  for (let m = 0; m < minutes; m++) {
    if (G.over) break;
    G.time++;
    const prod = production();
    P.res.food += prod.foodNet / 60; P.res.wood += prod.wood / 60; P.res.stone += prod.stone / 60;
    const cap = storageCap(); for (const r of ['food', 'wood', 'stone']) P.res[r] = clamp(P.res[r], 0, cap);
    if (P.res.food <= 0 && prod.foodNet < 0 && G.time % 30 === 0) { const s = P.soldiers.filter(x => !x.army)[0]; if (s) { P.soldiers = P.soldiers.filter(x => x !== s); addLog(`식량 고갈! ${soldierName(s)}이(가) 탈영했습니다.`, 'bad'); } }
    // 건설
    if (P.buildQueue.length) { const q = P.buildQueue[0]; q.remain--; if (q.remain <= 0) { P.buildQueue.shift(); P.buildings[q.id] = (P.buildings[q.id] || 0) + 1; addLog(`${BUILDINGS[q.id].name} Lv${P.buildings[q.id]} 완성`, 'good'); } }
    // 모집
    if (P.recruitQueue.length) { const q = P.recruitQueue[0]; q.remain--; if (q.remain <= 0) { P.recruitQueue.shift(); addSoldier(q.type, 1); addLog(`${UNITS[q.type].name} 모집 완료`, 'info'); } }
    // 훈련
    while (P.trainQueue.length && !soldierById(P.trainQueue[0].sid)) P.trainQueue.shift();
    if (P.trainQueue.length) { const q = P.trainQueue[0]; q.remain--; if (q.remain <= 0) { P.trainQueue.shift(); const s = soldierById(q.sid); if (s) { s.lv++; addLog(`${UNITS[s.type].name} Lv${s.lv} 훈련 완료`, 'info'); } } }
    // 제작
    if (P.craftQueue.length) { const q = P.craftQueue[0]; q.remain--; if (q.remain <= 0) { P.craftQueue.shift(); const it = randomItem(q.id); P.items.push(it); addLog(`${it.name} 제작 완료`, 'info'); } }
    // 병원
    for (const h of [...P.hospital]) { h.remain--; if (h.remain <= 0) { P.hospital = P.hospital.filter(x => x !== h); h.soldier.army = null; if (h.soldier.hero && P.soldiers.some(x => x.hero && x.hero.heroId === h.soldier.hero.heroId)) h.soldier.hero = null; P.soldiers.push(h.soldier); addLog(`${soldierName(h.soldier)} 퇴원`, 'info'); } }
    // 행군
    for (const a of [...G.armies]) {
      if (a.state === 'march' || a.state === 'return') {
        a.progress += a.speed / 60; const f = clamp(a.progress / a.dist, 0, 1);
        a.x = a.from[0] + (a.to[0] - a.from[0]) * f; a.y = a.from[1] + (a.to[1] - a.from[1]) * f;
        if (a.progress >= a.dist) { if (a.state === 'march') { if (a.owner === 'P') arrive(a); else aiArrive(a); } else { for (const id of a.units) { const s = soldierById(id); if (s) s.army = null; } G.armies = G.armies.filter(x => x !== a); } }
      }
    }
    // 거점 내구 회복
    if (G.time % CONST.CAP_REGEN === 0) { if (P.capHp < CONST.CAP_HP) P.capHp++; for (const f of Object.values(G.factions)) if (f.capHp < f.capMax) f.capHp++; }
    // AI
    if (G.time % 5 === 0) aiTick();
    // 일일 보상
    const day = Math.floor(G.time / 1440); if (P.dailyClaimed < day) { P.dailyClaimed = day; if (day > 0) { const cnt = {}; for (const so of P.soldiers) if (UNITS[so.type].cls !== 'siege') cnt[so.type] = (cnt[so.type] || 0) + 1; const ft = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || 'spear_long'; P.frags[ft] = (P.frags[ft] || 0) + 10; addLog(`${day + 1}일차 — ${season().name}. 일일 보상: ${UNITS[ft].name} 잔편 +10`, 'good'); } if (day >= 4) { endGame(scoreOf('P') >= Math.max(...Object.keys(G.factions).filter(f => f !== 'P').map(scoreOf)) ? 'win' : 'lose', '겨울이 끝나 결산합니다.'); break; } }
  }
}

/* ── 저장 ──────────────────────────────────────────────── */
const SAVE_KEY = 'acres9_save_v1';
const SAVE_SKIP = { pendingBattles: 1, toasts: 1 };
function serialize() { return JSON.stringify(G, (k, v) => SAVE_SKIP[k] ? undefined : v); }
function saveGame() { try { localStorage.setItem(SAVE_KEY, serialize()); return true; } catch (e) { return false; } }
// 이전 버전 저장에 없던 값을 채운다
function migrate(o) {
  if (o.player.capHp == null || Number.isNaN(o.player.capHp)) o.player.capHp = CONST.CAP_HP;
  for (const f of Object.values(o.factions)) { if (f.capMax == null) f.capMax = CONST.CAP_HP; if (f.capHp == null || Number.isNaN(f.capHp)) f.capHp = f.capMax; }
  o.toasts = []; o.pendingBattles = []; o.lastReal = Date.now();
  return o;
}
function loadGame() { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return false; const o = JSON.parse(s); if (!o.map || !o.player || !o.factions) return false; G = migrate(o); return true; } catch (e) { return false; } }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
function exportSave() { return btoa(unescape(encodeURIComponent(serialize()))); }
function importSave(str) { try { const o = JSON.parse(decodeURIComponent(escape(atob(str.trim())))); if (!o.map || !o.player || !o.factions) return false; G = migrate(o); return true; } catch (e) { return false; } }
