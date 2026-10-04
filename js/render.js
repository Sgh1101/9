/* ============================================================
   렌더러 — 픽셀 스프라이트, 월드맵 캔버스, 전투 재생
   ============================================================ */
'use strict';

/* 픽셀 아트 스프라이트 (문자열 맵 → 오프스크린 캔버스) */
const PAL = { '.': null, k: '#1b1a24', w: '#f4efe6', r: '#c9413a', R: '#8f2a25', g: '#5f9e3c', G: '#36652a', b: '#4f80c9', B: '#2b4f85', y: '#e9c04a', Y: '#a8821f', o: '#d8894a', O: '#8c5428', s: '#8d8d99', S: '#55555f', t: '#b7865a', T: '#6f4b2b', p: '#c58ad8', n: '#e9b893', m: '#6b4f3b', q: '#d9d2bf', c: '#8fd4ea', f: '#f08a3c', e: '#2e2e38' };
const SPR = {
  tree:   ['...GG...','..GgGG..','.GgggGG.','GggggGGG','.GgGGGG.','..GGGG..','...TT...','...TT...'],
  pine:   ['...G....','..GgG...','..GgG...','.GggGG..','.GgGGG..','GggGGGG.','...TT...','...TT...'],
  rock:   ['........','...ss...','..sqss..','.sqqsss.','.sqssSS.','ssssSSS.','.SSSSS..','........'],
  wheat:  ['.y..y.y.','y.yy.y.y','.y.yy.y.','y.y..y.y','.y.y.y..','..y.y.y.','..y.y.y.','..T.T.T.'],
  capital:['...rr...','..rRRr..','.sqqqqs.','.sqkkqs.','sqqqqqqs','sqkqqkqs','sqkqqkqs','SSSSSSSS'],
  fort:   ['s.ss.ss.','ssssssss','.sqqqqs.','.sqkkqs.','.sqqqqs.','.sqkkqs.','.SSSSSS.','........'],
  ruin:   ['..p..p..','.pqp.pq.','.pqqqqp.','pqkqqkqp','pqqqqqqp','.pkqqkp.','.ppqqpp.','..SSSS..'],
  boar:   ['........','..mm....','.mmmmm..','mmkmmmm.','mmmmmmmw','.mm.mm..','.T..T...','........'],
  wolf:   ['........','.s......','.ss.ssss','.ssksss.','..sssss.','..ss.ss.','..S..S..','........'],
  tiger:  ['........','.oo.oooo','.okoooko','ooooooo.','.ookooo.','.oo.oo..','.O..O...','........'],
  bear:   ['........','.mm..mm.','.mmmmmm.','.mkmmkm.','mmmmmmmm','.mmmmmm.','.mm..mm.','........'],
  bandit: ['...kk...','..kkkk..','..nknk..','..nnnn..','.rrrrrr.','.rrrrrr.','..k..k..','..T..T..'],
  giant:  ['...tttt..','.tttttttt','ttktttktt','ttttttttt','.ttttttt.','tt.tttt.t','tt..tt..t','.T..TT..T'],
  // 병사
  spear:  ['...y....','...y.nn.','...y.kn.','...yrrr.','..rryrr.','...yrr..','...k.k..','...T.T..'],
  shield: ['..nn....','..kn.bbb','..nn.bbb','.rrr.bbb','.rrr.bbb','.rrr.bbb','..k.k...','..T.T...'],
  bow:    ['.y..nn..','.yy.kn..','..y.nn..','..yggg..','.y.ggg..','.y.gg...','...k.k..','...T.T..'],
  cav:    ['....nn..','...rkn..','..rrrr..','.mmmmmmm','mmmmmmmm','.mm..mm.','.T...T..','........'],
  siege:  ['........','..TTTT..','.TqqqqT.','.TqTTqT.','TTTTTTTT','.TT..TT.','.SS..SS.','........'],
  pet:    ['........','..gg.gg.','..ggggg.','..gkgkg.','.gggggg.','..gggg..','..G..G..','........'],
};
const spriteCache = {};
function sprite(name, size = 16, tint) {
  const key = name + size + (tint || '');
  if (spriteCache[key]) return spriteCache[key];
  const rows = SPR[name]; if (!rows) return null;
  const c = document.createElement('canvas'); c.width = size; c.height = size; const g = c.getContext('2d');
  const w = rows[0].length, h = rows.length; const px = size / Math.max(w, h);
  rows.forEach((row, y) => { [...row].forEach((ch, x) => { const col = PAL[ch]; if (!col) return; g.fillStyle = col; g.fillRect(Math.floor(x * px), Math.floor(y * px), Math.ceil(px), Math.ceil(px)); }); });
  if (tint) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = tint; g.globalAlpha = 0.35; g.fillRect(0, 0, size, size); }
  spriteCache[key] = c; return c;
}
const MON_SPRITE = { boar: 'boar', wolf: 'wolf', cheetah: 'wolf', skunk: 'wolf', hedgehog: 'boar', bison: 'bear', tiger: 'tiger', lion: 'tiger', elephant: 'bear', bear: 'bear', lizard: 'wolf', hornet: 'wolf' };
function monsterSprite(id) { if (id.startsWith('b_')) return 'bandit'; if (id.startsWith('g_')) return 'giant'; return MON_SPRITE[id] || 'boar'; }

/* ── 월드맵 ───────────────────────────────────────────── */
const TERRAIN = {
  plain:  ['#79a94d', '#6f9f45', '#86b556'], forest: ['#4e8a3e', '#457f38', '#56944a'], hill: ['#9c8f6c', '#8f8363', '#a89b76'], capital: ['#8c7a62', '#8c7a62', '#8c7a62'], ruin: ['#7c6f8a', '#7c6f8a', '#7c6f8a'],
};
const cam = { x: 150, y: 150, zoom: 1.6, dragging: false, lx: 0, ly: 0, moved: 0, base: 20 };
let mapCanvas, mapCtx;
function tileSize() { return cam.base * cam.zoom; }
function worldToScreen(x, y) { const ts = tileSize(); return [(x - cam.x) * ts + mapCanvas.width / 2, (y - cam.y) * ts + mapCanvas.height / 2]; }
function screenToWorld(sx, sy) { const ts = tileSize(); return [Math.floor((sx - mapCanvas.width / 2) / ts + cam.x), Math.floor((sy - mapCanvas.height / 2) / ts + cam.y)]; }

function drawMap(selected) {
  const ctx = mapCtx, W = mapCanvas.width, H = mapCanvas.height, ts = tileSize();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1b2a1c'; ctx.fillRect(0, 0, W, H);
  const [x0, y0] = screenToWorld(0, 0), [x1, y1] = screenToWorld(W, H);
  const s = season(); const sz = Math.max(8, Math.floor(ts));
  const sprSize = sz >= 24 ? 32 : 16;
  if (ts < 7) { const [ox, oy] = worldToScreen(0, 0); ctx.drawImage(Overview.canvas(), ox, oy, G.N * ts, G.N * ts); for (const f of Object.values(G.factions)) if (f.cap) { const [sx, sy] = worldToScreen(f.cap[0], f.cap[1]); ctx.fillStyle = f.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.fillRect(sx - 5, sy - 5, 10, 10); ctx.strokeRect(sx - 5, sy - 5, 10, 10); } }
  else for (let y = Math.max(0, y0); y <= Math.min(G.N - 1, y1 + 1); y++) for (let x = Math.max(0, x0); x <= Math.min(G.N - 1, x1 + 1); x++) {
    const t = tileAt(x, y); const [sx, sy] = worldToScreen(x, y);
    const base = TERRAIN[t.type] || TERRAIN.plain; let col = base[t.deco % 3];
    if (s.id === 'winter' && t.type !== 'capital' && t.type !== 'ruin') col = t.type === 'forest' ? '#6e8f7c' : t.type === 'hill' ? '#b7b5ad' : '#c8d2c8';
    if (s.id === 'autumn' && t.type === 'plain') col = ['#b59a46', '#ad9240', '#bda350'][t.deco % 3];
    ctx.fillStyle = col; ctx.fillRect(sx, sy, ts + 0.5, ts + 0.5);
    // 레벨 음영
    if (t.lv >= 3 && t.type !== 'capital') { ctx.fillStyle = `rgba(20,10,30,${(t.lv - 2) * 0.09})`; ctx.fillRect(sx, sy, ts + 0.5, ts + 0.5); }
    // 소유 색
    if (t.owner) { const f = G.factions[t.owner]; ctx.fillStyle = f.color; ctx.globalAlpha = 0.28; ctx.fillRect(sx, sy, ts + 0.5, ts + 0.5); ctx.globalAlpha = 1;
      // 국경선
      ctx.strokeStyle = f.color; ctx.lineWidth = Math.max(1, ts * 0.08);
      const nb = (dx, dy) => { const n = tileAt(x + dx, y + dy); return !n || n.owner !== t.owner; };
      ctx.beginPath();
      if (nb(0, -1)) { ctx.moveTo(sx, sy + 1); ctx.lineTo(sx + ts, sy + 1); }
      if (nb(0, 1)) { ctx.moveTo(sx, sy + ts - 1); ctx.lineTo(sx + ts, sy + ts - 1); }
      if (nb(-1, 0)) { ctx.moveTo(sx + 1, sy); ctx.lineTo(sx + 1, sy + ts); }
      if (nb(1, 0)) { ctx.moveTo(sx + ts - 1, sy); ctx.lineTo(sx + ts - 1, sy + ts); }
      ctx.stroke(); }
    // 장식 / 스프라이트
    if (ts >= 10) {
      const pad = ts * 0.12, ss = ts - pad * 2;
      if (t.type === 'forest') ctx.drawImage(sprite(t.deco % 2 ? 'pine' : 'tree', sprSize), sx + pad, sy + pad, ss, ss);
      else if (t.type === 'hill') ctx.drawImage(sprite('rock', sprSize), sx + pad, sy + pad, ss, ss);
      else if (t.type === 'plain' && t.owner) ctx.drawImage(sprite('wheat', sprSize), sx + pad, sy + pad, ss, ss);
      else if (t.type === 'plain' && t.deco % 3 === 0) { ctx.fillStyle = 'rgba(40,80,30,0.35)'; ctx.fillRect(sx + ts * 0.3, sy + ts * 0.55, ts * 0.12, ts * 0.2); ctx.fillRect(sx + ts * 0.6, sy + ts * 0.35, ts * 0.12, ts * 0.2); }
      if (t.type === 'capital') ctx.drawImage(sprite('capital', sprSize), sx, sy, ts, ts);
      if (t.type === 'ruin') ctx.drawImage(sprite('ruin', sprSize), sx, sy, ts, ts);
      if (t.fort) ctx.drawImage(sprite('fort', sprSize), sx, sy, ts, ts);
      if (t.monsters && t.monsters.length && !t.owner && ts >= 16) {
        const m = t.monsters[0]; const ms = ts * 0.55;
        ctx.drawImage(sprite(monsterSprite(m.id), 16), sx + ts - ms - 1, sy + ts - ms - 1, ms, ms);
        if (t.monsters.length > 1 && ts >= 28) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx + ts - 14, sy + 2, 12, 11); ctx.fillStyle = '#fff'; ctx.font = `bold 9px monospace`; ctx.fillText(t.monsters.length, sx + ts - 11, sy + 11); }
      }
      if (t.giant) { const [gx, gy] = worldToScreen(x - 1, y - 1); ctx.drawImage(sprite('giant', 32), gx + ts * 0.3, gy + ts * 0.3, ts * 2.4, ts * 2.4); }
      // 보호
      if (t.protect > G.time && ts >= 14) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.setLineDash([2, 2]); ctx.strokeRect(sx + 2, sy + 2, ts - 4, ts - 4); ctx.setLineDash([]); }
      // 레벨 표기 (유적은 유적 레벨)
      if (ts >= 36 && t.type !== 'capital' && !t.owner) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(sx + 2, sy + 2, 11, 11); ctx.fillStyle = t.lv >= 4 ? '#ffb347' : '#fff'; ctx.font = `bold 9px monospace`; ctx.fillText(t.ruin ? 'R' : t.lv, sx + 4, sy + 11); }
      if (ts >= 30 && t.ruin && t.owner) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx + 2, sy + 2, 20, 11); ctx.fillStyle = '#c58ad8'; ctx.font = `bold 9px monospace`; ctx.fillText('R' + t.ruin, sx + 4, sy + 11); }
    }
  }
  // 거대 야수 영역 윤곽
  for (const g of G.giants) if (!g.dead) { const [sx, sy] = worldToScreen(g.x - 1, g.y - 1); if (sx < -ts * 3 || sy < -ts * 3 || sx > W || sy > H) continue; ctx.strokeStyle = 'rgba(255,80,80,0.8)'; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, ts * 3, ts * 3); }
  // 부대
  for (const a of (typeof NET !== 'undefined' && NET.armies ? G.armies.concat(NET.armies()) : G.armies)) {
    const [sx, sy] = worldToScreen(a.x, a.y); const f = G.factions[a.owner] || { color: '#999' }; if (sx < -ts || sy < -ts || sx > W || sy > H) continue;
    if (a.state !== 'wait') { const [fx, fy] = worldToScreen(a.from[0], a.from[1]), [tx, ty] = worldToScreen(a.to[0], a.to[1]); ctx.strokeStyle = f.color; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(fx + ts / 2, fy + ts / 2); ctx.lineTo(tx + ts / 2, ty + ts / 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(sx + ts / 2, sy + ts / 2, Math.max(4, ts * 0.3), 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1b1a24'; ctx.lineWidth = 2; ctx.stroke();
    const cls = (() => { const s0 = a.owner === 'P' ? soldierById(a.units[0]) : null; return s0 ? UNITS[s0.type].cls : 'spear'; })();
    const sp = sprite(cls, 16); if (sp) ctx.drawImage(sp, sx + ts * 0.2, sy + ts * 0.2, ts * 0.6, ts * 0.6);
  }
  // 선택
  if (selected) { const [sx, sy] = worldToScreen(selected[0], selected[1]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(sx + 1, sy + 1, ts - 2, ts - 2); ctx.strokeStyle = '#f2c94c'; ctx.strokeRect(sx - 1, sy - 1, ts + 2, ts + 2); }
  // 미니맵
  const mm = 120, mx = W - mm - 8, my = H - mm - 8, ms = mm / G.N;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(mx - 2, my - 2, mm + 4, mm + 4);
  ctx.drawImage(Overview.canvas(), mx, my, mm, mm);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; const vw = W / ts * ms, vh = H / ts * ms; ctx.strokeRect(mx + (cam.x - W / ts / 2) * ms, my + (cam.y - H / ts / 2) * ms, vw, vh);
}

/* ── 전투 재생 ─────────────────────────────────────────── */
const BR = { canvas: null, ctx: null, units: {}, events: [], idx: 0, timer: null, speed: 1, floats: [], done: false, onDone: null, fx: [] };
function battleCell(x, y) { const W = BR.canvas.width, H = BR.canvas.height; const cw = W / BW, ch = H / BH; return [x * cw, y * ch, cw, ch]; }
function startReplay(canvas, events, onDone) {
  BR.canvas = canvas; BR.ctx = canvas.getContext('2d'); BR.events = events; BR.idx = 0; BR.units = {}; BR.floats = []; BR.done = false; BR.onDone = onDone; BR.fx = []; BR.round = 0;
  if (BR.timer) clearTimeout(BR.timer);
  stepReplay();
}
function stepReplay() {
  if (BR.idx >= BR.events.length) { BR.done = true; drawBattle(); if (BR.onDone) BR.onDone(); return; }
  const e = BR.events[BR.idx++]; let delay = 0;
  switch (e.t) {
    case 'init': for (const u of e.units) BR.units[u.uid] = { ...u, alive: true, statuses: {} }; delay = 300; break;
    case 'spawn': BR.units[e.unit.uid] = { ...e.unit, alive: true, statuses: {} }; delay = 200; break;
    case 'round': BR.round = e.n; delay = 120; break;
    case 'move': { const u = BR.units[e.uid]; if (u) { const last = e.path[e.path.length - 1]; u.x = last[0]; u.y = last[1]; } delay = 90; break; }
    case 'attack': { const u = BR.units[e.uid], t = BR.units[e.tid]; if (u && t) { BR.fx.push({ kind: 'line', from: [u.x, u.y], to: [t.x, t.y], until: Date.now() + 160, skill: !!e.skill }); if (e.skill) BR.floats.push({ x: u.x, y: u.y - 0.4, text: e.skill, col: '#f2c94c', until: Date.now() + 700, big: true }); } delay = e.skill ? 220 : 110; break; }
    case 'dmg': { const u = BR.units[e.uid]; if (u) { u.hp = e.hp; BR.floats.push({ x: u.x, y: u.y, text: '-' + e.amount, col: e.crit ? '#ff9f3c' : e.fixed ? '#c58ad8' : '#ff5a5a', until: Date.now() + 650 }); } delay = 70; break; }
    case 'heal': { const u = BR.units[e.uid]; if (u) { u.hp = e.hp; BR.floats.push({ x: u.x, y: u.y, text: '+' + e.amount, col: '#7ee081', until: Date.now() + 650 }); } delay = 50; break; }
    case 'shield': { const u = BR.units[e.uid]; if (u) u.shield = e.shield; delay = 20; break; }
    case 'dodge': { const u = BR.units[e.uid]; if (u) BR.floats.push({ x: u.x, y: u.y, text: '회피', col: '#8fd4ea', until: Date.now() + 600 }); delay = 60; break; }
    case 'status': { const u = BR.units[e.uid]; if (u) { if (e.on) { u.statuses[e.id] = true; BR.floats.push({ x: u.x, y: u.y + 0.3, text: STATUS_NAMES[e.id] || e.id, col: '#e9b893', until: Date.now() + 600 }); } else delete u.statuses[e.id]; } delay = 30; break; }
    case 'skip': delay = 60; break;
    case 'die': { const u = BR.units[e.uid]; if (u) { u.alive = false; BR.fx.push({ kind: 'die', x: u.x, y: u.y, until: Date.now() + 300 }); } delay = 150; break; }
    case 'log': if (typeof onBattleLog === 'function') onBattleLog(e); delay = 0; break;
    case 'end': delay = 200; break;
  }
  drawBattle();
  BR.timer = setTimeout(stepReplay, delay / BR.speed);
}
function skipReplay() { if (BR.timer) clearTimeout(BR.timer); while (BR.idx < BR.events.length) { const e = BR.events[BR.idx++]; if (e.t === 'init') for (const u of e.units) BR.units[u.uid] = { ...u, alive: true, statuses: {} }; if (e.t === 'spawn') BR.units[e.unit.uid] = { ...e.unit, alive: true, statuses: {} }; if (e.t === 'move') { const u = BR.units[e.uid]; if (u) { const l = e.path[e.path.length - 1]; u.x = l[0]; u.y = l[1]; } } if (e.t === 'dmg' || e.t === 'heal') { const u = BR.units[e.uid]; if (u) u.hp = e.hp; } if (e.t === 'die') { const u = BR.units[e.uid]; if (u) u.alive = false; } if (e.t === 'log' && typeof onBattleLog === 'function') onBattleLog(e); } BR.floats = []; BR.fx = []; BR.done = true; drawBattle(); if (BR.onDone) BR.onDone(); }

function drawBattle() {
  const ctx = BR.ctx, W = BR.canvas.width, H = BR.canvas.height; if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const cw = W / BW, ch = H / BH;
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) { ctx.fillStyle = (x + y) % 2 ? '#6f9f45' : '#79a94d'; if (x < 5) ctx.fillStyle = (x + y) % 2 ? '#6b9a4a' : '#75a452'; ctx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5); }
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(5 * cw - 1, 0, 2, H); ctx.fillRect(9 * cw - 1, 0, 2, H);
  const now = Date.now();
  for (const u of Object.values(BR.units)) {
    if (!u.alive) continue;
    const size = u.isGiant ? 3 : 1; const px = (u.x - (u.isGiant ? 1 : 0)) * cw, py = (u.y - (u.isGiant ? 1 : 0)) * ch, pw = cw * size, ph = ch * size;
    const col = u.side === 'A' ? '#f2c94c' : '#e05d5d';
    ctx.fillStyle = col; ctx.globalAlpha = 0.25; ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2); ctx.globalAlpha = 1;
    const sp = u.isBuilding ? sprite('fort', 32) : u.monsterId ? sprite(monsterSprite(u.monsterId), 32, u.side === 'A' ? '#f2c94c' : null) : sprite(u.cls, 32, u.side === 'D' ? '#e05d5d' : null);
    if (sp) ctx.drawImage(sp, px + pw * 0.08, py + ph * 0.02, pw * 0.84, ph * 0.74);
    // HP 바
    const hpw = pw - 4, hpr = Math.max(0, u.hp / u.maxHp);
    ctx.fillStyle = '#1b1a24'; ctx.fillRect(px + 2, py + ph - 6, hpw, 4);
    ctx.fillStyle = hpr > 0.5 ? '#7ee081' : hpr > 0.25 ? '#e9c04a' : '#ff5a5a'; ctx.fillRect(px + 2, py + ph - 6, hpw * hpr, 4);
    if (u.shield > 0) { ctx.fillStyle = '#8fd4ea'; ctx.fillRect(px + 2, py + ph - 8, hpw * Math.min(1, u.shield / u.maxHp), 2); }
    if (u.hero && ch > 30) { ctx.fillStyle = '#fff'; ctx.font = `${Math.floor(ch * 0.22)}px sans-serif`; ctx.fillText(u.hero, px + 2, py + ch * 0.24); }
    for (const k of Object.keys(u.statuses)) { if (['stun', 'fear', 'poison', 'bleed', 'burn', 'disarm', 'taunted'].includes(k)) { ctx.fillStyle = '#e9b893'; ctx.fillRect(px + pw - 6, py + 2, 4, 4); break; } }
  }
  for (const f of BR.fx) { if (f.until < now) continue; if (f.kind === 'line') { ctx.strokeStyle = f.skill ? '#f2c94c' : 'rgba(255,255,255,0.7)'; ctx.lineWidth = f.skill ? 3 : 1.5; ctx.beginPath(); ctx.moveTo(f.from[0] * cw + cw / 2, f.from[1] * ch + ch / 2); ctx.lineTo(f.to[0] * cw + cw / 2, f.to[1] * ch + ch / 2); ctx.stroke(); } if (f.kind === 'die') { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(f.x * cw, f.y * ch, cw, ch); } }
  BR.fx = BR.fx.filter(f => f.until >= now);
  ctx.textAlign = 'center';
  for (const f of BR.floats) { if (f.until < now) continue; const a = (f.until - now) / 650; ctx.globalAlpha = Math.min(1, a + 0.2); ctx.fillStyle = f.col; ctx.font = `bold ${f.big ? Math.floor(ch * 0.32) : Math.floor(ch * 0.3)}px sans-serif`; ctx.fillText(f.text, f.x * cw + cw / 2, f.y * ch + ch * 0.4 - (1 - a) * 12); ctx.globalAlpha = 1; }
  BR.floats = BR.floats.filter(f => f.until >= now); ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, 70, 18); ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText('턴 ' + (BR.round || 0), 6, 13);
  if (!BR.done && (BR.floats.length || BR.fx.length)) requestAnimationFrame(() => { if (!BR.done) drawBattle(); });
}

/* ── 2D 대체 화면 (WebGL을 쓸 수 없을 때) ─────────────────── */
/* ── 섬 전체 그림 (300×300 → 한 칸 = 1픽셀) ─────────────── */
const Overview = {
  base: null, img: null, key: '', ver: -1, at: 0,
  COL: { plain: [143, 212, 104], forest: [95, 174, 79], hill: [194, 162, 119], capital: [230, 214, 180], ruin: [181, 154, 224] },
  canvas() {
    const N = TER.N, k = G.seed + '|' + (TER.ver || 0);
    if (!this.base || this.key !== k) {
      const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const id = g.createImageData(N, N); const d = id.data;
      for (let i = 0; i < N * N; i++) { const col = this.COL[TYPES[TER.type[i]]]; const dk = 1 - (TER.lv[i] - 1) * 0.07 - (TER.deco[i] % 3) * 0.02; d[i * 4] = col[0] * dk; d[i * 4 + 1] = col[1] * dk; d[i * 4 + 2] = col[2] * dk; d[i * 4 + 3] = 255; }
      g.putImageData(id, 0, 0); this.base = { c, data: id }; this.key = k; this.ver = -1;
      this.img = document.createElement('canvas'); this.img.width = this.img.height = N;
    }
    const now = performance.now();
    if (this.ver !== G.ver && now - this.at > 400) {
      this.ver = G.ver; this.at = now;
      const g = this.img.getContext('2d'); const id = new ImageData(new Uint8ClampedArray(this.base.data.data), N, N); const d = id.data;
      for (const fid of Object.keys(OWNED)) {
        const f = G.factions[fid]; if (!f) continue; const h = f.color; const r = parseInt(h.slice(1, 3), 16), gg = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
        for (const i of OWNED[fid]) { d[i * 4] = d[i * 4] * 0.25 + r * 0.75; d[i * 4 + 1] = d[i * 4 + 1] * 0.25 + gg * 0.75; d[i * 4 + 2] = d[i * 4 + 2] * 0.25 + b * 0.75; }
      }
      g.putImageData(id, 0, 0);
    }
    return this.img;
  },
};

/* ── 요새 안 (WebGL이 없을 때 쓰는 2D 그림) ─────────────── */
const Base2D = {
  c: null, cv: null, ghost: null, sel: null, ready: true,
  init(container) { this.c = container; this.cv = mapCanvas; return true; },
  build() {}, resize() {}, focus() {}, panBy() {}, zoomBy() {}, rotateBy() {}, setActive() {},
  layout() { const W = mapCanvas.width, H = mapCanvas.height; const cs = Math.floor(Math.min(W * 0.9 / BASE.W, (H - 260) / BASE.H)); return { cs, ox: (W - cs * BASE.W) / 2, oy: Math.max(150, (H - cs * BASE.H) / 2) }; },
  frame() {
    const ctx = mapCtx, W = mapCanvas.width, H = mapCanvas.height, { cs, ox, oy } = this.layout();
    ctx.fillStyle = '#86c95a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#efe9de'; ctx.fillRect(ox - 10, oy - 10, cs * BASE.W + 20, cs * BASE.H + 20);
    ctx.fillStyle = '#e9e2d3'; ctx.fillRect(ox, oy, cs * BASE.W, cs * BASE.H);
    const R = BASE.RALLY; ctx.fillStyle = '#f2dca6'; ctx.fillRect(ox + R.x * cs, oy + R.y * cs, R.w * cs, R.h * cs);
    ctx.strokeStyle = '#ddd5c4'; for (let i = 0; i <= BASE.W; i++) { ctx.beginPath(); ctx.moveTo(ox + i * cs, oy); ctx.lineTo(ox + i * cs, oy + BASE.H * cs); ctx.stroke(); ctx.beginPath(); ctx.moveTo(ox, oy + i * cs); ctx.lineTo(ox + BASE.W * cs, oy + i * cs); ctx.stroke(); }
    const B = G.player.base; const draw = (key, kind, fp, lv) => { ctx.fillStyle = kind === 'capital' ? G.factions.P.color : BASE_EXTRAS[kind] ? '#cfe9c0' : '#fff3cf'; ctx.fillRect(ox + fp.x * cs + 2, oy + fp.y * cs + 2, fp.w * cs - 4, fp.h * cs - 4); ctx.fillStyle = '#33305a'; ctx.font = `${Math.max(10, cs * 0.28)}px sans-serif`; ctx.textAlign = 'center'; const nm = kind === 'capital' ? '본관' : BUILDINGS[kind] ? BUILDINGS[kind].name : BASE_EXTRAS[kind].name; ctx.fillText(nm, ox + (fp.x + fp.w / 2) * cs, oy + (fp.y + fp.h / 2) * cs); if (!BASE_EXTRAS[kind] || kind === 'tower') ctx.fillText('Lv' + lv, ox + (fp.x + fp.w / 2) * cs, oy + (fp.y + fp.h / 2) * cs + cs * 0.34); };
    for (const [id, at] of Object.entries(B.layout)) draw(id, id, footprint(id, at), G.player.buildings[id] || 0);
    B.extras.forEach((e, k) => draw('x' + k, e.id, footprint(e.id, [e.x, e.y]), e.lv));
    ctx.textAlign = 'left';
    if (this.ghost) { const fp = footprint(this.ghost.kind, [this.ghost.x, this.ghost.y]); ctx.fillStyle = this.ghost.ok ? 'rgba(95,224,143,.5)' : 'rgba(255,111,125,.5)'; ctx.fillRect(ox + fp.x * cs, oy + fp.y * cs, fp.w * cs, fp.h * cs); }
    if (this.sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(ox + this.sel.x * cs, oy + this.sel.y * cs, this.sel.w * cs, this.sel.h * cs); ctx.lineWidth = 1; }
  },
  pick(cx, cy) { const r = mapCanvas.getBoundingClientRect(); const { cs, ox, oy } = this.layout(); const x = Math.floor((cx - r.left - ox) / cs), y = Math.floor((cy - r.top - oy) / cs); if (x < 0 || y < 0 || x >= BASE.W || y >= BASE.H) return null; const R = BASE.RALLY; return { x, y, key: baseCells().get(x + ',' + y) || null, rally: x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h }; },
  setGhost(kind, x, y, ok) { this.ghost = kind ? { kind, x, y, ok } : null; },
  select(fp) { this.sel = fp || null; },
  cellToScreen(x, y) { const r = mapCanvas.getBoundingClientRect(); const { cs, ox, oy } = this.layout(); return [r.left + ox + (x + 0.5) * cs, r.top + oy + (y + 0.5) * cs]; },
};

const Map2D = {
  c: null,
  init(container) { mapCanvas = document.createElement('canvas'); mapCanvas.className = 'stage-canvas'; container.appendChild(mapCanvas); mapCtx = mapCanvas.getContext('2d'); this.c = container; this.resize(); return true; },
  build() { cam.x = G.factions.P.cap[0] + 0.5; cam.y = G.factions.P.cap[1] + 0.5; },
  resize() { if (!this.c) return; mapCanvas.width = this.c.clientWidth; mapCanvas.height = this.c.clientHeight; },
  frame(dt, sel) { drawMap(sel); },
  pick(cx, cy) { const r = mapCanvas.getBoundingClientRect(); const [x, y] = screenToWorld(cx - r.left, cy - r.top); return tileAt(x, y) ? [x, y] : null; },
  panBy(dx, dy) { const ts = tileSize(); cam.x = clamp(cam.x - dx / ts, 0, G.N); cam.y = clamp(cam.y - dy / ts, 0, G.N); },
  zoomBy(f) { cam.zoom = clamp(cam.zoom / f, 0.04, 3.5); }, zoomAll() { cam.zoom = 0.05; cam.x = G.N / 2; cam.y = G.N / 2; }, zoomTo() { cam.zoom = 1.6; }, get far() { return cam.zoom < 0.3; },
  rotateBy() {}, orbit() {}, setQuality() {}, getQuality() { return 'low'; },
  focus(x, y) { cam.x = x + 0.5; cam.y = y + 0.5; },
  center() { return [Math.floor(cam.x), Math.floor(cam.y)]; }, setActive() {},
  ready: true,
};
const Battle2D = {
  open(container, res, o) {
    container.innerHTML = ''; const cv = document.createElement('canvas'); const w = Math.max(280, container.clientWidth); const cell = Math.max(20, Math.floor(w / BW));
    cv.width = cell * BW; cv.height = cell * BH; container.appendChild(cv); BR.speed = 1;
    startReplay(cv, res.events, () => { if (o.onDone) { const e = res.events.find(x => x.t === 'end'); o.onDone(e ? e.winner : 'draw'); } });
    return true;
  },
  skip() { skipReplay(); }, setSpeed(s) { BR.speed = s; }, close() { if (BR.timer) clearTimeout(BR.timer); BR.done = true; }, resize() {},
};
