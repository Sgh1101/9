/* ============================================================
   UI — 상단바, 하단 내비, 패널, 타일 팝업, 전투 화면, 시작 화면
   ============================================================ */
'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const UI = { panel: null, args: {}, selected: null, armyPick: new Set(), armyStay: false, battleQueue: [], battleOpen: false, autoBattle: false, codexTab: 'units' };

/* ── 상단바 ─────────────────────────────────────────────── */
function renderTop() {
  const P = G.player, pr = production(), s = season(), cap = storageCap();
  const r = (k, v, rate) => `<div class="res ${v >= cap - 1 ? 'full' : ''}"><span class="lbl">${RES_NAME[k]}</span><b>${fmt(v)}</b><small class="${rate < 0 ? 'neg' : ''}">${rate >= 0 ? '+' : ''}${Math.round(rate)}/h</small></div>`;
  $('#resbar').innerHTML = r('food', P.res.food, pr.foodNet) + r('wood', P.res.wood, pr.wood) + r('stone', P.res.stone, pr.stone) + `<div class="res"><span class="lbl">두루마리</span><b>${P.scroll}</b><small>영토 ${P.territory}/${territoryCap()}</small></div>`;
  const pvp = pvpOpen();
  $('#clock').innerHTML = `<span class="season" style="--sc:${s.color}">${s.name}</span> <b>${timeStr(G.time)}</b> <span class="pvp ${pvp ? 'on' : ''}">${pvp ? 'PvP 개방' : 'PvP 20:00~24:00'}</span>`;
  document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', (G.paused && b.dataset.s === '0') || (!G.paused && +b.dataset.s === G.speed)));
  const q = [];
  if (P.buildQueue[0]) q.push(`🔨 ${BUILDINGS[P.buildQueue[0].id].name} ${durStr(P.buildQueue[0].remain)}`);
  if (P.recruitQueue[0]) q.push(`⚔ ${UNITS[P.recruitQueue[0].type].name} ${durStr(P.recruitQueue[0].remain)}${P.recruitQueue.length > 1 ? ' +' + (P.recruitQueue.length - 1) : ''}`);
  if (P.trainQueue[0]) q.push(`🎓 훈련 ${durStr(P.trainQueue[0].remain)}`);
  if (P.craftQueue[0]) q.push(`🛠 ${EQUIPMENT[P.craftQueue[0].id].name} ${durStr(P.craftQueue[0].remain)}`);
  $('#queues').innerHTML = q.map(x => `<span>${x}</span>`).join('');
}

/* ── 토스트 ─────────────────────────────────────────────── */
function renderToasts() {
  const now = Date.now(); G.toasts = G.toasts.filter(t => t.until > now);
  $('#toasts').innerHTML = G.toasts.slice(-4).map(t => `<div class="toast ${t.kind}">${esc(t.text)}</div>`).join('');
}

/* ── 패널 ───────────────────────────────────────────────── */
function openPanel(name, args = {}) { UI.panel = name; UI.args = args; $('#panel').hidden = false; renderPanel(); }
function closePanel() { UI.panel = null; $('#panel').hidden = true; }
function renderPanel() {
  if (!UI.panel) return;
  const map = { build: panelBuild, soldiers: panelSoldiers, army: panelArmy, heroes: panelHeroes, equip: panelEquip, alliance: panelAlliance, codex: panelCodex, menu: panelMenu, soldier: panelSoldier, log: panelLog };
  const fn = map[UI.panel]; if (!fn) return;
  const { title, body } = fn(UI.args);
  $('#panelTitle').textContent = title; $('#panelBody').innerHTML = body;
}
function notice(msg, kind = 'warn') { if (msg) toast(msg, kind); renderToasts(); }

function panelBuild() {
  const P = G.player;
  const rows = BUILDING_ORDER.map(id => {
    const b = BUILDINGS[id], lv = P.buildings[id] || 0, q = P.buildQueue.find(x => x.id === id);
    const c = buildCost(id); const locked = b.req && P.buildings.capital < b.req;
    return `<div class="row"><div class="grow"><b>${b.name} <span class="lv">Lv${lv}${lv >= b.max ? ' MAX' : ''}</span></b><div class="muted">${b.desc}</div>
      ${lv < b.max ? `<div class="cost">${costStr(c)} · ${durStr(buildTime(id))}</div>` : ''}</div>
      ${q ? `<span class="tag">건설 중 ${durStr(q.remain)}</span>` : lv < b.max ? `<button data-a="build" data-id="${id}" ${locked ? 'disabled' : ''} class="${canAfford(c) ? 'primary' : ''}">${locked ? '거점 Lv' + b.req : lv ? '업그레이드' : '건설'}</button>` : ''}</div>`;
  }).join('');
  return { title: `건설 (거점 Lv${P.buildings.capital} · 대기열 ${P.buildQueue.length}/2)`, body: `<p class="muted">모든 건물은 거점 레벨을 넘을 수 없습니다. 저장 상한 ${fmt(storageCap())}, 부대 인원 ${armyCap()}, 동시 출전 ${maxArmies()}.</p>${rows}` };
}

function panelSoldiers() {
  const P = G.player; const home = P.soldiers.filter(s => !s.army), out = P.soldiers.filter(s => s.army);
  const recruitRows = UNIT_ORDER.map(id => { const t = UNITS[id]; const ok = unitAvailable(id); const c = recruitCost(id); const k = usageCoeff(id);
    return `<div class="row small ${ok ? '' : 'dim'}"><div class="grow"><b style="color:${CLASS_INFO[t.cls].color}">${t.name}</b> <span class="muted">${CLASS_INFO[t.cls].name} · HP ${t.hp[0]} 공 ${t.atk[0]} 이동 ${t.move} 사거리 ${t.range} 식량 ${t.food}/h${t.rage ? ' 분노 ' + t.rage : ' 분노 없음'}</span><div class="cost">${costStr(c)} · ${durStr(recruitTime(id))}${k > 1 ? ` · <span class="neg">비용 계수 ×${k.toFixed(2)}</span>` : ''}</div></div>
      ${ok ? `<button data-a="recruit" data-id="${id}" class="${canAfford(c) ? 'primary' : ''}">모집</button>` : `<span class="tag">${t.cls === 'cav' ? '마구간' : t.cls === 'siege' ? '공장' : '군영'} Lv${t.unlock}</span>`}</div>`; }).join('');
  const sRow = (s) => { const t = UNITS[s.type]; const tq = P.trainQueue.find(q => q.sid === s.id);
    return `<div class="row small"><div class="grow"><b style="color:${CLASS_INFO[t.cls].color}">${t.name}</b> Lv${s.lv} ${s.hero ? `<span class="tag hero">${HEROES[s.hero.heroId].name} ${GRADES[s.hero.grade]}</span>` : ''} ${s.weapon ? `<span class="tag">${s.weapon.name}</span>` : ''}${s.armor ? `<span class="tag">${s.armor.name}</span>` : ''}${s.special ? `<span class="tag">전용</span>` : ''}
      <div class="muted">HP ${t.hp[s.lv - 1] + (s.hero ? s.hero.hp : 0) + (s.weapon && s.weapon.hp || 0) + (s.armor && s.armor.hp || 0) + (s.special && s.special.hp || 0)} · 공격 ${t.atk[s.lv - 1] + (s.hero ? s.hero.atk : 0) + (s.weapon && s.weapon.atk || 0) + (s.armor && s.armor.atk || 0) + (s.special && s.special.atk || 0)}${tq ? ` · 훈련 중 ${durStr(tq.remain)}` : ''}${s.army ? ' · 출전 중' : ''}</div></div>
      <button data-a="soldier" data-id="${s.id}">관리</button></div>`; };
  return { title: `병사 (${P.soldiers.length}명 · 최대 Lv${maxSoldierLv()})`, body: `
    <h3>대기 중 (${home.length})</h3>${home.map(sRow).join('') || '<p class="muted">없음</p>'}
    ${out.length ? `<h3>출전 중 (${out.length})</h3>${out.map(sRow).join('')}` : ''}
    ${P.hospital.length ? `<h3>병원 (${P.hospital.length})</h3>${P.hospital.map(h => `<div class="row small"><div class="grow">${soldierName(h.soldier)} <span class="muted">퇴원까지 ${durStr(h.remain)}</span></div></div>`).join('')}` : ''}
    <h3>모집 (대기열 ${P.recruitQueue.length}/5)</h3><p class="muted">같은 병종을 많이 쓸수록 비용 계수가 올라갑니다(동적 비용). 식량 유지비는 매시간 차감됩니다.</p>${recruitRows}` };
}

function panelSoldier({ id }) {
  const s = soldierById(id); if (!s) return { title: '병사', body: '<p>없는 병사</p>' };
  const t = UNITS[s.type]; const P = G.player;
  const heroes = HERO_ORDER.filter(h => HEROES[h].unit === s.type);
  const heroOpts = heroes.map(h => { const st = P.heroes[h]; const used = P.soldiers.find(x => x !== s && x.hero && x.hero.heroId === h); return `<button data-a="hero" data-id="${id}" data-h="${h}" ${st ? '' : 'disabled'} class="${s.hero && s.hero.heroId === h ? 'on' : ''}">${HEROES[h].name}${st ? ' ' + GRADES[st.grade] : ' (미보유)'}${used ? ' · 다른 병사' : ''}</button>`; }).join('');
  const items = P.items.filter(it => it.slot !== 'special' || it.special === s.type);
  const itemRows = items.map(it => `<div class="row small"><div class="grow"><b>${it.name}</b> <span class="muted">${it.slot === 'special' ? it.desc : itemDesc(it)}</span></div><button data-a="equip" data-id="${id}" data-u="${it.uid}">장착</button></div>`).join('');
  const slot = (k, label) => s[k] ? `<div class="row small"><div class="grow"><b>${label}: ${s[k].name}</b><div class="muted">${s[k].slot === 'special' ? s[k].desc : itemDesc(s[k])}</div></div><button data-a="unequip" data-id="${id}" data-k="${k}">해제</button></div>` : `<div class="row small muted">${label}: 없음</div>`;
  const tc = trainCost(s);
  return { title: `${t.name} Lv${s.lv}`, body: `
    <p class="muted">${t.desc}${t.est ? ' <i>(추정 수치)</i>' : ''}</p>
    <div class="stats"><span>HP ${t.hp[s.lv - 1]}</span><span>공격 ${t.atk[s.lv - 1]}</span><span>이동 ${t.move}</span><span>사거리 ${t.range}</span><span>식량 ${t.food}/h</span><span>${t.rage ? '분노 ' + t.rage : '분노 없음'}</span></div>
    <h3>훈련</h3><div class="row small"><div class="grow muted">${s.lv >= maxSoldierLv() ? '군영 레벨을 올려야 더 훈련할 수 있습니다.' : `Lv${s.lv + 1}: ${costStr(tc)} · ${durStr(trainTime(s))}`}</div>${t.cls !== 'siege' ? `<button data-a="train" data-id="${id}" class="primary">훈련</button>` : ''}</div>
    <h3>영웅 공봉</h3><div class="btns">${heroOpts || '<span class="muted">이 병종의 영웅 데이터 없음</span>'}${s.hero ? `<button data-a="hero" data-id="${id}" data-h="">해제</button>` : ''}</div>
    ${s.hero ? `<p class="muted">${HEROES[s.hero.heroId].desc} <b>효과 수치 ${s.hero.v1}</b> · HP +${s.hero.hp} 공격 +${s.hero.atk}${s.hero.talent ? ' · 재능: ' + talentName(s.hero.talent) : ''}</p>` : ''}
    <h3>장비</h3>${slot('weapon', '무기')}${slot('armor', '방어구')}${slot('special', '전용')}
    ${itemRows ? `<h4>보유 장비</h4>${itemRows}` : ''}
    <h3>기타</h3><div class="btns"><button data-a="dismiss" data-id="${id}" class="danger">해산</button><button data-a="back" data-p="soldiers">← 병사 목록</button></div>` };
}
function talentName(id) { for (const k in TALENTS) { const t = TALENTS[k].find(x => x.id === id); if (t) return `${t.name}(${t.desc})`; } return id; }

function panelArmy({ target }) {
  const P = G.player; const t = target ? tileAt(target[0], target[1]) : null;
  const avail = P.soldiers.filter(s => !s.army && !P.trainQueue.find(q => q.sid === s.id));
  for (const id of [...UI.armyPick]) if (!avail.find(s => s.id === id)) UI.armyPick.delete(id);
  const pickRows = avail.map(s => { const u = UNITS[s.type]; const on = UI.armyPick.has(s.id);
    return `<label class="row small pick ${on ? 'on' : ''}"><input type="checkbox" id="pk${s.id}" data-a="pick" data-id="${s.id}" ${on ? 'checked' : ''}><span class="grow"><b style="color:${CLASS_INFO[u.cls].color}">${u.name}</b> Lv${s.lv}${s.hero ? ' · ' + HEROES[s.hero.heroId].name : ''}${s.weapon ? ' · ' + s.weapon.name : ''}</span><span class="muted">HP ${u.hp[s.lv - 1] + (s.hero ? s.hero.hp : 0)}</span></label>`; }).join('');
  const ids = [...UI.armyPick]; const def = t ? tileDefenders(t) : null;
  let eta = ''; if (t) { const [ox, oy] = originFor(t.x, t.y); const d = Math.max(Math.abs(t.x - ox), Math.abs(t.y - oy)) || 1; eta = `출발 (${ox},${oy}) → 거리 ${d}칸 · 속도 ${Math.round(armySpeed(ids))}칸/h · 약 ${durStr(d / armySpeed(ids) * 60)}`; }
  const err = t ? canTarget(t) : '목표 타일을 지도에서 선택하세요.';
  const defList = def ? def.specs.map(sp => sp.monsterId ? `${MONSTERS[sp.monsterId].name}(HP ${Math.round(MONSTERS[sp.monsterId].hp * sp.scale)})` : sp.isBuilding ? sp.name : `${UNITS[sp.typeId].name} Lv${sp.lv}`).join(', ') : '';
  return { title: '부대 편성 · 출전', body: `
    ${t ? `<div class="card"><b>목표 (${t.x},${t.y})</b> ${tileLabel(t)}<div class="muted">수비: ${def.label}${defList ? ' — ' + defList : ''}</div><div class="muted">${eta}</div>${err ? `<div class="neg">${err}</div>` : ''}</div>` : `<p class="muted">${err}</p>`}
    <div class="row small"><span class="grow">선택 ${ids.length}/${armyCap()}명 · 출전 부대 ${G.armies.filter(a => a.owner === 'P').length}/${maxArmies()}</span><button data-a="pickall">전체</button><button data-a="pickclear">해제</button></div>
    ${pickRows || '<p class="muted">출전 가능한 병사가 없습니다.</p>'}
    <label class="row small"><input type="checkbox" id="stayChk" data-a="stay" ${UI.armyStay ? 'checked' : ''}><span class="grow">도착 후 그 자리 대기 (주둔 — 왕복 시간 절약, 해당 타일 수비)</span></label>
    <div class="btns"><button data-a="predict" ${t && ids.length && !err ? '' : 'disabled'}>전투 예측</button><button data-a="send" class="primary" ${t && ids.length && !err ? '' : 'disabled'}>출전</button></div>
    <div id="predict"></div>` };
}
function tileLabel(t) { const names = { plain: '평야(식량)', forest: '숲(목재)', hill: '구릉(석재)', capital: '거점', ruin: '유적' }; return `${names[t.type]} Lv${t.lv}${t.ruin ? ' · 유적 Lv' + t.ruin : ''}${t.giantRef ? ' · 거대 야수 영역' : ''}${t.fort ? ' · 요새' : ''}`; }

function panelHeroes() {
  const P = G.player; const hall = P.buildings.hall || 0;
  const byCls = {}; for (const h of HERO_ORDER) { const c = UNITS[HEROES[h].unit].cls; (byCls[c] = byCls[c] || []).push(h); }
  const sec = Object.keys(byCls).map(c => `<h3 style="color:${CLASS_INFO[c].color}">${CLASS_INFO[c].name}</h3>` + byCls[c].map(h => { const H = HEROES[h], st = P.heroes[h]; const fr = P.frags[H.unit] || 0;
    return `<div class="row small"><div class="grow"><b>${H.name}</b> <span class="muted">${UNITS[H.unit].name}</span> ${st ? `<span class="tag hero">${GRADES[st.grade]}</span> <span class="muted">HP+${st.hp} 공+${st.atk} 수치 ${st.v1}${st.talent ? ' · ' + talentName(st.talent) : ''} · 천장 ${st.fails}/${GRADE_PITY[st.grade] || '-'}</span>` : `<span class="tag">미보유</span>`}<div class="muted">${H.desc}${H.est ? ' <i>(추정)</i>' : ''}</div></div>
      ${st ? (st.grade < 8 ? `<button data-a="reroll" data-h="${h}" ${fr >= REROLL_COST ? 'class="primary"' : ''}>재그리기<br><small>잔편 ${REROLL_COST} (${fr})</small></button>` : '<span class="tag hero">운명</span>') : `<button data-a="unlock" data-h="${h}" ${hall && fr >= 30 ? 'class="primary"' : ''}>해제<br><small>잔편 30 (${fr})</small></button>`}</div>`; }).join('')).join('');
  const probs = Object.keys(GRADE_TABLE).map(k => `<tr><td>${GRADES[k]}</td><td>${GRADE_TABLE[k].map(([g, p]) => `${GRADES[g]} ${p}%`).join(', ')}</td><td>${GRADE_PITY[k]}회</td></tr>`).join('');
  return { title: `영웅 초상화 (영웅전당 Lv${hall})`, body: `
    <p class="muted">영웅은 별도 캐릭터가 아니라 병사의 행동 규칙을 바꾸는 초상화입니다. 같은 병종의 잔편으로 해제·재그리기하며, 재그리기하면 재능도 다시 굴려집니다. ${hall ? '' : '<b class="neg">영웅전당(거점 Lv8)이 필요합니다.</b>'}</p>
    <details><summary>잔편 보유</summary><div class="muted">${Object.keys(P.frags).filter(k => P.frags[k] > 0).map(k => `${UNITS[k].name} ${P.frags[k]}`).join(' · ') || '없음'}</div></details>
    <details><summary>등급 확률표 · 천장</summary><div class="tbl"><table><tr><th>현재</th><th>상위 등급 출현 확률</th><th>천장</th></tr>${probs}</table></div><p class="muted">표의 행은 합계가 100%가 아닙니다. 나머지는 등급 유지(재능만 변경)입니다.</p></details>
    ${sec}` };
}

function panelEquip() {
  const P = G.player; const sm = P.buildings.smithy || 0;
  const pool = P.equipPool.map(id => { const e = EQUIPMENT[id]; const c = craftCost(id); const ok = sm >= e.lv;
    return `<div class="row small ${ok ? '' : 'dim'}"><div class="grow"><b>${e.name}</b> <span class="tag">${e.slot === 'weapon' ? '무기' : '방어구'} · 대장간 Lv${e.lv}</span><div class="muted">${e.desc.replace('{v}', e.v ? e.v[0] + '~' + e.v[1] : '')}${e.hp ? ` · HP ${e.hp[0]}~${e.hp[1]}` : ''}${e.atk ? ` · 공격 ${e.atk[0]}~${e.atk[1]}` : ''}</div><div class="cost">${costStr(c)} · ${durStr(4 + e.lv)}</div></div>${ok ? `<button data-a="craft" data-id="${id}" class="${canAfford(c) ? 'primary' : ''}">제작</button>` : ''}</div>`; }).join('');
  const inv = P.items.map(it => `<div class="row small"><div class="grow"><b>${it.name}</b><div class="muted">${it.slot === 'special' ? it.desc : itemDesc(it)}</div></div><button data-a="sell" data-u="${it.uid}">분해</button></div>`).join('');
  const sp = UNIT_ORDER.filter(u => SPECIAL_EQUIP[u]).map(u => `<div class="row small"><div class="grow"><b>${SPECIAL_EQUIP[u].name}</b><div class="muted">${SPECIAL_EQUIP[u].desc} · 목재 600 석재 600</div></div><button data-a="special" data-id="${u}" ${sm >= 10 ? '' : 'disabled'}>제작</button></div>`).join('');
  return { title: `장비 (대장간 Lv${sm})`, body: `
    <p class="muted">이번 대전의 장비 효과 풀 8종. 제작할 때마다 수치가 무작위로 결정됩니다(재제작 = 재추첨). 전용 장비는 대장간 10/18에서 하나씩.</p>
    <h3>제작 (대기열 ${P.craftQueue.length}/3)</h3>${pool}
    <h3>전용 장비</h3>${sp}<p class="muted">그 외 병종의 전용 장비는 공개 데이터가 없어 제공하지 않습니다.</p>
    <h3>보유 장비 (${P.items.length})</h3>${inv || '<p class="muted">없음. 병사 관리 화면에서 장착할 수 있습니다.</p>'}` };
}

function panelAlliance() {
  const P = G.player; const emb = P.buildings.embassy || 0;
  const pol = Object.keys(POLICIES).map(k => `<button data-a="policy" data-id="${k}" class="${P.policy === k ? 'on' : ''}" ${emb >= 3 || k === 'none' ? '' : 'disabled'}>${POLICIES[k].name}<br><small>${POLICIES[k].desc}</small></button>`).join('');
  const ranks = Object.values(G.factions).map(f => ({ f, score: scoreOf(f.id), ruins: G.map.filter(t => t.owner === f.id && t.ruin).map(t => t.ruin) })).sort((a, b) => b.score - a.score);
  const rows = ranks.map((r, i) => `<div class="row small"><span class="dot" style="background:${r.f.color}"></span><div class="grow"><b>${i + 1}. ${r.f.name}</b> ${r.f.alive ? '' : '<span class="tag">탈락</span>'}<div class="muted">영토 ${r.f.tiles}칸 · 유적 ${r.ruins.length ? r.ruins.map(x => 'Lv' + x).join(', ') : '없음'} · 세력 점수 ${r.score}</div></div></div>`).join('');
  return { title: '연맹 · 세력', body: `
    <h3>승리 조건</h3><ul class="muted"><li>유적 Lv20을 먼저 완성하거나, Lv12 이상 유적 3개 확보</li><li>최후 혈전: 다른 연맹 맹주들의 거점을 모두 함락 (함락 시 그 세력의 영지가 넘어옴)</li><li>겨울(4일차)이 끝나면 세력 점수(영토 + 유적 Lv×3)로 결산</li><li>적 거점 공격은 매일 20:00~24:00에만 가능. 탈락한 세력은 시간 제한 없음</li></ul>
    <h3>세력 순위</h3>${rows}
    <h3>연맹 정책 (대사관 Lv${emb}${emb < 3 ? ' — Lv3 필요' : ''})</h3><div class="btns col">${pol}</div>` };
}

function panelCodex() {
  const tab = UI.codexTab;
  const tabs = [['units', '병종'], ['monsters', '몬스터'], ['equip', '장비'], ['rules', '규칙']].map(([k, n]) => `<button data-a="ctab" data-id="${k}" class="${tab === k ? 'on' : ''}">${n}</button>`).join('');
  let body = '';
  if (tab === 'units') body = Object.keys(CLASS_INFO).map(c => `<h3 style="color:${CLASS_INFO[c].color}">${CLASS_INFO[c].name} · 행군 ${CLASS_INFO[c].speed}칸/시간</h3>` + UNIT_ORDER.filter(u => UNITS[u].cls === c).map(u => { const t = UNITS[u]; return `<div class="row small"><div class="grow"><b>${t.name}</b> <span class="muted">HP ${t.hp[0]}→${t.hp[5]} · 공격 ${t.atk[0]}→${t.atk[5]} · 이동 ${t.move} · 사거리 ${t.range} · 식량 ${t.food} · ${t.rage ? '분노 ' + t.rage : '분노 없음'}${t.est ? ' · <i>추정</i>' : ''}</span><div class="muted">${t.desc}</div><div class="muted">영웅: ${HERO_ORDER.filter(h => HEROES[h].unit === u).map(h => HEROES[h].name).join(', ') || '-'}</div></div></div>`; }).join('')).join('');
  if (tab === 'monsters') body = [['beast', '일반 야수'], ['giant', '거대 야수 (Lv3 자원지, 9칸 차지, 이동 불가, 랜덤 장비)'], ['bandit', '산적 (Lv4 이상, 양유기 소환 불가)']].map(([k, n]) => `<h3>${n}</h3>` + Object.keys(MONSTERS).filter(m => MONSTERS[m].kind === k).map(m => { const M = MONSTERS[m]; return `<div class="row small"><div class="grow"><b>${M.name}</b> <span class="muted">HP ${M.hp} · 공격 ${M.atk} · 이동 ${M.move} · 사거리 ${M.range}</span><div class="muted">${M.desc}</div></div></div>`; }).join('')).join('');
  if (tab === 'equip') body = EQUIP_ORDER.map(id => { const e = EQUIPMENT[id]; return `<div class="row small"><div class="grow"><b>${e.name}</b> <span class="tag">대장간 Lv${e.lv}</span><div class="muted">${e.desc.replace('{v}', e.v ? e.v[0] + '~' + e.v[1] : '')}</div></div></div>`; }).join('');
  if (tab === 'rules') body = `<div class="muted rules">
    <p><b>핵심 루프</b>: 땅 → 자원 → 건설 → 병사 → 장비 → 영웅 → 전쟁 → 더 좋은 땅.</p>
    <p><b>영토</b>: 자기 영토와 인접한 타일만 점령할 수 있습니다(요새 3칸 이내 포함). 거점에서 멀수록 몬스터가 강합니다. 점령한 땅은 1시간 보호됩니다.</p>
    <p><b>식량</b>: 생산량에서 모든 병사의 유지비를 뺀 순생산량만 들어옵니다. 식량이 바닥나면 병사가 탈영합니다.</p>
    <p><b>전투</b>: 턴제 자동. 병사는 공격하거나 맞으면 분노 +1, 최대 분노에 도달하면 다음 공격이 액티브 스킬이 됩니다. 병기·맥도·도끼기병은 분노가 없습니다. 30턴을 넘기면 공격 측이 철수합니다.</p>
    <p><b>배치</b>: 근접(사거리 1)은 앞줄, 사거리 2는 중간, 원거리·병기는 뒷줄에 자동 배치됩니다.</p>
    <p><b>영웅</b>: 초상화를 같은 병종의 병사에게 공봉하면 그 병사의 스킬이 영웅 재능으로 바뀝니다. 등급은 7급→…→1급→운명. 재그리기는 확률표와 천장을 따릅니다.</p>
    <p><b>장비</b>: 대전마다 일반 장비 효과 8종이 무작위로 정해지고, 제작 시 수치가 랜덤입니다. 전용 장비는 대장간 10/18.</p>
    <p><b>병원</b>: 병원이 있으면 전사한 병사가 30%+레벨×5% 확률로 입원해 30분 뒤 복귀합니다.</p>
    <p><b>계절</b>: 봄 → 여름(식량 +30%) → 가을(목재·석재 +30%, 몬스터 강화) → 겨울(식량 -50%, 몬스터 +50%) → 결산.</p>
    <p><b>시간</b>: 1배속에서 현실 1초 = 게임 1분. 창·방패·궁병 62칸/시간, 기병 74, 병기 46.</p></div>`;
  return { title: '도감', body: `<div class="btns">${tabs}</div>${body}` };
}

function panelMenu() {
  const st = G.stats;
  return { title: '메뉴', body: `
    <div class="btns col">
      <button data-a="save" class="primary">저장 (브라우저)</button>
      <button data-a="export">저장 코드 내보내기</button>
      <textarea id="ioBox" rows="3" placeholder="저장 코드를 붙여넣고 불러오기"></textarea>
      <button data-a="import">저장 코드 불러오기</button>
      <label class="row small"><input type="checkbox" id="autoBattleChk" data-a="autobattle" ${UI.autoBattle ? 'checked' : ''}><span class="grow">전투 화면 자동 건너뛰기 (결과만 알림)</span></label>
      <button data-a="log">사건 기록</button>
      <button data-a="newgame" class="danger">새 게임 (현재 진행 삭제)</button>
    </div>
    <p class="muted">전투 ${st.battles}회 · 승리 ${st.wins} · 패배 ${st.lost} · 전사 ${st.kills}</p>
    <p class="muted">이 게임은 《9만 에이커》의 공개된 규칙·수치를 바탕으로 핵심 재미(영토 확장 + 턴제 오토배틀 + 영웅 모디파이어 + 시즌 경쟁)를 웹에서 재구성한 팬 메이드 구현입니다. 문서에 수치가 없던 병종·영웅은 추정치로 표시했습니다.</p>` };
}
function panelLog() { return { title: '사건 기록', body: G.log.map(l => `<div class="row small ${l.kind}"><span class="muted">${timeStr(l.t)}</span><span class="grow">${esc(l.text)}</span></div>`).join('') || '<p class="muted">없음</p>' }; }

/* 패널 액션 */
function onPanelClick(e) {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a, id = el.dataset.id; let msg = null;
  switch (a) {
    case 'build': msg = build(id); break;
    case 'recruit': msg = recruit(id); break;
    case 'soldier': openPanel('soldier', { id: +id }); return;
    case 'back': openPanel(el.dataset.p); return;
    case 'train': msg = train(soldierById(+id)); break;
    case 'hero': msg = assignHero(soldierById(+id), el.dataset.h || null); break;
    case 'equip': { const it = G.player.items.find(x => x.uid === el.dataset.u); if (it) msg = equip(soldierById(+id), it); break; }
    case 'unequip': unequip(soldierById(+id), el.dataset.k); break;
    case 'dismiss': msg = dismiss(soldierById(+id)); if (!msg) { openPanel('soldiers'); return; } break;
    case 'pick': { const sid = +id; if (el.checked) { if (UI.armyPick.size >= armyCap()) { el.checked = false; notice(`부대 최대 ${armyCap()}명`); return; } UI.armyPick.add(sid); } else UI.armyPick.delete(sid); break; }
    case 'pickall': { for (const s of G.player.soldiers) if (!s.army && UI.armyPick.size < armyCap()) UI.armyPick.add(s.id); break; }
    case 'pickclear': UI.armyPick.clear(); break;
    case 'stay': UI.armyStay = el.checked; return;
    case 'send': { const t = UI.args.target; msg = sendArmy([...UI.armyPick], t[0], t[1], UI.armyStay); if (!msg) { UI.armyPick.clear(); closePanel(); notice('부대가 출발했습니다.', 'good'); } break; }
    case 'predict': { const t = tileAt(...UI.args.target); const def = tileDefenders(t); let w = 0, rounds = 0; const atk = [...UI.armyPick].map(i => soldierSpec(soldierById(i))); for (let i = 0; i < 20; i++) { const r = quickBattle(atk, def.specs, { policy: G.player.policy, capitalLv: G.player.buildings.capital }); if (r.winner === 'A') w++; rounds += r.rounds; } $('#predict').innerHTML = `<div class="card">예측 승률 <b>${w * 5}%</b> (20회 모의전투, 평균 ${(rounds / 20).toFixed(1)}턴) <span class="muted">— 장비·영웅 확률 판정이 포함된 추정치</span></div>`; return; }
    case 'unlock': msg = unlockHero(el.dataset.h); break;
    case 'reroll': msg = rerollHero(el.dataset.h); if (msg) { notice(msg, 'info'); msg = null; } break;
    case 'craft': msg = craft(id); break;
    case 'special': msg = craftSpecial(id); break;
    case 'sell': { const it = G.player.items.find(x => x.uid === el.dataset.u); if (it) { G.player.items = G.player.items.filter(x => x !== it); G.player.res.wood += 40; G.player.res.stone += 40; } break; }
    case 'policy': G.player.policy = id; break;
    case 'ctab': UI.codexTab = id; break;
    case 'save': notice(saveGame() ? '저장했습니다.' : '이 브라우저에서는 저장할 수 없습니다.', 'good'); return;
    case 'export': { const box = $('#ioBox'); box.value = exportSave(); box.select(); try { navigator.clipboard.writeText(box.value).then(() => notice('클립보드에 복사했습니다.', 'good')).catch(() => notice('텍스트를 직접 복사하세요.', 'info')); } catch (err) { notice('텍스트를 직접 복사하세요.', 'info'); } return; }
    case 'import': { if (importSave($('#ioBox').value)) { notice('불러왔습니다.', 'good'); closePanel(); } else notice('잘못된 저장 코드입니다.'); return; }
    case 'autobattle': UI.autoBattle = el.checked; return;
    case 'log': openPanel('log'); return;
    case 'newgame': if (el.dataset.confirm) { clearSave(); newGame(); closePanel(); cam.x = G.factions.P.cap[0]; cam.y = G.factions.P.cap[1]; notice('새 게임을 시작합니다.', 'good'); } else { el.dataset.confirm = '1'; el.textContent = '정말 삭제하고 새로 시작 (한 번 더 클릭)'; } return;
  }
  if (msg) notice(msg);
  renderPanel(); renderTop();
}

/* ── 타일 팝업 ─────────────────────────────────────────── */
function selectTile(x, y) {
  const t = tileAt(x, y); if (!t) { UI.selected = null; $('#tilepop').hidden = true; return; }
  UI.selected = [x, y]; renderTilePop();
}
function renderTilePop() {
  if (!UI.selected) return; const t = tileAt(...UI.selected); const pop = $('#tilepop'); pop.hidden = false;
  const def = tileDefenders(t); const owner = t.owner ? G.factions[t.owner].name : '무소속';
  const prod = t.type === 'capital' ? '' : t.type === 'ruin' ? `생산 식량·목재·석재 각 ${Math.round(tileProduction(t.lv) * 0.4)}/h` : `생산 ${RES_NAME[{ plain: 'food', forest: 'wood', hill: 'stone' }[t.type]]} ${tileProduction(t.lv)}/h`;
  const mons = def.specs.filter(s => s.monsterId).map(s => { const M = MONSTERS[s.monsterId]; return `<div class="mon"><b>${M.name}</b> HP ${Math.round(M.hp * s.scale)} 공 ${Math.round(M.atk * Math.pow(s.scale, 0.8))} <span class="muted">${M.desc}</span></div>`; }).join('');
  const garrison = t.owner && t.owner !== 'P' ? `<div class="muted">예상 수비 병력 약 ${def.specs.length}기 (${G.factions[t.owner].name} 세력 ${G.factions[t.owner].power.toFixed(1)})</div>` : '';
  const st = G.armies.find(a => a.owner === 'P' && a.state === 'wait' && a.x === t.x && a.y === t.y);
  const err = canTarget(t);
  let actions = '';
  if (t.owner === 'P') {
    if (t.type === 'capital') actions += `<div class="muted">거점 수비: 대기 중인 모든 병사 (${G.player.soldiers.filter(s => !s.army).length}명)</div>`;
    if (!st && t.type !== 'capital') actions += `<button data-t="army">부대 주둔</button>`;
    if (st) actions += `<div class="muted">주둔 부대 ${st.units.length}명</div><button data-t="recall">회군</button>`;
    if (t.ruin) actions += `<button data-t="ruin" class="primary">유적 Lv${t.ruin} → ${t.ruin + 1} 업그레이드</button>`;
    if (!t.fort && ['plain', 'forest', 'hill'].includes(t.type)) actions += `<button data-t="fort">요새 건설 (목재 500 석재 700)</button>`;
  } else {
    actions += `<button data-t="army" class="primary" ${err ? 'disabled' : ''}>${t.owner ? '공격' : '점령'} 부대 편성</button>${err ? `<div class="neg">${err}</div>` : ''}`;
  }
  pop.innerHTML = `<div class="tp-head"><b>(${t.x},${t.y}) ${tileLabel(t)}</b><button class="close" data-t="close">×</button></div>
    <div class="muted">소유: <span style="color:${t.owner ? G.factions[t.owner].color : '#ccc'}">${owner}</span>${t.protect > G.time ? ` · 보호 ${durStr(t.protect - G.time)}` : ''} ${prod ? '· ' + prod : ''}</div>
    ${mons ? `<div class="mons">${mons}</div>` : ''}${garrison}<div class="btns">${actions}</div>`;
}
function onTilePopClick(e) {
  const el = e.target.closest('[data-t]'); if (!el) return; const t = tileAt(...UI.selected); let msg = null;
  switch (el.dataset.t) {
    case 'close': UI.selected = null; $('#tilepop').hidden = true; return;
    case 'army': openPanel('army', { target: [t.x, t.y] }); return;
    case 'recall': { const st = G.armies.find(a => a.owner === 'P' && a.state === 'wait' && a.x === t.x && a.y === t.y); if (st) recallArmy(st); break; }
    case 'ruin': msg = upgradeRuin(t); break;
    case 'fort': msg = buildFort(t); break;
  }
  if (msg) notice(msg); renderTilePop(); renderTop();
}

/* ── 전투 화면 ─────────────────────────────────────────── */
function onBattleLog(e) { const box = $('#blog'); if (!box) return; const d = document.createElement('div'); d.className = e.kind || ''; d.textContent = e.text; box.appendChild(d); box.scrollTop = box.scrollHeight; }
function showNextBattle() {
  if (UI.battleOpen || !G.pendingBattles.length) return;
  const b = G.pendingBattles.shift();
  if (UI.autoBattle) return;
  UI.battleOpen = true; const m = $('#battle'); m.hidden = false;
  $('#btitle').textContent = `${b.defense ? '수비전' : '공격'} (${b.tile[0]},${b.tile[1]}) — ${b.label}`;
  $('#blog').innerHTML = ''; $('#bresult').textContent = '';
  const cv = $('#bcanvas'); const avail = $('#bwrap').clientWidth - 4; const cell = Math.max(40, Math.min(52, Math.floor(avail / BW))); cv.width = cell * BW; cv.height = cell * BH; cv.style.width = cv.width + 'px';
  const won = b.defense ? b.res.winner !== 'A' : b.res.winner === 'A';
  startReplay(cv, b.res.events, () => { $('#bresult').innerHTML = `<b class="${won ? 'good' : 'bad'}">${won ? '승리' : b.res.winner === 'draw' ? '무승부 (철수)' : '패배'}</b> · ${b.res.rounds}턴`; });
}
function closeBattle() { if (BR.timer) clearTimeout(BR.timer); BR.done = true; UI.battleOpen = false; $('#battle').hidden = true; }

/* ── 게임 오버 ─────────────────────────────────────────── */
function renderOver() {
  const o = G.over; const el = $('#over'); if (!o) { el.hidden = true; return; } if (!el.hidden) return; el.hidden = false;
  $('#overBody').innerHTML = `<h2 class="${o.result === 'win' ? 'good' : 'bad'}">${o.result === 'win' ? '승리' : '패배'}</h2><p>${esc(o.reason)}</p><ol>${o.ranks.map(r => `<li><span style="color:${G.factions[r.id].color}">${r.name}</span> — ${r.score}점</li>`).join('')}</ol><p class="muted">${timeStr(o.time)} · 전투 ${G.stats.battles}회</p>`;
}

/* ── 입력 ──────────────────────────────────────────────── */
function setupInput() {
  const cv = mapCanvas;
  const down = (x, y) => { cam.dragging = true; cam.lx = x; cam.ly = y; cam.moved = 0; };
  const move = (x, y) => { if (!cam.dragging) return; const ts = tileSize(); cam.x -= (x - cam.lx) / ts; cam.y -= (y - cam.ly) / ts; cam.moved += Math.abs(x - cam.lx) + Math.abs(y - cam.ly); cam.lx = x; cam.ly = y; cam.x = clamp(cam.x, 0, G.N); cam.y = clamp(cam.y, 0, G.N); };
  const up = (x, y) => { if (!cam.dragging) return; cam.dragging = false; if (cam.moved < 6) { const [wx, wy] = screenToWorld(x, y); selectTile(wx, wy); } };
  cv.addEventListener('mousedown', e => down(e.offsetX, e.offsetY));
  cv.addEventListener('mousemove', e => move(e.offsetX, e.offsetY));
  window.addEventListener('mouseup', e => { const r = cv.getBoundingClientRect(); up(e.clientX - r.left, e.clientY - r.top); });
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.zoom = clamp(cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.5, 3.5); }, { passive: false });
  let pinch = null;
  cv.addEventListener('touchstart', e => { if (e.touches.length === 1) { const r = cv.getBoundingClientRect(); down(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top); } else if (e.touches.length === 2) { cam.dragging = false; pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } }, { passive: true });
  cv.addEventListener('touchmove', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); if (e.touches.length === 1) move(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top); else if (e.touches.length === 2 && pinch) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); cam.zoom = clamp(cam.zoom * d / pinch, 0.5, 3.5); pinch = d; } }, { passive: false });
  cv.addEventListener('touchend', e => { const r = cv.getBoundingClientRect(); if (e.changedTouches.length && e.touches.length === 0 && !pinch) up(e.changedTouches[0].clientX - r.left, e.changedTouches[0].clientY - r.top); if (e.touches.length < 2) pinch = null; });
  $('#home').addEventListener('click', () => { cam.x = G.factions.P.cap[0] + 0.5; cam.y = G.factions.P.cap[1] + 0.5; });
  $('#zin').addEventListener('click', () => cam.zoom = clamp(cam.zoom * 1.25, 0.5, 3.5));
  $('#zout').addEventListener('click', () => cam.zoom = clamp(cam.zoom / 1.25, 0.5, 3.5));
  document.querySelectorAll('#bottom button').forEach(b => b.addEventListener('click', () => { if (UI.panel === b.dataset.p) closePanel(); else openPanel(b.dataset.p, b.dataset.p === 'army' ? { target: UI.selected } : {}); }));
  $('#panel .close').addEventListener('click', closePanel);
  $('#panel').addEventListener('click', e => { if (e.target.id === 'panel') closePanel(); });
  $('#panelBody').addEventListener('click', onPanelClick);
  $('#tilepop').addEventListener('click', onTilePopClick);
  document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => { const s = +b.dataset.s; if (s === 0) G.paused = !G.paused; else { G.paused = false; G.speed = s; } renderTop(); }));
  $('#bclose').addEventListener('click', closeBattle);
  $('#bskip').addEventListener('click', () => skipReplay());
  $('#bfast').addEventListener('click', () => { BR.speed = BR.speed >= 4 ? 1 : BR.speed * 2; $('#bfast').textContent = '×' + BR.speed; });
  $('#overNew').addEventListener('click', () => { clearSave(); newGame(); $('#over').hidden = true; cam.x = G.factions.P.cap[0]; cam.y = G.factions.P.cap[1]; });
  $('#overCont').addEventListener('click', () => { G.over = null; G.paused = false; $('#over').hidden = true; });
  window.addEventListener('resize', resizeMap);
  window.addEventListener('beforeunload', () => { if (G) saveGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G) saveGame(); });
}
function resizeMap() { const w = $('#mapwrap'); mapCanvas.width = w.clientWidth; mapCanvas.height = w.clientHeight; }

/* ── 시작 화면 / 루프 ───────────────────────────────────── */
function startGame(load) {
  if (!(load && loadGame())) newGame();
  $('#title').hidden = true; $('#app').hidden = false;
  resizeMap(); cam.x = G.factions.P.cap[0] + 0.5; cam.y = G.factions.P.cap[1] + 0.5;
  renderTop(); loop();
}
let acc = 0, lastTick = Date.now(), lastSave = Date.now(), lastTop = 0;
function loop() {
  const now = Date.now(); const dt = Math.min(2, (now - lastTick) / 1000); lastTick = now;
  if (!G.paused && !G.over) { acc += dt * G.speed; const m = Math.floor(acc); if (m > 0) { acc -= m; tick(Math.min(m, 60)); } }
  drawMap(UI.selected);
  if (now - lastTop > 500) { lastTop = now; renderTop(); if (UI.panel) renderPanel(); if (UI.selected) renderTilePop(); renderToasts(); }
  if (G.pendingBattles.length && !UI.battleOpen) showNextBattle();
  if (G.over) renderOver();
  if (now - lastSave > 30000) { lastSave = now; saveGame(); }
  requestAnimationFrame(loop);
}
function init() {
  mapCanvas = $('#map'); mapCtx = mapCanvas.getContext('2d');
  let hasSave = false; try { hasSave = !!localStorage.getItem(SAVE_KEY); } catch (e) {}
  $('#btnContinue').hidden = !hasSave;
  $('#btnNew').addEventListener('click', () => startGame(false));
  $('#btnContinue').addEventListener('click', () => startGame(true));
  setupInput();
}
window.addEventListener('DOMContentLoaded', init);
