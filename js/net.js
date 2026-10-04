/* ============================================================
   온라인 월드 — claude.ai 아티팩트의 공유 저장소(db)·접속(room)·사용자(user)
   · world/meta            월드 시드·속도·시즌 (편집자만 씀)
   · players/<id>          각자 공개 상태: 거점, 영토 목록, 수비군, 주둔군, 행군 (자기 것만 씀)
   · inbox/<id>/items/*    침공 보고: 공격한 쪽이 시드와 양쪽 편성을 보내면 수비한 쪽이 똑같이 다시 돌려 반영
   · data/users/<id>/state 내 비공개 진행 (자원·병사·건물…)
   · chat/*                월드 채팅
   칸 주인이 겹치면 더 늦게 점령한 쪽(ot)이 이긴다. 'P'는 언제나 나, 저장소에서는 내 id.
   ============================================================ */
'use strict';

const NET = (() => {
  const S = { status: 'off', db: null, user: null, room: null, uid: null, admin: false, canWrite: null, world: null, players: {}, names: {}, online: new Set(), chat: [], joined: false, err: '', readOnly: false };
  let joinSubs = [], dirty = new Set(), pubBusy = false, lastPub = 0, lastPubBody = '', saveBusy = false, lastSave = '', lastSaveAt = 0, lastCheck = 0;
  const inboxDone = new Set(); let inboxBusy = false; const inboxQ = []; let gen = 0; // gen: 입장 세대 (떠난 뒤 늦게 끝난 쓰기는 버린다)
  const has = (T, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(T, k); // 'constructor' 같은 키로 뚫리지 않게
  let terrainDirty = false, listeners = [];
  const fire = (ev) => { for (const f of listeners) try { f(ev); } catch (e) { console.error(e); } };
  const PALETTE = [ME_COLOR, ...AI_DEFS.map(d => ({ color: d.color, dark: d.dark }))];

  /* ── 연결 ────────────────────────────────────────────── */
  async function connect() {
    if (!window.claude || typeof window.claude.use !== 'function') { S.status = 'off'; fire('status'); return; }
    S.status = 'connecting'; fire('status');
    try {
      const [db, user, room] = await Promise.all([claude.use('db'), claude.use('user'), claude.use('room')]);
      S.db = db; S.user = user; S.room = room;
      if (!db || !user) { S.status = 'off'; fire('status'); return; }
      S.uid = await user.id();
      if (!S.uid) { S.status = 'off'; fire('status'); return; }
      S.admin = typeof user.canEdit === 'function' ? await user.canEdit().catch(() => false) : false;
      S.canWrite = typeof user.can === 'function' ? await user.can('data.write').catch(() => null) : null;
      sub(onErr => db.doc('world/meta').onSnapshot(s => { S.world = s.exists ? cleanWorld(s.data()) : null; if (S.status !== 'ready') { S.status = 'ready'; S.err = ''; } onWorld(); fire('world'); }, e => { S.err = e.code; fire('status'); onErr(e); }));
      if (room) {
        room.presence({ uid: S.uid }).catch(() => {});
        room.onPeers(ch => { const on = new Set(); for (const p of ch.peers) { if (p.kind !== 'viewer') continue; const id = p.by || (p.presence && typeof p.presence.uid === 'string' ? p.presence.uid : null); if (id) on.add(id); } S.online = on; markOnline(); fire('online'); }, () => {});
      }
    } catch (e) { S.status = 'off'; S.err = String((e && e.code) || e); fire('status'); }
  }
  // 구독이 끊기면(unavailable·resource_exhausted) 잠시 뒤 다시 건다. revoked면 포기.
  function sub(make, bag) {
    let un = null, dead = false, tries = 0;
    const onErr = (e) => { if (dead) return; if (e && e.code === 'revoked') { S.status = 'error'; S.err = 'revoked'; fire('status'); return; } tries++; setTimeout(() => { if (!dead) start(); }, Math.min(30000, 3000 * tries)); };
    const start = () => { try { un = make(onErr); } catch (e) { onErr(e); } };
    start();
    const stop = () => { dead = true; if (un) try { un(); } catch (e) {} };
    if (bag) bag.push(stop); return stop;
  }
  function cleanWorld(w) { if (!w || !Number.isFinite(w.seed) || !Number.isFinite(w.created)) return null; return { seed: w.seed >>> 0, speed: WORLD_SPEEDS.some(s => s.id === w.speed) ? w.speed : 'x24', created: w.created, t0: Number.isFinite(w.t0) ? w.t0 : 480, season: Number.isFinite(w.season) ? w.season : 1 }; }
  function speedOf() { const w = S.world; return (w && WORLD_SPEEDS.find(s => s.id === w.speed)) || WORLD_SPEEDS[2]; }
  function worldTime() { const w = S.world; if (!w) return 0; return Math.floor(w.t0 + Math.max(0, Date.now() - w.created) / 1000 * speedOf().mul); }
  function onWorld() {
    if (!S.joined) return;
    // 시즌이 새로 시작되면 (편집자가 월드를 다시 만들면) 첫 화면으로
    if (!S.world || S.world.seed !== G.seed || S.world.season !== G.season) { leave(); fire('reset'); }
  }
  async function writeErr(e) {
    if (!e) return;
    if (e.code === 'quota_exceeded') { addLog('공유 저장소가 가득 찼어요. 월드 주인에게 알려 주세요.', 'bad'); return; }
    if (e.code !== 'invalid_argument' || S.readOnly) return;
    // 권한이 없는 건지, 문서가 너무 큰 건지 작은 쓰기로 가려낸다
    try { await S.db.doc(`data/users/${S.uid}/probe`).set({ t: Date.now() }); addLog('진행 데이터가 너무 커서 일부가 저장되지 않았어요. 사건 기록을 줄여요.', 'warn'); G.log = G.log.slice(0, 40); }
    catch (e2) { S.readOnly = true; fire('readonly'); }
  }

  async function createWorld(speedId) {
    if (!S.db) return '온라인을 쓸 수 없어요.';
    const prev = S.world;
    const w = { seed: Math.floor(Math.random() * 1e9), speed: speedId, created: Date.now(), t0: 8 * 60, season: ((prev && prev.season) || 0) + 1 };
    try { await S.db.doc('world/meta').set(w); return null; } catch (e) { return e && e.code === 'invalid_argument' ? '월드를 만들 권한이 없어요 (편집자만 가능).' : '월드를 만들지 못했어요.'; }
  }

  /* ── 입장 ────────────────────────────────────────────── */
  async function join() {
    const w = S.world; if (!w) return '아직 월드가 없어요.'; if (S.joined) return null;
    const myGen = ++gen; S.players = {};
    const ps = await S.db.collection('players').get();
    const docs = {}; for (const d of ps.docs) { const v = d.data(); if (v && v.season === w.season && v.seed === w.seed && Array.isArray(v.cap)) docs[d.id] = v; }
    let ok = false;
    try { const mine = await S.db.doc(`data/users/${S.uid}/state`).get(); if (mine.exists) { const st = mine.data(); if (st.seed === w.seed && st.season === w.season && typeof st.g === 'string') ok = restore(JSON.parse(st.g)); } } catch (e) { ok = false; }
    if (!ok) {
      const others = Object.entries(docs).filter(([id]) => id !== S.uid).map(([, d]) => d.cap);
      const used = new Set(Object.values(docs).map(d => d.color)); let h = 0; for (const ch of S.uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      let color = PALETTE[h % PALETTE.length]; for (let k = 0; k < PALETTE.length; k++) { const c = PALETTE[(h + k) % PALETTE.length]; if (!used.has(c.color)) { color = c; break; } }
      newGame({ mode: 'mp', seed: w.seed, time: worldTime(), others, color: { color: color.color, dark: color.dark }, name: '나' });
    }
    if (myGen !== gen || !S.world || S.world.seed !== w.seed || S.world.season !== w.season) return '그 사이 시즌이 바뀌었어요. 다시 들어와 주세요.';
    G.mode = 'mp'; G.season = w.season; G.speed = 1; G.paused = false; G.over = null; G.factions.P.name = '나';
    for (const id of G.inboxDone || []) inboxDone.add(id);
    S.joined = true; S.readOnly = false; lastPubBody = ''; lastSave = ''; pubBusy = false; saveBusy = false; inboxBusy = false;
    for (const [id, d] of Object.entries(docs)) if (id !== S.uid) { S.players[id] = d; applyPlayer(id, d); }
    rebuildTerrain(); terrainDirty = false;
    sub(onErr => S.db.collection('players').onSnapshot(onPlayers, onErr), joinSubs);
    sub(onErr => S.db.collection(`inbox/${S.uid}/items`).onSnapshot(onInbox, onErr), joinSubs);
    sub(onErr => S.db.collection('chat').orderBy('t', 'desc').limit(40).onSnapshot(onChat, onErr), joinSubs);
    cleanupChat();
    refreshNames(); markOnline();
    dirty.add('join'); publish(); saveNow(true);
    return null;
  }
  function leave() { gen++; for (const u of joinSubs) try { u(); } catch (e) {} joinSubs = []; S.joined = false; S.players = {}; inboxQ.length = 0; pubBusy = false; saveBusy = false; }

  /* ── 다른 플레이어 반영 ──────────────────────────────── */
  function onPlayers(snap) {
    let any = false;
    for (const ch of snap.docChanges()) {
      const id = ch.doc.id; if (id === S.uid) continue;
      const d = ch.type === 'removed' ? null : ch.doc.data();
      if (!d || d.season !== S.world.season || d.seed !== S.world.seed || !Array.isArray(d.cap)) { if (G.factions[id]) { removeFaction(id); terrainDirty = true; } delete S.players[id]; any = true; continue; }
      S.players[id] = d; applyPlayer(id, d); any = true;
    }
    if (any) { refreshNames(); markOnline(); fire('players'); }
  }
  const okXY = (c) => Array.isArray(c) && c.length === 2 && Number.isInteger(c[0]) && Number.isInteger(c[1]) && c[0] >= 0 && c[1] >= 0 && c[0] < CONST.MAP && c[1] < CONST.MAP;
  const hex = (c, d) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : d;
  function applyPlayer(id, d) {
    if (!okXY(d.cap)) return;
    let f = G.factions[id];
    if (!f) f = G.factions[id] = { id, remote: true, alive: true, name: S.names[id] || '영주', capMax: CONST.CAP_HP };
    if (!f.cap || f.cap[0] !== d.cap[0] || f.cap[1] !== d.cap[1]) terrainDirty = true;
    // 같은 자리에 거점이 생겼으면(동시 입장) id가 큰 쪽이 자리를 옮긴다
    const mc = G.factions.P.cap; if (mc && chebXY(mc[0], mc[1], d.cap[0], d.cap[1]) < 4 && S.uid > id) { addLog('다른 영주와 거점 자리가 겹쳐 새 자리로 옮겨요.', 'warn'); Object.assign(f, { cap: [d.cap[0], d.cap[1]] }); relocateCapital(); }
    Object.assign(f, { color: hex(d.color, '#9aa9c4'), dark: hex(d.dark, '#6b7894'), cap: [d.cap[0], d.cap[1]], capHp: clamp(Math.floor(+d.capHp || 0), 0, CONST.CAP_HP), capLv: clamp(Math.floor(+d.capLv || 1), 1, 30), towers: Array.isArray(d.towers) ? d.towers.slice(0, 10).map(v => clamp(Math.floor(+v || 0), 0, 10)) : [], online: S.online.has(id) });
    const N = CONST.MAP * CONST.MAP;
    const list = Array.isArray(d.tiles) ? d.tiles.filter(e => Array.isArray(e) && Number.isInteger(e[0]) && e[0] >= 0 && e[0] < N).slice(0, 2000) : [];
    const want = new Set(list.map(e => e[0]));
    for (const t of ownedTiles(id)) if (!want.has(t.i)) { setOwner(t, null); t.protect = 0; }
    const capLv = f.capLv || 1; let forts = 0;
    for (const [i, ot0, prot, fort, ruin] of list) {
      const t = tileI(i), ot = +ot0 || 0;
      const co = capOwnerOf(t); if (co && co.id !== id) continue; // 남의 거점 칸은 주장할 수 없다
      const curId = t.owner === 'P' ? S.uid : t.owner;
      if (t.owner && t.owner !== id && ((t.ot || 0) > ot || ((t.ot || 0) === ot && curId < id))) continue; // 더 늦게 점령한 쪽이 주인, 같으면 id 순
      if (t.owner !== id || t.ot !== ot) {
        const prev = t.owner; setOwner(t, id, ot);
        if (prev === 'P') { const st = stationAt(t.x, t.y); if (st) returnHome(st); changed('own'); }
      }
      t.protect = clamp(+prot || 0, 0, G.time + 300);
      const fortOK = !!fort && ['plain', 'forest', 'hill'].includes(t.type) && forts < Math.floor(capLv / 4); if (fortOK) forts++;
      if (fortOK !== (t.fort === id)) setFort(t, fortOK ? id : null);
      if (t.ruin || TER.type[i] === 4) t.ruin = clamp(Math.floor(+ruin || 1), 1, CONST.RUIN_WIN_LV);
    }
    for (const k of Array.isArray(d.gk) ? d.gk : []) { const g = G.giants.find(x => x.x + ',' + x.y === k); if (g && !g.dead) { g.dead = true; g.by = id; const t = tileAt(g.x, g.y); if (t) t.giant = null; G.ver++; } }
  }
  function markOnline() { if (!G || !G.factions) return; for (const f of Object.values(G.factions)) if (f.remote) f.online = S.online.has(f.id); }
  async function refreshNames() {
    if (!S.user) return;
    const ids = [...new Set([S.uid, ...Object.keys(S.players), ...S.chat.map(m => m.by)].filter(x => typeof x === 'string'))];
    try { const ps = await S.user.profiles(ids); for (const id of ids) S.names[id] = (ps[id] && ps[id].name) || ''; } catch (e) {}
    let k = 0; for (const id of Object.keys(S.players)) { k++; const f = G && G.factions[id]; if (f) f.name = S.names[id] || ('영주 ' + k); }
    if (S.joined && G && G.factions.P) G.factions.P.name = S.names[S.uid] || '나';
    fire('names');
  }
  function nameOf(id) { if (id === S.uid || id === 'P') return S.names[S.uid] || '나'; return S.names[id] || (G && G.factions[id] ? G.factions[id].name : '영주'); }

  /* ── 남의 수비군 (그 사람이 공개한 편성) ───────────────── */
  const num = (v, a, b) => clamp(Number.isFinite(+v) ? +v : 0, a, b);
  function cleanItem(it, slot) {
    if (!it || typeof it !== 'object') return null;
    if (slot === 'special') { const sp = has(SPECIAL_EQUIP, it.special) ? SPECIAL_EQUIP[it.special] : null; if (!sp) return null; return { uid: String(it.uid || '').slice(0, 16), id: 'special', special: it.special, name: sp.name, slot: 'special', hp: num(it.hp, 0, sp.hp[1]), atk: num(it.atk, 0, sp.atk[1]), desc: sp.desc }; }
    const e = has(EQUIPMENT, it.id) ? EQUIPMENT[it.id] : null; if (!e || e.slot !== slot) return null;
    const o = { uid: String(it.uid || '').slice(0, 16), id: it.id, name: e.name, slot: e.slot };
    if (e.refine) { o.refine = clamp(Math.floor(+it.refine || 0), 0, 50); o.refineKind = e.refine.includes(it.refineKind) ? it.refineKind : e.refine[0]; o.name = `${e.name} +${o.refine}`; }
    if (e.hp) o.hp = num(it.hp, 0, e.hp[1]); if (e.atk) o.atk = num(it.atk, 0, e.atk[1]); if (e.v) o.v = num(it.v, 0, e.v[1]);
    return o;
  }
  function cleanSpec(sp) {
    if (!sp || typeof sp !== 'object') return null;
    if (sp.isBuilding) return null; // 성벽은 받는 쪽이 계산
    if (!has(UNITS, sp.typeId)) return null;
    const o = { uid: String(sp.uid || '').slice(0, 16), typeId: sp.typeId, lv: clamp(Math.floor(+sp.lv || 1), 1, 6) };
    if (Number.isInteger(sp.soldierId)) o.soldierId = sp.soldierId;
    const h = sp.hero; if (h && has(HEROES, h.heroId) && HEROES[h.heroId].unit === sp.typeId) { const H = HEROES[h.heroId]; o.hero = { heroId: h.heroId, name: H.name, hp: num(h.hp, 0, H.hp[1]), atk: num(h.atk, 0, H.atk[1]), v1: num(h.v1, 0, (HERO_RANGES[h.heroId] || [0, 0])[1]), talent: typeof h.talent === 'string' && h.talent.length < 24 ? h.talent : null, grade: clamp(Math.floor(+h.grade || 0), 0, 8) }; }
    for (const k of ['weapon', 'armor', 'special']) { const it = cleanItem(sp[k], k); o[k] = it; }
    return o;
  }
  const cleanList = (a, n = 60) => (Array.isArray(a) ? a : []).slice(0, n).map(cleanSpec).filter(Boolean);
  function remoteDefenders(t) {
    const d = S.players[t.owner], f = G.factions[t.owner]; if (!d || !f) return [];
    const isCap = !!f.cap && f.cap[0] === t.x && f.cap[1] === t.y;
    const specs = isCap ? cleanList(d.gar) : d.st && d.st[t.i] ? cleanList(d.st[t.i]) : [];
    return specs.concat(wallsFor(isCap, !!t.fort, f.capLv || 1, f.towers));
  }

  /* ── 침공 보내기 / 받기 ──────────────────────────────── */
  function sendRaid(to, r) {
    if (!S.db || !S.joined) return;
    const body = { seed: r.seed >>> 0, tile: r.tile, atk: r.atk, def: r.def.filter(s => !s.isBuilding).concat(r.def.filter(s => s.isBuilding)), win: !!r.win, capital: !!r.capital, opts: { policy: r.opts.policy, capitalLv: r.opts.capitalLv }, at: r.at, from: S.uid, wseed: S.world.seed, t: Date.now() };
    S.db.collection(`inbox/${to}/items`).add(body).catch(() => addLog('침공 결과를 상대에게 보내지 못했어요.', 'warn'));
    if (Math.random() < 0.3) S.db.collection(`inbox/${to}/items`).where('t', '<', Date.now() - 3 * 86400000).limit(20).get().then(q => q.docs.forEach(d => S.db.doc(`inbox/${to}/items/${d.id}`).delete().catch(() => {}))).catch(() => {});
  }
  function onInbox(snap) { for (const ch of snap.docChanges()) if (ch.type === 'added' && !inboxDone.has(ch.doc.id)) inboxQ.push({ id: ch.doc.id, d: ch.doc.data() }); processInbox(); }
  async function processInbox() {
    if (inboxBusy) return; inboxBusy = true;
    try {
      while (inboxQ.length) {
        const { id, d } = inboxQ.shift(); if (inboxDone.has(id)) continue; inboxDone.add(id);
        G.inboxDone = (G.inboxDone || []).concat([id]).slice(-300);
        try { if (d && d.wseed === S.world.seed && okXY(d.tile) && typeof d.from === 'string' && d.from !== S.uid && S.players[d.from] && Math.abs((+d.at || 0) - G.time) < 2880) applyRaid(d); } catch (e) { console.error(e); }
        await S.db.doc(`inbox/${S.uid}/items/${id}`).delete().catch(() => {});
      }
    } finally { inboxBusy = false; }
  }
  function applyRaid(d) {
    const t = tileAt(d.tile[0], d.tile[1]);
    const f = G.factions[d.from]; if (!f) return;
    if (!Array.isArray(d.def) || !d.def.length) { if (d.win && t.owner === 'P' && !isMyCap(t)) { captureTile(t, d.from); addLog(`${f.name}이(가) 무방비 땅 (${t.x},${t.y})를 점령했어요!`, 'bad'); changed('own'); } return; }
    // 성벽은 공격한 쪽이 넣은 값 그대로(숫자만 다듬음), 병사는 검사
    const walls = (Array.isArray(d.def) ? d.def : []).filter(s => s && s.isBuilding).slice(0, 12).map(s => ({ isBuilding: true, name: String(s.name || '성벽').slice(0, 10), hp: num(s.hp, 1, 20000), atk: num(s.atk, 0, 500), range: clamp(Math.floor(+s.range || 3), 1, 5) }));
    const mine = new Set(G.player.soldiers.map(s => s.id));
    const def = cleanList(d.def).filter(sp => sp.soldierId == null || mine.has(sp.soldierId)).concat(walls), atk = cleanList(d.atk, 40);
    if (!atk.length) return;
    const opts = { policy: d.opts && has(POLICIES, d.opts.policy) ? d.opts.policy : 'none', policyD: G.player.policy, capitalLv: num(d.opts && d.opts.capitalLv, 1, 30) };
    const res = seededBattle(Number(d.seed) >>> 0, atk, def, opts);
    G.stats.battles++;
    G.pendingBattles.push({ res, tile: [t.x, t.y], label: f.name + ' 침공', attacker: d.from, time: G.time, defense: true, terrain: t.type });
    if ((res.winner === 'A') !== !!d.win) console.warn('raid replay mismatch', res.winner, d.win);
    applyDefense(res, t, f.name, d.from, !!d.win);
  }

  /* ── 내 상태 올리기 ───────────────────────────────────── */
  function myPublic() {
    const P = G.player, f = G.factions.P;
    const st = {}; for (const a of G.armies) if (a.owner === 'P' && a.state === 'wait') { const t = tileAt(a.x, a.y); if (t) st[t.i] = a.units.map(soldierById).filter(Boolean).map(soldierSpec); }
    return {
      season: S.world.season, seed: S.world.seed, color: f.color, dark: f.dark, cap: f.cap, capHp: P.capHp, capLv: P.buildings.capital, towers: towerLevels(),
      tiles: tileStateList(true).map(([i, , prot, fort, ruin, ot]) => [i, ot || 0, prot || 0, fort ? 1 : 0, ruin || 0]),
      gar: P.soldiers.filter(s => !s.army).slice(0, 60).map(soldierSpec), st,
      arm: G.armies.filter(a => a.owner === 'P').map(a => ({ id: a.id, from: a.from, to: a.to, start: a.start, speed: a.speed, dist: a.dist, state: a.state, x: a.x, y: a.y, n: a.units.length, types: [...new Set(a.units.map(id => { const s = soldierById(id); return s ? s.type : null; }).filter(Boolean))].slice(0, 3) })),
      gk: G.giants.filter(g => g.dead && g.by === 'P').map(g => g.x + ',' + g.y),
      score: scoreOf('P'), upd: Date.now(),
    };
  }
  async function publish() {
    if (!S.joined || pubBusy || S.readOnly) return;
    dirty.clear(); const body = myPublic(); const cmp = JSON.stringify(Object.assign({}, body, { upd: 0 }));
    if (cmp === lastPubBody) return;
    pubBusy = true; lastPub = Date.now(); const g0 = gen;
    try { await S.db.doc('players/' + S.uid).set(body); if (g0 === gen) lastPubBody = cmp; } catch (e) { if (g0 === gen) writeErr(e); } finally { if (g0 === gen) pubBusy = false; }
  }
  async function saveNow(force) {
    if (!S.joined || saveBusy || !G || S.readOnly) return;
    const g = serialize(); if (g === lastSave && !force) return;
    saveBusy = true; lastSaveAt = Date.now(); const g0 = gen, w = S.world;
    try { await S.db.doc(`data/users/${S.uid}/state`).set({ seed: w.seed, season: w.season, g, t: Date.now() }); if (g0 === gen) lastSave = g; } catch (e) { if (g0 === gen) writeErr(e); } finally { if (g0 === gen) saveBusy = false; }
  }
  function update() {
    if (!S.joined) return;
    if (terrainDirty) { terrainDirty = false; rebuildTerrain(); }
    const now = Date.now();
    if (dirty.size && !pubBusy && now - lastPub > 2000) publish();
    else if (!pubBusy && now - lastCheck > 20000) { lastCheck = now; publish(); } // 성벽 회복처럼 조용히 바뀐 값
    if (!saveBusy && now - lastSaveAt > 30000) saveNow();
  }

  /* ── 다른 플레이어의 행군 (공개된 출발 시각으로 위치 계산) ── */
  function armies() {
    if (!S.joined || !G) return [];
    const out = [];
    for (const [id, d] of Object.entries(S.players)) {
      if (!G.factions[id] || !Array.isArray(d.arm)) continue;
      for (const a of d.arm.slice(0, 12)) {
        if (!a || !okXY(a.from) || !okXY(a.to)) continue;
        let x = +a.x || a.to[0], y = +a.y || a.to[1];
        if (a.state !== 'wait') { const f = clamp((G.time - (+a.start || 0)) * (+a.speed || 60) / 60 / Math.max(1, +a.dist || 1), 0, 1); x = a.from[0] + (a.to[0] - a.from[0]) * f; y = a.from[1] + (a.to[1] - a.from[1]) * f; }
        out.push({ key: id + ':' + a.id, id: +a.id || 0, owner: id, state: a.state === 'wait' ? 'wait' : a.state === 'return' ? 'return' : 'march', from: a.from, to: a.to, x, y, n: clamp(+a.n || 0, 0, 99), types: Array.isArray(a.types) ? a.types.filter(t => has(UNITS, t)).slice(0, 3) : [] });
      }
    }
    return out;
  }

  /* ── 채팅 ────────────────────────────────────────────── */
  function cleanupChat() { S.db.collection('chat').where('t', '<', Date.now() - 3 * 86400000).limit(30).get().then(q => q.docs.forEach(d => S.db.doc('chat/' + d.id).delete().catch(() => {}))).catch(() => {}); }
  function onChat(snap) { S.chat = snap.docs.map(d => d.data()).filter(m => m && typeof m.text === 'string' && typeof m.by === 'string').reverse(); refreshNames(); fire('chat'); }
  async function say(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200); if (!text || !S.db) return '메시지를 입력하세요.';
    try { await S.db.collection('chat').add({ t: Date.now(), by: S.uid, text }); } catch (e) { writeErr(e); return '보내지 못했어요.'; }
    return null;
  }

  return {
    S, connect, createWorld, join, leave, worldTime, speedOf, remoteDefenders, sendRaid, armies, say, nameOf, saveNow,
    dirty(kind) { dirty.add(kind || 'x'); }, update, on(f) { listeners.push(f); },
    get ok() { return S.status === 'ready'; }, get joined() { return S.joined; },
  };
})();
