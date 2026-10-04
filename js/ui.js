/* ============================================================
   UI — HUD, 패널(바텀시트), 타일 팝업, 전투 화면, 시작 화면, 입력, 게임 루프
   ============================================================ */
'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ic = (n, cls = '') => `<svg class="ic ${cls}"><use href="#i-${n}"/></svg>`;
const RES_BG = { food: '#fff3c4', wood: '#ffe4cc', stone: '#ece8f6', scroll: '#ffe1d8' };
const BICON = { capital: 'castle', barracks: 'sword', stable: 'horse', smithy: 'anvil', factory: 'gear', ground: 'target', hall: 'hero', warehouse: 'crate', hospital: 'cross', embassy: 'flag' };
const TERRAIN_NAME = { plain: '평야', forest: '숲', hill: '구릉', capital: '거점', ruin: '유적' };
const TERRAIN_IC = { plain: 'food', forest: 'wood', hill: 'stone', capital: 'castle', ruin: 'star' };
const SEASON_IC = { spring: 'spring', summer: 'summer', autumn: 'autumn', winter: 'winter' };
const SEASON_BG = { spring: '#ff8fbf', summer: '#2fc1a0', autumn: '#ff9a3c', winter: '#6f9fd8' };

const UI = { panel: null, args: {}, selected: null, armyPick: new Set(), armyStay: false, battleOpen: false, autoBattle: false, codexTab: 'units', soldierTab: 'list', armyTab: 'send', troopEdit: null, started: false, lastPanel: '', lastPop: '', mode: 'world', place: null, baseSel: null };
let VIEW = null;
const pColor = () => (G && G.factions ? G.factions.P.color : '#ffc23d');
const fName = (fid) => { const f = G.factions[fid]; return f ? f.name : '영주'; };
const fColor = (fid) => { const f = G.factions[fid]; return f ? f.color : '#9aa9c4'; };

/* ── 공용 조각 ─────────────────────────────────────────── */
function costChips(c) { return Object.keys(c).map(r => `<span class="chip ${(G.player.res[r] || 0) < c[r] ? 'lack' : ''}">${ic(r)} ${fmt(c[r])}</span>`).join(''); }
function unitPortrait(typeId, hero, cls = '') { return hero && hero.heroId ? Portrait.hero(hero.heroId, pColor(), cls) : Portrait.unit(typeId, pColor(), hero, cls); }
function gradeBadge(g) { return `<span class="grade g${g}">${GRADES[g]}</span>`; }
function soldierStats(s) {
  const t = UNITS[s.type], li = s.lv - 1; let hp = t.hp[li], atk = t.atk[li];
  if (s.hero) { hp += s.hero.hp; atk += s.hero.atk; }
  for (const k of ['weapon', 'armor', 'special']) if (s[k]) { hp += s[k].hp || 0; atk += s[k].atk || 0; }
  return { hp, atk };
}
function talentName(id) { for (const k in TALENTS) { const t = TALENTS[k].find(x => x.id === id); if (t) return `${t.name}(${t.desc})`; } return id; }
function tileLabel(t) { const grand = t.type === 'ruin' && G.ruins[12] && G.ruins[12][0] === t.x && G.ruins[12][1] === t.y; return `${grand ? '대유적' : TERRAIN_NAME[t.type]}${t.ruin && t.type !== 'ruin' ? ' 유적' : ''}${giantOf(t) ? ' · 거대 야수' : ''}${t.fort ? ' · 요새' : ''}`; }
function specPortrait(sp, cls = 'xs', color) {
  if (sp.monsterId) return Portrait.monster(sp.monsterId, cls);
  if (sp.isBuilding) return Portrait.building(sp.name.includes('요새') ? 'fort' : 'castle', color || pColor(), cls);
  return Portrait.unit(sp.typeId, color || pColor(), !!sp.hero, cls);
}
function specName(sp) { return sp.monsterId ? MONSTERS[sp.monsterId].name : sp.isBuilding ? sp.name : `${UNITS[sp.typeId].name} Lv${sp.lv}${sp.hero ? ' · ' + sp.hero.name : ''}`; }
function specHp(sp) { if (sp.monsterId) return Math.round(MONSTERS[sp.monsterId].hp * sp.scale); if (sp.isBuilding) return sp.hp; const t = UNITS[sp.typeId]; return Math.round((t.hp[sp.lv - 1] + (sp.hero ? sp.hero.hp : 0)) * (sp.hpMul || 1)); }
function specAtk(sp) { if (sp.monsterId) return Math.round(MONSTERS[sp.monsterId].atk * Math.pow(sp.scale, 0.8)); if (sp.isBuilding) return sp.atk; const t = UNITS[sp.typeId]; return Math.round((t.atk[sp.lv - 1] + (sp.hero ? sp.hero.atk : 0)) * (sp.atkMul || 1)); }
// 같은 종류는 묶어서 보여 준다
function groupSpecs(specs) { const m = new Map(); for (const sp of specs) { const k = sp.monsterId || (sp.isBuilding ? 'b' + sp.name : sp.typeId + sp.lv + (sp.hero ? sp.hero.heroId : '')); const e = m.get(k); if (e) e.n++; else m.set(k, { sp, n: 1 }); } return [...m.values()]; }

/* ── HUD ────────────────────────────────────────────────── */
function renderTop() {
  const P = G.player, pr = production(), s = season(), cap = storageCap();
  const r = (k, v, rate) => `<div class="res ${v >= cap - 1 ? 'full' : ''}"><span class="ib" style="background:${RES_BG[k]}">${ic(k)}</span><span><b>${fmt(v)}</b><small class="${rate < 0 ? 'neg' : ''}">${rate >= 0 ? '+' : ''}${Math.round(rate)}/시</small></span></div>`;
  setHTML('#resbar', r('food', P.res.food, pr.foodNet) + r('wood', P.res.wood, pr.wood) + r('stone', P.res.stone, pr.stone) + `<div class="res"><span class="ib" style="background:${RES_BG.scroll}">${ic('scroll')}</span><span><b>${P.scroll}</b><small style="color:var(--ink2)">두루마리</small></span></div>`);
  const day = Math.floor(G.time / 1440) + 1, hh = Math.floor(G.time % 1440 / 60), mm = Math.floor(G.time % 60);
  const se = $('#season'); se.style.background = SEASON_BG[s.id]; setHTML('#season', `${ic(SEASON_IC[s.id])}${s.name} · ${day}일차`);
  setHTML('#clock', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  const pvp = pvpOpen(); $('#pvp').classList.toggle('on', pvp); setHTML('#pvp', pvp ? 'PvP 개방!' : 'PvP 20:00~24:00');
  setHTML('#land', `${ic('land')}${tilesOf('P')}/${territoryCap()}`);
  const mp = isMP(); $('#speed').hidden = mp; $('#net').hidden = !mp;
  if (mp) setHTML('#net', `<b class="on"></b>접속 ${Math.max(1, NET.S.online.size)}${NET.S.readOnly ? ' · 읽기 전용' : ''}`);
  document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', (G.paused && b.dataset.s === '0') || (!G.paused && +b.dataset.s === G.speed)));
  const q = [];
  const qc = (label, x) => `<span class="q">${label}<span class="bar"><i style="width:${Math.round((1 - x.remain / x.total) * 100)}%"></i></span>${durStr(x.remain)}</span>`;
  for (const bq of P.buildQueue) q.push(qc(`${ic('build')} ${queueName(bq)}`, bq));
  if (P.recruitQueue[0]) q.push(qc(`${ic('sword')} ${UNITS[P.recruitQueue[0].type].name}${P.recruitQueue.length > 1 ? ' +' + (P.recruitQueue.length - 1) : ''}`, P.recruitQueue[0]));
  if (P.trainQueue[0]) q.push(qc(`${ic('target')} 훈련`, P.trainQueue[0]));
  if (P.craftQueue[0]) q.push(qc(`${ic('anvil')} ${EQUIPMENT[P.craftQueue[0].id].name}`, P.craftQueue[0]));
  setHTML('#queues', q.join(''));
}
function setHTML(sel, html) { const el = typeof sel === 'string' ? $(sel) : sel; if (el && el._h !== html) { el.innerHTML = html; el._h = html; } }

function renderToasts() {
  const now = Date.now(); G.toasts = G.toasts.filter(t => t.until > now);
  const glyph = { good: '✓', bad: '!', warn: '!', info: 'i' };
  setHTML('#toasts', G.toasts.slice(-3).map(t => `<div class="toast ${t.kind}"><span class="dot">${glyph[t.kind] || 'i'}</span><span>${esc(t.text)}</span></div>`).join(''));
}
function notice(msg, kind = 'warn') { if (msg) toast(msg, kind); renderToasts(); }

/* ── 패널 ───────────────────────────────────────────────── */
const PANELS = { build: panelBuild, soldiers: panelSoldiers, army: panelArmy, heroes: panelHeroes, equip: panelEquip, alliance: panelAlliance, codex: panelCodex, menu: panelMenu, soldier: panelSoldier, log: panelLog, worldmap: panelWorldmap };
const STATIC_PANELS = { menu: 1, codex: 1, log: 1, worldmap: 1 };
function openPanel(name, args = {}) { UI.panel = name; UI.args = args; UI.lastPanel = ''; $('#panel').hidden = false; renderPanel(true); $('#panelBody').scrollTop = 0; navState(); }
function closePanel() { UI.panel = null; UI.troopEdit = null; $('#panel').hidden = true; navState(); }
function navState() {
  document.querySelectorAll('#bottom button').forEach(b => b.classList.toggle('on', b.dataset.p === UI.panel || (UI.panel === 'soldier' && b.dataset.p === 'soldiers') || (b.dataset.p === 'mode' && UI.mode === 'base' && !UI.panel)));
  setHTML('#modeBtn', UI.mode === 'base' ? `${ic('land')}월드` : `${ic('castle')}요새`);
}
function renderPanel(force) {
  if (!UI.panel) return; if (!force && (STATIC_PANELS[UI.panel] || UI.pressing)) return;
  const { title, body } = PANELS[UI.panel](UI.args);
  setHTML('#panelTitle', title);
  if (body === UI.lastPanel) return; UI.lastPanel = body;
  const el = $('#panelBody'); const open = new Set([...el.querySelectorAll('details[data-k][open]')].map(d => d.dataset.k));
  // 입력 중인 글자와 커서를 지킨다
  const keep = {}; for (const inp of el.querySelectorAll('input[type=text][id], textarea[id]')) keep[inp.id] = inp.value; const focus = document.activeElement && el.contains(document.activeElement) ? document.activeElement.id : null;
  el.innerHTML = body;
  for (const id in keep) { const inp = el.querySelector('#' + id); if (inp) inp.value = keep[id]; } if (focus) { const f = el.querySelector('#' + focus); if (f) f.focus(); }
  const chat = el.querySelector('.chat'); if (chat) chat.scrollTop = chat.scrollHeight;
  el.querySelectorAll('details[data-k]').forEach(d => { if (open.has(d.dataset.k)) d.open = true; });
  if (UI.panel === 'worldmap') drawWorldmap();
}

function panelBuild() {
  const P = G.player;
  const rows = BUILDING_ORDER.map(id => {
    const b = BUILDINGS[id], lv = P.buildings[id] || 0, q = P.buildQueue.find(x => x.id === id && x.ex == null), c = buildCost(id), locked = b.req && P.buildings.capital < b.req, max = lv >= b.max;
    const capBlock = id !== 'capital' && lv + 1 > P.buildings.capital; const placed = !!P.base.layout[id];
    const btn = q ? `<span class="chip on">건설 중</span>` : max ? '' : !placed ? `<button data-a="place" data-id="${id}" ${locked ? 'disabled' : ''} class="${canAfford(c) && !capBlock && !locked ? 'primary' : ''}">${locked ? '거점 Lv' + b.req : '자리 정해 짓기'}</button>` : `<button data-a="build" data-id="${id}" ${locked ? 'disabled' : ''} class="${canAfford(c) && !capBlock ? 'primary' : ''}">${locked ? '거점 Lv' + b.req : lv ? '올리기' : '짓기'}</button>`;
    return `<div class="row ${locked ? 'dim' : ''}"><span class="ico-box">${ic(BICON[id])}</span><div class="grow"><div class="name">${b.name} <span class="lvb">Lv${lv}</span>${max ? '<span class="chip">MAX</span>' : ''}${placed || id === 'capital' ? '' : '<span class="chip">자리 없음</span>'}</div><div class="desc">${b.desc}</div>
      ${!max ? `<div class="stats">${costChips(c)}<span class="chip">${durStr(buildTime(id))}</span>${capBlock ? '<span class="chip lack">거점 레벨 필요</span>' : ''}</div>` : ''}${q ? `<div class="bar"><i style="width:${Math.round((1 - q.remain / q.total) * 100)}%"></i></div><div class="muted">${durStr(q.remain)} 남음</div>` : ''}</div>${btn}</div>`;
  }).join('');
  const towers = P.base.extras.map((e, k) => ({ e, k })).filter(o => o.e.id === 'tower');
  const tw = towers.map(({ e, k }) => { const q = P.buildQueue.find(x => x.ex === k); const c = extraCost(e); return `<div class="row"><span class="ico-box">${ic('shield')}</span><div class="grow"><div class="name">망루 <span class="lvb">Lv${e.lv}</span><span class="chip">(${e.x},${e.y})</span></div>${q ? `<div class="bar"><i style="width:${Math.round((1 - q.remain / q.total) * 100)}%"></i></div><div class="muted">${durStr(q.remain)} 남음</div>` : e.lv < BASE_EXTRAS.tower.max ? `<div class="stats">${costChips(c)}<span class="chip">${durStr(BASE_EXTRAS.tower.time(e.lv + 1) * 3)}</span></div>` : ''}</div>${q ? '<span class="chip on">공사 중</span>' : e.lv < BASE_EXTRAS.tower.max ? `<button data-a="xup" data-id="${k}" class="${canAfford(c) ? 'primary' : ''}">올리기</button>` : ''}</div>`; }).join('');
  const extras = Object.keys(BASE_EXTRAS).map(k => { const X = BASE_EXTRAS[k]; const c = X.cost(1); return `<div class="row"><span class="ico-box">${ic(k === 'tower' ? 'shield' : 'star')}</span><div class="grow"><div class="name">${X.name}${X.deco ? '<span class="chip">장식</span>' : ''}</div><div class="desc">${X.desc}</div><div class="stats">${costChips(c)}</div></div><button data-a="placex" data-id="${k}">놓기</button></div>`; }).join('');
  return { title: `${ic('build')} 건설 <small>거점 Lv${P.buildings.capital} · 대기열 ${P.buildQueue.length}/2</small>`, body: `
    <div class="stats"><span class="chip">저장 상한 ${fmt(storageCap())}</span><span class="chip">영토 상한 ${territoryCap()}칸</span><span class="chip">부대 인원 ${armyCap()}</span><span class="chip">동시 출전 ${maxArmies()}</span><span class="chip">부대 수 ${troopSlots()}</span><span class="chip">망루 ${towers.length}/${towerSlots()}</span><span class="chip">거점 내구 ${'♥'.repeat(P.capHp)}${'♡'.repeat(CONST.CAP_HP - P.capHp)}</span></div>
    <p class="note">요새 안 10×10 부지에 건물을 놓아요. 모든 건물은 거점(본관) 레벨을 넘을 수 없어요. <b>요새</b> 화면에서 건물을 눌러 올리고, 빈 터를 눌러 새로 지을 수 있어요.</p>
    <div class="btns"><button data-a="enterbase" class="mint">${ic('castle')} 요새 안으로</button></div>${rows}
    <h3>${ic('shield')} 망루 <span class="n">거점 3레벨마다 1개 · 거점 수비전에 참전</span></h3>${tw || '<p class="muted">아직 망루가 없어요.</p>'}
    <h3>${ic('star')} 망루·장식 놓기</h3>${extras}` };
}

function panelSoldiers() {
  const P = G.player; const tab = UI.soldierTab;
  const tabs = `<div class="tabs"><button data-a="stab" data-id="list" class="${tab === 'list' ? 'on' : ''}">보유 병사 ${P.soldiers.length}</button><button data-a="stab" data-id="recruit" class="${tab === 'recruit' ? 'on' : ''}">모집 ${P.recruitQueue.length ? '(' + P.recruitQueue.length + ')' : ''}</button>${P.hospital.length ? `<button data-a="stab" data-id="hospital" class="${tab === 'hospital' ? 'on' : ''}">병원 ${P.hospital.length}</button>` : ''}</div>`;
  let body = '';
  if (tab === 'list') {
    const list = [...P.soldiers].sort((a, b) => (a.army ? 1 : 0) - (b.army ? 1 : 0) || UNIT_ORDER.indexOf(a.type) - UNIT_ORDER.indexOf(b.type) || b.lv - a.lv);
    body = list.map(s => { const t = UNITS[s.type], st = soldierStats(s), tq = P.trainQueue.find(q => q.sid === s.id);
      return `<div class="row"><span>${unitPortrait(s.type, s.hero)}</span><div class="grow"><div class="name">${t.name} <span class="lvb">Lv${s.lv}</span>${s.hero ? `<span class="chip hero">${HEROES[s.hero.heroId].name} ${GRADES[s.hero.grade]}</span>` : ''}</div>
        <div class="stats"><span class="chip">체력 ${st.hp}</span><span class="chip">공격 ${st.atk}</span>${s.weapon ? `<span class="chip">${ic('sword')}${s.weapon.name}</span>` : ''}${s.armor ? `<span class="chip">${ic('shield')}${s.armor.name}</span>` : ''}${s.special ? `<span class="chip">${ic('star')}전용</span>` : ''}${tq ? `<span class="chip on">훈련 ${durStr(tq.remain)}</span>` : ''}${s.army ? '<span class="chip on">출전 중</span>' : ''}</div></div>
        <button data-a="soldier" data-id="${s.id}">관리</button></div>`; }).join('') || '<p class="muted">병사가 없어요. 모집 탭에서 병사를 뽑으세요.</p>';
    body = `<p class="muted">최대 병사 레벨 Lv${maxSoldierLv()} (군영 5/10/15/20레벨에 3/4/5/6). 식량 유지비 ${Math.round(production().upkeep)}/시</p>` + body;
  } else if (tab === 'recruit') {
    body = `<p class="note">같은 병종을 많이 쓸수록 비용 계수가 올라가요(동적 비용). 병사는 매시간 식량을 먹어요.</p>` + UNIT_ORDER.map(id => { const t = UNITS[id]; const ok = unitAvailable(id); const c = recruitCost(id); const k = usageCoeff(id);
      return `<div class="row ${ok ? '' : 'dim'}"><span>${unitPortrait(id, false)}</span><div class="grow"><div class="name">${t.name} <span class="chip" style="border-color:${CLASS_INFO[t.cls].color}">${CLASS_INFO[t.cls].name}</span>${t.est ? '<span class="chip">추정치</span>' : ''}</div>
        <div class="stats"><span class="chip">체력 ${t.hp[0]}</span><span class="chip">공격 ${t.atk[0]}</span><span class="chip">이동 ${t.move}</span><span class="chip">사거리 ${t.range}</span><span class="chip">식량 ${t.food}/시</span><span class="chip">${t.rage ? '분노 ' + t.rage : '분노 없음'}</span></div>
        <div class="desc">${t.desc}</div>${ok ? `<div class="stats">${costChips(c)}<span class="chip">${durStr(recruitTime(id))}</span>${k > 1 ? `<span class="chip lack">비용 ×${k.toFixed(2)}</span>` : ''}</div>` : ''}</div>
        ${ok ? `<button data-a="recruit" data-id="${id}" class="${canAfford(c) ? 'primary' : ''}">모집</button>` : `<span class="chip">${t.cls === 'cav' ? '마구간' : t.cls === 'siege' ? '공장' : '군영'} Lv${t.unlock}</span>`}</div>`; }).join('');
  } else {
    body = P.hospital.map(h => `<div class="row"><span>${unitPortrait(h.soldier.type, h.soldier.hero)}</span><div class="grow"><div class="name">${soldierName(h.soldier)}</div><div class="muted">퇴원까지 ${durStr(h.remain)}</div></div></div>`).join('');
  }
  return { title: `${ic('sword')} 병사`, body: tabs + body };
}

function panelSoldier({ id }) {
  const s = soldierById(id); if (!s) return { title: '병사', body: '<p class="muted">이 병사는 더 이상 없어요.</p><div class="btns"><button data-a="back" data-p="soldiers">병사 목록으로</button></div>' };
  const t = UNITS[s.type], P = G.player, st = soldierStats(s);
  const heroes = HERO_ORDER.filter(h => HEROES[h].unit === s.type);
  const heroBtns = heroes.map(h => { const hs = P.heroes[h]; const used = P.soldiers.find(x => x !== s && x.hero && x.hero.heroId === h); return `<button data-a="hero" data-id="${id}" data-h="${h}" ${hs ? '' : 'disabled'} class="${s.hero && s.hero.heroId === h ? 'on' : ''}">${HEROES[h].name}${hs ? ' ' + gradeBadge(hs.grade) : '<small>미보유</small>'}${used ? '<small>다른 병사가 사용 중</small>' : ''}</button>`; }).join('');
  const items = P.items.filter(it => it.slot !== 'special' || it.special === s.type);
  const slot = (k, label, icn) => s[k] ? `<div class="row"><span class="ico-box">${ic(icn)}</span><div class="grow"><div class="name">${label} · ${s[k].name}</div><div class="desc">${s[k].slot === 'special' ? s[k].desc : itemDesc(s[k])}</div></div><button data-a="unequip" data-id="${id}" data-k="${k}">빼기</button></div>` : `<div class="row dim"><span class="ico-box">${ic(icn)}</span><div class="grow"><div class="name">${label} · 비어 있음</div></div></div>`;
  const tq = P.trainQueue.find(q => q.sid === s.id); const tc = trainCost(s);
  return { title: `${unitPortrait(s.type, s.hero, 'sm')} ${t.name} <small>Lv${s.lv}</small>`, body: `
    <div class="row"><span>${unitPortrait(s.type, s.hero, 'lg')}</span><div class="grow"><div class="name">${t.name} <span class="lvb">Lv${s.lv}</span><span class="chip" style="border-color:${CLASS_INFO[t.cls].color}">${CLASS_INFO[t.cls].name}</span></div><div class="desc">${t.desc}${t.est ? ' (추정 수치)' : ''}</div>
      <div class="stats"><span class="chip">체력 ${st.hp}</span><span class="chip">공격 ${st.atk}</span><span class="chip">이동 ${t.move}</span><span class="chip">사거리 ${t.range}</span><span class="chip">식량 ${t.food}/시</span><span class="chip">${t.rage ? '분노 ' + t.rage : '분노 없음'}</span></div></div></div>
    <h3>${ic('target')} 훈련</h3>
    ${tq ? `<div class="bar"><i style="width:${Math.round((1 - tq.remain / tq.total) * 100)}%"></i></div><p class="muted">Lv${s.lv + 1}까지 ${durStr(tq.remain)}</p>` : t.cls === 'siege' ? '<p class="muted">병기는 훈련할 수 없어요.</p>' : s.lv >= maxSoldierLv() ? `<p class="muted">군영 레벨을 올려야 더 훈련할 수 있어요 (지금 최대 Lv${maxSoldierLv()}).</p>` : `<div class="row"><div class="grow"><div class="name">Lv${s.lv} → Lv${s.lv + 1}</div><div class="stats">${costChips(tc)}<span class="chip">${durStr(trainTime(s))}</span></div></div><button data-a="train" data-id="${id}" class="${canAfford(tc) ? 'primary' : ''}">훈련</button></div>`}
    <h3>${ic('hero')} 영웅 공봉</h3>
    <div class="btns">${heroBtns || '<span class="muted">이 병종의 영웅 데이터가 없어요.</span>'}${s.hero ? `<button data-a="hero" data-id="${id}" data-h="">공봉 해제</button>` : ''}</div>
    ${s.hero ? `<p class="note"><b>${HEROES[s.hero.heroId].name}</b> ${gradeBadge(s.hero.grade)} — ${HEROES[s.hero.heroId].desc} 효과 수치 ${s.hero.v1} · 체력 +${s.hero.hp} 공격 +${s.hero.atk}${s.hero.talent ? ' · 재능 ' + talentName(s.hero.talent) : ''}</p>` : ''}
    <h3>${ic('anvil')} 장비</h3>${slot('weapon', '무기', 'sword')}${slot('armor', '방어구', 'shield')}${slot('special', '전용', 'star')}
    ${items.length ? `<h3>보유 장비 <span class="n">${items.length}</span></h3>` + items.map(it => `<div class="row"><span class="ico-box">${ic(it.slot === 'special' ? 'star' : it.slot === 'weapon' ? 'sword' : 'shield')}</span><div class="grow"><div class="name">${it.name}</div><div class="desc">${it.slot === 'special' ? it.desc : itemDesc(it)}</div></div><button data-a="equip" data-id="${id}" data-u="${it.uid}">장착</button></div>`).join('') : ''}
    <div class="btns"><button data-a="back" data-p="soldiers">병사 목록</button><button data-a="dismiss" data-id="${id}" class="danger">해산</button></div>` };
}

function troopRow(tr, t, err) {
  const P = G.player, ready = troopReady(tr), out = G.armies.find(a => a.owner === 'P' && a.troop === tr.id);
  const pts = tr.members.map(soldierById).filter(Boolean).slice(0, 10).map(s => unitPortrait(s.type, s.hero, 'xs')).join('');
  const sp = ready.length ? Math.round(armySpeed(ready.map(s => s.id))) : 0;
  let eta = ''; if (t && ready.length) { const [ox, oy] = originFor(t.x, t.y); const d = Math.max(Math.abs(t.x - ox), Math.abs(t.y - oy)) || 1; eta = ` · 약 ${durStr(d / armySpeed(ready.map(s => s.id)) * 60)}`; }
  return `<div class="row troop"><span class="ico-box" style="background:${pColor()}33">${ic('flag')}</span><div class="grow"><div class="name">${esc(tr.name)} <span class="chip">${ready.length}/${tr.members.length}명 대기</span>${out ? `<span class="chip on">${out.state === 'wait' ? '주둔' : out.state === 'return' ? '귀환 중' : '출전 중'}</span>` : ''}</div>
    <div class="pts">${pts || '<span class="muted">비어 있어요. 편성 탭에서 병사를 넣으세요.</span>'}</div>${ready.length ? `<div class="muted">${sp}칸/시${eta}</div>` : ''}</div>
    ${t ? `<button data-a="tsend" data-id="${tr.id}" class="primary" ${ready.length && !err ? '' : 'disabled'}>${ic('flag')} 출전</button>` : `<button data-a="tedit" data-id="${tr.id}">편성</button>`}</div>`;
}
function panelArmy({ target }) {
  const P = G.player; const t = target ? tileAt(target[0], target[1]) : null; const tab = t ? UI.armyTab : 'troops';
  const tabs = `<div class="tabs">${t ? `<button data-a="atab" data-id="send" class="${tab === 'send' ? 'on' : ''}">출전</button>` : ''}<button data-a="atab" data-id="troops" class="${tab === 'troops' ? 'on' : ''}">부대 편성·집결</button></div>`;
  if (tab === 'troops') {
    if (UI.troopEdit != null) {
      const tr = P.troops.find(x => x.id === UI.troopEdit); if (!tr) { UI.troopEdit = null; return panelArmy({ target }); }
      const list = [...P.soldiers].sort((a, b) => (tr.members.includes(b.id) ? 1 : 0) - (tr.members.includes(a.id) ? 1 : 0) || UNIT_ORDER.indexOf(a.type) - UNIT_ORDER.indexOf(b.type) || b.lv - a.lv);
      const picks = list.map(s => { const u = UNITS[s.type], st = soldierStats(s), on = UI.armyPick.has(s.id); const other = troopOf(s.id); return `<label class="row pick ${on ? 'on' : ''}"><input type="checkbox" data-a="pick" data-id="${s.id}" ${on ? 'checked' : ''}>${unitPortrait(s.type, s.hero, 'sm')}<span class="grow"><span class="name">${u.name} <span class="lvb">Lv${s.lv}</span>${s.hero ? `<span class="chip hero">${HEROES[s.hero.heroId].name}</span>` : ''}${other && other !== tr ? `<span class="chip">${esc(other.name)}</span>` : ''}${s.army ? '<span class="chip on">출전 중</span>' : ''}</span><span class="muted">체력 ${st.hp} · 공격 ${st.atk} · ${CLASS_INFO[u.cls].speed}칸/시</span></span></label>`; }).join('');
      return { title: `${ic('flag')} ${esc(tr.name)} 편성`, body: `<p class="note">고른 병사들이 요새 집결지에 <b>${esc(tr.name)}</b> 깃발 아래 모여요. 다른 부대에 있던 병사는 이 부대로 옮겨 와요.</p>
        <div class="btns"><span class="chip">선택 ${UI.armyPick.size}/${armyCap()}명</span><button data-a="pickall">대기 병사 채우기</button><button data-a="pickclear">비우기</button></div>${picks || '<p class="muted">병사가 없어요.</p>'}
        <div class="btns sticky"><button data-a="tsave" class="primary">${ic('check')} 집결 완료</button><button data-a="tcancel">취소</button>${P.troops.length > 1 ? `<button data-a="tdel" data-id="${tr.id}" class="danger">부대 해체</button>` : ''}</div>` };
    }
    return { title: `${ic('flag')} 부대`, body: tabs + `<p class="note">부대를 미리 짜 두면 요새 집결지에 모여 있다가, 땅을 고르고 한 번에 출전해요. 부대 ${P.troops.length}/${troopSlots()} (거점 4레벨마다 +1) · 부대 인원 ${armyCap()}명 · 동시 출전 ${maxArmies()}부대</p>
      ${P.troops.map(tr => troopRow(tr, null)).join('')}
      <div class="btns"><button data-a="tadd" ${P.troops.length < troopSlots() ? '' : 'disabled'}>${ic('plus')} 부대 추가</button><button data-a="enterbase">${ic('castle')} 집결지 보기</button></div>` };
  }
  // 출전
  const err = canTarget(t), def = tileDefenders(t);
  const foeColor = t.owner && t.owner !== 'P' ? fColor(t.owner) : pColor();
  const defRow = def.specs.length ? `<div class="mons">${groupSpecs(def.specs).slice(0, 8).map(({ sp, n }) => `<div class="mon">${specPortrait(sp, 'xs', foeColor)}<b>${specName(sp)}${n > 1 ? ' ×' + n : ''}</b><span class="muted">체력 ${specHp(sp)} · 공격 ${specAtk(sp)}</span></div>`).join('')}</div>` : '';
  const avail = P.soldiers.filter(s => !s.army && !P.trainQueue.find(q => q.sid === s.id));
  for (const id of [...UI.armyPick]) if (!avail.find(s => s.id === id)) UI.armyPick.delete(id);
  const ids = [...UI.armyPick];
  const picks = avail.map(s => { const u = UNITS[s.type], st = soldierStats(s), on = UI.armyPick.has(s.id); return `<label class="row pick ${on ? 'on' : ''}"><input type="checkbox" data-a="pick" data-id="${s.id}" ${on ? 'checked' : ''}>${unitPortrait(s.type, s.hero, 'sm')}<span class="grow"><span class="name">${u.name} <span class="lvb">Lv${s.lv}</span>${s.hero ? `<span class="chip hero">${HEROES[s.hero.heroId].name}</span>` : ''}</span><span class="muted">체력 ${st.hp} · 공격 ${st.atk} · ${CLASS_INFO[u.cls].speed}칸/시</span></span></label>`; }).join('');
  return { title: `${ic('flag')} 출전`, body: tabs + `
    <div class="row"><span class="ico-box">${ic(TERRAIN_IC[t.type])}</span><div class="grow"><div class="name">(${t.x},${t.y}) ${tileLabel(t)} <span class="lvb">Lv${t.lv}</span></div><div class="desc">수비: ${esc(def.label)}</div>${err ? `<div class="bad">${err}</div>` : ''}</div></div>${defRow}
    <h3>${ic('flag')} 부대로 출전 <span class="n">출전 중 ${G.armies.filter(a => a.owner === 'P').length}/${maxArmies()}</span></h3>
    ${P.troops.map(tr => troopRow(tr, t, err)).join('')}
    <label class="row pick ${UI.armyStay ? 'on' : ''}"><input type="checkbox" data-a="stay" ${UI.armyStay ? 'checked' : ''}><span class="grow"><span class="name">도착 후 그 자리 대기</span><span class="muted">점령한 타일에 주둔해 지켜요. 왕복 시간도 아껴요.</span></span></label>
    <details data-k="manual"><summary>병사를 직접 골라 출전</summary>
      <div class="btns"><span class="chip">선택 ${ids.length}/${armyCap()}명</span><button data-a="pickall">전체 선택</button><button data-a="pickclear">비우기</button></div>
      ${picks || '<p class="muted">지금 출전할 수 있는 병사가 없어요.</p>'}
      <div class="btns"><button data-a="predict" ${ids.length && !err ? '' : 'disabled'}>전투 예측</button><button data-a="send" class="primary" ${ids.length && !err ? '' : 'disabled'}>${ic('flag')} 출전!</button></div>
      <div id="predict">${UI.predict && UI.predict.key === t.x + ',' + t.y + ':' + ids.join(',') ? UI.predict.html : ''}</div></details>` };
}

function panelHeroes() {
  const P = G.player; const hall = P.buildings.hall || 0;
  const byCls = {}; for (const h of HERO_ORDER) { const c = UNITS[HEROES[h].unit].cls; (byCls[c] = byCls[c] || []).push(h); }
  const frag = Object.keys(P.frags).filter(k => P.frags[k] > 0).map(k => `<span class="chip">${Portrait.unit(k, pColor(), false, 'xs')}${UNITS[k].name} ${P.frags[k]}</span>`).join('') || '<span class="muted">아직 잔편이 없어요. 전투에서 이기면 출전한 병종의 잔편을 얻어요.</span>';
  const probs = Object.keys(GRADE_TABLE).map(k => `<tr><td>${gradeBadge(+k)}</td><td>${GRADE_TABLE[k].map(([g, p]) => `${GRADES[g]} ${p}%`).join(' · ')}</td><td>${GRADE_PITY[k]}회</td></tr>`).join('');
  const sec = Object.keys(byCls).map(c => `<h3 style="color:${CLASS_INFO[c].color}">${CLASS_INFO[c].name}</h3>` + byCls[c].map(h => { const H = HEROES[h], st = P.heroes[h], fr = P.frags[H.unit] || 0;
    const btn = st ? (st.grade < 8 ? `<button data-a="reroll" data-h="${h}" ${hall ? '' : 'disabled'} class="${hall && fr >= REROLL_COST ? 'primary' : ''}">재그리기<small>잔편 ${REROLL_COST} (${fr})</small></button>` : '<span class="grade g8">운명</span>') : `<button data-a="unlock" data-h="${h}" ${hall ? '' : 'disabled'} class="${hall && fr >= HERO_UNLOCK_COST ? 'primary' : ''}">해제<small>잔편 ${HERO_UNLOCK_COST} (${fr})</small></button>`;
    return `<div class="row ${st || fr >= HERO_UNLOCK_COST ? '' : 'dim'}"><span>${Portrait.hero(h, pColor())}</span><div class="grow"><div class="name">${H.name} <span class="chip">${UNITS[H.unit].name}</span>${st ? gradeBadge(st.grade) : '<span class="chip">미보유</span>'}${H.est ? '<span class="chip">추정</span>' : ''}</div>
      ${st ? `<div class="stats"><span class="chip">체력 +${st.hp}</span><span class="chip">공격 +${st.atk}</span><span class="chip">효과 ${st.v1}</span>${st.talent ? `<span class="chip hero">${talentName(st.talent)}</span>` : ''}<span class="chip">천장 ${st.fails}/${GRADE_PITY[st.grade] != null ? GRADE_PITY[st.grade] : '-'}</span></div>` : ''}
      <div class="desc">${H.desc}</div></div>${btn}</div>`; }).join('')).join('');
  return { title: `${ic('hero')} 영웅 초상화 <small>영웅전당 Lv${hall}</small>`, body: `
    <p class="note">영웅은 따로 싸우지 않아요. 같은 병종 병사에게 초상화를 공봉하면 그 병사의 스킬이 영웅 재능으로 바뀌어요. ${hall ? '' : '<b class="bad">영웅전당(거점 Lv8)을 지어야 해제·재그리기를 할 수 있어요.</b>'}</p>
    <div class="stats">${frag}</div>
    <details data-k="prob"><summary>등급 확률표와 천장</summary><div class="tbl"><table><tr><th>현재</th><th>상위 등급이 나올 확률</th><th>천장</th></tr>${probs}</table></div><p class="muted">표의 행은 합이 100%가 아니에요. 나머지는 등급 유지(재능만 다시 뽑힘)예요.</p></details>${sec}` };
}

function panelEquip() {
  const P = G.player; const sm = P.buildings.smithy || 0;
  const pool = P.equipPool.map(id => { const e = EQUIPMENT[id]; const c = craftCost(id); const ok = sm >= e.lv;
    return `<div class="row ${ok ? '' : 'dim'}"><span class="ico-box">${ic(e.slot === 'weapon' ? 'sword' : 'shield')}</span><div class="grow"><div class="name">${e.name} <span class="chip">${e.slot === 'weapon' ? '무기' : '방어구'}</span><span class="chip">대장간 Lv${e.lv}</span></div><div class="desc">${e.desc.replace('{v}', e.v ? e.v[0] + '~' + e.v[1] : '')}</div><div class="stats">${e.hp ? `<span class="chip">체력 ${e.hp[0]}~${e.hp[1]}</span>` : ''}${e.atk ? `<span class="chip">공격 ${e.atk[0]}~${e.atk[1]}</span>` : ''}${ok ? costChips(c) + `<span class="chip">${durStr(4 + e.lv)}</span>` : ''}</div></div>${ok ? `<button data-a="craft" data-id="${id}" class="${canAfford(c) ? 'primary' : ''}">제작</button>` : ''}</div>`; }).join('');
  const inv = P.items.map(it => `<div class="row"><span class="ico-box">${ic(it.slot === 'special' ? 'star' : it.slot === 'weapon' ? 'sword' : 'shield')}</span><div class="grow"><div class="name">${it.name}</div><div class="desc">${it.slot === 'special' ? it.desc : itemDesc(it)}</div></div><button data-a="sell" data-u="${it.uid}">분해</button></div>`).join('');
  const sp = UNIT_ORDER.filter(u => SPECIAL_EQUIP[u]).map(u => `<div class="row ${sm >= 10 ? '' : 'dim'}"><span>${unitPortrait(u, false, 'sm')}</span><div class="grow"><div class="name">${SPECIAL_EQUIP[u].name}</div><div class="desc">${SPECIAL_EQUIP[u].desc}</div><div class="stats">${costChips({ wood: 600, stone: 600 })}</div></div><button data-a="special" data-id="${u}" ${sm >= 10 ? '' : 'disabled'}>제작</button></div>`).join('');
  return { title: `${ic('anvil')} 장비 <small>대장간 Lv${sm} · 대기열 ${P.craftQueue.length}/3</small>`, body: `
    <p class="note">이번 대전의 장비 효과는 8종이 무작위로 정해졌어요. 만들 때마다 수치가 새로 굴려져요(다시 만들면 다시 추첨). 전용 장비는 대장간 10/18레벨에서 하나씩 열려요.</p>
    <h3>${ic('anvil')} 제작</h3>${pool}
    <h3>${ic('star')} 전용 장비</h3>${sp}<p class="muted">그 밖의 병종 전용 장비는 공개된 데이터가 없어 넣지 않았어요.</p>
    <h3>보유 장비 <span class="n">${P.items.length}</span></h3>${inv || '<p class="muted">비어 있어요. 병사 관리 화면에서 장착할 수 있어요.</p>'}` };
}

function panelAlliance() {
  const P = G.player; const emb = P.buildings.embassy || 0; const mp = isMP();
  const ranks = Object.values(G.factions).map(f => ({ f, score: scoreOf(f.id), ruins: ruinsOf(f.id).map(t => t.ruin) })).sort((a, b) => b.score - a.score);
  const top = Math.max(1, ...ranks.map(r => r.score));
  const rows = ranks.slice(0, 40).map((r, i) => { const hp = r.f.id === 'P' ? P.capHp : r.f.capHp; const on = r.f.id === 'P' || r.f.online; return `<div class="row"><span class="ico-box" style="background:${r.f.color}33">${Portrait.building('castle', r.f.color, 'sm')}</span><div class="grow"><div class="name">${i + 1}위 ${mp ? `<b class="dot ${on ? 'on' : ''}"></b>` : ''}${esc(r.f.name)}${r.f.id === 'P' ? ' <span class="chip on">나</span>' : ''} ${r.f.alive !== false ? `<span class="chip">${'♥'.repeat(Math.max(0, hp || 0))}${'♡'.repeat(Math.max(0, CONST.CAP_HP - (hp || 0)))}</span>` : '<span class="chip lack">탈락</span>'}</div><div class="desc">영토 ${tilesOf(r.f.id)}칸 · 유적 ${r.ruins.length ? r.ruins.map(x => 'Lv' + x).join(', ') : '없음'} · 점수 ${r.score}${r.f.cap ? ` · 거점 (${r.f.cap[0]},${r.f.cap[1]})` : ''}</div><div class="bar"><i style="width:${Math.round(r.score / top * 100)}%;background:${r.f.color}"></i></div></div>${r.f.cap && r.f.id !== 'P' ? `<button data-a="goto" data-x="${r.f.cap[0]}" data-y="${r.f.cap[1]}">보기</button>` : ''}</div>`; }).join('');
  const pol = Object.keys(POLICIES).map(k => `<button data-a="policy" data-id="${k}" class="${P.policy === k ? 'on' : ''}" ${emb >= 3 || k === 'none' ? '' : 'disabled'}>${POLICIES[k].name}${POLICIES[k].desc ? `<small>${POLICIES[k].desc}</small>` : ''}</button>`).join('');
  const chat = mp ? `<h3>${ic('chat')} 월드 채팅</h3><div class="chat">${NET.S.chat.slice(-30).map(m => `<div class="msg ${m.by === NET.S.uid ? 'me' : ''}"><b style="color:${(Object.values(G.factions).find(f => f.id === m.by) || (m.by === NET.S.uid ? G.factions.P : {})).dark || 'var(--ink2)'}">${esc(NET.nameOf(m.by === NET.S.uid ? 'P' : m.by))}</b> ${esc(m.text)}</div>`).join('') || '<p class="muted">아직 대화가 없어요. 인사해 보세요!</p>'}</div>
    <div class="btns chatin"><input type="text" id="chatBox" maxlength="200" placeholder="메시지 (200자)" ${NET.S.readOnly ? 'disabled' : ''}><button data-a="say" class="primary" ${NET.S.readOnly ? 'disabled' : ''}>보내기</button></div>` : '';
  const rules = mp ? `<div class="note"><b>온라인 월드</b> · 300×300 = 9만 칸 섬 하나를 함께 써요.<br>· 다른 영주의 땅은 매일 20:00~24:00(게임 시각)에만 공격할 수 있어요<br>· 공격하면 상대가 공개한 수비군과 싸우고, 결과는 상대에게 전해져 똑같이 다시 재생돼요<br>· 거점이 세 번 뚫리면 땅을 모두 잃고 다른 곳에서 다시 시작해요(건물·병사는 유지)<br>· 접속하지 않은 동안에도 시간이 흘러요 (${NET.speedOf().name})</div>`
    : `<div class="note"><b>승리 조건</b><br>· 유적 Lv20을 먼저 완성하거나, Lv12 이상 유적 3개 확보<br>· 최후 혈전: 가까운 세 연맹 거점을 모두 함락 (거점마다 내구 3, 함락하면 그 세력 영지가 넘어와요)<br>· 겨울(4일차)이 끝나면 점수(영토 + 유적 Lv×3)로 결산<br>· 적 영지 공격은 매일 20:00~24:00. 탈락한 세력은 시간 제한 없음</div>`;
  return { title: `${ic('castle')} ${mp ? '온라인 영주들' : '연맹 · 세력'}`, body: `${rules}${chat}
    <h3>${ic('star')} ${mp ? '영주 순위' : '세력 순위'} <span class="n">${ranks.length}${mp ? '명' : '곳'}</span></h3>${rows}
    <h3>${ic('flag')} 연맹 정책 <span class="n">대사관 Lv${emb}${emb < 3 ? ' · Lv3 필요' : ''}</span></h3><div class="btns col">${pol}</div>` };
}

/* ── 전체 지도 (300×300) ───────────────────────────────── */
function panelWorldmap() {
  const c = VIEW.map.center ? VIEW.map.center() : G.factions.P.cap;
  return { title: `${ic('map')} 전체 지도 <small>300×300 = 90,000칸</small>`, body: `
    <div class="wm"><canvas id="wmCanvas" width="600" height="600"></canvas></div>
    <div class="legend"><span><i style="background:${pColor()}"></i>내 영토</span><span><i style="background:#b59ae0"></i>유적</span><span><i style="background:#ff5d6c"></i>거대 야수</span><span><i class="frame"></i>지금 보는 곳 (${c[0]},${c[1]})</span></div>
    <p class="muted">지도를 누르면 그곳으로 날아가요. 가운데로 갈수록 땅 레벨과 몬스터가 강해지고, 한가운데에 대유적이 있어요.</p>
    <div class="btns"><input type="text" id="gotoBox" placeholder="좌표 예: 150,150" style="max-width:180px"><button data-a="gotoxy">이동</button><button data-a="goto" data-x="${G.factions.P.cap[0]}" data-y="${G.factions.P.cap[1]}">${ic('home')} 내 거점</button><button data-a="goto" data-x="${G.ruins[12][0]}" data-y="${G.ruins[12][1]}">${ic('star')} 대유적</button></div>` };
}
function drawWorldmap() {
  const cv = $('#wmCanvas'); if (!cv) return; const g = cv.getContext('2d'); const S = cv.width, k = S / G.N;
  g.imageSmoothingEnabled = false; g.drawImage(Overview.canvas(), 0, 0, S, S);
  g.lineWidth = 2;
  for (const r of G.ruins) { const t = tileAt(r[0], r[1]); g.fillStyle = t.owner ? fColor(t.owner) : '#b59ae0'; g.strokeStyle = '#3a2f4d'; g.beginPath(); const x = (r[0] + 0.5) * k, y = (r[1] + 0.5) * k, s = r === G.ruins[12] ? 9 : 6; g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); g.fill(); g.stroke(); }
  for (const gi of G.giants) if (!gi.dead) { g.fillStyle = '#ff5d6c'; g.strokeStyle = '#3a2f4d'; g.beginPath(); g.arc((gi.x + 0.5) * k, (gi.y + 0.5) * k, 5, 0, Math.PI * 2); g.fill(); g.stroke(); }
  for (const f of Object.values(G.factions)) if (f.cap) { const x = (f.cap[0] + 0.5) * k, y = (f.cap[1] + 0.5) * k; g.fillStyle = f.color; g.strokeStyle = '#fff'; g.lineWidth = 3; g.fillRect(x - 6, y - 6, 12, 12); g.strokeRect(x - 6, y - 6, 12, 12); if (f.id === 'P' || f.remote) { g.font = 'bold 13px sans-serif'; g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.9)'; g.fillStyle = '#33305a'; const nm = f.id === 'P' ? '나' : f.name; g.strokeText(nm, x + 9, y + 4); g.fillText(nm, x + 9, y + 4); } }
  const c = VIEW.map.center ? VIEW.map.center() : G.factions.P.cap; const r = (VIEW.is3d ? 14 : 10) * k;
  g.strokeStyle = '#33305a'; g.lineWidth = 2.5; g.strokeRect(c[0] * k - r, c[1] * k - r, r * 2, r * 2); g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(c[0] * k - r, c[1] * k - r, r * 2, r * 2);
}
function goTo(x, y) { x = clamp(Math.round(x), 0, G.N - 1); y = clamp(Math.round(y), 0, G.N - 1); if (UI.mode !== 'world') setMode('world'); closePanel(); VIEW.map.focus(x, y); selectTile(x, y); }

function panelCodex() {
  const tab = UI.codexTab;
  const tabs = `<div class="tabs">${[['units', '병종'], ['monsters', '몬스터'], ['equip', '장비'], ['rules', '규칙']].map(([k, n]) => `<button data-a="ctab" data-id="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  let body = '';
  if (tab === 'units') body = Object.keys(CLASS_INFO).map(c => `<h3 style="color:${CLASS_INFO[c].color}">${CLASS_INFO[c].name} <span class="n">행군 ${CLASS_INFO[c].speed}칸/시간</span></h3>` + UNIT_ORDER.filter(u => UNITS[u].cls === c).map(u => { const t = UNITS[u]; return `<div class="row"><span>${unitPortrait(u, false)}</span><div class="grow"><div class="name">${t.name}${t.est ? '<span class="chip">추정치</span>' : ''}</div><div class="stats"><span class="chip">체력 ${t.hp[0]}→${t.hp[5]}</span><span class="chip">공격 ${t.atk[0]}→${t.atk[5]}</span><span class="chip">이동 ${t.move}</span><span class="chip">사거리 ${t.range}</span><span class="chip">${t.rage ? '분노 ' + t.rage : '분노 없음'}</span></div><div class="desc">${t.desc}</div><div class="desc">영웅: ${HERO_ORDER.filter(h => HEROES[h].unit === u).map(h => HEROES[h].name).join(', ') || '-'}</div></div></div>`; }).join('')).join('');
  if (tab === 'monsters') body = [['beast', '일반 야수'], ['giant', '거대 야수 — Lv3 자원지 9칸, 움직이지 않고 랜덤 장비를 낀 보스'], ['bandit', '산적 — Lv4 이상 땅과 유적을 지킴']].map(([k, n]) => `<h3>${n}</h3>` + Object.keys(MONSTERS).filter(m => MONSTERS[m].kind === k).map(m => { const M = MONSTERS[m]; return `<div class="row"><span>${Portrait.monster(m)}</span><div class="grow"><div class="name">${M.name}</div><div class="stats"><span class="chip">체력 ${M.hp}</span><span class="chip">공격 ${M.atk}</span><span class="chip">이동 ${M.move}</span><span class="chip">사거리 ${M.range}</span></div><div class="desc">${M.desc}</div></div></div>`; }).join('')).join('');
  if (tab === 'equip') body = EQUIP_ORDER.map(id => { const e = EQUIPMENT[id]; return `<div class="row"><span class="ico-box">${ic(e.slot === 'weapon' ? 'sword' : 'shield')}</span><div class="grow"><div class="name">${e.name} <span class="chip">대장간 Lv${e.lv}</span></div><div class="desc">${e.desc.replace('{v}', e.v ? e.v[0] + '~' + e.v[1] : '')}</div></div></div>`; }).join('');
  if (tab === 'rules') body = `<div class="muted" style="font-size:14px">
    <p><b>핵심 흐름</b> 땅 → 자원 → 건설 → 병사 → 장비 → 영웅 → 전쟁 → 더 좋은 땅.</p>
    <p><b>영토</b> 자기 영토와 맞닿은 타일만 점령할 수 있어요(요새 3칸 이내 포함). 거점에서 멀수록 몬스터가 강해요. 점령한 땅은 1시간 보호돼요.</p>
    <p><b>정찰</b> 지도에는 내 영토 4칸, 다른 세력 영토 2칸 안의 몬스터만 보여요. 타일을 누르면 어디든 수비군을 볼 수 있어요.</p>
    <p><b>식량</b> 생산량에서 병사 유지비를 뺀 만큼만 들어와요. 바닥나면 병사가 탈영해요.</p>
    <p><b>전투</b> 턴제 자동이에요. 병사는 공격하거나 맞으면 분노가 1 오르고, 가득 차면 다음 공격이 스킬이 돼요. 병기·맥도·도끼기병은 분노가 없어요. 30턴이 지나면 공격 측이 물러나요.</p>
    <p><b>배치</b> 근접은 앞줄, 사거리 2는 가운데, 원거리·병기는 뒷줄에 서요.</p>
    <p><b>영웅</b> 같은 병종 잔편으로 초상화를 해제하고 다시 그려 등급을 올려요. 7급 → 1급 → 운명. 확률표와 천장이 있어요.</p>
    <p><b>장비</b> 대전마다 효과 8종이 무작위로 정해지고, 만들 때마다 수치가 바뀌어요.</p>
    <p><b>병원</b> 병원이 있으면 쓰러진 병사가 30% + 레벨×5% 확률로 입원해 30분 뒤 돌아와요.</p>
    <p><b>거점 내구</b> 거점은 수비전에서 세 번 져야 함락돼요. 6시간마다 1씩 회복해요. 적 거점도 같아요.</p>
    <p><b>계절</b> 봄 → 여름(식량 +30%) → 가을(목재·석재 +30%, 몬스터 강화) → 겨울(식량 −50%, 몬스터 +50%) → 결산.</p>
    <p><b>시간</b> 1배속에서 현실 1초 = 게임 1분. 창·방패·궁병 62칸/시간, 기병 74, 병기 46.</p>
    <p><b>조작</b> 드래그 이동 · 휠/핀치 확대 · 두 손가락 비틀기·오른쪽 드래그·Q/E로 회전 · WASD/방향키 이동 · 스페이스 일시정지.</p></div>`;
  return { title: `${ic('book')} 도감`, body: tabs + body };
}

function panelMenu() {
  const st = G.stats; const q = VIEW.map.getQuality(); const mp = isMP();
  return { title: `${ic('menu')} 메뉴`, body: `
    <div class="btns col">
      <button data-a="save" class="primary">지금 저장하기</button>
      <button data-a="codex">${ic('book')} 도감 · 규칙</button>
    </div>
    <h3>그래픽</h3>
    <div class="btns">${VIEW.is3d ? [['high', '높음'], ['mid', '보통'], ['low', '낮음']].map(([k, n]) => `<button data-a="quality" data-id="${k}" class="${q === k ? 'on' : ''}">${n}</button>`).join('') : '<span class="muted">이 기기는 WebGL을 쓸 수 없어 2D 화면으로 보여요.</span>'}</div>
    <p class="muted">낮음은 그림자를 끄고 한 번에 그리는 범위를 줄여 휴대폰 배터리를 아껴요. 9만 칸 섬은 카메라 주변만 그려요.</p>
    <h3>전투</h3>
    <label class="row pick ${UI.autoBattle ? 'on' : ''}"><input type="checkbox" data-a="autobattle" ${UI.autoBattle ? 'checked' : ''}><span class="grow"><span class="name">전투 장면 건너뛰기</span><span class="muted">결과만 알림으로 보여요.</span></span></label>
    ${mp ? `<h3>${ic('castle')} 온라인 월드</h3><div class="stats"><span class="chip">시즌 ${G.season || 1}</span><span class="chip">${NET.speedOf().name}</span><span class="chip">시드 ${G.seed}</span></div>
      <div class="btns"><button data-a="lobby">첫 화면으로</button>${NET.S.admin ? '<button data-a="newseason" class="danger">새 시즌 시작 (모두 처음부터)</button>' : ''}</div>`
    : `<h3>저장 코드</h3>
    <textarea id="ioBox" rows="3" placeholder="저장 코드를 붙여넣고 불러오기를 누르세요"></textarea>
    <div class="btns"><button data-a="export">저장 코드 복사</button><button data-a="import">저장 코드 불러오기</button></div>
    <div class="btns"><button data-a="lobby">첫 화면으로</button><button data-a="newgame" class="danger">새 게임 (지금 진행 삭제)</button></div>`}
    <div class="btns"><button data-a="log">사건 기록 보기</button></div>
    <div class="stats"><span class="chip">전투 ${st.battles}회</span><span class="chip">승리 ${st.wins}</span><span class="chip">패배 ${st.lost}</span><span class="chip">전사 ${st.kills}</span></div>
    <p class="muted">《9만 에이커》의 공개된 규칙과 수치를 바탕으로 핵심 재미(9만 칸 영토 확장, 요새 경영, 턴제 오토배틀, 영웅 모디파이어, 시즌 경쟁)를 웹에서 다시 만든 팬 메이드 게임이에요. 문서에 수치가 없던 병종·영웅은 추정치로 표시했어요.</p>` };
}
function panelLog() { return { title: `${ic('book')} 사건 기록`, body: G.log.map(l => `<div class="row"><span class="chip">${timeStr(l.t)}</span><span class="grow ${l.kind}">${esc(l.text)}</span></div>`).join('') || '<p class="muted">아직 기록이 없어요.</p>' }; }

/* 패널 동작 */
function onPanelClick(e) {
  const el = e.target.closest('[data-a]'); if (!el) return;
  if (el.tagName === 'INPUT' && e.type === 'click') return; // 체크박스는 change에서 처리
  const a = el.dataset.a, id = el.dataset.id; let msg = null;
  switch (a) {
    case 'build': msg = build(id); if (!msg) notice(`${BUILDINGS[id].name} 공사를 시작했어요.`, 'good'); break;
    case 'place': { const sp = autoSpot(id); closePanel(); setMode('base'); startPlace(id, sp ? sp[0] : 0, sp ? sp[1] : 0); return; }
    case 'placex': { const sp = autoSpot(id); closePanel(); setMode('base'); startPlace(id, sp ? sp[0] : 0, sp ? sp[1] : 0); return; }
    case 'xup': msg = upgradeExtra(+id); if (!msg) notice('망루 공사를 시작했어요.', 'good'); break;
    case 'enterbase': closePanel(); setMode('base'); return;
    case 'atab': UI.armyTab = id; UI.troopEdit = null; break;
    case 'tedit': { const tr = G.player.troops.find(x => x.id === +id); UI.troopEdit = +id; UI.armyTab = 'troops'; UI.armyPick = new Set(tr ? tr.members : []); renderPanel(true); $('#panelBody').scrollTop = 0; return; }
    case 'tsave': msg = setTroopMembers(UI.troopEdit, [...UI.armyPick]); if (!msg) { notice('부대가 집결지에 모였어요.', 'good'); UI.troopEdit = null; UI.armyPick.clear(); } break;
    case 'tcancel': UI.troopEdit = null; UI.armyPick.clear(); break;
    case 'tadd': msg = addTroop(); break;
    case 'tdel': if (el.dataset.confirm) { msg = removeTroop(+id); if (!msg) { UI.troopEdit = null; UI.armyPick.clear(); } } else { el.dataset.confirm = '1'; el.textContent = '한 번 더 누르면 해체'; return; } break;
    case 'tsend': { const t = UI.args.target; msg = sendTroop(+id, t[0], t[1], UI.armyStay); if (!msg) { closePanel(); deselect(); notice('부대가 출발했어요!', 'good'); } break; }
    case 'goto': goTo(+el.dataset.x, +el.dataset.y); return;
    case 'gotoxy': { const m = ($('#gotoBox').value || '').match(/(\d+)\D+(\d+)/); if (m) goTo(+m[1], +m[2]); else notice('좌표를 "x,y"로 적어 주세요.'); return; }
    case 'codex': openPanel('codex'); return;
    case 'say': { const box = $('#chatBox'); NET.say(box.value).then(e => { if (e) notice(e); else { box.value = ''; UI.lastPanel = ''; renderPanel(true); } }); return; }
    case 'lobby': if (el.dataset.confirm) { saveGame(); closePanel(); toLobby(); } else { el.dataset.confirm = '1'; el.textContent = '저장하고 첫 화면으로 (한 번 더)'; } return;
    case 'newseason': if (el.dataset.confirm) { NET.createWorld(NET.S.world ? NET.S.world.speed : 'x24').then(e => notice(e || '새 시즌을 시작했어요.', e ? 'warn' : 'good')); } else { el.dataset.confirm = '1'; el.textContent = '모든 영주가 처음부터 — 정말 시작 (한 번 더)'; } return;
    case 'recruit': msg = recruit(id); if (!msg) notice(`${UNITS[id].name} 모집을 시작했어요.`, 'good'); break;
    case 'stab': UI.soldierTab = id; break;
    case 'soldier': openPanel('soldier', { id: +id }); return;
    case 'back': openPanel(el.dataset.p); return;
    case 'train': msg = train(soldierById(+id)); break;
    case 'hero': msg = assignHero(soldierById(+id), el.dataset.h || null); break;
    case 'equip': { const it = G.player.items.find(x => x.uid === el.dataset.u); if (it) msg = equip(soldierById(+id), it); break; }
    case 'unequip': unequip(soldierById(+id), el.dataset.k); break;
    case 'dismiss': if (el.dataset.confirm) { msg = dismiss(soldierById(+id)); if (!msg) { openPanel('soldiers'); return; } } else { el.dataset.confirm = '1'; el.textContent = '한 번 더 누르면 해산'; return; } break;
    case 'pick': { const sid = +id; if (el.checked) { if (UI.armyPick.size >= armyCap()) { el.checked = false; notice(`부대는 최대 ${armyCap()}명이에요.`); return; } UI.armyPick.add(sid); } else UI.armyPick.delete(sid); break; }
    case 'pickall': for (const s of G.player.soldiers) if (!s.army && !G.player.trainQueue.find(q => q.sid === s.id) && (UI.troopEdit == null || !troopOf(s.id)) && UI.armyPick.size < armyCap()) UI.armyPick.add(s.id); break;
    case 'pickclear': UI.armyPick.clear(); break;
    case 'stay': UI.armyStay = el.checked; break;
    case 'send': { const t = UI.args.target; msg = sendArmy([...UI.armyPick], t[0], t[1], UI.armyStay); if (!msg) { UI.armyPick.clear(); closePanel(); deselect(); notice('부대가 출발했어요!', 'good'); } break; }
    case 'predict': {
      const t = tileAt(...UI.args.target); const def = tileDefenders(t); let w = 0, rounds = 0; const ids = [...UI.armyPick]; const atk = ids.map(i => soldierSpec(soldierById(i)));
      for (let i = 0; i < 20; i++) { const r = quickBattle(atk, def.specs, { policy: G.player.policy, capitalLv: G.player.buildings.capital }); if (r.winner === 'A') w++; rounds += r.rounds; }
      const pct = w * 5, col = pct >= 70 ? 'var(--mint)' : pct >= 40 ? 'var(--sun)' : 'var(--coral)';
      UI.predict = { key: t.x + ',' + t.y + ':' + ids.join(','), html: `<div class="row"><div class="grow"><div class="name">예상 승률 ${pct}%</div><div class="bar" style="height:12px"><i style="width:${pct}%;background:${col}"></i></div><div class="muted">20번 모의 전투 · 평균 ${(rounds / 20).toFixed(1)}턴 · 장비·영웅의 확률 효과가 섞인 추정치예요</div></div></div>` };
      break;
    }
    case 'unlock': msg = unlockHero(el.dataset.h); break;
    case 'reroll': { const r = rerollHero(el.dataset.h); if (r) notice(r, 'info'); break; }
    case 'craft': msg = craft(id); if (!msg) notice(`${EQUIPMENT[id].name} 제작을 시작했어요.`, 'good'); break;
    case 'special': msg = craftSpecial(id); break;
    case 'sell': { const it = G.player.items.find(x => x.uid === el.dataset.u); if (it) { G.player.items = G.player.items.filter(x => x !== it); G.player.res.wood += 40; G.player.res.stone += 40; notice('분해해서 목재·석재 40씩 돌려받았어요.', 'info'); } break; }
    case 'policy': G.player.policy = id; changed('state'); break;
    case 'ctab': UI.codexTab = id; renderPanel(true); return;
    case 'quality': VIEW.map.setQuality(id); renderPanel(true); return;
    case 'save': notice(saveGame() ? '저장했어요.' : '이 브라우저에서는 저장할 수 없어요.', 'good'); return;
    case 'export': { const box = $('#ioBox'); box.value = exportSave(); box.select(); try { navigator.clipboard.writeText(box.value).then(() => notice('클립보드에 복사했어요.', 'good')).catch(() => notice('글자를 직접 복사해 주세요.', 'info')); } catch (err) { notice('글자를 직접 복사해 주세요.', 'info'); } return; }
    case 'import': { if (importSave($('#ioBox').value)) { notice('불러왔어요.', 'good'); closePanel(); afterLoad(); } else notice('저장 코드가 올바르지 않아요.'); return; }
    case 'autobattle': UI.autoBattle = el.checked; renderPanel(true); return;
    case 'log': openPanel('log'); return;
    case 'newgame': if (el.dataset.confirm) { clearSave(); newGame(); closePanel(); afterLoad(); notice('새 게임을 시작해요!', 'good'); } else { el.dataset.confirm = '1'; el.textContent = '정말 지우고 새로 시작 (한 번 더)'; } return;
    case 'troops': openPanel('army', {}); return;
  }
  if (msg) notice(msg);
  renderPanel(true); renderTop();
}

/* ── 타일 팝업 ─────────────────────────────────────────── */
function selectTile(x, y) { const t = tileAt(x, y); if (!t) { deselect(); return; } UI.selected = [x, y]; UI.lastPop = ''; renderTilePop(); }
function deselectAll() { deselect(); UI.baseSel = null; UI.place = null; if (VIEW.base) { VIEW.base.select(null); VIEW.base.setGhost(null); } }
function deselect() { UI.selected = null; $('#tilepop').hidden = true; }
function renderTilePop() {
  if (!UI.selected) return; const t = tileAt(...UI.selected); const pop = $('#tilepop'); pop.hidden = false;
  const def = tileDefenders(t); const owner = t.owner ? G.factions[t.owner] || { name: '영주', color: '#9aa9c4' } : null;
  const prod = t.type === 'capital' ? '' : t.type === 'ruin' ? `식량·목재·석재 각 ${Math.round(tileProduction(t.lv) * 0.4)}/시` : `${RES_NAME[{ plain: 'food', forest: 'wood', hill: 'stone' }[t.type]]} ${tileProduction(t.lv)}/시`;
  const foeColor = owner && t.owner !== 'P' ? owner.color : pColor();
  const showDef = t.owner !== 'P' || t.type === 'capital';
  const mons = showDef && def.specs.length ? `<div class="mons">${groupSpecs(def.specs).slice(0, 6).map(({ sp, n }) => `<div class="mon">${specPortrait(sp, 'xs', foeColor)}<span class="grow"><b>${specName(sp)}${n > 1 ? ' ×' + n : ''}</b> <span class="muted">체력 ${specHp(sp)} · 공격 ${specAtk(sp)}</span>${sp.monsterId ? `<br><span class="muted">${MONSTERS[sp.monsterId].desc}</span>` : ''}</span></div>`).join('')}${groupSpecs(def.specs).length > 6 ? `<span class="muted">외 ${groupSpecs(def.specs).length - 6}종</span>` : ''}</div>` : '';
  const st = G.armies.find(a => a.owner === 'P' && a.state === 'wait' && a.x === t.x && a.y === t.y);
  const err = canTarget(t);
  let actions = '';
  if (t.owner === 'P') {
    if (t.type === 'capital') actions += `<button data-t="base" class="mint">${ic('castle')} 요새 안으로</button><span class="chip">수비: 대기 병사 ${G.player.soldiers.filter(s => !s.army).length}명 + 성벽${towerLevels().filter(l => l > 0).length ? ' + 망루 ' + towerLevels().filter(l => l > 0).length : ''}</span><span class="chip">내구 ${'♥'.repeat(G.player.capHp)}${'♡'.repeat(CONST.CAP_HP - G.player.capHp)}</span>`;
    if (!st && t.type !== 'capital') actions += `<button data-t="army">부대 주둔시키기</button>`;
    if (st) actions += `<span class="chip on">주둔 ${st.units.length}명</span><button data-t="recall">회군</button>`;
    if (t.ruin) { const c = ruinCost(t); actions += `<button data-t="ruin" class="primary">유적 Lv${t.ruin} → ${t.ruin + 1}</button><span class="stats">${costChips(c)}</span>`; }
    if (!t.fort && ['plain', 'forest', 'hill'].includes(t.type)) actions += `<button data-t="fort">전초 요새 짓기</button><span class="stats">${costChips({ wood: 500, stone: 700 })}</span>`;
    if (t.type !== 'capital') actions += `<button data-t="abandon" class="danger">땅 포기</button>`;
  } else {
    actions += `<button data-t="army" class="primary" ${err ? 'disabled' : ''}>${ic('flag')} ${t.owner ? '공격' : '점령'} 출전</button>${err ? `<div class="bad" style="width:100%">${err}</div>` : ''}`;
  }
  const html = `<div class="tp-head"><span class="ico-box">${ic(TERRAIN_IC[t.type])}</span><div class="grow"><div class="t">${tileLabel(t)} <span class="lvb">Lv${t.lv}</span>${t.ruin ? ` <span class="chip hero">유적 Lv${t.ruin}</span>` : ''}</div>
    <div class="muted">(${t.x},${t.y}) · <b style="color:${owner ? owner.color : 'inherit'}">${owner ? esc(owner.name) : '무소속'}</b>${t.protect > G.time ? ` · 보호 ${durStr(t.protect - G.time)}` : ''}${prod ? ' · ' + prod : ''}</div></div><button class="x" data-t="close" aria-label="닫기">${ic('close')}</button></div>
    ${mons}<div class="btns">${actions}</div>`;
  if (html !== UI.lastPop) { UI.lastPop = html; pop.innerHTML = html; }
}
function onTilePopClick(e) {
  const el = e.target.closest('[data-t]'); if (!el) return; const t = tileAt(...UI.selected); let msg = null;
  switch (el.dataset.t) {
    case 'close': deselect(); return;
    case 'army': UI.armyTab = 'send'; UI.troopEdit = null; openPanel('army', { target: [t.x, t.y] }); return;
    case 'base': deselect(); setMode('base'); return;
    case 'abandon': if (el.dataset.confirm) { msg = abandonTile(t); if (!msg) { deselect(); notice('땅을 내려놓았어요.', 'info'); return; } } else { el.dataset.confirm = '1'; el.textContent = '정말 포기 (한 번 더)'; return; } break;
    case 'recall': { const st = G.armies.find(a => a.owner === 'P' && a.state === 'wait' && a.x === t.x && a.y === t.y); if (st) recallArmy(st); break; }
    case 'ruin': msg = upgradeRuin(t); break;
    case 'fort': msg = buildFort(t); break;
  }
  if (msg) notice(msg); UI.lastPop = ''; renderTilePop(); renderTop();
}

/* ── 요새 안 ────────────────────────────────────────────── */
const BFUNC = { barracks: ['recruit', '병사 모집'], stable: ['recruit', '기병 모집'], factory: ['recruit', '병기 모집'], ground: ['soldiers', '병사 훈련'], smithy: ['equip', '장비 제작'], hall: ['heroes', '영웅 초상화'], hospital: ['hospital', '입원 병사'], embassy: ['alliance', '연맹 정책'], capital: ['build', '건설 목록'] };
function setMode(m) {
  if (!VIEW.base) m = 'world';
  UI.mode = m; deselectAll();
  document.body.classList.toggle('in-base', m === 'base');
  VIEW.map.setActive(m === 'world'); if (VIEW.base) VIEW.base.setActive(m === 'base');
  if (m === 'base') { VIEW.base.focus(); if (!UI.baseHinted) { UI.baseHinted = true; notice('건물을 눌러 올리거나 옮기고, 빈 터를 눌러 새로 지어요. 아래 모래밭이 부대 집결지예요.', 'info'); } }
  navState(); renderTop();
}
function startPlace(kind, x, y, key) { UI.place = { kind, key: key || null, x, y }; UI.baseSel = null; VIEW.base.select(null); placeGhost(); renderBasePop(); }
function placeGhost() { const p = UI.place; if (!p) { VIEW.base.setGhost(null); return; } VIEW.base.setGhost(p.kind, p.x, p.y, !canPlace(p.kind, p.x, p.y, p.key || undefined)); }
function baseTap(hit) {
  if (UI.place) { if (hit) { UI.place.x = hit.x; UI.place.y = hit.y; placeGhost(); renderBasePop(); } return; }
  if (!hit) { deselectAll(); return; }
  UI.baseSel = hit; UI.lastPop = '';
  if (hit.key) { const fp = hit.key === 'capital' ? footprint('capital') : hit.key[0] === 'x' ? footprint(G.player.base.extras[+hit.key.slice(1)].id, [G.player.base.extras[+hit.key.slice(1)].x, G.player.base.extras[+hit.key.slice(1)].y]) : footprint(hit.key, G.player.base.layout[hit.key]); VIEW.base.select(fp); }
  else VIEW.base.select({ x: hit.rally ? BASE.RALLY.x : hit.x, y: hit.rally ? BASE.RALLY.y : hit.y, w: hit.rally ? BASE.RALLY.w : 1, h: hit.rally ? BASE.RALLY.h : 1 });
  renderBasePop();
}
function renderBasePop() {
  const pop = $('#tilepop'); const P = G.player; let html = '';
  const head = (icon, title, sub) => `<div class="tp-head"><span class="ico-box">${ic(icon)}</span><div class="grow"><div class="t">${title}</div><div class="muted">${sub}</div></div><button class="x" data-b="close" aria-label="닫기">${ic('close')}</button></div>`;
  if (UI.place) {
    const p = UI.place; const err = canPlace(p.kind, p.x, p.y, p.key || undefined); const name = BUILDINGS[p.kind] ? BUILDINGS[p.kind].name : BASE_EXTRAS[p.kind].name;
    const cost = p.key ? null : BUILDINGS[p.kind] ? buildCost(p.kind) : BASE_EXTRAS[p.kind].cost(1);
    html = head('build', `${name} ${p.key ? '옮기기' : '짓기'}`, `(${p.x},${p.y}) · 부지를 눌러 자리를 바꿔요`) + `${err ? `<div class="bad">${err}</div>` : '<div class="good">여기에 놓을 수 있어요.</div>'}${cost ? `<div class="stats">${costChips(cost)}${BUILDINGS[p.kind] ? `<span class="chip">${durStr(buildTime(p.kind))}</span>` : ''}</div>` : ''}<div class="btns"><button data-b="confirm" class="primary" ${err ? 'disabled' : ''}>${ic('check')} ${p.key ? '여기로 옮기기' : '여기에 짓기'}</button><button data-b="cancel">취소</button></div>`;
  } else if (UI.baseSel && UI.baseSel.key) {
    const key = UI.baseSel.key;
    if (key[0] === 'x' && /^x\d+$/.test(key)) {
      const k = +key.slice(1), e = P.base.extras[k]; if (!e) { deselectAll(); return; } const X = BASE_EXTRAS[e.id]; const q = P.buildQueue.find(x => x.ex === k);
      html = head(e.id === 'tower' ? 'shield' : 'star', `${X.name}${X.deco ? '' : ` <span class="lvb">Lv${e.lv}</span>`}`, X.desc) +
        (q ? `<div class="bar"><i style="width:${Math.round((1 - q.remain / q.total) * 100)}%"></i></div><p class="muted">공사 중 · ${durStr(q.remain)} 남음</p>` : '') +
        `<div class="btns">${!X.deco && !q && e.lv < X.max ? `<button data-b="xup" class="primary">올리기</button><span class="stats">${costChips(extraCost(e))}</span>` : ''}<button data-b="move">옮기기</button>${q ? '' : `<button data-b="remove" class="danger">치우기</button>`}</div>`;
    } else {
      const id = key, b = BUILDINGS[id], lv = P.buildings[id] || 0, q = P.buildQueue.find(x => x.id === id && x.ex == null), c = buildCost(id), max = lv >= b.max, capBlock = id !== 'capital' && lv + 1 > P.buildings.capital;
      const fn = BFUNC[id];
      const info = id === 'capital' ? `저장 상한 ${fmt(storageCap())} · 영토 ${territoryCap()}칸 · 부대 ${troopSlots()}개×${armyCap()}명` : id === 'barracks' ? `병사 최대 Lv${maxSoldierLv()}` : id === 'warehouse' ? `저장 상한 ${fmt(storageCap())}` : id === 'hospital' ? `입원 확률 ${lv ? 30 + 5 * lv : 0}%` : '';
      html = head(BICON[id], `${id === 'capital' ? '본관 (거점)' : b.name} <span class="lvb">Lv${lv}</span>`, `${b.desc}${info ? ' · ' + info : ''}`) +
        (q ? `<div class="bar"><i style="width:${Math.round((1 - q.remain / q.total) * 100)}%"></i></div><p class="muted">Lv${lv + 1} 공사 중 · ${durStr(q.remain)} 남음</p>` : '') +
        `<div class="btns">${!q && !max ? `<button data-b="up" class="${canAfford(c) && !capBlock ? 'primary' : ''}" ${capBlock ? 'disabled' : ''}>${lv ? `Lv${lv + 1}로 올리기` : '짓기'}</button><span class="stats">${costChips(c)}<span class="chip">${durStr(buildTime(id))}</span>${capBlock ? '<span class="chip lack">본관 레벨 필요</span>' : ''}</span>` : max ? '<span class="chip">MAX</span>' : ''}
          ${fn && lv > 0 ? `<button data-b="fn" data-f="${fn[0]}" class="mint">${fn[1]}</button>` : ''}${id !== 'capital' ? '<button data-b="move">옮기기</button>' : ''}</div>`;
    }
  } else if (UI.baseSel && UI.baseSel.rally) {
    const rows = P.troops.map(tr => `<span class="chip">${ic('flag')}${esc(tr.name)} ${troopReady(tr).length}/${tr.members.length}</span>`).join('');
    html = head('flag', '집결지', '편성한 부대가 깃발 아래 모여요. 월드 지도에서 땅을 누르고 부대째로 출전해요.') + `<div class="stats">${rows}</div><div class="btns"><button data-b="troops" class="primary">${ic('flag')} 부대 편성·집결</button><button data-b="world">${ic('land')} 월드로 나가 출전</button></div>`;
  } else if (UI.baseSel) {
    const { x, y } = UI.baseSel;
    const opts = BUILDING_ORDER.filter(id => id !== 'capital' && !P.base.layout[id] && !(BUILDINGS[id].req && P.buildings.capital < BUILDINGS[id].req)).map(id => ({ id, ok: !canPlace(id, x, y), name: BUILDINGS[id].name, icon: BICON[id] }))
      .concat(Object.keys(BASE_EXTRAS).map(k => ({ id: k, ok: !canPlace(k, x, y), name: BASE_EXTRAS[k].name, icon: k === 'tower' ? 'shield' : 'star' })));
    const locked = BUILDING_ORDER.filter(id => !P.base.layout[id] && BUILDINGS[id].req && P.buildings.capital < BUILDINGS[id].req).map(id => `${BUILDINGS[id].name}(본관 Lv${BUILDINGS[id].req})`).join(', ');
    html = head('build', '빈 터', `(${x},${y}) · 건물은 2×2칸, 망루·장식은 1칸`) + `<div class="btns">${opts.map(o => `<button data-b="new" data-k="${o.id}" ${o.ok ? '' : 'class="dimb"'}>${ic(o.icon)}${o.name}</button>`).join('')}</div>${locked ? `<p class="muted">잠김: ${locked}</p>` : ''}`;
  }
  pop.hidden = !html; if (html && html !== UI.lastPop) { UI.lastPop = html; pop.innerHTML = html; }
}
function onBasePopClick(e) {
  const el = e.target.closest('[data-b]'); if (!el) return; let msg = null; const P = G.player;
  switch (el.dataset.b) {
    case 'close': deselectAll(); return;
    case 'cancel': UI.place = null; VIEW.base.setGhost(null); UI.lastPop = ''; renderBasePop(); return;
    case 'confirm': { const p = UI.place; if (p.key) msg = moveBuilding(p.key, p.x, p.y); else if (BUILDINGS[p.kind]) msg = placeBuilding(p.kind, p.x, p.y); else msg = buildExtra(p.kind, p.x, p.y); if (!msg) { notice(p.key ? '옮겼어요.' : '공사를 시작했어요!', 'good'); UI.place = null; VIEW.base.setGhost(null); UI.baseSel = null; VIEW.base.select(null); } break; }
    case 'new': { const k = el.dataset.k; const { x, y } = UI.baseSel; startPlace(k, x, y); return; }
    case 'move': { const key = UI.baseSel.key; const kind = key[0] === 'x' ? P.base.extras[+key.slice(1)].id : key; const fp = key[0] === 'x' ? { x: P.base.extras[+key.slice(1)].x, y: P.base.extras[+key.slice(1)].y } : { x: P.base.layout[key][0], y: P.base.layout[key][1] }; startPlace(kind, fp.x, fp.y, key); return; }
    case 'up': msg = build(UI.baseSel.key); if (!msg) notice(`${BUILDINGS[UI.baseSel.key].name} 공사를 시작했어요.`, 'good'); break;
    case 'xup': msg = upgradeExtra(+UI.baseSel.key.slice(1)); break;
    case 'remove': if (el.dataset.confirm) { msg = removeExtra(+UI.baseSel.key.slice(1)); if (!msg) { deselectAll(); return; } } else { el.dataset.confirm = '1'; el.textContent = '정말 치우기'; return; } break;
    case 'fn': { const f = el.dataset.f; if (f === 'recruit') { UI.soldierTab = 'recruit'; openPanel('soldiers'); } else if (f === 'hospital') { UI.soldierTab = 'hospital'; openPanel('soldiers'); } else if (f === 'soldiers') { UI.soldierTab = 'list'; openPanel('soldiers'); } else openPanel(f); return; }
    case 'troops': openPanel('army', {}); return;
    case 'world': setMode('world'); return;
  }
  if (msg) notice(msg); UI.lastPop = ''; renderBasePop(); renderTop();
}

/* ── 전투 화면 ─────────────────────────────────────────── */
function onBattleLog(e) { const box = $('#blog'); if (!box) return; const d = document.createElement('div'); d.className = e.kind || ''; d.textContent = e.text; box.appendChild(d); }
let curBattle = null;
function showNextBattle() {
  if (UI.battleOpen || !G.pendingBattles.length) return;
  const b = G.pendingBattles.shift();
  if (UI.autoBattle) return;
  curBattle = b; UI.battleOpen = true; $('#battle').hidden = false; $('#stage').classList.add('away');
  const fA = b.defense ? G.factions[b.attacker] : G.factions.P, fD = b.defense ? G.factions.P : (b.foe ? G.factions[b.foe] : null);
  setHTML('#btitle', `<span class="bt">${ic(b.defense ? 'shield' : 'sword')} ${b.defense ? '수비전' : '공격'}</span><small>(${b.tile[0]},${b.tile[1]}) ${esc(b.label)}</small>`);
  $('#blog').innerHTML = ''; $('#bresult').innerHTML = '<span class="muted">전투 중…</span>'; $('#bfast').textContent = '×1';
  const playerSide = b.defense ? 'D' : 'A';
  // VS 배너: 양 진영 대표 초상화
  const init = b.res.events.find(e => e.t === 'init'); const side = (sd, f) => { const us = init.units.filter(u => u.side === sd); const seen = new Set(); const pts = []; for (const u of us) { const k = u.monsterId || (u.isBuilding ? 'b' : u.typeId); if (seen.has(k) || pts.length >= 5) continue; seen.add(k); pts.push(u.monsterId ? Portrait.monster(u.monsterId) : u.isBuilding ? Portrait.building(u.name.includes('요새') ? 'fort' : 'castle', f ? f.color : pColor()) : Portrait.unit(u.typeId, f ? f.color : pColor(), !!u.hero)); } return { n: us.length, pts: pts.join('') }; };
  const sa = side('A', fA), sd = side('D', fD);
  setHTML('#bvs', `<div class="side a"><span class="who" style="color:${fA.dark}">${esc(fA.name)} ${sa.n}</span><span class="pts">${sa.pts}</span></div><span class="mark">VS</span><div class="side d"><span class="who" style="color:${fD ? fD.dark : 'var(--coral-d)'}">${fD ? esc(fD.name) : esc(b.label.split(',')[0] + ' 무리')} ${sd.n}</span><span class="pts">${sd.pts}</span></div>`);
  const sid = SEASONS[Math.min(3, Math.floor(b.time / 1440))].id;
  VIEW.battle.open($('#bwrap'), b.res, { colorA: fA.color, trimA: fA.dark, colorD: fD ? fD.color : null, trimD: fD ? fD.dark : null, season: sid, terrain: b.terrain, seed: b.time, playerSide, onLog: onBattleLog,
    onDone: (w) => {
      const won = w === playerSide; const mine = b.res.units.filter(u => u.side === playerSide && (u.soldierId || u.typeId) && !u.isBuilding);
      const lost = mine.filter(u => !u.alive).length; const foes = b.res.units.filter(u => u.side !== playerSide); const killed = foes.filter(u => !u.alive).length;
      $('#bresult').innerHTML = `<span class="chip ${won ? 'on' : 'lack'}" style="font-size:15px">${won ? '승리' : w === 'draw' ? '무승부 (철수)' : '패배'}</span><span class="chip">${b.res.rounds}턴</span><span class="chip">쓰러뜨린 적 ${killed}/${foes.length}</span><span class="chip">잃은 아군 ${lost}/${mine.length}</span>`;
    } });
}
function closeBattle() { VIEW.battle.close(); UI.battleOpen = false; $('#battle').hidden = true; $('#stage').classList.remove('away'); curBattle = null; }

/* ── 게임 오버 ─────────────────────────────────────────── */
function renderOver() {
  const o = G.over; const el = $('#over'); if (!o) { el.hidden = true; return; } if (!el.hidden) return; el.hidden = false;
  $('#overBody').innerHTML = `<h2 class="${o.result === 'win' ? 'good' : 'bad'}">${o.result === 'win' ? '승리!' : '패배…'}</h2><p style="text-align:center">${esc(o.reason)}</p><ol>${o.ranks.map(r => `<li><span style="color:${fColor(r.id)}">${esc(r.name)}</span> — ${r.score}점</li>`).join('')}</ol><p class="muted" style="text-align:center">${timeStr(o.time)} · 전투 ${G.stats.battles}회 · 승리 ${G.stats.wins}회</p>`;
}

/* ── 입력 ──────────────────────────────────────────────── */
const activeView = () => UI.mode === 'base' && VIEW.base ? VIEW.base : VIEW.map;
function setupInput() {
  const stage = $('#stage'); const ptrs = new Map(); let moved = 0, pinch = null;
  const two = () => { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; };
  stage.addEventListener('pointerdown', e => { if (!UI.started) return; stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button }); if (ptrs.size === 1) moved = 0; if (ptrs.size === 2) pinch = two(); });
  stage.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; const V = activeView();
    if (ptrs.size === 1) { if (p.b === 2 || e.shiftKey) V.rotateBy(-dx * 0.008); else V.panBy(dx, dy); moved += Math.abs(dx) + Math.abs(dy); }
    else if (ptrs.size === 2 && pinch) { const n = two(); if (n.d > 10) V.zoomBy(pinch.d / n.d); let da = n.ang - pinch.ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2; V.rotateBy(-da); pinch = n; moved += 20; }
  });
  const up = (e) => {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (p && ptrs.size === 0 && moved < 8 && UI.started && e.type === 'pointerup') {
      if (UI.mode === 'base') baseTap(VIEW.base.pick(e.clientX, e.clientY));
      else {
        const hit = VIEW.map.pick(e.clientX, e.clientY);
        if (hit && VIEW.map.far) { VIEW.map.focus(hit[0], hit[1], true); VIEW.map.zoomTo(15); selectTile(hit[0], hit[1]); } // 멀리서 누르면 그곳으로 날아간다
        else if (hit) selectTile(hit[0], hit[1]); else deselect();
      }
    }
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', e => { e.preventDefault(); if (UI.started) activeView().zoomBy(e.deltaY > 0 ? 1.12 : 0.89); }, { passive: false });
  stage.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    if (!UI.started || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase(); const step = 60; const V = activeView();
    if (k === 'w' || k === 'arrowup') V.panBy(0, step); else if (k === 's' || k === 'arrowdown') V.panBy(0, -step);
    else if (k === 'a' || k === 'arrowleft') V.panBy(step, 0); else if (k === 'd' || k === 'arrowright') V.panBy(-step, 0);
    else if (k === 'q') V.rotateBy(-Math.PI / 4); else if (k === 'e') V.rotateBy(Math.PI / 4);
    else if (k === '+' || k === '=') V.zoomBy(0.8); else if (k === '-') V.zoomBy(1.25); else if (k === '0' && UI.mode === 'world') VIEW.map.zoomAll();
    else if (k === 'b') setMode(UI.mode === 'base' ? 'world' : 'base');
    else if (k === 'm') { if (UI.panel === 'worldmap') closePanel(); else openPanel('worldmap'); }
    else if (k === ' ' && !isMP()) { e.preventDefault(); G.paused = !G.paused; renderTop(); }
    else if (k === 'escape') { if (!$('#battle').hidden) closeBattle(); else if (UI.panel) closePanel(); else deselectAll(); }
  });
  $('#home').addEventListener('click', () => { if (UI.mode === 'base') setMode('world'); VIEW.map.focus(G.factions.P.cap[0], G.factions.P.cap[1]); });
  $('#zin').addEventListener('click', () => activeView().zoomBy(0.78));
  $('#zout').addEventListener('click', () => activeView().zoomBy(1.28));
  // 섬 전체 보기 ↔ 내 거점으로 돌아오기
  $('#zall').addEventListener('click', () => { if (UI.mode === 'base') setMode('world'); if (VIEW.map.far) { VIEW.map.focus(G.factions.P.cap[0], G.factions.P.cap[1], true); VIEW.map.zoomTo(15); } else VIEW.map.zoomAll(); });
  $('#rotl').addEventListener('click', () => activeView().rotateBy(-Math.PI / 4));
  $('#rotr').addEventListener('click', () => activeView().rotateBy(Math.PI / 4));
  $('#basebuild').addEventListener('click', () => openPanel('build'));
  document.querySelectorAll('#bottom button').forEach(b => b.addEventListener('click', () => {
    const p = b.dataset.p;
    if (p === 'mode') { closePanel(); setMode(UI.mode === 'base' ? 'world' : 'base'); return; }
    if (UI.panel === p) closePanel(); else { if (p === 'army') { UI.armyTab = UI.selected ? 'send' : 'troops'; UI.troopEdit = null; } openPanel(p, p === 'army' && UI.selected && UI.mode === 'world' ? { target: UI.selected } : {}); }
  }));
  $('#panel .close').addEventListener('click', closePanel);
  $('#panel').addEventListener('click', e => { if (e.target.id === 'panel') closePanel(); });
  $('#panelBody').addEventListener('click', onPanelClick);
  $('#panelBody').addEventListener('click', e => { const cv = e.target.closest('#wmCanvas'); if (!cv) return; const r = cv.getBoundingClientRect(); goTo((e.clientX - r.left) / r.width * G.N, (e.clientY - r.top) / r.height * G.N); });
  $('#panelBody').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'chatBox') { e.preventDefault(); onPanelClick({ target: $('[data-a="say"]'), type: 'click' }); } if (e.key === 'Enter' && e.target.id === 'gotoBox') onPanelClick({ target: $('[data-a="gotoxy"]'), type: 'click' }); });
  // 누르는 동안 패널을 다시 그리지 않아 클릭이 사라지지 않게 한다
  $('#panelBody').addEventListener('pointerdown', () => { UI.pressing = true; });
  window.addEventListener('pointerup', () => { UI.pressing = false; }); window.addEventListener('pointercancel', () => { UI.pressing = false; });
  $('#panelBody').addEventListener('change', e => { if (e.target.matches('input[data-a]')) onPanelClick({ target: e.target, type: 'change' }); });
  $('#tilepop').addEventListener('click', e => { if (UI.mode === 'base') onBasePopClick(e); else onTilePopClick(e); });
  document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => { const s = +b.dataset.s; if (s === 0) G.paused = !G.paused; else { G.paused = false; G.speed = s; } renderTop(); }));
  $('#bclose').addEventListener('click', closeBattle);
  $('#bskip').addEventListener('click', () => VIEW.battle.skip());
  $('#bfast').addEventListener('click', () => { const s = { '×1': 2, '×2': 4, '×4': 1 }[$('#bfast').textContent] || 1; VIEW.battle.setSpeed(s); $('#bfast').textContent = '×' + s; });
  $('#overNew').addEventListener('click', () => { clearSave(); newGame(); $('#over').hidden = true; afterLoad(); });
  $('#overCont').addEventListener('click', () => { G.over = null; G.overAck = true; G.paused = true; $('#over').hidden = true; });
  window.addEventListener('resize', () => { VIEW.map.resize(); if (VIEW.base) VIEW.base.resize(); if (UI.battleOpen) VIEW.battle.resize(); });
  window.addEventListener('beforeunload', () => { if (UI.started) saveGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && UI.started) saveGame(); });
}

/* ── 시작 화면 (혼자 / 온라인) ─────────────────────────── */
function renderLobby() {
  const box = $('#online'); if (!box) return; const S = NET.S;
  // 버튼이 든 틀은 상태가 바뀔 때만 다시 만들고, 시각·접속자 수는 글자만 바꾼다 (누르던 버튼이 사라지지 않게)
  const key = [S.status, S.world && S.world.seed, S.world && S.world.season, S.admin, S.canWrite, S.err].join('|');
  if (box._key !== key) {
    box._key = key; let html = '';
    if (S.status === 'off') html = `<p class="muted">${ic('castle')} 온라인 월드는 claude.ai에서 이 게임을 열고 로그인했을 때 함께할 수 있어요.</p>`;
    else if (S.status === 'connecting') html = `<p class="muted">온라인 월드에 연결하는 중…</p>`;
    else if (S.status === 'error') html = `<p class="bad">온라인 연결에 문제가 있어요 (${esc(S.err)}). 새로 고침해 보세요.</p>`;
    else if (!S.world) {
      html = S.admin ? `<b>온라인 월드 만들기</b><p class="muted">300×300(9만 칸) 섬 하나를 친구들과 함께 써요. 시간 흐름을 고르세요.</p><div class="btns col">${WORLD_SPEEDS.map(w => `<button data-w="create" data-id="${w.id}" class="${w.id === 'x24' ? 'primary' : ''}">${w.name}<small>${w.desc}</small></button>`).join('')}</div>`
        : `<p class="muted">아직 온라인 월드가 없어요. 이 게임을 공유한 사람(편집자)이 월드를 만들면 들어갈 수 있어요.</p>`;
    } else {
      html = `<b>${ic('castle')} 온라인 월드 · 시즌 ${S.world.season}</b><p class="muted" id="lobbyDyn"></p>
        <div class="btns"><button data-w="join" class="mint" ${S.canWrite === false ? 'disabled' : ''}>${ic('flag')} 온라인 입장</button></div>${S.canWrite === false ? '<p class="muted">보기 전용 권한이라 들어갈 수 없어요. 공유한 사람에게 참여(Contributor) 이상 권한을 부탁하세요.</p>' : ''}`;
    }
    box.innerHTML = html;
  }
  const dyn = $('#lobbyDyn'); if (dyn && S.world) dyn.textContent = `${NET.speedOf().name} · ${timeStr(NET.worldTime())} · 지금 접속 ${Math.max(1, S.online.size)}명`;
}
async function onLobbyClick(e) {
  const el = e.target.closest('[data-w]'); if (!el || el.disabled) return;
  if (el.dataset.w === 'create') { el.disabled = true; const err = await NET.createWorld(el.dataset.id); if (err) notice(err); return; }
  if (el.dataset.w === 'join') {
    el.disabled = true; el.textContent = '들어가는 중…';
    try { const err = await NET.join(); if (err) { notice(err); el.disabled = false; return; } } catch (er) { console.error(er); notice('온라인 월드에 들어가지 못했어요.'); el.disabled = false; return; }
    enterGame('online');
  }
}
function toLobby() {
  if (isMP()) NET.leave();
  UI.started = false; document.body.classList.remove('playing', 'in-base'); UI.mode = 'world'; $('#ui').hidden = true; $('#title').hidden = false; closePanel(); deselectAll();
  if (UI.battleOpen) closeBattle(); G.pendingBattles = [];
  let hasSave = false; try { hasSave = !!localStorage.getItem(SAVE_KEY); } catch (e) {} $('#btnContinue').hidden = !hasSave;
  newGame(); VIEW.map.build(); VIEW.map.orbit(true); if (VIEW.is3d) VIEW.map.zoomBy(1.7); VIEW.map.setActive(true); if (VIEW.base) VIEW.base.setActive(false);
  renderLobby();
}

/* ── 시작 / 루프 ───────────────────────────────────────── */
function afterLoad() {
  UI.predict = null; UI.armyPick.clear(); UI.troopEdit = null; VIEW.map.build(); VIEW.map.orbit(false); VIEW.map.focus(G.factions.P.cap[0], G.factions.P.cap[1], true);
  if (VIEW.base) VIEW.base.build();
  UI.mode = 'world'; document.body.classList.remove('in-base'); VIEW.map.setActive(true); if (VIEW.base) VIEW.base.setActive(false);
  UI.selected = null; $('#tilepop').hidden = true; UI.lastPanel = ''; UI.lastPop = ''; navState(); renderTop();
}
function enterGame(how) {
  if (how === 'new') newGame(); else if (how === 'load' && !loadGame()) newGame();
  G.toasts = []; G.paused = false;
  UI.started = true; $('#title').hidden = true; $('#ui').hidden = false; document.body.classList.add('playing');
  afterLoad();
  notice(how === 'online' ? `온라인 월드에 들어왔어요! 거점 (${G.factions.P.cap[0]},${G.factions.P.cap[1]}) 옆 땅부터 넓혀 보세요.` : how === 'load' ? '이어서 시작해요.' : '거점 옆 타일을 눌러 첫 땅을 점령해 보세요!', 'info');
}
let last = performance.now(), acc = 0, hudT = 0, saveT = 0, mapT = 0, lobbyT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; mapT += dt;
  if (UI.started && G && isMP()) { const target = NET.worldTime(); if (target > G.time) tick(Math.min(target - G.time, 720)); NET.update(); }
  else if (UI.started && G && !G.paused && !G.over) { acc += dt * G.speed; const m = Math.floor(acc); if (m > 0) { acc -= m; tick(Math.min(m, 60)); } }
  if (!UI.battleOpen) { if (UI.mode === 'base' && VIEW.base) VIEW.base.frame(Math.min(0.1, mapT)); else VIEW.map.frame(Math.min(0.1, mapT), UI.selected); mapT = 0; } // 전투 중에는 지도를 쉬게 한다
  if (!UI.started) { lobbyT += dt; if (lobbyT > 1) { lobbyT = 0; renderLobby(); } return; }
  hudT -= dt; if (hudT <= 0) { hudT = 0.4; renderTop(); if (UI.panel) renderPanel(); if (UI.mode === 'base') { if (UI.place || UI.baseSel) renderBasePop(); } else if (UI.selected) renderTilePop(); renderToasts(); }
  if (G.pendingBattles.length && !UI.battleOpen) showNextBattle();
  if (G.over) renderOver();
  saveT += dt; if (saveT > 30) { saveT = 0; saveGame(); }
}
function init() {
  const stage = $('#stage');
  const can3d = typeof THREE !== 'undefined' && World3D && World3D.init(stage);
  VIEW = can3d ? { map: World3D, battle: Battle3D, base: Base3D, is3d: true } : { map: Map2D, battle: Battle2D, base: Base2D, is3d: false };
  if (!can3d) { stage.innerHTML = ''; Map2D.init(stage); Base2D.init(stage); } else Base3D.init(World3D.renderer, stage);
  // 시작 화면 뒤에서 섬이 천천히 돈다
  newGame(); VIEW.map.build(); VIEW.map.orbit(true); if (VIEW.is3d) VIEW.map.zoomBy(1.7);
  let hasSave = false; try { hasSave = !!localStorage.getItem(SAVE_KEY); } catch (e) {}
  $('#btnContinue').hidden = !hasSave;
  $('#btnNew').addEventListener('click', () => enterGame('new'));
  $('#btnContinue').addEventListener('click', () => enterGame('load'));
  $('#online').addEventListener('click', onLobbyClick);
  const pc = pColor();
  $('#parade').innerHTML = [Portrait.unit('spear_long', pc), Portrait.unit('shield_sword', pc), Portrait.monster('boar'), Portrait.unit('bow_hunter', pc), Portrait.unit('cav_spear', pc, true), Portrait.monster('hornet'), Portrait.unit('siege_cat', pc), Portrait.monster('skunk')].join('');
  document.querySelectorAll('#parade img').forEach((im, i) => im.style.animationDelay = (i * 0.12) + 's');
  setupInput();
  NET.on(ev => { if (!UI.started) renderLobby(); else if (ev === 'reset') { notice('새 시즌이 시작됐어요! 첫 화면에서 다시 들어오세요.', 'warn'); toLobby(); } else if (ev === 'readonly') notice('이 월드에 쓸 권한이 없어 진행이 저장되지 않아요.', 'bad'); else if (UI.panel === 'alliance' && (ev === 'chat' || ev === 'names' || ev === 'online')) { UI.lastPanel = ''; renderPanel(true); } });
  renderLobby(); NET.connect();
  requestAnimationFrame(loop);
}
window.addEventListener('DOMContentLoaded', init);
