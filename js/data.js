/* ============================================================
   9만 에이커 Web — 게임 데이터
   병종 / 영웅 / 장비 / 몬스터 / 건물 / 초상화 확률표
   (출처: 업로드된 분석 문서. 문서에 수치가 없는 병종은 역할 기반 추정치)
   ============================================================ */
'use strict';

const CLASS_INFO = {
  spear:  { name: '창병',   speed: 62, color: '#e8c170' },
  shield: { name: '방패병', speed: 62, color: '#7fb8e6' },
  bow:    { name: '궁병',   speed: 62, color: '#9ad17a' },
  cav:    { name: '기병',   speed: 74, color: '#e49a7a' },
  siege:  { name: '병기',   speed: 46, color: '#b9a6d8' },
};

// 레벨 성장 (문서 수치가 있는 병종은 명시 배열, 없는 병종은 ×1.24 성장)
function grow(base, g = 1.24) {
  const out = [];
  for (let i = 0; i < 6; i++) out.push(Math.round(base * Math.pow(g, i)));
  return out;
}

// 병종 정의
// move: 이동, range: 사거리, food: 식량 유지(시간당), rage: 최대 분노(null=분노 없음)
// skill: 액티브 스킬 id, est: true면 추정치
const UNITS = {
  // ── 창병 ──
  spear_long:   { name: '장창',   cls: 'spear', hp: [135,167,207,257,319,396], atk: [10,12,15,19,24,30], move: 3, range: 1, food: 2, rage: 4, skill: 'thrust',   desc: '시작 병종. 목표 방향 2칸을 찔러 최대 4명을 공격하고 잃은 HP의 30%를 회복한다.', cost: {food: 60, wood: 20}, unlock: 1 },
  spear_pike:   { name: '긴창',   cls: 'spear', hp: [104,129,160,198,246,305], atk: [12,15,19,24,30,37], move: 3, range: 1, food: 2, rage: 4, skill: 'javelin',  desc: '5칸 안 가장 먼 적에게 창을 던진다.', cost: {food: 70, wood: 25}, unlock: 2 },
  spear_ge:     { name: '장과',   cls: 'spear', hp: [88,109,135,167,207,257],  atk: [8,10,12,15,19,24],   move: 2, range: 2, food: 2, rage: 5, skill: 'disarm',   desc: '창병 중 유일한 사거리 2. 공격하며 3턴간 무장해제(공격력 감소)를 건다.', cost: {food: 70, wood: 30}, unlock: 3 },
  spear_modao:  { name: '맥도',   cls: 'spear', hp: grow(120), atk: grow(14, 1.2457), move: 3, range: 1, food: 3, rage: null, skill: null, passive: 'cleave', est: true, desc: '분노가 없다. 일반 공격이 대상과 인접한 적 최대 2명을 함께 벤다(피해 80~120% 무작위).', cost: {food: 90, wood: 35}, unlock: 6 },
  spear_sword:  { name: '장검',   cls: 'spear', hp: grow(125), atk: grow(11, 1.2457), move: 3, range: 1, food: 3, rage: 5, skill: 'storm',    est: true, desc: '폭풍참: 주변 1칸의 모든 적(최대 8명)을 공격한다.', cost: {food: 90, wood: 35}, unlock: 8 },
  spear_dual:   { name: '쌍창',   cls: 'spear', hp: grow(110), atk: grow(12, 1.2457), move: 4, range: 1, food: 3, rage: 5, skill: 'flurry',   est: true, desc: '난무: 3칸 안 적에게 돌진해 3연타(각 55%)한다.', cost: {food: 95, wood: 40}, unlock: 10 },
  // ── 방패병 ──
  shield_sword: { name: '칼과 방패',   cls: 'shield', hp: [265,326,401,492,606,745], atk: [6,7,9,11,14,17], move: 3, range: 1, food: 3, rage: 12, skill: 'guard', desc: '5칸 안 HP 비율이 가장 낮은 아군에게 3턴 보호막(20+10×Lv)을 건다.', cost: {food: 80, wood: 30, stone: 10}, unlock: 2 },
  shield_spear: { name: '창과 방패',   cls: 'shield', hp: grow(240,1.23), atk: grow(7, 1.2457), move: 3, range: 1, food: 3, rage: 8, skill: 'stance', est: true, desc: '방어 자세: 2턴간 받는 피해 -40%, 근접 공격을 받으면 반격한다.', cost: {food: 85, wood: 30, stone: 15}, unlock: 4 },
  shield_heavy: { name: '무거운 방패', cls: 'shield', hp: grow(300,1.23), atk: grow(5, 1.2457), move: 2, range: 1, food: 3, rage: 10, skill: 'taunt', est: true, desc: '도발: 3칸 안 적 최대 8명이 2턴간 자신만 공격하게 하고 받는 피해 -30%.', cost: {food: 90, wood: 30, stone: 25}, unlock: 6 },
  shield_hammer:{ name: '망치 방패',   cls: 'shield', hp: grow(230,1.23), atk: grow(9, 1.2457), move: 3, range: 1, food: 3, rage: 8, skill: 'smash', est: true, desc: '강타: 150% 피해 + 1턴 기절.', cost: {food: 90, wood: 35, stone: 20}, unlock: 8 },
  shield_axe:   { name: '도끼 방패',   cls: 'shield', hp: grow(220,1.23), atk: grow(10, 1.2457), move: 3, range: 1, food: 3, rage: 8, skill: 'whirl', est: true, desc: '회전베기: 인접한 모든 적에게 90% 피해 + 2턴 출혈.', cost: {food: 95, wood: 40, stone: 20}, unlock: 10 },
  shield_blade: { name: '검과 방패',   cls: 'shield', hp: grow(230,1.23), atk: grow(9, 1.2457), move: 3, range: 1, food: 3, rage: 9, skill: 'execute', est: true, desc: '처형: 120% 피해. 대상 HP가 25% 미만이면 피해 2배.', cost: {food: 95, wood: 40, stone: 20}, unlock: 12 },
  // ── 궁병 ──
  bow_long:     { name: '장궁',     cls: 'bow', hp: [78,86,95,105,116,128], atk: [7,9,11,13,15,17], move: 2, range: 4, food: 3, rage: 6, skill: 'scatter', desc: '분산 사격: 추가로 6칸 안 적 2명에게 (40%+10%×Lv) 피해.', cost: {food: 70, wood: 40}, unlock: 3 },
  bow_cross:    { name: '쇠뇌',     cls: 'bow', hp: grow(80,1.12), atk: grow(9, 1.2), move: 2, range: 3, food: 3, rage: 6, skill: 'volley', est: true, desc: '연사: 대상에게 60% 피해를 3회 연속으로 준다.', cost: {food: 75, wood: 45}, unlock: 5 },
  bow_heavy:    { name: '강화 쇠뇌', cls: 'bow', hp: grow(60,1.12), atk: grow(14, 1.2), move: 1, range: 5, food: 4, rage: 7, skill: 'snipe', est: true, desc: '유리대포. 대상과의 거리 1칸당 피해 +20%(최대 +80%). 저격: 220% 피해.', cost: {food: 90, wood: 60}, unlock: 9 },
  bow_hunter:   { name: '사냥꾼',   cls: 'bow', hp: grow(85,1.12), atk: grow(8, 1.2), move: 3, range: 3, food: 3, rage: 6, skill: 'rally', est: true, desc: '격려: 3칸 안 아군 최대 6명의 공격력 +25% (2턴).', cost: {food: 75, wood: 45}, unlock: 7 },
  bow_fire:     { name: '화궁',     cls: 'bow', hp: grow(75,1.12), atk: grow(9, 1.2), move: 2, range: 4, food: 3, rage: 6, skill: 'firearrow', est: true, desc: '불화살: 대상과 인접 적에게 2턴 화상(턴마다 공격력 40% 고정 피해).', cost: {food: 80, wood: 50}, unlock: 11 },
  bow_poison:   { name: '독궁',     cls: 'bow', hp: grow(75,1.12), atk: grow(8, 1.2), move: 2, range: 4, food: 3, rage: 5, skill: 'poisonarrow', est: true, desc: '독화살: 3턴 독(최대 HP 5%) + 회복량 -30%.', cost: {food: 80, wood: 50}, unlock: 13 },
  // ── 기병 ──
  cav_sword:    { name: '검기병',   cls: 'cav', hp: grow(170), atk: grow(12, 1.2457), move: 4, range: 1, food: 4, rage: 6, skill: 'leap', est: true, desc: '도약베기: 4칸 안 적에게 뛰어들어 150% 피해. 처치하면 한 번 더 도약한다.', cost: {food: 120, wood: 40}, unlock: 1 },
  cav_spear:    { name: '창기병',   cls: 'cav', hp: [186,233,291,364,455,569], atk: [11,14,18,23,29,36], move: 4, range: 1, food: 4, rage: 6, skill: 'charge', desc: '돌진: 대상 주변 3칸 안 최대 20명에게 (40%+5%×Lv) 피해. 1칸 안은 +30%.', cost: {food: 130, wood: 45}, unlock: 3 },
  cav_glaive:   { name: '대도기병', cls: 'cav', hp: grow(180), atk: grow(13, 1.2457), move: 4, range: 1, food: 4, rage: 6, skill: 'sweep', est: true, desc: '횡베기: 대상과 그 양옆 적에게 110% 피해.', cost: {food: 135, wood: 50}, unlock: 5 },
  cav_heavy:    { name: '중기병',   cls: 'cav', hp: grow(260,1.23), atk: grow(10, 1.2457), move: 3, range: 1, food: 5, rage: 7, skill: 'breakthrough', est: true, desc: '돌파: 130% 피해 + 대상을 1칸 밀치고 1턴 기절.', cost: {food: 150, wood: 50, stone: 20}, unlock: 7 },
  cav_bow:      { name: '궁기병',   cls: 'cav', hp: grow(120), atk: grow(10, 1.2457), move: 4, range: 3, food: 4, rage: 5, skill: 'hitrun', est: true, desc: '치고 빠지기: 120% 사격 후 2칸 후퇴.', cost: {food: 130, wood: 60}, unlock: 9 },
  cav_axe:      { name: '도끼기병', cls: 'cav', hp: grow(170), atk: grow(13, 1.2457), move: 4, range: 1, food: 4, rage: null, skill: null, passive: 'bleedhit', est: true, desc: '분노가 없다. 모든 공격이 3턴 출혈(턴당 4+Lv)을 건다.', cost: {food: 140, wood: 50}, unlock: 11 },
  // ── 병기 ──
  siege_cat:    { name: '투석차', cls: 'siege', hp: [50,50,50,50,50,50], atk: [15,15,15,15,15,15], move: 1, range: 5, food: 5, rage: null, skill: null, passive: 'siege', desc: '건물 공격 시 공격력 +2(×거점 레벨 보정). 공성 특화. 버프 대부분이 적용되지 않는다.', cost: {food: 100, wood: 150, stone: 80}, unlock: 1 },
  siege_bal:    { name: '쇠뇌차', cls: 'siege', hp: [50,50,50,50,50,50], atk: [25,25,25,25,25,25], move: 1, range: 5, food: 5, rage: null, skill: null, passive: 'ballista', desc: '공격 시 대상 최대 HP 1% 추가 피해. 야외 몬스터에게는 3배. 해산 시 가속 모집 1회.', cost: {food: 100, wood: 150, stone: 120}, unlock: 3 },
};

const UNIT_ORDER = Object.keys(UNITS);

// 스킬 표시 이름
const SKILL_NAMES = {
  thrust: '찌르기', javelin: '투사', disarm: '무장해제', storm: '폭풍참', flurry: '난무',
  guard: '비호', stance: '방어자세', taunt: '도발', smash: '강타', whirl: '회전베기', execute: '처형',
  scatter: '분산사격', volley: '연사', snipe: '저격', rally: '격려', firearrow: '불화살', poisonarrow: '독화살',
  leap: '도약베기', charge: '돌진', sweep: '횡베기', breakthrough: '돌파', hitrun: '치고빠지기',
};

/* ── 영웅 (초상화) ─────────────────────────────────────────── */
// unit: 공봉 가능 병종, hp/atk: 공봉 시 추가 능력치 범위 (등급이 높을수록 상한에 가까움)
const HEROES = {
  // 창병
  jindo:     { name: '진도',   unit: 'spear_long',  hp: [100,200], atk: [8,16],  desc: '공격 시 아군 방패병 총 공격력의 10%를 추가 피해. 받은 피해의 40~80%를 HP%가 가장 높은 방패병에게 넘긴다.' },
  zhaoyun:   { name: '조운',   unit: 'spear_long',  hp: [150,250], atk: [8,16],  desc: '회피 +10%. 맞을 때마다 회피 +5%(무한 중첩). 회피 성공 시 다음 공격 피해 +10~20%.' },
  yangmiaozhen: { name: '양묘진', unit: 'spear_long', hp: [100,200], atk: [8,16], desc: '찌르기의 첫 대상에게 2턴 표식. 표식 대상 공격 시 최대 HP 15% 고정 피해 + 피해의 20~50% 회복.' },
  zhanghe:   { name: '장합',   unit: 'spear_pike',  hp: [100,200], atk: [8,17],  desc: '투사 피해 +10~30%. 투사로 처치하면 주변 1칸 최대 4명을 2턴 공포.' },
  qinliangyu:{ name: '진양옥', unit: 'spear_pike',  hp: [100,200], atk: [8,16],  desc: '긴창을 던지고 다음 턴 회수. 회수 칸에 적이 없으면 분노 75% 충전, 있으면 100~150% 피해.' },
  baiqi:     { name: '백기',   unit: 'spear_ge',    hp: [100,200], atk: [8,14],  desc: '무장해제의 공격력 감소 50~100%를 주변 4칸 최대 12명에게 3턴 전이.' },
  zhouyu:    { name: '주유',   unit: 'spear_ge',    hp: [100,200], atk: [8,14],  desc: '대상과 2칸 안 최대 8명을 3턴 연결. 한 명이 맞으면 나머지도 20~40% 피해.' },
  limu:      { name: '이목',   unit: 'spear_ge',    hp: [100,200], atk: [8,14],  desc: '무장해제 시 아군 최대 8명이 1턴 이동 불가 + 피해 감소 30%. 이후 3턴 공격력 30~50% 고정 추가 피해.' },
  lisiye:    { name: '이사업', unit: 'spear_modao', hp: [100,200], atk: [8,20],  desc: '사거리 안에서 적이 죽을 때마다 공격 +2, 회피 +3% (최대 5~15중첩).' },
  yujin:     { name: '우금',   unit: 'spear_modao', hp: [100,200], atk: [8,18],  desc: '전투 시작 시 병기 제외 아군의 주는·받는 피해 50~100% 증가 + 디버프 면역. 우금이 죽으면 해제.' },
  jiangwei:  { name: '강유',   unit: 'spear_sword', hp: [125,225], atk: [8,14],  desc: '폭풍참마다 공격 +4, 피해 감소 +6% (최대 5~10중첩).' },
  lvmeng:    { name: '여몽',   unit: 'spear_sword', hp: [125,225], atk: [8,14],  desc: '최대 분노 -50%. 폭풍참 적중마다 보호막 40, 주는 피해 20~50% 증가.' },
  xinqiji:   { name: '신기질', unit: 'spear_sword', hp: [125,225], atk: [8,14],  desc: '첫 3턴 금괴(공격 30~50% 증가, 받는 피해 30% 감소). 이후 공격 3회마다 1턴 금괴.' },
  wenyang:   { name: '문앙',   unit: 'spear_dual',  hp: [100,200], atk: [8,16],  desc: '난무 시전마다 확률로 재돌진(처음 100%, 이후 40~70%, 최대 7회).' },
  dianwei:   { name: '전위',   unit: 'spear_dual',  hp: [125,225], atk: [8,14],  desc: '분노 1 오를 때마다 공격 +1 (최대 20~50). 만중첩 시 난무 단계 +1.' },
  qinqiong:  { name: '진경',   unit: 'spear_dual',  hp: [100,200], atk: [8,16],  desc: '난무가 공격력 최고 대상으로 돌진해 200% 1타. 다음 일반공격 2회에 대상 최대 HP 15~30% 추가.' },
  // 방패병
  xusheng:   { name: '허성',   unit: 'shield_sword', hp: [250,500], atk: [2,5], desc: '비호 시 최대 10명 보호 + 디버프 면역 + 흡혈 10~30% (5턴). 아군이 디버프를 받으면 분노 +1.' },
  yuejin:    { name: '악진',   unit: 'shield_sword', hp: [250,500], atk: [2,5], desc: '적 건물이 자신을 치게 하고 건물 공격을 80% 회피. 회피한 피해의 20~40%를 추가 피해로.' },
  caoren:    { name: '조인',   unit: 'shield_heavy', hp: [300,600], atk: [1,4], desc: '맞을 때마다 최대 HP +8 (20~50중첩). 만중첩 후 턴마다 최대 HP 1% 회복.' },
  zhoutai:   { name: '주태',   unit: 'shield_heavy', hp: [300,600], atk: [1,4], desc: '5칸 안 아군 피해의 10~30%를 대신 받음. 빈사 시 최대 HP 20% 회복(100%에서 발동마다 -10%, 최소 50%).' },
  weixiaokuan:{ name: '위효관', unit: 'shield_heavy', hp: [300,600], atk: [1,4], desc: '4칸 안 최대 12명이 자신을 치게 하고 그 피해 20~50% 감소, 2턴.' },
  zhangfei:  { name: '장비',   unit: 'shield_spear', hp: [150,350], atk: [8,14], desc: '돌격 후 포효. 2칸 안 8명에게 20~50% 추가 피해 + 3턴 공포.' },
  gaoshun:   { name: '고순',   unit: 'shield_spear', hp: [150,350], atk: [8,14], desc: '시작 시 병기 제외 아군 최대 HP +10%, 공격 10~30%. HP 1% 잃을 때마다 주는 피해 +1%.' },
  huanggai:  { name: '황개',   unit: 'shield_hammer', hp: [200,400], atk: [4,8], desc: '첫 턴 자신의 최대 HP 20%를 깎고, 가장 가까운 30명과 자신에게 20~50% 보호막 + 공격 10%.' },
  lianpo:    { name: '염파',   unit: 'shield_hammer', hp: [200,400], atk: [4,8], desc: 'HP 50% 이상이면 3칸 안 12명의 주는 피해 +25%. 50% 미만이면 받는 피해 -25%.' },
  caocao:    { name: '조조',   unit: 'shield_blade', hp: [150,350], atk: [4,8], desc: '공격마다 3칸 안 최대 20명에게 사기 1. 스택당 최대 HP +10, 공격 +1 (최대 10~20).' },
  dengai:    { name: '등애',   unit: 'shield_blade', hp: [150,350], atk: [4,8], desc: '첫 턴 가까운 30명에게 5턴 주는 피해 -20%. 이후 주는 피해 +10%, 턴당 HP 10~30 회복.' },
  menghuo:   { name: '맹획',   unit: 'shield_axe',   hp: [150,350], atk: [8,14], desc: '맞을 때마다 주는 피해 10~20% 증가. 7중첩이면 잃은 HP의 10% 회복 후 다시 중첩.' },
  // 궁병
  huangzhong:{ name: '황충',   unit: 'bow_long',  hp: [50,100], atk: [4,12], desc: 'HP 60% 미만 대상을 15~30% 확률로 즉사. 30% 미만이면 확률 2배. HP% 낮은 대상 우선.' },
  handang:   { name: '한당',   unit: 'bow_long',  hp: [50,100], atk: [4,12], desc: '일반 공격에 공격력×(현재 분노×30~50%) 고정 추가. 분산사격 후 분노 1 잔류.' },
  liubei:    { name: '유비',   unit: 'bow_cross', hp: [50,100], atk: [4,10], desc: '연사가 피해 대신 HP% 최저 아군을 최대 HP의 10~20% 회복한다.' },
  liucong:   { name: '유총',   unit: 'bow_cross', hp: [50,100], atk: [4,10], desc: '연사 1발당 20~50% 확률로 화살 추가, 최대 10발.' },
  wangyi:    { name: '왕이',   unit: 'bow_poison', hp: [50,100], atk: [4,10], desc: '독화살 시 3칸 안 최대 12명의 공격이 40~80% 확률로 빗나감, 2턴.' },
  liru:      { name: '이유',   unit: 'bow_poison', hp: [50,100], atk: [4,10], desc: '3턴 독주. 대상이 죽거나 턴이 끝나면 2칸 안 최대 8명에게 독주 동안 받은 총 피해의 20~50% 고정 피해.' },
  yangyouji: { name: '양유기', unit: 'bow_hunter', hp: [50,100], atk: [4,10], desc: '격려 대신 야수 1마리를 소환. 이미 있으면 최대 HP 10~30% 먹이.' },
  sunquan:   { name: '손권',   unit: 'bow_hunter', hp: [50,100], atk: [4,10], desc: '격려 시 공격력 최고 아군 4명의 공격 10~30% 증가.' },
  yanghongyu:{ name: '양홍옥', unit: 'bow_hunter', hp: [50,100], atk: [4,10], desc: '격려 시 아군 피해 감소 10~15%.' },
  caoxiu:    { name: '조휴',   unit: 'bow_heavy', hp: [50,100], atk: [4,12], desc: '가장 먼 대상 피해 +10~30%, 먼 대상 우선.' },
  sunshangxiang:{ name: '손상향', unit: 'bow_heavy', hp: [50,100], atk: [4,12], desc: '5턴마다 공격력 최고 적 1명 기절 3턴, HP% 최저 아군 최대 HP 10~30% 회복.' },
  luxun:     { name: '육손',   unit: 'bow_fire',  hp: [50,100], atk: [4,10], desc: '불화살 후 불이 20~50% 확률로 적 방향 1칸 확산.' },
  // 기병
  zhangliao: { name: '장료',   unit: 'cav_sword', hp: [100,200], atk: [8,17], desc: '도약베기로 못 죽이면 주변 2칸 최대 8명에게 공격력 20~50% 고정 피해, 자신 피해 감소 +50% 1턴.' },
  lvbu:      { name: '여포',   unit: 'cav_spear', hp: [150,300], atk: [12,24], desc: '돌진 피해 +30~60%. 돌진으로 적을 처치하면 분노 50% 충전. (위키 미기재 — 추정 재능)', est: true },
  xiangyu:   { name: '항우',   unit: 'cav_spear', hp: [200,350], atk: [10,20], desc: 'HP가 낮을수록 공격력 증가(최대 +60%). 사망 시 주변 2칸 적에게 공격력 100% 피해. (추정 재능)', est: true },
  machao:    { name: '마초',   unit: 'cav_spear', hp: [120,250], atk: [10,22], desc: '이동 +1. 돌진 후 1턴간 회피 +30%. (추정 재능)', est: true },
};
const HERO_ORDER = Object.keys(HEROES);

/* ── 초상화 등급 ──────────────────────────────────────────── */
const GRADES = ['해제 전', '7급', '6급', '5급', '4급', '3급', '2급', '1급', '운명'];
// 현재 등급 index → [상위 등급 index, 확률%] 목록 (문서 표 그대로)
const GRADE_TABLE = {
  0: [[1,75],[2,24],[3,0.92],[4,0.045],[5,0.02],[6,0.01],[7,0.005]],
  1: [[2,70],[3,10],[4,0.5],[5,0.05],[6,0.02],[7,0.01],[8,0.005]],
  2: [[3,24],[4,5],[5,0.1],[6,0.04],[7,0.02],[8,0.01]],
  3: [[4,10],[5,2],[6,0.08],[7,0.04],[8,0.015]],
  4: [[5,6],[6,0.4],[7,0.1],[8,0.03]],
  5: [[6,4],[7,0.4],[8,0.05]],
  6: [[7,2],[8,0.15]],
  7: [[8,1]],
};
// 천장: 해당 등급에서 실패 최대 횟수
const GRADE_PITY = { 0: 1, 1: 1, 2: 4, 3: 8, 4: 12, 5: 20, 6: 25, 7: 35 };
const REROLL_COST = 10; // 잔편
const TALENTS = {
  basic:  [ {id:'hp5',  name:'강건', desc:'최대 HP +5%'}, {id:'atk5', name:'예리', desc:'공격 +5%'}, {id:'dodge3', name:'민첩', desc:'회피 +3%'} ],
  mid:    [ {id:'hp10', name:'철벽', desc:'최대 HP +10%'}, {id:'atk10', name:'맹공', desc:'공격 +10%'}, {id:'rage1', name:'투지', desc:'전투 시작 분노 +2'} ],
  high:   [ {id:'hp20', name:'불굴', desc:'최대 HP +20%'}, {id:'atk20', name:'파괴', desc:'공격 +20%'}, {id:'ls10', name:'흡혈', desc:'흡혈 +10%'} ],
};

/* ── 장비 ─────────────────────────────────────────────────── */
// slot: weapon/armor, lv: 대장간 요구 레벨, hp/atk: 수치 범위, v: 효과 수치 범위
const EQUIPMENT = {
  heal_sword:   { name: '치료검',       slot: 'weapon', lv: 1, atk: [1,5],  v: [4,10],  desc: '유효 피해 시 HP {v} 회복, 40% 확률로 5칸 안 HP% 최저 아군도 동일 회복. 병기 불가.' },
  crit_sword:   { name: '회심검',       slot: 'weapon', lv: 1, atk: [2,10], v: [20,40], desc: '{v}% 확률로 165% 치명타.' },
  meteor:       { name: '유성추',       slot: 'weapon', lv: 1, atk: [2,10], v: [30,70], desc: '사거리 +1. 공격 시 회피 {v}% 무시.' },
  dual_axe:     { name: '쌍도끼',       slot: 'weapon', lv: 1, atk: [2,10], v: [20,50], desc: '공격마다 분노 +1. 스킬 후 {v}% 확률로 분노 50% 추가.' },
  moon_blade:   { name: '월아도',       slot: 'weapon', lv: 1, atk: [2,8],  v: [20,50], desc: '주는 피해 {v}% 증가, 피해 감소 20% 무시, 받는 피해 +100%. 유리대포.' },
  dragon_sword: { name: '용연검',       slot: 'weapon', lv: 1, atk: [2,8],  v: [10,20], desc: '공격 +{v}%. 공격마다 25% 확률로 공격 +1% (무한 중첩).' },
  chain_mail:   { name: '사슬갑옷',     slot: 'armor',  lv: 3, hp: [20,70], v: [5,20],  desc: '받는 피해 -5. 피격마다 {v}% 확률로 받는 피해 -1 추가.' },
  gourd:        { name: '술 조롱박',    slot: 'armor',  lv: 3, hp: [20,50], v: [1,4],   desc: '턴 시작 시 최대 HP {v}% 회복.' },
  thorn_armor:  { name: '피해 반사 갑옷', slot: 'armor', lv: 3, hp: [20,80], v: [20,40], desc: '피격 시 {v}% 확률로 고정 5(+최대 HP 50당 1) 반사.' },
  bronze_shield:{ name: '구리방패',     slot: 'armor',  lv: 3, hp: [20,60], v: [10,20], desc: 'HP가 처음 50% 미만이 되면 Lv×{v} 보호막 + 최대 HP 30% 회복.' },
  yellow_axe:   { name: '황월',         slot: 'weapon', lv: 3, hp: [20,40], atk: [1,5], v: [1,5], desc: '피해를 주면 대상 최대 HP {v}%만큼 자신에게 보호막.' },
  iron_shield:  { name: '무쇠 방패',    slot: 'armor',  lv: 3, hp: [20,70], v: [10,35], desc: '근접 피해 -{v}%. HP 50% 미만이면 2배.' },
  vamp_sword:   { name: '흡혈검',       slot: 'weapon', lv: 5, hp: [20,40], atk: [2,10], v: [10,50], desc: '피해의 {v}% 회복, 초과분은 보호막.' },
  ring_blade:   { name: '환도',         slot: 'weapon', lv: 5, hp: [20,40], atk: [2,10], v: [4,10], desc: '맞을 때마다 다음 공격 흡혈 +{v}% (최대 60%).' },
  obsidian:     { name: '흑요석 갑옷',  slot: 'armor',  lv: 5, hp: [20,50], v: [40,80], desc: '첫 5턴 피해 감소 {v}%. 6턴부터 받는 피해 +50%.' },
  dart:         { name: '다트',         slot: 'weapon', lv: 7, atk: [4,14], v: [20,50], desc: '준 피해의 {v}%가 고정 피해.' },
  vine_shield:  { name: '덩굴 방패',    slot: 'armor',  lv: 7, hp: [20,60], v: [30,60], desc: '원거리 피해 -{v}%. HP 50% 미만이면 효과 절반.' },
  wolf_club:    { name: '낭아봉',       slot: 'weapon', lv: 7, atk: [2,8],  v: [1,5],   desc: '대상 현재 HP {v}% 추가 피해.' },
  qiankun:      { name: '건곤도',       slot: 'weapon', lv: 7, atk: [2,8],  v: [20,50], desc: '{v}% 확률로 대상 주변 1칸 최대 4명에게 공격력 75% 고정 피해.' },
  sun_armor:    { name: '태양갑옷',     slot: 'armor',  lv: 7, hp: [20,60], v: [20,50], desc: '턴 시작 {v}% 확률로 1칸 안 최대 4명에게 자신의 최대 HP 4% 고정 피해.' },
  heart_mirror: { name: '정심회',       slot: 'armor',  lv: 7, hp: [20,50], v: [10,20], desc: '최대 HP +{v}%. 5턴마다 자신과 주변 4명의 잃은 HP 20% 회복.' },
  gold_chain:   { name: '금사슬갑옷',   slot: 'armor',  lv: 12, hp: [20,80], v: [15,30], desc: '받는 피해 상한 {v}. 초과분은 다음 턴들에 걸쳐 적용.' },
  hook_sword:   { name: '갈고리검',     slot: 'weapon', lv: 12, atk: [2,8], v: [15,35], desc: '{v}% 확률로 대상 최대 HP (2+Lv)% 고정 피해.' },
  dodge_shoes:  { name: '회피 신발',    slot: 'armor',  lv: 14, hp: [20,50], v: [10,35], desc: '{v}% 확률로 모든 피해 회피.' },
  blood_drop:   { name: '혈적자',       slot: 'weapon', lv: 14, atk: [2,8], v: [5,20],  desc: '대상 HP {v}% 미만이면 즉사. 처형마다 공격 +1.' },
};
const EQUIP_ORDER = Object.keys(EQUIPMENT);

// 전용 장비 (대장간 10 / 18)
const SPECIAL_EQUIP = {
  spear_long:   { name: '장창 전용·용아창',   hp: [20,40], atk: [4,12], desc: '찌르기 칸 +1. 적중마다 3턴 회피 +15%.' },
  spear_pike:   { name: '긴창 전용·비창',     hp: [20,40], atk: [4,13], desc: '투사 시 아군 수(최대 40)×Lv 추가 피해.' },
  shield_sword: { name: '칼과 방패 전용·나무방패', hp: [50,100], atk: [1,2], desc: '보호막에 자신의 최대 HP 5% 추가.' },
  bow_long:     { name: '장궁 전용·철태궁',   hp: [10,20], atk: [2,10], desc: '분산 사격 대상 4명.' },
  cav_sword:    { name: '검기병 전용·대검',   hp: [20,40], atk: [4,13], desc: '도약베기 처치 시 85% 확률로 1회 추가.' },
};

/* ── 몬스터 ───────────────────────────────────────────────── */
// kind: beast / giant / bandit
const MONSTERS = {
  boar:     { name: '멧돼지',   kind: 'beast', hp: 110, atk: 9,  move: 3, range: 1, desc: '초반 기본 몹.' },
  wolf:     { name: '늑대',     kind: 'beast', hp: 90,  atk: 11, move: 4, range: 1, desc: '이동거리 4.' },
  cheetah:  { name: '치타',     kind: 'beast', hp: 85,  atk: 12, move: 4, range: 1, desc: '30% 확률로 모든 피해 회피.' },
  skunk:    { name: '스컹크',   kind: 'beast', hp: 100, atk: 8,  move: 3, range: 2, desc: '현재 HP 15% 고정 독 + 4턴 회복량 -60%.' },
  hedgehog: { name: '고슴도치', kind: 'beast', hp: 130, atk: 7,  move: 2, range: 1, desc: '받은 피해의 35% 반사.' },
  bison:    { name: '들소',     kind: 'beast', hp: 180, atk: 12, move: 3, range: 1, desc: '돌진 + 밀치기, 보호막/방어자세 관통.' },
  tiger:    { name: '호랑이',   kind: 'beast', hp: 160, atk: 14, move: 4, range: 1, desc: '주변 1칸 광역 피해.' },
  lion:     { name: '사자',     kind: 'beast', hp: 170, atk: 15, move: 3, range: 1, desc: '강공격 + 출혈 + 회복 감소.' },
  elephant: { name: '코끼리',   kind: 'beast', hp: 260, atk: 12, move: 2, range: 1, desc: '5칸 내 HP가 가장 높은 적에게 200% 공격.' },
  bear:     { name: '곰',       kind: 'beast', hp: 220, atk: 13, move: 3, range: 1, desc: '최대 HP 8% 기반 피해 + 기절.' },
  lizard:   { name: '도마뱀',   kind: 'beast', hp: 150, atk: 10, move: 3, range: 1, desc: '받는 피해 -40%.' },
  hornet:   { name: '호박벌',   kind: 'beast', hp: 70,  atk: 9,  move: 4, range: 1, desc: '대상 현재 HP 5% 추가 피해.' },
  g_rat:    { name: '거대 쥐',   kind: 'giant', hp: 1500, atk: 30, move: 0, range: 2, desc: '피해감소 70% 무시. 공격한 병사에게 피해 -70% 디버프. 자신을 공격하면 전염병 스택(턴당 최대 HP 5%, 무제한 중첩).' },
  g_gorilla:{ name: '거대 고릴라', kind: 'giant', hp: 1800, atk: 35, move: 0, range: 2, desc: '디버프를 지우고 이후 2회 공격이 300% + 주변 광역.' },
  g_goat:   { name: '거대 염소', kind: 'giant', hp: 1600, atk: 28, move: 0, range: 2, desc: '대상을 적이 몰린 곳으로 날린 뒤 주변 최대 8명에게 날아간 대상 최대 HP 15% 고정 피해 + 기절.' },
  b_grunt:  { name: '졸개',       kind: 'bandit', hp: 150, atk: 14, move: 3, range: 1, desc: '산적 기본 병력.' },
  b_assassin:{ name: '자객',      kind: 'bandit', hp: 120, atk: 20, move: 4, range: 1, desc: '회피 20%, 치명타 30%.' },
  b_blade:  { name: '칼잡이 산적', kind: 'bandit', hp: 200, atk: 16, move: 3, range: 1, desc: '인접 적을 함께 벤다.' },
  b_archer: { name: '궁수 산적',   kind: 'bandit', hp: 110, atk: 15, move: 2, range: 4, desc: '사거리 4.' },
  b_rider:  { name: '멧돼지 기사', kind: 'bandit', hp: 260, atk: 18, move: 4, range: 1, desc: '돌진 광역.' },
  b_boss:   { name: '도적 두목',   kind: 'bandit', hp: 500, atk: 25, move: 3, range: 1, desc: '광역 공격 + 아군 산적 공격력 증가.' },
};
const BEASTS = ['boar','wolf','cheetah','skunk','hedgehog','bison','tiger','lion','elephant','bear','lizard','hornet'];
const GIANTS = ['g_rat','g_gorilla','g_goat'];
const BANDITS = ['b_grunt','b_assassin','b_blade','b_archer','b_rider','b_boss'];

/* ── 건물 ─────────────────────────────────────────────────── */
const BUILDINGS = {
  capital:   { name: '거점',     max: 20, desc: '모든 건물 레벨의 상한. 군대 수용량과 영토 상한을 늘린다.', cost: (l) => ({ wood: 60*l*l, stone: 40*l*l, food: 30*l*l }), time: (l) => 4 + l*3 },
  barracks:  { name: '군영',     max: 20, desc: '창병·방패병·궁병 모집. 5/10/15/20레벨마다 병사 최대 레벨 3/4/5/6.', cost: (l) => ({ wood: 40*l*l, stone: 15*l*l }), time: (l) => 3 + l*2 },
  stable:    { name: '마구간',   max: 20, desc: '기병 모집.', cost: (l) => ({ wood: 50*l*l, stone: 20*l*l, food: 20*l*l }), time: (l) => 3 + l*2 },
  smithy:    { name: '대장간',   max: 20, desc: '장비 제작. 거점 레벨을 넘을 수 없다. 10/18레벨에 전용 장비 해금.', cost: (l) => ({ wood: 35*l*l, stone: 45*l*l }), time: (l) => 3 + l*2 },
  factory:   { name: '공장',     max: 10, desc: '투석차·쇠뇌차 생산.', cost: (l) => ({ wood: 80*l*l, stone: 80*l*l }), time: (l) => 5 + l*3 },
  ground:    { name: '연병장',   max: 20, desc: '병사 훈련(레벨 업) 비용·시간 감소.', cost: (l) => ({ wood: 30*l*l, stone: 30*l*l, food: 40*l*l }), time: (l) => 3 + l*2 },
  hall:      { name: '영웅전당', max: 10, desc: '영웅 초상화 공봉·재그리기. 거점 Lv8 필요.', cost: (l) => ({ wood: 120*l*l, stone: 120*l*l }), time: (l) => 6 + l*4, req: 8 },
  warehouse: { name: '창고',     max: 20, desc: '목재·석재·식량 저장 상한.', cost: (l) => ({ wood: 30*l*l, stone: 30*l*l }), time: (l) => 2 + l*2 },
  hospital:  { name: '병원',     max: 10, desc: '전사한 병사가 확률로 입원해 복귀한다. 레벨당 입원 확률 +5%.', cost: (l) => ({ wood: 60*l*l, stone: 40*l*l, food: 60*l*l }), time: (l) => 4 + l*3 },
  embassy:   { name: '대사관',   max: 5,  desc: 'Lv1 연맹 가입, Lv3 연맹 정책 선택.', cost: (l) => ({ wood: 80*l*l, stone: 60*l*l }), time: (l) => 5 + l*4 },
};
const BUILDING_ORDER = Object.keys(BUILDINGS);

/* ── 연맹 정책 ───────────────────────────────────────────── */
const POLICIES = {
  none:    { name: '정책 없음',  desc: '' },
  rampart: { name: '성루연봉',   desc: '요새·거점 수비 시 아군 최대 HP +20%.' },
  aura:    { name: '수호 오라',  desc: '전투 시작 시 모든 아군에게 보호막(최대 HP 8%).' },
  horn:    { name: '진격 나팔',  desc: '행군 속도 +25%.' },
  harvest: { name: '풍년 기원',  desc: '식량 생산 +20%.' },
};

/* ── 계절 ──────────────────────────────────────────────── */
const SEASONS = [
  { id: 'spring', name: '봄',   food: 1.0, mat: 1.0, monster: 1.0,  color: '#6fbf5a' },
  { id: 'summer', name: '여름', food: 1.3, mat: 1.0, monster: 1.1,  color: '#a8c93a' },
  { id: 'autumn', name: '가을', food: 1.1, mat: 1.3, monster: 1.25, color: '#d9933a' },
  { id: 'winter', name: '겨울', food: 0.5, mat: 0.8, monster: 1.5,  color: '#9fb6c6' },
];

/* ── 상수 ──────────────────────────────────────────────── */
const CONST = {
  MAP: 44,                // 맵 한 변 (에이커)
  MINUTES_PER_DAY: 1440,
  DAYS_PER_SEASON: 1,
  PVP_START: 20, PVP_END: 24,   // 시 (한국 기준 20:00~24:00)
  PROTECT_MIN: 60,        // 점령 보호 시간 (게임 분)
  MAX_BATTLE_ROUNDS: 30,
  RUIN_WIN_LV: 20, RUIN_WIN_COUNT: 3, RUIN_WIN_COUNT_LV: 12,
};

// 자원지 시간당 생산량 (레벨별)
function tileProduction(lv) { return Math.round(18 * Math.pow(lv, 1.45)); }
