/* ============================================================
   전투 시뮬레이터 — 격자 턴제 오토배틀
   이동거리 / 사거리 / 타겟 선정 / 분노 / 스킬 / 상태이상 / 영웅 / 장비 / 확률 판정
   결과는 이벤트 목록으로 반환되어 렌더러가 재생한다.
   ============================================================ */
'use strict';

const BW = 14, BH = 8; // 전장 크기

const rnd = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() * 100 < p;
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function lerpRange(r, q) { return r[0] + (r[1] - r[0]) * q; }

/* 전투 유닛 생성 ─────────────────────────────────────────── */
function makeBattleUnit(side, spec) {
  // spec: { typeId?, monsterId?, lv, hero?, weapon?, armor?, special?, isBuilding?, name? }
  const u = {
    uid: spec.uid || ('u' + Math.random().toString(36).slice(2, 8)),
    side, x: 0, y: 0, alive: true,
    typeId: spec.typeId || null, monsterId: spec.monsterId || null,
    lv: spec.lv || 1, hero: spec.hero || null, heroId: spec.hero ? spec.hero.heroId : null,
    weapon: spec.weapon || null, armor: spec.armor || null, special: spec.special || null,
    isBuilding: !!spec.isBuilding, isMonster: !!spec.monsterId, isGiant: false,
    soldierId: spec.soldierId || null,
    rage: 0, rageMax: null, statuses: {}, flags: {}, kills: 0, dmgDealt: 0, dmgTaken: 0,
    dodge: 0, dmgBonus: 0, dmgReduce: 0, lifesteal: 0, shield: 0, extraRange: 0,
    turnsTaken: 0, size: 1,
  };
  if (spec.typeId) {
    const t = UNITS[spec.typeId];
    const li = Math.max(0, Math.min(5, u.lv - 1));
    u.name = spec.name || t.name; u.cls = t.cls;
    u.maxHp = t.hp[li]; u.atk = t.atk[li]; u.move = t.move; u.range = t.range;
    u.rageMax = t.rage; u.skill = t.skill; u.passive = t.passive || null;
    if (u.hero) { u.maxHp += u.hero.hp; u.atk += u.hero.atk; }
    for (const it of [u.weapon, u.armor, u.special]) {
      if (!it) continue;
      if (it.hp) u.maxHp += it.hp;
      if (it.atk) u.atk += it.atk;
    }
    // 재능
    if (u.hero && u.hero.talent) {
      const tl = u.hero.talent;
      if (tl === 'hp5') u.maxHp = Math.round(u.maxHp * 1.05);
      if (tl === 'hp10') u.maxHp = Math.round(u.maxHp * 1.10);
      if (tl === 'hp20') u.maxHp = Math.round(u.maxHp * 1.20);
      if (tl === 'atk5') u.atk = Math.round(u.atk * 1.05);
      if (tl === 'atk10') u.atk = Math.round(u.atk * 1.10);
      if (tl === 'atk20') u.atk = Math.round(u.atk * 1.20);
      if (tl === 'dodge3') u.dodge += 3;
      if (tl === 'rage1') u.rage = 2;
      if (tl === 'ls10') u.lifesteal += 10;
    }
    if (spec.hpMul) u.maxHp = Math.round(u.maxHp * spec.hpMul);
    if (spec.atkMul) u.atk = Math.round(u.atk * spec.atkMul);
  } else if (spec.monsterId) {
    const m = MONSTERS[spec.monsterId];
    const s = spec.scale || 1;
    u.name = m.name; u.cls = 'monster'; u.kind = m.kind;
    u.maxHp = Math.round(m.hp * s); u.atk = Math.round(m.atk * Math.pow(s, 0.8));
    u.move = m.move; u.range = m.range; u.rageMax = null; u.skill = null;
    u.isGiant = m.kind === 'giant'; if (u.isGiant) u.size = 3;
    if (spec.monsterId === 'cheetah') u.dodge = 30;
    if (spec.monsterId === 'lizard') u.dmgReduce = 40;
    if (spec.monsterId === 'b_assassin') u.dodge = 20;
    if (spec.giantItems) { u.weapon = spec.giantItems[0]; u.armor = spec.giantItems[1]; }
  } else if (spec.isBuilding) {
    u.name = spec.name || '건물'; u.cls = 'building';
    u.maxHp = spec.hp; u.atk = spec.atk || 0; u.move = 0; u.range = spec.range || 2; u.rageMax = null;
  }
  u.hp = u.maxHp;
  return u;
}

/* 전투 본체 ─────────────────────────────────────────────── */
class Battle {
  constructor(attackers, defenders, opts = {}) {
    this.A = attackers; this.D = defenders; this.opts = opts;
    this.events = []; this.round = 0; this.grid = {};
    this.units = [...attackers, ...defenders];
    this.units.forEach(u => this.initUnit(u));
    this.place();
  }
  log(text, kind) { this.events.push({ t: 'log', text, kind }); }
  ev(e) { this.events.push(e); }

  initUnit(u) {
    u.rageMax = u.rageMax; u.statuses = u.statuses || {};
    // 장비 패시브
    const w = u.weapon, a = u.armor;
    if (w && w.id === 'meteor') u.extraRange = 1;
    if (w && w.id === 'dragon_sword') u.dmgBonus += w.v;
    if (w && w.id === 'moon_blade') { u.dmgBonus += w.v; u.flags.moon = true; }
    if (a && a.id === 'heart_mirror') { u.maxHp = Math.round(u.maxHp * (1 + a.v / 100)); u.hp = u.maxHp; }
    if (u.heroId === 'zhaoyun') u.dodge += 10;
    if (u.heroId === 'lvmeng' && u.rageMax) u.rageMax = Math.max(1, Math.ceil(u.rageMax / 2));
    if (u.heroId === 'machao') u.move += 1;
    if (this.opts.policy === 'aura') u.shield += Math.round(u.maxHp * 0.08);
    if (this.opts.policy === 'rampart' && u.side === 'D' && this.opts.defenderIsPlayer) { u.maxHp = Math.round(u.maxHp * 1.2); u.hp = u.maxHp; }
  }

  place() {
    const order = (list) => {
      const front = list.filter(u => (u.range || 1) <= 1 && !u.isBuilding);
      const mid = list.filter(u => (u.range || 1) === 2 && !u.isBuilding);
      const back = list.filter(u => (u.range || 1) >= 3 || u.isBuilding);
      return { front, mid, back };
    };
    const put = (u, x, y) => { u.x = x; u.y = y; this.grid[x + ',' + y] = u; };
    const fill = (list, cols) => {
      let i = 0;
      const ys = [3, 4, 2, 5, 1, 6, 0, 7];
      for (const c of cols) for (const y of ys) { if (i >= list.length) return; if (!this.grid[c + ',' + y]) put(list[i++], c, y); }
      // 넘치면 아무 빈칸
      for (let c = 0; c < BW && i < list.length; c++) for (let y = 0; y < BH && i < list.length; y++) if (!this.grid[c + ',' + y]) put(list[i++], c, y);
    };
    const a = order(this.A), d = order(this.D);
    fill(a.front, [4, 3]); fill(a.mid, [2]); fill(a.back, [1, 0]);
    const giant = this.D.find(u => u.isGiant);
    if (giant) {
      put(giant, 11, 3);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) this.grid[(11 + dx) + ',' + (3 + dy)] = giant;
    }
    const dRest = this.D.filter(u => u !== giant);
    const dd = order(dRest);
    fill(dd.front, [9, 10]); fill(dd.mid, [11]); fill(dd.back, [12, 13]);
  }

  enemiesOf(u) { return this.units.filter(v => v.alive && v.side !== u.side); }
  alliesOf(u) { return this.units.filter(v => v.alive && v.side === u.side && v !== u); }
  dist(a, b) {
    if (b.isGiant) return Math.max(0, cheb(a, b) - 1);
    if (a.isGiant) return Math.max(0, cheb(a, b) - 1);
    return cheb(a, b);
  }
  range(u) { return u.range + (u.extraRange || 0); }

  /* 상태이상 */
  addStatus(u, id, turns, data = {}) {
    if (!u.alive) return;
    if (u.flags.immune && ['disarm','fear','poison','stun','bleed','burn','healdown','link','mark','weaken','miss','plague','atkdown'].includes(id)) return;
    const cur = u.statuses[id];
    if (cur && data.stack) { cur.stack = (cur.stack || 1) + 1; cur.turns = Math.max(cur.turns, turns); }
    else u.statuses[id] = { turns, ...data, stack: data.stack ? 1 : undefined };
    this.ev({ t: 'status', uid: u.uid, id, on: true });
    // 허성: 아군이 디버프 받으면 분노+1
    const xs = this.alliesOf(u).find(a => a.heroId === 'xusheng' && this.dist(a, u) <= 5);
    if (xs && xs.rageMax) xs.rage = Math.min(xs.rageMax, xs.rage + 1);
  }
  has(u, id) { return !!u.statuses[id]; }
  clearDebuffs(u) { for (const k of ['disarm','fear','poison','stun','bleed','burn','healdown','weaken','miss','plague','atkdown','immobile']) delete u.statuses[k]; }

  /* 피해 / 회복 */
  heal(u, amount, src) {
    if (!u.alive || amount <= 0) return 0;
    if (u.statuses.healdown) amount *= (1 - u.statuses.healdown.pct / 100);
    amount = Math.round(amount);
    const before = u.hp; u.hp = Math.min(u.maxHp, u.hp + amount);
    const real = u.hp - before;
    if (real > 0) this.ev({ t: 'heal', uid: u.uid, amount: real, hp: u.hp });
    return real;
  }
  addShield(u, amount) { if (!u.alive || amount <= 0) return; u.shield += Math.round(amount); this.ev({ t: 'shield', uid: u.uid, shield: u.shield }); }

  // 피해 계산 파이프라인. opts: {fixed, mult, ignoreDodge, ignoreReduce, ranged, skill, pierceShield, noOnHit}
  damage(src, tgt, base, o = {}) {
    if (!tgt.alive) return 0;
    let amt = base;
    // 회피
    if (!o.fixed && !o.ignoreDodge) {
      let dodge = tgt.dodge + (tgt.statuses.evade ? tgt.statuses.evade.pct : 0);
      if (src && src.weapon && src.weapon.id === 'meteor') dodge *= (1 - src.weapon.v / 100);
      if (tgt.armor && tgt.armor.id === 'dodge_shoes') dodge += tgt.armor.v;
      if (src && src.statuses.miss && chance(src.statuses.miss.pct)) dodge = 100;
      if (chance(dodge)) {
        this.ev({ t: 'dodge', uid: tgt.uid, from: src ? src.uid : null });
        if (tgt.heroId === 'zhaoyun') { tgt.flags.zhaoBoost = true; }
        if (tgt.heroId === 'yuejin' && src && src.isBuilding) tgt.flags.yuejinStore = (tgt.flags.yuejinStore || 0) + amt;
        return 0;
      }
    }
    if (!o.fixed) {
      let bonus = (src ? src.dmgBonus : 0) + (src && src.statuses.rally ? src.statuses.rally.pct : 0) + (src && src.statuses.golden ? src.statuses.golden.pct : 0);
      if (src && src.statuses.atkdown) bonus -= src.statuses.atkdown.pct;
      if (src && src.statuses.weaken) bonus -= src.statuses.weaken.pct;
      if (src && src.statuses.morale) bonus += 0; // 사기는 atk로 반영
      if (src && src.heroId === 'gaoshun') bonus += Math.round((1 - src.hp / src.maxHp) * 100);
      if (src && src.heroId === 'xiangyu') bonus += Math.round((1 - src.hp / src.maxHp) * 60);
      if (src && src.heroId === 'menghuo') bonus += (src.flags.mhStack || 0) * src.hero.v1;
      if (src && src.statuses.yujin) bonus += src.statuses.yujin.pct;
      if (src && src.heroId === 'lianpo' && src.hp >= src.maxHp * 0.5) bonus += 25 + src.hero.v1;
      if (src && src.statuses.lianpo && src.hp >= src.maxHp * 0.5) bonus += 25;
      if (src && src.statuses.dengai) bonus -= 20;
      if (src && src.heroId === 'dengai' && src.turnsTaken > 1) bonus += 10;
      amt *= (1 + bonus / 100);
      // 치명타
      if (src && src.weapon && src.weapon.id === 'crit_sword' && chance(src.weapon.v)) { amt *= 1.65; o.crit = true; }
      if (src && src.monsterId === 'b_assassin' && chance(30)) { amt *= 1.5; o.crit = true; }
      // 피해 감소
      let reduce = tgt.dmgReduce + (tgt.statuses.stance ? 40 : 0) + (tgt.statuses.taunting ? 30 : 0) + (tgt.statuses.golden ? 30 : 0) + (tgt.statuses.guardred ? tgt.statuses.guardred.pct : 0);
      if (tgt.statuses.yujin) reduce -= tgt.statuses.yujin.pct;
      if (tgt.heroId === 'lianpo' && tgt.hp < tgt.maxHp * 0.5) reduce += 25;
      if (tgt.statuses.lianpo && tgt.hp < tgt.maxHp * 0.5) reduce += 25;
      if (tgt.heroId === 'jiangwei') reduce += Math.min(tgt.hero.v1, tgt.flags.jwStack || 0) * 6;
      if (tgt.armor && tgt.armor.id === 'obsidian') reduce += (this.round <= 5 ? tgt.armor.v : -50);
      if (tgt.armor && tgt.armor.id === 'iron_shield' && !o.ranged) reduce += tgt.armor.v * (tgt.hp < tgt.maxHp * 0.5 ? 2 : 1);
      if (tgt.armor && tgt.armor.id === 'vine_shield' && o.ranged) reduce += tgt.armor.v * (tgt.hp < tgt.maxHp * 0.5 ? 0.5 : 1);
      if (tgt.statuses.ratdebuff) reduce -= 0; // 쥐 디버프는 주는 피해 쪽
      if (src && src.statuses.ratdebuff) amt *= 0.3;
      if (src && src.flags.moon) reduce -= 20;
      if (src && src.monsterId === 'g_rat') reduce *= 0.3;
      if (tgt.flags.moon) amt *= 2;
      reduce = Math.max(-100, Math.min(85, reduce));
      amt *= (1 - reduce / 100);
      if (tgt.armor && tgt.armor.id === 'chain_mail') amt -= 5 + (tgt.flags.chainStack || 0);
      if (tgt.armor && tgt.armor.id === 'gold_chain') { const cap = tgt.armor.v; if (amt > cap) { tgt.flags.overflow = (tgt.flags.overflow || 0) + (amt - cap); amt = cap; } }
      // 주태: 아군 피해 분담
      if (!o.shared) {
        const zt = this.alliesOf(tgt).find(a => a.heroId === 'zhoutai' && this.dist(a, tgt) <= 5 && a.alive);
        if (zt) { const share = amt * zt.hero.v1 / 100; amt -= share; this.damage(src, zt, share, { fixed: true, shared: true, noOnHit: true }); }
        const jd = tgt.heroId === 'jindo' ? this.alliesOf(tgt).filter(a => a.cls === 'shield').sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp)[0] : null;
        if (jd) { const share = amt * tgt.hero.v1 / 100; amt -= share; this.damage(src, jd, share, { fixed: true, shared: true, noOnHit: true }); }
      }
      // 다트: 일부 고정 피해 (이미 계산된 값에 추가 비율)
      if (src && src.weapon && src.weapon.id === 'dart') amt *= (1 + src.weapon.v / 100 * 0.3);
    }
    amt = Math.max(0, Math.round(amt));
    // 보호막
    if (amt > 0 && tgt.shield > 0 && !o.pierceShield) {
      const absorbed = Math.min(tgt.shield, amt); tgt.shield -= absorbed; amt -= absorbed;
      this.ev({ t: 'shield', uid: tgt.uid, shield: tgt.shield, absorbed });
    }
    const wasAbove50 = tgt.hp >= tgt.maxHp * 0.5;
    tgt.hp -= amt; tgt.dmgTaken += amt;
    if (src) src.dmgDealt += amt;
    this.ev({ t: 'dmg', uid: tgt.uid, from: src ? src.uid : null, amount: amt, hp: Math.max(0, tgt.hp), crit: !!o.crit, fixed: !!o.fixed, skill: o.skill || null });
    // 피격 트리거
    if (amt > 0 && !o.noOnHit) this.onHit(src, tgt, amt, o);
    if (tgt.armor && tgt.armor.id === 'bronze_shield' && wasAbove50 && tgt.hp < tgt.maxHp * 0.5 && tgt.hp > 0 && !tgt.flags.bronzeUsed) {
      tgt.flags.bronzeUsed = true; this.addShield(tgt, tgt.lv * tgt.armor.v); this.heal(tgt, tgt.maxHp * 0.3);
    }
    if (tgt.hp <= 0) this.kill(tgt, src);
    return amt;
  }

  onHit(src, tgt, amt, o) {
    // 분노 (피격)
    if (tgt.rageMax && !o.noRage) tgt.rage = Math.min(tgt.rageMax, tgt.rage + 1);
    if (tgt.heroId === 'zhaoyun') tgt.dodge += 5;
    if (tgt.heroId === 'caoren') { const st = tgt.flags.crStack || 0; if (st < tgt.hero.v1) { tgt.flags.crStack = st + 1; tgt.maxHp += 8; tgt.hp += 8; } }
    if (tgt.heroId === 'menghuo') { tgt.flags.mhStack = (tgt.flags.mhStack || 0) + 1; if (tgt.flags.mhStack >= 7) { tgt.flags.mhStack = 0; this.heal(tgt, (tgt.maxHp - tgt.hp) * 0.1); } }
    if (tgt.armor && tgt.armor.id === 'chain_mail' && chance(tgt.armor.v) && (tgt.flags.chainStack || 0) < Math.floor(tgt.maxHp / 50)) tgt.flags.chainStack = (tgt.flags.chainStack || 0) + 1;
    if (tgt.weapon && tgt.weapon.id === 'ring_blade') tgt.flags.ringLs = Math.min(60, (tgt.flags.ringLs || 0) + tgt.weapon.v);
    if (src && src.alive) {
      // 반사
      if (tgt.armor && tgt.armor.id === 'thorn_armor' && chance(tgt.armor.v)) this.damage(tgt, src, 5 + Math.floor(tgt.maxHp / 50), { fixed: true, noOnHit: true, skill: '반사' });
      if (tgt.monsterId === 'hedgehog') this.damage(tgt, src, amt * 0.35, { fixed: true, noOnHit: true, skill: '가시' });
      if (tgt.statuses.stance && !o.ranged && this.dist(tgt, src) <= 1) this.damage(tgt, src, tgt.atk * 0.8, { noOnHit: true, skill: '반격' });
      if (tgt.monsterId === 'g_rat' && this.dist(tgt, src) <= 2) this.addStatus(src, 'plague', 99, { stack: true });
      // 주유 연결: 피해 전이
      if (tgt.statuses.link && !o.linked) {
        for (const other of this.units) if (other.alive && other !== tgt && other.statuses.link && other.statuses.link.gid === tgt.statuses.link.gid) this.damage(src, other, amt * tgt.statuses.link.pct / 100, { fixed: true, linked: true, noOnHit: true, skill: '연결' });
      }
      // 이유 독주 누적
      if (tgt.statuses.wine) tgt.statuses.wine.total += amt;
    }
  }

  kill(u, src) {
    if (!u.alive) return;
    // 주태 빈사 회복
    if (u.heroId === 'zhoutai') { const p = Math.max(50, 100 - 10 * (u.flags.ztUsed || 0)); if (chance(p)) { u.flags.ztUsed = (u.flags.ztUsed || 0) + 1; u.hp = Math.round(u.maxHp * 0.2); this.ev({ t: 'heal', uid: u.uid, amount: u.hp, hp: u.hp }); this.log(`${u.name}(주태)이(가) 빈사에서 일어난다!`, 'hero'); return; } }
    u.alive = false; u.hp = 0;
    this.ev({ t: 'die', uid: u.uid, by: src ? src.uid : null });
    if (!u.isGiant) delete this.grid[u.x + ',' + u.y];
    else for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) delete this.grid[(u.x + dx) + ',' + (u.y + dy)];
    if (src) { src.kills++; this.onKill(src, u); }
    // 군기 드롭
    if (u.armor && u.armor.id === 'banner') {}
    // 우금 사망 → 버프 해제
    if (u.heroId === 'yujin') for (const a of this.alliesOf(u)) { delete a.statuses.yujin; a.flags.immune = false; }
    if (u.heroId === 'gaoshun') for (const a of this.alliesOf(u)) if (a.flags.gaoshun) { a.maxHp = Math.round(a.maxHp / 1.1); a.hp = Math.min(a.hp, a.maxHp); a.atk = Math.round(a.atk / (1 + a.flags.gaoshun / 100)); }
    if (u.heroId === 'caocao') for (const a of this.alliesOf(u)) if (a.flags.morale) { a.maxHp -= a.flags.morale * 10; a.hp = Math.min(a.hp, a.maxHp); a.atk -= a.flags.morale; a.flags.morale = 0; }
    if (u.heroId === 'xiangyu') for (const e of this.enemiesOf(u)) if (this.dist(u, e) <= 2) this.damage(u, e, u.atk, { skill: '패왕의 최후' });
    if (u.statuses.wine) this.wineBurst(u);
    // 이사업
    for (const a of this.units) if (a.alive && a.heroId === 'lisiye' && a.side !== u.side && this.dist(a, u) <= this.range(a) + 1) { const st = a.flags.lsStack || 0; if (st < a.hero.v1) { a.flags.lsStack = st + 1; a.atk += 2; a.dodge += 3; } }
  }
  onKill(src, victim) {
    if (src.weapon && src.weapon.id === 'blood_drop') {}
    if (src.heroId === 'lvbu' && src.rageMax && src.flags.charging) src.rage = Math.min(src.rageMax, src.rage + Math.ceil(src.rageMax / 2));
  }
  wineBurst(u) {
    const w = u.statuses.wine; if (!w) return; delete u.statuses.wine;
    const src = this.units.find(x => x.uid === w.src);
    if (!src) return;
    const targets = this.enemiesOf(src).filter(e => this.dist(e, u) <= 2 && e !== u).slice(0, 8);
    for (const e of targets) this.damage(src, e, w.total * w.pct / 100, { fixed: true, skill: '독주 폭발' });
  }

  /* 타겟 선정 */
  selectTarget(u) {
    let cands = this.enemiesOf(u);
    if (!cands.length) return null;
    // 도발
    const taunter = cands.find(e => e.statuses.tauntTarget && e.statuses.tauntTarget.of === u.uid) || cands.find(e => u.statuses.taunted && u.statuses.taunted.by === e.uid);
    if (taunter) return taunter;
    if (u.statuses.taunted) { const t = cands.find(e => e.uid === u.statuses.taunted.by); if (t) return t; }
    if (u.isBuilding) { const ye = cands.find(e => e.heroId === 'yuejin'); if (ye) return ye; }
    // 백사편: 가장 가까운 적
    const byDist = [...cands].sort((a, b) => this.dist(u, a) - this.dist(u, b));
    if (u.heroId === 'caoxiu') return [...cands].sort((a, b) => this.dist(u, b) - this.dist(u, a))[0];
    if (u.heroId === 'huangzhong') { const inR = cands.filter(e => this.dist(u, e) <= this.range(u)); if (inR.length) return inR.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; }
    if (u.heroId === 'qinqiong') { return [...cands].sort((a, b) => (b.hero ? 1 : 0) - (a.hero ? 1 : 0) || b.atk - a.atk)[0]; }
    if (u.monsterId === 'elephant') { const inR = cands.filter(e => this.dist(u, e) <= 5); if (inR.length) return inR.sort((a, b) => b.hp - a.hp)[0]; }
    if (u.cls === 'siege' || u.monsterId === 'b_archer') { const b = cands.find(e => e.isBuilding); if (b && u.cls === 'siege') return b; }
    // 사거리 안 가장 가까운 적; 없으면 전체 가장 가까운
    return byDist[0];
  }

  /* 이동 */
  freeCell(x, y) { return x >= 0 && y >= 0 && x < BW && y < BH && !this.grid[x + ',' + y]; }
  moveToward(u, tgt) {
    if (u.move <= 0 || u.statuses.immobile || u.isGiant) return;
    const r = this.range(u);
    if (this.dist(u, tgt) <= r) return;
    // BFS
    const start = u.x + ',' + u.y; const prev = { [start]: null }; const q = [[u.x, u.y, 0]]; let best = null;
    while (q.length) {
      const [x, y, d] = q.shift();
      if (d > u.move) continue;
      const dd = this.dist({ x, y }, tgt);
      if (dd <= r) { best = [x, y]; break; }
      if (!best || dd < this.dist({ x: best[0], y: best[1] }, tgt)) best = [x, y];
      if (d === u.move) continue;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
        if (!this.freeCell(nx, ny) || k in prev) continue; prev[k] = x + ',' + y; q.push([nx, ny, d + 1]);
      }
    }
    if (!best || (best[0] === u.x && best[1] === u.y)) return;
    const path = []; let k = best[0] + ',' + best[1];
    while (k && k !== start) { path.unshift(k.split(',').map(Number)); k = prev[k]; }
    this.teleport(u, best[0], best[1]); this.ev({ t: 'move', uid: u.uid, path });
  }
  teleport(u, x, y) { delete this.grid[u.x + ',' + u.y]; u.x = x; u.y = y; this.grid[x + ',' + y] = u; }
  pushBack(tgt, from) {
    const dx = Math.sign(tgt.x - from.x), dy = Math.sign(tgt.y - from.y);
    const nx = tgt.x + dx, ny = tgt.y + dy;
    if (this.freeCell(nx, ny) && !tgt.isGiant) { this.teleport(tgt, nx, ny); this.ev({ t: 'move', uid: tgt.uid, path: [[nx, ny]] }); return true; }
    return false;
  }

  /* 턴 실행 */
  run() {
    this.log('전투 시작', 'sys');
    this.ev({ t: 'init', units: this.units.map(u => this.snap(u)) });
    this.battleStart();
    for (this.round = 1; this.round <= CONST.MAX_BATTLE_ROUNDS; this.round++) {
      this.ev({ t: 'round', n: this.round });
      const order = this.units.filter(u => u.alive).sort((a, b) => (b.move - a.move) || (b.atk - a.atk) || (Math.random() - 0.5));
      for (const u of order) {
        if (!u.alive) continue;
        this.turn(u);
        if (!this.A.some(x => x.alive) || !this.D.some(x => x.alive)) break;
      }
      if (!this.A.some(x => x.alive) || !this.D.some(x => x.alive)) break;
    }
    const aAlive = this.A.some(x => x.alive), dAlive = this.D.some(x => x.alive);
    let winner = 'draw';
    if (aAlive && !dAlive) winner = 'A'; else if (dAlive && !aAlive) winner = 'D';
    this.log(winner === 'A' ? '공격 측 승리' : winner === 'D' ? '수비 측 승리' : `${CONST.MAX_BATTLE_ROUNDS}턴 초과 — 공격 측 철수`, 'sys');
    this.ev({ t: 'end', winner });
    return { winner, events: this.events, rounds: Math.min(this.round, CONST.MAX_BATTLE_ROUNDS), units: this.units };
  }
  snap(u) { return { uid: u.uid, side: u.side, name: u.name, cls: u.cls, typeId: u.typeId, monsterId: u.monsterId, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp, atk: u.atk, lv: u.lv, hero: u.hero ? u.hero.name : null, heroId: u.heroId || null, isGiant: u.isGiant, isBuilding: u.isBuilding, rage: u.rage, rageMax: u.rageMax, shield: u.shield, range: this.range(u), move: u.move }; }

  battleStart() {
    for (const u of this.units) {
      if (!u.alive) continue;
      if (u.heroId === 'yujin') for (const a of this.alliesOf(u)) if (a.cls !== 'siege') { a.statuses.yujin = { turns: 99, pct: u.hero.v1 }; a.flags.immune = true; }
      if (u.heroId === 'gaoshun') for (const a of this.alliesOf(u)) if (a.cls !== 'siege') { a.maxHp = Math.round(a.maxHp * 1.1); a.hp = a.maxHp; a.atk = Math.round(a.atk * (1 + u.hero.v1 / 100)); a.flags.gaoshun = u.hero.v1; }
      if (u.heroId === 'xinqiji') u.statuses.golden = { turns: 3, pct: u.hero.v1 };
      if (u.heroId === 'huanggai') { u.hp = Math.round(u.hp * 0.8); const near = this.alliesOf(u).sort((a, b) => this.dist(u, a) - this.dist(u, b)).slice(0, 30).concat([u]); for (const a of near) { this.addShield(a, a.maxHp * u.hero.v1 / 100); a.atk = Math.round(a.atk * 1.1); } }
      if (u.heroId === 'dengai') { const near = this.enemiesOf(u).sort((a, b) => this.dist(u, a) - this.dist(u, b)).slice(0, 30); for (const e of near) e.statuses.dengai = { turns: 5 }; }
      if (u.heroId === 'weixiaokuan') { for (const e of this.enemiesOf(u).filter(e => this.dist(u, e) <= 4).slice(0, 12)) e.statuses.taunted = { turns: 2, by: u.uid }; u.statuses.guardred = { turns: 2, pct: u.hero.v1 }; }
      if (u.monsterId === 'b_boss') for (const a of this.alliesOf(u)) a.atk = Math.round(a.atk * 1.2);
    }
  }

  turnStart(u) {
    u.turnsTaken++;
    const st = u.statuses;
    // 지속 피해
    if (st.poison) this.damage(null, u, Math.max(5, u.maxHp * 0.05), { fixed: true, skill: '독' });
    if (st.skunk) this.damage(null, u, u.hp * 0.15, { fixed: true, skill: '독' });
    if (st.bleed) this.damage(null, u, st.bleed.dmg, { fixed: true, skill: '출혈' });
    if (st.burn) this.damage(null, u, st.burn.dmg, { fixed: true, skill: '화상' });
    if (st.plague) this.damage(null, u, u.maxHp * 0.05 * (st.plague.stack || 1), { fixed: true, skill: '전염병' });
    if (!u.alive) return false;
    // 회복류
    if (u.armor && u.armor.id === 'gourd') this.heal(u, u.maxHp * u.armor.v / 100);
    if (u.armor && u.armor.id === 'heart_mirror' && this.round % 5 === 0) { this.heal(u, (u.maxHp - u.hp) * 0.2); for (const a of this.alliesOf(u).filter(a => this.dist(u, a) <= 1).slice(0, 4)) this.heal(a, (a.maxHp - a.hp) * 0.2); }
    if (u.armor && u.armor.id === 'sun_armor' && chance(u.armor.v)) for (const e of this.enemiesOf(u).filter(e => this.dist(u, e) <= 1).slice(0, 4)) this.damage(u, e, u.maxHp * 0.04, { fixed: true, skill: '태양갑옷' });
    if (u.armor && u.armor.id === 'gold_chain' && u.flags.overflow > 0) { const d = Math.min(u.flags.overflow, u.armor.v); u.flags.overflow -= d; this.damage(null, u, d, { fixed: true, skill: '이월 피해' }); if (!u.alive) return false; }
    if (u.heroId === 'caoren' && (u.flags.crStack || 0) >= u.hero.v1) this.heal(u, u.maxHp * 0.01);
    if (u.heroId === 'dengai' && u.turnsTaken > 1) this.heal(u, u.hero.v1);
    if (u.heroId === 'xinqiji' && !st.golden && u.flags.xqAtk >= 3) { u.flags.xqAtk = 0; st.golden = { turns: 1, pct: u.hero.v1 }; }
    if (u.heroId === 'sunshangxiang' && u.turnsTaken % 5 === 0) {
      const e = this.enemiesOf(u).sort((a, b) => b.atk - a.atk)[0]; if (e) { this.addStatus(e, 'stun', 3); this.log(`${u.name}(손상향)이(가) ${e.name}을(를) 기절시켰다`, 'hero'); }
      const a = [...this.alliesOf(u), u].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (a) this.heal(a, a.maxHp * u.hero.v1 / 100);
    }
    if (u.heroId === 'qinliangyu' && u.flags.thrown) {
      u.flags.thrown = false; const t = u.flags.thrownAt; const occ = t ? this.grid[t[0] + ',' + t[1]] : null;
      if (occ && occ.alive && occ.side !== u.side) this.damage(u, occ, u.atk * u.hero.v1 / 100, { skill: '회수' }); else if (u.rageMax) u.rage = Math.min(u.rageMax, u.rage + Math.ceil(u.rageMax * 0.75));
    }
    if (st.wine) { st.wine.turns--; if (st.wine.turns <= 0) this.wineBurst(u); }
    return u.alive;
  }
  turnEnd(u) {
    for (const k of Object.keys(u.statuses)) {
      const s = u.statuses[k]; if (k === 'wine' || k === 'plague') continue;
      s.turns--; if (s.turns <= 0) { delete u.statuses[k]; this.ev({ t: 'status', uid: u.uid, id: k, on: false }); }
    }
    if (u.statuses.taunted) {} 
  }

  turn(u) {
    if (!this.turnStart(u)) return;
    if (u.statuses.stun || u.statuses.fear) { this.ev({ t: 'skip', uid: u.uid, why: u.statuses.stun ? '기절' : '공포' }); this.turnEnd(u); return; }
    const tgt = this.selectTarget(u);
    if (!tgt) return;
    // 궁기병 치고빠지기 등 이동 전 처리 없음
    this.moveToward(u, tgt);
    if (this.dist(u, tgt) <= this.range(u)) {
      if (u.rageMax && u.rage >= u.rageMax && u.skill && !u.statuses.silence) { u.rage = 0; this.useSkill(u, tgt); if (u.alive && u.weapon && u.weapon.id === 'dual_axe' && chance(u.weapon.v)) u.rage = Math.min(u.rageMax, u.rage + Math.ceil(u.rageMax / 2)); }
      else this.basicAttack(u, tgt);
    } else if (u.isMonster || u.isBuilding) {
      // 사거리 밖 → 대기
    }
    this.turnEnd(u);
  }

  gainRage(u) { if (u.rageMax) { u.rage = Math.min(u.rageMax, u.rage + 1); if (u.heroId === 'dianwei') { const st = u.flags.dwStack || 0; if (st < u.hero.v1) { u.flags.dwStack = st + 1; u.atk += 1; } } if (u.weapon && u.weapon.id === 'dual_axe') u.rage = Math.min(u.rageMax, u.rage + 1); } }

  // 일반 공격 (히트 1회). mult는 배율
  hit(u, tgt, mult = 1, o = {}) {
    if (!tgt.alive || !u.alive) return 0;
    let base = u.atk * mult;
    const ranged = this.range(u) >= 2 && this.dist(u, tgt) >= 2;
    // 병종 패시브
    if (u.typeId === 'bow_heavy') base *= (1 + Math.min(4, Math.max(0, this.dist(u, tgt) - 1)) * 0.2);
    if (u.typeId === 'siege_cat' && tgt.isBuilding) base += 2 * (1 + (this.opts.capitalLv || 1) * 0.5);
    if (u.heroId === 'zhaoyun' && u.flags.zhaoBoost) { base *= (1 + u.hero.v1 / 100); u.flags.zhaoBoost = false; }
    if (u.heroId === 'handang' && !o.skill) base += u.atk * (u.rage * u.hero.v1 / 100);
    if (u.heroId === 'caoxiu') { const far = this.enemiesOf(u).sort((a, b) => this.dist(u, b) - this.dist(u, a))[0]; if (far === tgt) base *= (1 + u.hero.v1 / 100); }
    if (u.heroId === 'jindo') base += this.alliesOf(u).filter(a => a.cls === 'shield').reduce((s, a) => s + a.atk, 0) * 0.1;
    if (u.heroId === 'yuejin' && u.flags.yuejinStore && !tgt.isBuilding) { base += u.flags.yuejinStore * u.hero.v1 / 100; u.flags.yuejinStore = 0; }
    if (u.heroId === 'yangmiaozhen' && tgt.statuses.mark && tgt.statuses.mark.by === u.uid) { const fx = tgt.maxHp * 0.15; this.damage(u, tgt, fx, { fixed: true, skill: '표식' }); this.heal(u, fx * u.hero.v1 / 100); }
    if (u.heroId === 'qinqiong' && u.flags.qqHits > 0 && !o.skill) { u.flags.qqHits--; this.damage(u, tgt, tgt.maxHp * u.hero.v1 / 100, { fixed: true, skill: '진경' }); }
    if (u.heroId === 'limu' && u.flags.lmTurns > 0) base += u.atk * u.hero.v1 / 100;
    if (u.heroId === 'xinqiji') u.flags.xqAtk = (u.flags.xqAtk || 0) + 1;
    if (u.monsterId === 'b_boss' || u.monsterId === 'tiger') { for (const e of this.enemiesOf(u).filter(e => e !== tgt && this.dist(e, tgt) <= 1).slice(0, 4)) this.damage(u, e, u.atk * 0.5, { ranged, skill: '광역' }); }
    const dealt = this.damage(u, tgt, base, { ranged, skill: o.skill, ignoreReduce: o.ignoreReduce, pierceShield: o.pierceShield });
    if (dealt > 0) this.afterHit(u, tgt, dealt, ranged, o);
    return dealt;
  }
  afterHit(u, tgt, dealt, ranged, o) {
    // 흡혈
    let ls = u.lifesteal + (u.statuses.lsbuff ? u.statuses.lsbuff.pct : 0);
    if (u.weapon && u.weapon.id === 'vamp_sword') ls += u.weapon.v;
    if (u.flags.ringLs) { ls += u.flags.ringLs; u.flags.ringLs = 0; }
    if (ls > 0) { const h = dealt * ls / 100; const real = this.heal(u, h); if (u.weapon && u.weapon.id === 'vamp_sword' && h - real > 0) this.addShield(u, Math.min(6 * u.lv, h - real)); }
    // 장비 on-hit
    const w = u.weapon;
    if (w && w.id === 'heal_sword' && u.cls !== 'siege') { const amt = this.dist(u, tgt) > 2 ? w.v / 2 : w.v; this.heal(u, amt); if (chance(40)) { const a = this.alliesOf(u).filter(a => this.dist(u, a) <= 5).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; if (a) this.heal(a, amt); } }
    if (w && w.id === 'yellow_axe') this.addShield(u, tgt.maxHp * w.v / 100);
    if (w && w.id === 'wolf_club' && tgt.alive) this.damage(u, tgt, tgt.hp * w.v / 100, { fixed: true, skill: '낭아봉' });
    if (w && w.id === 'qiankun' && chance(w.v)) for (const e of this.enemiesOf(u).filter(e => e !== tgt && this.dist(e, tgt) <= 1).slice(0, 4)) this.damage(u, e, u.atk * 0.75, { fixed: true, skill: '건곤도' });
    if (w && w.id === 'hook_sword' && chance(w.v) && tgt.alive) this.damage(u, tgt, tgt.maxHp * ((ranged ? 1 : 2) + u.lv) / 100, { fixed: true, skill: '갈고리검' });
    if (w && w.id === 'blood_drop' && tgt.alive && tgt.hp < tgt.maxHp * w.v / 100 && !tgt.isGiant) { this.log(`${u.name}의 혈적자가 ${tgt.name}을(를) 처형!`, 'hero'); this.kill(tgt, u); u.atk += 1; }
    if (w && w.id === 'dragon_sword' && chance(25)) u.dmgBonus += 1;
    // 병종 패시브
    if (u.typeId === 'siege_bal' && tgt.alive) this.damage(u, tgt, tgt.maxHp * 0.01 * (tgt.isMonster ? 3 : 1), { fixed: true, skill: '쇠뇌차' });
    if (u.passive === 'bleedhit') this.addStatus(tgt, 'bleed', 3, { dmg: 4 + u.lv });
    if (u.passive === 'cleave' && !o.skill) for (const e of this.enemiesOf(u).filter(e => e !== tgt && this.dist(e, tgt) <= 1).slice(0, 2)) this.damage(u, e, u.atk * rnd(0.8, 1.2), { skill: '맥도' });
    if (u.monsterId === 'b_blade' && !o.skill) for (const e of this.enemiesOf(u).filter(e => e !== tgt && this.dist(e, tgt) <= 1).slice(0, 2)) this.damage(u, e, u.atk * 0.7, { skill: '칼잡이' });
    // 영웅 on-hit
    if (u.heroId === 'huangzhong' && tgt.alive && !tgt.isGiant && !tgt.isBuilding && tgt.hp < tgt.maxHp * 0.6) { let p = u.hero.v1; if (tgt.hp < tgt.maxHp * 0.3) p *= 2; if (chance(p)) { this.log(`${u.name}(황충)의 화살이 ${tgt.name}을(를) 즉사시켰다!`, 'hero'); this.kill(tgt, u); } }
    if (u.heroId === 'caocao') for (const a of this.alliesOf(u).filter(a => this.dist(u, a) <= 3).slice(0, 20)) { const st = a.flags.morale || 0; if (st < u.hero.v1) { a.flags.morale = st + 1; a.maxHp += 10; a.hp += 10; a.atk += 1; } }
    if (u.heroId === 'machao' && o.skill) u.statuses.evade = { turns: 1, pct: 30 };
    // 몬스터 on-hit
    const m = u.monsterId;
    if (m === 'skunk') { this.addStatus(tgt, 'skunk', 2); this.addStatus(tgt, 'healdown', 4, { pct: 60 }); }
    if (m === 'lion') { this.addStatus(tgt, 'bleed', 2, { dmg: Math.round(u.atk * 0.5) }); this.addStatus(tgt, 'healdown', 2, { pct: 50 }); }
    if (m === 'bear') { this.damage(u, tgt, tgt.maxHp * 0.08, { fixed: true, skill: '곰 할퀴기' }); if (chance(40)) this.addStatus(tgt, 'stun', 1); }
    if (m === 'hornet') this.damage(u, tgt, tgt.hp * 0.05, { fixed: true, skill: '벌침' });
    if (m === 'bison' || m === 'b_rider') { this.pushBack(tgt, u); }
    if (m === 'g_rat') this.addStatus(tgt, 'ratdebuff', 2);
    if (m === 'g_goat' && tgt.alive && !tgt.isGiant) {
      // 적이 몰린 곳으로 날려버림
      const enemies = this.enemiesOf(u); let bestCell = null, bestN = -1;
      for (let x = 0; x < BW; x++) for (let y = 0; y < BH; y++) { if (!this.freeCell(x, y)) continue; const n = enemies.filter(e => cheb(e, { x, y }) <= 1).length; if (n > bestN) { bestN = n; bestCell = [x, y]; } }
      if (bestCell) { this.teleport(tgt, bestCell[0], bestCell[1]); this.ev({ t: 'move', uid: tgt.uid, path: [bestCell] }); for (const e of enemies.filter(e => e !== tgt && cheb(e, tgt) <= 1).slice(0, 8)) { this.damage(u, e, tgt.maxHp * 0.15, { fixed: true, skill: '염소 들이받기' }); this.addStatus(e, 'stun', 1); } }
    }
    if (m === 'g_gorilla') { u.flags.gorStack = (u.flags.gorStack || 0) + 1; if (u.flags.gorStack % 3 === 0) { this.clearDebuffs(u); u.flags.gorEmp = 2; } }
    if (u.statuses.mark === undefined && u.heroId === 'yangmiaozhen') {}
  }

  basicAttack(u, tgt) {
    let mult = 1;
    if (u.monsterId === 'elephant' && tgt.hp === Math.max(...this.enemiesOf(u).map(e => e.hp))) mult = 2;
    if (u.monsterId === 'g_gorilla' && u.flags.gorEmp > 0) { u.flags.gorEmp--; mult = 3; for (const e of this.enemiesOf(u).filter(e => e !== tgt && this.dist(u, e) <= 2).slice(0, 6)) this.damage(u, e, u.atk, { skill: '고릴라 광역' }); }
    if (u.monsterId === 'bison') { mult = 1.3; }
    const name = u.monsterId ? MONSTERS[u.monsterId].name : null;
    this.ev({ t: 'attack', uid: u.uid, tid: tgt.uid, skill: null });
    // 백사편: 대상 변경
    if (u.weapon && u.weapon.id === 'white_whip') {}
    this.hit(u, tgt, mult, { pierceShield: u.monsterId === 'bison' });
    this.gainRage(u);
  }

  /* 액티브 스킬 */
  useSkill(u, tgt) {
    const sk = u.skill; const name = SKILL_NAMES[sk] || sk;
    this.ev({ t: 'attack', uid: u.uid, tid: tgt.uid, skill: name });
    this.log(`${u.name}${u.hero ? '(' + u.hero.name + ')' : ''}의 ${name}!`, 'skill');
    const lv = u.lv;
    const enemiesNear = (c, r, n) => this.enemiesOf(u).filter(e => this.dist(e, c) <= r).sort((a, b) => this.dist(a, c) - this.dist(b, c)).slice(0, n);
    switch (sk) {
      case 'thrust': {
        const dx = Math.sign(tgt.x - u.x), dy = Math.sign(tgt.y - u.y);
        const reach = 2 + (u.special ? 1 : 0); const hitSet = new Set(); const targets = [];
        for (let i = 1; i <= reach && targets.length < 4; i++) { const cx = u.x + dx * i, cy = u.y + dy * i; for (const e of this.enemiesOf(u)) if (!hitSet.has(e) && cheb(e, { x: cx, y: cy }) <= 1) { hitSet.add(e); targets.push(e); if (targets.length >= 4) break; } }
        if (!targets.includes(tgt)) targets.unshift(tgt);
        let first = true, total = 0;
        for (const e of targets.slice(0, 4)) { if (first && u.heroId === 'yangmiaozhen') this.addStatus(e, 'mark', 2, { by: u.uid }); total += this.hit(u, e, 1 + 0.1 * lv, { skill: name }); if (u.special) u.statuses.evade = { turns: 3, pct: 15 }; first = false; }
        this.heal(u, (u.maxHp - u.hp) * 0.3); break;
      }
      case 'javelin': {
        const far = this.enemiesOf(u).filter(e => this.dist(u, e) <= 5).sort((a, b) => this.dist(u, b) - this.dist(u, a))[0] || tgt;
        let mult = 0.6 + 0.1 * lv; if (u.heroId === 'zhanghe') mult *= (1 + u.hero.v1 / 100);
        let extra = 0; if (u.special) extra = Math.min(40, this.alliesOf(u).length + 1) * lv;
        const d = this.hit(u, far, mult, { skill: name, ranged: true }); if (extra && far.alive) this.damage(u, far, extra, { fixed: true, skill: '비창' });
        if (!far.alive && u.heroId === 'zhanghe') for (const e of enemiesNear(far, 1, 4)) if (!e.statuses.stance && e.cls !== 'siege') this.addStatus(e, 'fear', 2);
        if (u.heroId === 'qinliangyu') { u.flags.thrown = true; u.flags.thrownAt = [far.x, far.y]; }
        break;
      }
      case 'disarm': {
        const pct = 20 + 10 * lv;
        this.hit(u, tgt, 0.95 + 0.05 * lv, { skill: name, ranged: true });
        if (tgt.alive) { this.addStatus(tgt, 'disarm', 3); this.addStatus(tgt, 'atkdown', 3, { pct }); }
        if (u.heroId === 'baiqi') for (const e of this.enemiesOf(u).filter(e => e !== tgt && this.dist(e, tgt) <= 4).sort((a, b) => b.atk - a.atk).slice(0, 12)) this.addStatus(e, 'atkdown', 3, { pct: pct * u.hero.v1 / 100 });
        if (u.heroId === 'zhouyu') { const gid = 'g' + Math.random(); const grp = [tgt, ...enemiesNear(tgt, 2, 8).filter(e => e !== tgt && e.cls !== 'siege')].slice(0, 8); for (const e of grp) e.statuses.link = { turns: 3, gid, pct: u.hero.v1 }; this.log(`${u.name}(주유)이(가) ${grp.length}명을 연결했다`, 'hero'); }
        if (u.heroId === 'limu') { for (const a of this.alliesOf(u).sort((a, b) => b.atk - a.atk).slice(0, 8)) { a.statuses.immobile = { turns: 1 }; a.statuses.guardred = { turns: 1, pct: 30 }; } u.flags.lmTurns = 3; }
        break;
      }
      case 'storm': {
        const ts = enemiesNear(u, 1, 8); if (!ts.length) ts.push(tgt);
        for (const e of ts) { const d = this.hit(u, e, 0.7 + 0.1 * lv, { skill: name }); if (u.heroId === 'lvmeng' && d > 0) this.addShield(u, 40); }
        if (u.heroId === 'jiangwei') { const st = u.flags.jwStack || 0; if (st < u.hero.v1) { u.flags.jwStack = st + 1; u.atk += 4; } }
        if (u.heroId === 'lvmeng') u.dmgBonus = Math.max(u.dmgBonus, u.hero.v1);
        break;
      }
      case 'flurry': {
        let target = tgt; if (u.heroId === 'qinqiong') target = this.selectTarget(u) || tgt;
        const dash = (t) => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const nx = t.x + dx, ny = t.y + dy; if (this.freeCell(nx, ny)) { this.teleport(u, nx, ny); this.ev({ t: 'move', uid: u.uid, path: [[nx, ny]] }); return true; } } return this.dist(u, t) <= 1; };
        if (u.heroId === 'qinqiong') { if (dash(target)) { this.hit(u, target, 2, { skill: name }); u.flags.qqHits = 2; } break; }
        let times = 0; const maxTimes = u.heroId === 'wenyang' ? 7 : 1;
        while (times < maxTimes) {
          if (times > 0 && !chance(u.hero.v1)) break; // 문앙: 첫 돌진 100%, 이후 확률
          if (!target || !target.alive) target = this.selectTarget(u); if (!target) break;
          if (this.dist(u, target) > 1 && !dash(target)) break;
          const hits = u.heroId === 'wenyang' ? 1 : 3 + ((u.heroId === 'dianwei' && (u.flags.dwStack || 0) >= u.hero.v1) ? 1 : 0);
          for (let i = 0; i < hits && target.alive; i++) this.hit(u, target, u.heroId === 'wenyang' ? 1.6 : 0.55, { skill: name });
          times++;
        }
        break;
      }
      case 'guard': {
        const n = u.heroId === 'xusheng' ? 10 : 1;
        const als = [...this.alliesOf(u), u].filter(a => this.dist(u, a) <= 5).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, n);
        for (const a of als) { this.addShield(a, 20 + 10 * lv + (u.special ? u.maxHp * 0.05 : 0)); if (u.heroId === 'xusheng') { a.flags.immune = true; a.statuses.lsbuff = { turns: 5, pct: u.hero.v1 }; a.statuses.immuneT = { turns: 5 }; } }
        this.hit(u, tgt, 1, { skill: name }); break;
      }
      case 'stance': {
        u.statuses.stance = { turns: 2 }; this.hit(u, tgt, 1, { skill: name });
        if (u.heroId === 'zhangfei') for (const e of enemiesNear(u, 2, 8)) { this.damage(u, e, u.atk * u.hero.v1 / 100, { skill: '포효' }); if (e.cls !== 'siege') this.addStatus(e, 'fear', 3); }
        break;
      }
      case 'taunt': {
        for (const e of enemiesNear(u, 3, 8)) e.statuses.taunted = { turns: 2, by: u.uid };
        u.statuses.taunting = { turns: 2 }; this.hit(u, tgt, 1, { skill: name }); break;
      }
      case 'smash': { this.hit(u, tgt, 1.5, { skill: name }); if (tgt.alive) this.addStatus(tgt, 'stun', 1); break; }
      case 'whirl': { const ts = enemiesNear(u, 1, 8); if (!ts.length) ts.push(tgt); for (const e of ts) { this.hit(u, e, 0.9, { skill: name }); if (e.alive) this.addStatus(e, 'bleed', 2, { dmg: 3 + lv }); } break; }
      case 'execute': { this.hit(u, tgt, tgt.hp < tgt.maxHp * 0.25 ? 2.4 : 1.2, { skill: name }); break; }
      case 'scatter': {
        this.hit(u, tgt, 1, { skill: name, ranged: true });
        const n = u.special ? 4 : 2; const others = this.enemiesOf(u).filter(e => e !== tgt && this.dist(u, e) <= 6).slice(0, n);
        for (const e of others) this.hit(u, e, 0.4 + 0.1 * lv, { skill: name, ranged: true });
        if (u.heroId === 'handang') u.rage = 1; break;
      }
      case 'volley': {
        if (u.heroId === 'liubei') { const a = [...this.alliesOf(u), u].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0]; const pct = u.hero.v1 + (lv >= 6 ? 30 : 0); for (let i = 0; i < 3 + (u.special ? 1 : 0); i++) this.heal(a, a.maxHp * pct / 100); this.log(`${u.name}(유비)이(가) ${a.name}을(를) 치료했다`, 'hero'); break; }
        let shots = 3; let fired = 0; let target = tgt;
        while (fired < shots && fired < 10) { if (!target.alive) { target = this.selectTarget(u); if (!target) break; } this.hit(u, target, 0.6, { skill: name, ranged: true }); fired++; if (u.heroId === 'liucong' && chance(u.hero.v1) && shots < 10) shots++; }
        break;
      }
      case 'snipe': { this.hit(u, tgt, 2.2, { skill: name, ranged: true }); break; }
      case 'rally': {
        if (u.heroId === 'yangyouji') {
          const pet = this.units.find(x => x.alive && x.side === u.side && x.flags.petOf === u.uid);
          if (pet) { pet.maxHp = Math.round(pet.maxHp * (1 + u.hero.v1 / 100)); pet.hp = pet.maxHp; this.log(`${u.name}(양유기)이(가) 야수에게 먹이를 주었다`, 'hero'); }
          else { const b = BEASTS[Math.floor(Math.random() * BEASTS.length)]; const p = makeBattleUnit(u.side, { monsterId: b, scale: 1 + lv * 0.4 }); p.flags.petOf = u.uid; p.isMonster = true; p.name = '소환 ' + p.name; this.initUnit(p); let placed = false; for (let dx = -1; dx <= 1 && !placed; dx++) for (let dy = -1; dy <= 1 && !placed; dy++) if (this.freeCell(u.x + dx, u.y + dy)) { p.x = u.x + dx; p.y = u.y + dy; placed = true; } if (!placed) { p.x = u.x; p.y = u.y; } this.grid[p.x + ',' + p.y] = p; this.units.push(p); (u.side === 'A' ? this.A : this.D).push(p); this.ev({ t: 'spawn', unit: this.snap(p) }); this.log(`${u.name}(양유기)이(가) ${p.name}을(를) 소환했다`, 'hero'); }
          this.hit(u, tgt, 1, { skill: name, ranged: true }); break;
        }
        let als = this.alliesOf(u).filter(a => this.dist(u, a) <= 3).slice(0, 6); let pct = 25;
        if (u.heroId === 'sunquan') { als = this.alliesOf(u).sort((a, b) => b.atk - a.atk).slice(0, lv >= 6 ? 8 : 4); pct = u.hero.v1; }
        for (const a of als) { a.statuses.rally = { turns: 2, pct }; if (u.heroId === 'yanghongyu') a.statuses.guardred = { turns: 2, pct: u.hero.v1 * (lv >= 6 ? 2 : 1) }; }
        this.hit(u, tgt, 1, { skill: name, ranged: true }); break;
      }
      case 'firearrow': {
        this.hit(u, tgt, 1, { skill: name, ranged: true });
        const dmg = Math.round(u.atk * 0.4); let ts = [tgt, ...enemiesNear(tgt, 1, 4).filter(e => e !== tgt)];
        if (u.heroId === 'luxun' && chance(u.hero.v1)) ts = ts.concat(enemiesNear(tgt, 2, 4).filter(e => !ts.includes(e)));
        for (const e of ts) this.addStatus(e, 'burn', 2, { dmg }); break;
      }
      case 'poisonarrow': {
        this.hit(u, tgt, 1, { skill: name, ranged: true });
        if (tgt.alive) { this.addStatus(tgt, 'poison', 3); this.addStatus(tgt, 'healdown', 3, { pct: 30 }); }
        if (u.heroId === 'wangyi') for (const e of enemiesNear(tgt, 3, 12)) this.addStatus(e, 'miss', 2, { pct: u.hero.v1 });
        if (u.heroId === 'liru' && tgt.alive) tgt.statuses.wine = { turns: 3, total: 0, src: u.uid, pct: u.hero.v1 };
        break;
      }
      case 'leap': {
        let jumps = 0, maxJ = 2, target = tgt, bonus = false;
        while (jumps < maxJ) {
          if (!target || !target.alive || this.dist(u, target) > 4) break;
          let placed = this.dist(u, target) <= 1;
          if (!placed) for (let dx = -1; dx <= 1 && !placed; dx++) for (let dy = -1; dy <= 1 && !placed; dy++) if (this.freeCell(target.x + dx, target.y + dy)) { this.teleport(u, target.x + dx, target.y + dy); this.ev({ t: 'move', uid: u.uid, path: [[u.x, u.y]] }); placed = true; }
          if (!placed) break;
          this.hit(u, target, 1.5, { skill: name });
          if (target.alive) { if (u.heroId === 'zhangliao') { for (const e of enemiesNear(u, 2, 8)) this.damage(u, e, u.atk * u.hero.v1 / 100, { fixed: true, skill: '장료' }); u.statuses.guardred = { turns: 1, pct: 50 }; } break; }
          jumps++; if (jumps >= maxJ && u.special && !bonus && chance(85)) { maxJ++; bonus = true; }
          target = this.selectTarget(u);
        }
        break;
      }
      case 'charge': {
        u.flags.charging = true;
        let mult = 0.4 + 0.05 * lv; if (u.heroId === 'lvbu') mult *= (1 + u.hero.v1 / 100);
        const ts = enemiesNear(tgt, 3, 20); if (!ts.includes(tgt)) ts.unshift(tgt);
        for (const e of ts) this.hit(u, e, mult * (this.dist(e, tgt) <= 1 ? 1.3 : 1), { skill: name });
        u.flags.charging = false; break;
      }
      case 'sweep': { const ts = [tgt, ...this.enemiesOf(u).filter(e => e !== tgt && cheb(e, tgt) <= 1 && this.dist(u, e) <= 1).slice(0, 2)]; for (const e of ts) this.hit(u, e, 1.1, { skill: name }); break; }
      case 'breakthrough': { this.hit(u, tgt, 1.3, { skill: name }); if (tgt.alive) { if (!this.pushBack(tgt, u)) this.addStatus(tgt, 'stun', 1); } break; }
      case 'hitrun': {
        this.hit(u, tgt, 1.2, { skill: name, ranged: true });
        const dx = Math.sign(u.x - tgt.x), dy = Math.sign(u.y - tgt.y);
        for (let i = 2; i >= 1; i--) { const nx = u.x + dx * i, ny = u.y + dy * i; if (this.freeCell(nx, ny)) { this.teleport(u, nx, ny); this.ev({ t: 'move', uid: u.uid, path: [[nx, ny]] }); break; } }
        break;
      }
      default: this.hit(u, tgt, 1, { skill: name });
    }
  }
}

/* 영웅 효과 수치 (등급 반영) — v1: 설명의 범위에서 등급 비율로 결정 */
const HERO_RANGES = {
  jindo: [40,80], zhaoyun: [10,20], yangmiaozhen: [20,50], zhanghe: [10,30], qinliangyu: [100,150], baiqi: [50,100], zhouyu: [20,40], limu: [30,50],
  lisiye: [5,15], yujin: [50,100], jiangwei: [5,10], lvmeng: [20,50], xinqiji: [30,50], wenyang: [40,70], dianwei: [20,50], qinqiong: [15,30],
  xusheng: [10,30], yuejin: [20,40], caoren: [20,50], zhoutai: [10,30], weixiaokuan: [20,50], zhangfei: [20,50], gaoshun: [10,30], huanggai: [20,50], lianpo: [50,100], caocao: [10,20], dengai: [10,30], menghuo: [10,20],
  huangzhong: [15,30], handang: [30,50], liubei: [10,20], liucong: [20,50], wangyi: [40,80], liru: [20,50], yangyouji: [10,30], sunquan: [10,30], yanghongyu: [10,15], caoxiu: [10,30], sunshangxiang: [10,30], luxun: [20,50],
  zhangliao: [20,50], lvbu: [30,60], xiangyu: [0,0], machao: [0,0],
};

// 간이 전투 (UI 없이 결과만): 공격군/수비군 spec 배열
function quickBattle(aSpecs, dSpecs, opts) {
  const A = aSpecs.map(s => makeBattleUnit('A', s));
  const D = dSpecs.map(s => makeBattleUnit('D', s));
  return new Battle(A, D, opts || {}).run();
}
