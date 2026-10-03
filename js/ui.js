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

const UI = { panel: null, args: {}, selected: null, armyPick: new Set(), armyStay: false, battleOpen: false, autoBattle: false, codexTab: 'units', soldierTab: 'list', started: false, lastPanel: '', lastPop: '' };
let VIEW = null;
const pColor = () => (G && G.factions ? G.factions.P.color : '#ffc23d');

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
function tileLabel(t) { return `${TERRAIN_NAME[t.type]}${t.ruin ? ' 유적' : ''}${giantOf(t) ? ' · 거대 야수' : ''}${t.fort ? ' · 요새' : ''}`; }
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
  setHTML('#land', `${ic('land')}${P.territory}/${territoryCap()}`);
  document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', (G.paused && b.dataset.s === '0') || (!G.paused && +b.dataset.s === G.speed)));
  const q = [];
  const qc = (label, x) => `<span class="q">${label}<span class="bar"><i style="width:${Math.round((1 - x.remain / x.total) * 100)}%"></i></span>${durStr(x.remain)}</span>`;
  if (P.buildQueue[0]) q.push(qc(`${ic('build')} ${BUILDINGS[P.buildQueue[0].id].name} Lv${(P.buildings[P.buildQueue[0].id] || 0) + 1}`, P.buildQueue[0]));
  if (P.buildQueue[1]) q.push(qc(`${ic('build')} ${BUILDINGS[P.buildQueue[1].id].name}`, P.buildQueue[1]));
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
const PANELS = { build: panelBuild, soldiers: panelSoldiers, army: panelArmy, heroes: panelHeroes, equip: panelEquip, alliance: panelAlliance, codex: panelCodex, menu: panelMenu, soldier: panelSoldier, log: panelLog };
const STATIC_PANELS = { menu: 1, codex: 1, log: 1 };
function openPanel(name, args = {}) { UI.panel = name; UI.args = args; UI.lastPanel = ''; $('#panel').hidden = false; renderPanel(true); $('#panelBody').scrollTop = 0; navState(); }
function closePanel() { UI.panel = null; $('#panel').hidden = true; navState(); }
function navState() { document.querySelectorAll('#bottom button').forEach(b => b.classList.toggle('on', b.dataset.p === UI.panel || (UI.panel === 'soldier' && b.dataset.p === 'soldiers'))); }
function renderPanel(force) {
  if (!UI.panel) return; if (!force && STATIC_PANELS[UI.panel]) return;
  const { title, body } = PANELS[UI.panel](UI.args);
  setHTML('#panelTitle', title);
  if (body === UI.lastPanel) return; UI.lastPanel = body;
  const el = $('#panelBody'); const open = new Set([...el.querySelectorAll('details[data-k][open]')].map(d => d.dataset.k));
  el.innerHTML = body;
  el.querySelectorAll('details[data-k]').forEach(d => { if (open.has(d.dataset.k)) d.open = true; });
}

function panelBuild() {
  const P = G.player;
  const rows = BUILDING_ORDER.map(id => {
    const b = BUILDINGS[id], lv = P.buildings[id] || 0, q = P.buildQueue.find(x => x.id === id), c = buildCost(id), locked = b.req && P.buildings.capital < b.req, max = lv >= b.max;
    const capBlock = id !== 'capital' && lv + 1 > P.buildings.capital;
    const btn = q ? `<span class="chip on">건설 중</span>` : max ? '' : `<button data-a="build" data-id="${id}" ${locked ? 'disabled' : ''} class="${canAfford(c) && !capBlock ? 'primary' : ''}">${locked ? '거점 Lv' + b.req : lv ? '올리기' : '짓기'}</button>`;
    return `<div class="row ${locked ? 'dim' : ''}"><span class="ico-box">${ic(BICON[id])}</span><div class="grow"><div class="name">${b.name} <span class="lvb">Lv${lv}</span>${max ? '<span class="chip">MAX</span>' : ''}</div><div class="desc">${b.desc}</div>
      ${!max ? `<div class="stats">${costChips(c)}<span class="chip">${durStr(buildTime(id))}</span>${capBlock ? '<span class="chip lack">거점 레벨 필요</span>' : ''}</div>` : ''}${q ? `<div class="bar"><i style="width:${Math.round((1 - q.remain / q.total) * 100)}%"></i></div><div class="muted">${durStr(q.remain)} 남음</div>` : ''}</div>${btn}</div>`;
  }).join('');
  return { title: `${ic('build')} 건설 <small>거점 Lv${P.buildings.capital} · 대기열 ${P.buildQueue.length}/2</small>`, body: `
    <div class="stats"><span class="chip">저장 상한 ${fmt(storageCap())}</span><span class="chip">영토 상한 ${territoryCap()}칸</span><span class="chip">부대 인원 ${armyCap()}</span><span class="chip">동시 출전 ${maxArmies()}</span><span class="chip">거점 내구 ${'♥'.repeat(P.capHp)}${'♡'.repeat(CONST.CAP_HP - P.capHp)}</span></div>
    <p class="note">모든 건물은 거점 레벨을 넘을 수 없어요. 거점을 먼저 올리면 다른 건물의 상한이 열려요.</p>${rows}` };
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

function panelArmy({ target }) {
  const P = G.player; const t = target ? tileAt(target[0], target[1]) : null;
  const avail = P.soldiers.filter(s => !s.army && !P.trainQueue.find(q => q.sid === s.id));
  for (const id of [...UI.armyPick]) if (!avail.find(s => s.id === id)) UI.armyPick.delete(id);
  const ids = [...UI.armyPick]; const def = t ? tileDefenders(t) : null; const err = t ? canTarget(t) : '지도에서 목표 타일을 먼저 골라 주세요.';
  let eta = ''; if (t) { const [ox, oy] = originFor(t.x, t.y); const d = Math.max(Math.abs(t.x - ox), Math.abs(t.y - oy)) || 1; eta = `(${ox},${oy})에서 ${d}칸 · ${Math.round(armySpeed(ids))}칸/시 · 약 ${durStr(d / armySpeed(ids) * 60)}`; }
  const foeColor = t && t.owner && t.owner !== 'P' ? G.factions[t.owner].color : pColor();
  const defRow = def && def.specs.length ? `<div class="mons">${groupSpecs(def.specs).slice(0, 8).map(({ sp, n }) => `<div class="mon">${specPortrait(sp, 'xs', foeColor)}<b>${specName(sp)}${n > 1 ? ' ×' + n : ''}</b><span class="muted">체력 ${specHp(sp)} · 공격 ${specAtk(sp)}</span></div>`).join('')}</div>` : '';
  const picks = avail.map(s => { const u = UNITS[s.type], st = soldierStats(s), on = UI.armyPick.has(s.id);
    return `<label class="row pick ${on ? 'on' : ''}"><input type="checkbox" id="pk${s.id}" data-a="pick" data-id="${s.id}" ${on ? 'checked' : ''}>${unitPortrait(s.type, s.hero, 'sm')}<span class="grow"><span class="name">${u.name} <span class="lvb">Lv${s.lv}</span>${s.hero ? `<span class="chip hero">${HEROES[s.hero.heroId].name}</span>` : ''}</span><span class="muted">체력 ${st.hp} · 공격 ${st.atk} · ${CLASS_INFO[u.cls].speed}칸/시</span></span></label>`; }).join('');
  return { title: `${ic('flag')} 부대 편성`, body: `
    ${t ? `<div class="row"><span class="ico-box">${ic(TERRAIN_IC[t.type])}</span><div class="grow"><div class="name">(${t.x},${t.y}) ${tileLabel(t)} <span class="lvb">Lv${t.lv}</span></div><div class="desc">수비: ${def.label}</div><div class="desc">${eta}</div>${err ? `<div class="bad">${err}</div>` : ''}</div></div>${defRow}` : `<p class="note">${err}</p>`}
    <div class="btns"><span class="chip">선택 ${ids.length}/${armyCap()}명</span><span class="chip">출전 부대 ${G.armies.filter(a => a.owner === 'P').length}/${maxArmies()}</span><button data-a="pickall">전체 선택</button><button data-a="pickclear">비우기</button></div>
    ${picks || '<p class="muted">지금 출전할 수 있는 병사가 없어요.</p>'}
    <label class="row pick ${UI.armyStay ? 'on' : ''}"><input type="checkbox" id="stayChk" data-a="stay" ${UI.armyStay ? 'checked' : ''}><span class="grow"><span class="name">도착 후 그 자리 대기</span><span class="muted">점령한 타일에 주둔해 지켜요. 왕복 시간도 아껴요.</span></span></label>
    <div class="btns"><button data-a="predict" ${t && ids.length && !err ? '' : 'disabled'}>전투 예측</button><button data-a="send" class="primary" ${t && ids.length && !err ? '' : 'disabled'}>${ic('flag')} 출전!</button></div>
    <div id="predict">${UI.predict && UI.predict.key === (t ? t.x + ',' + t.y + ':' + ids.join(',') : '') ? UI.predict.html : ''}</div>` };
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
  const P = G.player; const emb = P.buildings.embassy || 0;
  const ranks = Object.values(G.factions).map(f => ({ f, score: scoreOf(f.id), ruins: G.map.filter(t => t.owner === f.id && t.ruin).map(t => t.ruin) })).sort((a, b) => b.score - a.score);
  const top = Math.max(1, ...ranks.map(r => r.score));
  const rows = ranks.map((r, i) => { const hp = r.f.id === 'P' ? P.capHp : r.f.capHp; return `<div class="row"><span class="ico-box" style="background:${r.f.color}33">${Portrait.building('castle', r.f.color, 'sm')}</span><div class="grow"><div class="name">${i + 1}위 ${r.f.name} ${r.f.alive ? `<span class="chip">${'♥'.repeat(hp)}${'♡'.repeat(Math.max(0, CONST.CAP_HP - hp))}</span>` : '<span class="chip lack">탈락</span>'}</div><div class="desc">영토 ${r.f.tiles}칸 · 유적 ${r.ruins.length ? r.ruins.map(x => 'Lv' + x).join(', ') : '없음'} · 점수 ${r.score}</div><div class="bar"><i style="width:${Math.round(r.score / top * 100)}%;background:${r.f.color}"></i></div></div></div>`; }).join('');
  const pol = Object.keys(POLICIES).map(k => `<button data-a="policy" data-id="${k}" class="${P.policy === k ? 'on' : ''}" ${emb >= 3 || k === 'none' ? '' : 'disabled'}>${POLICIES[k].name}${POLICIES[k].desc ? `<small>${POLICIES[k].desc}</small>` : ''}</button>`).join('');
  return { title: `${ic('castle')} 연맹 · 세력`, body: `
    <div class="note"><b>승리 조건</b><br>· 유적 Lv20을 먼저 완성하거나, Lv12 이상 유적 3개 확보<br>· 최후 혈전: 다른 연맹 거점을 모두 함락 (거점마다 내구 3, 함락하면 그 세력 영지가 넘어와요)<br>· 겨울(4일차)이 끝나면 점수(영토 + 유적 Lv×3)로 결산<br>· 적 영지 공격은 매일 20:00~24:00. 탈락한 세력은 시간 제한 없음</div>
    <h3>${ic('star')} 세력 순위</h3>${rows}
    <h3>${ic('flag')} 연맹 정책 <span class="n">대사관 Lv${emb}${emb < 3 ? ' · Lv3 필요' : ''}</span></h3><div class="btns col">${pol}</div>` };
}

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
  const st = G.stats; const q = VIEW.map.getQuality();
  return { title: `${ic('menu')} 메뉴`, body: `
    <div class="btns col">
      <button data-a="save" class="primary">지금 저장하기</button>
    </div>
    <h3>그래픽</h3>
    <div class="btns">${VIEW.is3d ? [['high', '높음'], ['mid', '보통'], ['low', '낮음']].map(([k, n]) => `<button data-a="quality" data-id="${k}" class="${q === k ? 'on' : ''}">${n}</button>`).join('') : '<span class="muted">이 기기는 WebGL을 쓸 수 없어 2D 화면으로 보여요.</span>'}</div>
    <p class="muted">낮음은 그림자를 끄고 해상도를 낮춰 휴대폰 배터리를 아껴요.</p>
    <h3>전투</h3>
    <label class="row pick ${UI.autoBattle ? 'on' : ''}"><input type="checkbox" id="autoBattleChk" data-a="autobattle" ${UI.autoBattle ? 'checked' : ''}><span class="grow"><span class="name">전투 장면 건너뛰기</span><span class="muted">결과만 알림으로 보여요.</span></span></label>
    <h3>저장 코드</h3>
    <textarea id="ioBox" rows="3" placeholder="저장 코드를 붙여넣고 불러오기를 누르세요"></textarea>
    <div class="btns"><button data-a="export">저장 코드 복사</button><button data-a="import">저장 코드 불러오기</button></div>
    <div class="btns"><button data-a="log">사건 기록 보기</button><button data-a="newgame" class="danger">새 게임 (지금 진행 삭제)</button></div>
    <div class="stats"><span class="chip">전투 ${st.battles}회</span><span class="chip">승리 ${st.wins}</span><span class="chip">패배 ${st.lost}</span><span class="chip">전사 ${st.kills}</span></div>
    <p class="muted">《9만 에이커》의 공개된 규칙과 수치를 바탕으로 핵심 재미(영토 확장, 턴제 오토배틀, 영웅 모디파이어, 시즌 경쟁)를 웹에서 다시 만든 팬 메이드 게임이에요. 문서에 수치가 없던 병종·영웅은 추정치로 표시했어요.</p>` };
}
function panelLog() { return { title: `${ic('book')} 사건 기록`, body: G.log.map(l => `<div class="row"><span class="chip">${timeStr(l.t)}</span><span class="grow ${l.kind}">${esc(l.text)}</span></div>`).join('') || '<p class="muted">아직 기록이 없어요.</p>' }; }

/* 패널 동작 */
function onPanelClick(e) {
  const el = e.target.closest('[data-a]'); if (!el) return;
  if (el.tagName === 'INPUT' && e.type === 'click') return; // 체크박스는 change에서 처리
  const a = el.dataset.a, id = el.dataset.id; let msg = null;
  switch (a) {
    case 'build': msg = build(id); if (!msg) notice(`${BUILDINGS[id].name} 공사를 시작했어요.`, 'good'); break;
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
    case 'pickall': for (const s of G.player.soldiers) if (!s.army && !G.player.trainQueue.find(q => q.sid === s.id) && UI.armyPick.size < armyCap()) UI.armyPick.add(s.id); break;
    case 'pickclear': UI.armyPick.clear(); break;
    case 'stay': UI.armyStay = el.checked; break;
    case 'send': { const t = UI.args.target; msg = sendArmy([...UI.armyPick], t[0], t[1], UI.armyStay); if (!msg) { UI.armyPick.clear(); closePanel(); notice('부대가 출발했어요!', 'good'); } break; }
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
    case 'policy': G.player.policy = id; break;
    case 'ctab': UI.codexTab = id; renderPanel(true); return;
    case 'quality': VIEW.map.setQuality(id); renderPanel(true); return;
    case 'save': notice(saveGame() ? '저장했어요.' : '이 브라우저에서는 저장할 수 없어요.', 'good'); return;
    case 'export': { const box = $('#ioBox'); box.value = exportSave(); box.select(); try { navigator.clipboard.writeText(box.value).then(() => notice('클립보드에 복사했어요.', 'good')).catch(() => notice('글자를 직접 복사해 주세요.', 'info')); } catch (err) { notice('글자를 직접 복사해 주세요.', 'info'); } return; }
    case 'import': { if (importSave($('#ioBox').value)) { notice('불러왔어요.', 'good'); closePanel(); afterLoad(); } else notice('저장 코드가 올바르지 않아요.'); return; }
    case 'autobattle': UI.autoBattle = el.checked; renderPanel(true); return;
    case 'log': openPanel('log'); return;
    case 'newgame': if (el.dataset.confirm) { clearSave(); newGame(); closePanel(); afterLoad(); notice('새 게임을 시작해요!', 'good'); } else { el.dataset.confirm = '1'; el.textContent = '정말 지우고 새로 시작 (한 번 더)'; } return;
  }
  if (msg) notice(msg);
  renderPanel(true); renderTop();
}

/* ── 타일 팝업 ─────────────────────────────────────────── */
function selectTile(x, y) { const t = tileAt(x, y); if (!t) { deselect(); return; } UI.selected = [x, y]; UI.lastPop = ''; renderTilePop(); }
function deselect() { UI.selected = null; $('#tilepop').hidden = true; }
function renderTilePop() {
  if (!UI.selected) return; const t = tileAt(...UI.selected); const pop = $('#tilepop'); pop.hidden = false;
  const def = tileDefenders(t); const owner = t.owner ? G.factions[t.owner] : null;
  const prod = t.type === 'capital' ? '' : t.type === 'ruin' ? `식량·목재·석재 각 ${Math.round(tileProduction(t.lv) * 0.4)}/시` : `${RES_NAME[{ plain: 'food', forest: 'wood', hill: 'stone' }[t.type]]} ${tileProduction(t.lv)}/시`;
  const foeColor = owner && t.owner !== 'P' ? owner.color : pColor();
  const showDef = t.owner !== 'P' || t.type === 'capital';
  const mons = showDef && def.specs.length ? `<div class="mons">${groupSpecs(def.specs).slice(0, 6).map(({ sp, n }) => `<div class="mon">${specPortrait(sp, 'xs', foeColor)}<span class="grow"><b>${specName(sp)}${n > 1 ? ' ×' + n : ''}</b> <span class="muted">체력 ${specHp(sp)} · 공격 ${specAtk(sp)}</span>${sp.monsterId ? `<br><span class="muted">${MONSTERS[sp.monsterId].desc}</span>` : ''}</span></div>`).join('')}${groupSpecs(def.specs).length > 6 ? `<span class="muted">외 ${groupSpecs(def.specs).length - 6}종</span>` : ''}</div>` : '';
  const st = G.armies.find(a => a.owner === 'P' && a.state === 'wait' && a.x === t.x && a.y === t.y);
  const err = canTarget(t);
  let actions = '';
  if (t.owner === 'P') {
    if (t.type === 'capital') actions += `<span class="chip">수비: 대기 중인 병사 ${G.player.soldiers.filter(s => !s.army).length}명 + 성벽</span><span class="chip">내구 ${'♥'.repeat(G.player.capHp)}${'♡'.repeat(CONST.CAP_HP - G.player.capHp)}</span>`;
    if (!st && t.type !== 'capital') actions += `<button data-t="army">부대 주둔시키기</button>`;
    if (st) actions += `<span class="chip on">주둔 ${st.units.length}명</span><button data-t="recall">회군</button>`;
    if (t.ruin) { const c = ruinCost(t); actions += `<button data-t="ruin" class="primary">유적 Lv${t.ruin} → ${t.ruin + 1}</button><span class="stats">${costChips(c)}</span>`; }
    if (!t.fort && ['plain', 'forest', 'hill'].includes(t.type)) actions += `<button data-t="fort">요새 짓기</button><span class="stats">${costChips({ wood: 500, stone: 700 })}</span>`;
  } else {
    actions += `<button data-t="army" class="primary" ${err ? 'disabled' : ''}>${ic('flag')} ${t.owner ? '공격' : '점령'} 부대 편성</button>${err ? `<div class="bad" style="width:100%">${err}</div>` : ''}`;
  }
  const html = `<div class="tp-head"><span class="ico-box">${ic(TERRAIN_IC[t.type])}</span><div class="grow"><div class="t">${tileLabel(t)} <span class="lvb">Lv${t.lv}</span>${t.ruin ? ` <span class="chip hero">유적 Lv${t.ruin}</span>` : ''}</div>
    <div class="muted">(${t.x},${t.y}) · <b style="color:${owner ? owner.color : 'inherit'}">${owner ? owner.name : '무소속'}</b>${t.protect > G.time ? ` · 보호 ${durStr(t.protect - G.time)}` : ''}${prod ? ' · ' + prod : ''}</div></div><button class="x" data-t="close" aria-label="닫기">${ic('close')}</button></div>
    ${mons}<div class="btns">${actions}</div>`;
  if (html !== UI.lastPop) { UI.lastPop = html; pop.innerHTML = html; }
}
function onTilePopClick(e) {
  const el = e.target.closest('[data-t]'); if (!el) return; const t = tileAt(...UI.selected); let msg = null;
  switch (el.dataset.t) {
    case 'close': deselect(); return;
    case 'army': openPanel('army', { target: [t.x, t.y] }); return;
    case 'recall': { const st = G.armies.find(a => a.owner === 'P' && a.state === 'wait' && a.x === t.x && a.y === t.y); if (st) recallArmy(st); break; }
    case 'ruin': msg = upgradeRuin(t); break;
    case 'fort': msg = buildFort(t); break;
  }
  if (msg) notice(msg); UI.lastPop = ''; renderTilePop(); renderTop();
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
  $('#overBody').innerHTML = `<h2 class="${o.result === 'win' ? 'good' : 'bad'}">${o.result === 'win' ? '승리!' : '패배…'}</h2><p style="text-align:center">${esc(o.reason)}</p><ol>${o.ranks.map(r => `<li><span style="color:${G.factions[r.id].color}">${r.name}</span> — ${r.score}점</li>`).join('')}</ol><p class="muted" style="text-align:center">${timeStr(o.time)} · 전투 ${G.stats.battles}회 · 승리 ${G.stats.wins}회</p>`;
}

/* ── 입력 ──────────────────────────────────────────────── */
function setupInput() {
  const stage = $('#stage'); const ptrs = new Map(); let moved = 0, pinch = null;
  const two = () => { const [a, b] = [...ptrs.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; };
  stage.addEventListener('pointerdown', e => { if (!UI.started) return; stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button }); if (ptrs.size === 1) moved = 0; if (ptrs.size === 2) pinch = two(); });
  stage.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) { if (p.b === 2 || e.shiftKey) VIEW.map.rotateBy(-dx * 0.008); else VIEW.map.panBy(dx, dy); moved += Math.abs(dx) + Math.abs(dy); }
    else if (ptrs.size === 2 && pinch) { const n = two(); if (n.d > 10) VIEW.map.zoomBy(pinch.d / n.d); let da = n.ang - pinch.ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2; VIEW.map.rotateBy(-da); pinch = n; moved += 20; }
  });
  const up = (e) => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (p && ptrs.size === 0 && moved < 8 && UI.started && e.type === 'pointerup') { const hit = VIEW.map.pick(e.clientX, e.clientY); if (hit) selectTile(hit[0], hit[1]); else deselect(); } };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', e => { e.preventDefault(); if (UI.started) VIEW.map.zoomBy(e.deltaY > 0 ? 1.12 : 0.89); }, { passive: false });
  stage.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', e => {
    if (!UI.started || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase(); const step = 60;
    if (k === 'w' || k === 'arrowup') VIEW.map.panBy(0, step); else if (k === 's' || k === 'arrowdown') VIEW.map.panBy(0, -step);
    else if (k === 'a' || k === 'arrowleft') VIEW.map.panBy(step, 0); else if (k === 'd' || k === 'arrowright') VIEW.map.panBy(-step, 0);
    else if (k === 'q') VIEW.map.rotateBy(-Math.PI / 4); else if (k === 'e') VIEW.map.rotateBy(Math.PI / 4);
    else if (k === '+' || k === '=') VIEW.map.zoomBy(0.8); else if (k === '-') VIEW.map.zoomBy(1.25);
    else if (k === ' ') { e.preventDefault(); G.paused = !G.paused; renderTop(); }
    else if (k === 'escape') { if (!$('#battle').hidden) closeBattle(); else if (UI.panel) closePanel(); else deselect(); }
  });
  $('#home').addEventListener('click', () => VIEW.map.focus(G.factions.P.cap[0], G.factions.P.cap[1]));
  $('#zin').addEventListener('click', () => VIEW.map.zoomBy(0.78));
  $('#zout').addEventListener('click', () => VIEW.map.zoomBy(1.28));
  $('#rotl').addEventListener('click', () => VIEW.map.rotateBy(-Math.PI / 4));
  $('#rotr').addEventListener('click', () => VIEW.map.rotateBy(Math.PI / 4));
  document.querySelectorAll('#bottom button').forEach(b => b.addEventListener('click', () => { if (UI.panel === b.dataset.p) closePanel(); else openPanel(b.dataset.p, b.dataset.p === 'army' ? { target: UI.selected } : {}); }));
  $('#panel .close').addEventListener('click', closePanel);
  $('#panel').addEventListener('click', e => { if (e.target.id === 'panel') closePanel(); });
  $('#panelBody').addEventListener('click', onPanelClick);
  $('#panelBody').addEventListener('change', e => { if (e.target.matches('input[data-a]')) onPanelClick({ target: e.target, type: 'change' }); });
  $('#tilepop').addEventListener('click', onTilePopClick);
  document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => { const s = +b.dataset.s; if (s === 0) G.paused = !G.paused; else { G.paused = false; G.speed = s; } renderTop(); }));
  $('#bclose').addEventListener('click', closeBattle);
  $('#bskip').addEventListener('click', () => VIEW.battle.skip());
  $('#bfast').addEventListener('click', () => { const s = { '×1': 2, '×2': 4, '×4': 1 }[$('#bfast').textContent] || 1; VIEW.battle.setSpeed(s); $('#bfast').textContent = '×' + s; });
  $('#overNew').addEventListener('click', () => { clearSave(); newGame(); $('#over').hidden = true; afterLoad(); });
  $('#overCont').addEventListener('click', () => { G.over = null; G.paused = true; $('#over').hidden = true; });
  window.addEventListener('resize', () => { VIEW.map.resize(); if (UI.battleOpen) VIEW.battle.resize(); });
  window.addEventListener('beforeunload', () => { if (UI.started) saveGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && UI.started) saveGame(); });
}

/* ── 시작 / 루프 ───────────────────────────────────────── */
function afterLoad() { VIEW.map.build(); VIEW.map.orbit(false); VIEW.map.focus(G.factions.P.cap[0], G.factions.P.cap[1], true); UI.selected = null; $('#tilepop').hidden = true; UI.lastPanel = ''; UI.lastPop = ''; renderTop(); }
function startGame(load) {
  if (!(load && loadGame())) newGame();
  G.toasts = []; G.paused = false;
  UI.started = true; $('#title').hidden = true; $('#ui').hidden = false; document.body.classList.add('playing');
  afterLoad();
  notice(load ? '이어서 시작해요.' : '거점 옆 타일을 눌러 첫 땅을 점령해 보세요!', 'info');
}
let last = performance.now(), acc = 0, hudT = 0, saveT = 0, mapT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; mapT += dt;
  if (UI.started && G && !G.paused && !G.over) { acc += dt * G.speed; const m = Math.floor(acc); if (m > 0) { acc -= m; tick(Math.min(m, 60)); } }
  if (!UI.battleOpen) { VIEW.map.frame(Math.min(0.1, mapT), UI.selected); mapT = 0; } // 전투 중에는 지도를 쉬게 한다
  if (!UI.started) return;
  hudT -= dt; if (hudT <= 0) { hudT = 0.4; renderTop(); if (UI.panel) renderPanel(); if (UI.selected) renderTilePop(); renderToasts(); }
  if (G.pendingBattles.length && !UI.battleOpen) showNextBattle();
  if (G.over) renderOver();
  saveT += dt; if (saveT > 30) { saveT = 0; saveGame(); }
}
function init() {
  const stage = $('#stage');
  const can3d = typeof THREE !== 'undefined' && World3D && World3D.init(stage);
  VIEW = can3d ? { map: World3D, battle: Battle3D, is3d: true } : { map: Map2D, battle: Battle2D, is3d: false };
  if (!can3d) { stage.innerHTML = ''; Map2D.init(stage); }
  // 시작 화면 뒤에서 섬이 천천히 돈다
  newGame(); VIEW.map.build(); VIEW.map.orbit(true); if (VIEW.is3d) VIEW.map.zoomBy(1.7);
  let hasSave = false; try { hasSave = !!localStorage.getItem(SAVE_KEY); } catch (e) {}
  $('#btnContinue').hidden = !hasSave;
  $('#btnNew').addEventListener('click', () => startGame(false));
  $('#btnContinue').addEventListener('click', () => startGame(true));
  const pc = pColor();
  $('#parade').innerHTML = [Portrait.unit('spear_long', pc), Portrait.unit('shield_sword', pc), Portrait.monster('boar'), Portrait.unit('bow_hunter', pc), Portrait.unit('cav_spear', pc, true), Portrait.monster('hornet'), Portrait.unit('siege_cat', pc), Portrait.monster('skunk')].join('');
  document.querySelectorAll('#parade img').forEach((im, i) => im.style.animationDelay = (i * 0.12) + 's');
  setupInput();
  requestAnimationFrame(loop);
}
window.addEventListener('DOMContentLoaded', init);
