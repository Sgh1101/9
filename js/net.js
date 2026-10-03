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
  const inboxDone = new Set(); let inboxBusy = false; const inboxQ = [];
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
      S.admin = await user.canEdit().catch(() => false);
      S.canWrite = await user.can('data.write').catch(() => null);
      db.doc('world/meta').onSnapshot(s => { S.world = s.exists ? cleanWorld(s.data()) : null; if (S.status !== 'ready') S.status = 'ready'; onWorld(); fire('world'); }, e => { S.status = 'error'; S.err = e.code; fire('status'); });
      if (room) {
        room.presence({ uid: S.uid }).catch(() => {});
        room.onPeers(ch => { const on = new Set(); for (const p of ch.peers) { if (p.kind !== 'viewer') continue; const id = p.by || (p.presence && typeof p.presence.uid === 'string' ? p.presence.uid : null); if (id) on.add(id); } S.online = on; markOnline(); fire('online'); }, () => {});
      }
    } catch (e) { S.status = 'off'; S.err = String((e && e.code) || e); fire('status'); }
  }
  function cleanWorld(w) { if (!w || !Number.isFinite(w.seed) || !Number.isFinite(w.created)) return null; return { seed: w.seed >>> 0, speed: WORLD_SPEEDS.some(s => s.id === w.speed) ? w.speed : 'x24', created: w.created, t0: Number.isFinite(w.t0) ? w.t0 : 480, season: Number.isFinite(w.season) ? w.season : 1 }; }
  function speedOf() { const w = S.world; return (w && WORLD_SPEEDS.find(s => s.id === w.speed)) || WORLD_SPEEDS[2]; }
  function worldTime() { const w = S.world; if (!w) return 0; return Math.floor(w.t0 + Math.max(0, Date.now() - w.created) / 1000 * speedOf().mul); }
  function onWorld() {
    if (!S.joined) return;
    // 시즌이 새로 시작되면 (편집자가 월드를 다시 만들면) 첫 화면으로
    if (!S.world || S.world.seed !== G.seed || S.world.season !== G.season) { leave(); fire('reset'); }
  }
  function writeErr(e) { if (e && e.code === 'invalid_argument') { S.readOnly = true; fire('readonly'); } else if (e && e.code === 'quota_exceeded') { addLog('공유 저장소가 가득 찼어요. 월드 주인에게 알려 주세요.', 'bad'); } }

  async function createWorld(speedId) {
    if (!S.db) return '온라인을 쓸 수 없어요.';
    const prev = S.world;
    const w = { seed: Math.floor(Math.random() * 1e9), speed: speedId, created: Date.now(), t0: 8 * 60, season: ((prev && prev.season) || 0) + 1 };
    try { await S.db.doc('world/meta').set(w); return null; } catch (e) { return e && e.code === 'invalid_argument' ? '월드를 만들 권한이 없어요 (편집자만 가능).' : '월드를 만들지 못했어요.'; }
  }

  /* ── 입장 ────────────────────────────────────────────── */
  async function join() {
    const w = S.world; if (!w) return '아직 월드가 없어요.';
    S.players = {};
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
    G.mode = 'mp'; G.season = w.season; G.speed = 1; G.paused = false; G.over = null; G.factions.P.name = '나';
    S.joined = true; S.readOnly = false; lastPubBody = ''; lastSave = '';
    for (const [id, d] of Object.entries(docs)) if (id !== S.uid) { S.players[id] = d; applyPlayer(id, d); }
    rebuildTerrain(); terrainDirty = false;
    joinSubs.push(S.db.collection('players').onSnapshot(onPlayers, () => {}));
    joinSubs.push(S.db.collection(`inbox/${S.uid}/items`).onSnapshot(onInbox, () => {}));
    joinSubs.push(S.db.collection('chat').orderBy('t', 'desc').limit(40).onSnapshot(onChat, () => {}));
    refreshNames(); markOnline();
    dirty.add('join'); publish(); saveNow(true);
    return null;
  }
  function leave() { for (const u of joinSubs) try { u(); } catch (e) {} joinSubs = []; S.joined = false; S.players = {}; inboxQ.length = 0; }

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
    Object.assign(f, { color: hex(d.color, '#9aa9c4'), dark: hex(d.dark, '#6b7894'), cap: [d.cap[0], d.cap[1]], capHp: clamp(Math.floor(+d.capHp || 0), 0, CONST.CAP_HP), capLv: clamp(Math.floor(+d.capLv || 1), 1, 30), towers: Array.isArray(d.towers) ? d.towers.slice(0, 10).map(v => clamp(Math.floor(+v || 0), 0, 10)) : [], online: S.online.has(id) });
    const N = CONST.MAP * CONST.MAP;
    const list = Array.isArray(d.tiles) ? d.tiles.filter(e => Array.isArray(e) && Number.isInteger(e[0]) && e[0] >= 0 && e[0] < N).slice(0, 2000) : [];
    const want = new Set(list.map(e => e[0]));
    for (const t of ownedTiles(id)) if (!want.has(t.i)) { setOwner(t, null); t.protect = 0; }
    for (const [i, ot0, prot, fort, ruin] of list) {
      const t = tileI(i), ot = +ot0 || 0;
      if (t.owner && t.owner !== id && (t.ot || 0) > ot) continue; // 더 늦게 점령한 쪽이 주인
      if (t.owner !== id || t.ot !== ot) {
        const prev = t.owner; setOwner(t, id, ot);
        if (prev === 'P') { const st = stationAt(t.x, t.y); if (st) returnHome(st); changed('own'); }
      }
      t.protect = +prot || 0;
      if (!!fort !== (t.fort === id)) setFort(t, fort ? id : null);
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
    if (slot === 'special') { const sp = SPECIAL_EQUIP[it.special]; if (!sp) return null; return { uid: String(it.uid || '').slice(0, 16), id: 'special', special: it.special, name: sp.name, slot: 'special', hp: num(it.hp, 0, sp.hp[1]), atk: num(it.atk, 0, sp.atk[1]), desc: sp.desc }; }
    const e = EQUIPMENT[it.id]; if (!e || e.slot !== slot) return null;
    const o = { uid: String(it.uid || '').slice(0, 16), id: it.id, name: e.name, slot: e.slot };
    if (e.hp) o.hp = num(it.hp, 0, e.hp[1]); if (e.atk) o.atk = num(it.atk, 0, e.atk[1]); if (e.v) o.v = num(it.v, 0, e.v[1]);
    return o;
  }
  function cleanSpec(sp) {
    if (!sp || typeof sp !== 'object') return null;
    if (sp.isBuilding) return null; // 성벽은 받는 쪽이 계산
    if (!UNITS[sp.typeId]) return null;
    const o = { uid: String(sp.uid || '').slice(0, 16), typeId: sp.typeId, lv: clamp(Math.floor(+sp.lv || 1), 1, 6) };
    if (Number.isInteger(sp.soldierId)) o.soldierId = sp.soldierId;
    if (sp.hpMul) o.hpMul = num(sp.hpMul, 0.5, 3); if (sp.atkMul) o.atkMul = num(sp.atkMul, 0.5, 3);
    const h = sp.hero; if (h && HEROES[h.heroId] && HEROES[h.heroId].unit === sp.typeId) { const H = HEROES[h.heroId]; o.hero = { heroId: h.heroId, name: H.name, hp: num(h.hp, 0, H.hp[1]), atk: num(h.atk, 0, H.atk[1]), v1: num(h.v1, 0, (HERO_RANGES[h.heroId] || [0, 0])[1]), talent: typeof h.talent === 'string' && h.talent.length < 24 ? h.talent : null, grade: clamp(Math.floor(+h.grade || 0), 0, 8) }; }
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
  }
  function onInbox(snap) { for (const ch of snap.docChanges()) if (ch.type === 'added' && !inboxDone.has(ch.doc.id)) inboxQ.push({ id: ch.doc.id, d: ch.doc.data() }); processInbox(); }
  async function processInbox() {
    if (inboxBusy) return; inboxBusy = true;
    try {
      while (inboxQ.length) {
        const { id, d } = inboxQ.shift(); if (inboxDone.has(id)) continue; inboxDone.add(id);
        try { if (d && d.wseed === S.world.seed && okXY(d.tile)) applyRaid(d); } catch (e) { console.error(e); }
        await S.db.doc(`inbox/${S.uid}/items/${id}`).delete().catch(() => {});
      }
    } finally { inboxBusy = false; }
  }
  function applyRaid(d) {
    const t = tileAt(d.tile[0], d.tile[1]);
    if (!G.factions[d.from]) G.factions[d.from] = { id: d.from, remote: true, alive: true, name: S.names[d.from] || '영주', color: '#9aa9c4', dark: '#6b7894', capMax: CONST.CAP_HP };
    const f = G.factions[d.from];
    // 성벽은 공격한 쪽이 넣은 값 그대로(숫자만 다듬음), 병사는 검사
    const walls = (Array.isArray(d.def) ? d.def : []).filter(s => s && s.isBuilding).slice(0, 12).map(s => ({ isBuilding: true, name: String(s.name || '성벽').slice(0, 10), hp: num(s.hp, 1, 20000), atk: num(s.atk, 0, 500), range: clamp(Math.floor(+s.range || 3), 1, 5) }));
    const def = cleanList(d.def).concat(walls), atk = cleanList(d.atk, 40);
    const opts = { policy: POLICIES[d.opts && d.opts.policy] ? d.opts.policy : 'none', capitalLv: num(d.opts && d.opts.capitalLv, 1, 30) };
    const res = seededBattle(Number(d.seed) >>> 0, atk, def, opts);
    G.stats.battles++;
    G.pendingBattles.push({ res, tile: [t.x, t.y], label: f.name + ' 침공', attacker: d.from, time: G.time, defense: true, terrain: t.type });
    applyDefense(res, t, f.name, d.from);
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
    pubBusy = true; lastPub = Date.now();
    try { await S.db.doc('players/' + S.uid).set(body); lastPubBody = cmp; } catch (e) { writeErr(e); } finally { pubBusy = false; }
  }
  async function saveNow(force) {
    if (!S.joined || saveBusy || !G || S.readOnly) return;
    const g = serialize(); if (g === lastSave && !force) return;
    saveBusy = true; lastSaveAt = Date.now();
    try { await S.db.doc(`data/users/${S.uid}/state`).set({ seed: S.world.seed, season: S.world.season, g, t: Date.now() }); lastSave = g; } catch (e) { writeErr(e); } finally { saveBusy = false; }
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
        out.push({ key: id + ':' + a.id, id: +a.id || 0, owner: id, state: a.state === 'wait' ? 'wait' : a.state === 'return' ? 'return' : 'march', from: a.from, to: a.to, x, y, n: clamp(+a.n || 0, 0, 99), types: Array.isArray(a.types) ? a.types.filter(t => UNITS[t]) : [] });
      }
    }
    return out;
  }

  /* ── 채팅 ────────────────────────────────────────────── */
  function onChat(snap) { S.chat = snap.docs.map(d => d.data()).filter(m => m && typeof m.text === 'string' && typeof m.by === 'string').reverse(); refreshNames(); fire('chat'); }
  async function say(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200); if (!text || !S.db) return '메시지를 입력하세요.';
    try { await S.db.collection('chat').add({ t: Date.now(), by: S.uid, text }); } catch (e) { writeErr(e); return '보내지 못했어요.'; }
    // 오래된 채팅 정리 (사흘 지난 것)
    if (Math.random() < 0.1) S.db.collection('chat').where('t', '<', Date.now() - 3 * 86400000).limit(20).get().then(s => s.docs.forEach(d => S.db.doc('chat/' + d.id).delete().catch(() => {}))).catch(() => {});
    return null;
  }

  return {
    S, connect, createWorld, join, leave, worldTime, speedOf, remoteDefenders, sendRaid, armies, say, nameOf, saveNow,
    dirty(kind) { dirty.add(kind || 'x'); }, update, on(f) { listeners.push(f); },
    get ok() { return S.status === 'ready'; }, get joined() { return S.joined; },
  };
})();
