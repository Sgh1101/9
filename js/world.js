/* ============================================================
   월드 v3 — 300×300(9만 에이커)
   지형은 시드로 계산해 타입 배열에 두고, 칸 객체는 필요할 때만 만든다.
   바뀐 칸(주인·요새·유적 레벨)만 저장하고, 세력별 소유 칸 목록으로 계산한다.
   'P'는 언제나 "나"다. 온라인 월드에서는 다른 플레이어가 자기 id로 세력이 된다.
   ============================================================ */
'use strict';

const AI_DEFS = [
  { name: '북방 연맹', color: '#4fb0ff', dark: '#2a7fd0' }, { name: '동부 연맹', color: '#ff6f7d', dark: '#d94457' },
  { name: '남부 연맹', color: '#3fd08f', dark: '#20a066' }, { name: '서해 연맹', color: '#a77bff', dark: '#7a50d6' },
  { name: '산악 연맹', color: '#ff9a3c', dark: '#d9741a' }, { name: '초원 연맹', color: '#2ec4c4', dark: '#1d9a9a' },
  { name: '호수 연맹', color: '#ff7fc8', dark: '#d4539f' }, { name: '사막 연맹', color: '#8d99ff', dark: '#5d6ad9' },
];
const ME_COLOR = { color: '#ffc23d', dark: '#e08a12' };
const TYPES = ['plain', 'forest', 'hill', 'capital', 'ruin'];

let G = null;          // 저장되는 게임 상태
let TER = null;        // 지형 배열 (시드로 다시 만든다)
let TILES = null;      // 칸 객체 캐시
let OWNED = {};        // 세력 → Set(칸 번호)
let FORTS = {};        // 세력 → Set(칸 번호)

/* ── 유틸 ──────────────────────────────────────────────── */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function fmt(n) { n = Math.floor(n); return n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(n); }
function timeStr(min) { const d = Math.floor(min / 1440) + 1, h = Math.floor(min % 1440 / 60), m = Math.floor(min % 60); return `${d}일차 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
function durStr(min) { min = Math.ceil(min); if (min < 60) return min + '분'; const h = Math.floor(min / 60); return h + '시간 ' + (min % 60) + '분'; }
function srand(seed) { let t = seed >>> 0; return () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(a, rnd = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function chebXY(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }
function isMP() { return G && G.mode === 'mp'; }
function net() { return typeof NET !== 'undefined' && isMP() ? NET : null; }

// 값 노이즈 (주기를 맵보다 길게)
function makeNoise(seed, scale, size = 64) {
  const r = srand(seed); const g = new Float32Array(size * size); for (let i = 0; i < g.length; i++) g[i] = r();
  const sm = (t) => t * t * (3 - 2 * t);
  return (x, y) => { const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
    const v = (i, j) => g[((i % size + size) % size) + ((j % size + size) % size) * size];
    const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * tx, b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * tx; return a + (b - a) * ty; };
}

/* ── 지형 생성 (시드 → 결정적) ──────────────────────────── */
function genTerrain(seed) {
  const N = CONST.MAP, NN = N * N, c = (N - 1) / 2;
  const t = { N, type: new Uint8Array(NN), lv: new Uint8Array(NN), deco: new Uint8Array(NN), gref: new Int32Array(NN).fill(-1) };
  const n1 = makeNoise(seed, 3.6), n2 = makeNoise(seed ^ 0x9e3779b9, 1.3), big = makeNoise(seed + 77, 24);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, n = n1(x, y);
    t.type[i] = n < 0.36 ? 1 : n > 0.64 ? 2 : 0;
    t.deco[i] = Math.floor(n2(x, y) * 7);
    const d = chebXY(x, y, c, c) / c; // 0 중앙 ~ 1 가장자리
    t.lv[i] = clamp(Math.round(1 + 4 * Math.pow(1 - d, 1.15) + (big(x, y) - 0.5) * 1.6), 1, 5);
  }
  // 유적: 60칸 간격 5×5, 중앙은 대유적
  const rr = srand(seed + 5), ruins = [], giants = [];
  const G0 = CONST.RUIN_GRID;
  for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) {
    let x = 30 + k * G0, y = 30 + j * G0; const grand = j === 2 && k === 2;
    if (!grand) { x += Math.floor(rr() * 13) - 6; y += Math.floor(rr() * 13) - 6; }
    ruins.push([x, y, grand ? 1 : 0]);
    const i = y * N + x; t.type[i] = 4; t.lv[i] = grand ? 5 : Math.max(4, t.lv[i]);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue; const ii = yy * N + xx; if (ii !== i) t.lv[ii] = Math.min(5, t.lv[ii] + 1); }
  }
  // 거대 야수: 유적 사이 격자 4×4
  for (let j = 1; j <= 4; j++) for (let k = 1; k <= 4; k++) {
    const x = k * G0 + Math.floor(rr() * 11) - 5, y = j * G0 + Math.floor(rr() * 11) - 5;
    if (ruins.some(r => chebXY(r[0], r[1], x, y) < 5)) continue;
    const ci = y * N + x;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const ii = (y + dy) * N + (x + dx); t.gref[ii] = ci; t.lv[ii] = 3; if (t.type[ii] > 2) t.type[ii] = 0; }
    giants.push({ x, y, id: GIANTS[(j * 5 + k) % GIANTS.length] });
  }
  return { ter: t, ruins, giants };
}

/* ── 칸 ────────────────────────────────────────────────── */
class Tile {
  constructor(i) { this.i = i; this.x = i % TER.N; this.y = (i / TER.N) | 0; this.owner = null; this.protect = 0; this.fort = null; this.ot = 0; this.ruin = TER.type[i] === 4 ? 1 : 0; this.giant = null; this._m = undefined; }
  get type() { return TYPES[TER.type[this.i]]; }
  set type(v) { TER.type[this.i] = TYPES.indexOf(v); this._m = undefined; }
  get lv() { return TER.lv[this.i]; }
  set lv(v) { TER.lv[this.i] = v; this._m = undefined; }
  get deco() { return TER.deco[this.i]; }
  get giantRef() { const g = TER.gref[this.i]; return g < 0 ? null : [g % TER.N, (g / TER.N) | 0]; }
  get monsters() {
    if (this.owner || TER.gref[this.i] >= 0 || TER.type[this.i] === 3) return null;
    if (this._m === undefined) this._m = monstersFor(this);
    return this._m;
  }
}
function tileAt(x, y) {
  if (!TER || x < 0 || y < 0 || x >= TER.N || y >= TER.N || x !== Math.floor(x) || y !== Math.floor(y)) return null;
  const i = y * TER.N + x; return TILES[i] || (TILES[i] = new Tile(i));
}
function tileI(i) { return TILES[i] || (TILES[i] = new Tile(i)); }
function neighbors(x, y) { const out = []; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { if (!dx && !dy) continue; const t = tileAt(x + dx, y + dy); if (t) out.push(t); } return out; }
function ownedTiles(fid) { const s = OWNED[fid]; return s ? [...s].map(tileI) : []; }
function tilesOf(fid) { return OWNED[fid] ? OWNED[fid].size : 0; }
function fortsOf(fid) { return FORTS[fid] ? [...FORTS[fid]].map(tileI) : []; }

function monstersFor(t) {
  const rnd = srand((G.seed ^ Math.imul(t.i + 1, 2654435761)) >>> 0);
  const lv = t.lv, ruin = t.type === 'ruin'; const scale = 1 + (lv - 1) * 0.55; const list = [];
  const rp = (a) => a[Math.floor(rnd() * a.length)];
  if (lv >= 4 || ruin) {
    const n = lv + (ruin ? 2 : 0);
    for (let k = 0; k < n; k++) list.push({ id: rp(lv >= 5 ? BANDITS : BANDITS.slice(0, 5)), scale: scale * 0.9 });
    if (lv >= 5 || ruin) list.push({ id: 'b_boss', scale: scale * 0.8 });
    return list;
  }
  const pool = lv === 1 ? ['boar', 'wolf', 'boar', 'hornet'] : lv === 2 ? ['wolf', 'cheetah', 'skunk', 'hedgehog', 'boar', 'bison'] : ['tiger', 'lion', 'bison', 'bear', 'elephant', 'lizard', 'skunk'];
  const n = lv === 1 ? 1 + (rnd() < 0.4 ? 1 : 0) : lv + Math.floor(rnd() * 2);
  for (let k = 0; k < n; k++) list.push({ id: rp(pool), scale });
  return list;
}

/* ── 세계 준비 (새로 만들기·불러오기 공통) ─────────────────── */
function buildWorld() {
  const w = genTerrain(G.seed); TER = w.ter; TILES = new Array(TER.N * TER.N); OWNED = {}; FORTS = {};
  G.N = TER.N; G.ruins = w.ruins.map(r => [r[0], r[1]]);
  if (!G.giants) G.giants = w.giants.map(g => ({ x: g.x, y: g.y, id: g.id, dead: false, items: null }));
  for (const g of G.giants) { if (!g.items) { const r = srand(G.seed + g.x * 31 + g.y); g.items = [randomItem(EQUIP_ORDER[Math.floor(r() * EQUIP_ORDER.length)]), randomItem(EQUIP_ORDER[Math.floor(r() * EQUIP_ORDER.length)])]; } if (!g.dead) tileAt(g.x, g.y).giant = { id: g.id, scale: 1, items: g.items }; }
  for (const r of w.ruins) if (r[2]) tileAt(r[0], r[1]).ruin = 3; // 대유적은 Lv3에서 시작
  for (const f of Object.values(G.factions)) if (f.cap) prepCapital(f.cap[0], f.cap[1]);
}
// 온라인: 다른 사람의 거점이 생기거나 옮겨지면 지형을 시드에서 다시 만들고 모든 거점 자리를 다시 다듬는다
function rebuildTerrain() {
  const ver = (TER.ver || 0) + 1; const w = genTerrain(G.seed); TER = w.ter; TER.ver = ver;
  for (const f of Object.values(G.factions)) if (f.cap) prepCapital(f.cap[0], f.cap[1]);
  for (const t of TILES) if (t) t._m = undefined;
  G.ver++;
}
// 온라인: 떠난 플레이어 지우기
function removeFaction(fid) { for (const t of ownedTiles(fid)) { setOwner(t, null); t.protect = 0; } for (const t of fortsOf(fid)) setFort(t, null); delete G.factions[fid]; delete OWNED[fid]; delete FORTS[fid]; G.ver++; }
// 거점 자리: 지형을 정리하고 주변 3칸에 평야·숲·구릉을 고르게 섞는다 (결정적)
function prepCapital(cx, cy) {
  const N = TER.N, r = srand(G.seed + cx * 1009 + cy * 7);
  const ring = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= N || y >= N) continue; const i = y * N + x; if (TER.type[i] === 4 || TER.gref[i] >= 0) continue; if (dx || dy) ring.push(i); if (Math.max(Math.abs(dx), Math.abs(dy)) <= 2) TER.lv[i] = 1; }
  shuffle(ring, r); ring.forEach((i, k) => { if (k < ring.length * 0.75) TER.type[i] = k % 3; if (TILES[i]) TILES[i]._m = undefined; });
  const ci = cy * N + cx; TER.type[ci] = 3; TER.lv[ci] = 1; if (TILES[ci]) TILES[ci]._m = undefined;
  TER.ver = (TER.ver || 0) + 1;
}
function capitalSpotOK(x, y, others, minGap) {
  const N = CONST.MAP; if (x < 5 || y < 5 || x >= N - 5 || y >= N - 5) return false;
  const i = y * N + x; if (TER.type[i] === 4 || TER.gref[i] >= 0) return false;
  for (const r of G.ruins) if (chebXY(r[0], r[1], x, y) < 8) return false;
  for (const g of G.giants) if (chebXY(g.x, g.y, x, y) < 6) return false;
  for (const o of others) if (chebXY(o[0], o[1], x, y) < minGap) return false;
  return true;
}
// 가장자리 띠(쉬운 땅)에서 다른 거점과 떨어진 자리
function findSpawn(others, rnd = Math.random, minGap = 18) {
  const N = CONST.MAP, c = (N - 1) / 2;
  for (let tries = 0; tries < 4000; tries++) {
    const a = rnd() * Math.PI * 2, rad = c * (0.72 + rnd() * 0.2);
    const x = Math.round(c + Math.cos(a) * rad), y = Math.round(c + Math.sin(a) * rad);
    if (capitalSpotOK(x, y, others, tries > 3000 ? minGap / 2 : minGap)) return [x, y];
  }
  return [Math.floor(rnd() * (N - 20)) + 10, Math.floor(rnd() * (N - 20)) + 10];
}

/* ── 새 게임 ───────────────────────────────────────────── */
function freshPlayer() {
  const P = {
    res: { food: 600, wood: 400, stone: 250 }, scroll: 0, frags: {},
    buildings: { capital: 1, barracks: 1, warehouse: 1 }, buildQueue: [],
    soldiers: [], recruitQueue: [], trainQueue: [], craftQueue: [], items: [], heroes: {},
    equipPool: shuffle([...EQUIP_ORDER]).slice(0, 8), policy: 'none', hospital: [],
    nextSoldier: 1, dailyClaimed: -1, capHp: CONST.CAP_HP,
    base: { layout: { capital: [BASE.KEEP.x, BASE.KEEP.y], ...JSON.parse(JSON.stringify(BASE.DEFAULT)) }, extras: [] },
    troops: [{ id: 1, name: '1부대', members: [] }], nextTroop: 2,
  };
  return P;
}
function newGame(opts = {}) {
  const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9);
  G = {
    v: 3, mode: opts.mode || 'sp', seed, N: CONST.MAP, time: opts.time != null ? opts.time : 8 * 60, speed: 1, paused: false,
    log: [], toasts: [], over: null, overAck: false, factions: {}, armies: [], nextId: 1, pendingBattles: [],
    stats: { battles: 0, wins: 0, kills: 0, lost: 0 }, giants: null, ruins: null, tstate: [], ver: 1,
  };
  // 지형을 먼저 만들어 자리를 고른다
  const w = genTerrain(seed); TER = w.ter; G.ruins = w.ruins.map(r => [r[0], r[1]]); G.giants = w.giants.map(g => ({ x: g.x, y: g.y, id: g.id, dead: false, items: null }));
  const rnd = srand(seed + 11);
  const me = opts.cap || findSpawn(opts.others || [], rnd);
  G.factions.P = { id: 'P', name: opts.name || '나의 연맹', ...(opts.color || ME_COLOR), cap: me, alive: true, capHp: CONST.CAP_HP, capMax: CONST.CAP_HP };
  if (G.mode === 'sp') {
    // 경쟁 세력 3곳은 가까이(14~22칸), 나머지 5곳은 섬 곳곳에
    const caps = [me];
    for (let k = 0; k < 3; k++) { let spot = null; for (let tries = 0; tries < 600 && !spot; tries++) { const a = rnd() * Math.PI * 2, d = 14 + rnd() * 8; const x = Math.round(me[0] + Math.cos(a) * d), y = Math.round(me[1] + Math.sin(a) * d); if (capitalSpotOK(x, y, caps, 11)) spot = [x, y]; } if (!spot) spot = findSpawn(caps, rnd, 12); caps.push(spot); }
    for (let k = 0; k < 5; k++) caps.push(findSpawn(caps, rnd, 40));
    caps.slice(1).forEach((c, k) => { const d = AI_DEFS[k]; G.factions['F' + (k + 1)] = { id: 'F' + (k + 1), name: d.name, color: d.color, dark: d.dark, cap: c, alive: true, capHp: CONST.CAP_HP, capMax: CONST.CAP_HP, ai: true, rival: k < 3, power: 1, lastExpand: -Math.floor(rnd() * 20), lastAttack: 0 }; });
  }
  buildWorld();
  // 거점 점령
  for (const f of Object.values(G.factions)) {
    const t = tileAt(f.cap[0], f.cap[1]); setOwner(t, f.id, 0);
    if (f.ai) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = tileAt(f.cap[0] + dx, f.cap[1] + dy); if (n) setOwner(n, f.id, 0); }
  }
  G.player = freshPlayer();
  for (let k = 0; k < 2; k++) addSoldier('spear_long', 1);
  addLog(G.mode === 'mp' ? `9만 칸 온라인 섬 (${me[0]},${me[1]})에 거점을 세웠어요. 4시간 동안 보호돼요.` : '1에이커에서 시작합니다. 거점 옆 땅을 점령해 영토를 넓히세요.', 'sys');
  if (G.mode === 'mp') tileAt(me[0], me[1]).protect = G.time + 240;
  return G;
}

/* ── 소유권 ─────────────────────────────────────────────── */
function setOwner(t, fid, ot) {
  const prev = t.owner;
  if (prev) { OWNED[prev] && OWNED[prev].delete(t.i); if (t.fort === prev) { FORTS[prev] && FORTS[prev].delete(t.i); t.fort = null; } }
  t.owner = fid || null; t.ot = ot != null ? ot : G.time;
  if (fid) (OWNED[fid] || (OWNED[fid] = new Set())).add(t.i);
  if (t.fort && t.fort !== fid) t.fort = null;
  G.ver++;
}
function setFort(t, fid) { if (t.fort) FORTS[t.fort] && FORTS[t.fort].delete(t.i); t.fort = fid; if (fid) (FORTS[fid] || (FORTS[fid] = new Set())).add(t.i); G.ver++; }

/* ── 로그/알림 ─────────────────────────────────────────── */
function addLog(text, kind = 'info') { G.log.unshift({ t: G.time, text, kind }); if (G.log.length > 150) G.log.pop(); if (kind !== 'info') toast(text, kind); }
function toast(text, kind) { G.toasts.push({ text, kind, until: Date.now() + 3800 }); }
function changed(kind) { const n = net(); if (n) n.dirty(kind); }

/* ── 병사 ─────────────────────────────────────────────── */
function addSoldier(typeId, lv = 1) { const s = { id: G.player.nextSoldier++, type: typeId, lv, hero: null, weapon: null, armor: null, special: null, army: null }; G.player.soldiers.push(s); changed('soldiers'); return s; }
function soldierById(id) { return G.player.soldiers.find(s => s.id === id); }
function soldierName(s) { const t = UNITS[s.type]; return `${t.name} Lv${s.lv}${s.hero ? ' ·' + HEROES[s.hero.heroId].name : ''}`; }
// 병사가 사라질 때(전사·탈영·해산·입원) 부대 명단에서도 뺀다
function removeSoldier(s) { G.player.soldiers = G.player.soldiers.filter(x => x !== s); for (const tr of G.player.troops) tr.members = tr.members.filter(id => id !== s.id); changed('soldiers'); }
function maxSoldierLv() { const b = G.player.buildings.barracks || 0; return b >= 20 ? 6 : b >= 15 ? 5 : b >= 10 ? 4 : b >= 5 ? 3 : 2; }
function usageCoeff(typeId) { const n = G.player.soldiers.filter(s => s.type === typeId).length + G.player.recruitQueue.filter(q => q.type === typeId).length; return clamp(1 + Math.max(0, n - 4) * 0.12, 1, 2.2); }
function recruitCost(typeId) { const c = UNITS[typeId].cost, k = usageCoeff(typeId); const out = {}; for (const r in c) out[r] = Math.round(c[r] * k); return out; }
function recruitTime(typeId) { const t = UNITS[typeId]; return Math.round((t.cls === 'siege' ? 14 : t.cls === 'cav' ? 8 : 5) * usageCoeff(typeId)); }
function canAfford(cost) { return Object.keys(cost).every(r => (G.player.res[r] || 0) >= cost[r]); }
function pay(cost) { for (const r in cost) G.player.res[r] -= cost[r]; changed('state'); }
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
  if (G.player.recruitQueue.length >= 5) return '모집 대기열(5)이 가득 찼습니다.';
  pay(cost); const tm = recruitTime(typeId); G.player.recruitQueue.push({ type: typeId, remain: tm, total: tm }); return null;
}
function trainCost(s) { return { food: Math.round(50 * Math.pow(s.lv, 1.6) + 30), stone: Math.round(12 * Math.pow(s.lv, 1.6)) }; }
function trainTime(s) { return Math.max(2, Math.round(s.lv * 8 * (1 - 0.03 * (G.player.buildings.ground || 0)))); }
function train(s) {
  if (UNITS[s.type].cls === 'siege') return '병기는 훈련할 수 없습니다.';
  if (!G.player.buildings.ground) return '연병장이 필요합니다.';
  if (s.lv >= maxSoldierLv()) return `군영 레벨이 부족합니다 (지금 최대 Lv${maxSoldierLv()}).`;
  if (s.army) return '출전 중인 병사는 훈련할 수 없습니다.';
  if (G.player.trainQueue.find(q => q.sid === s.id)) return '이미 훈련 중입니다.';
  const c = trainCost(s); if (!canAfford(c)) return '자원이 부족합니다.';
  pay(c); const tm = trainTime(s); G.player.trainQueue.push({ sid: s.id, remain: tm, total: tm }); return null;
}
function returnItems(s) { for (const k of ['weapon', 'armor', 'special']) if (s[k]) { G.player.items.push(s[k]); s[k] = null; } }
function dismiss(s) { if (s.army) return '출전 중'; removeSoldier(s); returnItems(s); return null; }

/* ── 건물 (거점 안) ─────────────────────────────────────── */
function buildCost(id) { const lv = (G.player.buildings[id] || 0) + 1; return BUILDINGS[id].cost(lv); }
function buildTime(id) { const lv = (G.player.buildings[id] || 0) + 1; return BUILDINGS[id].time(lv) * 3; }
function inQueue(id) { return G.player.buildQueue.find(q => q.id === id); }
function build(id) {
  const b = BUILDINGS[id]; const cur = G.player.buildings[id] || 0; const cap = G.player.buildings.capital;
  if (cur >= b.max) return '최대 레벨입니다.';
  if (id !== 'capital' && cur + 1 > cap) return '거점 레벨을 넘을 수 없습니다.';
  if (b.req && cap < b.req) return `거점 Lv${b.req} 필요`;
  if (G.player.buildQueue.length >= 2) return '건설 대기열(2)이 가득 찼습니다.';
  if (inQueue(id)) return '이미 공사 중입니다.';
  if (!G.player.base.layout[id]) return '먼저 거점 안에 자리를 정해 주세요.';
  const c = buildCost(id); if (!canAfford(c)) return '자원이 부족합니다.';
  pay(c); const tm = buildTime(id); G.player.buildQueue.push({ id, remain: tm, total: tm }); return null;
}
function storageCap() { return 3000 + Math.round(1500 * Math.pow(G.player.buildings.warehouse || 0, 1.4)) + 400 * G.player.buildings.capital; }
function territoryCap() { return 8 + G.player.buildings.capital * 6; }
function armyCap() { return Math.min(24, 3 + G.player.buildings.capital); }
function maxArmies() { return 1 + Math.floor(G.player.buildings.capital / 5); }
function towerSlots() { return Math.min(BASE_EXTRAS.tower.max, Math.floor(G.player.buildings.capital / 3)); }
function troopSlots() { return Math.min(6, 1 + Math.floor(G.player.buildings.capital / 4)); }

// 배치: 건물 칸 차지 영역
function footprint(id, at) { if (id === 'capital') return { x: BASE.KEEP.x, y: BASE.KEEP.y, w: BASE.KEEP.w, h: BASE.KEEP.h }; if (BASE_EXTRAS[id]) return { x: at[0], y: at[1], w: 1, h: 1 }; return { x: at[0], y: at[1], w: BASE.FOOT, h: BASE.FOOT }; }
function baseCells(skipKey) {
  const occ = new Map(); const B = G.player.base;
  const mark = (fp, key) => { for (let y = fp.y; y < fp.y + fp.h; y++) for (let x = fp.x; x < fp.x + fp.w; x++) occ.set(x + ',' + y, key); };
  for (const [id, at] of Object.entries(B.layout)) if (id !== skipKey) mark(footprint(id, at), id);
  B.extras.forEach((e, k) => { if ('x' + k !== skipKey) mark(footprint(e.id, [e.x, e.y]), 'x' + k); });
  return occ;
}
function canPlace(kind, x, y, skipKey) {
  const fp = footprint(kind, [x, y]);
  if (fp.x < 0 || fp.y < 0 || fp.x + fp.w > BASE.W || fp.y + fp.h > BASE.H) return '부지 밖이에요.';
  const R = BASE.RALLY, K = BASE.KEEP;
  const hit = (r) => fp.x < r.x + r.w && fp.x + fp.w > r.x && fp.y < r.y + r.h && fp.y + fp.h > r.y;
  if (kind !== 'capital' && hit(K)) return '본관 자리예요.';
  if (hit(R)) return '집결지에는 지을 수 없어요.';
  const occ = baseCells(skipKey);
  for (let yy = fp.y; yy < fp.y + fp.h; yy++) for (let xx = fp.x; xx < fp.x + fp.w; xx++) if (occ.has(xx + ',' + yy)) return '다른 건물과 겹쳐요.';
  return null;
}
// 비어 있는 첫 자리 (자동 배치)
function autoSpot(kind, skipKey) { for (let y = 0; y < BASE.H; y++) for (let x = 0; x < BASE.W; x++) if (!canPlace(kind, x, y, skipKey)) return [x, y]; return null; }
// 새 건물 짓기: 자리 정하고 Lv1 공사 시작

function placeBuilding(id, x, y) {
  if (G.player.base.layout[id]) return '이미 있는 건물이에요.';
  const e = canPlace(id, x, y); if (e) return e;
  G.player.base.layout[id] = [x, y];
  const err = build(id);
  if (err) { delete G.player.base.layout[id]; return err; }
  changed('state'); return null;
}
function moveBuilding(key, x, y) {
  const B = G.player.base;
  if (key === 'capital') return '본관은 옮길 수 없어요.';
  if (key[0] === 'x' && /^x\d+$/.test(key)) { const e = B.extras[+key.slice(1)]; if (!e) return '없는 건물'; const err = canPlace(e.id, x, y, key); if (err) return err; e.x = x; e.y = y; changed('state'); return null; }
  if (!B.layout[key]) return '없는 건물';
  const err = canPlace(key, x, y, key); if (err) return err; B.layout[key] = [x, y]; changed('state'); return null;
}
function extraCost(e) { return BASE_EXTRAS[e.id].cost(e.lv + 1); }
function buildExtra(kind, x, y) {
  const X = BASE_EXTRAS[kind]; if (!X) return '없는 종류';
  const B = G.player.base;
  if (kind === 'tower' && B.extras.filter(e => e.id === 'tower').length >= towerSlots()) return `망루는 거점 3레벨마다 1개 (지금 ${towerSlots()}개)`;
  if (X.deco && B.extras.filter(e => BASE_EXTRAS[e.id].deco).length >= DECO_MAX) return `장식은 ${DECO_MAX}개까지`;
  const err = canPlace(kind, x, y); if (err) return err;
  const c = X.cost(1); if (!canAfford(c)) return '자원이 부족합니다.';
  if (kind === 'tower' && G.player.buildQueue.length >= 2) return '건설 대기열(2)이 가득 찼습니다.';
  pay(c);
  const e = { id: kind, x, y, lv: X.deco ? 1 : 0 }; B.extras.push(e);
  if (kind === 'tower') { const tm = X.time(1) * 3; G.player.buildQueue.push({ id: 'tower', ex: B.extras.length - 1, remain: tm, total: tm }); }
  G.ver++; changed('state'); return null;
}
function upgradeExtra(k) {
  const e = G.player.base.extras[k]; if (!e) return '없는 건물'; const X = BASE_EXTRAS[e.id];
  if (X.deco) return '장식은 올릴 수 없어요.';
  if (e.lv >= X.max) return '최대 레벨입니다.'; if (e.lv + 1 > G.player.buildings.capital) return '거점 레벨을 넘을 수 없습니다.';
  if (G.player.buildQueue.length >= 2) return '건설 대기열(2)이 가득 찼습니다.';
  if (G.player.buildQueue.find(q => q.ex === k)) return '이미 공사 중입니다.';
  const c = extraCost(e); if (!canAfford(c)) return '자원이 부족합니다.';
  pay(c); const tm = X.time(e.lv + 1) * 3; G.player.buildQueue.push({ id: e.id, ex: k, remain: tm, total: tm }); return null;
}
function removeExtra(k) { const B = G.player.base; const e = B.extras[k]; if (!e) return '없는 건물'; if (G.player.buildQueue.find(q => q.ex === k)) return '공사 중에는 치울 수 없어요.'; B.extras.splice(k, 1); for (const q of G.player.buildQueue) if (q.ex > k) q.ex--; G.ver++; changed('state'); return null; }
function queueName(q) { if (q.ex != null) { const e = G.player.base.extras[q.ex]; return `${BASE_EXTRAS[q.id].name} Lv${e ? e.lv + 1 : ''}`; } return `${BUILDINGS[q.id].name} Lv${(G.player.buildings[q.id] || 0) + 1}`; }

/* ── 부대 편성 ─────────────────────────────────────────── */
function troopOf(sid) { return G.player.troops.find(t => t.members.includes(sid)) || null; }
function addTroop() { const P = G.player; if (P.troops.length >= troopSlots()) return `부대는 ${troopSlots()}개까지 (거점 4레벨마다 +1)`; const id = P.nextTroop++; P.troops.push({ id, name: P.troops.length + 1 + '부대', members: [] }); changed('state'); return null; }
function setTroopMembers(tid, ids) {
  const P = G.player; const tr = P.troops.find(t => t.id === tid); if (!tr) return '없는 부대';
  ids = ids.filter(id => soldierById(id)); if (ids.length > armyCap()) return `부대 인원은 ${armyCap()}명까지`;
  for (const t of P.troops) if (t !== tr) t.members = t.members.filter(id => !ids.includes(id));
  tr.members = ids; changed('state'); return null;
}
function removeTroop(tid) { const P = G.player; if (P.troops.length <= 1) return '부대는 하나 이상 있어야 해요.'; if (G.armies.some(a => a.owner === 'P' && a.troop === tid)) return '출전 중인 부대예요.'; P.troops = P.troops.filter(t => t.id !== tid); P.troops.forEach((t, k) => { if (/^\d+부대$/.test(t.name)) t.name = (k + 1) + '부대'; }); changed('state'); return null; }
function troopReady(tr) { return tr.members.map(soldierById).filter(s => s && !s.army && !G.player.trainQueue.find(q => q.sid === s.id)); }
function sendTroop(tid, x, y, stay) { const tr = G.player.troops.find(t => t.id === tid); if (!tr) return '없는 부대'; const ready = troopReady(tr); if (!ready.length) return `${tr.name}에 출전할 수 있는 병사가 없어요.`; const err = sendArmy(ready.map(s => s.id), x, y, stay); if (!err) G.armies[G.armies.length - 1].troop = tid; return err; }

/* ── 경제 ──────────────────────────────────────────────── */
function season() { const d = Math.floor(G.time / CONST.MINUTES_PER_DAY), k = Math.floor(d / CONST.DAYS_PER_SEASON); return SEASONS[isMP() ? ((k % 4) + 4) % 4 : clamp(k, 0, 3)]; }
function hourOf() { return Math.floor(((G.time % 1440) + 1440) % 1440 / 60); }
function pvpOpen(fid) { if (fid && G.factions[fid] && G.factions[fid].alive === false) return true; const h = hourOf(); return h >= CONST.PVP_START && h < CONST.PVP_END; }
let PRODC = { ver: -1 };
function production() {
  const s = season(), P = G.player;
  if (PRODC.ver !== G.ver || PRODC.sid !== s.id || PRODC.pol !== P.policy) {
    const out = { food: 60, wood: 45, stone: 35 };
    for (const t of ownedTiles('P')) if (t.type !== 'capital') {
      const p = tileProduction(t.lv);
      if (t.type === 'plain') out.food += p; else if (t.type === 'forest') out.wood += p; else if (t.type === 'hill') out.stone += p; else if (t.type === 'ruin') { out.food += p * 0.4; out.wood += p * 0.4; out.stone += p * 0.4; }
    }
    const bonus = { food: 0, wood: 0, stone: 0 };
    for (const e of P.base.extras) { const b = BASE_EXTRAS[e.id].bonus; if (b) for (const k in b) bonus[k] += b[k]; }
    out.food *= s.food * (P.policy === 'harvest' ? 1.2 : 1) * (1 + bonus.food); out.wood *= s.mat * (1 + bonus.wood); out.stone *= s.mat * (1 + bonus.stone);
    PRODC = { ver: G.ver, sid: s.id, pol: P.policy, out };
  }
  const o = Object.assign({}, PRODC.out);
  o.upkeep = P.soldiers.reduce((a, so) => a + UNITS[so.type].food, 0) + P.hospital.length;
  o.foodNet = o.food - o.upkeep;
  return o;
}

/* ── 영웅 초상화 ────────────────────────────────────────── */
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
  const g = drawGrade(0); G.player.heroes[hid] = rollHero(hid, g);
  addLog(`${h.name} 초상화 해제! ${GRADES[g]}`, 'good'); changed('state'); return null;
}
function drawGrade(cur, st) {
  const rows = GRADE_TABLE[cur]; if (!rows) return cur;
  if (st && st.fails >= GRADE_PITY[cur]) { st.fails = 0; return cur + 1; }
  const r = Math.random() * 100; let acc = 0;
  for (const [g, p] of [...rows].sort((a, b) => b[0] - a[0])) { acc += p; if (r < acc) { if (st) st.fails = 0; return g; } }
  if (st) st.fails++;
  return cur === 0 ? 1 : cur;
}
function rerollHero(hid) {
  const st = G.player.heroes[hid]; const h = HEROES[hid];
  if (!st) return '보유하지 않은 영웅';
  if (st.grade >= 8) return '이미 운명 등급입니다.';
  const have = G.player.frags[h.unit] || 0; if (have < REROLL_COST) return `${UNITS[h.unit].name} 잔편 ${REROLL_COST}개 필요 (보유 ${have})`;
  G.player.frags[h.unit] -= REROLL_COST;
  const before = st.grade; const g = drawGrade(st.grade, st);
  const fails = st.fails; const nst = rollHero(hid, Math.max(g, before)); nst.fails = fails; nst.grade = Math.max(g, before);
  G.player.heroes[hid] = nst;
  for (const s of G.player.soldiers) if (s.hero && s.hero.heroId === hid) s.hero = heroAttach(hid);
  changed('state');
  if (nst.grade > before) { addLog(`${h.name} ${GRADES[before]} → ${GRADES[nst.grade]} 승급!`, 'good'); return null; }
  return `등급 유지 (${GRADES[before]}). 재능이 다시 굴려졌어요. 천장 ${fails}/${GRADE_PITY[before]}`;
}
function heroAttach(hid) { const st = G.player.heroes[hid]; return { heroId: hid, name: HEROES[hid].name, hp: st.hp, atk: st.atk, v1: st.v1, talent: st.talent, grade: st.grade }; }
function assignHero(s, hid) {
  if (hid === null) { s.hero = null; changed('soldiers'); return null; }
  const h = HEROES[hid]; if (h.unit !== s.type) return `${h.name}은(는) ${UNITS[h.unit].name}에게만 공봉할 수 있어요.`;
  if (!G.player.heroes[hid]) return '보유하지 않은 영웅';
  const other = G.player.soldiers.find(x => x.hero && x.hero.heroId === hid); if (other && other !== s) other.hero = null;
  s.hero = heroAttach(hid); changed('soldiers'); return null;
}

/* ── 장비 ─────────────────────────────────────────────── */
function randomItem(id) { const e = EQUIPMENT[id]; const it = { uid: Math.random().toString(36).slice(2, 8), id, name: e.name, slot: e.slot }; if (e.hp) it.hp = irnd(e.hp[0], e.hp[1]); if (e.atk) it.atk = irnd(e.atk[0], e.atk[1]); if (e.v) it.v = irnd(e.v[0], e.v[1]); return it; }
function itemDesc(it) { const e = EQUIPMENT[it.id]; let d = e.desc.replace('{v}', it.v); const st = []; if (it.hp) st.push('체력 +' + it.hp); if (it.atk) st.push('공격 +' + it.atk); return (st.length ? st.join(', ') + '. ' : '') + d; }
function craftCost(id) { const lv = EQUIPMENT[id].lv; return { wood: 40 + lv * 15, stone: 70 + lv * 35 }; }
function craft(id) {
  const e = EQUIPMENT[id]; if (!G.player.equipPool.includes(id)) return '이번 대전의 장비 효과 풀에 없어요.';
  if ((G.player.buildings.smithy || 0) < e.lv) return `대장간 Lv${e.lv} 필요`;
  if (G.player.craftQueue.length >= 3) return '제작 대기열(3)이 가득 찼습니다.';
  const c = craftCost(id); if (!canAfford(c)) return '자원이 부족합니다.';
  pay(c); G.player.craftQueue.push({ id, remain: 4 + e.lv, total: 4 + e.lv }); return null;
}
function craftSpecial(typeId) {
  const sp = SPECIAL_EQUIP[typeId]; if (!sp) return '해당 병종의 전용 장비 데이터가 공개되어 있지 않아요.';
  const sm = G.player.buildings.smithy || 0; const have = G.player.items.filter(i => i.special === typeId).length + G.player.soldiers.filter(s => s.special && s.special.special === typeId).length;
  if (sm < 10) return '대장간 Lv10 필요'; if (have >= 1 && sm < 18) return '두 번째 전용 장비는 대장간 Lv18 필요'; if (have >= 2) return '전용 장비는 병종당 2개까지';
  const c = { wood: 600, stone: 600 }; if (!canAfford(c)) return '자원이 부족합니다.';
  pay(c); G.player.items.push({ uid: Math.random().toString(36).slice(2, 8), id: 'special', special: typeId, name: sp.name, slot: 'special', hp: irnd(sp.hp[0], sp.hp[1]), atk: irnd(sp.atk[0], sp.atk[1]), desc: sp.desc }); return null;
}
function equip(s, it) {
  if (it.slot === 'special') { if (it.special !== s.type) return '다른 병종의 전용 장비'; if (s.special) G.player.items.push(s.special); s.special = it; }
  else if (it.slot === 'weapon') { if (UNITS[s.type].cls === 'siege' && it.id === 'heal_sword') return '병기는 치료검을 쓸 수 없어요.'; if (s.weapon) G.player.items.push(s.weapon); s.weapon = it; }
  else { if (s.armor) G.player.items.push(s.armor); s.armor = it; }
  G.player.items = G.player.items.filter(x => x !== it); changed('soldiers'); return null;
}
function unequip(s, slot) { const it = s[slot]; if (!it) return; s[slot] = null; G.player.items.push(it); changed('soldiers'); }

/* ── 행군 ─────────────────────────────────────────────── */
function armySpeed(ids) { let sp = 999; for (const id of ids) { const s = soldierById(id); if (s) sp = Math.min(sp, CLASS_INFO[UNITS[s.type].cls].speed); } if (G.player.policy === 'horn') sp *= 1.25; return sp === 999 ? 62 : sp; }
function originFor(x, y) {
  let best = G.factions.P.cap, bd = chebXY(best[0], best[1], x, y);
  for (const t of fortsOf('P')) { const d = chebXY(t.x, t.y, x, y); if (d < bd) { bd = d; best = [t.x, t.y]; } }
  return best;
}
function nearFort(t) { for (const f of fortsOf('P')) if (chebXY(f.x, f.y, t.x, t.y) <= 3) return true; return false; }
function canTarget(t) {
  if (!t) return '없는 타일';
  if (t.owner === 'P' && t.type === 'capital') return '거점은 대기 중인 병사와 성벽·망루가 자동으로 지켜요.';
  if (t.owner === 'P') return null; // 주둔
  const g = giantOf(t);
  if (g) { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const n of neighbors(g.x + dx, g.y + dy)) if (n.owner === 'P') return null; return '영토와 맞닿은 곳만 공격할 수 있어요.'; }
  if (!neighbors(t.x, t.y).some(n => n.owner === 'P') && !nearFort(t)) return '영토와 맞닿은 곳만 공격할 수 있어요. (요새 3칸 안은 가능)';
  if (t.owner && !pvpOpen(t.owner)) return `다른 세력 땅은 ${CONST.PVP_START}:00~${CONST.PVP_END}:00에만 공격할 수 있어요.`;
  if (t.owner && t.protect > G.time) return `점령 보호 중 (${durStr(t.protect - G.time)} 남음)`;
  if (!t.owner && tilesOf('P') >= territoryCap()) return `영토 상한(${territoryCap()})에 도달했어요. 거점을 올리거나 땅을 포기하세요.`;
  return null;
}
function sendArmy(ids, tx, ty, stay) {
  const t = tileAt(tx, ty); const err = canTarget(t); if (err) return err;
  if (!ids.length) return '병사를 선택하세요.'; if (ids.length > armyCap()) return `부대 최대 인원은 ${armyCap()}명이에요.`;
  if (G.armies.filter(a => a.owner === 'P').length >= maxArmies()) return `동시 출전 부대는 ${maxArmies()}개까지예요.`;
  for (const id of ids) { const s = soldierById(id); if (!s || s.army) return '이미 출전 중인 병사가 있어요.'; if (G.player.trainQueue.find(q => q.sid === id)) return '훈련 중인 병사가 있어요.'; }
  const [ox, oy] = originFor(tx, ty); const dist = chebXY(ox, oy, tx, ty) || 1;
  const a = { id: G.nextId++, owner: 'P', units: [...ids], from: [ox, oy], to: [tx, ty], dist, progress: 0, speed: armySpeed(ids), state: 'march', stay: !!stay, x: ox, y: oy, start: G.time };
  for (const id of ids) soldierById(id).army = a.id;
  G.armies.push(a); addLog(`부대가 (${tx},${ty})로 출발! 도착까지 ${durStr(dist / a.speed * 60)}`, 'info'); changed('army'); return null;
}
function recallArmy(a) { if (a.state === 'wait') { a.state = 'return'; a.from = [...a.to]; a.to = originFor(a.x, a.y); a.dist = chebXY(a.to[0], a.to[1], a.from[0], a.from[1]) || 1; a.progress = 0; a.start = G.time; changed('army'); } }
function disbandArmy(a) { for (const id of a.units) { const s = soldierById(id); if (s) s.army = null; } G.armies = G.armies.filter(x => x !== a); changed('army'); }
function abandonTile(t) {
  if (t.owner !== 'P') return '내 땅이 아니에요.'; if (t.type === 'capital') return '거점은 포기할 수 없어요.';
  if (G.armies.some(a => a.owner === 'P' && a.state === 'wait' && a.x === t.x && a.y === t.y)) return '주둔 부대를 먼저 회군하세요.';
  setOwner(t, null); t.protect = 0; addLog(`(${t.x},${t.y}) 땅을 포기했어요.`, 'info'); changed('own'); return null;
}

function soldierSpec(s) { return { uid: 's' + s.id, soldierId: s.id, typeId: s.type, lv: s.lv, hero: s.hero, weapon: s.weapon, armor: s.armor, special: s.special }; }
function giantOf(t) { if (!t) return null; const r = t.giantRef; if (!r) return null; const c = tileAt(r[0], r[1]); return c && c.giant ? c : null; }
// 성벽·망루·요새 수비 (내 것과 온라인 상대의 것을 같은 식으로)
function wallsFor(isCap, isFort, cl, towers) {
  const out = [];
  if (isCap) { out.push({ isBuilding: true, name: '거점 성벽', hp: 400 + 220 * cl, atk: 8 + 4 * cl, range: 3 }); for (const lv of towers || []) if (lv > 0) out.push({ isBuilding: true, name: '망루', hp: 160 + 80 * lv, atk: 10 + 6 * lv, range: 4 }); }
  else if (isFort) out.push({ isBuilding: true, name: '요새', hp: 300 + 120 * cl, atk: 6 + 3 * cl, range: 3 });
  return out;
}
function towerLevels() { return G.player.base.extras.filter(e => e.id === 'tower').map(e => e.lv); }
function playerWalls(t) { return wallsFor(t.type === 'capital', t.fort === 'P', G.player.buildings.capital, towerLevels()); }
function stationAt(x, y) { return G.armies.find(a => a.owner === 'P' && a.state === 'wait' && a.x === x && a.y === y); }
function myDefenders(t) {
  const st = stationAt(t.x, t.y);
  const specs = t.type === 'capital' ? G.player.soldiers.filter(s => !s.army).map(soldierSpec) : st ? st.units.map(id => soldierById(id)).filter(Boolean).map(soldierSpec) : [];
  return specs.concat(playerWalls(t));
}
function tileDefenders(t) {
  if (t.owner === 'P') { const st = stationAt(t.x, t.y); return { specs: myDefenders(t), label: t.type === 'capital' ? '거점 수비군' : st ? '주둔 부대' : t.fort ? '요새 수비' : '수비 없음', army: st }; }
  if (t.owner) { const f = G.factions[t.owner]; const n = net(); if (n && f && !f.ai) return { specs: n.remoteDefenders(t), label: `${f.name} 수비군` }; return { specs: factionGarrison(t.owner, t), label: `${f ? f.name : '세력'} 수비군` }; }
  const g = giantOf(t);
  if (g) return { specs: [{ monsterId: g.giant.id, scale: g.giant.scale * season().monster, giantItems: g.giant.items }], label: MONSTERS[g.giant.id].name, giant: g };
  if (t.monsters && t.monsters.length) return { specs: t.monsters.map(m => ({ monsterId: m.id, scale: m.scale * season().monster })), label: t.monsters.map(m => MONSTERS[m.id].name).join(', ') };
  return { specs: [], label: '비어 있음' };
}
const FACTION_ROSTER = ['spear_long', 'shield_sword', 'bow_long', 'spear_pike', 'cav_sword', 'spear_ge', 'cav_spear', 'bow_cross', 'shield_spear', 'shield_heavy', 'spear_sword', 'bow_hunter', 'cav_glaive', 'shield_hammer', 'bow_heavy', 'spear_dual'];
function factionGarrison(fid, t, attack) {
  const day = G.time / 1440, isCap = t.type === 'capital';
  const rnd = srand((t.x || 0) * 7919 + (t.y || 0) * 104729 + fid.charCodeAt(fid.length - 1) * 31 + Math.floor(G.time / 360) * 1013 + (attack ? 77 : 0) + G.seed);
  const n = clamp(Math.round(3 + day * 2 + ((t.lv || 1) - 1) * 0.8 + (isCap ? 4 : 0) + (t.ruin ? 2 : 0)), 3, 18);
  const lv = clamp(1 + Math.floor(day * 1.1) + (isCap ? 1 : 0), 1, 6), mul = 1 + day * 0.04;
  const pool = FACTION_ROSTER.slice(0, Math.min(FACTION_ROSTER.length, 4 + Math.floor(day * 3)));
  const out = [];
  for (let k = 0; k < n; k++) {
    const ty = pool[Math.floor(rnd() * pool.length)]; const sp = { typeId: ty, lv, hpMul: mul, atkMul: mul };
    if (day >= 1.5 && rnd() < 0.35) { const id = EQUIP_ORDER[Math.floor(rnd() * 12)]; const e = EQUIPMENT[id]; const it = { id, name: e.name, slot: e.slot }; if (e.hp) it.hp = Math.round(lerpRange(e.hp, 0.5)); if (e.atk) it.atk = Math.round(lerpRange(e.atk, 0.5)); if (e.v) it.v = Math.round(lerpRange(e.v, 0.5)); sp[e.slot] = it; }
    if (day >= 2.5 && k === 0) { const hs = HERO_ORDER.filter(h => HEROES[h].unit === ty); if (hs.length) { const hid = hs[Math.floor(rnd() * hs.length)]; const H = HEROES[hid]; sp.hero = { heroId: hid, name: H.name, hp: Math.round(lerpRange(H.hp, 0.4)), atk: Math.round(lerpRange(H.atk, 0.4)), v1: Math.round(lerpRange(HERO_RANGES[hid] || [0, 0], 0.4)), talent: null, grade: 4 }; } }
    out.push(sp);
  }
  if (!attack && isCap) out.push({ isBuilding: true, name: '거점 성벽', hp: Math.round(500 + 350 * day), atk: Math.round(12 + 6 * day), range: 3 });
  if (!attack && t.fort) out.push({ isBuilding: true, name: '요새', hp: Math.round(350 + 200 * day), atk: Math.round(10 + 4 * day), range: 3 });
  return out;
}

/* 도착 처리 */
function arrive(a) {
  const t = tileAt(a.to[0], a.to[1]);
  if (t.owner === 'P') { a.state = 'wait'; a.x = t.x; a.y = t.y; addLog(`부대가 (${t.x},${t.y})에 주둔했어요.`, 'info'); changed('army'); return; }
  const def = tileDefenders(t);
  const err = (t.owner && !pvpOpen(t.owner)) ? 'PvP 시간이 아니에요' : (t.owner && t.protect > G.time) ? '점령 보호 중이에요' : (!t.owner && !giantOf(t) && tilesOf('P') >= territoryCap()) ? `영토 상한(${territoryCap()})에 도달했어요` : null;
  if (err) { addLog(`(${t.x},${t.y}) 공격 취소: ${err}`, 'warn'); returnHome(a); return; }
  if (!def.specs.length) { captureTile(t, 'P'); addLog(`(${t.x},${t.y}) 무혈 점령`, 'good'); afterBattleReturn(a, t); return; }
  const atk = a.units.map(id => soldierById(id)).filter(Boolean).map(soldierSpec);
  const foeOwner = t.owner || null;
  const reward0 = { lv: t.lv, ruin: !!t.ruin, giant: !!def.giant, types: a.units.map(id => soldierById(id)).filter(Boolean).map(s => s.type) };
  const seed = Math.floor(Math.random() * 2e9);
  const res = seededBattle(seed, atk, def.specs, { policy: G.player.policy, capitalLv: G.player.buildings.capital });
  G.stats.battles++;
  applyLosses(a, res);
  const remote = foeOwner && G.factions[foeOwner] && !G.factions[foeOwner].ai && net();
  let capitalHit = false;
  if (res.winner === 'A') {
    G.stats.wins++;
    const reward = rewardFor(reward0);
    if (def.giant) { const c = def.giant; c.giant = null; const gr = G.giants.find(g => g.x === c.x && g.y === c.y); if (gr) { gr.dead = true; gr.by = 'P'; } for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const n = tileAt(c.x + dx, c.y + dy); if (n && !n.owner) captureTile(n, 'P'); } addLog(`거대 야수 ${def.label} 처치! 자원지 9칸 확보`, 'good'); }
    else {
      const wasCap = t.type === 'capital' && foeOwner;
      const f = foeOwner ? G.factions[foeOwner] : null;
      if (wasCap) {
        capitalHit = true;
        const left = Math.max(0, (f.capHp != null ? f.capHp : CONST.CAP_HP) - 1);
        if (!remote) f.capHp = left;
        if (left > 0) addLog(`${f.name} 거점 성벽 돌파! 내구 ${left}/${CONST.CAP_HP} — ${reward}`, 'good');
        else if (remote) { f.capHp = 0; addLog(`${f.name} 거점 함락! 그 세력은 다른 곳에서 다시 시작해요. — ${reward}`, 'good'); bigLoot(); }
        else { captureTile(t, 'P'); eliminateFaction(foeOwner); addLog(`(${t.x},${t.y}) 거점 함락! ${reward}`, 'good'); }
      } else { captureTile(t, 'P'); addLog(`(${t.x},${t.y}) 점령 성공! ${reward}`, 'good'); }
    }
  } else { G.stats.lost++; addLog(`(${t.x},${t.y}) 공격 실패 (${res.winner === 'draw' ? '30턴 초과로 철수' : '전멸'})`, 'bad'); }
  G.pendingBattles.push({ res, tile: [t.x, t.y], label: def.label, attacker: 'P', time: G.time, terrain: t.type, foe: foeOwner });
  if (remote) net().sendRaid(foeOwner, { seed, tile: [t.x, t.y], atk, def: def.specs, win: res.winner === 'A', capital: capitalHit, dead: res.units.filter(u => u.side === 'D' && u.soldierId && !u.alive).map(u => u.soldierId), opts: { policy: G.player.policy, capitalLv: G.player.buildings.capital }, at: G.time });
  afterBattleReturn(a, t, res.winner === 'A');
}
function bigLoot() { const P = G.player; for (const k of ['food', 'wood', 'stone']) P.res[k] += 800; P.scroll += 10; const ty = P.soldiers.length ? P.soldiers[0].type : 'spear_long'; P.frags[ty] = (P.frags[ty] || 0) + 20; }
function afterBattleReturn(a, t, won) {
  a.units = a.units.filter(id => soldierById(id));
  if (!a.units.length) { disbandArmy(a); return; }
  if (won !== false && a.stay && t.owner === 'P') { a.state = 'wait'; a.x = t.x; a.y = t.y; a.to = [t.x, t.y]; changed('army'); return; }
  returnHome(a);
}
function returnHome(a) { a.state = 'return'; a.from = [a.to[0], a.to[1]]; a.x = a.from[0]; a.y = a.from[1]; a.to = originFor(a.from[0], a.from[1]); a.dist = chebXY(a.to[0], a.to[1], a.from[0], a.from[1]) || 1; a.progress = 0; a.start = G.time; changed('army'); }
function hospitalize(s) { const hp = G.player.buildings.hospital || 0; const p = hp ? 0.3 + 0.05 * hp : 0; removeSoldier(s); s.army = null; if (Math.random() < p) { G.player.hospital.push({ soldier: s, remain: 30 }); return true; } returnItems(s); G.stats.kills++; return false; }
function applyLosses(a, res) {
  for (const u of res.units) if (u.side === 'A' && u.soldierId && !u.alive) { const s = soldierById(u.soldierId); if (s && hospitalize(s)) addLog(`${soldierName(s)} 입원 (30분 뒤 복귀)`, 'info'); }
  for (const u of res.units) if (u.side === 'A' && u.soldierId && u.alive) { const s = soldierById(u.soldierId); if (s && u.kills > 0 && s.lv < maxSoldierLv() && Math.random() < 0.08 * u.kills && UNITS[s.type].cls !== 'siege') { s.lv++; addLog(`${UNITS[s.type].name}이(가) 전투 경험으로 Lv${s.lv}이 됐어요`, 'info'); } }
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
  setOwner(t, fid); t.protect = G.time + CONST.PROTECT_MIN;
  if (t.ruin && prev && prev !== fid) t.ruin = Math.max(1, t.ruin - 3);
  if (prev === 'P') { const st = stationAt(t.x, t.y); if (st) returnHome(st); }
  if (fid === 'P' || prev === 'P') changed('own');
}
function eliminateFaction(fid) {
  const f = G.factions[fid]; f.alive = false; let n = 0;
  for (const t of ownedTiles(fid)) { captureTile(t, 'P'); n++; }
  addLog(`${f.name} 맹주 거점 함락! 영지 ${n}칸이 넘어왔어요.`, 'good');
}

/* 요새 / 유적 */
function fortMax() { return Math.floor(G.player.buildings.capital / 4); }
function buildFort(t) {
  if (t.owner !== 'P' || !['plain', 'forest', 'hill'].includes(t.type)) return '내 영토의 일반 땅에만 지을 수 있어요.';
  if (t.fort) return '이미 요새가 있어요.';
  if (fortsOf('P').length >= fortMax()) return `요새는 ${fortMax()}개까지 (거점 4레벨마다 +1)`;
  const c = { wood: 500, stone: 700 }; if (!canAfford(c)) return '자원이 부족합니다.';
  pay(c); setFort(t, 'P'); addLog(`(${t.x},${t.y})에 요새를 지었어요. 3칸 안을 공격할 수 있어요.`, 'good'); changed('own'); return null;
}
function ruinCost(t) { return { wood: 100 * t.ruin + 100, stone: 100 * t.ruin + 100, food: 60 * t.ruin }; }
function upgradeRuin(t) {
  if (t.owner !== 'P' || !t.ruin) return '내 유적이 아니에요.';
  if (t.ruin >= CONST.RUIN_WIN_LV) return '최대 레벨';
  const c = ruinCost(t); if (!canAfford(c)) return '자원이 부족합니다. ' + costStr(c);
  pay(c); t.ruin++; G.ver++; addLog(`유적 (${t.x},${t.y}) Lv${t.ruin}`, 'good'); changed('own'); checkVictory(); return null;
}

/* ── AI 세력 (혼자 하기) ───────────────────────────────── */
function aiGoals(f, day) {
  const c = f.cap;
  const goals = G.ruins.map(r => tileAt(r[0], r[1])).filter(t => t.owner !== f.id).sort((a, b) => chebXY(a.x, a.y, c[0], c[1]) - chebXY(b.x, b.y, c[0], c[1])).slice(0, 2).map(t => ({ x: t.x, y: t.y, w: 1 }));
  if (f.rival && day >= 0.6) { const p = G.factions.P.cap; goals.push({ x: p[0], y: p[1], w: day >= 1 ? 0.55 : 0.8 }); }
  return goals;
}
function aiTick() {
  const day = G.time / 1440;
  for (const f of Object.values(G.factions)) {
    if (!f.ai || !f.alive) continue;
    const n = tilesOf(f.id);
    f.power = 1 + day * 0.6 + n * 0.02;
    if (G.time - f.lastExpand >= (f.rival ? 22 : 34) && n < 10 + day * 18) {
      f.lastExpand = G.time;
      const allow = 1 + Math.floor(day * 1.4);
      const seen = new Set(); const cands = [];
      for (const t of ownedTiles(f.id)) for (const nb of neighbors(t.x, t.y)) { if (seen.has(nb.i)) continue; seen.add(nb.i); if (!nb.owner && !nb.giantRef && nb.lv <= allow) cands.push(nb); }
      if (cands.length && Math.random() < 0.85) {
        const goals = aiGoals(f, day); let best = null, bs = 1e9;
        for (const cd of cands) { let d = 999; for (const g of goals) d = Math.min(d, chebXY(g.x, g.y, cd.x, cd.y) * g.w); const sc = d + Math.random() * 3; if (sc < bs) { bs = sc; best = cd; } }
        if (best.ruin) best.ruin = 1;
        captureTile(best, f.id);
      }
      if (day > 1.6 && Math.random() < 0.06) {
        const g = G.giants.find(gr => !gr.dead && ownedTiles(f.id).some(t => chebXY(t.x, t.y, gr.x, gr.y) <= 2));
        if (g) { g.dead = true; tileAt(g.x, g.y).giant = null; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const nb = tileAt(g.x + dx, g.y + dy); if (nb && !nb.owner) captureTile(nb, f.id); } }
      }
    }
    if (G.time % 240 === 0) for (const t of ownedTiles(f.id)) if (t.ruin && t.ruin < CONST.RUIN_WIN_LV && Math.random() < 0.6) { t.ruin++; G.ver++; }
    // 플레이어 침공 (가까운 경쟁 세력만, PvP 시간, 하룻밤 최대 3회)
    const night = Math.floor((G.time - CONST.PVP_START * 60) / 1440);
    if (f.night !== night) { f.night = night; f.attacks = 0; }
    if (f.rival && pvpOpen() && day >= 1 && (f.attacks || 0) < 3 && G.time - f.lastAttack >= 40) {
      f.lastAttack = G.time;
      const border = ownedTiles('P').filter(t => t.protect <= G.time && neighbors(t.x, t.y).some(nb => nb.owner === f.id));
      if (border.length && Math.random() < 0.55) { f.attacks = (f.attacks || 0) + 1; border.sort((a, b) => (b.ruin ? 2 : 0) - (a.ruin ? 2 : 0) || Math.random() - 0.5); aiAttack(f, border[0]); }
    }
    if (pvpOpen() && Math.random() < 0.02) {
      const o = pick(Object.values(G.factions).filter(x => x.ai && x.id !== f.id && x.alive));
      if (o) { const b = ownedTiles(o.id).filter(t => t.type !== 'capital' && neighbors(t.x, t.y).some(nb => nb.owner === f.id)); if (b.length && f.power > o.power * 0.9) captureTile(pick(b), f.id); }
    }
  }
  checkVictory();
}
function aiAttack(f, t) {
  let best = null, bd = 99;
  for (const o of ownedTiles(f.id)) { const sc = Math.abs(chebXY(o.x, o.y, t.x, t.y) - 4); if (sc < bd) { bd = sc; best = o; } }
  if (!best) return;
  const specs = factionGarrison(f.id, { x: t.x, y: t.y, lv: 3, type: 'plain' }, true);
  const dist = chebXY(best.x, best.y, t.x, t.y) || 1;
  G.armies.push({ id: G.nextId++, owner: f.id, units: [], specs, from: [best.x, best.y], to: [t.x, t.y], dist, progress: 0, speed: 48, state: 'march', x: best.x, y: best.y, start: G.time });
  addLog(`${f.name} 부대 ${specs.length}기가 (${t.x},${t.y})로 진군 중! 약 ${durStr(dist / 48 * 60)} 뒤 도착`, 'warn');
}
// 수비전 결과 반영 (AI 침공·온라인 침공 공통)
function applyDefense(res, t, attackerName, attackerId) {
  for (const u of res.units) if (u.side === 'D' && u.soldierId && !u.alive) { const s = soldierById(u.soldierId); if (!s) continue; if (s.army) { const ar = G.armies.find(x => x.id === s.army); if (ar) ar.units = ar.units.filter(id => id !== s.id); } hospitalize(s); }
  G.armies = G.armies.filter(x => x.owner !== 'P' || x.units.length);
  if (res.winner === 'A') {
    if (t.type === 'capital' && t.owner === 'P') {
      G.player.capHp--;
      if (G.player.capHp > 0) addLog(`${attackerName}의 침공으로 거점 성벽이 부서졌어요! 내구 ${G.player.capHp}/${CONST.CAP_HP}`, 'bad');
      else { addLog(`${attackerName}에게 거점이 함락됐어요!`, 'bad'); if (isMP()) relocateCapital(); else { captureTile(t, attackerId); checkDefeat(true); } }
    } else if (t.owner === 'P') { captureTile(t, attackerId); addLog(`${attackerName}의 침공 — (${t.x},${t.y}) 함락!`, 'bad'); }
  } else { G.stats.wins++; addLog(`${attackerName}의 침공을 (${t.x},${t.y})에서 막아냈어요!`, 'good'); }
  changed('soldiers'); changed('own');
}
function aiArrive(a) {
  G.armies = G.armies.filter(x => x !== a);
  const f = G.factions[a.owner]; const t = tileAt(a.to[0], a.to[1]);
  if (!f || !f.alive || !t || t.owner !== 'P') return;
  if (!pvpOpen()) { addLog(`${f.name} 부대가 PvP 시간이 끝나 물러갔어요.`, 'info'); return; }
  const specs = myDefenders(t);
  if (!specs.length) { captureTile(t, f.id); addLog(`${f.name}이(가) 무방비 땅 (${t.x},${t.y})를 점령했어요!`, 'bad'); return; }
  const seed = Math.floor(Math.random() * 2e9);
  const res = seededBattle(seed, a.specs, specs, { policy: G.player.policy, defenderIsPlayer: true, capitalLv: G.player.buildings.capital });
  G.stats.battles++;
  G.pendingBattles.push({ res, tile: [t.x, t.y], label: f.name + ' 침공', attacker: f.id, time: G.time, defense: true, terrain: t.type });
  applyDefense(res, t, f.name, f.id);
}
// 온라인: 거점이 함락되면 땅을 모두 내려놓고 새 자리에서 다시 시작 (건물·병사는 유지)
function relocateCapital() {
  const P = G.player;
  for (const t of ownedTiles('P')) { setOwner(t, null); t.protect = 0; }
  for (const a of G.armies.filter(x => x.owner === 'P')) disbandArmy(a);
  const others = Object.values(G.factions).filter(f => f.id !== 'P' && f.cap).map(f => f.cap);
  const spot = findSpawn(others);
  G.factions.P.cap = spot; rebuildTerrain(); const t = tileAt(spot[0], spot[1]); setOwner(t, 'P'); t.protect = G.time + 240;
  P.capHp = CONST.CAP_HP;
  for (const k of ['food', 'wood', 'stone']) P.res[k] = Math.floor(P.res[k] * 0.6);
  addLog(`(${spot[0]},${spot[1]})에 새 거점을 세웠어요. 4시간 동안 보호돼요.`, 'warn');
  changed('own'); changed('state');
}

/* ── 승리 / 패배 ──────────────────────────────────────── */
function scoreOf(fid) { let s = tilesOf(fid); for (const r of G.ruins) { const t = tileAt(r[0], r[1]); if (t.owner === fid) s += t.ruin * 3; } return s; }
function ruinsOf(fid) { return G.ruins.map(r => tileAt(r[0], r[1])).filter(t => t.owner === fid); }
function checkVictory() {
  if (G.over || G.overAck || isMP()) return;
  for (const fid of Object.keys(G.factions)) {
    const rs = ruinsOf(fid);
    if (rs.some(r => r.ruin >= CONST.RUIN_WIN_LV) || rs.filter(r => r.ruin >= CONST.RUIN_WIN_COUNT_LV).length >= CONST.RUIN_WIN_COUNT) { endGame(fid === 'P' ? 'win' : 'lose', fid === 'P' ? '유적 승리! 유적 조건을 먼저 달성했어요.' : `${G.factions[fid].name}이(가) 유적 조건을 먼저 달성했어요.`); return; }
  }
  if (!isMP() && Object.values(G.factions).filter(f => f.rival && f.alive).length === 0) endGame('win', '최후 혈전 승리! 가까운 경쟁 세력의 거점을 모두 함락했어요.');
}
function checkDefeat(capFallen) { if (G.over || G.overAck) return; if (capFallen || tileAt(...G.factions.P.cap).owner !== 'P') endGame('lose', '거점이 함락됐어요.'); }
function rankings() { return Object.values(G.factions).filter(f => f.alive !== false || f.id === 'P').map(f => ({ name: f.name, score: scoreOf(f.id), id: f.id })).sort((a, b) => b.score - a.score); }
function endGame(result, reason) {
  if (G.overAck) return;
  G.over = { result, reason, ranks: rankings(), time: G.time }; G.paused = true;
  addLog(reason, result === 'win' ? 'good' : 'bad');
}

/* ── 시간 ─────────────────────────────────────────────── */
function tick(minutes) {
  if (G.over) return;
  const P = G.player;
  for (let m = 0; m < minutes; m++) {
    if (G.over) break;
    G.time++;
    const prod = production();
    P.res.food += prod.foodNet / 60; P.res.wood += prod.wood / 60; P.res.stone += prod.stone / 60;
    const cap = storageCap(); for (const r of ['food', 'wood', 'stone']) P.res[r] = clamp(P.res[r], 0, cap);
    if (P.res.food <= 0 && prod.foodNet < 0 && G.time % 30 === 0) { const s = P.soldiers.filter(x => !x.army)[0]; if (s) { removeSoldier(s); returnItems(s); addLog(`식량이 바닥나 ${soldierName(s)}이(가) 떠났어요.`, 'bad'); } }
    // 건설
    if (P.buildQueue.length) { const q = P.buildQueue[0]; q.remain--; if (q.remain <= 0) { P.buildQueue.shift(); if (q.ex != null) { const e = P.base.extras[q.ex]; if (e) { e.lv++; addLog(`${BASE_EXTRAS[e.id].name} Lv${e.lv} 완성`, 'good'); } } else { P.buildings[q.id] = (P.buildings[q.id] || 0) + 1; addLog(`${BUILDINGS[q.id].name} Lv${P.buildings[q.id]} 완성`, 'good'); } G.ver++; changed('state'); changed('soldiers'); } }
    if (P.recruitQueue.length) { const q = P.recruitQueue[0]; q.remain--; if (q.remain <= 0) { P.recruitQueue.shift(); addSoldier(q.type, 1); addLog(`${UNITS[q.type].name} 모집 완료`, 'info'); } }
    while (P.trainQueue.length && !soldierById(P.trainQueue[0].sid)) P.trainQueue.shift();
    if (P.trainQueue.length) { const q = P.trainQueue[0]; q.remain--; if (q.remain <= 0) { P.trainQueue.shift(); const s = soldierById(q.sid); if (s) { s.lv++; addLog(`${UNITS[s.type].name} Lv${s.lv} 훈련 완료`, 'info'); changed('soldiers'); } } }
    if (P.craftQueue.length) { const q = P.craftQueue[0]; q.remain--; if (q.remain <= 0) { P.craftQueue.shift(); const it = randomItem(q.id); P.items.push(it); addLog(`${it.name} 제작 완료`, 'info'); changed('state'); } }
    for (const h of [...P.hospital]) { h.remain--; if (h.remain <= 0) { P.hospital = P.hospital.filter(x => x !== h); h.soldier.army = null; if (h.soldier.hero && P.soldiers.some(x => x.hero && x.hero.heroId === h.soldier.hero.heroId)) h.soldier.hero = null; P.soldiers.push(h.soldier); addLog(`${soldierName(h.soldier)} 퇴원`, 'info'); changed('soldiers'); } }
    for (const a of [...G.armies]) {
      if (a.state !== 'march' && a.state !== 'return') continue;
      a.progress += a.speed / 60; const f = clamp(a.progress / a.dist, 0, 1);
      a.x = a.from[0] + (a.to[0] - a.from[0]) * f; a.y = a.from[1] + (a.to[1] - a.from[1]) * f;
      if (a.progress >= a.dist) { if (a.state === 'march') { if (a.owner === 'P') arrive(a); else aiArrive(a); } else { for (const id of a.units) { const s = soldierById(id); if (s) s.army = null; } G.armies = G.armies.filter(x => x !== a); changed('army'); changed('soldiers'); } }
    }
    if (G.time % CONST.CAP_REGEN === 0) { if (P.capHp < CONST.CAP_HP) P.capHp++; for (const f of Object.values(G.factions)) if (f.ai && f.capHp < f.capMax) f.capHp++; }
    if (!isMP() && G.time % 5 === 0) aiTick();
    const day = Math.floor(G.time / 1440);
    if (P.dailyClaimed < day) {
      P.dailyClaimed = day;
      if (day > 0) { const cnt = {}; for (const so of P.soldiers) if (UNITS[so.type].cls !== 'siege') cnt[so.type] = (cnt[so.type] || 0) + 1; const ft = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0] || 'spear_long'; P.frags[ft] = (P.frags[ft] || 0) + 10; addLog(`${day + 1}일차 — ${season().name}. 일일 보상: ${UNITS[ft].name} 잔편 +10`, 'good'); }
      if (day >= 4 && !isMP()) { endGame(scoreOf('P') >= Math.max(0, ...Object.keys(G.factions).filter(f => f !== 'P').map(scoreOf)) ? 'win' : 'lose', '겨울이 끝나 결산해요.'); break; }
    }
  }
}

/* ── 저장 ─────────────────────────────────────────────── */
const SAVE_KEY = 'acres9_save_v3';
// 바뀐 칸만: [번호, 주인, 보호, 요새, 유적Lv, 점령시각]
function tileStateList(onlyMine) {
  const out = []; const seen = new Set();
  for (const fid of Object.keys(OWNED)) { if (onlyMine && fid !== 'P') continue; for (const i of OWNED[fid]) seen.add(i); }
  if (!onlyMine) for (const r of G.ruins) seen.add(r[1] * TER.N + r[0]);
  for (const i of seen) { const t = tileI(i); const defR = TER.type[i] === 4 ? 1 : 0; if (!t.owner && !t.fort && t.ruin === defR) continue; out.push([i, t.owner, t.protect || 0, t.fort, t.ruin, t.ot || 0]); }
  return out;
}
function serialize() {
  const snap = Object.assign({}, G, { tstate: tileStateList(isMP()), pendingBattles: undefined, toasts: undefined });
  if (isMP()) snap.factions = { P: G.factions.P };
  return JSON.stringify(snap);
}
function restore(o) {
  if (!o || o.v !== 3 || !o.player || !o.factions) return false;
  G = o; G.toasts = []; G.pendingBattles = []; G.ver = (G.ver || 1) + 1;
  buildWorld();
  for (const [i, owner, prot, fort, ruin, ot] of G.tstate || []) { const t = tileI(i); if (owner) setOwner(t, owner, ot); t.protect = prot; if (fort) setFort(t, fort); t.ruin = ruin; }
  if (!G.factions.P.capHp && G.factions.P.capHp !== 0) G.factions.P.capHp = CONST.CAP_HP;
  if (G.player.capHp == null || Number.isNaN(G.player.capHp)) G.player.capHp = CONST.CAP_HP;
  for (const f of Object.values(G.factions)) { if (f.capMax == null) f.capMax = CONST.CAP_HP; if (f.capHp == null || Number.isNaN(f.capHp)) f.capHp = f.capMax; }
  G.tstate = [];
  return true;
}
function saveGame() { if (isMP()) { const n = net(); if (n) n.saveNow(); return true; } try { localStorage.setItem(SAVE_KEY, serialize()); return true; } catch (e) { return false; } }
function loadGame() { try { const s = localStorage.getItem(SAVE_KEY); if (!s) return false; return restore(JSON.parse(s)); } catch (e) { return false; } }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
function exportSave() { return btoa(unescape(encodeURIComponent(serialize()))); }
function importSave(str) { try { const o = JSON.parse(decodeURIComponent(escape(atob(str.trim())))); if (o.mode === 'mp') return false; return restore(o); } catch (e) { return false; } }
