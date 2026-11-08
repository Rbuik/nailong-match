// game.js — 奶龙消消乐 v2 主控
// 依赖（按顺序加载）：rng.js → storage.js → audio.js → effects.js → specials.js → goals.js → tasks.js → input.js
// 覆盖优化方案：§1 目标多样化 / §2 组合技 + 线消 / §3 连击节奏 / §4 掉落预览 / §5 星级
//              §6 每日任务 / §7 金币道具 / §8 签到 / §9 难度呼吸 / §10 无尽里程碑
//              §11 动态难度 / §12 拖拽 / §13 幽灵格 / §14 重量感 / §15 音效分层 / §16 摇头
//              §17 主题 / §18 吉祥物 / §19 特殊块外观 / §20 数据表 / §21 存档 / §22 音频
//              §23 Pointer / §24 对象池 / §25 容错

(function () {
  'use strict';

  // ==================== 常量 ====================
  const COLS = 8, ROWS = 8, MAX_W = 480;
  const FALLBACK_COLORS = ['#ff5c5c', '#5cff8f', '#5c8fff', '#ffd75c', '#c85cff', '#5cffee'];
  // 冰块：普通冰一出现就是 2 层（要砸两下），厚冰 3 层
  const ICE_BASE = 2;
  const ICE_HARD = 3;
  // 冰块上的五道裂纹（格子内的相对坐标 0~1，每三条一组 = 一条折线）
  const ICE_CRACKS = [
    [0.24, 0.16, 0.44, 0.50, 0.28, 0.78],
    [0.74, 0.20, 0.56, 0.50, 0.78, 0.80],
    [0.62, 0.12, 0.50, 0.42, 0.74, 0.58],
    [0.14, 0.55, 0.40, 0.62, 0.34, 0.88],
    [0.70, 0.28, 0.62, 0.72, 0.82, 0.84]
  ];
  const T = Specials.TYPE;

  // ==================== 机关节拍 ====================
  const IVY_EVERY = 3;      // 常春藤：每 3 步长一格
  const IVY_FAIL = 26;      // 常春藤长到 26 格 = 铺满一半，直接判负
  const SAND_EVERY = 3;     // 流沙：每 3 步吞掉沙上的一件货
  const TRACK_EVERY = 4;    // 移动轨道：每 4 步整行滑一格
  const FROST_TURNS = 3;    // ❄️ 霜块：解除后定格 3 步
  const FROST_EVERY = 6;    // ❄️ 霜块：机关关卡里每 6 步自动长一个
  const TBOX_HP = 2;        // 保险箱：相邻消除敲 2 下

  // 这一关是不是「机关关卡」：有藤蔓 / 保险箱 / 流沙 / 步数炸弹 / 迷雾 / 传送门 / 轨道 / 霜块
  // （霜块 ❄️ 只在机关关卡里自动生成，普通关不会冒出霜块）
  function hasHazardLevel(d) {
    if (!d) return false;
    return !!(d.ivy || d.box || d.sand || d.tbomb || d.fog || d.portal || d.track || d.frost);
  }

  const COMBO_WINDOW = 1600;   // 跨步连击窗口（ms）：改短了，停手一拍连击就断
  const COMBO_DECAY = 620;     // 连击条显示窗口（ms）：中央弹窗停留短一点，不挡棋盘
  const MULT = [1, 1, 1.5, 2, 3]; // combo -> 倍率

  // 内置关卡兜底（file:// 下 fetch 失败时用）
  const LEVELS_FALLBACK = {
    version: 2, maxMainLevel: 20,
    themes: {
      grass: { name: '草地', bg: '#ffffff', grid: '#f0f0f0' },
      ocean: { name: '海洋', bg: '#ffffff', grid: '#f0f0f0' },
      star: { name: '星空', bg: '#ffffff', grid: '#f0f0f0' },
      candy: { name: '糖果', bg: '#ffffff', grid: '#f0f0f0' }
    },
    levels: [
      { id: 1, theme: 'grass', moves: 28, goal: { type: 'score', target: 1000 }, stars: [1000, 1500, 2000] },
      { id: 2, theme: 'grass', moves: 26, goal: { type: 'collect', target: { 0: 12, 1: 12 } }, stars: [1200, 1800, 2400] },
      { id: 3, theme: 'grass', moves: 26, goal: { type: 'score', target: 1400 }, stars: [1400, 2000, 2700] },
      { id: 4, theme: 'grass', moves: 24, goal: { type: 'clear', target: 8 }, stars: [1000, 1600, 2200] },
      { id: 5, theme: 'grass', moves: 20, goal: { type: 'score', target: 1800 }, stars: [1800, 2400, 3000], boss: true },
      { id: 6, theme: 'ocean', moves: 30, goal: { type: 'collect', target: { 0: 15, 1: 15 } }, stars: [1500, 2200, 3000], relief: true },
      { id: 7, theme: 'ocean', moves: 24, goal: { type: 'score', target: 2200 }, stars: [2200, 2900, 3600] },
      { id: 8, theme: 'ocean', moves: 60, goal: { type: 'timed', target: 1200, time: 60 }, stars: [1200, 1900, 2600] },
      { id: 9, theme: 'ocean', moves: 22, goal: { type: 'clear', target: 12 }, stars: [1200, 1800, 2500] },
      { id: 10, theme: 'ocean', moves: 20, goal: { type: 'score', target: 3000 }, stars: [3000, 3800, 4600], boss: true },
      { id: 11, theme: 'star', moves: 24, goal: { type: 'collect', target: { 0: 15, 2: 15 } }, stars: [1600, 2300, 3000] },
      { id: 12, theme: 'star', moves: 14, goal: { type: 'moves', target: 1800 }, stars: [1800, 2400, 3000] },
      { id: 13, theme: 'star', moves: 22, goal: { type: 'score', target: 3200 }, stars: [3200, 4000, 4800] },
      { id: 14, theme: 'star', moves: 20, goal: { type: 'clear', target: 16 }, stars: [1400, 2100, 2800] },
      { id: 15, theme: 'star', moves: 18, goal: { type: 'score', target: 3600 }, stars: [3600, 4400, 5300], boss: true },
      { id: 16, theme: 'candy', moves: 28, goal: { type: 'collect', target: { 0: 18, 1: 18, 2: 18 } }, stars: [2000, 3000, 4000], relief: true },
      { id: 17, theme: 'candy', moves: 75, goal: { type: 'timed', target: 1800, time: 75 }, stars: [1800, 2700, 3600] },
      { id: 18, theme: 'candy', moves: 22, goal: { type: 'clear', target: 20 }, stars: [1600, 2400, 3200] },
      { id: 19, theme: 'candy', moves: 16, goal: { type: 'moves', target: 2600 }, stars: [2600, 3400, 4200] },
      { id: 20, theme: 'candy', moves: 20, goal: { type: 'score', target: 5000 }, stars: [5000, 6000, 7200], boss: true, final: true }
    ]
  };

  // ==================== 状态 ====================
  const S = {
    data: LEVELS_FALLBACK,
    board: [],
    jelly: [],
    level: 1,
    levelDef: null,
    goal: null,
    score: 0,
    levelStartScore: 0,
    moves: 0,
    timeLeft: 0,
    timerOn: false,
    combo: 0,
    maxCombo: 0,
    lastClearAt: 0,
    comboUntil: 0,
    playing: false,
    paused: false,
    busy: false,
    selected: null,
    dragTo: null,
    history: [],
    shuffleLeft: 3,
    undoLeft: 3,
    nextQueue: [],
    clearedCount: 0,
    jellyLeft: 0,
    landAnims: [],
    shakeCell: null,
    menuLevel: 0,     // 主页当前显示的关卡（可由关卡记录切换）
    daily: false,
    rng: null,
    lastFrame: 0,
    // —— 新玩法 ——
    ice: [],            // 冰块层数（0/1/2）：冻住的格子不能动、不能消，相邻消除砸掉一层
    chain: [],          // 锁链（0/1）：锁住的格子不能动，第一次被消除只解锁
    // —— 机关（第二轮新增，全部是逐格数组，整份跟着存档 / 撤回快照走）——
    ivy: [],            // 常春藤（0/1）：每 3 步往外长一格，铺满 26 格直接失败
    box: [],            // 保险箱（0~2）：相邻消除敲一次，敲开掉一件货
    sand: [],           // 流沙（0/1）：底行有沙的列送不了货，每 3 步埋掉沙上的货
    tbomb: [],          // 步数炸弹（剩余步数）：归零直接失败，消除该格可拆
    fog: [],            // 迷雾（0/1）：看不见下面的方块，消掉旁边才显形
    portalAt: [],       // 传送门（"r,c" -> {r,c}）：货物落到一端直接跳到另一端
    portals: [],        // 成对的传送门坐标
    trackRows: [],      // 会整行滑动的行号（移动轨道）
    turnCount: 0,       // 本局走了几步（机关按这个节拍走）
    hazardLevel: false, // 这一关是不是「机关关卡」（霜块 ❄️ 只在机关关卡里自动生成）
    frostTurns: 0,      // ❄️ 霜块定格的剩余回合：期间所有机关暂停
    failReason: '',     // 机关导致失败时的标题（炸弹爆炸 / 藤蔓铺满）
    cargoLeft: 0,       // 场上还没送达的货物数
    rescueLeft: 0,      // 还没护送到位的奶龙数
    frenzyUntil: 0,     // 狂热模式结束时间
    hintLeft: 2,        // 本局剩余提示次数
    hintCells: null,    // 当前高亮的提示格
    hintUntil: 0,
    mode: 'main',       // main / endless / sprint / rhythm
    reviveUsed: false,  // 本局是否已用过「再来 3 步」
    wonContinued: false,// 过关后是否正在续玩剩余步数
    chapter: 1,
    beat: 0,            // 节奏关：节拍计数
    beatStamp: 0        // 节奏关：上一次节拍时间
  };

  const $ = (id) => document.getElementById(id);
  const randInt = (n) => Math.floor(Math.random() * n);
  const inB = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  const kOf = (r, c) => r + ',' + c;

  // ==================== Canvas ====================
  let CELL = 44;
  // 逻辑尺寸（CSS px）与 DPR：画布位图按 DPR 放大，手机高分屏下方块照片不再糊
  let VIEW_W = 0, VIEW_H = 0, DPR = 1;
  const canvas = $('game');
  const ctx = canvas.getContext('2d');

  function computeCell() {
    // 扣除 .game-container(24*2) 与 .board-wrap(18*2) 的横向内边距
    const avail = Math.min(window.innerWidth || MAX_W, 620) - 84;
    return Math.max(28, Math.floor(avail / COLS));
  }

  function resizeCanvas() {
    CELL = computeCell();
    VIEW_W = COLS * CELL;
    VIEW_H = ROWS * CELL;
    DPR = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.round(VIEW_W * DPR);
    canvas.height = Math.round(VIEW_H * DPR);
    // 位图变大后必须把显示尺寸锁回逻辑尺寸，否则画布会被撑大 DPR 倍
    canvas.style.width = VIEW_W + 'px';
    canvas.style.height = VIEW_H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawStatic();
  }

  // ==================== 图片资源 ====================
  const IMAGES = [];
  let imagesReady = false;

  function loadImages() {
    let loaded = 0;
    const settle = () => {
      imagesReady = true;
      const l = $('loading');
      if (l) l.style.display = 'none';
      drawStatic();
    };
    for (let i = 0; i < 6; i++) {
      const img = new Image();
      img.decoding = 'async';
      img.fetchPriority = 'high';
      const done = () => {
        loaded++;
        // 每张图到位就重绘一次：即使其它图还没到，先到的也能显示
        drawStatic();
        if (loaded >= 6) settle();
      };
      img.onload = done;
      img.onerror = done;
      img.src = './assets/' + i + '.webp';
      IMAGES[i] = img;
    }
    // 兜底：网络极慢也不让「加载中」卡死（方块会先用颜色占位，图到了再补上）
    setTimeout(() => {
      if (!imagesReady) settle();
    }, 2000);
  }

  // ==================== 棋盘 ====================
  function typeCount() {
    return (S.levelDef && S.levelDef.colors) || 6;
  }

  function randType() {
    return S.rng ? S.rng.int(typeCount()) : randInt(typeCount());
  }

  function initBoard() {
    S.board = [];
    S.jelly = [];
    S.ice = [];
    S.chain = [];
    S.ivy = [];
    S.box = [];
    S.sand = [];
    S.tbomb = [];
    S.fog = [];
    S.portalAt = [];
    S.portals = [];
    S.trackRows = [];
    S.turnCount = 0;
    S.frostTurns = 0;
    S.failReason = '';
    for (let r = 0; r < ROWS; r++) {
      S.board[r] = [];
      S.jelly[r] = [];
      S.ice[r] = [];
      S.chain[r] = [];
      S.ivy[r] = [];
      S.box[r] = [];
      S.sand[r] = [];
      S.tbomb[r] = [];
      S.fog[r] = [];
      S.portalAt[r] = [];
      for (let c = 0; c < COLS; c++) {
        let t;
        let guard = 0;
        do {
          t = randType();
          guard++;
        } while (guard < 30 && (
          (c >= 2 && S.board[r][c - 1] && S.board[r][c - 1].type === t && S.board[r][c - 2] && S.board[r][c - 2].type === t) ||
          (r >= 2 && S.board[r - 1][c].type === t && S.board[r - 2][c].type === t)
        ));
        S.board[r][c] = { type: t, special: T.NORMAL };
        S.jelly[r][c] = 0;
        S.ice[r][c] = 0;
        S.chain[r][c] = 0;
        S.ivy[r][c] = 0;
        S.box[r][c] = 0;
        S.sand[r][c] = 0;
        S.tbomb[r][c] = 0;
        S.fog[r][c] = 0;
        S.portalAt[r][c] = null;
      }
    }
    placeJelly();
    placeObstacles();
    S.nextQueue = [randType(), randType(), randType()];
  }

  // ==================== 新障碍：冰块 / 锁链 / 货物 ====================
  // 冰块：冻住的格子既不能交换也不能参与连消，只能靠相邻消除（或特殊块）砸开
  // 锁链：可以参与连消，但第一次被消只解链、方块留下
  // 货物：钥匙🔑 / 礼物🎁 / 奶龙（抠图）贴在方块上，跟着方块下落，落到最底行才算送达
  function isIced(r, c) {
    return !!(S.ice[r] && S.ice[r][c] > 0);
  }
  function isChained(r, c) {
    return !!(S.chain[r] && S.chain[r][c] > 0);
  }
  function isBoxed(r, c) {
    return !!(S.box[r] && S.box[r][c] > 0);
  }
  function isLocked(r, c) {
    return isIced(r, c) || isChained(r, c) || isBoxed(r, c);
  }

  // ---------- 货物（钥匙 / 奶龙）允许重叠 ----------
  // 一格上可以压着多件货：`cell.cargo` 平时是单个对象，压了第二件就变成数组。
  // 所有读取都走 cargoList()，别直接读 .kind（会漏掉叠着的那几件）。
  function cargoList(cell) {
    if (!cell || !cell.cargo) return [];
    return Array.isArray(cell.cargo) ? cell.cargo : [cell.cargo];
  }
  function addCargo(cell, cargo) {
    if (!cell || !cargo) return;
    if (!cell.cargo) { cell.cargo = cargo; return; }
    if (Array.isArray(cell.cargo)) { cell.cargo.push(cargo); return; }
    cell.cargo = [cell.cargo, cargo];
  }

  // 一格只放一样东西：已经贴了货物（钥匙 / 奶龙）、有冰 / 锁链、或已经是特殊块的格子，
  // 不再往上叠新的特殊块 / 道具。要生成的东西改放到「这一轮会被消掉」的其他空格上。
  function canPlaceNew(r, c) {
    const b = S.board[r] && S.board[r][c];
    if (!b) return false;
    if (b.special !== T.NORMAL) return false;
    if (b.cargo) return false;
    if (isIced(r, c) || isChained(r, c) || isBoxed(r, c)) return false;
    if (S.portalAt && S.portalAt[r] && S.portalAt[r][c]) return false;
    return true;
  }

  // 从一组将被消除的格子（"r,c" 集合）里随机挑一个还能放东西的
  function pickSpotIn(cells) {
    const list = [];
    cells.forEach((k) => {
      const parts = String(k).split(',');
      const r = Number(parts[0]);
      const c = Number(parts[1]);
      if (canPlaceNew(r, c)) list.push({ r: r, c: c });
    });
    if (!list.length) return null;
    return list[randInt(list.length)];
  }

  function placeObstacles() {
    const d = S.levelDef || {};
    S.cargoLeft = 0;
    S.rescueLeft = 0;
    S.iceHitMove = {};   // 「每步每格最多砸一层冰」的记账
    const free = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) free.push({ r, c });
    shuffleArr(free);

    // 货物只放上半区（必须靠下落送到底），且同一格不会重复放
    const top = free.filter((p) => p.r <= 4);
    let ti = 0;
    const putCargo = (kind, n) => {
      for (let k = 0; k < n && ti < top.length; k++) {
        const p = top[ti++];
        addCargo(S.board[p.r][p.c], { kind: kind });
      }
    };
    // 第四章开始：运送的货物里混入糖果（钥匙 + 糖果各一半），目标照常按「总送达数」算
    const cargoN = Math.max(0, d.cargo || 0);
    if ((d.id || 0) >= 31 && cargoN > 0) {
      putCargo('key', Math.ceil(cargoN / 2));
      putCargo('candy', Math.floor(cargoN / 2));
      if (S.goal) S.goal.hasCandy = true;   // 目标栏文案从「运送钥匙」换成「运送货物」
    } else {
      putCargo('key', cargoN);
    }
    putCargo('nailong', Math.max(0, d.rescue || 0));

    // 冰块 / 锁链放在剩下的格子里（不和货物重叠）
    const rest = free.filter((p) => !S.board[p.r][p.c].cargo);
    let ri = 0;
    const take = () => (ri < rest.length ? rest[ri++] : null);
    for (let k = 0; k < (d.ice || 0); k++) { const p = take(); if (!p) break; S.ice[p.r][p.c] = ICE_BASE; }
    for (let k = 0; k < (d.iceHard || 0); k++) { const p = take(); if (!p) break; S.ice[p.r][p.c] = ICE_HARD; }
    for (let k = 0; k < (d.chain || 0); k++) { const p = take(); if (!p) break; S.chain[p.r][p.c] = 1; }

    // ---------- 机关：常春藤 / 保险箱 / 流沙 / 步数炸弹 / 迷雾 / 传送门 / 轨道 ----------
    // 都和货物、冰、锁链错开；每种数量都写死上限，绝不把棋盘摆满（要留得出可走的步）
    const pickFree = () => {
      for (let i = 0; i < rest.length; i++) {
        const p = rest[ri % rest.length];
        ri++;
        if (!S.board[p.r][p.c].cargo && !isIced(p.r, p.c) && !isChained(p.r, p.c) && !S.box[p.r][p.c]) return p;
      }
      return null;
    };
    // 🌿 常春藤：一开始只长几格，靠「每 3 步往外长」慢慢变成压力
    for (let k = 0; k < Math.min(6, d.ivy || 0); k++) {
      const p = pickFree(); if (!p) break;
      S.ivy[p.r][p.c] = 1;
    }
    // 📦 保险箱：放在中区，敲开掉货
    for (let k = 0; k < Math.min(6, d.box || 0); k++) {
      const p = pickFree(); if (!p) break;
      S.box[p.r][p.c] = TBOX_HP;
    }
    // 🟫 流沙：优先压在底行 / 次底行（挡住送货路线才有意义）
    if (d.sand) {
      const sandPool = shuffleArr(rest.filter((p) =>
        p.r >= ROWS - 2 && !S.board[p.r][p.c].cargo && !S.ivy[p.r][p.c] && !S.box[p.r][p.c]));
      for (let k = 0; k < Math.min(10, d.sand || 0) && k < sandPool.length; k++) {
        S.sand[sandPool[k].r][sandPool[k].c] = 1;
      }
    }
    // ⚠️ 步数炸弹：开局给 8 步，分散到不同格
    for (let k = 0; k < Math.min(4, d.tbomb || 0); k++) {
      const p = pickFree(); if (!p) break;
      S.tbomb[p.r][p.c] = 8;
    }
    // ❄️ 霜块：关卡可以开局就送几个（正面向特殊块，消掉它机关就定格）
    for (let k = 0; k < Math.min(4, d.frost || 0); k++) {
      const p = pickFree(); if (!p) break;
      markSpecial(p.r, p.c, T.FROST);
    }
    // 🌫️ 迷雾：大半场先蒙上，消掉旁边才显形
    if (d.fog) {
      const fogPool = shuffleArr(rest.filter((p) =>
        !S.board[p.r][p.c].cargo && !S.ivy[p.r][p.c] && !S.box[p.r][p.c] && !S.tbomb[p.r][p.c] && !S.sand[p.r][p.c]));
      for (let k = 0; k < Math.min(26, d.fog || 0) && k < fogPool.length; k++) {
        S.fog[fogPool[k].r][fogPool[k].c] = 1;
      }
    }
    // 🌀 传送门：成对出现（上下各一个），货物落到一端直接跳到另一端
    if (d.portal) {
      const pairs = Math.min(2, d.portal);
      for (let k = 0; k < pairs; k++) {
        const a = { r: 1 + k, c: 1 + k * 3 };
        const b = { r: ROWS - 2, c: COLS - 2 - k * 3 };
        if (!inB(a.r, a.c) || !inB(b.r, b.c)) continue;
        S.portalAt[a.r][a.c] = { r: b.r, c: b.c };
        S.portalAt[b.r][b.c] = { r: a.r, c: a.c };
        S.portals.push({ r: a.r, c: a.c, to: { r: b.r, c: b.c } });
        S.portals.push({ r: b.r, c: b.c, to: { r: a.r, c: a.c } });
        // 传送门格子不压障碍（否则看不清）
        S.ice[a.r][a.c] = 0; S.chain[a.r][a.c] = 0; S.ivy[a.r][a.c] = 0;
        S.box[a.r][a.c] = 0; S.sand[a.r][a.c] = 0; S.tbomb[a.r][a.c] = 0; S.fog[a.r][a.c] = 0;
        S.ice[b.r][b.c] = 0; S.chain[b.r][b.c] = 0; S.ivy[b.r][b.c] = 0;
        S.box[b.r][b.c] = 0; S.sand[b.r][b.c] = 0; S.tbomb[b.r][b.c] = 0; S.fog[b.r][b.c] = 0;
      }
    }
    // 🚄 移动轨道：每隔几步整行滑一格（挑中间几行，不碰首尾行）
    if (d.track) {
      const n = Math.min(3, d.track);
      for (let k = 0; k < n; k++) S.trackRows.push(2 + k * 2);
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        cargoList(S.board[r][c]).forEach((cg) => {
          S.cargoLeft++;
          if (cg.kind === 'nailong') S.rescueLeft++;
        });
      }
    }
    updateHazardBar();
  }

  // ==================== 机关：常春藤 / 保险箱 / 流沙 / 炸弹 / 迷雾 / 传送门 / 轨道 ====================
  // 全部按「本局走了几步」结算（S.turnCount），霜块 ❄️ 触发时所有机关一起暂停。

  function ivyCount() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (S.ivy[r] && S.ivy[r][c]) n++;
    }
    return n;
  }
  function boxCount() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (S.box[r] && S.box[r][c] > 0) n++;
    }
    return n;
  }
  function sandCount() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (S.sand[r] && S.sand[r][c]) n++;
    }
    return n;
  }
  function fogCount() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (S.fog[r] && S.fog[r][c]) n++;
    }
    return n;
  }
  // 最近的一颗步数炸弹还剩几步（没有就返回 0）
  function tbombMin() {
    let min = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = S.tbomb[r] && S.tbomb[r][c];
        if (v > 0 && (!min || v < min)) min = v;
      }
    }
    return min;
  }

  // 🌿 每 3 步往外长：随机挑藤蔓，往空邻居爬一格
  function growIvy() {
    const seeds = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (S.ivy[r] && S.ivy[r][c]) seeds.push({ r: r, c: c });
    }
    if (!seeds.length) return 0;
    let grew = 0;
    for (let k = 0; k < 2; k++) {
      const s = seeds[randInt(seeds.length)];
      const dirs = shuffleArr([[0, 1], [0, -1], [1, 0], [-1, 0]]);
      for (let i = 0; i < dirs.length; i++) {
        const rr = s.r + dirs[i][0], cc = s.c + dirs[i][1];
        if (!inB(rr, cc) || S.ivy[rr][cc]) continue;
        if (S.portalAt[rr] && S.portalAt[rr][cc]) continue;
        if (S.board[rr][cc] && S.board[rr][cc].cargo) continue;   // 压着货的格子不长藤
        S.ivy[rr][cc] = 1;
        FX.burst(cc * CELL + CELL / 2, rr * CELL + CELL / 2, '#4fd06a', 3);
        grew++;
        break;
      }
    }
    if (grew) {
      AudioManager.playSFX('invalid');
      toast('🌿 常春藤又长了一格，快点消掉压住它');
    }
    return grew;
  }

  // 🟫 每 3 步吞掉沙上的货（吞掉的不算送达，目标数会跟着场上实际数量重算）
  function burySand() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!S.sand[r] || !S.sand[r][c]) continue;
        const b = S.board[r][c];
        if (!b || !b.cargo) continue;
        const list = cargoList(b);
        n += list.length;
        b.cargo = null;
        FX.text(c * CELL + CELL / 2, r * CELL + CELL / 2, '被流沙埋住 🟫', '#a9793f', 14);
      }
    }
    if (n) {
      S.cargoLeft = Math.max(0, S.cargoLeft - n);
      syncGoalFromBoard();
      updateTargetBar();
      toast('🟫 流沙埋掉了 ' + n + ' 件货，先把沙挖掉');
    }
    return n;
  }

  // 🚄 每 4 步整行滑一格（只挪方块，果冻 / 机关留在原地）
  function shiftTrack() {
    if (!S.trackRows.length) return 0;
    S.trackRows.forEach((r) => {
      const row = S.board[r];
      if (!row) return;
      const last = row[COLS - 1];
      for (let c = COLS - 1; c > 0; c--) row[c] = row[c - 1];
      row[0] = last;
      for (let c = 0; c < COLS; c++) {
        if (row[c]) FX.burst(c * CELL + CELL / 2, r * CELL + CELL / 2, '#7cc2ff', 2);
      }
    });
    AudioManager.playSFX('swap');
    toast('🚄 轨道滑动，整行挪了一格');
    return 1;
  }

  // ❄️ 霜块主动生成：每 6 步在空位长一个（正面向：消掉它就能定格机关 3 步）
  function spawnFrost() {
    const free = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (canPlaceNew(r, c) && !S.ivy[r][c] && !S.fog[r][c]) free.push({ r, c });
    }
    if (!free.length) return false;
    const p = free[randInt(free.length)];
    markSpecial(p.r, p.c, T.FROST);
    FX.text(p.c * CELL + CELL / 2, p.r * CELL + CELL / 2, '霜块 ❄️', '#5cc8ff', 15);
    return true;
  }

  // 特殊块中文名（生成时的提示条用）
  const SPECIAL_NAMES = {};
  SPECIAL_NAMES[T.RAINBOW] = '彩虹 🌈';
  SPECIAL_NAMES[T.BOMB] = '炸弹 💣';
  SPECIAL_NAMES[T.MAGNET] = '磁铁 🧲';
  SPECIAL_NAMES[T.PAINT] = '颜料 🎨';
  SPECIAL_NAMES[T.PROPELLER] = '螺旋桨 🛩️';
  SPECIAL_NAMES[T.LINE_H] = '线消 ↔️';
  SPECIAL_NAMES[T.LINE_V] = '线消 ↕️';
  SPECIAL_NAMES[T.FROST] = '霜块 ❄️';

  // 🎨 颜料：把一片方块统一成同一种颜色
  // 刷成的颜色 = 颜料块正下方那格方块自己的颜色（不是它交换过来的颜色）；
  // 万一那格没有正常方块（被冰 / 锁链占着），才退回「场上最多的颜色」
  function paintArea(r, c, rad) {
    const self = S.board[r] && S.board[r][c];
    const color = (self && self.type != null && self.special === T.PAINT)
      ? self.type
      : Specials.dominantColor(S.board, ROWS, COLS);
    if (color == null) return 0;
    let n = 0;
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        const rr = r + dr, cc = c + dc;
        if (!inB(rr, cc)) continue;
        const b = S.board[rr][cc];
        if (!b || b.special !== T.NORMAL) continue;
        if (isIced(rr, cc) || isChained(rr, cc) || isBoxed(rr, cc)) continue;
        b.type = color;
        n++;
      }
    }
    if (n) {
      FX.flash('#ffd75c', 0.16, 0.18);
      FX.text(c * CELL + CELL / 2, r * CELL + CELL / 2, '刷成同色 🎨', '#ff9a3c', 16);
      toast('🎨 颜料把 ' + n + ' 格刷成了同一种颜色');
    }
    return n;
  }

  // 📦 保险箱：相邻消除敲一下，两下打开，里面掉一件糖果（送到最底行就算数）
  function chipBox(r, c) {
    if (!isBoxed(r, c)) return false;
    S.box[r][c]--;
    AudioManager.playSFX('ice', { final: S.box[r][c] <= 0 });
    FX.burst(c * CELL + CELL / 2, r * CELL + CELL / 2, '#d9a44c', 5);
    if (S.box[r][c] > 0) {
      FX.text(c * CELL + CELL / 2, r * CELL + CELL / 2, '箱子裂开 📦', '#c08a35', 13);
      return true;
    }
    S.box[r][c] = 0;
    const cell = S.board[r][c];
    if (cell) { addCargo(cell, { kind: 'candy' }); S.cargoLeft++; }
    S.score += 100;
    FX.text(c * CELL + CELL / 2, r * CELL + CELL / 2, '箱子开了 🍬 +100', '#2fa84f', 15);
    AudioManager.playSFX('coin');
    toast('📦 保险箱打开了，里面的糖果掉出来');
    syncGoalFromBoard();
    updateTargetBar();
    return true;
  }

  // 💥 机关直接判负（炸弹爆炸 / 藤蔓铺满）
  function failByHazard(reason) {
    S.failReason = reason;
    AudioManager.playSFX('gameover');
    toast('💥 ' + reason);
    if (S.playing) endGame();
  }

  // 顶栏下面那排机关提示（没有机关的关卡整条隐藏，不占高度）
  function updateHazardBar() {
    const bar = $('hazard-bar');
    if (!bar) return;
    const chips = [];
    if (S.frostTurns > 0) chips.push('❄️ 定格 <b>' + S.frostTurns + '</b> 步');
    const ivy = ivyCount();
    if (ivy) chips.push('🌿 常春藤 <b>' + ivy + '/' + IVY_FAIL + '</b>');
    if (boxCount()) chips.push('📦 保险箱 <b>' + boxCount() + '</b>');
    if (sandCount()) chips.push('🟫 流沙 <b>' + sandCount() + '</b>');
    const tb = tbombMin();
    if (tb) chips.push('⚠️ 炸弹 <b>' + tb + '</b> 步');
    if (fogCount()) chips.push('🌫️ 迷雾 <b>' + fogCount() + '</b>');
    if (S.portals && S.portals.length) chips.push('🌀 传送门');
    if (S.trackRows && S.trackRows.length) chips.push('🚄 移动轨道');
    bar.innerHTML = chips.map((c) => '<span class="hazard-chip">' + c + '</span>').join('');
    bar.style.display = chips.length ? 'flex' : 'none';
  }

  // 每步结束后的机关结算（在 afterTurn 里调；霜块定格期间一律跳过）
  function tickHazards() {
    S.turnCount++;
    const frozen = S.frostTurns > 0;
    if (frozen) S.frostTurns--;
    let boom = false;
    if (!frozen) {
      // ⚠️ 步数炸弹倒计时
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!S.tbomb[r] || !S.tbomb[r][c]) continue;
          S.tbomb[r][c]--;
          if (S.tbomb[r][c] <= 0) { S.tbomb[r][c] = 0; boom = true; }
        }
      }
      if (S.turnCount % IVY_EVERY === 0) growIvy();
      if (S.turnCount % SAND_EVERY === 0) burySand();
      if (S.turnCount % TRACK_EVERY === 0) shiftTrack();
      if (S.turnCount % FROST_EVERY === 0 && S.hazardLevel) spawnFrost();
    }
    updateHazardBar();
    drawStatic();
    if (boom) { failByHazard('步数炸弹爆炸'); return; }
    if (ivyCount() >= IVY_FAIL) { failByHazard('常春藤铺满了棋盘'); return; }
  }

  // 冰块层数总量（仅用于提示 / 统计）
  function iceTotal() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) n += (S.ice[r] && S.ice[r][c]) || 0;
    return n;
  }

  // 冰块「格」数：玩家眼睛数的是几块冰，关卡目标就得跟它一致
  function iceCells() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) if (S.ice[r] && S.ice[r][c] > 0) n++;
    }
    return n;
  }

  // 目标数永远 = 「已完成 + 场上还剩」：
  //  · 冰块按格算（厚冰也算一块），果冻按格算，钥匙 / 奶龙按只算
  // 开局、读档、每次结算后都同步一次。这样关卡数据写错、或者中途出意外，
  // 都不会出现「要求 5 只、场上只有 4 只」这种永远打不过去的死局。
  function syncGoalFromBoard() {
    const g = S.goal;
    if (!g) return;
    if (g.type === 'ice') {
      g.target = Math.max(1, (g.iceCleared || 0) + iceCells());
      return;
    }
    if (g.type === 'clear') {
      let cells = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) if (S.jelly[r] && S.jelly[r][c]) cells++;
      }
      g.target = Math.max(1, (g.jellyCleared || 0) + cells);
      return;
    }
    if (g.type !== 'drop' && g.type !== 'rescue') return;
    let keys = 0, nailongs = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        cargoList(S.board[r] && S.board[r][c]).forEach((cg) => {
          if (cg.kind === 'nailong') nailongs++;
          else keys++;
        });
      }
    }
    if (g.type === 'drop') g.target = Math.max(1, (g.cargoGot || 0) + keys);
    else g.target = Math.max(1, (g.rescueGot || 0) + nailongs);
  }

  // 砸掉一层冰（返回是否真的砸掉了）
  // 厚冰得砸两次：同一步之内（掉落连消 / 特殊块波及都算同一步）每格最多砸一层
  function crackIceAt(r, c) {
    if (!S.ice[r] || !S.ice[r][c]) return false;
    const k = kOf(r, c);
    if (S.iceHitMove && S.iceHitMove[k]) return false;
    if (!S.iceHitMove) S.iceHitMove = {};
    S.iceHitMove[k] = 1;
    S.ice[r][c]--;
    // 碎冰声：只裂一层是「咔」的闷响，整块砸透再加一串清脆的裂开声
    AudioManager.playSFX('ice', { final: S.ice[r][c] <= 0 });
    FX.burst(c * CELL + CELL / 2, r * CELL + CELL / 2, '#9fe8ff', 5);
    // 目标按「块」算：一整块冰彻底砸开才 +1（厚冰要砸透，进度才不会虚高）
    if (S.goal && S.ice[r][c] <= 0) {
      Goals.progress(S.goal, { ice: 1 });
      updateTargetBar();
    }
    Meta.bump('ice', 1);
    return true;
  }


  // 清除关：随机铺果冻
  function placeJelly() {
    if (!S.levelDef || S.levelDef.goal.type !== 'clear') return;
    const need = S.levelDef.goal.target;
    const cells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push({ r, c });
    shuffleArr(cells);
    const n = Math.min(need, cells.length);
    for (let i = 0; i < n; i++) S.jelly[cells[i].r][cells[i].c] = 1;
    S.jellyLeft = n;
  }

  function shuffleArr(a) {
    if (S.rng) return S.rng.shuffle(a);
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function findMatches() {
    const set = new Set();
    for (let r = 0; r < ROWS; r++) {
      let run = 1;
      for (let c = 1; c <= COLS; c++) {
        // 只有冰块挡三连；锁链可以参与连消（第一次被消只解链）
        const same = c < COLS && S.board[r][c] && S.board[r][c - 1]
          && S.board[r][c].type === S.board[r][c - 1].type
          && !isIced(r, c) && !isIced(r, c - 1);
        if (same) run++;
        else {
          if (run >= 3) for (let k = c - run; k < c; k++) set.add(kOf(r, k));
          run = 1;
        }
      }
    }
    for (let c = 0; c < COLS; c++) {
      let run = 1;
      for (let r = 1; r <= ROWS; r++) {
        const same = r < ROWS && S.board[r][c] && S.board[r - 1][c]
          && S.board[r][c].type === S.board[r - 1][c].type
          && !isIced(r, c) && !isIced(r - 1, c);
        if (same) run++;
        else {
          if (run >= 3) for (let k = r - run; k < r; k++) set.add(kOf(k, c));
          run = 1;
        }
      }
    }
    return set;
  }

  function hasPossibleMove() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        for (let d = 0; d < 2; d++) {
          const nr = r + (d === 1 ? 1 : 0), nc = c + (d === 0 ? 1 : 0);
          if (!inB(nr, nc)) continue;
          if (isLocked(r, c) || isLocked(nr, nc)) continue;   // 冻住/锁住的格子交换不了
          const a = S.board[r][c], b = S.board[nr][nc];
          S.board[r][c] = b; S.board[nr][nc] = a;
          const ok = findMatches().size > 0;
          S.board[r][c] = a; S.board[nr][nc] = b;
          if (ok) return true;
          // 两个特殊块相邻也算有解
          if (a && b && a.special !== T.NORMAL && b.special !== T.NORMAL) return true;
        }
      }
    }
    return false;
  }

  function findHint() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        for (let d = 0; d < 2; d++) {
          const nr = r + (d === 1 ? 1 : 0), nc = c + (d === 0 ? 1 : 0);
          if (!inB(nr, nc)) continue;
          if (isLocked(r, c) || isLocked(nr, nc)) continue;
          const a = S.board[r][c], b = S.board[nr][nc];
          S.board[r][c] = b; S.board[nr][nc] = a;
          const ok = findMatches().size > 0;
          S.board[r][c] = a; S.board[nr][nc] = b;
          if (ok) return [{ r, c }, { r: nr, c: nc }];
        }
      }
    }
    return null;
  }

  function reshuffle() {
    // 钥匙 / 奶龙钉死在原来的格子上：先把货物从方块上摘下来记好坐标，
    // 只让底下的方块参与洗牌，洗完再按原坐标贴回去。
    // （否则护送 / 运货关一洗牌货物就跑到别处，玩家会觉得目标被洗乱了）
    const pinned = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const b = S.board[r][c];
        if (b && b.cargo) { pinned.push({ r: r, c: c, cargo: b.cargo }); b.cargo = null; }
      }
    }
    const cells = [];   // 参与洗牌的方块池
    const slots = [];   // 这些方块可以落的位置（棋盘上所有有方块的格子）
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (S.board[r][c]) { cells.push(S.board[r][c]); slots.push([r, c]); }
      }
    }
    const putBack = () => {
      // 先清掉池子里所有方块的货物，再按原坐标贴回，
      // 否则上一次试排时贴上去的货会跟着方块一起被洗到别处，越洗越多
      for (let i = 0; i < cells.length; i++) cells[i].cargo = null;
      for (let i = 0; i < slots.length; i++) S.board[slots[i][0]][slots[i][1]] = cells[i];
      // 货物按原坐标贴回（不管落下来的是哪个方块，货都留在原地）
      pinned.forEach((p) => { if (S.board[p.r][p.c]) S.board[p.r][p.c].cargo = p.cargo; });
    };
    let tries = 0;
    do {
      shuffleArr(cells);
      putBack();
      tries++;
    } while ((findMatches().size > 0 || !hasPossibleMove()) && tries < 40);
    // 兜底：只重排图案，绝不清掉冰块 / 锁链 / 货物（否则障碍关会被洗牌洗回原点）
    if (findMatches().size > 0 || !hasPossibleMove()) {
      for (let attempt = 0; attempt < 60; attempt++) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (S.board[r][c] && !isLocked(r, c)) S.board[r][c].type = randType();
          }
        }
        if (findMatches().size === 0 && hasPossibleMove()) break;
      }
      putBack();
    }
  }

  // ==================== 渲染 ====================
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 特殊块独立外观（§19）：底纹 + 呼吸光晕
  function drawSpecialOverlay(type, x, y, s, cx, cy, t) {
    if (type === T.NORMAL) return;
    const meta = Specials.META[type];
    const pulse = 0.55 + 0.45 * Math.sin(t / 420);

    if (type === T.LINE_H || type === T.LINE_V) {
      // 十字架外观：纯白十字 + 深色描边 + 蓝色外发光；比格子略小一圈，不压住方块图案
      const th = Math.max(3.5, s * 0.17);          // 臂厚
      const longA = s * 0.18, longB = s * 0.82;    // 长臂范围（四周内缩）
      const drawBar = (x0, y0, x1, y1) => {
        roundRect(x0, y0, x1 - x0, y1 - y0, (y1 - y0) / 2);
        ctx.fill();
        ctx.stroke();
      };
      ctx.save();
      ctx.globalAlpha = 0.9 + 0.1 * pulse;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(20, 40, 90, 0.85)';
      ctx.lineWidth = Math.max(1.6, s * 0.045);
      ctx.shadowColor = 'rgba(47, 107, 255, 0.85)';
      ctx.shadowBlur = s * 0.16 * pulse;
      // 横臂（整行）+ 竖臂（整列）
      drawBar(x + longA, cy - th / 2, x + longB, cy + th / 2);
      drawBar(cx - th / 2, y + longA, cx + th / 2, y + longB);
      ctx.restore();
    } else if (type === T.BOMB) {
      // 只叠 emoji，不铺底色，方块原图完整可见
      ctx.save();
      ctx.globalAlpha = 0.85 + 0.15 * pulse;
      ctx.shadowColor = 'rgba(255, 80, 80, 0.9)';
      ctx.shadowBlur = s * 0.22 * pulse;
      ctx.font = (s * 0.68) + 'px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💣', cx, cy + s * 0.02);
      ctx.restore();
    } else if (type === T.RAINBOW) {
      // 只叠彩虹 emoji，不加白底（白底会盖住方块原图）
      ctx.save();
      ctx.globalAlpha = 0.88 + 0.12 * pulse;
      ctx.shadowColor = 'rgba(200, 92, 255, 0.9)';
      ctx.shadowBlur = s * 0.22 * pulse;
      ctx.font = (s * 0.72) + 'px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🌈', cx, cy + s * 0.02);
      ctx.restore();
    } else {
      // 🧲 磁铁 / 🎨 颜料 / ❄️ 霜块 / 🛩️ 螺旋桨：统一走「emoji + 该类型颜色的光晕」
      const emo = { 5: '🧲', 6: '🎨', 7: '❄️', 8: '🛩️' }[type];
      const glow = { 5: 'rgba(255,92,138,0.95)', 6: 'rgba(255,154,60,0.95)', 7: 'rgba(92,200,255,0.95)', 8: 'rgba(47,199,184,0.95)' }[type];
      if (!emo) return;
      ctx.save();
      ctx.globalAlpha = 0.86 + 0.14 * pulse;
      ctx.shadowColor = glow;
      ctx.shadowBlur = s * 0.24 * pulse;
      ctx.font = (s * 0.66) + 'px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emo, cx, cy + s * 0.02);
      ctx.restore();
    }
  }

  // 方块底色：用方块自己的颜色调深 25%，替代原来的纯黑（棋盘整体变彩色）
  const BASE_COLOR = {};
  function tileBaseColor(type) {
    if (BASE_COLOR[type]) return BASE_COLOR[type];
    const m = /^#([0-9a-f]{6})$/i.exec(String(FALLBACK_COLORS[type] || ''));
    let out = 'rgb(93,69,191)';   // 兜底也是彩色（#7c5cff 调深 25%）
    if (m) {
      const n = parseInt(m[1], 16);
      out = 'rgb(' + Math.round(((n >> 16) & 255) * 0.75) + ',' +
        Math.round(((n >> 8) & 255) * 0.75) + ',' + Math.round((n & 255) * 0.75) + ')';
    }
    BASE_COLOR[type] = out;
    return out;
  }

  function tileEdgeColor(type) {
    const m = /^rgb\((\d+),(\d+),(\d+)\)$/.exec(String(tileBaseColor(type)));
    if (!m) return 'rgba(0,0,0,0.35)';
    return 'rgba(' + Math.round(Number(m[1]) * 0.72) + ',' +
      Math.round(Number(m[2]) * 0.72) + ',' + Math.round(Number(m[3]) * 0.72) + ',0.55)';
  }

  // opts: { alpha, scale, sx, sy }
  function drawBlock(px, py, block, opts) {
    if (!block) return;
    opts = opts || {};
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    const scale = opts.scale == null ? 1 : opts.scale;
    const sx = opts.sx == null ? 1 : opts.sx;
    const sy = opts.sy == null ? 1 : opts.sy;

    const base = CELL - 6;
    const w = base * scale * sx;
    const h = base * scale * sy;
    const cx = px + CELL / 2, cy = py + CELL / 2;
    const x = cx - w / 2, y = cy - h / 2;
    const radius = Math.max(4, Math.min(w, h) * 0.18);

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.30)';
    ctx.shadowBlur = base * 0.12;
    ctx.shadowOffsetY = base * 0.06;
    roundRect(x, y, w, h, radius);
    ctx.fillStyle = tileBaseColor(block.type);
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(x, y, w, h, radius);
    ctx.clip();
    const img = IMAGES[block.type];
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x, y, w, h);
    } else {
      ctx.fillStyle = FALLBACK_COLORS[block.type];
      ctx.fillRect(x, y, w, h);
    }
    const hl = ctx.createLinearGradient(x, y, x, y + h);
    hl.addColorStop(0, 'rgba(255,255,255,0.45)');
    hl.addColorStop(0.35, 'rgba(255,255,255,0.12)');
    hl.addColorStop(0.5, 'rgba(255,255,255,0)');
    hl.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = hl;
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    ctx.save();
    roundRect(x, y, w, h, radius);
    ctx.strokeStyle = tileEdgeColor(block.type);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    drawSpecialOverlay(block.special, x, y, Math.min(w, h), cx, cy, performance.now());
    ctx.restore();
  }

  function jellyAt(r, c) {
    return !!(S.jelly[r] && S.jelly[r][c]);
  }

  // 清掉一格果冻，返回是否真的清掉
  // （生成特殊块的那格不消除方块，但它是这次连消的一部分，果冻要跟着消）
  function clearJellyAt(r, c) {
    if (!jellyAt(r, c)) return false;
    S.jelly[r][c] = 0;
    S.jellyLeft = Math.max(0, S.jellyLeft - 1);
    return true;
  }

  // 果冻格：整格蓝色底 + 白色斜纹 + 粗蓝边；
  // 上面压着的方块会缩小一圈，让果冻完整露出来（原来方块几乎盖满，完全看不出果冻）
  function drawJelly(r, c) {
    if (!jellyAt(r, c)) return;
    const x = c * CELL, y = r * CELL;
    const pad = 1.5;
    const w = CELL - pad * 2;
    ctx.save();
    const g = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
    g.addColorStop(0, '#d9f3ff');
    g.addColorStop(1, '#4fc1ee');
    ctx.fillStyle = g;
    roundRect(x + pad, y + pad, w, w, 10);
    ctx.fill();

    ctx.save();
    roundRect(x + pad, y + pad, w, w, 10);
    ctx.clip();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    for (let i = -CELL; i < CELL * 2; i += 11) {
      ctx.beginPath();
      ctx.moveTo(x + i, y - 2);
      ctx.lineTo(x + i + CELL, y + CELL + 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = '#1e88e5';
    ctx.lineWidth = 3.5;
    roundRect(x + pad, y + pad, w, w, 10);
    ctx.stroke();
    ctx.restore();
  }

  // 果冻层：任何一帧绘制都必须先铺这一层，
  // 否则动画帧漏画会让果冻在每一步的动画期间消失一下（看起来就是“一闪一闪”）
  function drawJellyLayer() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) drawJelly(r, c);
    }
  }

  // 果冻格上的方块缩放系数（留出果冻边）
  const JELLY_BLOCK_SCALE = 0.76;

  // 货物（钥匙 / 奶龙）：只有图案本身在发光（没有光圈、没有圆底、没有描边环）
  // 钥匙蓝光、奶龙金光，亮度随呼吸节奏起伏，棋盘上扫一眼就能找到
  // 奶龙用抠图 assets/nailong.png（加载完成前先用文字「奶龙」兜底）
  const NAILONG_IMG = new Image();
  NAILONG_IMG.src = './assets/nailong.png';
  // 抠图加载完成后作废已缓存兜底文字徽标，并重绘一次
  NAILONG_IMG.onload = () => { delete CARGO_SPRITES.nailong; NAILONG_SIL = null; if (!S.busy) drawStatic(); };

  // 奶龙抠图的纯黑剪影（描边用），按尺寸缓存一次
  let NAILONG_SIL = null;
  function nailongSilhouette(px, dpr) {
    const key = px + '@' + dpr;
    if (NAILONG_SIL && NAILONG_SIL.key === key) return NAILONG_SIL.cv;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(px));
    cv.height = Math.max(1, Math.round(px));
    const g = cv.getContext('2d');
    g.drawImage(NAILONG_IMG, 0, 0, cv.width, cv.height);
    g.globalCompositeOperation = 'source-in';   // 只留形状，全部涂黑
    g.fillStyle = '#000';
    g.fillRect(0, 0, cv.width, cv.height);
    NAILONG_SIL = { key: key, cv: cv };
    return cv;
  }

  // 🔑 emoji 的纯黑剪影（描边用），按尺寸缓存一次
  let KEY_EMOJI_SIL = null;
  function keyEmojiSilhouette(px, dpr) {
    const key = px + '@' + dpr;
    if (KEY_EMOJI_SIL && KEY_EMOJI_SIL.key === key) return KEY_EMOJI_SIL.cv;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(px));
    cv.height = Math.max(1, Math.round(px));
    const g = cv.getContext('2d');
    g.font = Math.round(cv.height * 0.9) + 'px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('🔑', cv.width / 2, cv.height * 0.54);
    g.globalCompositeOperation = 'source-in';   // 只留形状，全部涂黑
    g.fillStyle = '#000';
    g.fillRect(0, 0, cv.width, cv.height);
    KEY_EMOJI_SIL = { key: key, cv: cv };
    return cv;
  }

  // 钥匙徽标：直接画 🔑 emoji（用户指定样式）。
  // 彩色 emoji 字形在绝大多数浏览器里不吃 strokeText，
  // 黑描边用「剪影沿 8 个方向铺一圈」实现，和奶龙抠图同一套做法。

  // 糖果：圆糖体 + 两端拧出来的糖纸，和钥匙一样纯路径画（emoji 吃不了黑描边）
  function drawCandyMark(g, cell, pulse) {
    const k = cell * 0.72;            // 糖果总宽
    const bodyR = k * 0.26;           // 糖体半径
    const wingL = k * 0.48;           // 糖纸尖到中心的距离
    const wingH = k * 0.17;           // 糖纸半高
    const notch = k * 0.075;          // 糖纸尖的分叉缺口

    // 背后一层粉色柔光
    g.save();
    g.shadowBlur = 0;
    const glow = g.createRadialGradient(0, 0, k * 0.05, 0, 0, k * 0.62);
    glow.addColorStop(0, 'rgba(255,140,190,' + (0.30 + 0.18 * pulse).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(255,140,190,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, 0, k * 0.62, 0, Math.PI * 2);
    g.fill();

    const paint = (fill) => {
      // 左糖纸（带分叉的燕尾）
      g.beginPath();
      g.moveTo(-bodyR * 0.6, 0);
      g.lineTo(-wingL, -wingH);
      g.lineTo(-wingL + notch, 0);
      g.lineTo(-wingL, wingH);
      g.closePath();
      if (fill) g.fill(); else g.stroke();
      // 右糖纸
      g.beginPath();
      g.moveTo(bodyR * 0.6, 0);
      g.lineTo(wingL, -wingH);
      g.lineTo(wingL - notch, 0);
      g.lineTo(wingL, wingH);
      g.closePath();
      if (fill) g.fill(); else g.stroke();
      // 圆糖体
      g.beginPath();
      g.arc(0, 0, bodyR, 0, Math.PI * 2);
      if (fill) g.fill(); else g.stroke();
    };

    g.save();
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // 1) 黑色加粗描一遍
    g.strokeStyle = '#000';
    g.lineWidth = Math.max(2.4, cell * 0.09);
    paint(false);
    // 2) 填色：糖纸稍深、糖体粉白渐变
    const wrap = g.createLinearGradient(-wingL, -wingH, wingL, wingH);
    wrap.addColorStop(0, '#ff8fc0');
    wrap.addColorStop(0.5, '#ffc3dd');
    wrap.addColorStop(1, '#ff8fc0');
    g.fillStyle = wrap;
    paint(true);
    // 糖体重填（盖掉糖纸填色侵入圆内的部分）
    const body = g.createRadialGradient(-bodyR * 0.35, -bodyR * 0.35, bodyR * 0.15, 0, 0, bodyR);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.55, '#ffd9e8');
    body.addColorStop(1, '#ff9ec6');
    g.beginPath();
    g.arc(0, 0, bodyR, 0, Math.PI * 2);
    g.fill();
    // 糖体上的斜条纹
    g.save();
    g.beginPath();
    g.arc(0, 0, bodyR, 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = 'rgba(255,110,170,0.75)';
    g.lineWidth = Math.max(1.6, cell * 0.055);
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(i * bodyR * 0.62 - bodyR, bodyR);
      g.lineTo(i * bodyR * 0.62 + bodyR, -bodyR);
      g.stroke();
    }
    g.restore();
    // 糖体左上一粒高光
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.beginPath();
    g.arc(-bodyR * 0.38, -bodyR * 0.4, bodyR * 0.18, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // 发光徽标很贵（shadowBlur 逐帧重绘会让低端机发烫卡顿），
  // 把徽标按「呼吸亮度档位」预渲染进离屏画布，运行时只做廉价 drawImage
  const CARGO_SPRITES = {};   // kind -> { cell, dpr, m: { 档位: canvas } }
  function cargoSprite(kind, pulse) {
    const isN = kind === 'nailong';
    const isC = kind === 'candy';
    const rgb = isN ? '255,186,60' : (isC ? '255,140,190' : '110,200,255');
    // 徽标按屏幕物理像素栅格化（DPR 倍，封顶 2 省内存），再按逻辑尺寸 drawImage 回去，
    // 高分屏上钥匙 / 奶龙边缘才不糊
    const dpr = Math.min(2, Math.max(1, DPR || 1));
    let c = CARGO_SPRITES[kind];
    if (!c || c.cell !== CELL || c.dpr !== dpr) { c = { cell: CELL, dpr: dpr, m: {} }; CARGO_SPRITES[kind] = c; }
    const bucket = Math.min(7, Math.max(0, Math.round(pulse * 7)));   // 8 档足够平滑
    let sp = c.m[bucket];
    if (sp) return sp;

    const size = Math.ceil(CELL * 2.2);
    sp = document.createElement('canvas');
    sp.width = Math.round(size * dpr);
    sp.height = Math.round(size * dpr);
    const g = sp.getContext('2d');
    g.scale(dpr, dpr);              // 之后所有坐标都按逻辑 px 写
    g.translate(size / 2, size / 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(' + rgb + ',' + (0.70 + 0.30 * pulse).toFixed(3) + ')';
    g.shadowBlur = CELL * (0.26 + 0.22 * pulse);
    // 统一黑色描边：钥匙 / 奶龙都勾一圈黑边，在任何底图上都看得清轮廓
    const outline = Math.max(1.4, CELL * 0.05);
    if (isN && NAILONG_IMG.complete && NAILONG_IMG.naturalWidth) {
      const s = CELL * 0.66;
      const sil = nailongSilhouette(Math.round(s * dpr), dpr);
      // 先用剪影铺一层淡光晕，再沿 8 个方向铺黑边
      g.shadowBlur = CELL * (0.18 + 0.10 * pulse);
      g.drawImage(sil, -s / 2, -s / 2, s, s);
      g.shadowBlur = 0;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        g.drawImage(sil, -s / 2 + Math.cos(a) * outline, -s / 2 + Math.sin(a) * outline, s, s);
      }
      // 图案本体
      g.drawImage(NAILONG_IMG, -s / 2, -s / 2, s, s);
    } else if (isN) {
      // 抠图还没加载完：先拿文字兜底
      const px = Math.round(CELL * 0.54);
      g.font = px + 'px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif';
      g.lineJoin = 'round';
      g.lineWidth = Math.max(3, CELL * 0.13);
      g.strokeStyle = '#000';
      g.strokeText('奶龙', 0, 1);
      g.strokeText('奶龙', 0, 1);
      g.shadowBlur = CELL * 0.16;
      g.fillText('奶龙', 0, 1);
      g.fillText('奶龙', 0, 1);
    } else if (isC) {
      // 糖果：圆糖体 + 两端糖纸，纯路径画黑描边
      drawCandyMark(g, CELL, pulse);
    } else {
      // 钥匙：🔑 emoji 本体 + 剪影沿 8 向铺黑边（彩色字形吃不了 strokeText），
      // 外面再保留原本那层蓝光呼吸
      const s = CELL * 0.66;
      const sil = keyEmojiSilhouette(Math.round(s * dpr), dpr);
      g.shadowBlur = 0;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        g.drawImage(sil, -s / 2 + Math.cos(a) * outline, -s / 2 + Math.sin(a) * outline, s, s);
      }
      g.font = Math.round(s * 0.9) + 'px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif';
      g.shadowBlur = CELL * (0.26 + 0.22 * pulse);
      g.fillText('🔑', 0, s * 0.04);
    }
    c.m[bucket] = sp;
    return sp;
  }

  function drawCargoBadge(cx, cy, kind, shrink) {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const pulse = 0.5 + 0.5 * Math.sin(now / 1000 * 3.4);
    // 呼吸放大缩小：最大就是原来的大小，最小只小一点点
    const scale = (0.88 + 0.12 * pulse) * (shrink || 1);
    const sp = cargoSprite(kind, pulse);
    // 位图按 DPR（封顶 2）栅格化，显示时按同一个系数换算回逻辑尺寸，大小才和以前一致
    const dpr = Math.min(2, Math.max(1, DPR || 1));
    const w = (sp.width / dpr) * scale;
    ctx.drawImage(sp, cx - w / 2, cy - w / 2, w, w);
  }

  // 一格上压着多件货（允许重合）：第一件画正中，后面的缩小一圈往左上错开，
  // 一眼能看出这里叠了两件 / 三件
  function drawCargoStack(cx, cy, list) {
    if (!list || !list.length) return;
    // 先画缩小错位的那几件（垫在后面），最后画正中那件盖上去
    for (let i = list.length - 1; i >= 1; i--) {
      const off = CELL * 0.20 * (1 + (i - 1) * 0.35);
      drawCargoBadge(cx - off, cy - off, list[i].kind, 0.58);
    }
    drawCargoBadge(cx, cy, list[0].kind, 1);
  }

  // 静态重绘（无动画）
  // 冰块 / 锁链 / 货物徽标 / 提示高亮：统一在方块画完之后叠一层
  // opts.skip：这些格子先不画覆盖层（动画里要自己画在移动中的位置）
  // opts.cargoAt：这些格子的货物改画在指定 y（跟随下落）
  function drawCellOverlays(opts) {
    opts = opts || {};
    const skip = opts.skip || null;
    const cargoAt = opts.cargoAt || null;
    const now = performance.now();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL, y = r * CELL;
        const b = S.board[r] && S.board[r][c];
        const k = kOf(r, c);

        // 货物：贴在方块上的钥匙 / 奶龙（一格可能压着多件，允许重合）
        if (b && !(skip && skip[k])) {
          const list = cargoList(b);
          if (list.length) {
            const cy = (cargoAt && cargoAt[k] != null) ? cargoAt[k] : y;
            drawCargoStack(x + CELL / 2, cy + CELL / 2, list);
          }
        }

        // 🟫 流沙：方块陷在沙里，底行的沙会把送货路堵住
        if (S.sand[r] && S.sand[r][c]) {
          ctx.save();
          const sg = ctx.createLinearGradient(x, y, x, y + CELL);
          sg.addColorStop(0, 'rgba(219,183,124,0.62)');
          sg.addColorStop(1, 'rgba(163,116,58,0.80)');
          ctx.fillStyle = sg;
          roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 9);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,241,205,0.6)';
          for (let i = 0; i < 7; i++) {
            ctx.fillRect(x + 6 + ((i * 37) % Math.max(1, CELL - 14)),
              y + 8 + ((i * 53) % Math.max(1, CELL - 18)), 2, 2);
          }
          ctx.strokeStyle = 'rgba(139,96,44,0.9)';
          ctx.lineWidth = 2;
          roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 9);
          ctx.stroke();
          ctx.restore();
        }

        // 🌀 传送门：紫色漩涡，成对出现
        if (S.portalAt[r] && S.portalAt[r][c]) {
          ctx.save();
          ctx.translate(x + CELL / 2, y + CELL / 2);
          const tt = now / 700;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(138,92,255,' + (0.75 - i * 0.18) + ')';
            ctx.lineWidth = 2.4;
            ctx.arc(0, 0, CELL * (0.14 + i * 0.1), tt + i * 1.1, tt + i * 1.1 + 2.1);
            ctx.stroke();
          }
          ctx.font = Math.round(CELL * 0.34) + 'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🌀', 0, 0);
          ctx.restore();
        }

        // 🌿 常春藤
        if (S.ivy[r] && S.ivy[r][c]) {
          ctx.save();
          roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 9);
          ctx.fillStyle = 'rgba(70,178,92,0.30)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(47,158,72,0.95)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 5, y + CELL - 5);
          ctx.quadraticCurveTo(x + CELL * 0.3, y + CELL * 0.45, x + CELL - 5, y + 6);
          ctx.stroke();
          ctx.fillStyle = '#4fd06a';
          [[0.26, 0.70], [0.44, 0.50], [0.66, 0.32]].forEach((q) => {
            ctx.beginPath();
            ctx.ellipse(x + CELL * q[0], y + CELL * q[1], CELL * 0.13, CELL * 0.085, -0.7, 0, Math.PI * 2);
            ctx.fill();
          });
          ctx.restore();
        }

        // 📦 保险箱：木箱 + 剩余敲击次数
        if (S.box[r] && S.box[r][c] > 0) {
          ctx.save();
          roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 8);
          ctx.fillStyle = 'rgba(198,146,74,0.92)';
          ctx.fill();
          ctx.strokeStyle = '#8a5c25';
          ctx.lineWidth = 2.4;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + CELL - 2, y + CELL - 2);
          ctx.moveTo(x + CELL - 2, y + 2); ctx.lineTo(x + 2, y + CELL - 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(120,80,28,0.75)';
          ctx.stroke();
          ctx.font = Math.round(CELL * 0.42) + 'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('📦', x + CELL / 2, y + CELL / 2);
          for (let i = 0; i < S.box[r][c]; i++) {
            ctx.beginPath();
            ctx.fillStyle = '#fff6de';
            ctx.arc(x + CELL - 8 - i * 6, y + 8, 2.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }

        // ⚠️ 步数炸弹：红色倒计时（归零直接判负，消掉这一格可以拆）
        if (S.tbomb[r] && S.tbomb[r][c] > 0) {
          ctx.save();
          roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 8);
          ctx.fillStyle = 'rgba(190,50,50,0.78)';
          ctx.fill();
          ctx.strokeStyle = '#7d1d1d';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.font = Math.round(CELL * 0.34) + 'px "Apple Color Emoji","Segoe UI Emoji",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚠️', x + CELL / 2, y + CELL * 0.36);
          ctx.fillStyle = '#fff';
          ctx.font = 'bold ' + Math.round(CELL * 0.34) + 'px system-ui, sans-serif';
          ctx.fillText(String(S.tbomb[r][c]), x + CELL / 2, y + CELL * 0.72);
          ctx.restore();
        }

        // 🌫️ 迷雾：盖住这一格（方块 / 货物都看不见），消掉旁边才显形
        if (S.fog[r] && S.fog[r][c]) {
          ctx.save();
          roundRect(x + 1, y + 1, CELL - 2, CELL - 2, 9);
          ctx.fillStyle = 'rgba(196,199,212,0.94)';
          ctx.fill();
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = '#eceef6';
          ctx.beginPath();
          ctx.arc(x + CELL * 0.34, y + CELL * 0.36, CELL * 0.24, 0, Math.PI * 2);
          ctx.arc(x + CELL * 0.64, y + CELL * 0.44, CELL * 0.28, 0, Math.PI * 2);
          ctx.arc(x + CELL * 0.46, y + CELL * 0.66, CELL * 0.24, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // 冰块
        const ice = S.ice[r] ? S.ice[r][c] : 0;
        if (ice > 0) {
          ctx.save();
          roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 9);
          // 层数越多越实：3 层（厚冰）> 2 层（新冰）> 1 层（砸过一次）
          ctx.fillStyle = ice >= 3 ? 'rgba(130,205,250,0.72)'
            : ice === 2 ? 'rgba(150,220,255,0.60)' : 'rgba(205,240,255,0.30)';
          ctx.fill();
          ctx.strokeStyle = ice > 1 ? 'rgba(70,165,225,0.95)' : 'rgba(150,215,245,0.75)';
          ctx.lineWidth = 2;
          ctx.stroke();
          // 白色裂纹：冰块一出现就是五道裂（厚冰/薄冰只靠透明度区分）
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1.4;
          ICE_CRACKS.forEach((p) => {
            ctx.beginPath();
            ctx.moveTo(x + CELL * p[0], y + CELL * p[1]);
            ctx.lineTo(x + CELL * p[2], y + CELL * p[3]);
            ctx.lineTo(x + CELL * p[4], y + CELL * p[5]);
            ctx.stroke();
          });
          ctx.restore();
        }

        // 锁链
        if (S.chain[r] && S.chain[r][c]) {
          ctx.save();
          roundRect(x + 3, y + 3, CELL - 6, CELL - 6, 8);
          ctx.fillStyle = 'rgba(86,92,108,0.28)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(66,72,88,0.9)';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(x + 6, y + 6); ctx.lineTo(x + CELL - 6, y + CELL - 6);
          ctx.moveTo(x + CELL - 6, y + 6); ctx.lineTo(x + 6, y + CELL - 6);
          ctx.stroke();
          ctx.font = Math.round(CELL * 0.28) + 'px serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('🔗', x + CELL / 2, y + CELL / 2);
          ctx.restore();
        }

        // 提示：脉动虚线框
        if (S.hintCells && now < S.hintUntil) {
          const on = S.hintCells.some((p) => p.r === r && p.c === c);
          if (on) {
            const k = 0.5 + 0.5 * Math.sin(now / 180);
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(124,92,255,' + (0.45 + 0.45 * k) + ')';
            roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 10);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }
  }

  // 棋盘上有没有货物（有就每帧重绘，让钥匙/奶龙呼吸起来）
  function boardHasCargo() {
    for (let r = 0; r < S.board.length; r++) {
      const row = S.board[r];
      for (let c = 0; c < (row || []).length; c++) {
        if (row[c] && row[c].cargo) return true;
      }
    }
    return false;
  }

  function drawStatic() {
    if (!ctx) return;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    roundRect(0, 0, VIEW_W, VIEW_H, 12);
    ctx.clip();

    const shake = FX.getShakeOffset();
    ctx.translate(shake.x, shake.y);

    drawJellyLayer();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (S.board[r] && S.board[r][c]) {
          drawBlock(c * CELL, r * CELL, S.board[r][c], jellyAt(r, c) ? { scale: JELLY_BLOCK_SCALE } : null);
        }
      }
    }

    // 选中框：黑色（棋盘配色里的「黑色款」已改为彩色，这里的框保持黑）
    if (S.selected) {
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3;
      roundRect(S.selected.c * CELL + 2, S.selected.r * CELL + 2, CELL - 4, CELL - 4, 10);
      ctx.stroke();
    }

    // 幽灵预览（§13）
    if (S.dragTo && inB(S.dragTo.r, S.dragTo.c) && S.selected) {
      const from = S.selected, to = S.dragTo;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#7c5cff';
      ctx.lineWidth = 3;
      roundRect(to.c * CELL + 2, to.r * CELL + 2, CELL - 4, CELL - 4, 10);
      ctx.stroke();
      ctx.restore();

      const a = S.board[from.r][from.c], b = S.board[to.r][to.c];
      if (a && b) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        drawBlock(to.c * CELL, to.r * CELL, a, { alpha: 0.5 });
        drawBlock(from.c * CELL, from.r * CELL, b, { alpha: 0.5 });
        ctx.restore();
      }
    }

    // 摇头（§16）
    if (S.shakeCell) {
      const { from, to, t0 } = S.shakeCell;
      const p = (performance.now() - t0) / 220;
      if (p < 1) {
        const ang = Math.sin(p * Math.PI * 3) * 0.14;
        [from, to].forEach((p2) => {
          const b = S.board[p2.r][p2.c];
          if (!b) return;
          ctx.save();
          ctx.translate(p2.c * CELL + CELL / 2, p2.r * CELL + CELL / 2);
          ctx.rotate(ang);
          ctx.translate(-(p2.c * CELL + CELL / 2), -(p2.r * CELL + CELL / 2));
          drawBlock(p2.c * CELL, p2.r * CELL, b);
          ctx.restore();
        });
      } else {
        S.shakeCell = null;
      }
    }

    // 覆盖层（冰 / 锁链 / 货物 / 提示）必须画在方块和摇头重绘之后，
    // 否则「点冰块再点相邻格」的摇头动画会把冰层盖掉，看起来像冰块消失了一下
    drawCellOverlays();

    FX.render(ctx);
    ctx.restore();
  }

  // 单帧绘制（供动画用）
  function frameDraw(custom) {
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    roundRect(0, 0, VIEW_W, VIEW_H, 12);
    ctx.clip();
    const shake = FX.getShakeOffset();
    ctx.translate(shake.x, shake.y);
    drawJellyLayer();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (S.board[r] && S.board[r][c]) {
          let o = custom ? custom(r, c, S.board[r][c]) : null;
          if (jellyAt(r, c)) {
            o = Object.assign({}, o || {});
            o.scale = (o.scale == null ? 1 : o.scale) * JELLY_BLOCK_SCALE;
          }
          drawBlock(c * CELL, r * CELL, S.board[r][c], o);
        }
      }
    }
    drawCellOverlays();
    FX.render(ctx);
    ctx.restore();
  }

  // ==================== 动画 ====================
  // 动画补间：优先 rAF；同时挂一个超时兜底，防止 rAF 不回调（后台标签页 / 无头环境）时流程永久挂起
  function tween(dur, onFrame) {
    return new Promise((resolve) => {
      const start = performance.now();
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve();
      };
      const guard = setTimeout(() => {
        if (settled) return;
        onFrame(1);
        done();
      }, dur + 260);
      function step(now) {
        if (settled) return;
        const p = Math.min(1, (now - start) / dur);
        onFrame(p);
        if (p < 1) requestAnimationFrame(step);
        else done();
      }
      requestAnimationFrame(step);
    });
  }

  function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }

  // 结算面板：数字从 0 滚到目标分值
  // 用 setInterval 而不是 rAF —— 切后台 / 无头环境时 rAF 会停，数字就会卡住不动
  function countUp(el, to, dur, onDone) {
    if (!el) return;
    const target = Math.max(0, Math.round(to));
    dur = dur || 720;
    const start = performance.now();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      el.textContent = target;
      if (onDone) onDone();
    };
    el.textContent = '0';
    const timer = setInterval(() => {
      if (settled) return;
      const p = Math.min(1, (performance.now() - start) / dur);
      el.textContent = Math.round(easeOutCubic(p) * target);
      if (p >= 1) finish();
    }, 16);
  }

  // 结算面板：星星逐颗弹出（与桌面预览同款节奏）
  function popStars(starEls, stars, delay) {
    const list = [];
    for (let i = 0; i < starEls.length; i++) list.push(starEls[i]);
    list.forEach((el) => el.classList.remove('on'));
    for (let i = 0; i < list.length && i < stars; i++) {
      setTimeout(() => list[i].classList.add('on'), (delay || 0) + i * 190);
    }
  }

  async function animateSwap(a, b) {
    const ax = a.c * CELL, ay = a.r * CELL;
    const bx = b.c * CELL, by = b.r * CELL;
    const ta = S.board[a.r][a.c], tb = S.board[b.r][b.c];
    await tween(140, (p) => {
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      ctx.save();
      roundRect(0, 0, VIEW_W, VIEW_H, 12);
      ctx.clip();
      const shake = FX.getShakeOffset();
      ctx.translate(shake.x, shake.y);
      drawJellyLayer(); // 交换动画也要铺果冻层，否则果冻会闪
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if ((r === a.r && c === a.c) || (r === b.r && c === b.c)) continue;
        if (S.board[r][c]) {
          drawBlock(c * CELL, r * CELL, S.board[r][c], jellyAt(r, c) ? { scale: JELLY_BLOCK_SCALE } : null);
        }
      }
      // 移动中的两块按出发格 → 目标格的果冻缩放平滑过渡，避免中途跳变
      const aScale = jellyAt(a.r, a.c) ? JELLY_BLOCK_SCALE : 1;
      const bScale = jellyAt(b.r, b.c) ? JELLY_BLOCK_SCALE : 1;
      drawBlock(ax + (bx - ax) * e, ay + (by - ay) * e, ta, { scale: aScale + (bScale - aScale) * e });
      drawBlock(bx + (ax - bx) * e, by + (ay - by) * e, tb, { scale: bScale + (aScale - bScale) * e });
      // 覆盖层（冰块 / 锁链 / 货物）必须每帧都画，否则交换时它们会「闪一下不见了」
      const skip = {};
      skip[kOf(a.r, a.c)] = 1;
      skip[kOf(b.r, b.c)] = 1;
      drawCellOverlays({ skip: skip });
      if (ta) drawCargoStack(ax + (bx - ax) * e + CELL / 2, ay + (by - ay) * e + CELL / 2, cargoList(ta));
      if (tb) drawCargoStack(bx + (ax - bx) * e + CELL / 2, by + (ay - by) * e + CELL / 2, cargoList(tb));
      FX.render(ctx);
      ctx.restore();
    });
  }

  // 消除动画：先放大再缩小（§14 重量感）
  async function animateClear(cells, comboN) {
    await tween(200, (p) => {
      let scale, alpha;
      if (p < 0.35) {
        const q = p / 0.35;
        scale = 1 + 0.14 * q;
        alpha = 1;
      } else {
        const q = (p - 0.35) / 0.65;
        scale = 1.14 * (1 - q);
        alpha = 1 - q;
      }
      frameDraw((r, c) => {
        if (cells.has(kOf(r, c))) return { scale, alpha };
        return null;
      });
    });
  }

  async function animateDrop(fallFrom) {
    await tween(200, (p) => {
      const e = easeOutCubic(p);
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      ctx.save();
      roundRect(0, 0, VIEW_W, VIEW_H, 12);
      ctx.clip();
      const shake = FX.getShakeOffset();
      ctx.translate(shake.x, shake.y);
      drawJellyLayer();
      const cargoAt = {};        // 货物跟着方块一起往下掉，不能停在原位闪一下
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!S.board[r][c]) continue;
          const fromR = fallFrom[kOf(r, c)];
          const opts = jellyAt(r, c) ? { scale: JELLY_BLOCK_SCALE } : null;
          if (fromR !== undefined && fromR !== r) {
            const y = (fromR * CELL) + (r * CELL - fromR * CELL) * e;
            drawBlock(c * CELL, y, S.board[r][c], opts);
            if (S.board[r][c].cargo) cargoAt[kOf(r, c)] = y;
          } else {
            drawBlock(c * CELL, r * CELL, S.board[r][c], opts);
          }
        }
      }
      drawCellOverlays({ cargoAt: cargoAt });
      FX.render(ctx);
      ctx.restore();
    });
  }

  // ==================== 连击 ====================
  function comboMult(n) {
    return MULT[Math.min(n, MULT.length - 1)];
  }

  // ==================== 狂热模式（连击 x4 触发 6 秒双倍） ====================
  // 表现：顶栏一枚静态倒计时小标（🔥 双倍 6s → 5s …），棋盘不再呼吸闪动 / 忽明忽暗
  const FRENZY_MS = 6000;
  let frenzyTimer = null;
  let frenzyTick = null;
  function frenzyActive() {
    return performance.now() < S.frenzyUntil;
  }
  function frenzyMult() {
    return frenzyActive() ? 2 : 1;
  }
  function paintFrenzy() {
    const chip = $('frenzy-chip');
    if (!chip) return;
    const left = Math.max(0, S.frenzyUntil - performance.now());
    const sec = Math.max(1, Math.ceil(left / 1000));
    const num = $('frenzy-left');
    if (num) num.textContent = sec;
    chip.style.display = left > 0 ? 'inline-flex' : 'none';
  }
  function stopFrenzy() {
    if (frenzyTimer) { clearTimeout(frenzyTimer); frenzyTimer = null; }
    if (frenzyTick) { clearInterval(frenzyTick); frenzyTick = null; }
    S.frenzyUntil = 0;
    document.body.classList.remove('frenzy');
    const chip = $('frenzy-chip');
    if (chip) chip.style.display = 'none';
  }
  function startFrenzy() {
    S.frenzyUntil = performance.now() + FRENZY_MS;
    document.body.classList.add('frenzy');
    paintFrenzy();
    AudioManager.playSFX('star', { stars: 3 });
    if (frenzyTick) clearInterval(frenzyTick);
    frenzyTick = setInterval(paintFrenzy, 200);
    if (frenzyTimer) clearTimeout(frenzyTimer);
    frenzyTimer = setTimeout(() => {
      stopFrenzy();
      drawStatic();
    }, FRENZY_MS);
  }

  // ==================== 节奏关：踩到节拍上额外 1.5 倍 ====================
  const BEAT_MS = 620;          // ≈97 BPM
  function beatMult() {
    if (S.mode !== 'rhythm' || !S.playing) return 1;
    const t = performance.now() % BEAT_MS;
    const d = Math.min(t, BEAT_MS - t);
    return d < 170 ? 1.5 : 1;
  }
  function beatBonus() {
    return beatMult() > 1;
  }

  // 节拍条：光点从左走到最右端 = 一个节拍；拍点会「滴答」一声并闪一下。
  // 以前只有分数暗地里 ×1.5，玩家根本不知道拍子在哪，现在看得见也听得见。
  let beatTimer = null;
  let beatIdx = -1;
  const BEAT_HIT_PHASE = 0.27;   // ±170ms / 620ms

  function stopBeatLoop() {
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
    const bar = $('beat-bar');
    if (bar) bar.style.display = 'none';
    beatIdx = -1;
  }

  function startBeatLoop() {
    const bar = $('beat-bar');
    const on = S.mode === 'rhythm' && S.playing && !S.paused;
    if (bar) bar.style.display = on ? 'flex' : 'none';
    if (!on) { stopBeatLoop(); return; }
    if (beatTimer) return;
    beatIdx = -1;
    tickBeat();
    beatTimer = setInterval(tickBeat, 40);
  }

  function tickBeat() {
    if (!(S.mode === 'rhythm' && S.playing && !S.paused)) { stopBeatLoop(); return; }
    const now = performance.now();
    const idx = Math.floor(now / BEAT_MS);
    const phase = (now % BEAT_MS) / BEAT_MS;
    const fill = $('beat-fill');
    const dot = $('beat-dot');
    const hitEl = $('beat-hit');
    if (fill) fill.style.width = Math.round(phase * 100) + '%';
    if (dot) {
      dot.style.left = Math.round(phase * 100) + '%';
      dot.classList.toggle('hot', phase > 1 - BEAT_HIT_PHASE || phase < BEAT_HIT_PHASE);
    }
    if (idx !== beatIdx) {
      beatIdx = idx;
      AudioManager.playSFX('beat', { accent: idx % 4 === 0 });
      if (dot) {
        dot.classList.remove('pulse');
        void dot.offsetWidth;
        dot.classList.add('pulse');
      }
    }
    if (hitEl) hitEl.textContent = (phase > 1 - BEAT_HIT_PHASE || phase < BEAT_HIT_PHASE) ? '就是现在！' : '';
  }

  function bumpCombo() {
    const now = performance.now();
    if (now - S.lastClearAt > COMBO_WINDOW) S.combo = 1;
    else S.combo++;
    S.lastClearAt = now;
    S.comboUntil = now + COMBO_DECAY;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    if (S.combo >= 4 && !frenzyActive()) startFrenzy();
    updateComboBar();
    if (S.combo >= 3) AudioManager.setDrum(true);
    else AudioManager.setDrum(false);
    if (S.combo >= 4) Tasks.report('combo4', 1);
    if (S.combo >= 3) Tasks.report('combo3', 1);   // 每日任务：单局连击达到 x3
  }

  // 倍数/连击显示：棋盘中央横幅（#center-banner），每次连击升级重放弹出动画
  let shownCombo = 0;
  function updateComboBar() {
    const banner = $('center-banner');
    if (!banner) return;
    const now = performance.now();
    const txt = $('center-banner-text');
    if (S.combo >= 2 && now < S.comboUntil) {
      if (S.combo !== shownCombo) {
        shownCombo = S.combo;
        if (txt) txt.textContent = 'x' + S.combo + ' 连击 · ' + comboMult(S.combo) + ' 倍';
        // 重新触发缩放弹出动画
        banner.classList.remove('show');
        void banner.offsetWidth;
        banner.classList.add('show', 'type-combo');
      }
    } else if (shownCombo !== 0) {
      shownCombo = 0;
      banner.classList.remove('show');
    }
  }

  // ==================== 核心消除流程 ====================
  async function resolveBoard(swapPos) {
    let round = 0;
    while (true) {
      const matched = findMatches();
      if (matched.size === 0) break;
      round++;

      const runs = Specials.detectRuns(S.board, ROWS, COLS);
      const lShapes = SpecsL(runs);
      const plan = Specials.planCreation(S.board, matched, swapPos, runs, lShapes);

      // 统计 4 连任务
      if (runs.some((x) => x.len === 4)) Tasks.report('match4', 1);

      // 生成特殊块：从待消除集合里剔除该格
      // 定点已经有东西（货物 / 冰 / 锁链 / 特殊块）时，改放到这一轮要消掉的别的空格上；
      // 实在没有空位就不生成，绝不把两样东西叠在同一个方块上。
      let planAt = null;
      if (plan) {
        if (canPlaceNew(plan.r, plan.c)) planAt = { r: plan.r, c: plan.c };
        else planAt = pickSpotIn(matched);
      }
      if (plan && planAt) {
        markSpecial(planAt.r, planAt.c, plan.type);
        matched.delete(kOf(planAt.r, planAt.c));
        // 这一格虽然要留下来变成特殊块（不消除方块），但它属于本次连消，
        // 底下的果冻必须一起消掉，否则果冻关永远清不完
        if (clearJellyAt(planAt.r, planAt.c)) {
          Tasks.report('jelly', 1);
          if (S.goal) {
            Goals.progress(S.goal, { jelly: 1 });
            updateTargetBar();
          }
        }
        if (plan.type === T.RAINBOW) {
          FX.text(planAt.c * CELL + CELL / 2, planAt.r * CELL + CELL / 2, '生成彩虹 🌈', '#c85cff', 16);
          AudioManager.playSFX('coin');
        } else if (plan.type === T.BOMB) {
          FX.text(planAt.c * CELL + CELL / 2, planAt.r * CELL + CELL / 2, '生成炸弹 💣', '#ff5c5c', 16);
          AudioManager.playSFX('coin');
        } else if (plan.type === T.MAGNET) {
          FX.text(planAt.c * CELL + CELL / 2, planAt.r * CELL + CELL / 2, '生成磁铁 🧲', '#ff5c8a', 16);
          AudioManager.playSFX('coin');
        } else if (plan.type === T.PAINT) {
          FX.text(planAt.c * CELL + CELL / 2, planAt.r * CELL + CELL / 2, '生成颜料 🎨', '#ff9a3c', 16);
          AudioManager.playSFX('coin');
        } else if (plan.type === T.PROPELLER) {
          FX.text(planAt.c * CELL + CELL / 2, planAt.r * CELL + CELL / 2, '生成螺旋桨 🛩️', '#2fc7b8', 16);
          AudioManager.playSFX('coin');
        } else {
          FX.text(planAt.c * CELL + CELL / 2, planAt.r * CELL + CELL / 2, '生成线消', '#5c8fff', 16);
          AudioManager.playSFX('coin');
        }
        // 黑底提示条也报一声：这步生成了什么（浮字容易看漏）
        // 一步里连出好几个道具时逐条排队播，每一条都在同一个位置显示
        toastQueued('这步生成了「' + (SPECIAL_NAMES[plan.type] || '线消') + '」', 1500);
        swapPos = null; // 一局只生成一次，避免递归刷
      }

      if (matched.size === 0) break;

      // 展开特殊块连锁
      const expanded = Specials.expandClears(S.board, ROWS, COLS, matched, {});
      const cells = expanded.cells;

      await resolveClear(cells, expanded.boomPoints);
      swapPos = null;
    }
  }

  // 处理一次消除集合：统计 → 计分 → 目标推进 → 特效 → 动画 → 清除 → 掉落
  // （普通消除与「步数耗尽时自动引爆道具」共用同一套流程）
  // 处理一次消除集合：统计 → 计分 → 目标推进 → 特效 → 动画 → 清除 → 掉落
  // 冰块不直接消（砸一层），锁链第一次被消只解锁；被消掉的货物会从同列顶部重新掉下来
  async function resolveClear(cells, boomPoints) {
    if (!cells || !cells.size) return 0;
    boomPoints = boomPoints || [];

    // 1) 把「真消除」和「撞障碍」分开
    const clearSet = new Set();
    const iceHitList = [];
    const seenIce = {};
    let chainBroken = 0;

    const addIce = (r, c) => {
      if (!inB(r, c) || !isIced(r, c)) return;
      const key = kOf(r, c);
      if (seenIce[key]) return;
      seenIce[key] = 1;
      iceHitList.push({ r, c });
    };

    cells.forEach((k) => {
      const p = Specials.parse(k);
      if (isIced(p.r, p.c)) { addIce(p.r, p.c); return; }
      // 📦 保险箱：先敲箱子，箱子开着之前里面的东西拿不到
      if (isBoxed(p.r, p.c)) {
        chipBox(p.r, p.c);
        return;
      }
      if (isChained(p.r, p.c)) {
        S.chain[p.r][p.c] = 0;
        chainBroken++;
        FX.text(p.c * CELL + CELL / 2, p.r * CELL + CELL / 2, '解锁 🔗', '#8a93a3', 14);
        return;
      }
      clearSet.add(k);
    });
    // 相邻消除顺带砸冰
    clearSet.forEach((k) => {
      const p = Specials.parse(k);
      addIce(p.r - 1, p.c); addIce(p.r + 1, p.c);
      addIce(p.r, p.c - 1); addIce(p.r, p.c + 1);
    });
    iceHitList.forEach((p) => crackIceAt(p.r, p.c));
    if (chainBroken) AudioManager.playSFX('line');

    // 机关被波及：割藤蔓 / 拆炸弹 / 挖流沙 / 拨开迷雾（都在方块真正消掉之前记一笔）
    clearSet.forEach((k) => {
      const p = Specials.parse(k);
      if (S.ivy[p.r] && S.ivy[p.r][p.c]) {
        S.ivy[p.r][p.c] = 0;
        FX.text(p.c * CELL + CELL / 2, p.r * CELL + CELL / 2, '割掉藤蔓 🌿', '#4fd06a', 13);
      }
      if (S.tbomb[p.r] && S.tbomb[p.r][p.c]) {
        S.tbomb[p.r][p.c] = 0;
        S.score += 120;
        FX.text(p.c * CELL + CELL / 2, p.r * CELL + CELL / 2, '拆掉炸弹 ⚠️ +120', '#ff9a3c', 14);
        AudioManager.playSFX('coin');
      }
      if (S.sand[p.r] && S.sand[p.r][p.c]) {
        S.sand[p.r][p.c] = 0;
        FX.text(p.c * CELL + CELL / 2, p.r * CELL + CELL / 2, '挖走流沙 🟫', '#b98b4e', 13);
      }
      if (S.fog[p.r] && S.fog[p.r][p.c]) S.fog[p.r][p.c] = 0;
      // 迷雾：消掉旁边也显形（本格 + 上下左右）
      [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].forEach((d) => {
        const rr = p.r + d[0], cc = p.c + d[1];
        if (inB(rr, cc) && S.fog[rr] && S.fog[rr][cc]) S.fog[rr][cc] = 0;
      });
    });

    if (!clearSet.size) {
      // 全是障碍（比如整片冰 + 锁链）：没有可消的方块，直接返回
      drawStatic();
      return 0;
    }

    // 2) 统计颜色 / 果冻 / 要被顶回上面的货物
    const colors = {};
    let jellyHit = 0;
    const kickedCargo = [];
    clearSet.forEach((k) => {
      const p = Specials.parse(k);
      const b = S.board[p.r][p.c];
      if (b) {
        colors[b.type] = (colors[b.type] || 0) + 1;
        // 一格可能压着好几件货（允许重合），全部踢下去
        cargoList(b).forEach((cg) => kickedCargo.push({ r: p.r, c: p.c, cargo: cg }));
      }
      if (S.jelly[p.r] && S.jelly[p.r][p.c]) jellyHit++;
    });

    // 特殊块触发的任务
    boomPoints.forEach((bp) => {
      if (bp.type === T.BOMB) { Tasks.report('bomb', 1); Meta.bump('bombs', 1); }
      else if (bp.type === T.RAINBOW) { Tasks.report('rainbow', 1); Meta.bump('rainbows', 1); }
      else { Tasks.report('line', 1); Meta.bump('lines', 1); }
    });
    if (jellyHit > 0) { Tasks.report('jelly', jellyHit); Meta.bump('jelly', jellyHit); }

    bumpCombo();
    Meta.setMax('maxCombo', S.combo);
    const mult = comboMult(S.combo);
    const fz = frenzyMult();
    const beat = beatMult();
    // 每次彩虹被消，在基础得分上再悄悄多给 50 分（不对外说明）
    const rainbowBonus = boomPoints.reduce((n, bp) => n + (bp.type === T.RAINBOW ? 50 : 0), 0);
    const gained = Math.round(clearSet.size * 10 * mult * fz * beat) + rainbowBonus;
    S.score += gained;
    S.levelStartScore = S.levelStartScore || 0;

    // 目标推进
    if (S.goal) {
      Goals.progress(S.goal, { scoreDelta: gained, colors: colors, jelly: jellyHit });
      updateTargetBar();
    }
    S.clearedCount += clearSet.size;
    updateHUD();

    // 3) 特效：每种特殊块都有自己的「使用效果」
    boomPoints.forEach((bp) => {
      const bx = bp.c * CELL + CELL / 2, by = bp.r * CELL + CELL / 2;
      if (bp.type === T.BOMB) {
        // 💣 爆炸：大火球冲击波 + 橙色闪光 + 震屏
        FX.explosion(bx, by, CELL * 1.5);
        FX.flash('#ffb13d', 0.30, 0.26);
        FX.shake(4, 0.26);
      } else if (bp.type === T.LINE_H) {
        // ↔️ 横向线消：一道横贯棋盘的蓝色光束
        FX.explosion(bx, by, CELL);
        FX.beam(bx, by, true, '#5c8fff');
        FX.flash('#9fc4ff', 0.16, 0.20);
      } else if (bp.type === T.LINE_V) {
        // ↕️ 纵向线消：竖向光束
        FX.explosion(bx, by, CELL);
        FX.beam(bx, by, false, '#5c8fff');
        FX.flash('#9fc4ff', 0.16, 0.20);
      } else if (bp.type === T.RAINBOW) {
        // 🌈 彩虹：全场彩色波纹 + 白闪 + 震屏
        FX.rainbow(bx, by);
        FX.flash('#ffffff', 0.22, 0.30);
        FX.shake(4, 0.25);
        // 彩虹被消触发全场同图案：补一条醒目提示
        FX.text(bx, by - CELL * 0.3, '同图案消除 🌈', '#c85cff', 18);
        AudioManager.playSFX('line');
        AudioManager.vibrate([30, 40, 30]);   // 彩虹全场扫：给它一串更长的手感
      } else if (bp.type === T.MAGNET) {
        // 🧲 磁铁：粉色冲击波 + 朝磁铁飞的颗粒（「被吸过来」的手感）
        FX.explosion(bx, by, CELL * 1.2);
        FX.flash('#ff8ab0', 0.18, 0.22);
        FX.shake(3, 0.18);
        FX.text(bx, by - CELL * 0.3, '磁吸同色 🧲', '#ff5c8a', 17);
        AudioManager.vibrate(20);
      } else if (bp.type === T.PAINT) {
        // 🎨 颜料：一片颜色被刷成同色
        FX.flash('#ffd75c', 0.20, 0.22);
        FX.text(bx, by - CELL * 0.3, '刷成同色 🎨', '#ff9a3c', 17);
        paintArea(bp.r, bp.c, 2);
      } else if (bp.type === T.FROST) {
        // ❄️ 霜块：机关全部定格
        FX.flash('#bfe9ff', 0.22, 0.26);
        S.frostTurns = FROST_TURNS;
        FX.text(bx, by - CELL * 0.3, '机关定格 ' + FROST_TURNS + ' 步 ❄️', '#2fa9e0', 17);
        toast('❄️ 霜块生效：' + FROST_TURNS + ' 步内所有机关暂停');
      } else if (bp.type === T.PROPELLER) {
        // 🛩️ 螺旋桨：两条对角线一路扫
        FX.flash('#b8fff4', 0.18, 0.22);
        FX.explosion(bx, by, CELL * 1.1);
        FX.text(bx, by - CELL * 0.3, '斜向扫场 🛩️', '#2fc7b8', 17);
      } else {
        FX.explosion(bx, by, CELL);
      }
    });
    clearSet.forEach((k) => {
      const p = Specials.parse(k);
      const b = S.board[p.r][p.c];
      FX.burst(p.c * CELL + CELL / 2, p.r * CELL + CELL / 2, b ? FALLBACK_COLORS[b.type] : '#fff', 3);
    });

    const anchor = Specials.parse(clearSet.values().next().value);
    FX.text(anchor.c * CELL + CELL / 2, anchor.r * CELL + CELL / 2,
      (fz > 1 ? '狂热 ' : '') + (beat > 1 ? '踩点 ' : '') + (S.combo >= 2 ? 'x' + S.combo + ' ' : '') + '+' + gained,
      fz > 1 ? '#ff8c00' : S.combo >= 3 ? '#ff5c5c' : '#ffd75c', 20);

    if (boomPoints.some((b) => b.type === T.BOMB)) AudioManager.playSFX('bomb');
    else if (boomPoints.some((b) => b.type === T.LINE_H || b.type === T.LINE_V)) AudioManager.playSFX('line');
    else AudioManager.playSFX('match', { combo: S.combo, beat: beatBonus() });

    await animateClear(clearSet, S.combo);

    // 4) 清除
    clearSet.forEach((k) => {
      const p = Specials.parse(k);
      clearJellyAt(p.r, p.c);
      S.board[p.r][p.c] = null;
    });

    // 掉落 + 补充（货物压在方块上，跟着方块一起被重力往下带）
    // 被消掉的货物 **不是直接送达**：它落到本列「下面最近的没被消掉的方块」上，
    // 之后跟着那个方块被重力一点点往下带，等哪天真的到了最底行才算送达。
    // 只有被消的那一刻，下面已经一个方块都没有（整列空了），才算直接运送成功。
    // 注意必须在 dropAndFill() 之前落位：重力会把幸存方块压到底行，
    // 放在重力后面找「下面的方块」就永远只能找到底行 = 又变回直接送达。
    const deliveredNow = {};   // c -> [cargo...]：下面没有方块、直接送达的
    kickedCargo.sort((x, y) => y.r - x.r).forEach((d) => {
      let host = null;
      for (let r = d.r + 1; r < ROWS; r++) {
        if (S.board[r][d.c]) { host = S.board[r][d.c]; break; }
      }
      if (host) addCargo(host, d.cargo);
      else {
        if (!deliveredNow[d.c]) deliveredNow[d.c] = [];
        deliveredNow[d.c].push(d.cargo);
      }
    });
    Object.keys(deliveredNow).forEach((c) => deliverCargo(deliveredNow[c], Number(c)));
    const fallFrom = dropAndFill();
    await animateDrop(fallFrom);
    S.landAnims = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        if (fallFrom[kOf(r, c)] !== undefined) {
          S.landAnims.push({ r, c, t0: performance.now() });
          break;
        }
      }
    }
    teleportCargo();   // 🌀 落进传送门的货先跳到对面，再判断有没有到底
    collectCargo();
    // 每次结算后校准目标数：万一有货物没归位，目标跟着场上实际数量走，绝不让关卡变成死局
    syncGoalFromBoard();
    updateTargetBar();
    drawStatic();
    return gained;
  }

  // 一批货物送达：特效 + 计数 + 目标推进（被消后下面没方块直送、到底行收集，共用这一份）
  function deliverCargo(items, c) {
    let n = 0, res = 0, candies = 0;
    (items || []).forEach((cg) => {
      n++;
      if (cg.kind === 'nailong') res++;
      else if (cg.kind === 'candy') candies++;
    });
    if (!n) return 0;
    // 送达也计分：每件固定 +150，直接进总分（目标分关照样吃这笔）
    const bonus = n * 150;
    S.score += bonus;
    S.levelStartScore = S.levelStartScore || 0;
    const last = items[items.length - 1];
    const cx = (c != null) ? c * CELL + CELL / 2 : VIEW_W / 2;
    const cy = (ROWS - 1) * CELL + CELL / 2;
    FX.text(cx, cy,
      (last.kind === 'nailong' ? '奶龙送达！' : (last.kind === 'candy' ? '送达 🍬' : '送达 🔑')) + ' +' + bonus,
      '#2fa84f', 16);
    FX.burst(cx, cy, '#7cf29a', 5);
    AudioManager.playSFX('coin');
    S.cargoLeft = Math.max(0, S.cargoLeft - n);
    S.rescueLeft = Math.max(0, S.rescueLeft - res);
    Meta.bump('cargo', n);
    if (candies) Meta.bump('candy', candies);   // 「糖果爱好者」成就
    if (res) Meta.bump('rescue', res);
    if (S.goal) {
      Goals.progress(S.goal, { cargo: n, rescue: res });
      updateTargetBar();
    }
    updateHUD();
    return n;
  }

  // 落到最底行的货物就算送达（一格可能压着好几件，一起送达）
  function collectCargo() {
    let n = 0;
    for (let c = 0; c < COLS; c++) {
      // 🟫 底行有流沙 = 这一列送不出去，货先卡在上面等玩家把沙挖掉
      if (S.sand[ROWS - 1] && S.sand[ROWS - 1][c]) continue;
      const b = S.board[ROWS - 1][c];
      const list = cargoList(b);
      if (!list.length) continue;
      b.cargo = null;
      n += deliverCargo(list, c);
    }
    return n;
  }

  // 🌀 传送门：落在传送门上的货直接跳到对面那扇门（用来跨列送货 / 绕开流沙）
  function teleportCargo() {
    if (!S.portals || !S.portals.length) return 0;
    let moved = 0;
    S.portals.forEach((p) => {
      const from = S.board[p.r] && S.board[p.r][p.c];
      const list = cargoList(from);
      if (!list.length) return;
      const to = S.board[p.to.r] && S.board[p.to.r][p.to.c];
      if (!to) return;
      from.cargo = null;
      list.forEach((cg) => addCargo(to, cg));
      moved += list.length;
      FX.flash('#b58cff', 0.16, 0.2);
      FX.text(p.c * CELL + CELL / 2, p.r * CELL + CELL / 2, '传送 🌀', '#8a5cff', 15);
      AudioManager.playSFX('swap');
    });
    if (moved) drawStatic();
    return moved;
  }

  // 立即引爆某一格上的特殊块（供道具自动消耗使用）
  async function detonateAt(r, c) {
    const expanded = Specials.expandClears(S.board, ROWS, COLS, new Set([kOf(r, c)]), {});
    await resolveClear(expanded.cells, expanded.boomPoints);
  }

  // ==================== 彩虹机关 ====================
  // 彩虹只在【自己被消除】的那一刻触发：把自身图案的全盘同图案方块一起消掉
  // （0.jpg 带彩虹 → 彩虹被消时全场 0.jpg 消掉）。
  // 触发路径统一走 Specials.expandClears：被三连消掉 / 被炸弹线消波及都算；
  // 与普通块交换但彩虹本身没被消时，只按普通三连处理，绝不触发。
  // 不连锁引爆同图案里夹着的炸弹/线消（它们只被当作普通方块消掉）。

  // ==================== 特殊块的生成 ====================
  function markSpecial(r, c, type) {
    const b = S.board[r] && S.board[r][c];
    if (!b) return;
    b.special = type;
  }

  function SpecsL(runs) {
    return Specials.detectLShapes(S.board, ROWS, COLS, runs);
  }

  // 重力下落 + 队列补充，返回每格的来源行（负数表示从上方新生成）
  function dropAndFill() {
    const fallFrom = {};
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (S.board[r][c]) {
          if (write !== r) {
            S.board[write][c] = S.board[r][c];
            fallFrom[kOf(write, c)] = r;
            S.board[r][c] = null;
          }
          write--;
        }
      }
      let n = 0;
      for (let r = write; r >= 0; r--) {
        S.board[r][c] = { type: nextType(), special: T.NORMAL };
        fallFrom[kOf(r, c)] = -1 - n;
        n++;
      }
    }
    updatePreview();
    return fallFrom;
  }

  function nextType() {
    if (!S.nextQueue.length) S.nextQueue = [randType(), randType(), randType()];
    const t = S.nextQueue.shift();
    S.nextQueue.push(randType());
    return t;
  }

  function updatePreview() {
    const strip = $('preview-strip');
    if (!strip) return;
    strip.innerHTML = '';
    S.nextQueue.slice(0, 3).forEach((t) => {
      // 显示具体图案（和棋盘一致），不用颜色块，避免分不清
      const d = document.createElement('img');
      d.className = 'preview-dot';
      d.src = './assets/' + t + '.webp';
      d.alt = '即将掉落';
      d.draggable = false;
      strip.appendChild(d);
    });
  }

  // ==================== 交换 ====================
  async function trySwap(a, b) {
    if (S.busy || !S.playing || S.paused) return;
    if (!inB(a.r, a.c) || !inB(b.r, b.c)) return;
    // 新的一步：冰块「每步每格最多砸一层」的记账从头算
    S.iceHitMove = {};
    if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) {
      S.selected = null;
      drawStatic();
      return;
    }
    // 玩家照着提示走了这一步 → 棋盘上的虚线提示框立刻收掉，别跟着棋盘继续晃
    if (S.hintCells && S.hintCells.some((p) =>
      (p.r === a.r && p.c === a.c) || (p.r === b.r && p.c === b.c))) clearHint();
    // 冰块 / 锁链：动不了，提示一下就好
    if (isLocked(a.r, a.c) || isLocked(b.r, b.c)) {
      S.selected = null;
      S.shakeCell = { from: a, to: b, t0: performance.now() };
      drawStatic();
      AudioManager.playSFX('invalid');
      toast(isIced(a.r, a.c) || isIced(b.r, b.c) ? '冰块里的方块动不了' : '锁住的方块动不了');
      return;
    }

    S.busy = true;
    S.selected = null;
    S.dragTo = null;
    AudioManager.playSFX('swap');

    try {
      const ba = S.board[a.r][a.c];
      const bb = S.board[b.r][b.c];
      // 快照在交换之前拍：撤回要回到「走之前」的棋盘，连消多少次都一样
      const snap = makeHistorySnap();

      await animateSwap(a, b);
      S.board[a.r][a.c] = bb;
      S.board[b.r][b.c] = ba;

      // 组合技（§2）：两个特殊块相邻
      const combo = Specials.comboAt(S.board, ROWS, COLS, a, b);
      if (combo) {
        clearHint();
        commitSnap(snap);
        await runCombo(combo, a, b);
        spendMove();
        await afterTurn();
        return;
      }

      // 彩虹不在这里特判：彩虹跟普通块一样只能靠「自己被消」触发全场同图案。
      // 交换后只有对方凑出普通三连就正常消那三连，彩虹没被消就不触发。

      if (findMatches().size === 0) {
        await sleep(60);
        AudioManager.playSFX('invalid');
        await animateSwap(a, b);
        S.board[a.r][a.c] = ba;
        S.board[b.r][b.c] = bb;
        // 摇头（§16）
        S.shakeCell = { from: a, to: b, t0: performance.now() };
        drawStatic();
        S.busy = false;
        return;
      }

      commitSnap(snap);
      clearHint();                 // 棋盘要变了，旧提示作废
      spendMove();
      await resolveBoard({ a: { r: a.r, c: a.c }, b: { r: b.r, c: b.c } });
      await afterTurn();
    } catch (err) {
      console.error('[game] swap error', err);
      S.busy = false;
    }
  }

  async function runCombo(combo, a, b) {
    AudioManager.playSFX(combo.sfx || 'bomb');
    FX.shake(combo.power ? 4 : 3, 0.22);
    bumpCombo();

    const cells = combo.cells;
    FX.text(COLS * CELL / 2, ROWS * CELL / 2, combo.label, '#c85cff', 22);

    const colors = {};
    let jellyHit = 0;
    cells.forEach((k) => {
      const p = Specials.parse(k);
      const blk = S.board[p.r][p.c];
      if (blk) colors[blk.type] = (colors[blk.type] || 0) + 1;
      if (S.jelly[p.r] && S.jelly[p.r][p.c]) jellyHit++;
    });

    const gained = Math.round(cells.size * 25 * comboMult(S.combo));
    S.score += gained;
    if (S.goal) {
      Goals.progress(S.goal, { scoreDelta: gained, colors, jelly: jellyHit });
      updateTargetBar();
    }
    if (jellyHit) Tasks.report('jelly', jellyHit);
    Tasks.report('bomb', 1);
    updateHUD();

    cells.forEach((k) => {
      const p = Specials.parse(k);
      FX.burst(p.c * CELL + CELL / 2, p.r * CELL + CELL / 2, '#ffd75c', 4);
    });
    FX.text(a.c * CELL + CELL / 2, a.r * CELL + CELL / 2, '+' + gained, '#ffd700', 22);

    await animateClear(cells, S.combo);

    cells.forEach((k) => {
      const p = Specials.parse(k);
      clearJellyAt(p.r, p.c);
      S.board[p.r][p.c] = null;
    });

    const fallFrom = dropAndFill();
    await animateDrop(fallFrom);
    drawStatic();

    // 组合技后可能还有自然连消
    await resolveBoard(null);
  }

  function spendMove() {
    if (S.levelDef && S.levelDef.goal.type === 'timed') return;
    S.moves = Math.max(0, S.moves - 1);
    updateHUD();
    checkMovesWarning();
  }

  async function afterTurn() {
    // 兜底：无论哪条路径（组合技 / 彩虹 / 道具引爆 / 掉落），只要棋盘上还留着
    // 可消除的连消，就在这里补消完，绝不把「该消没消」的方块留给下一回合
    let safety = 0;
    while (findMatches().size && safety++ < 24) {
      await resolveBoard(null);
    }

    S.busy = false;

    // 过关后续玩剩余步数 / 秒数：目标早已达成，不再重复判胜；
    // 等步数（或时间）真正用完再弹一次结算（金币照发，成就 / 任务 / 榜单不重复计）
    if (S.wonContinued) {
      const usedUp = S.timerOn ? S.timeLeft <= 0 : S.moves <= 0;
      if (usedUp) {
        await sleep(220);
        levelWin(true);
        return;
      }
    } else if (S.goal && Goals.isComplete(S.goal)) {
      await sleep(220);
      levelWin();
      return;
    }

    if (S.levelDef.goal.type === 'timed') {
      if (S.timeLeft <= 0 && S.playing) {
        await handleOutOfResource();
        return;
      }
    } else if (S.moves <= 0 && S.playing) {
      await handleOutOfResource();
      return;
    }

    // 机关按「本局走了几步」推进：炸弹倒计时 / 藤蔓蔓延 / 流沙下沉 / 轨道滑动 / 霜块生成
    // （霜块 ❄️ 定格期间这些全部暂停；判定失败会直接进结算，所以放在判胜之后）
    tickHazards();
    if (!S.playing) return;

    if (!hasPossibleMove()) {
      toast('无可用步，已重排');
      await sleep(240);
      reshuffle();
      drawStatic();
    }

    // 这一回合进行时用户切走了（退出/切后台）→ 回合结束立刻停住，等他回来自己继续
    if (S.autoPausePending) {
      S.autoPausePending = false;
      if (S.playing && !S.paused) pauseGame();
      return;
    }

    saveRun();
  }

  // ==================== 撤销 / 洗牌 ====================
  // 快照 = 「走这一步之前」的完整局面：棋盘、果冻、分数、步数、目标进度全都要，
  // 这样撤回时目标栏和棋盘一起回到走之前（哪怕上一步连消了多次也是同一份快照）
  function makeHistorySnap() {
    return {
      board: JSON.parse(JSON.stringify(S.board)),
      jelly: JSON.parse(JSON.stringify(S.jelly)),
      ice: JSON.parse(JSON.stringify(S.ice || [])),
      chain: JSON.parse(JSON.stringify(S.chain || [])),
      // 机关也要进快照：撤回后藤蔓 / 炸弹 / 流沙 / 迷雾必须回到走之前的样子
      ivy: JSON.parse(JSON.stringify(S.ivy || [])),
      box: JSON.parse(JSON.stringify(S.box || [])),
      sand: JSON.parse(JSON.stringify(S.sand || [])),
      tbomb: JSON.parse(JSON.stringify(S.tbomb || [])),
      fog: JSON.parse(JSON.stringify(S.fog || [])),
      frostTurns: S.frostTurns || 0,
      turnCount: S.turnCount || 0,
      score: S.score,
      moves: S.moves,
      jellyLeft: S.jellyLeft,
      cargoLeft: S.cargoLeft,
      rescueLeft: S.rescueLeft,
      clearedCount: S.clearedCount,
      goal: S.goal ? {
        current: S.goal.current,
        byColor: JSON.parse(JSON.stringify(S.goal.byColor || {})),
        jellyCleared: S.goal.jellyCleared || 0,
        iceCleared: S.goal.iceCleared || 0,
        cargoGot: S.goal.cargoGot || 0,
        rescueGot: S.goal.rescueGot || 0
      } : null
    };
  }

  function pushHistory() {
    S.history.push(makeHistorySnap());
    if (S.history.length > 10) S.history.shift();
  }

  function commitSnap(snap) {
    if (!snap) return;
    S.history.push(snap);
    if (S.history.length > 10) S.history.shift();
  }

  function undo() {
    if (S.busy || !S.playing || S.paused) return;
    if (!S.history.length) {
      toast('暂无可撤销内容');
      return;
    }
    // 每局只送 3 次，用完不自动扣背包：需要玩家自己在背包点「撤回」道具补充
    if (S.undoLeft <= 0) {
      toast('撤回次数用完了，去背包用「撤回」道具补充');
      AudioManager.playSFX('invalid');
      return;
    }
    S.undoLeft--;
    const f = S.history.pop();
    S.board = f.board;
    S.jelly = f.jelly;
    if (f.ice) S.ice = f.ice;
    if (f.chain) S.chain = f.chain;
    if (f.ivy) S.ivy = f.ivy;
    if (f.box) S.box = f.box;
    if (f.sand) S.sand = f.sand;
    if (f.tbomb) S.tbomb = f.tbomb;
    if (f.fog) S.fog = f.fog;
    if (f.frostTurns != null) S.frostTurns = f.frostTurns;
    if (f.turnCount != null) S.turnCount = f.turnCount;
    S.score = f.score;
    S.moves = f.moves;
    S.jellyLeft = f.jellyLeft;
    if (f.cargoLeft != null) S.cargoLeft = f.cargoLeft;
    if (f.rescueLeft != null) S.rescueLeft = f.rescueLeft;
    S.clearedCount = f.clearedCount != null ? f.clearedCount : S.clearedCount;
    // 目标栏一起撤回：收集数量 / 果冻数 / 冰块 / 货物 / 得分进度全部回到走之前
    if (f.goal && S.goal) {
      S.goal.current = f.goal.current || 0;
      S.goal.byColor = f.goal.byColor || S.goal.byColor;
      S.goal.jellyCleared = f.goal.jellyCleared || 0;
      S.goal.iceCleared = f.goal.iceCleared || 0;
      S.goal.cargoGot = f.goal.cargoGot || 0;
      S.goal.rescueGot = f.goal.rescueGot || 0;
    }
    S.selected = null;
    clearHint();
    updateHUD();
    updateTargetBar();
    updateHazardBar();
    drawStatic();
    AudioManager.playSFX('select');
  }

  function shuffleBoard() {
    if (S.busy || !S.playing || S.paused) return;
    // 同上：用完不自动扣背包，必须玩家自己决定
    if (S.shuffleLeft <= 0) {
      toast('洗牌次数用完了，去背包用「洗牌」道具补充');
      AudioManager.playSFX('invalid');
      return;
    }
    S.shuffleLeft--;
    pushHistory();
    clearHint();
    reshuffle();
    drawStatic();
    AudioManager.playSFX('swap');
    updateHUD();
  }

  // ==================== 关卡加载 ====================
  // 只跑 20 关主线；传进来的越界关卡一律夹到合法范围（无尽模式已移除）
  function maxMainLevel() {
    return (S.data && S.data.levels && S.data.levels.length) || 20;
  }

  function getLevelDef(level) {
    const list = S.data.levels;
    const lv = Math.max(1, Math.min(level || 1, list.length));
    return list[lv - 1];
  }

  function applyTheme(themeName) {
    const themes = (S.data.themes || {})[themeName] || { bg: '#ffffff', grid: '#f0f0f0' };
    document.body.dataset.theme = themeName || 'grass';
    document.documentElement.style.setProperty('--board-bg', themes.bg);
    document.documentElement.style.setProperty('--board-grid', themes.grid);
  }

  // 收集关：每次开局随机挑方块来收（数量照关卡定义），不再永远固定同两种
  // 返回浅拷贝，别改到 levels.json / 每日挑战的原始定义
  function randomCollectDef(def) {
    const g = def.goal;
    const keys = Object.keys(g.target || {});
    if (!keys.length) return def;
    const want = keys.map((k) => g.target[k]);
    const pool = [];
    for (let i = 0; i < typeCount(); i++) pool.push(String(i));
    const rnd = (n) => (S.rng ? S.rng.int(n) : randInt(n));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    const target = {};
    keys.forEach((k, i) => { target[pool[i % pool.length]] = want[i]; });
    return Object.assign({}, def, { goal: Object.assign({}, g, { target: target }) });
  }

  function startLevel(level, opts) {
    opts = opts || {};
    // 每日挑战当天已满三星 → 不再开局，改为显示今日战绩
    if (opts.daily && dailyCompleted()) {
      showDailyDone();
      return;
    }
    S.daily = !!opts.daily;
    S.mode = opts.mode || 'main';
    // 主线越界一律夹回
    S.level = S.daily ? 0 : Math.max(1, Math.min(level || 1, maxMainLevel()));
    // 主页显示的关卡跟着走：进了第几关，主页就停在第几关（意外退出也一致）
    if (!S.daily) {
      S.menuLevel = S.level;
      try { Store.setSettings({ menuLevel: S.level }); } catch (e) {}
    }
    S.levelDef = opts.def || getLevelDef(S.level);
    S.rng = opts.seed != null ? RNG.source(opts.seed) : null;
    S.chapter = S.levelDef.chapter || (S.level ? Math.ceil(S.level / 10) : 0);
    S.hazardLevel = hasHazardLevel(S.levelDef);   // ❄️ 霜块只在机关关卡自动生成

    if (S.levelDef.goal && S.levelDef.goal.type === 'collect') {
      S.levelDef = randomCollectDef(S.levelDef);
    }
    S.goal = Goals.create(S.levelDef.goal);
    S.score = 0;
    S.levelStartScore = 0;
    S.moves = S.levelDef.moves || 20;
    S.timeLeft = (S.levelDef.goal && S.levelDef.goal.time) || 0;
    S.timerOn = S.levelDef.goal.type === 'timed';
    S.combo = 0;
    S.maxCombo = 0;
    S.lastClearAt = 0;
    S.history = [];
    S.playing = true;
    S.paused = false;
    S.autoPausePending = false;
    S.busy = false;
    S.selected = null;
    S.dragTo = null;
    S.shakeCell = null;
    S.clearedCount = 0;
    S.undoLeft = 3;
    S.shuffleLeft = 3;
    S.hintLeft = 3;
    S.hintCells = null;
    S.hintUntil = 0;
    S.reviveUsed = false;
    S.wonContinued = false;   // 过关后是否正在续玩剩余步数
    S.cargoLeft = 0;
    S.rescueLeft = 0;
    stopFrenzy();             // 清掉双倍状态 + 顶栏倒计时

    applyTheme(S.levelDef.theme);
    initBoard();

    // 冰块 / 货运 / 护送 / 果冻关：目标值统一按「场上实际数量」重算，
    // 数字永远和棋盘上能数出来的东西一致（冰块按块算，不按层算）
    syncGoalFromBoard();

    // 道具：开局炸弹（§7）——随机挑一个「还空着」的格子，不和货物 / 冰 / 锁链叠在一起
    if (opts.startBomb) {
      const free = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) if (canPlaceNew(r, c)) free.push([r, c]);
      }
      if (free.length) {
        const p = free[randInt(free.length)];
        markSpecial(p[0], p[1], T.BOMB);
      }
    }

    $('level').textContent = S.daily ? '每日挑战'
      : S.mode === 'endless' ? '无尽'
      : S.mode === 'sprint' ? '冲刺'
      : S.mode === 'rhythm' ? '节奏'
      : S.level;
    const nxtBtn = $('btn-next-level');
    if (nxtBtn) nxtBtn.style.display = S.daily ? 'none' : 'inline-block';
    updateHUD();
    updateTargetBar();
    updatePreview();
    drawStatic();
    hideAllOverlays();
    Input.setEnabled(true);

    if (S.timerOn) startTimer();
    else stopTimer();
    startBeatLoop();
  }

  let timerId = null;
  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      if (!S.playing || S.paused) return;
      S.timeLeft = Math.max(0, S.timeLeft - 1);
      updateHUD();
      updateTargetBar();
      if (S.timeLeft <= 0) {
        stopTimer();
        // 过关后接着玩到时间用完：直接进第二次结算（和步数关一致），不是失败
        if (S.wonContinued) levelWin(true);
        else handleOutOfResource();
      }
    }, 1000);
  }
  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  // ==================== 暂停 ====================
  // 从游戏界面点「规则 / 设置」时静默暂停：遮罩盖住棋盘，计时和节拍先停住，
  // 关掉面板自动接上，不会白掉时间。
  let quietPaused = false;
  function quietPauseGame() {
    if (!S.playing || S.paused) return;
    S.paused = true;
    quietPaused = true;
    stopTimer();
    stopBeatLoop();
  }
  function quietResumeGame() {
    if (!quietPaused) return;
    quietPaused = false;
    S.paused = false;
    setView('game');
    if (!S.playing) return;
    if (S.timerOn) startTimer();
    startBeatLoop();
    drawStatic();
  }

  function updatePauseHint() {
    const el = $('pause-hint');
    if (!el) return;
    const lvTxt = S.daily ? '每日挑战' : '第 ' + S.level + ' 关';
    const leftTxt = S.timerOn ? '剩余 ' + Math.ceil(S.timeLeft) + ' 秒' : '剩余 ' + S.moves + ' 步';
    el.textContent = lvTxt + ' · ' + leftTxt + ' · 得分 ' + S.score;
  }

  function pauseGame() {
    if (!S.playing || S.paused || S.busy) return;
    S.paused = true;
    stopTimer();
    stopBeatLoop();
    Input.setEnabled(false);
    S.selected = null;
    S.dragTo = null;
    updatePauseHint();
    drawStatic();
    saveRun();
    showOverlay('pause-menu');
  }

  // 退出页面 / 切后台 / 来电：默认暂停（回来时停在暂停面板，不会继续掉步数）
  function autoPauseIfPlaying() {
    if (!S.playing || S.paused) return;
    if (S.busy) {
      S.autoPausePending = true;
      return;
    }
    pauseGame();
  }

  function resumeGame() {
    if (!S.paused) return;
    S.paused = false;
    const box = $('pause-menu');
    if (box) box.style.display = 'none';
    setView('game');
    Input.setEnabled(true);
    if (S.timerOn && S.playing) startTimer();
    startBeatLoop();
    drawStatic();
  }

  // 重开当前关：步数 / 洗牌 / 撤销全部回到初始值
  function restartCurrentLevel() {
    const box = $('pause-menu');
    if (box) box.style.display = 'none';
    S.paused = false;
    if (S.daily) {
      const d = Tasks.getDailyChallenge();
      startLevel(9999, { def: d, seed: d.seed, daily: true });
    } else {
      Store.clearRun();
      startLevel(S.level);
    }
  }

  // ==================== HUD ====================
  function updateHUD() {
    const lv = $('level');
    if (lv) lv.textContent = S.daily ? '每日挑战'
      : S.mode === 'endless' ? '无尽'
      : S.mode === 'sprint' ? '冲刺'
      : S.mode === 'rhythm' ? '节奏'
      : S.level;
    const hintEl = $('hint-count');
    if (hintEl) hintEl.textContent = S.hintLeft;
    const mv = $('moves');
    if (mv) mv.textContent = S.timerOn ? Math.ceil(S.timeLeft) + 's' : S.moves;
    const mc = $('moves-container');
    if (mc && mc.firstChild && mc.firstChild.nodeType === 3) {
      mc.firstChild.nodeValue = S.timerOn ? '时间：' : '步数：';
    }
    const sc = $('score');
    if (sc) sc.textContent = S.score;

    // 徽章只显示本局剩余次数（背包里的数量在背包面板看，避免「以为能自动补」）
    const sh = $('shuffle-count');
    if (sh) sh.textContent = S.shuffleLeft;
    const un = $('undo-count');
    if (un) un.textContent = S.undoLeft;

    checkMovesWarning();
  }

  function updateTargetBar() {
    const bar = $('target-bar');
    if (!bar || !S.goal) return;
    if (S.mode && S.mode !== 'main') {
      const best = Meta.getBest();
      const bv = best[S.mode] || 0;
      if (S.mode === 'rhythm') {
        bar.textContent = '节奏关 · 踩拍子消除 1.5 倍分　本局 ' + S.score + '　最佳 ' + bv;
      } else if (S.mode === 'sprint') {
        bar.textContent = '60 秒冲刺　本局 ' + S.score + '　最佳 ' + bv;
      } else {
        bar.textContent = '无尽模式　本局 ' + S.score + '　最佳 ' + bv;
      }
      bar.style.color = '#7c5cff';
      return;
    }
    if (S.goal.type === 'collect') {
      // 收集模式：显示对应棋子的准确图案（assets/{type}.webp），不用颜色区分
      const parts = Object.keys(S.goal.target || {}).map((c) => {
        // 收集满了以后继续累计，数字不封顶（20/12 这种也能看到）
        const cur = S.goal.byColor[c] || 0;
        return '<span class="goal-chip"><img class="goal-icon" src="./assets/' + c + '.webp" alt="图案' + c + '">' +
          cur + '/' + S.goal.target[c] + '</span>';
      }).join('');
      bar.innerHTML = '目标：收集 ' + parts;
    } else {
      bar.textContent = Goals.barText(S.goal);
    }
    bar.style.color = Goals.isComplete(S.goal) ? '#1a8f4a' : '#7c5cff';
  }

  // 步数 ≤5 / 限时关时间 ≤10s 才把数字变红闪动
  function checkMovesWarning() {
    const c = $('moves-container');
    if (!c) return;
    const low = S.timerOn ? (S.timeLeft <= 10) : (S.moves <= 5);
    c.classList.toggle('step-warning', low);
  }

  let toastTimer = null;
  let toastBusy = false;         // 提示条上是不是已经有一条在显示
  const toastQueue = [];         // 排队等展示的提示（连续生成了好几个道具时逐条播）

  // 真正把一条提示显示出来
  function paintToast(msg, ms) {
    const el = $('toast');
    if (!el) { toastBusy = false; return; }
    // 提示条永远挂在「双倍 / 机关提示」那一行的正下方，别盖住双倍
    // （手机上内容一高，固定 bottom 就会顶到双倍，所以每次按实际位置算）
    try {
      const slot = document.querySelector('.frenzy-slot');
      const host = el.offsetParent || document.querySelector('.game-container');
      if (slot && host && slot.getBoundingClientRect && host.getBoundingClientRect) {
        const sr = slot.getBoundingClientRect();
        const hr = host.getBoundingClientRect();
        if (sr.height > 0 && hr.height > 0) {
          el.style.bottom = 'auto';
          el.style.top = Math.max(0, Math.round(sr.bottom - hr.top + 4)) + 'px';
        }
      }
    } catch (e) {}
    el.textContent = msg;
    el.classList.add('show');
    toastBusy = true;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      // 后面还有排队的：同一条提示条原地换成下一条，位置一点不挪
      if (toastQueue.length) {
        const next = toastQueue.shift();
        paintToast(next.msg, next.ms);
        return;
      }
      el.classList.remove('show');
      toastBusy = false;
    }, ms);
  }

  function toast(msg) {
    // 普通提示：立刻显示（顺手清掉还没播完的排队提示，免得过时信息挤在后面）
    toastQueue.length = 0;
    paintToast(msg, 3000);
  }

  // 排队提示：一条在显示时先把后面的排上，逐条在同一个位置展示
  function toastQueued(msg, ms) {
    if (toastBusy) {
      if (toastQueue.length < 6) toastQueue.push({ msg: msg, ms: ms || 1500 });
      return;
    }
    paintToast(msg, ms || 1500);
  }

  // ==================== 规则字号 ====================
  // 只影响规则正文（.rules-box 里的 --rule-fs 变量），不动机面其他字号
  // 7 档，默认中档（15px）：往小 3 次、往大 3 次
  const RULE_FONTS = [9, 11, 13, 15, 17, 19, 21];
  const RULE_FONT_DEFAULT = 3; // 正中间那档 = 15px

  function ruleFontLevel() {
    const v = Number(Store.getSettings().ruleFontLv);
    if (!Number.isFinite(v)) return RULE_FONT_DEFAULT;
    return Math.max(0, Math.min(RULE_FONTS.length - 1, Math.round(v)));
  }

  function applyRuleFont(idx) {
    const i = Math.max(0, Math.min(RULE_FONTS.length - 1, Number(idx) || 0));
    // 「功能介绍」和「玩法规则」两块正文各自有一套字号按钮，统一应用
    ['features-box', 'play-rules-box'].forEach((id) => {
      const box = $(id);
      if (box) box.style.setProperty('--rule-fs', RULE_FONTS[i] + 'px');
    });
    // 到边界时对应按钮变淡，提示已经没法再调
    document.querySelectorAll('.js-rule-minus').forEach((el) => el.classList.toggle('is-off', i <= 0));
    document.querySelectorAll('.js-rule-plus').forEach((el) => el.classList.toggle('is-off', i >= RULE_FONTS.length - 1));
    return i;
  }

  // ==================== 结算 ====================
  // 每日挑战完成奖励（levelWin / endGame 两条结算路径共用）：
  // 只有完成任务（过关）才发金币，用步越少给得越多，一天只发一次
  function dailySettle(starsNow, allowGrant) {
    let movesUsed = -1, bonus = 0;
    if (S.daily) {
      movesUsed = Math.max(0, (S.levelDef.moves || 20) - S.moves);
      if (allowGrant && (starsNow || 0) >= 1 && !Store.getDailyRecord().coins) {
        bonus = Math.max(0, 30 + (20 - movesUsed) * 4);   // 20 步打完 30 枚，每省 1 步 +4
        Store.addCoins(bonus, '每日挑战奖励');
      }
    }
    return { movesUsed: movesUsed, bonus: bonus };
  }

  // again = 续玩剩余步数后的第二次结算（金币照发，成就 / 任务 / 榜单不重复计）
  async function levelWin(again) {
    if (S.mode && S.mode !== 'main') { endModeRun(); return; }
    S.playing = false;
    S.wonContinued = false;
    stopTimer();
    stopBeatLoop();
    Input.setEnabled(false);

    const remainRatio = S.timerOn
      ? S.timeLeft / (S.levelDef.goal.time || 1)
      : (S.moves / (S.levelDef.moves || 1));
    const starsNow = Goals.stars(S.levelDef, S.score, remainRatio);
    // 星级只升不降，永远取最大值：2 星过关后点「继续游戏」把剩余步数打光，
    // 剩余比例变小可能只算出 1 星 —— 这时结算照样显示 2 星，纪录也不掉
    const bestStars = S.daily
      ? (Store.getDailyRecord().stars || 0)
      : (Store.getLevelRecord(S.level).stars || 0);
    const stars = Math.max(starsNow, bestStars);
    // 每日挑战完成奖励：只有完成任务才发金币，用步越少给得越多（一天只发一次）
    const ds = dailySettle(starsNow, !again);
    const dailyMovesUsed = ds.movesUsed;
    const dailyBonus = ds.bonus;
    // 每日挑战也留一个「当天最佳」的纪录，第一次完成同样算新纪录
    const rec = S.daily
      ? Store.recordDaily(S.score, starsNow, dailyMovesUsed, dailyBonus)
      : Store.recordLevel(S.level, S.score, starsNow);
    if (!S.daily) S.menuLevel = S.level;
    if (!S.daily) Store.markPlayed(S.level);
    if (S.daily) refreshMenu();
    if (!S.daily) grantChapterMails();   // 这一关刚好是本章最后一关 → 发章节奖励

    // 金币产出（§7）；续玩后的第二次结算也照发金币。明细里写清是哪一关
    const coins = Math.max(10, Math.floor(S.score / 100));
    Store.addCoins(coins, '通关奖励', S.daily ? '每日挑战' : ('第 ' + S.level + ' 关'));
    if (!again) {
      Tasks.report('play', 1);
      Tasks.report('win', 1);          // 每日任务：通过 1 关
      Tasks.report('score', S.score);

      // 成就统计
      Meta.bump('wins', 1);
      Meta.bump('scoreTotal', S.score);
      // 成就统计按这一局实际打出的星算，不能把历史最好重复累加
      Meta.bump('starsGot', starsNow);
      if (starsNow >= 3) Meta.bump('perfect', 1);
      if (S.maxCombo >= 4) Meta.setMax('maxCombo', S.maxCombo);
      const newAch = Meta.check();
      if (newAch.length) setTimeout(() => toast('🏅 ' + newAch[0].a.name + ' 升到「' + newAch[0].label + '」阶，去成就里领奖'), 1200);
      updateAchDot();
      try { recordMyScore(); } catch (e) {}
    }

    updateHUD();

    const box = $('level-clear');
    // 结算音效由面板出现的那一刻来播，别提前响（以前提前 180ms，听着比画面早半拍）
    const winSfx = () => AudioManager.playSFX('star', { stars });
    if (box) {
      const starEls = $('clear-stars').children;
      // 先把上一局的星星和分数复位，等面板出现后再播动画（隐藏状态下 class 变化不会有动画）
      for (let i = 0; i < starEls.length; i++) starEls[i].classList.remove('on');
      $('clear-score').textContent = '0';
      $('clear-high').textContent = S.daily
        ? Store.getDailyRecord().best
        : Store.getLevelRecord(S.level).score;
      // 限时关显示「剩余时间」，步数关显示「剩余步数」
      const mvLabel = $('clear-moves-label');
      if (mvLabel) mvLabel.textContent = S.timerOn ? '剩余时间' : '剩余步数';
      $('clear-moves').textContent = S.timerOn ? Math.round(S.timeLeft) + 's' : S.moves;
      $('clear-coins').textContent = '+' + coins;
      // 「新纪录」等分数滚完再亮，别提前剧透
      $('clear-new-record').style.display = 'none';
      // 每日挑战没有"下一关"
      const nxt = $('btn-next-level');
      if (nxt) nxt.style.display = S.daily ? 'none' : 'inline-block';
      // 过关后还有剩余步数 / 剩余时间 → 给一个「继续游戏」的入口接着刷分
      // （两套文案除了「步数 / 秒数」完全一致，每日挑战不给）
      const cont = $('btn-clear-continue');
      if (cont) {
        const canCont = !S.daily && (S.timerOn ? S.timeLeft > 0 : S.moves > 0);
        cont.style.display = canCont ? 'inline-block' : 'none';
        cont.textContent = S.timerOn ? '还有剩余秒数点击继续游戏' : '还有剩余步数点击继续游戏';
      }
      // 还有特效在播就先让它们播完（炸弹 / 线消 / 彩虹 / 彩带 / 双倍），别一刀切
      await waitForEffects();
      box.style.display = 'flex';
      winSfx();          // 音效和结算画面同一拍出来

      // 等面板真正显示出来再起动画（setTimeout 比 rAF 稳，后台标签页也照常跑）
      setTimeout(() => {
        countUp($('clear-score'), S.score, 720, () => {
          if (rec.isNewScore) $('clear-new-record').style.display = 'inline-flex';
        });
        popStars(starEls, stars, 240);
      }, 30);
    } else {
      winSfx();
    }

    // 最后一关打完不再自动跳「结算画面」：想看就到 关卡记录 左下角的「结算」键
    // 本关已结算：清掉局内存档，避免主页还显示「继续游戏」
    Store.clearRun();
  }

  // ==================== 资源耗尽 ====================
  // 特效还在播（炸弹火球 / 线消光束 / 彩虹波纹 / 彩带 / 🔥 双倍小标刚亮起）时，
  // 结算面板先别急着盖上来，等特效自己播完再弹。
  // 只认「渲染循环真的在跑」的情况：FX.update 每帧打时间戳，页面没在动就不等。
  function fxPlaying() {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const live = now - (FX.lastUpdateAt || 0) < 250;
    return live && !FX.isEmpty();
  }
  async function waitForEffects() {
    const cap = 2000;               // 最多等 2 秒，防止一直挂着
    const t0 = performance.now();
    if (FX.isEmpty() && !frenzyActive()) return;   // 没特效也没双倍，直接结算
    await sleep(30);                // 只留一帧让刚触发的特效排上去
    // 特效一停就立刻放行：轮询间隔压到 50ms，不再额外垫固定延时
    while (fxPlaying() && performance.now() - t0 < cap) await sleep(50);
    // 🔥 双倍小标刚亮起来时给它露个脸（上限 600ms）
    if (frenzyActive()) {
      const left = Math.min(600, cap - (performance.now() - t0));
      if (left > 0) await sleep(left);
    }
  }

  // 步数 / 时间用完：绝不碰玩家的背包。任何道具（+3 步、炸弹、线消、彩虹……）
  // 都只能由玩家自己在背包里点，系统不会代替玩家消耗。
  // 这里只给一次「再来 3 步」的花金币机会（主线），否则直接结算。
  let rescuing = false;

  async function handleOutOfResource() {
    if (rescuing || !S.playing) return;
    // 无尽 / 冲刺 / 节奏：步数或时间用完直接结束
    if (S.mode && S.mode !== 'main') { endModeRun(); return; }
    rescuing = true;
    S.busy = true;
    Input.setEnabled(false);
    S.busy = false;
    rescuing = false;
    if (maybeOfferRevive()) return;
    endGame();
  }

  async function endGame() {
    if (!S.playing) return;
    if (S.mode && S.mode !== 'main') { endModeRun(); return; }
    S.playing = false;
    stopTimer();
    stopBeatLoop();
    Input.setEnabled(false);

    const remainRatio = S.timerOn ? S.timeLeft / (S.levelDef.goal.time || 1) : S.moves / (S.levelDef.moves || 1);
    const passed = Goals.isComplete(S.goal);
    const stars = passed ? Goals.stars(S.levelDef, S.score, remainRatio) : 0;
    // 最后一步刚好达标（步数用完）也会走到这里：每日挑战的完成奖励照发、步数照记
    const ds = S.daily ? dailySettle(stars, true) : { movesUsed: -1, bonus: 0 };
    // 没通关也记本关最高分（只记分不加星）；第一次玩这关同样算「新纪录」
    const rec = S.daily
      ? Store.recordDaily(S.score, stars, ds.movesUsed, ds.bonus)
      : Store.recordLevel(S.level, S.score, stars);
    if (!S.daily) S.menuLevel = S.level;
    if (!S.daily) Store.markPlayed(S.level);
    if (S.daily) refreshMenu();
    const coins = passed ? Math.max(10, Math.floor(S.score / 100)) : Math.floor(S.score / 300);
    // 过没过都标上是哪一关，免得明细里只看到「通关奖励」不知道打的是哪关
    Store.addCoins(coins, passed ? '通关奖励' : '过关奖励',
      S.daily ? '每日挑战' : ('第 ' + S.level + ' 关'));
    Tasks.report('play', 1);
    Tasks.report('score', S.score);
    try { recordMyScore(); } catch (e) {}   // 没通关也刷一次局榜 / 总榜

    updateHUD();

    const box = $('game-over');
    const endSfx = () => AudioManager.playSFX(passed ? 'star' : 'gameover', { stars: Math.max(1, stars) });
    if (box) {
      $('final-score').textContent = '0';
      $('final-high').textContent = S.daily
        ? Store.getDailyRecord().best
        : Store.getLevelRecord(S.level).score;
      $('final-level').textContent = S.daily ? '每日挑战' : S.level;
      $('final-coins').textContent = '+' + coins;
      // 限时关写「时间到了」，步数关写「步数耗尽」，机关炸了写具体原因
      $('game-over-title').textContent = passed ? '目标达成'
        : (S.failReason || (S.timerOn ? '时间到了' : '步数耗尽'));
      $('final-new-record').style.display = 'none';
      // 步数 / 时间刚走完时可能还有特效在播：等播完再弹结算
      await waitForEffects();
      box.style.display = 'flex';
      endSfx();          // 音效和结算画面同一拍出来
      // 新纪录等分数滚完再亮
      setTimeout(() => {
        countUp($('final-score'), S.score, 720, () => {
          if (rec.isNewScore) $('final-new-record').style.display = 'inline-flex';
        });
      }, 30);
    } else {
      endSfx();
    }
    Store.clearRun();
  }

  // ==================== 存档 ====================
  function saveRun() {
    if (!S.playing || S.daily || (S.mode && S.mode !== 'main')) return;
    Store.saveRun({
      level: S.level,
      board: S.board,
      jelly: S.jelly,
      ice: S.ice,
      chain: S.chain,
      // 机关原样存档：中途退出再进来，藤蔓位置 / 炸弹倒计时 / 迷雾都还是走之前那样
      ivy: S.ivy,
      box: S.box,
      sand: S.sand,
      tbomb: S.tbomb,
      fog: S.fog,
      frostTurns: S.frostTurns,
      turnCount: S.turnCount,
      cargoLeft: S.cargoLeft,
      rescueLeft: S.rescueLeft,
      score: S.score,
      moves: S.moves,
      timeLeft: S.timeLeft,
      jellyLeft: S.jellyLeft,
      // 暂停 / 中途退出再进来：目标进度（冰块 / 货物 / 奶龙已送达数）也要原样回来，
      // 不能用「棋盘上还剩几个」把已送达的数抹掉
      goalCurrent: S.goal ? {
        current: S.goal.current, byColor: S.goal.byColor, jellyCleared: S.goal.jellyCleared,
        iceCleared: S.goal.iceCleared || 0,
        cargoGot: S.goal.cargoGot || 0, rescueGot: S.goal.rescueGot || 0
      } : null,
      // 收集关：把本局随机出的目标方块存下来，续玩时不重新随机
      collectTarget: (S.goal && S.goal.type === 'collect') ? S.goal.target : null,
      shuffleLeft: S.shuffleLeft,
      undoLeft: S.undoLeft,
      daily: S.daily
    });
  }

  function loadRun() {
    const s = Store.loadRun();
    if (!s || !s.board || !s.board.length) return false;
    startLevel(s.level || 1, {});
    S.board = s.board;
    S.jelly = s.jelly || S.jelly;
    if (s.ice) S.ice = s.ice;
    if (s.chain) S.chain = s.chain;
    if (s.ivy) S.ivy = s.ivy;
    if (s.box) S.box = s.box;
    if (s.sand) S.sand = s.sand;
    if (s.tbomb) S.tbomb = s.tbomb;
    if (s.fog) S.fog = s.fog;
    if (s.frostTurns != null) S.frostTurns = s.frostTurns;
    if (s.turnCount != null) S.turnCount = s.turnCount;
    if (s.cargoLeft != null) S.cargoLeft = s.cargoLeft;
    if (s.rescueLeft != null) S.rescueLeft = s.rescueLeft;
    S.score = s.score || 0;
    S.moves = s.moves;
    S.timeLeft = s.timeLeft != null ? s.timeLeft : S.timeLeft;
    S.jellyLeft = s.jellyLeft || 0;
    S.shuffleLeft = s.shuffleLeft != null ? s.shuffleLeft : 3;
    S.undoLeft = s.undoLeft != null ? s.undoLeft : 3;
    if (s.goalCurrent && S.goal) {
      S.goal.current = s.goalCurrent.current || 0;
      S.goal.jellyCleared = s.goalCurrent.jellyCleared || 0;
      // 新存档：冰块 / 货物 / 奶龙的已送数都存了 → 原样恢复；
      // 老存档没存这些字段 → 保持原来的清零重算（syncGoalFromBoard 兜底）
      if (s.goalCurrent.iceCleared != null) S.goal.iceCleared = s.goalCurrent.iceCleared;
      if (s.goalCurrent.cargoGot != null) S.goal.cargoGot = s.goalCurrent.cargoGot;
      if (s.goalCurrent.rescueGot != null) S.goal.rescueGot = s.goalCurrent.rescueGot;
    }
    // 读档后按「恢复出来的进度 + 场上剩下的」重算目标总数：
    // 已送达的数不再清零，目标栏显示的仍是原来那个进度（如 运送钥匙 1/7）
    if (S.goal) {
      if (!s.goalCurrent || s.goalCurrent.iceCleared == null) S.goal.iceCleared = 0;
      if (!s.goalCurrent || s.goalCurrent.cargoGot == null) S.goal.cargoGot = 0;
      if (!s.goalCurrent || s.goalCurrent.rescueGot == null) S.goal.rescueGot = 0;
      syncGoalFromBoard();
    }
    // 收集关：恢复存档时随机好的目标方块和各自进度（不重新随机）
    if (s.collectTarget && S.goal && S.goal.type === 'collect') {
      S.goal.target = s.collectTarget;
      const bc = {};
      const saved = (s.goalCurrent && s.goalCurrent.byColor) || {};
      Object.keys(s.collectTarget).forEach((c) => { bc[c] = saved[c] || 0; });
      S.goal.byColor = bc;
    }
    updateHUD();
    updateTargetBar();
    drawStatic();
    return true;
  }

  // ==================== 面板 ====================
  function hideAllOverlays() {
    ['main-menu', 'settings-menu', 'music-settings-menu', 'volume-menu', 'custom-music-menu', 'music-history-menu', 'playlist-menu',
      'music-library-menu', 'rename-menu', 'tasks-menu', 'shop-menu', 'history-menu', 'backpack-menu',
      'rules-menu', 'features-menu', 'play-rules-menu', 'mail-menu', 'mail-view',
      'logout-confirm', 'logout-confirm2', 'pause-menu',
      'chapters-menu', 'story-menu', 'achievements-menu', 'collection-menu', 'welfare-menu',
      'leaderboard-menu', 'lb-view', 'home-menu', 'modes-menu', 'revive-menu', 'mode-over',
      'admin-user-list', 'prov-page',
      'account-menu', 'password-menu', 'switch-menu', 'auth-menu', 'auth-form',
      'backup-menu', 'backup-import-menu', 'prov-user-list', 'fix-menu', 'cloud-menu',
      'ach-detail',
      'level-clear', 'game-over', 'game-complete', 'daily-done'].forEach((id) => {
      const el = $(id);
      if (el) el.style.display = 'none';
    });
    // 强制改名期间，任何流程都不许把改名窗关掉（否则玩家能绕过）
    if (typeof nickForced !== 'undefined' && nickForced) {
      const nm = $('nick-menu');
      if (nm && needForcedRename()) nm.style.display = 'flex';
    }
    setView('game');
    // 上云窗口不是强制闸：玩家点背景就能跳过（skipCloud），不再顶回来
  }

  // 主页与游戏中的容器高度不同：主页内容更高，需要更长的白色背景
  const MENU_PANELS = ['main-menu', 'settings-menu', 'music-settings-menu', 'volume-menu', 'custom-music-menu',
    'music-history-menu', 'playlist-menu', 'music-library-menu', 'rename-menu',
    'tasks-menu', 'shop-menu', 'history-menu', 'backpack-menu', 'rules-menu',
    'features-menu', 'play-rules-menu', 'mail-menu', 'mail-view', 'admin-menu', 'admin-user-list',
    'chapters-menu', 'achievements-menu', 'collection-menu', 'welfare-menu',
    'leaderboard-menu', 'lb-view', 'home-menu', 'modes-menu', 'story-menu', 'daily-done', 'nick-menu',
    'account-menu', 'password-menu', 'switch-menu', 'auth-menu', 'auth-form',
    'backup-menu', 'backup-import-menu', 'prov-user-list', 'fix-menu', 'cloud-menu', 'ach-detail'];

  function setView(view) {
    document.body.dataset.view = view;
  }

  function showOverlay(id) {
    const el = $(id);
    if (el) el.style.display = 'flex';
    // 每次回到主页，加载提示条都重新出现（叉掉只对本次有效）
    // 用 visibility 而不是 display：叉掉后仍占着那一行的高度，
    // 下面的「注销」等按钮位置不会往上跳
    if (id === 'main-menu') {
      const tip = $('load-tip');
      if (tip) tip.style.visibility = '';
      // 账号资料不全（缺名字 / 缺密码 / 名字含敏感词）→ 回到主页就把修复窗口弹出来
      setTimeout(maybeAccountGate, 320);
    }
    setView(MENU_PANELS.indexOf(id) >= 0 ? 'menu' : 'game');
  }

  function renderTasks() {
    const list = $('tasks-list');
    if (!list) return;
    const today = Tasks.getToday();
    list.innerHTML = '';
    today.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'task-row' + (t.claimed ? ' done' : '');
      const pct = Math.round((t.progress / t.target) * 100);
      row.innerHTML =
        '<div class="task-info"><b>' + t.desc + '</b>' +
        '<div class="task-bar"><i style="width:' + pct + '%"></i></div>' +
        '<span class="task-num">' + Math.min(t.progress, t.target) + '/' + t.target + '</span></div>' +
        '<button class="task-claim" ' + (t.claimed || t.progress < t.target ? 'disabled' : '') + '>' +
        (t.claimed ? '已领取' : '+' + t.reward) + '</button>';
      const btn = row.querySelector('.task-claim');
      btn.addEventListener('click', () => {
        const got = Tasks.claim(t.id);
        if (got) {
          toast('领取 ' + got + ' 金币');
          renderTasks();
          updateHUD();
        }
      });
      list.appendChild(row);
    });
  }

  // 购买确认（点「🪙 价格」先弹确认，再真正扣钱）
  let pendingBuy = null;
  function openBuyConfirm(item) {
    pendingBuy = item;
    const box = $('buy-confirm');
    if (!box) { doBuy(item); return; }
    const wallet = Store.getWallet();
    const txt = $('buy-confirm-text');
    if (txt) {
      txt.innerHTML = '是否购买 <b>' + escHtml(item.name) + '</b>？<br>' +
        '<small>价格 🪙 ' + item.price + ' · 现有 🪙 ' + wallet.coins + '</small>';
    }
    box.style.display = 'flex';
  }
  function closeBuyConfirm() {
    const box = $('buy-confirm');
    if (box) box.style.display = 'none';
    pendingBuy = null;
  }
  function doBuy(item) {
    const res = Tasks.buy(item.key);
    if (!res.ok) {
      toast(res.reason === 'no-coins' ? '金币不足' : '购买失败');
      return;
    }
    toast('已购买 ' + item.name);
    renderShop();
    updateHUD();
  }

  // 商店：横向卡片，一次看一张，左右滑动看其余（和成就详情一样的节奏）
  // 记住停在第几张：退出商店再进来，卡片位置和下面的小圆点都还原
  let shopIdx = 0;

  function shopStepOf(cards) {
    const w = (cards && cards[0] && cards[0].offsetWidth) || 0;
    return (w + 10) || 1;
  }

  function applyShopDot(idx) {
    const dots = $('shop-dots');
    if (!dots) return;
    Array.prototype.slice.call(dots.children || []).forEach((d, i) => {
      if (i === idx) d.classList.add('on'); else d.classList.remove('on');
    });
  }

  function syncShopDot() {
    const stage = $('shop-stage');
    const dots = $('shop-dots');
    if (!stage || !dots) return;
    const cards = stage.querySelectorAll ? stage.querySelectorAll('.shop-card') : [];
    if (!cards || !cards.length) return;
    const idx = Math.max(0, Math.min(cards.length - 1, Math.round(stage.scrollLeft / shopStepOf(cards))));
    shopIdx = idx;
    applyShopDot(idx);
  }

  // 面板收起时浏览器会把 scrollLeft 清零，所以要等它重新显示后再按记录的序号滚回去
  function restoreShopScroll() {
    const stage = $('shop-stage');
    if (!stage) return;
    const cards = stage.querySelectorAll ? stage.querySelectorAll('.shop-card') : [];
    if (!cards || !cards.length) return;
    stage.scrollLeft = shopIdx * shopStepOf(cards);
    applyShopDot(shopIdx);
  }

  function renderShop() {
    const list = $('shop-list');
    if (!list) return;
    const wallet = Store.getWallet();
    $('shop-coins').textContent = wallet.coins;
    const stage = $('shop-stage');
    list.innerHTML = '';
    Tasks.SHOP.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'shop-card';
      card.innerHTML =
        '<span class="shop-card-ico">' + item.icon + '</span>' +
        '<b class="shop-card-name">' + item.name + '</b>' +
        '<small class="shop-card-desc">' + item.desc.replace(/\n/g, '<br>') + '</small>' +
        '<span class="shop-card-own">持有 ' + (wallet.items[item.key] || 0) + '</span>' +
        '<button class="shop-buy" ' + (wallet.coins < item.price ? 'disabled' : '') + '>🪙 ' + item.price + '</button>';
      card.querySelector('.shop-buy').addEventListener('click', () => {
        openBuyConfirm(item);
      });
      list.appendChild(card);
    });

    const dots = $('shop-dots');
    if (dots) {
      dots.innerHTML = '';
      Tasks.SHOP.forEach((item, i) => {
        const d = document.createElement('i');
        d.className = 'shop-dot' + (i === shopIdx ? ' on' : '');
        dots.appendChild(d);
      });
    }
    if (stage) {
      stage.scrollLeft = shopIdx * shopStepOf(stage.querySelectorAll ? stage.querySelectorAll('.shop-card') : []);
      if (!stage._shopBound && stage.addEventListener) {
        stage.addEventListener('scroll', syncShopDot, { passive: true });
        stage._shopBound = true;
      }
    }
  }

  // 背包：展示买到的道具，并可在局内直接使用
  const ITEM_ACTION = {
    extraMoves: '使用',
    extraTime: '使用',
    shuffle: '使用',
    undo: '使用',
    startBomb: '放置',
    startLine: '放置',
    startMagnet: '放置',
    startPropeller: '放置',
    startPaint: '放置',
    startFrost: '放置',
    rainbow: '使用'
  };

  // 放置类道具的提示语
  const ITEM_TOAST = {
    startBomb: '已在随机位置放了一颗炸弹',
    startLine: '已在随机位置放了一条线消',
    startMagnet: '已在随机位置放了一块磁铁',
    startPropeller: '已在随机位置放了一块螺旋桨',
    startPaint: '已在随机位置放了一块颜料',
    startFrost: '已在随机位置放了一块霜块',
    rainbow: '已把一块变成彩虹'
  };

  // 道具只在局内可用（结算后 / 未开局都不行）
  function canUseItems() {
    return !!S.playing && !S.busy && !S.paused;
  }

  function useBackpackItem(key) {
    if (!canUseItems()) {
      toast('先开始一局游戏，道具在局内使用');
      return false;
    }
    // 道具算一步：冰块「每步每格最多砸一层」记账从头算
    S.iceHitMove = {};
    const wallet = Store.getWallet();
    if ((wallet.items[key] || 0) <= 0) {
      toast('道具数量不足');
      return false;
    }
    // +7s 只对限时关有意义：步数关先拦下，别白扣一个
    if (key === 'extraTime' && !S.timerOn) {
      toast('这一关按步数算，用不上时间道具');
      return false;
    }

    // 先扣道具再刷新数值，避免徽章把刚用掉的那 1 个也算进总数
    Store.useItem(key);

    // +3 步只在步数关用（限时关有专门的「+7s」，别互相顶替）
    if (key === 'extraMoves' && S.timerOn) {
      toast('这一关按时间算，用不上步数道具');
      return false;
    }
    if (key === 'extraMoves') {
      S.moves += 3;
      toast('步数 +3');
      updateHUD();
      checkMovesWarning();
    } else if (key === 'extraTime') {
      S.timeLeft += 7;
      updateHUD();
      toast('时间 +7s');
    } else if (key === 'shuffle') {
      S.shuffleLeft += 1;
      updateHUD();
      toast('洗牌 +1 次');
    } else if (key === 'undo') {
      S.undoLeft += 1;
      updateHUD();
      toast('撤回 +1 次');
    } else if (key === 'startBomb' || key === 'startLine' || key === 'rainbow' ||
      key === 'startMagnet' || key === 'startPropeller' || key === 'startPaint' || key === 'startFrost') {
      // 随机挑一个「还空着」的普通格变成对应特殊块（货物、冰、锁链上的格子不动）
      const spots = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!canPlaceNew(r, c)) continue;
          spots.push([r, c]);
        }
      }
      if (!spots.length) {
        toast('棋盘上没有可放置的位置');
        return false;
      }
      const spot = spots[randInt(spots.length)];
      markSpecial(spot[0], spot[1],
        key === 'startBomb' ? T.BOMB
          : key === 'startLine' ? (Math.random() < 0.5 ? T.LINE_H : T.LINE_V)
          : key === 'startMagnet' ? T.MAGNET
          : key === 'startPropeller' ? T.PROPELLER
          : key === 'startPaint' ? T.PAINT
          : key === 'startFrost' ? T.FROST
          : T.RAINBOW);
      drawStatic();
      AudioManager.playSFX('bomb');
      toast(ITEM_TOAST[key] || '已在随机位置放好');
    }

    renderBackpack();
    return true;
  }

  function renderBackpack() {
    const list = $('backpack-list');
    if (!list) return;
    const wallet = Store.getWallet();
    list.innerHTML = '';
    const owned = Tasks.SHOP.filter((item) => (wallet.items[item.key] || 0) > 0);
    if (!owned.length) {
      const empty = document.createElement('div');
      empty.className = 'm-empty';
      empty.textContent = '背包空空如也，去购物商店看看吧～';
      list.appendChild(empty);
      return;
    }
    owned.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'shop-row';
      row.innerHTML =
        '<span class="shop-icon">' + item.icon + '</span>' +
        // 背包里一行就够：第一句结尾用逗号接第二句（商店卡片依旧是两行）
        '<div class="shop-info"><b>' + item.name + '</b><small>' + item.desc.replace(/\n+/g, '，') + '</small></div>' +
        '<span class="shop-own">x' + wallet.items[item.key] + '</span>';
      const useBtn = document.createElement('button');
      useBtn.className = 'shop-buy';
      useBtn.textContent = ITEM_ACTION[item.key] || '使用';
      useBtn.disabled = !canUseItems();
      useBtn.addEventListener('click', () => openUseConfirm(item));
      row.appendChild(useBtn);
      list.appendChild(row);
    });
  }

  // ---------- 金币明细 ----------
  // 顶部一行：◀ 2026-11 ▶（月份）+ 类型（全部 / 支出 / 收入）；下面是上下滚动的明细列表
  let ledgerMonth = '';
  let ledgerType = 'all';

  function monthKeyOf(ms) {
    const d = new Date(ms);
    const m = d.getMonth() + 1;
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : String(m));
  }
  function monthKey(y, m) {
    return y + '-' + (m < 10 ? '0' + m : String(m));
  }

  // 年份下拉：从最早一笔记录（或建号）所在年到今年，未来的年份不列
  function ledgerYears() {
    const now = new Date();
    const curY = now.getFullYear();
    let minY = curY;
    (Store.getLedger ? Store.getLedger() : []).forEach((x) => {
      const y = new Date(x.t).getFullYear();
      if (y < minY) minY = y;
    });
    try {
      const acc = Account && Account.current ? Account.current() : null;
      const d = acc && acc.created ? new Date(acc.created) : null;
      if (d && !isNaN(d.getTime()) && d.getFullYear() < minY) minY = d.getFullYear();
    } catch (e) {}
    const out = [];
    for (let y = minY; y <= curY; y++) out.push(y);
    return out;
  }

  // ---------- 顶部三个按键：年 / 月 / 类型 ----------
  // 不用原生 <select>：手机上原生选择器收起后立刻点另一个会「闪一下就没」、点自己还不开，
  // 干脆自己画一个列表，点哪项由我们说了算，跟游戏里其它面板一个手感。
  let ledgerPop = '';          // '' | 'year' | 'month' | 'type'：当前展开的是哪一个

  function ledgerTypeLabel(v) {
    return v === 'expense' ? '支出' : (v === 'income' ? '收入' : '全部');
  }

  // 把 ledgerMonth 纠正到合法范围（选不到未来），返回拆好的年月
  function ledgerYM() {
    const now = new Date();
    const curY = now.getFullYear(), curM = now.getMonth() + 1;
    const parts = String(ledgerMonth || '').split('-');
    let y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    if (!y || !m) { y = curY; m = curM; }
    if (y > curY) { y = curY; m = curM; }
    if (y === curY && m > curM) m = curM;
    ledgerMonth = monthKey(y, m);
    return { y: y, m: m, curY: curY, curM: curM };
  }

  // 三个按键上的文字 + 哪个正展开
  function syncLedgerButtons() {
    const ym = ledgerYM();
    const map = [['year', $('ledger-year'), ym.y + ' 年'],
      ['month', $('ledger-month'), ym.m + ' 月'],
      ['type', $('ledger-type'), ledgerTypeLabel(ledgerType)]];
    map.forEach((p) => {
      if (!p[1]) return;
      if (p[1].textContent !== p[2]) p[1].textContent = p[2];
      if (p[1].classList) p[1].classList.toggle('is-open', ledgerPop === p[0]);
    });
  }

  function ledgerOptions(kind) {
    const ym = ledgerYM();
    if (kind === 'year') {
      return ledgerYears().map((yy) => ({ value: String(yy), label: yy + ' 年', off: false }));
    }
    if (kind === 'month') {
      const out = [];
      for (let mm = 1; mm <= 12; mm++) {
        out.push({
          value: mm < 10 ? '0' + mm : String(mm),
          label: mm + ' 月',
          off: ym.y === ym.curY && mm > ym.curM      // 未来月份点不了
        });
      }
      return out;
    }
    return [{ value: 'all', label: '全部', off: false },
      { value: 'expense', label: '支出', off: false },
      { value: 'income', label: '收入', off: false }];
  }

  function closeLedgerPop() {
    ledgerPop = '';
    const pop = $('ledger-pop');
    if (pop) { pop.style.display = 'none'; pop.innerHTML = ''; }
    syncLedgerButtons();
  }

  // 下拉的宽度和位置跟着「当前正在点的那个按键」走：点年就贴年键、点月就贴月键，
  // 宽度也和按键一样，看起来就像从键里拉出来的一张纸，不是横跨一整行。
  function placeLedgerPop() {
    const pop = $('ledger-pop');
    if (!pop || !ledgerPop) return;
    const btn = $(ledgerPop === 'year' ? 'ledger-year'
      : (ledgerPop === 'month' ? 'ledger-month' : 'ledger-type'));
    if (!btn || !btn.offsetWidth) return;   // 面板还没显示时量不到，等真正展开再量
    pop.style.left = btn.offsetLeft + 'px';
    pop.style.top = (btn.offsetTop + btn.offsetHeight + 6) + 'px';
    pop.style.width = btn.offsetWidth + 'px';
  }

  // 画当前展开的那个列表（一次只开一个）
  function renderLedgerPop() {
    const pop = $('ledger-pop');
    if (!pop) return;
    if (!ledgerPop) { pop.style.display = 'none'; pop.innerHTML = ''; return; }
    const ym = ledgerYM();
    const curVal = ledgerPop === 'year' ? String(ym.y)
      : (ledgerPop === 'month' ? (ym.m < 10 ? '0' + ym.m : String(ym.m)) : ledgerType);
    pop.innerHTML = '';
    ledgerOptions(ledgerPop).forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ledger-opt' + (o.off ? ' is-off' : '') + (o.value === curVal ? ' is-active' : '');
      b.textContent = o.label;
      if (o.off) b.disabled = true;
      b.addEventListener('click', () => {
        if (o.off) return;
        applyLedgerChoice(ledgerPop, o.value);
      });
      pop.appendChild(b);
    });
    pop.style.display = 'flex';
    placeLedgerPop();                                      // 宽度 / 位置对齐当前按键
    const act = pop.querySelector('.is-active');           // 展开时让当前选中的那项露出来
    if (act && act.scrollIntoView) {
      try { act.scrollIntoView({ block: 'center' }); } catch (e) {}
    }
  }

  function applyLedgerChoice(kind, value) {
    const ym = ledgerYM();
    if (kind === 'year') {
      const y = parseInt(value, 10) || ym.curY;
      let m = ym.m;
      if (y === ym.curY && m > ym.curM) m = ym.curM;   // 换到今年时月份不能超过当月
      ledgerMonth = monthKey(y, m);
    } else if (kind === 'month') {
      ledgerMonth = monthKey(ym.y, parseInt(value, 10) || 1);
    } else {
      ledgerType = (value === 'income' || value === 'expense') ? value : 'all';
    }
    closeLedgerPop();
    renderLedger();
  }

  function openLedgerPop(kind) {
    ledgerPop = (ledgerPop === kind) ? '' : kind;   // 再点同一个就收起
    renderLedgerPop();
    syncLedgerButtons();
  }

  function renderLedger() {
    const list = $('ledger-list');
    if (!list) return;
    const all = Store.getLedger ? Store.getLedger() : [];
    // 第一次打开：默认落在最近一条记录所在的月份
    if (!ledgerMonth) {
      // 默认落在最近一笔所在的月份（不是数组最后一条：补记的历史收支会插在更早的时间）
      let last = 0;
      all.forEach((x) => { if (x.t > last) last = x.t; });
      ledgerMonth = monthKeyOf(last || Date.now());
    }
    // 三个按键的文字和展开的列表跟着状态走；未来年月一律拉回当月
    syncLedgerButtons();
    renderLedgerPop();

    const rows = all.filter((x) => {
      if (monthKeyOf(x.t) !== ledgerMonth) return false;
      if (ledgerType === 'income') return x.d > 0;
      if (ledgerType === 'expense') return x.d < 0;
      return true;
    }).sort((a, b) => b.t - a.t);   // 最新一笔排最上面

    list.innerHTML = '';
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'ledger-empty';
      empty.textContent = ledgerType === 'income' ? '这个月没有收入'
        : (ledgerType === 'expense' ? '这个月没有支出' : '这个月没有记录');
      list.appendChild(empty);
      list.scrollTop = 0;
      return;
    }
    const p2 = (n) => (n < 10 ? '0' + n : String(n));
    rows.forEach((x) => {
      const d = new Date(x.t);
      const row = document.createElement('div');
      row.className = 'ledger-row';
      row.innerHTML = '<div class="ledger-info">' +
        '<span class="ledger-memo">' + escHtml(x.m) +
        (x.x ? '<small class="ledger-detail">' + escHtml(x.x) + '</small>' : '') +
        '</span>' +
        '<span class="ledger-time">' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) +
        ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + '</span>' +
        '</div>' +
        '<b class="ledger-amt ' + (x.d > 0 ? 'up' : 'down') + '">' +
        (x.d > 0 ? '+' : '−') + Math.abs(x.d) + '</b>';
      list.appendChild(row);
    });
    list.scrollTop = 0;
  }

  // 使用道具确认：点「使用」先弹确认，确认后才真正扣道具生效
  let pendingUse = null;  function openUseConfirm(item) {
    if (!canUseItems()) { useBackpackItem(item.key); return; }   // 未开局：按钮本应禁用，兜底走提示
    pendingUse = item;
    const box = $('use-confirm');
    if (!box) { useBackpackItem(item.key); return; }
    const wallet = Store.getWallet();
    const txt = $('use-confirm-text');
    if (txt) {
      txt.innerHTML = '是否使用 <b>' + escHtml(item.name) + '</b>？<br>' +
        '<small>现有 ' + (wallet.items[item.key] || 0) + ' 个</small>';
    }
    box.style.display = 'flex';
  }
  function closeUseConfirm() {
    const box = $('use-confirm');
    if (box) box.style.display = 'none';
    pendingUse = null;
  }

  // 关卡记录：点任意一关 → 回主页，并把主页当前关卡切到这一关
  function selectMenuLevel(lv) {
    // 只允许切到已解锁的关卡（存了超前值也拉回来）
    const maxU = Store.maxUnlockedLevel(maxMainLevel());
    S.menuLevel = Math.max(1, Math.min(lv, maxU));
    Store.setSettings({ menuLevel: S.menuLevel });
    const hm = $('history-menu');
    if (hm) hm.style.display = 'none';
    S.playing = false;
    showOverlay('main-menu');
    refreshMenu();
    toast('已切换到第 ' + S.menuLevel + ' 关');
  }

  // 主线是否全部通关（每一关都至少 1 星）
  function allLevelsCleared() {
    const prog = Store.getProgress() || {};
    const total = maxMainLevel();
    if (!total) return false;
    for (let i = 1; i <= total; i++) {
      if (!prog[i] || !(prog[i].stars > 0)) return false;
    }
    return true;
  }

  // 消消乐大师（主线成绩单）：每次打开都按存档里的最新数据重新算
  // 关卡记录右下角的「结算」键随时都能进来，所以标题不是「恭喜全通关」
  function showCompletePanel() {
    const prog = Store.getProgress() || {};
    const total = maxMainLevel() || 1;
    let totalScore = 0, totalStars = 0, cleared = 0, perfect = 0;
    Object.keys(prog).forEach((k) => {
      const r = prog[k] || {};
      // 只有真的通关（有星）的关卡才计入总分；没通关的那局分数不算
      if ((r.stars || 0) > 0) {
        totalScore += r.score || 0;
        totalStars += r.stars || 0;
        cleared++;
        if (r.stars >= 3) perfect++;
      }
    });
    const ratio = Math.min(1, cleared / total);

    // 称号：等级 + 玩家名（如「达人·奶龙玩家」）；等级按通关进度，全通关后再看三星数
    let rank = '学徒';
    if (cleared >= total) rank = (perfect >= total) ? '宗师' : '大师';
    else if (ratio >= 0.75) rank = '高手';
    else if (ratio >= 0.5) rank = '达人';
    else if (ratio >= 0.25) rank = '新星';
    let nick = '奶龙玩家';
    try { if (typeof Meta !== 'undefined' && Meta.nickname) nick = Meta.nickname() || '奶龙玩家'; } catch (e) {}
    const title = rank + '·' + nick;

    const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
    // 称号左边的方块：所有称号统一放原色奶龙贴图（什么颜色就是什么颜色，不染色不换图）
    const crownBox = $('master-crown');
    if (crownBox) crownBox.innerHTML = '<img src="./assets/nailong.png" alt="奶龙">';
    setText('master-title', title);
    // 「🎉 恭喜」彩色：文字由 CSS 渐变裁切，🎉 用彩虹填充的图片（彩色字形无法直接染色）
    const greetIco = $('master-greet-ico');
    if (greetIco) {
      const rbGreet = rainbowEmojiData('🎉');
      greetIco.innerHTML = rbGreet ? '<img src="' + rbGreet + '" alt="">' : '🎉';
    }
    // 不写「/ 总数」：只说已经拿到多少
    setText('master-progress', '已通 ' + cleared + ' 关 · 三星 ' + perfect + ' 关');

    // 成就：已经点亮的枚数
    let achGot = 0;
    try {
      achGot = Meta.ACHIEVEMENTS.filter((a) => Meta.tierOf(a.id) >= 1).length;
    } catch (e) {}

    // 四格数字全部滚动，时长一致（900ms）
    const pf = $('master-perfect'), ac = $('master-ach');
    if (pf) { pf.textContent = '0'; countUp(pf, perfect, 900); }
    if (ac) { ac.textContent = '0'; countUp(ac, achGot, 900); }

    const sc = $('complete-total-score'), st = $('complete-total-stars');
    if (st) { st.textContent = '0'; countUp(st, totalStars, 900); }   // 总星数和总分数同一时长滚动
    if (sc) { sc.textContent = '0'; countUp(sc, totalScore, 900); }
    const panel = $('game-complete');
    if (panel) panel.style.display = 'flex';
  }

  // 这一关是不是「运送货物」关（第四章起，运送关的货物里混了糖果）
  function levelHasCandy(lv, def) {
    const d = def || getLevelDef(lv);
    return !!(d && d.goal && d.goal.type === 'drop' && d.id >= 31 && (d.cargo || 0) > 0);
  }
  // 关卡记录 / 章节地图上写的玩法名：运送关从第四章起标成「运送货物」（不带 emoji）
  function levelModeLabel(lv, def) {
    const d = def || getLevelDef(lv);
    if (!d || !d.goal) return '';
    if (levelHasCandy(lv, d)) return '运送货物';
    return Goals.LABEL[d.goal.type] || '';
  }

  function renderHistory() {
    const list = $('history-list');
    if (!list) return;
    const prog = Store.getProgress();
    const maxUnlocked = Store.maxUnlockedLevel(maxMainLevel());
    const total = maxMainLevel();
    list.innerHTML = '';
    // 只列出「已解锁的全部关卡」+「1 个未解锁的下一关」，总关数对玩家保密
    const showTo = Math.min(total, maxUnlocked + 1);
    for (let i = 1; i <= showTo; i++) {
      const rec = prog[i] || { score: 0, stars: 0 };
      const locked = i > maxUnlocked;
      const row = document.createElement('div');
      row.className = 'history-item' + (locked ? ' locked' : '');
      if (i === (S.menuLevel || 0)) row.classList.add('current');
      // 三列：关卡名 | 星星（奖牌贴在星星左边） | 分数
      const medal = locked ? '' : medalForLevel(i);
      const medalStr = medal ? '<em class="lb-medal">' + medal + '</em>' : '';
      const starStr = medalStr +
        '<span class="star-on">' + '⭐'.repeat(rec.stars) + '</span>' +
        '<span class="star-off">' + '⭐'.repeat(3 - rec.stars) + '</span>';
      // 已解锁的关卡在同样的位置、同样的字号标出模式；未解锁显示「未解锁」
      let tag = ' <small class="lock-tag">未解锁</small>';
      if (!locked) {
        const def = getLevelDef(i);
        const modeName = levelModeLabel(i, def);
        const candyCls = levelHasCandy(i, def) ? ' candy-tag' : '';
        tag = modeName ? ' <small class="mode-tag' + candyCls + '">' + modeName + '</small>' : '';
      }
      row.innerHTML =
        '<span class="h-name"><span class="h-lv">第 ' + i + ' 关</span>' + tag + '</span>' +
        '<span class="h-stars">' + starStr + '</span>' +
        '<span class="h-score' + (rec.score > 0 && rec.stars === 0 ? ' fail' : '') + '">' + rec.score + '</span>';
      row.addEventListener('click', () => {
        // 未解锁的关卡不能跳转
        if (locked) {
          toast('第 ' + i + ' 关未解锁（需先过第 ' + (i - 1) + ' 关）');
          AudioManager.playSFX('invalid');
          return;
        }
        selectMenuLevel(i);
      });
      list.appendChild(row);
    }
  }

  // 打开关卡记录时，把当前关卡平滑滑到列表中间：
  // 目标位置会夹到 [0, 最大滚动量]，所以偏上的关不动、偏下的关滑到底
  function scrollHistoryToCurrent() {
    const list = $('history-list');
    if (!list) return;
    const cur = list.querySelector('.history-item.current');
    scrollMenuToCenter(list, cur);
  }

  // 通用：把 el 平滑滑到滚动容器 box 的中间（关卡记录 / 章节地图共用一套效果）
  function scrollMenuToCenter(box, el) {
    if (!box || !el) return;
    // 用 rect 算「条目在滚动内容里的位置」：offsetTop 是相对面板的，
    // 会把标题等面板高度算进来，导致滚动位置算偏（滑到最底/最顶）
    const boxRect = box.getBoundingClientRect();
    const curRect = el.getBoundingClientRect();
    const curTop = curRect.top - boxRect.top + box.scrollTop;
    const max = Math.max(0, box.scrollHeight - box.clientHeight);
    // 让当前条目垂直居中
    const target = curTop - (box.clientHeight - el.offsetHeight) / 2;
    const top = Math.max(0, Math.min(target, max));
    const from = box.scrollTop;
    if (Math.abs(top - from) < 1) return; // 已经到位，不用滑
    // 自己补间，兼容不支持平滑滚动 / 虚拟时钟的环境
    const dur = 320;
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      box.scrollTop = from + (top - from) * e;
      if (p < 1) setTimeout(step, 16);
    };
    setTimeout(step, 40);
  }

  // 章节地图：和关卡记录一样，内列表自己滚，把当前关卡平滑滑到中间
  function scrollChaptersToCurrent() {
    const box = $('chapters-list');
    if (!box) return;
    const cur = box.querySelector('.level-chip.current');
    if (!cur) return;
    scrollMenuToCenter(box, cur);
  }

  // ==================== 后台统计：全网次数 / 设备 / 地址 / 进度 ====================
  const ABACUS_BASE = 'https://abacus.jasoncameron.dev/';

  // IP 定位源（浏览器端只能靠第三方 IP 库，多源互相兜底）：
  //   · ipinfo / ipapi.is 是同一套库，对国内移动网络（尤其 IPv6）判断明显更准；
  //   · ipwho.is 常把移动 IPv6 直接判成「北京」，只在前面两个都失败时兜底（它给中文，匹配稳）。
  const GEO_SOURCES = [
    {
      name: 'ipinfo', url: 'https://ipinfo.io/json',
      pick: (j) => (j && j.country && j.country !== 'undefined'
        ? { countryCode: String(j.country).toUpperCase(), country: '', region: j.region || '', city: j.city || '', ip: j.ip || '' }
        : null)
    },
    {
      name: 'ipapi.is', url: 'https://api.ipapi.is/',
      pick: (j) => (j && j.country
        ? { countryCode: '', country: j.country || '', region: j.region || '', city: j.city || '', ip: j.ip || '' }
        : null)
    },
    {
      name: 'ipwho', url: 'https://ipwho.is/?lang=zh-CN',
      pick: (j) => (j && j.success !== false && j.country
        ? { countryCode: j.country_code || '', country: j.country || '', region: j.region || '', city: j.city || '', ip: j.ip || '' }
        : null)
    }
  ];

  // 国家/地区中文名（港澳台按中国省份统计，不落「海外」）
  const COUNTRY_CN = {
    CN: '中国', HK: '中国香港', MO: '中国澳门', TW: '中国台湾',
    US: '美国', JP: '日本', KR: '韩国', SG: '新加坡', MY: '马来西亚', TH: '泰国',
    VN: '越南', PH: '菲律宾', ID: '印度尼西亚', IN: '印度', GB: '英国', DE: '德国',
    FR: '法国', CA: '加拿大', AU: '澳大利亚', NZ: '新西兰', RU: '俄罗斯', BR: '巴西',
    IT: '意大利', ES: '西班牙', NL: '荷兰', AE: '阿联酋', SA: '沙特阿拉伯',
    TR: '土耳其', MX: '墨西哥', CH: '瑞士', SE: '瑞典', PL: '波兰', KP: '朝鲜', MN: '蒙古'
  };

  // 有的库（ipapi.is）只给英文国名不给国家码，这里先翻成码再取中文
  const COUNTRY_NAME_TO_CODE = {
    china: 'CN', 'hong kong': 'HK', 'hong kong sar': 'HK', macau: 'MO', macao: 'MO', taiwan: 'TW',
    'united states': 'US', 'united states of america': 'US', japan: 'JP', 'south korea': 'KR',
    'korea, republic of': 'KR', 'republic of korea': 'KR', singapore: 'SG', malaysia: 'MY',
    thailand: 'TH', vietnam: 'VN', 'viet nam': 'VN', philippines: 'PH', indonesia: 'ID',
    india: 'IN', 'united kingdom': 'GB', germany: 'DE', france: 'FR', canada: 'CA',
    australia: 'AU', 'new zealand': 'NZ', russia: 'RU', 'russian federation': 'RU', brazil: 'BR'
  };

  // 英文国名 → 国家码（懒加载一次，之后走缓存）
  let _enRegionMap = null;
  function enRegionToCode(name) {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return '';
    if (COUNTRY_NAME_TO_CODE[key]) return COUNTRY_NAME_TO_CODE[key];
    if (!_enRegionMap) {
      _enRegionMap = {};
      try {
        const en = new Intl.DisplayNames(['en'], { type: 'region' });
        for (let a = 65; a <= 90; a++) {
          for (let b = 65; b <= 90; b++) {
            const code = String.fromCharCode(a) + String.fromCharCode(b);
            try {
              const n = en.of(code);
              if (n && n !== code) _enRegionMap[String(n).toLowerCase()] = code;
            } catch (e) {}
          }
        }
      } catch (e) {}
    }
    return _enRegionMap[key] || '';
  }

  function countryLabel(geo) {
    let cc = String((geo && geo.countryCode) || '').toUpperCase();
    if (!cc && geo && geo.country) cc = enRegionToCode(geo.country);
    if (cc) {
      if (COUNTRY_CN[cc]) return COUNTRY_CN[cc];
      try {
        const n = new Intl.DisplayNames(['zh-CN'], { type: 'region' }).of(cc);
        if (n) return n;
      } catch (e) {}
      return cc;
    }
    const raw = String((geo && geo.country) || '');
    return /[\u4e00-\u9fa5]/.test(raw) ? raw : '';
  }

  // 省份名单：计数器 key 只支持英文字母，这里存「简称 → 拼音代号」（北京市→北京、四川省→四川…）
  const PROVINCES = [
    ['北京', 'beijing'], ['天津', 'tianjin'], ['上海', 'shanghai'], ['重庆', 'chongqing'],
    ['河北', 'hebei'], ['山西', 'shanxi'], ['辽宁', 'liaoning'], ['吉林', 'jilin'],
    ['黑龙江', 'heilongjiang'], ['江苏', 'jiangsu'], ['浙江', 'zhejiang'], ['安徽', 'anhui'],
    ['福建', 'fujian'], ['江西', 'jiangxi'], ['山东', 'shandong'], ['河南', 'henan'],
    ['湖北', 'hubei'], ['湖南', 'hunan'], ['广东', 'guangdong'], ['海南', 'hainan'],
    ['四川', 'sichuan'], ['贵州', 'guizhou'], ['云南', 'yunnan'], ['陕西', 'shaanxi'],
    ['甘肃', 'gansu'], ['青海', 'qinghai'], ['台湾', 'taiwan'],
    ['内蒙古', 'neimenggu'], ['广西', 'guangxi'], ['西藏', 'xizang'],
    ['宁夏', 'ningxia'], ['新疆', 'xinjiang'],
    ['香港', 'xianggang'], ['澳门', 'aomen']
  ];

  // 国外 IP 单独一行（算进全网点击，但不归属任何省份）
  const PROV_OVERSEAS = ['🌍 海外', 'overseas'];

  // 海外国家/地区表：点击统计页的「🌍 海外」展开看具体国家。
  // 计数键 = ovr_<两位国家码>（bumpProvHits 里记录）；表外国家的点击只进「海外」总数。
  const OVERSEAS_COUNTRIES = [
    ['US', '美国'], ['JP', '日本'], ['KR', '韩国'], ['SG', '新加坡'], ['MY', '马来西亚'],
    ['TH', '泰国'], ['VN', '越南'], ['PH', '菲律宾'], ['ID', '印度尼西亚'], ['IN', '印度'],
    ['MM', '缅甸'], ['KH', '柬埔寨'], ['LA', '老挝'], ['NP', '尼泊尔'], ['PK', '巴基斯坦'],
    ['BD', '孟加拉国'], ['LK', '斯里兰卡'], ['MN', '蒙古'], ['KZ', '哈萨克斯坦'], ['UZ', '乌兹别克斯坦'],
    ['AE', '阿联酋'], ['SA', '沙特阿拉伯'], ['QA', '卡塔尔'], ['TR', '土耳其'], ['IL', '以色列'],
    ['GB', '英国'], ['FR', '法国'], ['DE', '德国'], ['IT', '意大利'], ['ES', '西班牙'],
    ['PT', '葡萄牙'], ['NL', '荷兰'], ['BE', '比利时'], ['CH', '瑞士'], ['AT', '奥地利'],
    ['SE', '瑞典'], ['NO', '挪威'], ['DK', '丹麦'], ['FI', '芬兰'], ['PL', '波兰'],
    ['CZ', '捷克'], ['HU', '匈牙利'], ['RO', '罗马尼亚'], ['GR', '希腊'], ['IE', '爱尔兰'],
    ['RU', '俄罗斯'], ['UA', '乌克兰'], ['BY', '白俄罗斯'], ['CA', '加拿大'], ['MX', '墨西哥'],
    ['BR', '巴西'], ['AR', '阿根廷'], ['CL', '智利'], ['CO', '哥伦比亚'], ['PE', '秘鲁'],
    ['AU', '澳大利亚'], ['NZ', '新西兰'], ['FJ', '斐济'], ['EG', '埃及'], ['ZA', '南非'],
    ['NG', '尼日利亚'], ['KE', '肯尼亚'], ['MA', '摩洛哥']
  ];

  // 两位国家码 → 旗帜 emoji（🇯🇵 这种）
  function ccFlag(cc) {
    const s = String(cc || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(s)) return '';
    return String.fromCodePoint(s.charCodeAt(0) - 65 + 0x1f1e6, s.charCodeAt(1) - 65 + 0x1f1e6);
  }

  // 海外点击要记的国家键：优先两位国家码；没有就按国家中文名反查；都没有返回 null（只进海外总数）
  function overseasHitKey(cc, countryName) {
    const code = String(cc || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) return 'ovr_' + code;
    const n = String(countryName || '').trim();
    const found = OVERSEAS_COUNTRIES.filter((c) => c[1] === n)[0];
    return found ? 'ovr_' + found[0] : null;
  }

  // ipinfo / ipapi.is 返回的是英文省名，这里做「英文名 → 内部代号」映射。
  // 归一化后（小写 + 去空格标点）精确匹配，所以 Shanxi(山西) / Shaanxi(陕西) 不会互相串。
  const PROVINCE_EN = {
    beijing: 'beijing', tianjin: 'tianjin', shanghai: 'shanghai', chongqing: 'chongqing',
    hebei: 'hebei', shanxi: 'shanxi', liaoning: 'liaoning', jilin: 'jilin',
    heilongjiang: 'heilongjiang', jiangsu: 'jiangsu', zhejiang: 'zhejiang', anhui: 'anhui',
    fujian: 'fujian', jiangxi: 'jiangxi', shandong: 'shandong', henan: 'henan',
    hubei: 'hubei', hunan: 'hunan', guangdong: 'guangdong', hainan: 'hainan',
    sichuan: 'sichuan', guizhou: 'guizhou', yunnan: 'yunnan', shaanxi: 'shaanxi',
    gansu: 'gansu', qinghai: 'qinghai', taiwan: 'taiwan',
    innermongolia: 'neimenggu', neimenggu: 'neimenggu', neimongol: 'neimenggu',
    guangxi: 'guangxi', tibet: 'xizang', xizang: 'xizang',
    ningxia: 'ningxia', xinjiang: 'xinjiang',
    hongkong: 'xianggang', macau: 'aomen', macao: 'aomen'
  };

  function normEn(s) {
    return String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  }

  function provByCode(code) {
    for (let i = 0; i < PROVINCES.length; i++) {
      if (PROVINCES[i][1] === code) return { name: PROVINCES[i][0], code: PROVINCES[i][1] };
    }
    return null;
  }

  function matchProvince(region) {
    const r = String(region || '').trim();
    if (!r) return null;
    // 1) 英文省名（ipinfo / ipapi.is）：精确匹配
    const en = PROVINCE_EN[normEn(r)];
    if (en) {
      const hit = provByCode(en);
      if (hit) return hit;
    }
    // 2) 中文省名（ipwho.is 等）：包含匹配，「四川省」→ 四川
    for (let i = 0; i < PROVINCES.length; i++) {
      const short = PROVINCES[i][0].replace(/(维吾尔|回族)?自治区$|省$|市$/, '');
      if (r.indexOf(short) >= 0) return { name: PROVINCES[i][0], code: PROVINCES[i][1] };
    }
    // 3) 复合串（"Sichuan, China"）里夹着英文省名：长名优先，避免 shanxi 命中 shaanxi
    const nr = normEn(r);
    const keys = Object.keys(PROVINCE_EN).sort((a, b) => b.length - a.length);
    for (let i = 0; i < keys.length; i++) {
      if (nr.indexOf(keys[i]) >= 0) {
        const hit = provByCode(PROVINCE_EN[keys[i]]);
        if (hit) return hit;
      }
    }
    return null;
  }

  // 每次点击页面，把所在省份的计数 +1（供后台省份统计读取）
  // 只统计「真人 + 定位成功」的点击：AI、定位失败的一律不计入任何统计

  // ============ 市级统计：各省地级行政区（中文名 → 计数器代号） ============
  // 每次点击页面，所在市 +1（city_<省代号>_<市代号>）；点统计页里的省份可看
  const CITY_TABLE = {
    beijing: [['北京市', 'beijing']],
    tianjin: [['天津市', 'tianjin']],
    shanghai: [['上海市', 'shanghai']],
    chongqing: [['重庆市', 'chongqing']],
    hebei: [['石家庄市', 'shijiazhuang'], ['唐山市', 'tangshan'], ['秦皇岛市', 'qinhuangdao'], ['邯郸市', 'handan'], ['邢台市', 'xingtai'], ['保定市', 'baoding'], ['张家口市', 'zhangjiakou'], ['承德市', 'chengde'], ['沧州市', 'cangzhou'], ['廊坊市', 'langfang'], ['衡水市', 'hengshui']],
    shanxi: [['太原市', 'taiyuan'], ['大同市', 'datong'], ['阳泉市', 'yangquan'], ['长治市', 'changzhi'], ['晋城市', 'jincheng'], ['朔州市', 'shuozhou'], ['晋中市', 'jinzhong'], ['运城市', 'yuncheng'], ['忻州市', 'xinzhou'], ['临汾市', 'linfen'], ['吕梁市', 'lvliang']],
    liaoning: [['沈阳市', 'shenyang'], ['大连市', 'dalian'], ['鞍山市', 'anshan'], ['抚顺市', 'fushun'], ['本溪市', 'benxi'], ['丹东市', 'dandong'], ['锦州市', 'jinzhou'], ['营口市', 'yingkou'], ['阜新市', 'fuxin'], ['辽阳市', 'liaoyang'], ['盘锦市', 'panjin'], ['铁岭市', 'tieling'], ['朝阳市', 'chaoyang'], ['葫芦岛市', 'huludao']],
    jilin: [['长春市', 'changchun'], ['吉林市', 'jilin'], ['四平市', 'siping'], ['辽源市', 'liaoyuan'], ['通化市', 'tonghua'], ['白山市', 'baishan'], ['松原市', 'songyuan'], ['白城市', 'baicheng'], ['延边州', 'yanbian']],
    heilongjiang: [['哈尔滨市', 'haerbin'], ['齐齐哈尔市', 'qiqihaer'], ['鸡西市', 'jixi'], ['鹤岗市', 'hegang'], ['双鸭山市', 'shuangyashan'], ['大庆市', 'daqing'], ['伊春市', 'yichun'], ['佳木斯市', 'jiamusi'], ['七台河市', 'qitaihe'], ['牡丹江市', 'mudanjiang'], ['黑河市', 'heihe'], ['绥化市', 'suihua'], ['大兴安岭地区', 'daxinganling']],
    jiangsu: [['南京市', 'nanjing'], ['无锡市', 'wuxi'], ['徐州市', 'xuzhou'], ['常州市', 'changzhou'], ['苏州市', 'suzhou'], ['南通市', 'nantong'], ['连云港市', 'lianyungang'], ['淮安市', 'huaian'], ['盐城市', 'yancheng'], ['扬州市', 'yangzhou'], ['镇江市', 'zhenjiang'], ['泰州市', 'taizhou'], ['宿迁市', 'suqian']],
    zhejiang: [['杭州市', 'hangzhou'], ['宁波市', 'ningbo'], ['温州市', 'wenzhou'], ['嘉兴市', 'jiaxing'], ['湖州市', 'huzhou'], ['绍兴市', 'shaoxing'], ['金华市', 'jinhua'], ['衢州市', 'quzhou'], ['舟山市', 'zhoushan'], ['台州市', 'taizhou2'], ['丽水市', 'lishui']],
    anhui: [['合肥市', 'hefei'], ['芜湖市', 'wuhu'], ['蚌埠市', 'bengbu'], ['淮南市', 'huainan'], ['马鞍山市', 'maanshan'], ['淮北市', 'huaibei'], ['铜陵市', 'tongling'], ['安庆市', 'anqing'], ['黄山市', 'huangshan'], ['滁州市', 'chuzhou'], ['阜阳市', 'fuyang'], ['宿州市', 'suzhou2'], ['六安市', 'luan'], ['亳州市', 'bozhou'], ['池州市', 'chizhou'], ['宣城市', 'xuancheng']],
    fujian: [['福州市', 'fuzhou'], ['厦门市', 'xiamen'], ['莆田市', 'putian'], ['三明市', 'sanming'], ['泉州市', 'quanzhou'], ['漳州市', 'zhangzhou'], ['南平市', 'nanping'], ['龙岩市', 'longyan'], ['宁德市', 'ningde']],
    jiangxi: [['南昌市', 'nanchang'], ['景德镇市', 'jingdezhen'], ['萍乡市', 'pingxiang'], ['九江市', 'jiujiang'], ['新余市', 'xinyu'], ['鹰潭市', 'yingtan'], ['赣州市', 'ganzhou'], ['吉安市', 'jian'], ['宜春市', 'yichun2'], ['抚州市', 'fuzhou2'], ['上饶市', 'shangrao']],
    shandong: [['济南市', 'jinan'], ['青岛市', 'qingdao'], ['淄博市', 'zibo'], ['枣庄市', 'zaozhuang'], ['东营市', 'dongying'], ['烟台市', 'yantai'], ['潍坊市', 'weifang'], ['济宁市', 'jining'], ['泰安市', 'taian'], ['威海市', 'weihai'], ['日照市', 'rizhao'], ['临沂市', 'linyi'], ['德州市', 'dezhou'], ['聊城市', 'liaocheng'], ['滨州市', 'binzhou'], ['菏泽市', 'heze']],
    henan: [['郑州市', 'zhengzhou'], ['开封市', 'kaifeng'], ['洛阳市', 'luoyang'], ['平顶山市', 'pingdingshan'], ['安阳市', 'anyang'], ['鹤壁市', 'hebi'], ['新乡市', 'xinxiang'], ['焦作市', 'jiaozuo'], ['濮阳市', 'puyang'], ['许昌市', 'xuchang'], ['漯河市', 'luohe'], ['三门峡市', 'sanmenxia'], ['南阳市', 'nanyang'], ['商丘市', 'shangqiu'], ['信阳市', 'xinyang'], ['周口市', 'zhoukou'], ['驻马店市', 'zhumadian'], ['济源市', 'jiyuan']],
    hubei: [['武汉市', 'wuhan'], ['黄石市', 'huangshi'], ['十堰市', 'shiyan'], ['宜昌市', 'yichang2'], ['襄阳市', 'xiangyang'], ['鄂州市', 'ezhou'], ['荆门市', 'jingmen'], ['孝感市', 'xiaogan'], ['荆州市', 'jingzhou'], ['黄冈市', 'huanggang'], ['咸宁市', 'xianning'], ['随州市', 'suizhou'], ['恩施州', 'enshi'], ['仙桃市', 'xiantao'], ['潜江市', 'qianjiang'], ['天门市', 'tianmen']],
    hunan: [['长沙市', 'changsha'], ['株洲市', 'zhuzhou'], ['湘潭市', 'xiangtan'], ['衡阳市', 'hengyang'], ['邵阳市', 'shaoyang'], ['岳阳市', 'yueyang'], ['常德市', 'changde'], ['张家界市', 'zhangjiajie'], ['益阳市', 'yiyang'], ['郴州市', 'chenzhou'], ['永州市', 'yongzhou'], ['怀化市', 'huaihua'], ['娄底市', 'loudi'], ['湘西州', 'xiangxi']],
    guangdong: [['广州市', 'guangzhou'], ['韶关市', 'shaoguan'], ['深圳市', 'shenzhen'], ['珠海市', 'zhuhai'], ['汕头市', 'shantou'], ['佛山市', 'foshan'], ['江门市', 'jiangmen'], ['湛江市', 'zhanjiang'], ['茂名市', 'maoming'], ['肇庆市', 'zhaoqing'], ['惠州市', 'huizhou'], ['梅州市', 'meizhou'], ['汕尾市', 'shanwei'], ['河源市', 'heyuan'], ['阳江市', 'yangjiang'], ['清远市', 'qingyuan'], ['东莞市', 'dongguan'], ['中山市', 'zhongshan'], ['潮州市', 'chaozhou'], ['揭阳市', 'jieyang'], ['云浮市', 'yunfu']],
    hainan: [['海口市', 'haikou'], ['三亚市', 'sanya'], ['三沙市', 'sansha'], ['儋州市', 'danzhou']],
    sichuan: [['成都市', 'chengdu'], ['自贡市', 'zigong'], ['攀枝花市', 'panzhihua'], ['泸州市', 'luzhou'], ['德阳市', 'deyang'], ['绵阳市', 'mianyang'], ['广元市', 'guangyuan'], ['遂宁市', 'suining'], ['内江市', 'neijiang'], ['乐山市', 'leshan'], ['南充市', 'nanchong'], ['眉山市', 'meishan'], ['宜宾市', 'yibin'], ['广安市', 'guangan'], ['达州市', 'dazhou'], ['雅安市', 'yaan'], ['巴中市', 'bazhong'], ['资阳市', 'ziyang'], ['阿坝州', 'aba'], ['甘孜州', 'ganzi'], ['凉山州', 'liangshan']],
    guizhou: [['贵阳市', 'guiyang'], ['六盘水市', 'liupanshui'], ['遵义市', 'zunyi'], ['安顺市', 'anshun'], ['毕节市', 'bijie'], ['铜仁市', 'tongren'], ['黔西南州', 'qianxinan'], ['黔东南州', 'qiandongnan'], ['黔南州', 'qiannan']],
    yunnan: [['昆明市', 'kunming'], ['曲靖市', 'qujing'], ['玉溪市', 'yuxi'], ['保山市', 'baoshan'], ['昭通市', 'zhaotong'], ['丽江市', 'lijiang'], ['普洱市', 'puer'], ['临沧市', 'lincang'], ['楚雄州', 'chuxiong'], ['红河州', 'honghe'], ['文山州', 'wenshan'], ['西双版纳州', 'xishuangbanna'], ['大理州', 'dali'], ['德宏州', 'dehong'], ['怒江州', 'nujiang'], ['迪庆州', 'diqing']],
    shaanxi: [['西安市', 'xian'], ['铜川市', 'tongchuan'], ['宝鸡市', 'baoji'], ['咸阳市', 'xianyang'], ['渭南市', 'weinan'], ['延安市', 'yanan'], ['汉中市', 'hanzhong'], ['榆林市', 'yulin2'], ['安康市', 'ankang'], ['商洛市', 'shangluo']],
    gansu: [['兰州市', 'lanzhou'], ['嘉峪关市', 'jiayuguan'], ['金昌市', 'jinchang'], ['白银市', 'baiyin'], ['天水市', 'tianshui'], ['武威市', 'wuwei'], ['张掖市', 'zhangye'], ['平凉市', 'pingliang'], ['酒泉市', 'jiuquan'], ['庆阳市', 'qingyang'], ['定西市', 'dingxi'], ['陇南市', 'longnan'], ['临夏州', 'linxia'], ['甘南州', 'gannan']],
    qinghai: [['西宁市', 'xining'], ['海东市', 'haidong'], ['海北州', 'haibei'], ['黄南州', 'huangnan'], ['海南州', 'hainanzhou'], ['果洛州', 'guoluo'], ['玉树州', 'yushu'], ['海西州', 'haixi']],
    taiwan: [['台北市', 'taibei'], ['新北市', 'xinbei'], ['桃园市', 'taoyuan'], ['台中市', 'taizhong'], ['台南市', 'tainan'], ['高雄市', 'gaoxiong']],
    neimenggu: [['呼和浩特市', 'huhehaote'], ['包头市', 'baotou'], ['乌海市', 'wuhai'], ['赤峰市', 'chifeng'], ['通辽市', 'tongliao'], ['鄂尔多斯市', 'eerduosi'], ['呼伦贝尔市', 'hulunbeier'], ['巴彦淖尔市', 'bayannaoer'], ['乌兰察布市', 'wulanchabu'], ['兴安盟', 'xingan'], ['锡林郭勒盟', 'xilinguole'], ['阿拉善盟', 'alashan']],
    guangxi: [['南宁市', 'nanning'], ['柳州市', 'liuzhou'], ['桂林市', 'guilin'], ['梧州市', 'wuzhou'], ['北海市', 'beihai'], ['防城港市', 'fangchenggang'], ['钦州市', 'qinzhou'], ['贵港市', 'guigang'], ['玉林市', 'yulin3'], ['百色市', 'baise'], ['贺州市', 'hezhou'], ['河池市', 'hechi'], ['来宾市', 'laibin'], ['崇左市', 'chongzuo']],
    xizang: [['拉萨市', 'lasa'], ['日喀则市', 'rikaze'], ['昌都市', 'changdu'], ['林芝市', 'linzhi'], ['山南市', 'shannan'], ['那曲市', 'naqu'], ['阿里地区', 'ali']],
    ningxia: [['银川市', 'yinchuan'], ['石嘴山市', 'shizuishan'], ['吴忠市', 'wuzhong2'], ['固原市', 'guyuan'], ['中卫市', 'zhongwei']],
    xinjiang: [['乌鲁木齐市', 'wulumuqi'], ['克拉玛依市', 'kelamayi'], ['吐鲁番市', 'tulufan'], ['哈密市', 'hami'], ['昌吉州', 'changji'], ['博尔塔拉州', 'boertala'], ['巴音郭楞州', 'bayinguoleng'], ['阿克苏地区', 'akesu'], ['克孜勒苏州', 'kezilesu'], ['喀什地区', 'kashi'], ['和田地区', 'hetian'], ['伊犁州', 'yili'], ['塔城地区', 'tacheng'], ['阿勒泰地区', 'aletai']],
    xianggang: [['香港', 'xianggang']],
    aomen: [['澳门', 'aomen']]
  };

  // 英文城市名 → 拼音代号 的例外（ipinfo 用的是当地惯用名，不一定是拼音）
  const CITY_EN_ALIAS = {
    harbin: 'haerbin', hohhot: 'huhehaote', urumqi: 'wulumuqi', lhasa: 'lasa',
    hulunbuir: 'hulunbeier', ordos: 'eerduosi', erdos: 'eerduosi',
    shigatse: 'rikaze', xigaze: 'rikaze', chamdo: 'changdu', qamdo: 'changdu',
    nyingchi: 'linzhi', lhoka: 'shannan', nagqu: 'naqu', nagchu: 'naqu',
    ngari: 'ali', gar: 'ali', kashgar: 'kashi', khotan: 'hetian', hotan: 'hetian',
    turpan: 'tulufan', turfan: 'tulufan', korla: 'bayinguoleng', karamay: 'kelamayi',
    ili: 'yili', yining: 'yili', altay: 'aletai',
    hongkong: 'xianggang', macau: 'aomen', macao: 'aomen',
    taipei: 'taibei', taichung: 'taizhong', kaohsiung: 'gaoxiong', newtaipei: 'xinbei'
  };

  // 把 IP 定位返回的城市名对应到市级统计表里（「成都市」/「Chengdu」都算成都）
  function matchCity(provCode, cityStr) {
    const list = CITY_TABLE[provCode];
    if (!list) return null;
    const raw = String(cityStr || '').trim();
    if (!raw) return null;

    if (/[\u4e00-\u9fa5]/.test(raw)) {
      // 中文城市名（ipwho.is）
      const g = raw.replace(/[市地区盟县州区自治]+$/, '').trim();
      if (!g) return null;
      for (let i = 0; i < list.length; i++) {
        const short = list[i][0].replace(/[市地区盟县州区自治]+$/, '');
        if (g === short || g.indexOf(short) >= 0 || (short.length >= 2 && short.indexOf(g) === 0)) {
          return { name: list[i][0], code: list[i][1] };
        }
      }
      return null;
    }

    // 英文城市名（ipinfo / ipapi.is）：拼音一般和代号一致，Chengdu → chengdu
    const c = normEn(raw);
    if (!c) return null;
    const alias = CITY_EN_ALIAS[c];
    if (alias) {
      for (let i = 0; i < list.length; i++) {
        if (list[i][1] === alias) return { name: list[i][0], code: list[i][1] };
      }
    }
    for (let i = 0; i < list.length; i++) {
      if (normEn(list[i][1]) === c) return { name: list[i][0], code: list[i][1] };
    }
    // 前缀兜底（Hulunbuir / Ordos 这类拼写差异），太短的不做模糊
    if (c.length >= 5) {
      for (let i = 0; i < list.length; i++) {
        const p = normEn(list[i][1]);
        if (p.length >= 5 && (p.indexOf(c) === 0 || c.indexOf(p) === 0)) {
          return { name: list[i][0], code: list[i][1] };
        }
      }
    }
    return null;
  }

  // ============ 识别「是不是 AI 在访问」 ============
  // 只能识别「跑在浏览器里、会执行 JS 的 AI / 自动化」：
  //   · 无头浏览器（HeadlessChrome / window.chrome 缺失 / navigator.webdriver）
  //   · 各家 AI 爬虫与助手的 UA（GPTBot、ClaudeBot、Bytespider、PerplexityBot…）
  // 纯 HTTP 抓取（不执行 JS 的爬虫）拿不到 UA 也跑不到这里，客户端统计不了，
  // GitHub Pages 也没有服务端日志，这种情况只能靠别的入口统计。
  function detectAI() {
    try {
      const nav = (typeof navigator !== 'undefined') ? navigator : {};
      const ua = nav.userAgent || '';
      if (nav.webdriver === true) return 'webdriver';
      if (/HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium/i.test(ua)) return 'headless';
      const bot = /(GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-Web|anthropic-ai|PerplexityBot|Google-Extended|Bytespider|CCBot|Amazonbot|Applebot|Bingbot|YandexBot|Baiduspider|Sogou web spider|facebookexternalhit|python-requests|python\/\d|curl\/|wget|Go-http-client|okhttp|java\/\d|node-fetch|undici|axios|scrapy)/i.exec(ua);
      if (bot) return bot[1].toLowerCase().replace(/[^a-z0-9]/g, '');
      // 桌面 Chrome 一定带 window.chrome；没有却自称 Chrome 的，基本都是无头环境
      // （必须排除手机 / 微信 / QQ 内置浏览器，它们也可能没有 window.chrome）
      const mobileOrWebview = /Mobile|Android|iPhone|iPad|MicroMessenger|QQBrowser|MQQBrowser|Weibo|AlipayClient|baiduboxapp/i.test(ua);
      const claimsChrome = /Chrome\/\d+/.test(ua) && !/Edg\/|OPR\/|Brave/i.test(ua);
      if (!mobileOrWebview && claimsChrome && /Windows NT|Macintosh/.test(ua) &&
        typeof window !== 'undefined' && !window.chrome) return 'headless';
    } catch (e) {}
    return '';
  }
  const AI_CLIENT = detectAI();          // 非空 = 本次访问被判定为 AI
  window.__nl_ai = AI_CLIENT;            // 方便自查：控制台输入 __nl_ai 看判定结果

  let provCounted = false;
  // 计数器 +1（只增不减）
  function hitCounter(key) {
    if (typeof fetch !== 'function') return;
    fetch(ABACUS_BASE + 'hit/nailong-xiaoxiaole-2026-v3/' + key, { cache: 'no-store' })
      .catch(() => {});
  }

  // 定位源没给城市名时，换另一个源再问一次，只补「市」这一笔（省已经记过了）
  function lateCityHit(provCode) {
    if (AI_CLIENT || typeof fetch !== 'function') return;
    if (typeof Store.countStart === 'function' && Date.now() < Store.countStart()) return;
    const sources = GEO_SOURCES.filter((s) => s.name !== 'ipwho');
    let i = 0;
    const ask = () => {
      if (i >= sources.length) return;
      const src = sources[i++];
      fetchWithTimeout(src.url, 5000).then((j) => {
        const g = j ? src.pick(j) : null;
        const c = g ? matchCity(provCode, g.city) : null;
        if (c) hitCounter('city_' + provCode + '_' + c.code);
        else ask();
      });
    };
    ask();
  }

  // 返回 true = 这次点击已经计进全网（省份/海外）；false = 定位没拿到，还可以重试
  function bumpProvHits(geoArg) {
    if (provCounted) return true;
    if (typeof fetch !== 'function') return true;
    // 只统计「真人」的点击：AI / 自动化访问一律不计
    if (AI_CLIENT) { provCounted = true; return true; }
    // 统计起点（2026-11-05 00:00:00）之前不记
    if (typeof Store.countStart === 'function' && Date.now() < Store.countStart()) {
      provCounted = true;
      return true;
    }
    const geo = geoArg || Store.getNet().geo || {};
    const hit = hitCounter;

    // country 可能是两位码（ipinfo：CN）或国家名（ipapi.is：China / ipwho：中国）
    // 港澳台在省份表里，按中国省份统计，不落「海外」
    const cc = String(geo.countryCode || '').trim().toUpperCase();
    const cn = String(geo.country || '').trim();
    const isCN = cc === 'CN' || cc === 'CHN' || cc === 'HK' || cc === 'MO' || cc === 'TW' ||
      /^(china|中国|中华人民共和国|hong kong|macau|macao|taiwan)$/i.test(cn);
    const known = !!(cc || cn);

    if (!isCN) {
      // 国外 IP：计入「🌍 海外」（单独一行，也算进全网点击），并尽量细分到国家
      if (known) {
        hit('prov_' + PROV_OVERSEAS[1]);
        const ok = overseasHitKey(cc, cn);
        if (ok) hit(ok);
        provCounted = true; return true;
      }
      hit('geo_unknown');       // 连国家都没识别出来：只做诊断，不显示
      return false;
    }

    const p = matchProvince(geo.region);
    if (!p) {
      hit('geo_unknown');            // 是中国的 IP，但省没识别出来（极少见）：只做诊断
      return false;
    }
    hit('prov_' + p.code);
    provCounted = true;
    // 市级统计（点统计页里的省份可以看到）
    let city = matchCity(p.code, geo.city);
    // 直辖市 / 港澳只有「一个市」，定位没给城市名时直接归到它，避免出现「未定位到市」
    if (!city) {
      const only = CITY_TABLE[p.code];
      if (only && only.length === 1) city = { name: only[0][0], code: only[0][1] };
    }
    if (city) hit('city_' + p.code + '_' + city.code);
    else lateCityHit(p.code);   // 这个源没给城市名 → 换源补一次，尽量不出现「未定位到市」
    return true;
  }

  // 把本机这一次点击算进全网：定位没回来就等它，最多重试 3 次，绝不因为接口抖动丢点击
  function attributeClick(tries) {
    fetchGeoFast().then((g) => {
      const ok = g ? bumpProvHits(g) : false;
      if (!ok && tries < 3) setTimeout(() => attributeClick(tries + 1), 3000 * (tries + 1));
    });
  }

  // ============ 省份统计（含市级下钻） ============
  // 口径：真人且定位成功的点击才计数（AI / 自动化直接排除）。
  //   · 中国的 IP → 记到具体省份（再尽量记到市）；
  //   · 国外 IP   → 记到「🌍 海外」一行（固定排最后，也算进全网点击），并细分记到 ovr_<国家码>；
  //   · 定位接口全挂 → 记 geo_unknown 只做诊断，不上屏。
  // 后台「点击」= 各省之和 + 海外 = 统计页「合计」，两边永远同源。

  let provRows = [];     // 有点击记录的省份，降序（只含真实点击）

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function fetchWithTimeout(url, ms) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, ms);
      fetch(url, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (!done) { done = true; clearTimeout(timer); resolve(j); } })
        .catch(() => { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
    });
  }

  // 读一个省的计数：读不到返回 -1（用来区分「真的是 0」和「没联网」）
  function readProvCount(code) {
    const url = ABACUS_BASE + 'get/nailong-xiaoxiaole-2026-v3/prov_' + code;
    return fetchWithTimeout(url, 7000).then((j) => {
      if (j && typeof j.value === 'number') return j.value;
      return fetchWithTimeout(url, 7000).then((j2) => (j2 && typeof j2.value === 'number' ? j2.value : -1));
    });
  }

  // 每个省上次读到的值（这次读失败的省沿用上次的数，显示才不会来回跳）
  function provValsCache() {
    try { return JSON.parse(localStorage.getItem('nl2:provVals3') || '{}') || {}; } catch (e) { return {}; }
  }

  // 读全部地区（34 省 + 港澳台 + 海外）；全部失败返回 null
  // 计数器只增不减：读回来的数比上次缓存小，一定是请求被限流/截断了，取大者。
  // 读失败的中转重试 2 次，还失败才用本机上次的数，并标记 stale（页面上会提示）。
  let provStale = 0;    // 这一轮有多少个地区没读到（显示的是本机旧数）
  function readAllProv() {
    const cached = provValsCache();
    const list = PROVINCES.concat([PROV_OVERSEAS]);
    const fresh = Object.create(null);
    const readOne = (p, left) => readProvCount(p[1]).then((n) => {
      if (n >= 0) { fresh[p[1]] = n; return; }
      if (left <= 0) return;
      return new Promise((r) => setTimeout(r, 500)).then(() => readOne(p, left - 1));
    });
    return Promise.all(list.map((p) => readOne(p, 2))).then(() => {
      let got = 0;
      const rows = list.map((p) => {
        const prev = typeof cached[p[1]] === 'number' ? cached[p[1]] : 0;
        const has = typeof fresh[p[1]] === 'number';
        let n = has ? fresh[p[1]] : prev;      // 没读到 → 先拿上次的数顶着
        if (n < prev) n = prev;                // 只增不减
        if (n > 0) cached[p[1]] = n;
        if (has) got++;
        return { name: p[0], code: p[1], n: n, stale: !has };
      });
      if (!got) return null;                   // 一个都没读到 → 当断网处理
      provStale = rows.filter((r) => r.stale && r.n > 0).length;
      try { localStorage.setItem('nl2:provVals3', JSON.stringify(cached)); } catch (e) {}
      return rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
    });
  }

  function cachedProvSum() {
    const n = Number(localStorage.getItem('nl2:provSum3') || 0);
    return Number.isFinite(n) ? n : 0;
  }

  // 全网点击 = 各省真实点击之和（两边同一份数据，统计页相加必然等于后台）
  function provTotalSum() { return provRows.reduce((s, r) => s + r.n, 0); }
  function statsTotal() { return provTotalSum(); }

  // 把一次读取结果落到缓存 + 后台「全网」（旧缓存里的「调用/其他地区」行直接丢掉，不计入）
  function applyProvData(rows) {
    const isUnk = (r) => r.code === 'unknown' || r.name === '调用' || r.name === '其他地区' || r.name === '其他';
    provRows = rows.filter((r) => !isUnk(r)).map((r) => ({
      name: r.name,
      code: r.code || (matchProvince(r.name) || {}).code || '',
      n: r.n,
      stale: !!r.stale
    })).filter((r) => r.code).sort((a, b) => b.n - a.n);
    try {
      localStorage.setItem('nl2:provCache3', JSON.stringify({ ts: Date.now(), data: provRows }));
      localStorage.setItem('nl2:provSum3', String(provTotalSum()));
    } catch (e) {}
    Store.patchNet({ globalHits: statsTotal() });
    return statsTotal();
  }

  // 后台 / 统计页共用这一份：读全省份 → 落缓存
  function refreshProvStats() {
    return readAllProv().then((rows) => {
      if (!rows) return null;
      return applyProvData(rows);
    });
  }

  // 后台每次打开都刷一次即可，60 秒内不重复请求（36 个计数器，别太频繁）
  let provRefreshAt = 0;
  function refreshProvStatsThrottled() {
    if (Date.now() - provRefreshAt < 60000) return Promise.resolve(statsTotal());
    provRefreshAt = Date.now();
    return refreshProvStats();
  }

  // ============ 省份统计页 ============
  // 先用上次的缓存立刻画出来（数字稳定），后台再刷新一次，刷新完才更新显示
  let provCityView = null;   // null = 省份列表；{name, code} = 某省的市级视图
  const cityCache = {};      // provCode -> [{name, n}]

  function openProvStats() {
    const page = $('prov-page');
    if (!page) return;
    page.style.display = 'flex';
    provCityView = null;

    // 1) 先画缓存（秒开 + 数字稳定，不会每进来一次就变一个样）
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('nl2:provCache3') || 'null'); } catch (e) {}
    if (cached && Array.isArray(cached.data) && cached.data.length) {
      applyProvData(cached.data);
      renderProvList('');
      renderAdmin();
    } else {
      renderProvList('');
    }

    // 2) 后台刷新，完成后只把「有变化的部分」更新上去
    refreshProvStats().then((total) => {
      if (total == null) return;   // 全部请求失败：继续显示缓存
      if (provCityView) return;    // 用户已经点进某个省了，别打断
      renderProvList($('prov-search') ? $('prov-search').value : '');
      renderAdmin();
    });
  }

  // 点某个省份 → 市级统计（标题 = 省名，数字从高到低）
  function openProvCities(row) {
    provCityView = row;
    const title = $('prov-title'), sub = $('prov-sub'), search = $('prov-search'), list = $('prov-list');
    if (title) title.textContent = '📍 ' + row.name;
    if (search) search.style.display = 'none';
    if (sub) sub.textContent = '正在统计…';
    if (list) list.innerHTML = '<li class="prov-empty">正在统计…</li>';

    const render = (rows, loading) => {
      if (!provCityView || provCityView.code !== row.code) return;
      cityCache[row.code] = rows;
      const citySum = rows.reduce((s, r) => s + r.n, 0);
      // 移动网络下 IP 库经常只到省、给不出市 → 差额单列一行，保证「各市相加 = 该省总数」
      const rest = Math.max(0, (row.n || 0) - citySum);
      if (sub) {
        sub.textContent = loading
          ? '正在统计…'
          : row.n ? ('共 ' + rows.length + ' 个市 · ' + row.n + ' 次点击') : '暂无市级点击记录';
      }
      if (list) {
        let html = rows.map((r) => '<li><span>' + escHtml(r.name) + '</span><b>' + r.n + '</b></li>').join('');
        if (rest > 0) {
          // 市级数据还没回来时先说「加载中…」，别一上来就显示「未定位到市」
          html += '<li class="prov-unknown"><span>' + (loading ? '加载中…' : '未定位到市') + '</span><b>' + rest + '</b></li>';
        }
        list.innerHTML = html || (loading ? '<li class="prov-empty">加载中…</li>' : '<li class="prov-empty">暂无市级点击记录</li>');
      }
    };

    if (cityCache[row.code]) render(cityCache[row.code], false);   // 先画缓存
    else render([], true);                                          // 没缓存就先显示加载中
    const cities = CITY_TABLE[row.code] || [];
    const cacheKey = 'nl2:cityVals:' + row.code;
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(cacheKey) || '{}') || {}; } catch (e) {}
    Promise.all(cities.map((c) =>
      fetchWithTimeout(ABACUS_BASE + 'get/nailong-xiaoxiaole-2026-v3/city_' + row.code + '_' + c[1], 7000)
        .then((j) => {
          const v = (j && typeof j.value === 'number') ? j.value : -1;
          const prev = typeof saved[c[1]] === 'number' ? saved[c[1]] : 0;
          // 只增不减：读失败或读回变小都沿用上次（同省级统计）
          const n = v >= 0 ? Math.max(v, prev) : prev;
          if (n > 0) saved[c[1]] = n;
          return { name: c[0], n: n };
        })))
      .then((rows) => {
        try { localStorage.setItem(cacheKey, JSON.stringify(saved)); } catch (e) {}
        // 读失败（0 不可信的判断做不了，简单起见 0 直接不显示）
        render(rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n), false);
      });
  }

  // 返回：市级视图 → 省份列表；省份列表 → 关闭统计页
  function provBack() {
    const page = $('prov-page');
    if (!page) return;
    if (provCityView) {
      provCityView = null;
      const title = $('prov-title'), search = $('prov-search');
      if (title) title.textContent = '🗺️ 省份统计';
      if (search) { search.style.display = ''; search.value = ''; }
      renderProvList('');
    } else {
      page.style.display = 'none';
    }
  }

  function normProv(s) {
    return String(s || '').replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔|自治州/g, '');
  }

  function renderProvList(kw) {
    const list = $('prov-list'), sub = $('prov-sub');
    if (!list) return;
    const k = normProv(kw);
    const oversea = provRows.filter((r) => r.code === PROV_OVERSEAS[1])[0] || null;
    const provs = provRows.filter((r) => r.code !== PROV_OVERSEAS[1]);
    const rows = provs.filter((r) => !k || normProv(r.name).indexOf(k) >= 0);
    const total = statsTotal();
    if (sub) {
      sub.textContent = provRows.length
        ? ('共 ' + provs.length + ' 个省份' + (oversea ? ' + 海外' : '') + ' · 合计 ' + total + ' 次点击')
        : '暂无点击记录';
      // 有地区没读到：说明数字里混了本机上次的旧值，直接标出来（别的设备可能不一样）
      if (provStale > 0 && provRows.length) sub.textContent += ' · ' + provStale + ' 个地区没读到';
    }
    if (!rows.length && !(oversea && !k)) {
      list.innerHTML = '<li class="prov-empty">没有找到相关省份</li>';
      return;
    }
    let html = rows.map((r) =>
      '<li class="clickable" data-code="' + r.code + '"><span>' + escHtml(r.name) +
      '<i class="prov-arrow">›</i></span><b>' + r.n + '</b></li>').join('');
    // 海外固定排最后（不管次数多少），不参与搜索；点开看具体国家/地区
    if (oversea && !k) {
      html += '<li class="clickable" data-code="overseas"><span>' + escHtml(PROV_OVERSEAS[0]) +
        '<i class="prov-arrow">›</i></span><b>' + oversea.n + '</b></li>';
    }
    list.innerHTML = html;
    Array.prototype.forEach.call(list.querySelectorAll('li.clickable'), (li) => {
      li.addEventListener('click', () => {
        const row = provRows.find((r) => r.code === li.getAttribute('data-code'));
        if (!row) return;
        if (row.code === PROV_OVERSEAS[1]) openOverseasList(row);
        else openProvCities(row);
      });
    });
  }

  // 点「🌍 海外」→ 国家/地区统计（读 ovr_<国家码> 计数，分批读避免触发限流）
  function openOverseasList(row) {
    provCityView = { code: '__overseas__', name: PROV_OVERSEAS[0] };
    const title = $('prov-title'), sub = $('prov-sub'), search = $('prov-search'), list = $('prov-list');
    if (title) title.textContent = '🌍 海外 · 国家/地区';
    if (search) search.style.display = 'none';
    if (sub) sub.textContent = '正在统计…';
    if (list) list.innerHTML = '<li class="prov-empty">正在统计…</li>';

    const acc = {};   // cc -> n（分批读到哪儿画到哪儿）
    const render = () => {
      if (!provCityView || provCityView.code !== '__overseas__') return;
      const rows = OVERSEAS_COUNTRIES
        .filter((c) => acc[c[0]] > 0)
        .map((c) => ({ name: (ccFlag(c[0]) ? ccFlag(c[0]) + ' ' : '') + c[1], n: acc[c[0]] }))
        .sort((a, b) => b.n - a.n);
      const sum = rows.reduce((s, r) => s + r.n, 0);
      const rest = Math.max(0, (row.n || 0) - sum);
      let html = rows.map((r) => '<li><span>' + escHtml(r.name) + '</span><b>' + r.n + '</b></li>').join('');
      if (rest > 0) {
        html += '<li class="prov-unknown"><span>未识别出国家</span><b>' + rest + '</b></li>';
      }
      if (sub) sub.textContent = row.n ? ('共 ' + rows.length + ' 个国家/地区 · ' + row.n + ' 次点击') : '暂无海外点击记录';
      if (list) list.innerHTML = html || '<li class="prov-empty">暂无海外点击记录</li>';
    };

    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('nl2:ovrVals') || '{}') || {}; } catch (e) {}
    Object.keys(saved).forEach((cc) => { if (saved[cc] > 0) acc[cc] = saved[cc]; });
    render();   // 先画缓存

    const CHUNK = 20, PAUSE = 1100;   // Abacus 限流 30 次/10 秒，分批读
    const readChunk = (i) => {
      if (!provCityView || provCityView.code !== '__overseas__') return;   // 用户已返回
      if (i >= OVERSEAS_COUNTRIES.length) {
        try { localStorage.setItem('nl2:ovrVals', JSON.stringify(saved)); } catch (e) {}
        render();
        return;
      }
      Promise.all(OVERSEAS_COUNTRIES.slice(i, i + CHUNK).map((c) =>
        fetchWithTimeout(ABACUS_BASE + 'get/nailong-xiaoxiaole-2026-v3/ovr_' + c[0], 7000)
          .then((j) => {
            const v = (j && typeof j.value === 'number') ? j.value : -1;
            const prev = typeof saved[c[0]] === 'number' ? saved[c[0]] : 0;
            const n = v >= 0 ? Math.max(v, prev) : prev;   // 只增不减（同省级口径）
            if (n > 0) { saved[c[0]] = n; acc[c[0]] = n; }
          })))
        .then(() => { render(); setTimeout(() => readChunk(i + CHUNK), PAUSE); });
    };
    readChunk(0);
  }

  // IP 定位：缓存 12 小时；有旧结果先用旧的，后台悄悄刷新（绝不让人干等定位）
  // 主源 ipinfo / ipapi.is 并发，1 秒没结果就用 ipwho 兜底；全失败就沿用上次的定位，
  // 绝不因为一次接口抖动把这次点击丢掉（之前用的 ipwho.is 经常超时 → 数字对不上）。
  let geoFetchAt = 0;
  function fetchGeo(force) {
    // 定位缓存版本：早期 ipwho 把移动 IPv6 误判成北京，旧缓存一律作废一次
    const GEO_VER = 2;
    try {
      if (Number(localStorage.getItem('nl2:geoV') || 0) !== GEO_VER) {
        localStorage.setItem('nl2:geoV', String(GEO_VER));
        Store.patchNet({ geo: null });
      }
    } catch (e) {}
    const old = Store.getNet().geo;
    if (!force && old && old.ts && Date.now() - old.ts < 12 * 3600e3) return Promise.resolve(old);
    if (typeof fetch !== 'function') return Promise.resolve(old || null);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (g) => {
        if (settled) return;
        settled = true;
        if (g) {
          g.ts = Date.now();
          Store.patchNet({ geo: g });
          window.__nl_geo = g;              // 控制台 __nl_geo 可自查定位结果
          resolve(g);
        } else {
          resolve(old || null);             // 全部失败：沿用上次定位
        }
      };

      const primary = GEO_SOURCES.filter((s) => s.name !== 'ipwho');
      const fb = GEO_SOURCES.filter((s) => s.name === 'ipwho')[0];
      let primaryLeft = primary.length;
      let fbAsked = false;
      const askFallback = () => {
        if (fbAsked || settled) return;
        fbAsked = true;
        fetchWithTimeout(fb.url, 3000).then((j) => {
          const g = j ? fb.pick(j) : null;
          if (g) { g.src = fb.name; finish(g); } else finish(null);
        });
      };

      primary.forEach((src) => {
        fetchWithTimeout(src.url, 2200).then((j) => {
          const g = j ? src.pick(j) : null;
          primaryLeft--;
          if (g) { g.src = src.name; finish(g); return; }
          if (!primaryLeft) askFallback();
        });
      });
      setTimeout(askFallback, 900);
    });
  }

  // 有缓存但过期：先拿旧的用，后台刷新（5 分钟内不重复请求）
  function fetchGeoFast() {
    const old = Store.getNet().geo;
    if (old && old.prov) {
      const now = Date.now();
      if (now - geoFetchAt > 5 * 60e3) {
        geoFetchAt = now;
        fetchGeo(true).catch(() => {});
      }
      return Promise.resolve(old);
    }
    return fetchGeo();
  }

  let androidVer = '';
  function describeDevice() {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
    const ios = /OS (\d+)[._](\d+)/.exec(ua);
    if (/iPhone/.test(ua)) return 'iPhone' + (ios ? '(iOS ' + ios[1] + '.' + ios[2] + ')' : '');
    if (/iPad/.test(ua)) return 'iPad' + (ios ? '(iOS ' + ios[1] + '.' + ios[2] + ')' : '');
    const and = /Android\s([\d.]+)[^;]*;\s*([^;)]+?)(?:\s+Build|\))/.exec(ua);
    if (and) {
      androidVer = and[1] || '';
      let model = (and[2] || '').replace(/\s+/g, ' ').trim();
      if (!model || model.length < 2 || /^(K|wv)$/i.test(model)) model = '安卓手机';
      return model + (androidVer ? '(Android ' + androidVer + ')' : '');
    }
    if (/Windows NT 10/.test(ua)) return 'Windows 10/11 电脑';
    if (/Macintosh/.test(ua)) return 'Mac 电脑';
    if (/Linux/.test(ua)) return 'Linux 电脑';
    return '未知设备';
  }

  // 安卓 Chrome 能拿到更精确的机型号（UA-CH）
  function upgradeDeviceModel() {
    const d = (typeof navigator !== 'undefined') && navigator.userAgentData;
    if (!d || !d.getHighEntropyValues) return;
    d.getHighEntropyValues(['model']).then((h) => {
      if (!h || !h.model) return;
      const el = $('admin-device');
      const suffix = androidVer ? '(Android ' + androidVer + ')' : '(Android)';
      if (el) el.textContent = h.model + suffix;
    }).catch(() => {});
  }

  function totalBestScore() {
    const prog = Store.getProgress() || {};
    let sum = 0;
    Object.keys(prog).forEach((k) => {
      const rec = prog[k];
      // 和排行榜同一口径：没过关的关卡分数不计入总分
      if (rec && typeof rec.score === 'number' && rec.stars > 0) sum += rec.score;
    });
    return sum;
  }

  // 地址统一成「中国-四川省-成都市」：全中文，城市没「市」尾巴的自动补上
  function formatRegion(geo) {
    if (!geo) return '';
    const country = countryLabel(geo);
    const p = matchProvince(geo.region);
    const city = p ? matchCity(p.code, geo.city) : null;
    const parts = [];
    if (country) parts.push(country);
    if (p) {
      parts.push(p.name);
    } else {
      const reg = String(geo.region || '').trim();
      if (/[\u4e00-\u9fa5]/.test(reg)) parts.push(reg);   // 中文省名原样用，英文不显示
    }
    if (city) {
      parts.push(city.name);
    } else {
      const raw = String(geo.city || '').trim();
      // 只显示中文城市名（Chengdu 这种英文名宁可不显示，等市级统计补上）
      if (/[\u4e00-\u9fa5]/.test(raw)) {
        parts.push(/[市地区盟县州区]$/.test(raw) ? raw : raw + '市');
      }
    }
    return parts.join('-');
  }

  function renderAdmin() {
    if (!$('admin-menu')) return;
    const net = Store.getNet();
    const localCount = Store.getVisits().count;
    // 「全网」= 各省 + 海外（同一份数据，所以统计页里数字加起来一定等于这里）
    // 本机是全网的一部分：万一某次定位接口全挂、这次点击没能归省，至少不会出现「本机 > 全网」
    const globalShown = Math.max(statsTotal(), cachedProvSum(), localCount);
    $('admin-global').textContent = globalShown > 0 ? String(globalShown) : '—';
    // 本机
    $('admin-visits').textContent = localCount;
    $('admin-device').textContent = describeDevice();
    const geo = net.geo;
    // 地址：中国-四川省-成都市
    $('admin-loc').textContent = formatRegion(geo) || '—';
    $('admin-stars').textContent = Store.totalStars();
    $('admin-score').textContent = totalBestScore();
  }

  // ==================== 后台分层 ====================
  // 一级：点击数量 / 全服用户；二级页各自返回一级
  function showAdminPage(which) {
    const nav = $('admin-nav');
    const hits = $('admin-page-hits');
    const users = $('admin-page-users');
    if (nav) nav.style.display = which ? 'none' : 'flex';
    if (hits) hits.style.display = which === 'hits' ? 'flex' : 'none';
    if (users) users.style.display = which === 'users' ? 'flex' : 'none';
  }

  // 全服用户口径：
  //   · 用户 = 有名字 + 有密码的账号（名字按小写去重；没上榜的也算）
  //   · 省份 = 这些账号所在的省（本机账号取本机定位的省；榜上玩家取发成绩时带上去的省）
  function collectServerUsers() {
    const names = Object.create(null);
    const provs = Object.create(null);
    let localProv = '';
    try { localProv = myProvCode(); } catch (e) { localProv = ''; }
    // 本机账号表：名字和密码都有才算一个用户
    try {
      if (typeof Account !== 'undefined' && Account.list) {
        Account.list().forEach((a) => {
          if (!a || !a.name || !a.pass) return;
          const k = String(a.name).trim().toLowerCase();
          if (!k) return;
          names[k] = true;
          if (localProv) provs[localProv] = true;
        });
      }
    } catch (e) {}
    // 共享榜：榜上的玩家也是账号（没在本机的那些）
    try {
      if (typeof Board !== 'undefined' && Board.list) {
        Board.list().forEach((e) => {
          const n = String((e && e.name) || '').trim();
          if (!n) return;
          names[n.toLowerCase()] = true;
          const pv = String((e && e.pv) || '').toLowerCase();
          if (pv) provs[pv] = true;
        });
      }
    } catch (e) {}
    return { users: Object.keys(names).length, provs: Object.keys(provs).length };
  }

  function renderAdminUsers() {
    const u = $('admin-users');
    const p = $('admin-provs');
    const r = collectServerUsers();
    if (u) u.textContent = r.users > 0 ? String(r.users) : '—';
    if (p) p.textContent = r.provs > 0 ? String(r.provs) : '—';
  }

  // ---------- 全服用户名单（后台隐藏页：名字 + 所在省，可按省筛） ----------
  // 口径和上面的「用户数量」一致：本机有名字有密码的账号 + 榜上有名字的玩家
  function collectUserList() {
    const map = Object.create(null);
    let localProv = '';
    try { localProv = myProvCode(); } catch (e) { localProv = ''; }
    const add = (name, pv, entry) => {
      const n = String(name || '').trim();
      if (!n) return;
      const k = n.toLowerCase();
      const p = String(pv || '').toLowerCase();
      const st = entry ? totalStarsOf(entry) : 0;
      const cur = map[k];
      if (!cur) { map[k] = { name: n, prov: p, score: 0, stars: st }; return; }
      if (p) cur.prov = p;   // 名字相同（大小写不同）只留一条，省份以有值的为准
      if (st > (cur.stars || 0)) cur.stars = st;   // 星星只取最大值
    };
    try {
      if (typeof Account !== 'undefined' && Account.list) {
        Account.list().forEach((a) => { if (a && a.name && a.pass) add(a.name, localProv); });
      }
    } catch (e) {}
    try {
      if (typeof Board !== 'undefined' && Board.list) {
        Board.list().forEach((e) => { if (e) add(e && e.name, e && e.pv, e); });
      }
    } catch (e) {}
    // 总分：取共享榜里同名（不分大小写）的最高分，没上榜的就是 0 分
    try {
      if (typeof Board !== 'undefined' && Board.list) {
        Board.list().forEach((e) => {
          if (!e || !e.name) return;
          const cur = map[String(e.name).trim().toLowerCase()];
          if (!cur) return;
          const s = Math.max(0, Math.round(Number(e.score) || 0));
          if (s > cur.score) cur.score = s;
        });
      }
    } catch (e) {}
    return Object.keys(map).map((k) => map[k]);
  }

  let adminUlProv = '';   // '' = 全服；否则是省份代码
  let adminUlQuery = '';  // 搜索关键字（只在本页当前范围内搜）

  function adminUlProvName() {
    if (!adminUlProv) return '全服';
    const p = provByCode(adminUlProv);
    return p ? p.name : '未定位';
  }

  function adminUlRows() {
    const list = collectUserList();
    let rows = adminUlProv
      ? list.filter((u) => u.prov === adminUlProv)
      : list.slice();
    // 搜索区分大小写：输 yone 不再匹配 YONE / yOne（名字里的大小写是有意义的）
    const q = String(adminUlQuery || '').trim();
    if (q) rows = rows.filter((u) => String(u.name).indexOf(q) >= 0);
    // 按总分从高到低排（同分按名字）
    return rows.sort((a, b) => (b.score - a.score) ||
      String(a.name).localeCompare(String(b.name), 'zh'));
  }

  function hideAdminUlPicker() {
    const pk = $('admin-ul-picker');
    if (pk) pk.style.display = 'none';
  }

  function toggleAdminUlPicker() {
    const pk = $('admin-ul-picker');
    if (!pk) return;
    if (pk.style.display === 'grid') { pk.style.display = 'none'; return; }
    pk.innerHTML = '';
    const mk = (label, val, cur) => {
      const b = document.createElement('button');
      b.className = 'pk-item' + (cur ? ' cur' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        adminUlProv = val;
        hideAdminUlPicker();
        renderAdminUserList();
      });
      pk.appendChild(b);
    };
    mk('全服', '', adminUlProv === '');
    PROVINCES.forEach((p) => mk(p[0], p[1], p[1] === adminUlProv));
    pk.style.display = 'grid';
  }

  function renderAdminUserList() {
    const box = $('admin-ul-list');
    if (!box) return;
    const rows = adminUlRows();
    const title = $('admin-ul-title');
    if (title) {
      title.textContent = '玩家 · ' + adminUlProvName() + '（' + rows.length + '）';
    }
    box.innerHTML = '';
    rows.forEach((u, i) => {
      // 选了具体省份就不显示省份列，行改成和排行榜一样的 col4 排列
      // （星星 40px / 分数 6ch / 中间 42px 空档，和总榜、省榜每列起点完全同一条线）
      const byProv = !!adminUlProv;
      const p = byProv ? '' : (u.prov ? (provByCode(u.prov) || {}).name || u.prov : '未定位');
      const row = document.createElement('div');
      row.className = 'lb-row' + (u.score > 0 ? '' : ' none');
      const inner = document.createElement('div');
      inner.className = byProv ? 'lb-swipe col4' : 'lb-swipe col5';
      // 分数左边也带总星数（和排行榜同一个写法），0 星留空位，分数不挪窝
      const st = Math.max(0, u.stars || 0);
      const starHtml = st > 0
        ? '<span class="lb-stars ul-stars"><i class="lb-star-ico">★</i><b>' + st + '</b></span>'
        : '<span class="lb-stars ul-stars"></span>';
      inner.innerHTML = '<span class="lb-rank">' + (i + 1) + '</span>' +
        '<span class="lb-name">' + escHtml(String(u.name).slice(0, 8)) + '</span>' +
        starHtml +
        '<span class="lb-score ul-score">' + (u.score > 0 ? String(u.score) : '—') + '</span>' +
        (byProv ? '' : '<span class="lb-score ul-prov">' + escHtml(p) + '</span>');
      row.appendChild(inner);
      box.appendChild(row);
    });
    if (!rows.length) {
      const d = document.createElement('div');
      d.className = 'lb-empty';
      d.textContent = String(adminUlQuery || '').trim()
        ? '没有找到这个玩家'
        : (adminUlProv ? '这个省还没有用户' : '还没有用户');
      box.appendChild(d);
    }
  }

  // ---------- 省份详情：把名单按省份聚合 ----------
  let provUlQuery = '';

  function provUlRows() {
    const cnt = {};
    collectUserList().forEach((u) => {
      const k = u.prov || '__none__';
      cnt[k] = (cnt[k] || 0) + 1;
    });
    let rows = Object.keys(cnt).map((k) => ({
      code: k === '__none__' ? '' : k,
      name: k === '__none__' ? '未定位' : ((provByCode(k) || {}).name || k),
      count: cnt[k]
    }));
    // 搜索区分大小写（省份多为中文，海外国家名大小写按输入原样匹配）
    const q = String(provUlQuery || '').trim();
    if (q) rows = rows.filter((r) => r.name.indexOf(q) >= 0);
    return rows.sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name, 'zh'));
  }

  function renderProvUserList() {
    const box = $('prov-ul-list');
    if (!box) return;
    box.innerHTML = '';
    const rows = provUlRows();
    rows.forEach((r) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      row.innerHTML = '<span class="lb-swipe"><span class="lb-name">' + escHtml(r.name) + '</span>' +
        '<span class="lb-score ul-prov">' + r.count + ' 人</span></span>';
      row.addEventListener('click', () => {
        openAdminUserList(r.code, true);   // 从省份详情进来的，点背景要回省份详情
      });
      box.appendChild(row);
    });
    if (!rows.length) {
      const d = document.createElement('div');
      d.className = 'lb-empty';
      d.textContent = '没有找到这个省份';
      box.appendChild(d);
    }
  }

  function openProvUserList() {
    provUlQuery = '';
    const se = $('prov-ul-search');
    if (se) se.value = '';
    renderProvUserList();
    showOverlay('prov-user-list');
    try { AudioManager.playSFX('select'); } catch (e) {}
  }

  // 名单页是从哪进来的：后台「用户数量」直接进 = false；「省份详情」点省份进 = true
  // （决定点背景返回时回哪一层）
  let adminUlFromProv = false;

  function openAdminUserList(code, fromProv) {
    adminUlProv = String(code == null ? '' : code);
    adminUlFromProv = !!fromProv;
    adminUlQuery = '';
    const se = $('admin-ul-search');
    if (se) se.value = '';
    hideAdminUlPicker();
    // 从「省份详情」点省份进来时，把省份详情页收掉（DOM 里它排在名单页后面，不收会盖在上面）
    const pvUl = $('prov-user-list');
    if (pvUl) pvUl.style.display = 'none';
    renderAdminUserList();
    showOverlay('admin-user-list');
    try { AudioManager.playSFX('select'); } catch (e) {}
  }

  // ==================== 绑定 ====================
  function attachUI() {    // 画布输入
    Input.attach(canvas, {
      getCellSize: () => CELL,
      getCell: (cx, cy) => {
        const rect = canvas.getBoundingClientRect();
        const sx = VIEW_W / rect.width, sy = VIEW_H / rect.height;
        const c = Math.floor(((cx - rect.left) * sx) / CELL);
        const r = Math.floor(((cy - rect.top) * sy) / CELL);
        return inB(r, c) ? { r: r, c: c } : null;
      },
      onPress: () => {
        // 按下只做反馈，选中/交换统一在 onTap 处理，避免"按下选中、抬起又取消"
        if (!S.playing || S.busy) return;
        AudioManager.playSFX('select');
      },
      onDragStart: (cell) => {
        if (!S.playing || S.busy) return;
        S.selected = cell;
        drawStatic();
      },
      onDragMove: (from, to) => {
        if (!S.playing || S.busy) return;
        if (!inB(to.r, to.c)) return;
        S.selected = from;
        S.dragTo = to;
        drawStatic();
      },
      onDrop: (from, to) => {
        if (!S.playing || S.busy) return;
        S.dragTo = null;
        S.selected = null;
        trySwap(from, to);
      },
      onCancelDrag: () => {
        S.dragTo = null;
        S.selected = null;
        drawStatic();
      },
      onTap: (cell) => {
        if (!S.playing || S.busy) return;
        if (!S.selected) {
          S.selected = cell;
          AudioManager.playSFX('select');
          drawStatic();
          return;
        }
        if (S.selected.r === cell.r && S.selected.c === cell.c) {
          S.selected = null;
          drawStatic();
          return;
        }
        const a = S.selected;
        S.selected = null;
        trySwap(a, cell);
      }
    });

    // 工具按钮
    const sh = $('btn-shuffle');
    if (sh) sh.addEventListener('click', shuffleBoard);
    const un = $('btn-undo');
    if (un) un.addEventListener('click', undo);
    // 暂停
    const pauseBtn = $('btn-pause');
    if (pauseBtn) pauseBtn.addEventListener('click', pauseGame);
    const resumeBtn = $('btn-resume');
    if (resumeBtn) resumeBtn.addEventListener('click', resumeGame);
    const pauseRestart = $('btn-pause-restart');
    if (pauseRestart) pauseRestart.addEventListener('click', restartCurrentLevel);
    const pauseHome = $('btn-pause-home');
    if (pauseHome) pauseHome.addEventListener('click', () => {
      const box = $('pause-menu');
      if (box) box.style.display = 'none';
      S.paused = false;
      // 先把这一局存下来，回主页后按钮才会显示「继续游戏」
      saveRun();
      if (!S.daily) S.menuLevel = S.level;
      S.playing = false;
      showOverlay('main-menu');
      refreshMenu();
    });

    // 主页上一关 / 下一关
    const prevLv = $('btn-prev-level');
    if (prevLv) prevLv.addEventListener('click', () => {
      if (S.menuLevel <= 1) return;
      S.menuLevel--;
      Store.setSettings({ menuLevel: S.menuLevel });
      AudioManager.playSFX('select');
      refreshMenu();
    });
    const nextLv = $('btn-next-level-menu');
    if (nextLv) nextLv.addEventListener('click', () => {
      const maxU = Store.maxUnlockedLevel(maxMainLevel());
      if (S.menuLevel >= maxU) {
        toast('先通过本关才能解锁下一关');
        AudioManager.playSFX('invalid');
        return;
      }
      S.menuLevel++;
      Store.setSettings({ menuLevel: S.menuLevel });
      AudioManager.playSFX('select');
      refreshMenu();
    });

    // 主页
    const play = $('btn-play');
    if (play) play.addEventListener('click', () => {
      // 没有账号 / 资料不全：先把账号补好再玩
      if (!ensureAccount(() => {})) return;
      AudioManager.init(Store.getSettings());
      AudioManager.unlock();
      const lv = S.menuLevel || 1;
      const run = Store.loadRun();
      // 有本关未完成的存档 → 继续；否则重开（步数/洗牌/撤销全部重置）
      if (run && !run.daily && run.level === lv && loadRun()) return;
      Store.clearRun();
      playLevel(lv);
    });
    const rulesBtn = $('btn-rules');
    if (rulesBtn) rulesBtn.addEventListener('click', () => {
      applyRuleFont(ruleFontLevel());
      showOverlay('rules-menu');
    });
    // 右下角「规则字号」：左边 A− 缩小、右边 A+ 放大，各可调 3 次（中间档为默认）
    // 调节过程中不弹提示，只在调到底时提示
    const stepRuleFont = (delta) => {
      const cur = ruleFontLevel();
      const next = Math.max(0, Math.min(RULE_FONTS.length - 1, cur + delta));
      if (next === cur) {
        toast(delta > 0 ? '已经是最大字号' : '已经是最小字号');
        return;
      }
      applyRuleFont(next);
      Store.setSettings({ ruleFontLv: next });
      AudioManager.playSFX('select');
    };
    document.querySelectorAll('.js-rule-minus').forEach((el) => el.addEventListener('click', () => stepRuleFont(-1)));
    document.querySelectorAll('.js-rule-plus').forEach((el) => el.addEventListener('click', () => stepRuleFont(1)));
    const rulesClose = $('btn-close-rules');
    if (rulesClose) rulesClose.addEventListener('click', () => {
      $('rules-menu').style.display = 'none';
      if (quietPaused) quietResumeGame();
      else showOverlay('main-menu');
    });
    // 📖 规则首页：功能介绍 / 玩法规则分开看
    const gotoRulesSub = (id) => {
      applyRuleFont(ruleFontLevel());
      $('rules-menu').style.display = 'none';
      showOverlay(id);
    };
    const featBtn = $('btn-goto-features');
    if (featBtn) featBtn.addEventListener('click', () => gotoRulesSub('features-menu'));
    const playRuleBtn = $('btn-goto-play-rules');
    if (playRuleBtn) playRuleBtn.addEventListener('click', () => gotoRulesSub('play-rules-menu'));
    ['btn-features-back', 'btn-play-rules-back'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('click', () => {
        $('features-menu').style.display = 'none';
        $('play-rules-menu').style.display = 'none';
        showOverlay('rules-menu');
      });
    });
    const hist = $('btn-history');
    if (hist) hist.addEventListener('click', () => {
      renderHistory();
      showOverlay('history-menu');
      scrollHistoryToCurrent();
    });
    const histBack = $('btn-history-back');
    if (histBack) histBack.addEventListener('click', () => {
      $('history-menu').style.display = 'none';
      showOverlay('main-menu');
      refreshMenu();
    });
    // 「结算」键（关卡记录左下角，黄色）：打开结算画面，数据实时取最新存档
    const replayEnding = $('btn-replay-ending');
    if (replayEnding) replayEnding.addEventListener('click', () => {
      $('history-menu').style.display = 'none';
      showCompletePanel();
    });
    const dailyBtn = $('btn-daily');
    if (dailyBtn) dailyBtn.addEventListener('click', () => {
      // 今天已经拿到 3 星：不能再打，直接看今天战绩
      if (dailyCompleted()) {
        showDailyDone();
        return;
      }
      ensureAccount(() => {
        const d = Tasks.getDailyChallenge();
        startLevel(9999, { def: d, seed: d.seed, daily: true });
      });
    });
    // 「返回主页」键已删：点面板外空白回主页（panelBack）

    // 注销：两步确认弹窗（是/确认 = 红色，否/取消 = 绿色）
    const logout = $('btn-logout');
    if (logout) logout.addEventListener('click', () => {
      $('logout-confirm').style.display = 'flex';
    });
    const logoutYes = $('btn-logout-yes');
    if (logoutYes) logoutYes.addEventListener('click', () => {
      $('logout-confirm').style.display = 'none';
      $('logout-confirm2').style.display = 'flex';
    });
    const logoutNo = $('btn-logout-no');
    if (logoutNo) logoutNo.addEventListener('click', () => {
      $('logout-confirm').style.display = 'none';
    });
    const logoutConfirm = $('btn-logout-confirm');
    if (logoutConfirm) logoutConfirm.addEventListener('click', () => {
      // 注销账号 = 彻底删除：先向共享榜广播「删除我」，再把服务器上的号、
      // 本机这个号的存档、账号记录、邮箱、成就、进度全部清掉
      // （`nl2:lb-del` 墓碑与访问统计是设备级的，保留）
      try { if (typeof Board !== 'undefined' && Board.remove) Board.remove(Meta.myUid()); } catch (e) {}
      const done = () => {
        $('logout-confirm2').style.display = 'none';
        $('account-menu').style.display = 'none';
        S.playing = false;
        setTimeout(() => { try { location.reload(); } catch (e) {} }, 160);
      };
      let job = null;
      try { if (typeof Account !== 'undefined' && Account.purge) job = Account.purge(); } catch (e) {}
      // 等服务器那边删完再走，最多等 2.5 秒，网络卡住也不让玩家干等
      Promise.race([
        Promise.resolve(job).catch(() => null),
        new Promise((r) => setTimeout(r, 2500))
      ]).then(done).catch(done);
    });
    const logoutCancel = $('btn-logout-cancel');
    if (logoutCancel) logoutCancel.addEventListener('click', () => {
      $('logout-confirm2').style.display = 'none';
    });

    // 购买道具：确认 / 取消
    const buyYes = $('btn-buy-yes');
    if (buyYes) buyYes.addEventListener('click', () => {
      const item = pendingBuy;
      closeBuyConfirm();
      if (item) doBuy(item);
    });
    const buyNo = $('btn-buy-no');
    if (buyNo) buyNo.addEventListener('click', closeBuyConfirm);

    // 使用道具：确认 / 取消
    const useYes = $('btn-use-yes');
    if (useYes) useYes.addEventListener('click', () => {
      const item = pendingUse;
      closeUseConfirm();
      if (item) useBackpackItem(item.key);
    });
    const useNo = $('btn-use-no');
    if (useNo) useNo.addEventListener('click', closeUseConfirm);

    // ==================== 隐藏后台：同时按住奶龙图案 + 注销键 3 秒 ====================
    const adminMascot = (typeof document.querySelector === 'function')
      ? document.querySelector('#main-menu .mascot') : null;
    const adminLogout = $('btn-home-menu');   // 隐藏手势：奶龙图案 + 左上角 🏠 主页键，同时按住 3 秒
    if (adminMascot && adminLogout) {
      let holds = 0;
      let holdTimer = null;
      let suppressLogout = false;
      const openAdmin = () => {
        holdTimer = null;
        holds = 0;
        suppressLogout = true; // 松手时不要误触「打开主页面板」
        renderAdmin();
        fetchGeoFast().then(renderAdmin);
        // 省份合计刷新后，后台「全网」跟着更新（两边数字始终一致）
        refreshProvStatsThrottled().then(renderAdmin);
        AudioManager.playSFX('select');
        showAdminPage(null);
        showOverlay('admin-menu');
        upgradeDeviceModel();
      };
      const press = () => {
        holds++;
        if (holds >= 2 && !holdTimer) holdTimer = setTimeout(openAdmin, 3000);
      };
      const release = () => {
        holds = Math.max(0, holds - 1);
        if (holds < 2 && holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      };
      [adminMascot, adminLogout].forEach((el) => {
        el.addEventListener('pointerdown', press);
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
        el.addEventListener('pointerleave', release);
      });
      adminLogout.addEventListener('click', (e) => {
        if (suppressLogout) {
          e.stopImmediatePropagation();
          suppressLogout = false;
        }
      }, true);
    }
    const adminClose = $('btn-admin-close');
    if (adminClose) adminClose.addEventListener('click', () => {
      $('admin-menu').style.display = 'none';
    });
    // 一级 → 点击数量（原后台内容）
    const adminHits = $('btn-admin-hits');
    if (adminHits) adminHits.addEventListener('click', () => {
      showAdminPage('hits');
      renderAdmin();
      refreshProvStatsThrottled().then(renderAdmin);
    });
    // 一级 → 全服用户（用户数量 / 省份数量）
    const adminUsers = $('btn-admin-users');
    if (adminUsers) adminUsers.addEventListener('click', () => {
      showAdminPage('users');
      renderAdminUsers();
      refreshProvStatsThrottled().then(renderAdminUsers);
    });
    ['btn-admin-hits-back', 'btn-admin-users-back'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('click', () => showAdminPage(null));
    });

    // 全服用户名单：⇄ 换「全服 / 某个省」，换法和省榜一样
    const adminUlSwap = $('admin-ul-swap');
    if (adminUlSwap) adminUlSwap.addEventListener('click', toggleAdminUlPicker);
    const adminUlBack = $('btn-admin-ul-back');
    if (adminUlBack) adminUlBack.addEventListener('click', () => {
      $('admin-user-list').style.display = 'none';
      hideAdminUlPicker();
      showOverlay('admin-menu');
      showAdminPage('users');
      renderAdminUsers();
    });

    // 「用户详情」= 原来的玩家名单页；「省份详情」= 有用户的省份，点省份看该省玩家
    // 入口：点「用户数量」→ 用户详情，点「省份数量」→ 省份详情
    const uRow = $('admin-users-row');
    if (uRow) uRow.addEventListener('click', () => openAdminUserList(''));
    const pRow = $('admin-provs-row');
    if (pRow) pRow.addEventListener('click', openProvUserList);
    const pvUlBack = $('btn-prov-ul-back');
    if (pvUlBack) pvUlBack.addEventListener('click', () => {
      $('prov-user-list').style.display = 'none';
      showOverlay('admin-menu');
      showAdminPage('users');
      renderAdminUsers();
    });
    const pvUlSearch = $('prov-ul-search');
    if (pvUlSearch) pvUlSearch.addEventListener('input', () => {
      provUlQuery = pvUlSearch.value || '';
      renderProvUserList();
    });
    // 搜索：只在当前范围（全服 / 某个省）里按名字过滤
    const adminUlSearch = $('admin-ul-search');
    if (adminUlSearch) adminUlSearch.addEventListener('input', () => {
      adminUlQuery = adminUlSearch.value || '';
      renderAdminUserList();
    });

    // 省份统计入口：在「📊 点击数量」页里，点一下「🌐 全网」板块直接进入
    const globalSec = $('admin-global-sec') || $('admin-global-title');
    if (globalSec) globalSec.addEventListener('click', openProvStats);
    // 全服用户名单入口：改到「👥 全服」页的「用户详情」按键（原来是隐藏手势）

    // 省份统计页：搜索框 + 返回（市级视图先回省份列表，列表再关闭页面）
    const provSearch = $('prov-search');
    if (provSearch) provSearch.addEventListener('input', () => renderProvList(provSearch.value));
    const provBackBtn = $('btn-prov-back');
    if (provBackBtn) provBackBtn.addEventListener('click', provBack);

    // 主页提示条：点左侧 ✕ 只是本次隐藏，下次进主页会再出现
    const loadTip = $('load-tip');
    if (loadTip) {
      const tipX = $('btn-dismiss-tip');
      if (tipX) tipX.addEventListener('click', () => {
        // 只隐藏，不改变布局（保持占位，按钮不会位移）
        loadTip.style.visibility = 'hidden';
      });
    }
    // 「回到主页」统一判定：主页在前台且没有任何面板挡着 → 提示条重新出现
    (function watchBackToMenu() {
      const mm = $('main-menu');
      if (!loadTip || !mm || typeof MutationObserver !== 'function' || !document.querySelectorAll) return;
      const sync = () => {
        if (mm.style.display === 'none') return;      // 不在主页（在关卡里）
        const panels = document.querySelectorAll('.overlay');
        for (let i = 0; i < panels.length; i++) {
          const p = panels[i];
          if (p === mm) continue;
          const d = p.style.display;
          if (d && d !== 'none') return;              // 还有面板开着
        }
        loadTip.style.visibility = '';
      };
      const obs = new MutationObserver(sync);
      const targets = document.querySelectorAll('.overlay');
      for (let i = 0; i < targets.length; i++) {
        obs.observe(targets[i], { attributes: true, attributeFilter: ['style'] });
      }
    })();

    // 背包（主页 + 游戏界面）
    const packBtns = ['btn-backpack-home', 'btn-backpack-game'];
    packBtns.forEach((id) => {
      const b = $(id);
      if (!b) return;
      b.addEventListener('click', () => {
        renderBackpack();
        showOverlay('backpack-menu');
      });
    });
    const closePack = $('btn-close-backpack');
    if (closePack) closePack.addEventListener('click', () => $('backpack-menu').style.display = 'none');

    // 金币明细：点主页「🪙 金币」那一行进去；年 / 月 / 类型三个下拉筛选
    const coinsRow = $('menu-coins-row');
    if (coinsRow) {
      coinsRow.addEventListener('click', () => {
        // 上次看到哪年哪月、哪个类型，再进来还是那一页（第一次打开才默认落到最近一笔的月份）
        closeLedgerPop();
        renderLedger();
        showOverlay('coin-menu');
      });
    }
    // 三个按键：点哪个开哪个，再点一下收起；点面板别处也收起
    [['ledger-year', 'year'], ['ledger-month', 'month'], ['ledger-type', 'type']].forEach((p) => {
      const b = $(p[0]);
      if (b) b.addEventListener('click', () => openLedgerPop(p[1]));
    });
    document.addEventListener('click', (e) => {
      if (!ledgerPop) return;
      const t = e.target;
      if (t && t.closest && t.closest('#ledger-pop, .ledger-bar')) return;
      closeLedgerPop();
    });
    // 转屏 / 改窗口大小后按键位置会变，开着的列表跟着挪
    window.addEventListener('resize', () => { if (ledgerPop) placeLedgerPop(); });

    // ==================== 新玩法：章节 / 模式 / 成就 / 图鉴 / 福利 / 排行榜 ====================
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };

    on('btn-hint', useHint);

    // 游戏界面第一排：🎵 音乐开关 → 🎒 背包 → 📖 规则 → ⚙️ 设置
    on('btn-rules-game', () => {
      quietPauseGame();
      applyRuleFont(ruleFontLevel());
      showOverlay('rules-menu');
      AudioManager.playSFX('select');
    });
    on('btn-settings-game', () => {
      quietPauseGame();
      showOverlay('settings-menu');
      syncVolumeUI();
      AudioManager.playSFX('select');
    });

    // 📮 邮箱：主页右下角进来，看系统邮件 / 领奖励
    on('btn-mail', () => {
      renderMailList();
      showOverlay('mail-menu');
      AudioManager.playSFX('select');
    });
    // ✅ 一键已读：先把没领的奖励全部领掉，再把邮件标为已读
    on('btn-mail-read-all', () => {
      let gifts = 0, coins = 0;
      if (typeof Mail !== 'undefined') {
        (Mail.list() || []).forEach((m) => {
          if (!m.hasGift || m.claimed) return;
          const r = Mail.claim(m.id);
          if (r && r.ok) { gifts++; coins += r.coins || 0; }
        });
      }
      const n = (typeof Mail !== 'undefined') ? Mail.markAllRead() : 0;
      renderMailList();
      refreshMailBadge();
      let msg = n > 0 ? '已把 ' + n + ' 封邮件标为已读' : '没有未读邮件';
      if (gifts) msg = '已领取 ' + gifts + ' 份奖励（共 ' + coins + ' 金币）' +
        (n > 0 ? '，邮件全部已读' : '');
      toast(msg);
      AudioManager.playSFX('select');
    });
    // 🗑️ 一键删除：先弹确认窗口，确认后才真删
    on('btn-mail-del-all', () => {
      const c = $('mail-delall-confirm');
      if (c) c.style.display = 'flex';
    });
    on('btn-mail-delall-yes', () => {
      const c = $('mail-delall-confirm');
      if (c) c.style.display = 'none';
      const r = (typeof Mail !== 'undefined') ? Mail.removeAll() : { removed: 0, kept: 0 };
      renderMailList();
      refreshMailBadge();
      if (r.removed > 0) toast('已删除 ' + r.removed + ' 封邮件' + (r.kept ? '（有奖励的保留）' : ''));
      else if (r.kept > 0) toast('有奖励的邮件要先领取才能删除');
      else toast('没有可删除的邮件');
      AudioManager.playSFX('select');
    });
    on('btn-mail-delall-no', () => {
      const c = $('mail-delall-confirm');
      if (c) c.style.display = 'none';
    });
    on('btn-mail-close', () => {
      $('mail-menu').style.display = 'none';
      showOverlay('main-menu');
      refreshMenu();
    });
    on('btn-mail-back', () => {
      $('mail-view').style.display = 'none';
      renderMailList();
      showOverlay('mail-menu');
    });
    on('btn-mail-claim', claimMail);

    on('btn-chapters', () => { renderChapterMap(); showOverlay('chapters-menu'); scrollChaptersToCurrent(); });
    on('btn-close-chapters', () => { $('chapters-menu').style.display = 'none'; showOverlay('main-menu'); });

    on('btn-modes', () => { renderModeList(); showOverlay('modes-menu'); });
    on('btn-close-modes', () => { $('modes-menu').style.display = 'none'; showOverlay('main-menu'); });
    on('btn-mode-endless', () => startMode('endless'));
    on('btn-mode-sprint', () => startMode('sprint'));
    on('btn-mode-rhythm', () => startMode('rhythm'));
    on('btn-mode-again', () => { $('mode-over').style.display = 'none'; startMode(lastMode); });
    on('btn-mode-home', () => { $('mode-over').style.display = 'none'; S.playing = false; showOverlay('main-menu'); refreshMenu(); });

    on('btn-achievements', () => { renderAchPanel(); showOverlay('achievements-menu'); });
    on('btn-close-ach', () => { $('achievements-menu').style.display = 'none'; showOverlay('main-menu'); });
    // 详情页没有返回键：点卡片以外的空白处（含标题）就回成就页
    const detailPanel = $('ach-detail');
    if (detailPanel) detailPanel.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('.ach-detail-card')) return;
      if (Date.now() - achBgSwipeAt < 400) return;   // 刚在背景上滑过，别当成点击关掉
      detailPanel.style.display = 'none';
      renderAchPanel();                 // 领过奖的话列表红点要跟着消失
      showOverlay('achievements-menu');
    });
    // 详情页背景左右滑 = 切换上一枚 / 下一枚成就（卡片上的滑动仍是切奖杯阶）
    (function bindAchBgSwipe() {
      const panel = $('ach-detail');
      if (!panel) return;
      let sx = null, sy = null;
      panel.addEventListener('pointerdown', (e) => {
        if (e.target && e.target.closest && e.target.closest('.ach-detail-card')) { sx = null; return; }
        sx = e.clientX || 0; sy = e.clientY || 0;
      });
      panel.addEventListener('pointercancel', () => { sx = sy = null; });
      panel.addEventListener('pointerup', (e) => {
        if (sx == null) return;
        const dx = (e.clientX || 0) - sx;
        const dy = (e.clientY || 0) - sy;
        sx = sy = null;
        if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy)) return;
        achBgSwipeAt = Date.now();
        gotoAch(dx < 0 ? 1 : -1);
      });
    })();
    on('btn-ach-claim', claimAchReward);
    on('ach-prev', () => stepAchDetail(-1));
    on('ach-next', () => stepAchDetail(1));
    // 奖杯区域左右滑动也能切阶（手指划过 30px 才算）
    (function bindAchSwipe() {
      const box = $('ach-trophy');
      if (!box) return;
      let sx = null, sy = null;
      box.addEventListener('pointerdown', (e) => { sx = e.clientX || 0; sy = e.clientY || 0; });
      box.addEventListener('pointercancel', () => { sx = sy = null; });
      box.addEventListener('pointerup', (e) => {
        if (sx == null) return;
        const dx = (e.clientX || 0) - sx;
        const dy = (e.clientY || 0) - sy;
        sx = sy = null;
        if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy)) return;
        stepAchDetail(dx < 0 ? 1 : -1);
      });
    })();
    on('btn-collection', () => { renderSkinPanel(); showOverlay('collection-menu'); });
    on('btn-close-skins', () => { $('collection-menu').style.display = 'none'; showOverlay('main-menu'); });
    on('btn-welfare', () => { renderWelfare(); showOverlay('welfare-menu'); });
    on('btn-close-welfare', () => { $('welfare-menu').style.display = 'none'; showOverlay('main-menu'); });
    on('btn-welfare-signin', doSignIn);
    on('btn-wheel', doWheel);
    // 补签：点红色漏签日 → 补签窗口 → 「补签」→ 确认窗口（花 50 金币，不发奖励）
    on('btn-makeup-go', () => { openMakeupConfirm(); });
    on('btn-makeup-yes', () => {
      const box = $('makeup-confirm');
      const k = box ? box.dataset.date : '';
      if (box) { box.style.display = 'none'; delete box.dataset.date; }
      doMakeup(k);
      centerSignToday();
    });
    on('btn-makeup-no', () => {
      const box = $('makeup-confirm');
      if (box) { box.style.display = 'none'; delete box.dataset.date; }
      centerSignToday();
    });
    // 排行榜：先进「选榜单」，再进列表
    on('btn-leaderboard', () => {
      showOverlay('leaderboard-menu');
      if (typeof Board !== 'undefined') Board.open(myBestEntry());   // 拉全网 + 开实时推送
    });
    const openLbView = (tab) => {
      lbTab = tab;
      if (tab === 'prov' && !lbProv) lbProv = myProvCode() || PROVINCES[0][1];
      if (tab === 'level') {
        lbLevel = clampLbLevel(lbLevel);
      }
      hideLbPicker();
      renderLeaderboard();
      showOverlay('lb-view');
    };
    on('btn-lb-hub-all', () => openLbView('all'));
    on('btn-lb-hub-prov', () => openLbView('prov'));
    on('btn-lb-hub-level', () => openLbView('level'));
    on('btn-close-lb', () => {
      $('leaderboard-menu').style.display = 'none';
      hideLbPicker();
      if (typeof Board !== 'undefined') Board.close();
      showOverlay('main-menu');
    });
    on('btn-lb-view-back', () => {
      $('lb-view').style.display = 'none';
      hideLbPicker();
      showOverlay('leaderboard-menu');
    });
    // 「省榜 XX省 / 局榜 第X关」右边的 ⇄ 更换符号：点一下弹出全部省份 / 关卡，直接挑一个
    const provSwap = $('lb-prov-swap');
    if (provSwap) provSwap.addEventListener('click', () => { if (lbTab === 'prov') toggleLbPicker('prov'); });
    const lvSwap = $('lb-level-swap');
    if (lvSwap) lvSwap.addEventListener('click', () => { if (lbTab === 'level') toggleLbPicker('level'); });

    // 主页键（左上角）：改名入口
    on('btn-home-menu', () => {
      const n = $('home-nick');
      if (n) n.textContent = Meta.nickname();
      showOverlay('home-menu');
    });
    on('btn-close-home-menu', () => {
      $('home-menu').style.display = 'none';
      showOverlay('main-menu');
    });
    on('btn-goto-rename', () => {
      $('home-menu').style.display = 'none';
      openNickMenu(false);
    });

    // 改名面板
    const nickSave = $('btn-nick-save');
    if (nickSave) nickSave.addEventListener('click', saveNick);
    on('btn-nick-cancel', cancelNick);
    const nickInput = $('nick-input');
    if (nickInput) nickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && nickSave) nickSave.click();
    });

    // 账号上云（存到服务器）
    on('btn-cloud-save', submitCloud);
    on('btn-cloud-rename', cloudRenameEscape);
    const cloudPass = $('cloud-pass');
    if (cloudPass) cloudPass.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitCloud();
    });

    on('btn-story-go', closeStory);
    on('btn-revive-yes', doRevive);
    on('btn-revive-no', declineRevive);

    // 结算
    const next = $('btn-next-level');
    if (next) next.addEventListener('click', () => {
      $('level-clear').style.display = 'none';
      if (S.level >= maxMainLevel()) {
        showOverlay('main-menu');
        refreshMenu();
        return;
      }
      S.menuLevel = S.level + 1;
      playLevel(S.level + 1);
    });
    // 过关后还剩步数 / 剩时间：点「继续游戏」回到棋盘，用剩下的步数或秒数接着刷分
    const contBtn = $('btn-clear-continue');
    if (contBtn) contBtn.addEventListener('click', () => {
      if (S.daily) return;
      if (S.timerOn ? !(S.timeLeft > 0) : !(S.moves > 0)) return;
      $('level-clear').style.display = 'none';
      S.wonContinued = true;
      S.playing = true;
      S.busy = false;
      Input.setEnabled(true);
      if (S.timerOn) startTimer();     // 限时关要把表重新跑起来
      setView('game');
      // 「剩X步 / X秒，继续！」打在棋盘正中间（不再走底部 toast）
      FX.text(VIEW_W / 2, VIEW_H / 2,
        S.timerOn ? '剩 ' + Math.round(S.timeLeft) + ' 秒，继续！' : '剩 ' + S.moves + ' 步，继续！',
        '#ffd75c', 26);
    });
    const home1 = $('btn-clear-home');
    if (home1) home1.addEventListener('click', () => {
      $('level-clear').style.display = 'none';
      S.playing = false;
      if (!S.daily) S.menuLevel = S.level;
      showOverlay('main-menu');
      refreshMenu();
    });
    const again = $('btn-restart');
    if (again) again.addEventListener('click', () => {
      $('game-over').style.display = 'none';
      startLevel(S.level);
    });
    const home2 = $('btn-home');
    if (home2) home2.addEventListener('click', () => {
      $('game-over').style.display = 'none';
      S.playing = false;
      if (!S.daily) S.menuLevel = S.level;
      showOverlay('main-menu');
      refreshMenu();
    });
    // 结算画面：点面板上任何地方都能退出（按钮已删，不写提示文字），
    // 退出回「关卡记录」（从哪进的回哪去），不回主页
    const completePanel = $('game-complete');
    if (completePanel) completePanel.addEventListener('click', () => {
      completePanel.style.display = 'none';
      S.playing = false;
      S.menuLevel = maxMainLevel();
      renderHistory();
      scrollHistoryToCurrent();
      showOverlay('history-menu');
      refreshMenu();
    });

    // 设置 / 音乐
    const gear = $('btn-custom-music');
    if (gear) gear.addEventListener('click', () => {
      showOverlay('settings-menu');
      syncVolumeUI();
    });
    const musicBtns = ['btn-music-home', 'btn-music-game'];
    musicBtns.forEach((id) => {
      const b = $(id);
      if (!b) return;
      b.addEventListener('click', () => {
        const settings = Store.getSettings();
        const on = !AudioManager.musicOn;
        AudioManager.setMusicOn(on);
        Store.setSettings({ music: on });
        musicBtns.forEach((mid) => {
          const el = $(mid);
          if (!el) return;
          el.classList.toggle('music-off', !on);
          el.classList.toggle('music-on', on);
        });
      });
    });
    const closeSettings = $('btn-close-settings');
    if (closeSettings) closeSettings.addEventListener('click', () => {
      $('settings-menu').style.display = 'none';
      if (quietPaused) quietResumeGame();
    });

    const volBtn = $('btn-goto-volume');
    if (volBtn) volBtn.addEventListener('click', () => {
      $('music-settings-menu').style.display = 'none';
      syncVolumeUI();
      showOverlay('volume-menu');
    });

    // 设置 → 音乐设置（音量 / 播放列表 / 导入 / 恢复默认都在这里面）
    on('btn-goto-music-settings', () => {
      $('settings-menu').style.display = 'none';
      showOverlay('music-settings-menu');
    });
    on('btn-back-music-settings', () => {
      $('music-settings-menu').style.display = 'none';
      showOverlay('settings-menu');
    });

    // ==================== 账号安全 ====================
    // 注册时间：yyyy-MM-dd HH:mm:ss（个位数前面补 0）
    function fmtAccTime(ms) {
      if (!ms) return '—';
      const d = new Date(ms);
      if (isNaN(d.getTime())) return '—';
      const p = (n) => (n < 10 ? '0' + n : String(n));
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }
    function fillAccountInfo() {
      const n = $('account-cur-name');
      if (n) n.textContent = Account.loggedIn() ? Account.current().name : '未登录';
      const c = $('account-created');
      if (c) c.textContent = (Account.loggedIn() && Account.current() && Account.current().created)
        ? fmtAccTime(Account.current().created) : '—';
    }

    // 设置 → 账号安全：修改密码 / 切换账号
    on('btn-goto-account', () => {
      $('settings-menu').style.display = 'none';
      fillAccountInfo();
      showOverlay('account-menu');
    });
    on('btn-close-account', () => {
      $('account-menu').style.display = 'none';
      showOverlay('settings-menu');
    });

    // 📄 存档码：设置里只负责「生成 + 复制」，登录页只负责「导入」
    let backupFrom = 'account';

    function openBackupMenu(from) {
      backupFrom = from === 'auth' ? 'auth' : 'account';
      const box = $('backup-code');
      if (box) box.value = '';
      if (backupFrom === 'auth') {
        if ($('auth-menu')) $('auth-menu').style.display = 'none';
        if ($('auth-form')) $('auth-form').style.display = 'none';
      } else if ($('account-menu')) {
        $('account-menu').style.display = 'none';
      }
      showOverlay('backup-menu');
      setView('menu');
    }

    function openImportMenu(from) {
      backupFrom = from === 'auth' ? 'auth' : 'account';
      const box = $('backup-input');
      if (box) box.value = '';
      const err = $('backup-err');
      if (err) err.textContent = '';
      if ($('auth-menu')) $('auth-menu').style.display = 'none';
      if ($('auth-form')) $('auth-form').style.display = 'none';
      if (backupFrom !== 'auth' && $('account-menu')) $('account-menu').style.display = 'none';
      showOverlay('backup-import-menu');
      setView('menu');
    }

    // 两个面板共用的「返回」：从哪进来就回哪去
    function backupBack() {
      $('backup-menu').style.display = 'none';
      $('backup-import-menu').style.display = 'none';
      if (backupFrom === 'auth') { showAuthScreen(); return; }
      fillAccountInfo();
      showOverlay('account-menu');
    }

    function genBackupCode() {
      if (typeof Account === 'undefined' || !Account.exportBackup) { toast('账号功能没加载出来，请刷新页面'); return false; }
      const box = $('backup-code');
      if (box) box.value = Account.exportBackup();
      const err = $('backup-err');
      if (err) err.textContent = '';
      toast('已生成，点「复制」保存好');
      return true;
    }

    function copyBackupCode() {
      const box = $('backup-code');
      const code = (box && box.value) || '';
      if (!code) { toast('先点「生成」'); return; }
      const fallback = () => {
        try {
          if (box && box.focus) box.focus();
          if (box && box.select) box.select();
          if (document.execCommand) document.execCommand('copy');
          toast('已复制');
        } catch (e) { toast('复制失败，请长按文本框手动复制'); }
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(() => toast('已复制')).catch(fallback);
          return;
        }
      } catch (e) {}
      fallback();
    }

    function doImportBackup() {
      const box = $('backup-input');
      const err = $('backup-err');
      const code = (box && box.value) || '';
      if (typeof Account === 'undefined' || !Account.importBackup) { toast('账号功能没加载出来，请刷新页面'); return false; }
      const r = Account.importBackup(code);
      if (!r.ok) {
        if (err) err.textContent = r.reason;
        try { AudioManager.playSFX('invalid'); } catch (e) {}
        return false;
      }
      if (err) err.textContent = '';
      toast('已导入 ' + r.count + ' 个账号');
      $('backup-import-menu').style.display = 'none';
      setTimeout(() => { try { location.reload(); } catch (e) {} }, 700);
      return true;
    }

    // 📄 存档码入口：设置里生成，登录页导入
    on('btn-goto-backup', () => openBackupMenu('account'));
    on('btn-auth-backup', () => openImportMenu('auth'));
    on('btn-backup-gen', genBackupCode);
    on('btn-backup-copy', copyBackupCode);
    on('btn-backup-import', doImportBackup);
    on('btn-backup-back', backupBack);
    on('btn-backup-import-back', backupBack);

    // ☁️ 账号存到服务器（主动入口，不用等启动提示）
    on('btn-goto-cloud', () => {
      const acc = Account.current();
      if (acc && (acc.cloud || acc.ctoken)) {
        // 绑定标记在 ≠ 服务器上号还在（号可能被后台删过 / 重建过）。
        // 推一次真实验证：推成功 = 真的同步了；令牌失效会自动解绑，
        // 解绑后照常弹存档窗，玩家重输密码即可重新建档
        toast('正在检查云端存档…');
        Account.pushCloud(true).then((okPush) => {
          if (okPush) { toast('进度已同步到服务器'); return; }
          const now = Account.current();
          if (now && (now.cloud || now.ctoken)) {
            // 没解绑 → 只是网络问题等原因没推上去
            toast(typeof Account.cloudOk === 'function' && !Account.cloudOk()
              ? '网络不可用，稍后再试' : '没同步上，稍后再试');
            return;
          }
          const err = $('cloud-err');
          if (err) err.textContent = '';
          $('account-menu').style.display = 'none';
          openCloudMenu('account');
        });
        return;
      }
      const err = $('cloud-err');
      if (err) err.textContent = '';
      $('account-menu').style.display = 'none';
      openCloudMenu('account');     // 从账号安全页进来：关掉后回账号安全页
    });

    // 修改密码
    on('btn-goto-password', () => {
      ['pass-old', 'pass-new', 'pass-new2'].forEach((id) => {
        const el = $(id);
        if (el) { el.value = ''; el.classList.remove('error'); }
      });
      setPassError('');
      $('account-menu').style.display = 'none';
      showOverlay('password-menu');
    });
    on('btn-pass-cancel', () => {
      $('password-menu').style.display = 'none';
      showOverlay('account-menu');
    });
    on('btn-pass-save', () => {
      const oldV = ($('pass-old') || {}).value || '';
      const n1 = ($('pass-new') || {}).value || '';
      const n2 = ($('pass-new2') || {}).value || '';
      const fail = (m, ids) => {
        setPassError(m, ids);
        try { AudioManager.playSFX('invalid'); } catch (e) {}
      };
      if (!n1) return fail('请填写新密码', ['pass-new', 'pass-new2']);
      if (n1 !== n2) return fail('两次输入的新密码不一样', ['pass-new2']);
      const r = Account.setPassword(oldV, n1);
      if (!r.ok) {
        return fail(r.reason, r.oldBad ? ['pass-old'] : ['pass-new', 'pass-new2']);
      }
      $('password-menu').style.display = 'none';
      showOverlay('account-menu');
      toast('密码已修改，下次登录用新密码');
      try { AudioManager.playSFX('coin'); } catch (e) {}
    });

    // 切换账号
    on('btn-goto-switch', () => {
      renderSwitchList();
      $('account-menu').style.display = 'none';
      showOverlay('switch-menu');
    });
    on('btn-switch-cancel', () => {
      $('switch-menu').style.display = 'none';
      showOverlay('account-menu');
    });
    // 登录其他账号：先退出当前号（数据留档），再回到登录页
    on('btn-switch-login', () => {
      // 游客本来就没登录：直接去登录页，别走 logout（logout 会清掉游客进度）
      if (Account.loggedIn()) Account.logout();
      $('switch-menu').style.display = 'none';
      showAuthScreen();
    });

    // ==================== 登录 / 注册 ====================
    on('btn-auth-login', () => openAuthForm('login'));
    on('btn-auth-register', () => openAuthForm('register'));
    on('btn-auth-back', () => {
      $('auth-form').style.display = 'none';
      setAuthError('');
      showAuthScreen();
    });
    on('btn-auth-submit', submitAuth);
    ['auth-name', 'auth-pass'].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAuth(); });
    });
    on('btn-fix-save', saveFix);
    const fixName = $('fix-name');
    if (fixName) fixName.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveFix(); });

    const backVol = $('btn-back-settings');
    if (backVol) backVol.addEventListener('click', () => {
      $('volume-menu').style.display = 'none';
      showOverlay('music-settings-menu');
    });

    const bgm = $('bgm-volume');
    const sfx = $('sfx-volume');
    let sfxDemoAt = 0;
    let bgmSaveTimer = null, sfxSaveTimer = null;
    if (bgm) bgm.addEventListener('input', () => {
      $('bgm-volume-val').textContent = Math.round(bgm.value * 100) + '%';
      // 直接改「正在播放的那首歌 / 默认 BGM」的音量：
      // 拖到哪儿、声音立刻变到哪儿，不用另外放试听音
      const v = parseFloat(bgm.value);
      AudioManager.setVolumes(v, null);
      // 拖完就记住（防抖 400ms 统一写一次）：下次进来还是这个音量
      clearTimeout(bgmSaveTimer);
      bgmSaveTimer = setTimeout(() => Store.setSettings({ bgm: v }), 400);
    });
    if (sfx) sfx.addEventListener('input', () => {
      $('sfx-volume-val').textContent = Math.round(sfx.value * 100) + '%';
      const v = parseFloat(sfx.value);
      AudioManager.setVolumes(null, v);
      const now = Date.now();
      if (now - sfxDemoAt > 160) {
        sfxDemoAt = now;
        AudioManager.sfxDemo();
      }
      clearTimeout(sfxSaveTimer);
      sfxSaveTimer = setTimeout(() => Store.setSettings({ sfx: v }), 400);
    });
    const saveVol = $('btn-save-volume');
    if (saveVol) saveVol.addEventListener('click', () => {
      const b = parseFloat(bgm.value), s = parseFloat(sfx.value);
      AudioManager.setVolumes(b, s);
      Store.setSettings({ bgm: b, sfx: s });
      toast('音量已保存');
    });

    // 音乐相关（导入 / 播放列表 / 重命名 / 恢复默认）全部由 music.js 接管，
    // 这里只保留设置面板的开关与音量。

    // 任务 / 商店
    const taskBtn = $('btn-goto-tasks');
    if (taskBtn) taskBtn.addEventListener('click', () => {
      renderTasks();
      showOverlay('tasks-menu');
    });
    const closeTasks = $('btn-close-tasks');
    if (closeTasks) closeTasks.addEventListener('click', () => $('tasks-menu').style.display = 'none');
    // 打开购物商店：主页「🛒 购物商店」和局内工具栏的 🛒 共用这一套
    function openShop() {
      // 局内逛商店时静默暂停，别让计时 / 节拍在遮罩后面白走
      if (S.playing) quietPauseGame();
      renderShop();
      showOverlay('shop-menu');
      // 面板刚从隐藏变显示，滚动位置要等布局落地后再还原一次
      restoreShopScroll();
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restoreShopScroll);
      else setTimeout(restoreShopScroll, 16);
      setTimeout(restoreShopScroll, 80);
    }
    const shopBtn = $('btn-goto-shop');
    if (shopBtn) shopBtn.addEventListener('click', openShop);
    // 游戏界面工具栏里的 🛒 也进同一个商店（主机 / 局内都走这一套）
    const shopGameBtn = $('btn-shop-game');
    if (shopGameBtn) shopGameBtn.addEventListener('click', openShop);
    const closeShop = $('btn-close-shop');
    if (closeShop) closeShop.addEventListener('click', () => {
      syncShopDot();          // 关之前先记住停在哪一张
      $('shop-menu').style.display = 'none';
      if (quietPaused) quietResumeGame();
    });

    // ==================== 点面板外空白 = 回到上一层 ====================
    // 面板上的「返回 / 关闭」键都已删除（结算页的「返回主页」是主动作，保留），
    // 退出一律靠点面板外的空白处，回到打开它的那一层。
    const PANEL_PARENT = {
      'home-menu': 'main-menu',
      'admin-menu': 'main-menu',
      'features-menu': 'rules-menu',
      'play-rules-menu': 'rules-menu',
      'mail-view': 'mail-menu',
      'music-settings-menu': 'settings-menu',
      'account-menu': 'settings-menu',
      'password-menu': 'account-menu',
      'switch-menu': 'account-menu',
      'volume-menu': 'music-settings-menu',
      'custom-music-menu': 'music-settings-menu',
      'music-history-menu': 'custom-music-menu',
      'playlist-menu': 'music-settings-menu',
      'auth-form': 'auth-menu',  // 登录 / 注册表单点背景回选择页
      // auth-menu（选登录还是注册）点背景 = 不登录直接玩，见 skipAuth()
      'daily-done': 'main-menu', // 每日挑战结算页：点空白回主页
      'tasks-menu': 'main-menu',
      'chapters-menu': 'main-menu',
      'story-menu': 'chapters-menu',
      'modes-menu': 'main-menu',
      'achievements-menu': 'main-menu',
      'collection-menu': 'main-menu',
      'welfare-menu': 'main-menu',
      'makeup-menu': null,       // 补签窗口：点空白只关自己，回到签到页
      'backpack-menu': null,     // 局内回棋盘、主页回主页（底下那层本来就开着）
      'coin-menu': 'main-menu',  // 金币明细：点空白回主页
      'rename-menu': null
    };

    function hidePanel(id) { const el = $(id); if (el) el.style.display = 'none'; }

    // 返回上一层：先做这一层的收尾，再显示上一层（没有上一层就只关掉自己）
    function panelBack(id) {
      switch (id) {
        case 'rules-menu':
          hidePanel('rules-menu');
          if (quietPaused) quietResumeGame(); else showOverlay('main-menu');
          return true;
        case 'settings-menu':
          hidePanel('settings-menu');
          if (quietPaused) quietResumeGame();
          return true;
        case 'shop-menu':
          syncShopDot();          // 记住停在哪一张
          hidePanel('shop-menu');
          if (quietPaused) quietResumeGame();   // 局内逛完商店接着打
          return true;
        case 'mail-menu':
          hidePanel('mail-menu'); showOverlay('main-menu'); refreshMenu();
          return true;
        case 'mail-view':
          hidePanel('mail-view'); renderMailList(); showOverlay('mail-menu');
          return true;
        case 'history-menu':
          hidePanel('history-menu'); showOverlay('main-menu'); refreshMenu();
          return true;
        case 'daily-done':
          hidePanel('daily-done'); showOverlay('main-menu'); refreshMenu();
          return true;
        case 'backup-menu':
        case 'backup-import-menu':
          backupBack();           // 从哪进来就回哪去（设置 / 登录页）
          return true;
        case 'auth-menu':
          skipAuth();             // 登录页点背景 = 不登录，按游客玩
          return true;
        case 'cloud-menu':
          skipCloud();            // 云存档页点背景 = 先不存，之后在账号安全里再补
          return true;
        case 'music-library-menu':
          hidePanel('music-library-menu');
          { const b = $('btn-goto-playlist'); if (b) b.click(); else showOverlay('playlist-menu'); }
          return true;
        case 'leaderboard-menu':
          hidePanel('leaderboard-menu');
          hideLbPicker();
          if (typeof Board !== 'undefined') Board.close();
          showOverlay('main-menu');
          return true;
        case 'lb-view':
          hidePanel('lb-view');
          hideLbPicker();
          showOverlay('leaderboard-menu');
          return true;
        case 'admin-menu':
          // 后台二级页（点击数量 / 全服用户）先退回一级，一级再退回主页
          if ($('admin-nav') && $('admin-nav').style.display === 'none') { showAdminPage(null); return true; }
          hidePanel('admin-menu');
          showOverlay('main-menu');
          return true;
        case 'admin-user-list':
          hidePanel('admin-user-list');
          hideAdminUlPicker();
          if (adminUlFromProv) {
            // 从「省份详情」点省份进来的：点背景回省份详情，不是回后台
            adminUlFromProv = false;
            renderProvUserList();
            showOverlay('prov-user-list');
          } else {
            showOverlay('admin-menu');
            showAdminPage('users');
            renderAdminUsers();
          }
          return true;
        case 'prov-user-list':
          hidePanel('prov-user-list');
          showOverlay('admin-menu');
          showAdminPage('users');
          renderAdminUsers();
          return true;
        case 'coin-menu':
          if (ledgerPop) { closeLedgerPop(); return true; }   // 先收起下拉，再点一次才回主页
          hidePanel('coin-menu'); showOverlay('main-menu'); refreshMenu();
          return true;
        case 'ach-detail':
          return false;           // 详情页自己有点空白回成就页的处理
      }
      if (!(id in PANEL_PARENT)) return false;   // 主页 / 结算 / 强制窗口：点背景不动
      const parent = PANEL_PARENT[id];
      hidePanel(id);
      if (parent) showOverlay(parent);
      return true;
    }

    // 点面板外的空白 = 回到上一层
    document.querySelectorAll('.overlay').forEach((ov) => {
      ov.addEventListener('click', (e) => {
        if (e.target !== ov) return;
        panelBack(ov.id);
      });
    });

    // 窗口变化重排（§25）
    let rt = null;
    window.addEventListener('resize', () => {
      if (rt) clearTimeout(rt);
      rt = setTimeout(() => {
        resizeCanvas();
        drawStatic();
      }, 120);
    });
  }

  function syncVolumeUI() {
    const s = Store.getSettings();
    const bgm = $('bgm-volume'), sfx = $('sfx-volume');
    if (bgm) {
      bgm.value = s.bgm;
      $('bgm-volume-val').textContent = Math.round(s.bgm * 100) + '%';
    }
    if (sfx) {
      sfx.value = s.sfx;
      $('sfx-volume-val').textContent = Math.round(s.sfx * 100) + '%';
    }
    const inp = $('input-custom-bgm');
    if (inp) inp.value = s.customBgm || '';
  }

  // ==================== 每日挑战：三星后当天封盘 ====================
  function dailyCompleted() {
    return (Store.getDailyRecord().stars || 0) >= 3;
  }

  function showDailyDone() {
    const rec = Store.getDailyRecord();
    const row = $('daily-done-stars');
    const starEls = row ? row.children : [];
    for (let i = 0; i < starEls.length; i++) {
      starEls[i].classList.toggle('on', i < (rec.stars || 0));
    }
    if ($('daily-done-star-num')) $('daily-done-star-num').textContent = rec.stars || 0;
    // 用步：完成挑战那局用的步数（取历史最少）；金币：完成任务才发的奖励
    // 老档（更新前完成的）没记过步数，显示「—」而不是 0
    if ($('daily-done-moves')) $('daily-done-moves').textContent = (rec.stars >= 1 && !rec.moves) ? '—' : (rec.moves || 0);
    if ($('daily-done-coins')) $('daily-done-coins').textContent = '+' + (rec.coins || 0);
    showOverlay('daily-done');
  }

  function refreshMenu() {
    try { grantChapterMails(); } catch (e) {}   // 之前就通过的章节，进主页时补发到邮箱
    const prog = Store.getProgress();
    const maxUnlocked = Store.maxUnlockedLevel(maxMainLevel());
    const max = maxMainLevel();

    // 主页关卡：优先用关卡记录里选中的，其次上次存档的进度
    if (!S.menuLevel) {
      const saved = Store.getSettings().menuLevel;
      S.menuLevel = saved || maxUnlocked;
    }
    // 只能在「已解锁」范围内显示：存档里留了超前值（如直接落到未解锁的第 80 关）也一律拉回来
    S.menuLevel = Math.max(1, Math.min(S.menuLevel, maxUnlocked));

    const lvEl = $('menu-current-level');
    if (lvEl) lvEl.textContent = S.menuLevel;
    const lvLabel = $('menu-level-label');
    if (lvLabel) lvLabel.textContent = S.menuLevel;

    // 上一关 / 下一关：只能在自己已解锁的范围内翻
    const prevBtn = $('btn-prev-level');
    if (prevBtn) prevBtn.disabled = S.menuLevel <= 1;
    const nextBtn = $('btn-next-level-menu');
    if (nextBtn) nextBtn.disabled = S.menuLevel >= maxUnlocked;

    const high = $('menu-current-high');
    if (high) {
      const rec = prog[S.menuLevel];
      high.textContent = (rec && rec.score) || 0;
      // 没通关（0 星）但有成绩 → 红色提示「这关还没过」
      high.classList.toggle('fail', !!(rec && rec.score > 0 && rec.stars === 0));
    }
    // 这一局在「局榜」里排前三 → 分数旁边挂奖牌
    const medalEl = $('menu-high-medal');
    if (medalEl) {
      const m = medalForLevel(S.menuLevel);
      medalEl.textContent = m;
      medalEl.style.display = m ? 'inline-block' : 'none';
    }

    const stars = $('menu-total-stars');
    if (stars) stars.textContent = Store.totalStars();
    refreshMailBadge();
    updateAchDot();

    const coins = $('menu-coins');
    if (coins) coins.textContent = Store.getWallet().coins;

    const play = $('btn-play');
    if (play) {
      const run = Store.loadRun();
      const canResume = !!(run && !run.daily && run.level === S.menuLevel && (run.moves > 0 || run.timeLeft > 0));
      const played = Store.hasPlayed(S.menuLevel) || !!(prog[S.menuLevel]);
      // 有未完成的本局存档（暂停/中途退出）→ 继续游戏；
      // 通关过、或玩过没通关 → 重新开始；完全没碰过 → 开始游戏
      if (canResume) play.textContent = '🕹️ 继续游戏';
      else if (played) play.textContent = '🔄 重新开始';
      else play.textContent = '🎮 开始游戏';
    }

    // 每日挑战：今天已经三星 → 按钮变成「已完成今日挑战」
    const dailyBtn = $('btn-daily');
    if (dailyBtn) {
      const done = dailyCompleted();
      dailyBtn.textContent = done ? '✅ 已完成今日挑战' : '📅 每日挑战';
      dailyBtn.classList.toggle('is-done', done);
    }
  }

  // 金币数字实时跟着钱包走：领成就 / 买道具 / 收邮件附件都不用手动刷新
  function syncCoinUI(w) {
    const coins = (w && typeof w.coins === 'number') ? w.coins : Store.getWallet().coins;
    if ($('menu-coins')) $('menu-coins').textContent = coins;
    if ($('shop-coins')) $('shop-coins').textContent = coins;
    // 明细页开着时，新的一笔立刻出现在列表里
    const box = $('coin-menu');
    if (box && box.style.display === 'flex') renderLedger();
  }
  if (Store.onWallet) Store.onWallet(syncCoinUI);

  // 点过的按键立刻收回焦点：蓝圈圈不留在屏幕上（下拉在选择完自己 blur）
  document.addEventListener('click', (e) => {
    const el = (e.target && e.target.closest) ? e.target.closest('button') : null;
    if (el && el.blur) el.blur();
  }, true);

  // ==================== 主循环 ====================
  function loop(now) {
    const dt = Math.min(0.05, (now - (S.lastFrame || now)) / 1000);
    S.lastFrame = now;

    if (!FX.isEmpty() || FX.getShakeOffset().x || FX.getShakeOffset().y) {
      FX.update(dt);
      if (!S.busy) drawStatic();
    }
    // 棋盘上有钥匙/奶龙时重绘：货物才会真的呼吸（放大缩小 + 发光起伏）。
    // 呼吸节奏很慢，降到 ~20fps 就够顺滑，省下大半 GPU/CPU（低端机卡顿主因）。
    if (!S.busy && boardHasCargo() && (S.frameNo = (S.frameNo || 0) + 1) % 3 === 0) drawStatic();
    updateComboBar();

    // 落地挤压（§14）
    if (S.landAnims.length) {
      const now2 = performance.now();
      S.landAnims = S.landAnims.filter((a) => now2 - a.t0 < 160);
    }

    requestAnimationFrame(loop);
  }

  // ==================== 启动 ====================
  async function boot() {
    // 账号：老版本的本机数据先认领成一个账号；没有登录会话的停在登录页
    // 必须在任何启动期写 localStorage 之前跑，否则会把「启动缓存」误认成老用户数据
    // 注意：玩家主动选了「先不登录，当游客玩」时不要自动建号，不然游客进度会被中途认领、
    // 之后注册时又当成本机老号的数据清掉
    try {
      if (typeof Account !== 'undefined' && !authSkipped()) Account.ensure();
    } catch (e) {}
    try { if (typeof Account !== 'undefined' && Account.startCloudSync) Account.startCloudSync(); } catch (e) {}
    const loggedIn = (typeof Account !== 'undefined') && Account.loggedIn();

    // 老档补发：更新前完成的每日挑战没发过完成奖励，按基础 30 枚补进钱包（步数未知，结算页显示 —）
    try {
      const drec = Store.getDailyRecord();
      if ((drec.stars || 0) >= 1 && !(drec.coins || 0)) {
        Store.addCoins(30, '每日挑战补发');
        Store.patchDaily({ coins: 30 });
      }
    } catch (e) {}

    // 读关卡数据（§20）
    try {
      const res = await fetch('js/levels.json', { cache: 'no-store' });
      if (res.ok) S.data = await res.json();
    } catch (e) {
      console.warn('[game] levels.json 加载失败，使用内置数据（file:// 下正常）');
      S.data = LEVELS_FALLBACK;
    }

    const settings = Store.getSettings();
    // 计数口径升级到 v2：本机与全网从此刻起同源重新计（旧的脏数据不再参与）
    try {
      if (Number(localStorage.getItem('nl2:statsVer') || 0) !== 3) {
        localStorage.setItem('nl2:statsVer', '3');
        Store.resetVisits();
      }
    } catch (e) {}
    Store.recordVisit(); // 本机点击：每载入一次 +1
    // 后台统计：全网计数 +1、城市定位（失败不影响游戏）
    // 本机这一下必须算进全网：定位没回来就等它，最多重试 3 次，绝不丢
    setTimeout(() => { attributeClick(0); }, 300);
    // iOS / iPadOS：AudioContext 必须在手势里创建，否则之后 resume 也起不来，
    // 表现就是「上次把音乐关掉，这次进来连音效都没了」
    const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    AudioManager.init(settings, !IS_IOS);
    AudioManager.musicOn = settings.music !== false;
    ['btn-music-home', 'btn-music-game'].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.classList.toggle('music-off', !settings.music);
      el.classList.toggle('music-on', !!settings.music);
    });

    resizeCanvas();
    loadImages();

    S.levelDef = getLevelDef(1);
    applyTheme(S.levelDef.theme);
    updatePreview();

    // 皮肤 / 成就：启动时同步一次
    try {
      document.body.dataset.skin = Meta.currentSkin();
      Meta.check();
    } catch (e) {}

    // 排行榜：别人成绩一变就重绘（列表开着就刷列表，主页开着就刷奖牌）
    if (typeof Board !== 'undefined') {
      Board.onChange(() => {
        const view = $('lb-view');
        if (view && view.style.display === 'flex') renderLeaderboard();
        if (!S.playing) { try { refreshMenu(); } catch (e) {} }
      });
      publishMyScore();
      // 主页要显示局榜奖牌：后台悄悄同步一次，不用先打开排行榜
      setTimeout(() => { try { Board.sync(); } catch (e) {} }, 1500);
    }

    attachUI();
    if (global_Music()) global_Music().init();
    refreshMenu();
    Tasks.ensureToday();
    if (loggedIn) {
      showOverlay('main-menu');
      claimCompensation();
      setTimeout(() => { try { maybeAccountGate(); } catch (e) {} }, 400);
      // 本机账号还没存到服务器 → 进主页后提示一次（改名 / 补密码优先，所以晚一点）
      setTimeout(() => { try { maybeCloudOffer(); } catch (e) {} }, 1600);
    } else if (authSkipped()) {
      // 玩家上次主动关掉了登录页：直接当游客进主页（进度只存本机），别再拦一次
      showOverlay('main-menu');
    } else {
      AudioManager.gateBGM(false);   // 登录页不放背景音乐
      showAuthScreen();
    }
    requestAnimationFrame(loop);

    // 首次交互解锁音频，并恢复上次的自定义音乐
    // 一进来就要有声音：
    // 1) 先不带手势直接试一次，浏览器允许自动播放的（部分安卓 / 微信安卓）立刻出声；
    // 2) 不允许的（iOS、微信 iOS）会在第一次触屏 / 滚动 / 点击的瞬间接上，
    //    事件不解绑，没播起来就下次交互继续试。
    let musicTaken = false;
    const tryPlayMusic = (gesture) => {
      AudioManager.init(Store.getSettings(), gesture === true || !IS_IOS);
      AudioManager.unlock();                 // 恢复 AudioContext + 默认背景音乐
      if (!musicTaken && global_Music()) {
        musicTaken = true;
        global_Music().restore();            // 恢复上次在音乐库选的那首歌
      }
      // 1.2 秒后还没响（被浏览器拦了）→ 允许下次交互再试一次
      setTimeout(() => {
        if (!AudioManager.musicOn) return;
        const a = AudioManager._custom;
        if (a && a.paused) musicTaken = false;
      }, 1200);
    };
    tryPlayMusic();

    const UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown', 'scroll', 'wheel'];
    const onGesture = () => tryPlayMusic(true);
    UNLOCK_EVENTS.forEach((ev) =>
      window.addEventListener(ev, onGesture, { passive: true, capture: true }));
    // 微信内置浏览器：桥接就绪后基本允许自动播放
    // （经典写法：就绪时 invoke 一次 getNetworkType，能解开微信的自动播放限制）
    const weixinKick = () => {
      try {
        if (window.WeixinJSBridge && window.WeixinJSBridge.invoke) {
          window.WeixinJSBridge.invoke('getNetworkType', {}, () => {});
        }
      } catch (e) {}
      tryPlayMusic(true);
    };
    document.addEventListener('WeixinJSBridgeReady', weixinKick, false);
    if (window.WeixinJSBridge) setTimeout(weixinKick, 0);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tryPlayMusic(true);
      else autoPauseIfPlaying();
    });
    // 退到后台 / 切 App / 锁屏 都按暂停处理
    window.addEventListener('pagehide', autoPauseIfPlaying);
    window.addEventListener('blur', autoPauseIfPlaying);
    window.addEventListener('pageshow', () => tryPlayMusic(true));
  }

  function global_Music() {
    return typeof window !== 'undefined' ? window.Music : null;
  }

  // ==================== 章节地图 / 剧情 / 提示 / 复活 / 多模式 ====================
  function chapters() {
    const c = (S.data && S.data.chapters) || [];
    if (c.length) return c;
    return [{ id: 1, name: '主线关卡', theme: 'grass', from: 1, to: maxMainLevel(), emoji: '🌱', story: '' }];
  }

  function chapterProgress(ch) {
    let stars = 0;
    for (let lv = ch.from; lv <= ch.to; lv++) stars += Store.getLevelRecord(lv).stars || 0;
    return { stars: stars, total: (ch.to - ch.from + 1) * 3 };
  }

  // ==================== 章节奖励 ====================
  // 把一整章（该章每一关都拿到星）打通 → 发一封「恭喜通过第X章」，附件 200 金币。
  // 邮件 id 固定（chapter-clear-N），重复调用不会重复发；老玩家下次进主页会把
  // 之前已经通过的章节一次性补齐，直接去邮箱领就行。
  const CHAPTER_COIN = 200;
  function chapterCleared(ch) {
    for (let lv = ch.from; lv <= ch.to; lv++) {
      const rec = Store.getLevelRecord(lv) || {};
      if (!(rec.stars > 0)) return false;
    }
    return true;
  }
  function stampNow() {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function grantChapterMails() {
    if (typeof Mail === 'undefined' || !Mail.sendMail) return;
    chapters().forEach((ch) => {
      if (!chapterCleared(ch)) return;
      const id = 'chapter-clear-' + ch.id;
      try {
        if (Mail.get(id)) return;
        Mail.sendMail({
          id: id,
          at: stampNow(),
          icon: '🏆',
          title: '恭喜通过第' + ch.id + '章',
          from: '系统',
          body: '你已经把「' + (ch.name || ('第' + ch.id + '章')) + '」的关卡全部打通了！\n\n' +
            '这 ' + CHAPTER_COIN + ' 金币是章节奖励，点下面的「领取」就进钱包。下一章继续加油～',
          coins: CHAPTER_COIN
        });
      } catch (e) {}
    });
  }

  function renderChapterMap() {
    const box = $('chapters-list');
    if (!box) return;
    const maxU = Store.maxUnlockedLevel(maxMainLevel());
    box.innerHTML = '';
    // 只显示「已经玩到」的章节：一章都没进去过的章节不提前露出来，
    // 底部统一用一行「更多章节等待解锁…」带过，不让玩家一眼数出总共几章
    chapters().filter((ch) => maxU >= ch.from).forEach((ch) => {
      const p = chapterProgress(ch);
      const card = document.createElement('div');
      card.className = 'chapter-card';
      const head = document.createElement('div');
      head.className = 'chapter-head';
      head.innerHTML = '<span class="chapter-emoji">' + (ch.emoji || '📖') + '</span>' +
        '<span class="chapter-name">' + ch.name + '</span>' +
        '<span class="chapter-stars">⭐ ' + p.stars + '/' + p.total + '</span>';
      card.appendChild(head);
      const grid = document.createElement('div');
      grid.className = 'chapter-grid';
      for (let lv = ch.from; lv <= ch.to; lv++) {
        const rec = Store.getLevelRecord(lv);
        const open = lv <= maxU;
        const b = document.createElement('button');
        b.className = 'level-chip' + (open ? '' : ' locked') + ((rec.stars || 0) >= 1 ? ' done' : '') +
          (lv === (S.menuLevel || 0) ? ' current' : '');
        b.innerHTML = '<b>' + lv + '</b><i>' + (open ? ('★★★'.slice(0, rec.stars || 0) || '·') : '🔒') + '</i>';
        if (open) {
          b.addEventListener('click', () => {
            $('chapters-menu').style.display = 'none';
            playLevel(lv);
          });
        }
        grid.appendChild(b);
      }
      card.appendChild(grid);
      box.appendChild(card);
    });
    // 底部的「还有更多」提示（章节 / 关卡总数不再告诉玩家）
    const more = document.createElement('p');
    more.className = 'chapter-more';
    more.textContent = '更多章节等待解锁…';
    box.appendChild(more);
  }

  let storyCb = null;
  function showStory(chId, cb) {
    const ch = chapters()[chId - 1];
    storyCb = cb || null;
    if (!ch) {
      const f = storyCb; storyCb = null;
      if (f) f();
      return;
    }
    Meta.markStory(chId);
    if ($('story-chapter')) $('story-chapter').textContent = ch.name;
    if ($('story-emoji')) $('story-emoji').textContent = ch.emoji || '📖';
    if ($('story-text')) $('story-text').textContent = ch.story || '';
    showOverlay('story-menu');
    AudioManager.playSFX('select');
  }

  function closeStory() {
    const cb = storyCb;
    storyCb = null;
    if ($('story-menu')) $('story-menu').style.display = 'none';
    if (cb) cb();
  }

  function playLevel(lv) {
    const def = getLevelDef(lv);
    const chId = def.chapter || 1;
    const ch = chapters()[chId - 1];
    const firstOfChapter = ch && ch.from === lv;
    const go = () => {
      AudioManager.init(Store.getSettings());
      AudioManager.unlock();
      const run = Store.loadRun();
      if (run && !run.daily && run.level === lv && loadRun()) return;
      Store.clearRun();
      S.menuLevel = lv;
      startLevel(lv);
    };
    ensureAccount(() => {
      if (firstOfChapter && !Meta.storySeen(chId)) showStory(chId, go);
      else go();
    });
  }

  // ---------- 提示：花一次机会高亮一组可走的交换 ----------
  // 提示高亮框（棋盘上的虚线脉动框）随时可收：玩家照着走了那一步、洗牌、撤回、
  // 或者自己又走了一步，都立刻清掉，不让它留在棋盘上继续晃。
  function clearHint() {
    if (!S.hintCells && !S.hintUntil) return;
    S.hintCells = null;
    S.hintUntil = 0;
    drawStatic();
  }

  function useHint() {
    if (!S.playing || S.busy || S.paused) return;
    if (S.hintLeft <= 0) {
      toast('提示次数用完了（每局 3 次）');
      AudioManager.playSFX('invalid');
      return;
    }
    const h = findHint();
    if (!h) {
      toast('暂时没有可走的步，点「洗牌」试试');
      AudioManager.playSFX('invalid');
      return;
    }
    S.hintLeft--;
    S.hintCells = h;
    S.hintUntil = performance.now() + 2600;
    updateHUD();
    AudioManager.playSFX('select');
    drawStatic();
    const timer = setInterval(() => {
      if (!S.playing || performance.now() > S.hintUntil) {
        clearInterval(timer);
        S.hintCells = null;
        drawStatic();
      } else {
        drawStatic();
      }
    }, 130);
  }

  // ---------- 再来 3 步 ----------
  const REVIVE_COST = 300;
  function maybeOfferRevive() {
    if (!S.playing) return false;
    if (S.daily || (S.mode && S.mode !== 'main') || S.reviveUsed) return false;
    const box = $('revive-menu');
    if (!box) return false;
    const w = Store.getWallet();
    const can = w.coins >= REVIVE_COST;
    if ($('revive-cost')) $('revive-cost').textContent = REVIVE_COST;
    if ($('revive-tip')) {
      $('revive-tip').textContent = can
        ? '差一点点就过了，要再来一次吗？'
        : '金币还差 ' + (REVIVE_COST - w.coins) + ' 枚，通关或签到能赚金币';
    }
    const yes = $('btn-revive-yes');
    if (yes) {
      yes.disabled = !can;
      yes.textContent = can
        ? (S.timerOn ? ('花 ' + REVIVE_COST + ' 金币，再来 7s') : ('花 ' + REVIVE_COST + ' 金币，再来 3 步'))
        : '金币不足';
    }
    S.busy = true;
    Input.setEnabled(false);
    stopTimer();
    showOverlay('revive-menu');
    return true;
  }

  function doRevive() {
    // 明细里写明是在第几关续的命
    if (!Store.spendCoins(REVIVE_COST, '续命', S.daily ? '每日挑战' : ('第 ' + S.level + ' 关'))) { toast('金币不够'); return; }
    S.reviveUsed = true;
    if (S.timerOn) S.timeLeft = Math.max(0, S.timeLeft) + 7;
    else S.moves += 3;
    S.playing = true;
    S.paused = false;
    S.busy = false;
    if ($('revive-menu')) $('revive-menu').style.display = 'none';
    setView('game');
    Input.setEnabled(true);
    updateHUD();
    updateTargetBar();
    drawStatic();
    if (S.timerOn) startTimer();
    AudioManager.playSFX('coin');
    toast(S.timerOn ? '续命成功：+7s' : '续命成功：+3 步');
  }

  function declineRevive() {
    if ($('revive-menu')) $('revive-menu').style.display = 'none';
    S.busy = false;
    endGame();
  }

  // ---------- 无尽 / 冲刺 / 节奏 ----------
  const MODES = {
    endless: { name: '无尽模式', theme: 'star', moves: 40, time: 0, desc: '40 步自由发挥，连击越猛分越高' },
    sprint: { name: '60 秒冲刺', theme: 'candy', moves: 0, time: 60, desc: '60 秒内能刷出多少分' },
    rhythm: { name: '节奏关卡', theme: 'ocean', moves: 0, time: 90, desc: '踩在节拍上消除，额外 1.5 倍分' }
  };

  let lastMode = 'endless';

  function renderModeList() {
    const best = Meta.getBest();
    ['endless', 'sprint', 'rhythm'].forEach((k) => {
      const el = $('mode-best-' + k);
      if (el) el.textContent = best[k] > 0 ? ('最佳 ' + best[k] + ' 分') : '还没挑战过';
    });
  }

  function startMode(mode) {
    const m = MODES[mode];
    if (!m) return;
    ensureAccount(() => {
      lastMode = mode;
      const def = {
        id: 0, theme: m.theme, colors: 6, moves: m.moves, stars: [0, 0, 0],
        goal: { type: m.time ? 'timed' : 'score', target: 999999 }
      };
      if (m.time) def.goal.time = m.time;
      ['chapters-menu', 'modes-menu', 'main-menu'].forEach((id) => {
        const el = $(id);
        if (el) el.style.display = 'none';
      });
      startLevel(1, { def: def, mode: mode });
    });
  }

  async function endModeRun() {
    S.playing = false;
    stopTimer();
    stopBeatLoop();
    Input.setEnabled(false);
    stopFrenzy();
    const mode = S.mode === 'main' ? 'endless' : S.mode;
    const r = Meta.recordBest(mode, S.score);
    const coins = Math.max(5, Math.floor(S.score / 200));
    Store.addCoins(coins, '模式奖励');
    Meta.bump('modes', 1);
    Meta.setMax('maxCombo', S.maxCombo);
    const got = Meta.check();
    if (got.length) setTimeout(() => toast('🏅 ' + got[0].a.name + ' 升到「' + got[0].label + '」阶'), 1000);
    if ($('mode-over-title')) $('mode-over-title').textContent = (MODES[mode] || {}).name + ' 结束';
    if ($('mode-over-score')) $('mode-over-score').textContent = '0';
    if ($('mode-over-best')) $('mode-over-best').textContent = r.best;
    if ($('mode-over-coins')) $('mode-over-coins').textContent = '+' + coins;
    if ($('mode-over-record')) $('mode-over-record').style.display = r.isNew ? 'inline-flex' : 'none';
    await waitForEffects();
    if ($('mode-over')) $('mode-over').style.display = 'flex';
    setTimeout(() => countUp($('mode-over-score'), S.score, 620), 30);
    S.mode = 'main';
  }

  // ---------- 成就墙 ----------
  // 每枚成就升一阶就有一份金币奖励（铜 50 / 银 100 / 金 150 / 彩 200），
  // 没领的阶会在成就行右上角、以及主页「🏅 成就」键右上角亮小红点
  const ACH_TIER_NAME = ['灰', '铜', '银', '金', '彩'];
  let achDetail = { id: '', tier: 1 };

  // 彩阶标题图标：把 emoji 的「形状」用彩虹渐变填满。
  // 为什么不在 CSS 里做：彩色 emoji 是位图字形，background-clip:text / color:transparent
  // 在多数 WebView 上要么被裁成空白、要么干脆保留原色；只能自己画一遍：
  // 离屏 canvas 画 emoji → source-in 用彩虹渐变铺满 → 得到「彩虹填充的剪影」dataURL。
  const rainbowIcoCache = {};
  function rainbowEmojiData(ch) {
    if (!ch) return '';
    if (rainbowIcoCache[ch] !== undefined) return rainbowIcoCache[ch];
    let url = '';
    try {
      const S = 72;
      const cv = document.createElement('canvas');
      if (cv && cv.getContext) {
        cv.width = S;
        cv.height = S;
        const g2 = cv.getContext('2d');
        if (g2) {
          g2.clearRect(0, 0, S, S);
          g2.font = Math.round(S * 0.86) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
          g2.textAlign = 'center';
          g2.textBaseline = 'middle';
          g2.fillStyle = '#000';
          g2.fillText(ch, S / 2, S / 2 + S * 0.03);
          g2.globalCompositeOperation = 'source-in';   // 只保留 emoji 形状，颜色全部换掉
          const lg = g2.createLinearGradient(0, 0, S, S);
          lg.addColorStop(0, '#ff7a59');
          lg.addColorStop(0.26, '#ffcf4d');
          lg.addColorStop(0.52, '#5fd48a');
          lg.addColorStop(0.76, '#5c9dff');
          lg.addColorStop(1, '#c85cff');
          g2.fillStyle = lg;
          g2.fillRect(0, 0, S, S);
          url = cv.toDataURL ? (cv.toDataURL('image/png') || '') : '';
        }
      }
    } catch (e) { url = ''; }
    rainbowIcoCache[ch] = url;
    return url;
  }

  function updateAchDot() {
    const dot = $('ach-dot');
    if (!dot) return;
    let n = 0;
    try { n = Meta.pendingCount(); } catch (e) {}
    dot.style.display = n > 0 ? 'block' : 'none';
  }

  function renderAchPanel() {
    try { Meta.check(); } catch (e) {}      // 先把阶数刷新到最新
    Meta.renderAchievements($('ach-list'), (a) => openAchDetail(a.id));
    // 至少到「铜」才算解锁（灰色 = 还没开始）
    const n = Meta.ACHIEVEMENTS.filter((a) => Meta.tierOf(a.id) >= 1).length;
    if ($('ach-total')) $('ach-total').textContent = n + ' / ' + Meta.ACHIEVEMENTS.length;
    updateAchDot();
  }

  // 点某一枚成就 → 详情：当前颜色的奖杯 + 左右切已解锁的阶 + 领奖
  function openAchDetail(id) {
    const t = Meta.tierOf(id);
    if (t < 1) {
      toast('这枚成就还没解锁，先拿到「铜」杯再来');
      AudioManager.playSFX('invalid');
      return;
    }
    // 一律停在「已经解锁的最高一阶」——不记住上次看的低阶，也不因为奖已领就回落
    achDetail = { id: id, tier: t };
    renderAchDetail();
    showOverlay('ach-detail');
  }

  function renderAchDetail() {
    const a = Meta.ACHIEVEMENTS.filter((x) => x.id === achDetail.id)[0];
    if (!a) return;
    const maxTier = Math.max(1, Meta.tierOf(a.id));
    const tier = Math.min(Math.max(1, achDetail.tier), maxTier);
    achDetail.tier = tier;

    // 标题：成就图标放左边 + 名字（文字颜色随当前奖杯变化）
    // 彩阶不是「保留 emoji 原色」，而是把 emoji 的形状用彩虹渐变填满（和标题彩虹字呼应）
    if ($('ach-d-name')) {
      let icoHtml;
      if (a.iconImg) {
        icoHtml = '<img src="' + a.iconImg + '" alt="">';
      } else if (tier === 4) {
        const rb = rainbowEmojiData(a.icon);
        icoHtml = rb
          ? '<img class="ach-d-rainbow" src="' + rb + '" alt="">'
          : '<i class="ach-d-emoji">' + a.icon + '</i>';
      } else {
        icoHtml = '<i class="ach-d-emoji">' + a.icon + '</i>';
      }
      $('ach-d-name').innerHTML = '<span class="ach-d-ico">' + icoHtml + '</span><span class="ach-d-txt">' + a.name + '</span>';
    }

    // 卡片 / 整页随奖杯颜色一起换（铜棕 / 银灰 / 金黄 / 彩虹）
    const card = $('ach-d-card');
    if (card) card.className = 'ach-detail-card t' + tier;
    const dPanel = $('ach-detail');
    if (dPanel) dPanel.className = 'overlay t' + tier;

    const trophy = $('ach-trophy');
    if (trophy) trophy.className = 'ach-trophy t' + tier;

    // 奖杯下面一排小点：一共几阶、当前停在哪一阶
    const dots = $('ach-d-dots');
    if (dots) {
      dots.innerHTML = '';
      for (let i = 1; i <= maxTier; i++) {
        const d = document.createElement('i');
        d.className = 'ach-dot-i t' + i + (i === tier ? ' cur' : '');
        if (Meta.isTierClaimed(a.id, i)) d.className += ' got';
        dots.appendChild(d);
      }
    }

    if ($('ach-d-tier')) $('ach-d-tier').textContent = ACH_TIER_NAME[tier] + '杯';
    if ($('ach-d-req')) {
      $('ach-d-req').textContent = a.desc + '，达到 ' + a.tiers[tier - 1];
    }

    // 左右箭头：只有一阶时藏起来；到头了置灰
    const prev = $('ach-prev'), next = $('ach-next');
    if (prev) { prev.style.display = maxTier > 1 ? 'flex' : 'none'; prev.disabled = tier <= 1; }
    if (next) { next.style.display = maxTier > 1 ? 'flex' : 'none'; next.disabled = tier >= maxTier; }

    const btn = $('btn-ach-claim');
    if (btn) {
      const coins = Meta.tierCoin(tier);
      if (Meta.isTierClaimed(a.id, tier)) {
        btn.textContent = '已领取 ' + coins + ' 金币';
        btn.disabled = true;
        btn.className = 'btn-primary';   // 保持本阶颜色，只是置灰（CSS :disabled 变灰）
      } else {
        btn.textContent = '领取 ' + coins + ' 金币';
        btn.disabled = false;
        btn.className = 'btn-primary';
      }
    }
  }

  function stepAchDetail(dir) {
    if (!achDetail.id) return;
    const maxTier = Math.max(1, Meta.tierOf(achDetail.id));
    const to = Math.min(Math.max(1, achDetail.tier + dir), maxTier);
    if (to === achDetail.tier) return;
    achDetail.tier = to;
    AudioManager.playSFX('select');
    renderAchDetail();
  }

  // 背景左右滑 = 切换上一枚 / 下一枚成就（没解锁的成就直接跳过，可循环）
  let achBgSwipeAt = 0;
  function gotoAch(dir) {
    const list = Meta.ACHIEVEMENTS.filter((x) => {
      let t = 0;
      try { t = Meta.tierOf(x.id); } catch (e) {}
      return t >= 1;
    });
    if (!list.length) return;
    const i = list.findIndex((x) => x.id === achDetail.id);
    if (i < 0 || list.length < 2) return;
    const nx = list[(i + dir + list.length) % list.length];
    // 滑过去也停在这枚成就已解锁的最高一阶
    achDetail = { id: nx.id, tier: Math.max(1, Meta.tierOf(nx.id)) };
    AudioManager.playSFX('select');
    renderAchDetail();
  }

  function claimAchReward() {
    const r = Meta.claimTier(achDetail.id, achDetail.tier);
    if (!r.ok) {
      toast(r.reason || '现在领不了');
      AudioManager.playSFX('invalid');
      return;
    }
    AudioManager.playSFX('coin');
    toast('+' + r.coins + ' 金币');
    if ($('menu-coins')) $('menu-coins').textContent = Store.getWallet().coins;
    renderAchDetail();
    renderAchPanel();     // 顺带刷新成就行的红点 / 主页成就键的红点
  }

  // ---------- 图鉴 / 皮肤 ----------
  function renderSkinPanel() {
    Meta.renderSkins($('skin-list'), (skin, own) => {
      if (!own) { toast('星星还不够，先去多拿几颗 ⭐'); return; }
      const r = Meta.applySkin(skin.id);
      if (r.ok) {
        toast('已换上「' + skin.name + '」');
        AudioManager.playSFX('coin');
        renderSkinPanel();
      }
    });
    if ($('skin-stars')) $('skin-stars').textContent = Store.totalStars();
  }

  // ---------- 签到入口：日期条 + 签到 + 转盘 ----------
  // 日期条：今天固定在中间，两边各显示 4 天（共 9 天）；每天标注当日金币奖励；
  // 左右滑动看全部；签到了 = 绿色 ✓，今天 = 虚线框，漏签 = 红色（点击弹补签窗口）
  function renderWelfare() {
    const info = Meta.signInfo();
    const dayBox = $('welfare-sign');
    if (dayBox) {
      dayBox.innerHTML = '';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      // 签到起始日 = 用户注册（建号）那天：这一天起没签的变红「补签」，之前的日子不算漏签
      let start = null;
      try { start = Store.signStart ? Store.signStart() : Store.signCycleStart(); } catch (e) {}
      if (!start) start = new Date(today);
      const fmt = (d) => (d.getMonth() + 1) + '/' + d.getDate();
      const week = ['日', '一', '二', '三', '四', '五', '六'];
      // 已签判断用「跨轮保留的全部签约记录」，避免 7 天一轮翻新后旧签到被当成漏签
      const dates = (info.all && info.all.length) ? info.all : (info.dates || []);
      for (let off = -4; off <= 4; off++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + off);
        const k = Store.todayKey(d);
        const isFuture = d > today;
        const isToday = off === 0;
        const signed = dates.indexOf(k) >= 0;
        // 注册之前的日子：灰色、日期下面一条杠，不算漏签也不能点
        const isBefore = d < start;
        // 漏签：注册那天到现在之间、今天之前、还没签（注册之前的日子不算漏签）
        const missed = !signed && !isFuture && !isBefore && d >= start;

        // 每天的奖励：按本轮周期日取（越界就按 7 天一轮回取），全部日子都标出金币数
        let reward = null;
        if (info.rewards && info.rewards.length) {
          const diff = Math.round((d - start) / 86400000);
          const idx = ((diff % info.rewards.length) + info.rewards.length) % info.rewards.length;
          reward = info.rewards[idx] || info.rewards[0];
        }

        const cell = document.createElement('div');
        cell.className = 'sign-day' +
          (isBefore ? ' before' : '') +
          (signed ? ' signed' : '') +
          (isToday ? ' today' : '') +
          (missed ? ' missed' : '') +
          (isFuture ? ' future' : '');
        cell.innerHTML = '<i>' + week[d.getDay()] + ' ' + fmt(d) + '</i>' +
          '<b>' + (isBefore ? '—' : (signed ? '✓' : (missed ? '补签' : (reward ? (reward.item ? '🌈' : reward.coins) : '—')))) + '</b>';
        if (missed) {
          cell.addEventListener('click', () => openMakeupPanel(d, k));
        }
        dayBox.appendChild(cell);
      }
      // 滑动定位：今天那一格永远居中（两边各正好露出 4 天）。
      // 面板刚渲染时可能还没显示（clientWidth=0），放到下一帧等布局完成再定位；
      // 用 getBoundingClientRect 算相对位置，不受 offsetParent 影响
      centerSignToday();
    }
    const btn = $('btn-welfare-signin');
    if (btn) {
      btn.disabled = info.signedToday;
      btn.textContent = info.signedToday ? '今天已签到' : '签到领金币';
    }
    const w = Meta.wheelState();
    const wb = $('btn-wheel');
    if (wb) wb.disabled = w.used;
    if ($('wheel-result') && w.used) $('wheel-result').textContent = '今日已抽到：' + (w.result || '—');
    if (wb && !w.used) $('wheel-result') && ($('wheel-result').textContent = '每天可以转一次');
    // 签到键上面：连续签到天数（黑色）
    const st2 = Meta.signStats();
    const stEl = $('welfare-streak');
    if (stEl) stEl.textContent = '连续签到 ' + st2.streak + ' 天';
  }

  // 今天那一格永远居中：每次进签到入口、补签弹窗关掉后都重新定位
  function centerSignToday() {
    const dayBox = $('welfare-sign');
    if (!dayBox) return;
    const put = () => {
      const tc = dayBox.querySelector('.sign-day.today');
      if (!tc || !dayBox.clientWidth) return;
      const b = dayBox.getBoundingClientRect();
      const c = tc.getBoundingClientRect();
      const delta = (c.left + c.width / 2) - (b.left + b.width / 2);
      if (Math.abs(delta) > 0.5) dayBox.scrollLeft += delta;
    };
    requestAnimationFrame(() => { put(); setTimeout(put, 60); });
  }

  // 点红色漏签日 → 先弹补签窗口（显示费用、说明不发奖励），点「补签」再弹确认窗口
  function openMakeupPanel(d, k) {
    const box = $('makeup-menu');
    if (!box) return;
    if ($('makeup-menu-text')) $('makeup-menu-text').innerHTML =
      '补签 <b>' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日</b>';
    if ($('makeup-menu-cost')) $('makeup-menu-cost').innerHTML =
      '花费 <b>' + (Store.MAKEUP_COST || 50) + '</b> 金币 · <b>不发</b>当日奖励';
    box.dataset.date = k;
    box.style.display = 'flex';
  }

  // 补签窗口里点「补签」→ 二次确认
  function openMakeupConfirm() {
    const menu = $('makeup-menu');
    const box = $('makeup-confirm');
    const txt = $('makeup-confirm-text');
    const k = menu ? menu.dataset.date : '';
    if (menu) menu.style.display = 'none';
    if (!box) return;
    if (txt) txt.innerHTML = '确定花 <b>' + (Store.MAKEUP_COST || 50) + ' 金币</b> 补签这一天吗？' +
      '<br>补签只补连续天数，<b>不发</b>当日奖励。';
    box.dataset.date = k;
    box.style.display = 'flex';
  }

  function doSignIn() {
    const r = Meta.signIn();
    if (r.ok) {
      toast('签到成功：+' + r.reward.coins + ' 金币' + (r.reward.item ? ' +彩虹道具' : ''));
      // 连续签到每满 7 天（7/14/21/28…）：额外 200 金币发到邮箱
      if (r.milestone && typeof Mail !== 'undefined' && Mail.sendMail) {
        try {
          const id = 'signin-milestone-' + r.streak;
          if (!Mail.get(id)) {
            Mail.sendMail({
              id: id,
              at: stampNow(),
              icon: '🎉',
              title: '恭喜连续签到 ' + r.streak + ' 天',
              from: '系统',
              body: '🎉恭喜连续签到 ' + r.streak + ' 天，赠送 ' + r.milestone + ' 金币！\n请前往邮箱领取。\n\n点下面的「领取」直接进钱包，明天继续加油～',
              coins: r.milestone
            });
          }
        } catch (e) {}
        setTimeout(() => toast('🎉恭喜连续签到 ' + r.streak + ' 天，赠送 ' + r.milestone + ' 金币！\n请前往邮箱领取'), 400);
      }
      AudioManager.playSFX('coin');
      renderWelfare();
      refreshMenu();
    } else {
      toast('今天已经签过了');
    }
  }

  function doMakeup(dateKey) {
    const r = Meta.makeup(dateKey);
    if (!r.ok) {
      if (r.reason === 'poor') toast('金币不够：补签 1 天需要 ' + (Store.MAKEUP_COST || 300) + ' 金币');
      else if (r.reason === 'full') toast('本轮 7 天已经签满啦');
      else toast('没有可以补签的日子');
      return;
    }
    toast('补签成功：连续签到 ' + r.day + ' 天');
    AudioManager.playSFX('coin');
    renderWelfare();
    updateHUD();
  }

  function doWheel() {
    const r = Meta.spin();
    if (!r.ok) { toast('今天已经转过啦'); return; }
    const el = $('wheel-result');
    const box = $('wheel-box');
    if (box) {
      box.classList.add('spinning');
      setTimeout(() => box.classList.remove('spinning'), 900);
    }
    if (el) {
      el.textContent = '转盘转起来…';
      setTimeout(() => { el.textContent = '🎉 抽到：' + r.prize.label; }, 900);
    }
    AudioManager.playSFX('coin');
    renderWelfare();
    refreshMenu();
    Meta.check();
  }

  // ---------- 排行榜：总榜 / 省榜 / 局榜 ----------
  // 我每一关的历史最高分（局榜就是用这张表排名）
  function myLevelMap() {
    const all = Store.getProgress();
    const out = {};
    Object.keys(all).forEach((k) => {
      const lv = Number(k);
      const s = (all[k] && all[k].score) || 0;
      if (lv >= 1 && s > 0) out[String(lv)] = s;
    });
    return out;
  }

  // 我的每关星级（只记通关过的关）
  function myStarMap() {
    const all = Store.getProgress();
    const out = {};
    Object.keys(all).forEach((k) => {
      const lv = Number(k);
      const st = (all[k] && all[k].stars) || 0;
      if (lv >= 1 && st > 0) out[String(lv)] = Math.min(3, st);
    });
    return out;
  }

  // 这一关的目标分（只有分数关才有）：老榜单没带星级时，用它反推「有没有通关」
  function levelTargetScore(lv) {
    try {
      const def = getLevelDef(lv);
      const g = def && def.goal;
      if (g && g.type === 'score' && g.target > 0) return g.target;
    } catch (e) {}
    return 0;
  }

  // 老榜单数据没带星级：按这一关的分数门槛反推（3 星 / 2 星 / 1 星达标线）
  function starsFromScore(level, score) {
    if (!(score > 0)) return 0;
    try {
      const def = getLevelDef(level);
      const th = (def && def.stars) || [];
      const s1 = th[0] || 1;
      const s2 = th[1] || s1 * 1.4;
      const s3 = th[2] || s1 * 1.9;
      if (score >= s3) return 3;
      if (score >= s2) return 2;
      if (score >= s1) return 1;
      return 0;      // 分数没到一星线 = 这局没通关
    } catch (e) { return 0; }
  }

  // 某一关的星星：优先用对方自己公布的星级，没有就反推
  // st 是整张星级表（只记通关过的关），所以有表却查不到这一关 = 这关没通关，不能拿分数反推
  function starsOf(entry, level) {
    const key = String(level);
    const st = entry && entry.st;
    if (st && typeof st === 'object' && Object.keys(st).length) {
      return Math.min(3, Math.max(0, Math.round(Number(st[key]) || 0)));
    }
    const lv = entry && entry.lv;
    return starsFromScore(level, lv ? lv[key] : 0);
  }

  // 这一关算不算「通关了」（局榜排名只看这个，不看分数线）：
  // 手上有整张星级表的以表为准（表里查不到这一关 = 没通关）；
  // 老数据没有表——分数关按目标分算，其他玩法只能按一星线近似
  function hasStarMap(entry) {
    const st = entry && entry.st;
    return !!(st && typeof st === 'object' && Object.keys(st).length);
  }
  function entryPassed(entry, lv, stars) {
    const st = (stars == null) ? starsOf(entry, lv) : stars;
    if (hasStarMap(entry)) return st > 0;
    const target = levelTargetScore(lv);
    const score = (entry && entry.lv && entry.lv[String(lv)]) || 0;
    if (target > 0) return score >= target;
    return st > 0;
  }

  // 总星数：优先把对方公布的每关星级加起来，没有就按分数反推
  function totalStarsOf(entry) {
    let n = 0;
    const st = (entry && entry.st) || {};
    Object.keys(st).forEach((k) => { n += Math.min(3, st[k] || 0); });
    if (n > 0) return n;
    const lv = (entry && entry.lv) || {};
    Object.keys(lv).forEach((k) => { n += starsFromScore(Number(k), lv[k]); });
    return n;
  }

  function myBestEntry() {
    const all = Store.getProgress();
    let best = { score: 0, level: 0 };
    Object.keys(all).forEach((k) => {
      // 没过关的那一局不计入总分，也不拿它当「最高单关」（星数是 0 就是没通关）
      if (!(all[k] && all[k].stars > 0)) return;
      const s = all[k].score || 0;
      if (s > best.score) best = { score: s, level: Number(k) || 0 };
    });
    const lv = myLevelMap();
    // 总分 = 已通关关卡的最高分之和（没过关的分数不加；每关失败重打都不会把总分刷高）
    const total = Object.keys(all).reduce((n, k) => {
      const r = all[k];
      return n + (r && r.stars > 0 ? (r.score || 0) : 0);
    }, 0);
    return {
      uid: Meta.myUid(), name: Meta.nickname(),
      score: Math.max(best.score, total), level: best.level,
      ts: Date.now(), pv: myProvCode(), lv: lv, st: myStarMap(), me: true
    };
  }

  // 排行榜：先选榜单（总榜 / 省榜 / 局榜），再进列表
  let lbTab = 'all';        // 'all' 总榜 | 'prov' 省榜 | 'level' 局榜
  let lbProv = '';          // 省榜当前选中的省份代码
  let lbLevel = 1;          // 局榜当前选中的关卡

  // 局榜只能看本账号已解锁的关卡（进度是按账号存的，切号后上限也跟着变）
  function unlockedLbMax() {
    const max = maxMainLevel();
    let u = max;
    try { u = Store.maxUnlockedLevel(max); } catch (e) { u = max; }
    return Math.max(1, Math.min(u, max));
  }
  function clampLbLevel(lv) {
    return Math.max(1, Math.min(lv || 1, unlockedLbMax()));
  }

  // 自己所在的省（定位成功才有；拿不到就空，省榜里归「未定位」）
  function myProvCode() {
    try {
      const geo = Store.getNet().geo;
      const p = matchProvince(geo && geo.region);
      return p ? p.code : '';
    } catch (e) { return ''; }
  }

  // 每一关的榜单：全网 + 本机好友 + 自己，同一个人只留一条（取最高）
  function levelRows(lv) {
    const key = String(lv);
    const mine = Meta.myUid();
    const map = {};
    const push = (uid, name, sc, ts, pv, stars, passed) => {
      if (!uid || !(sc > 0)) return;
      const cur = map[uid];
      if (!cur) {
        map[uid] = {
          uid: uid, name: name || '玩家', score: sc, ts: ts || 0,
          pv: pv || '', stars: stars || 0, pass: !!passed
        };
        return;
      }
      if (sc > cur.score) cur.score = sc;   // 星只取最大值，别被低星盖掉
      if ((ts || 0) >= (cur.ts || 0)) { cur.name = name || cur.name; cur.ts = ts || 0; }
      if (!cur.pv && pv) cur.pv = pv;
      if ((stars || 0) > (cur.stars || 0)) cur.stars = stars || 0;
      if (passed) cur.pass = true;          // 有一条成绩说他通关了就算通关
    };
    if (typeof Board !== 'undefined') {
      Board.list().forEach((e) => {
        if (!e.lv) return;
        const st = starsOf(e, lv);
        push(e.uid, e.name, e.lv[key], e.ts, e.pv, st, entryPassed(e, lv, st));
      });
    }
    Meta.friends().forEach((f) => {
      if (!f.lv) return;
      const st = starsOf(f, lv);
      push(f.uid, f.name, f.lv[key], f.ts, f.pv, st, entryPassed(f, lv, st));
    });
    // 自己：星级直接按本机进度取（进度表里没这一关 = 没过），别拿失败局的分数反推
    const myStars = myStarMap()[key] || 0;
    push(mine, Meta.nickname(), myLevelMap()[key], Date.now(), myProvCode(), myStars, myStars > 0);
    return Object.keys(map).map((k) => {
      const r = map[k];
      r.me = r.uid === mine;
      // 局榜以「这一关有没有通关」为准：没通关的分数再高也不进排名
      if (typeof r.pass !== 'boolean') r.pass = (r.stars || 0) > 0;
      return r;
    }).sort((a, b) => b.score - a.score);
  }

  // 我在这一局排第几（1 起；没通关这一关就不参与排名，返回 0）
  function levelRank(lv) {
    const mine = Meta.myUid();
    const rows = levelRows(lv);
    const meRow = rows.filter((r) => r.uid === mine)[0];
    if (!meRow || !meRow.pass) return 0;
    // 名次只在「通关了这一关」的玩家里算，没通关的挂在榜上但不占名次
    const passed = rows.filter((r) => r.pass);
    for (let i = 0; i < passed.length; i++) if (passed[i].uid === mine) return i + 1;
    return 0;
  }

  // 前三名奖牌：只要自己在这一局有成绩，哪怕榜上只有自己一个人也算名次
  function medalForLevel(lv) {
    const r = levelRank(lv);
    if (!r || r > 3) return '';
    return ['🥇', '🥈', '🥉'][r - 1];
  }

  let lbOpenRow = null;

  function closeLbOpenRow(except) {
    if (lbOpenRow && lbOpenRow !== except) {
      const inner = lbOpenRow.querySelector('.lb-swipe');
      if (inner) inner.style.transform = 'translateX(0)';
      lbOpenRow.classList.remove('open');
      lbOpenRow = null;
    }
  }

  // 好友行左滑露出「删除」：按住往左拖，松手吸附
  function bindLbSwipe(row, inner) {
    const W = 68;
    let startX = 0, dx = 0, base = 0, dragging = false;
    const setX = (v) => { inner.style.transform = 'translateX(' + v + 'px)'; };
    row.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.classList && e.target.classList.contains('lb-del')) return;
      startX = e.clientX;
      dx = 0;
      base = row.classList.contains('open') ? -W : 0;
      dragging = true;
      inner.style.transition = 'none';
      try { row.setPointerCapture(e.pointerId); } catch (err) {}
    });
    row.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dx = e.clientX - startX;
      let v = base + dx;
      if (v > 0) v = 0;
      if (v < -W) v = -W;
      setX(v);
    });
    const finish = () => {
      if (!dragging) return;
      dragging = false;
      inner.style.transition = 'transform 0.18s ease';
      const open = (base + dx) < -W / 2;
      if (open) {
        closeLbOpenRow(row);
        row.classList.add('open');
        lbOpenRow = row;
        setX(-W);
      } else {
        row.classList.remove('open');
        if (lbOpenRow === row) lbOpenRow = null;
        setX(0);
      }
    };
    row.addEventListener('pointerup', finish);
    row.addEventListener('pointercancel', finish);
  }

  // ⇄ 弹出的选择面板：列出全部省份 / 关卡，点一个直接切换
  function hideLbPicker() {
    const pk = $('lb-picker');
    if (pk) pk.style.display = 'none';
  }

  function toggleLbPicker(kind) {
    const pk = $('lb-picker');
    if (!pk) return;
    // 再点一次同一个 ⇄ 收起
    if (pk.style.display && pk.style.display !== 'none' && pk.dataset.kind === kind) {
      pk.style.display = 'none';
      return;
    }
    pk.dataset.kind = kind;
    pk.innerHTML = '';
    const mk = (label, val, cur) => {
      const b = document.createElement('button');
      b.className = 'pk-item' + (cur ? ' cur' : '');
      b.textContent = label;
      b.addEventListener('click', () => {
        if (kind === 'prov') lbProv = val;
        else lbLevel = val;
        hideLbPicker();
        renderLeaderboard();
      });
      pk.appendChild(b);
    };
    if (kind === 'prov') {
      PROVINCES.forEach((p) => mk(p[0], p[1], p[1] === lbProv));
    } else {
      // 只列这个账号已经解锁的关卡（没解锁的关还没打过，列出来也是空榜）
      const maxLv = unlockedLbMax();
      for (let i = 1; i <= maxLv; i++) mk('第 ' + i + ' 关', i, i === lbLevel);
    }
    pk.style.display = 'grid';
  }

  function renderLeaderboard() {
    const box = $('lb-list');
    if (!box) return;
    const me = myBestEntry();

    // 省榜 / 局榜的 ⇄ 更换符号显隐（总榜没有）；榜单类型由入口决定
    if (lbTab === 'prov' && !lbProv) lbProv = myProvCode() || PROVINCES[0][1];
    // 关卡上限跟着账号解锁进度走，超出的自动夹回来
    if (lbTab === 'level') lbLevel = clampLbLevel(lbLevel);
    const provSwapBtn = $('lb-prov-swap');
    if (provSwapBtn) provSwapBtn.style.display = lbTab === 'prov' ? 'inline-block' : 'none';
    const lvSwapBtn = $('lb-level-swap');
    if (lvSwapBtn) lvSwapBtn.style.display = lbTab === 'level' ? 'inline-block' : 'none';
    const titleEl = $('lb-view-title');
    if (titleEl) {
      const provName = (provByCode(lbProv) || {}).name || '省榜';
      titleEl.textContent = lbTab === 'level'
        ? '🎯 局榜 · 第 ' + lbLevel + ' 关'
        : lbTab === 'prov'
          ? '🗺️ 省榜 · ' + provName
          : '🏆 总榜';
    }

    // 总榜：三份数据合并（全网 + 本机好友 + 自己），同 uid 只留一条
    const friendUids = {};
    Meta.friends().forEach((f) => { friendUids[f.uid] = true; });
    const raw = [];
    if (typeof Board !== 'undefined') raw.push.apply(raw, Board.list());
    Meta.friends().forEach((f) => raw.push({ uid: f.uid, name: f.name, score: f.score, ts: f.ts, pv: f.pv }));
    raw.push(me);

    const byId = {};
    raw.forEach((r) => {
      if (!r || !r.uid) return;
      // 0 分的（还没通关过）不占榜位
      if (!(r.score > 0) && r.uid !== me.uid) return;
      const stars = totalStarsOf(r);
      const cur = byId[r.uid];
      if (!cur) {
        byId[r.uid] = { uid: r.uid, name: r.name, score: r.score || 0, ts: r.ts || 0, pv: r.pv || '', stars: stars };
        return;
      }
      if ((r.ts || 0) >= (cur.ts || 0)) { cur.name = r.name; if (r.pv) cur.pv = r.pv; }
      if ((r.score || 0) > cur.score) cur.score = r.score;
      if (stars > (cur.stars || 0)) cur.stars = stars;
    });
    byId[me.uid] = {
      uid: me.uid, name: Meta.nickname(), score: me.score, ts: Date.now(),
      pv: myProvCode(),
      stars: Math.max(totalStarsOf(me), (byId[me.uid] && byId[me.uid].stars) || 0)
    };

    const totalRows = Object.keys(byId).map((k) => {
      const r = byId[k];
      return {
        uid: r.uid, name: r.name, score: r.score, pv: r.pv || '',
        stars: r.stars || 0,
        me: r.uid === me.uid,
        friend: !!friendUids[r.uid] && r.uid !== me.uid
      };
    }).sort((a, b) => b.score - a.score);

    // 省榜：只显示所选省份的玩家；局榜：只看这一关的最高分
    let shown;
    if (lbTab === 'level') {
      // 局榜以「这一关有没有通关」为准：通关的（星星 > 0）按分数排名，
      // 没通关的灰显垫底、名次写「—」（分数照常显示，不参与排名）
      shown = levelRows(lbLevel).map((r) => Object.assign({ friend: false }, r));
      shown.sort((a, b) => ((b.pass ? 1 : 0) - (a.pass ? 1 : 0)) || (b.score - a.score));
    } else if (lbTab === 'prov') {
      shown = totalRows.filter((r) => r.pv === lbProv);
    } else {
      shown = totalRows;
    }

    box.innerHTML = '';
    lbOpenRow = null;
    shown.slice(0, 20).forEach((r, i) => {
      const row = document.createElement('div');
      // 0 分不上榜：整行灰显（名次留空、分数位置写「未上榜」）
      const onBoard = (r.score || 0) > 0;
      // 局榜：这一关没通关 → 一样灰显、不参与排名（名次「—」，分数照常显示）
      const noRank = lbTab === 'level' && r.pass === false;
      const ranked = onBoard && !noRank;
      row.className = 'lb-row' + (r.me ? ' me' : '') + (ranked ? '' : ' none');
      const inner = document.createElement('div');
      inner.className = 'lb-swipe col4';
      const rank = !ranked ? '—' : (i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1));
      // 分数左边带星星：局榜是这一局的星（最多 3 颗），总榜 / 省榜是总星数
      const stars = Math.max(0, r.stars || 0);
      // 星星占固定一格：局榜是「★★★」，总榜 / 省榜是「★ 87」（图标 + 右对齐数字），
      // 这样不管几颗星、几位数，一列看下去都齐齐的
      const starHtml = stars <= 0
        ? '<span class="lb-stars"></span>'
        : (lbTab === 'level'
          ? '<span class="lb-stars">' + '★'.repeat(stars) + '</span>'
          : '<span class="lb-stars"><i class="lb-star-ico">★</i><b>' + stars + '</b></span>');
      inner.innerHTML = '<span class="lb-rank">' + rank + '</span>' +
        '<span class="lb-name">' + escHtml(String(r.name || '玩家').slice(0, 8)) +
        (r.me ? '<i class="lb-me">我</i>' : r.friend ? '<i>好友</i>' : '') + '</span>' +
        starHtml +
        '<span class="lb-score' + (onBoard ? '' : ' none') + '">' + (onBoard ? r.score : '未上榜') + '</span>';
      row.appendChild(inner);
      if (r.friend) {
        const del = document.createElement('button');
        del.className = 'lb-del';
        del.textContent = '删除';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          Meta.removeFriend(r.uid);
          toast('已删除好友 ' + r.name);
          AudioManager.playSFX('invalid');
          renderLeaderboard();
        });
        row.appendChild(del);
        bindLbSwipe(row, inner);
      }
      box.appendChild(row);
    });
    if (!shown.length) {
      const d = document.createElement('div');
      d.className = 'lb-empty';
      d.textContent = lbTab === 'level'
        ? '这一局还没有人上榜，打完这一关就是第一名'
        : lbTab === 'prov'
          ? '该省还没有上榜成绩（可能对方没定位到省）'
          : '还没有成绩，通关一局就会自动上榜';
      box.appendChild(d);
    }
  }

  // 自己的成绩变了就立刻发到榜上（最快 6 秒一次，节流在 Board 里做）
  // 还没打过分的（0 分）先不上榜，免得榜里全是 0 分的空名字
  function publishMyScore(force) {
    if (typeof Board === 'undefined') return;
    if (typeof Account !== 'undefined' && !Account.loggedIn()) return;
    const me = myBestEntry();
    if (!(me.score > 0)) return;
    try { Board.publish(me, force); } catch (e) {}
  }

  function recordMyScore() { publishMyScore(); }

  // 名字已被谁占用：全网榜 + 本机好友（自己的除外）
  function takenNickNames() {
    const mine = Meta.myUid();
    const taken = [];
    if (typeof Board !== 'undefined') {
      // 只有「服务器身份码 p…」的榜上名字才算被占用（对应真正在服务器注册过的号）；
      // 本机码 u… 的成绩是临时的，玩家换设备/清缓存就换码，不能把人家的原名永远锁死
      Board.list().forEach((e) => {
        if (e.uid !== mine && /^p[0-9a-f]{8,}$/i.test(String(e.uid || ''))) taken.push(e.name);
      });
    }
    Meta.friends().forEach((f) => { taken.push(f.name); });
    return taken;
  }

  let nickGateCb = null;
  let nickForced = false;

  // 昵称还是默认的「奶龙玩家」？这种情况必须改名才能继续（窗口不可关闭）
  function needForcedRename() {
    try {
      const acc = (typeof Account !== 'undefined' && Account.current) ? Account.current() : null;
      if (acc && String(acc.name || '').trim() === '奶龙玩家') return true;
    } catch (e) {}
    try {
      return !!(global.Meta && Meta.isDefaultNick && Meta.isDefaultNick());
    } catch (e) { return false; }
  }

  // 打开改名面板：forced=true 是「默认昵称不能玩」的强制闸（只有「确定」，没有返回），
  // forced=false 是从主页键里主动改（底部有「返回」）；cb 是改名成功后的回调（比如回到存服务器窗口）
  function openNickMenu(forced, cb) {
    nickForced = !!forced;
    nickGateCb = typeof cb === 'function' ? cb : null;
    const title = $('nick-title');
    if (title) title.textContent = forced ? '✏️ 先起个昵称' : '✏️ 修改昵称';
    const cancel = $('btn-nick-cancel');
    if (cancel) {
      cancel.textContent = '返回';
      cancel.style.display = forced ? 'none' : 'block';
    }
    const err = $('nick-err');
    if (err) err.textContent = '';
    const hint = $('nick-hint') || ($('nick-menu') && $('nick-menu').querySelector('.history-hint'));
    if (hint) {
      // 两行显示：规则一行，「不能和别人重名」另起一行
      hint.innerHTML = forced
        ? '「奶龙玩家」是默认昵称，不能直接用<br>1~8 个字符，特殊符号只能用 - . _'
        : '1~8 个字符（一个字母或符号都算一个）<br>中文 / 字母 / 数字，特殊符号只能用 . - _，不能重名';
    }
    // 强制改名时输入框一律留空：预填旧名字会让人以为点一下就过了
    if ($('nick-input')) $('nick-input').value = forced ? '' : (Meta.isDefaultNick() ? '' : Meta.nickname());
    showOverlay('nick-menu');
    if ($('nick-input') && $('nick-input').focus) setTimeout(() => $('nick-input').focus(), 60);
  }

  // 保存昵称（名字就是账号名，改完账号表一起更新）
  function saveNickFrom(v, force) {
    let r;
    if (typeof Account !== 'undefined' && Account.loggedIn()) {
      r = Account.rename(v);
    } else {
      r = Meta.validateNick(v, takenNickNames());
      if (r.ok) Meta.setNickname(r.name);
    }
    if (!r.ok) {
      toast(r.reason);
      AudioManager.playSFX('invalid');
      return r;
    }
    toast('昵称已改为「' + r.name + '」');
    // 改名立刻同步到榜上（别人开着排行榜会实时看到新昵称）
    publishMyScore(true);
    renderLeaderboard();
    refreshMenu();
    return r;
  }

  function saveNick() {
    const r = saveNickFrom($('nick-input') ? $('nick-input').value : '', true);
    const err = $('nick-err');
    if (!r.ok) {
      if (err) err.textContent = r.reason || '';
      return;
    }
    if (err) err.textContent = '';
    $('nick-menu').style.display = 'none';
    nickForced = false;
    const cb = nickGateCb; nickGateCb = null;
    if (cb) { cb(); return; }
    // 名字改好了，但可能还缺密码 → 接着补密码，别直接放去玩
    let need = null;
    try { need = Account.needsFix(); } catch (e) {}
    if (need && need.any) { openFixMenu(need); return; }
    showOverlay('main-menu');
    setTimeout(() => { try { maybeCloudOffer(); } catch (e) {} }, 200);
  }

  function cancelNick() {
    if (nickForced) return;           // 强制闸不给关
    nickGateCb = null;
    $('nick-menu').style.display = 'none';
    showOverlay('main-menu');
  }

  // ==================== 账号：登录 / 注册 / 切换 / 补全资料 ====================
  let authMode = 'login';

  function accountOk() {
    return typeof Account !== 'undefined' && Account.loggedIn();
  }

  function setInputError(ids, on) {
    ids.forEach((id) => {
      const el = $(id);
      if (!el) return;
      if (el.classList && el.classList.toggle) el.classList.toggle('error', !!on);
    });
  }

  function setAuthError(msg) {
    setInputError(['auth-name', 'auth-pass'], !!msg);
    const err = $('auth-err');
    if (err) err.textContent = msg || '';
  }

  function setPassError(msg, ids) {
    setInputError(ids || ['pass-old', 'pass-new', 'pass-new2'], !!msg);
    const err = $('pass-err');
    if (err) err.textContent = msg || '';
  }

  // 登录页：本机已有的账号可以直接点进去
  function renderAuthAccounts() {
    const box = $('auth-accounts');
    if (!box) return;
    box.innerHTML = '';
    if (!accountOk() && typeof Account === 'undefined') return;
    const others = Account.list().filter((a) => a.name);
    if (!others.length) return;
    const tip = document.createElement('p');    tip.className = 'history-hint';
    tip.textContent = '本机账号';
    box.appendChild(tip);
    others.forEach((a) => {
      const sum = Account.summary(a);
      const row = document.createElement('div');
      row.className = 'acct-row';
      row.innerHTML = '<span class="acct-main"><b>' + escHtml(a.name) + '</b>' +
        '<i>🪙 ' + sum.coins + ' · ⭐ ' + sum.stars + '</i></span>' +
        '<span class="acct-mark">进入</span>';
      row.addEventListener('click', () => {
        if (a.pass) {
          // 有密码：跳到登录页并填好名字，输密码就能进
          openAuthForm('login');
          const n = $('auth-name');
          if (n) n.value = a.name;
          const p = $('auth-pass');
          if (p && p.focus) setTimeout(() => p.focus(), 80);
          setAuthError('');
          return;
        }
        const r = Account.login(a.name, '');   // 没密码的老号：直接进，进去后强制补密码
        if (r.ok) { afterAuthEnter(); return; }
        openAuthForm('login');
        const n = $('auth-name');
        if (n) n.value = a.name;
        setAuthError(r.reason || '');
      });
      box.appendChild(row);
    });
  }

  function showAuthScreen() {
    AudioManager.gateBGM(false);     // 登录页不放背景音乐
    const f = $('auth-form');
    if (f) f.style.display = 'none';
    const fix = $('fix-menu');
    if (fix) fix.style.display = 'none';
    const bk = $('backup-menu');
    if (bk) bk.style.display = 'none';
    const bki = $('backup-import-menu');
    if (bki) bki.style.display = 'none';
    setAuthError('');
    renderAuthAccounts();
    showOverlay('auth-menu');
    setView('menu');
  }

  // ==================== 登录页 / 云存档页都可以关掉 ====================
  // 关掉登录页 = 当游客玩（进度只存这台设备，不上榜、不跨设备同步）；
  // 记一个标记，下次启动直接进主页，不再被拦在登录页。登录成功后自动清掉。
  const AUTH_SKIP_KEY = 'nl2:authSkip';
  function authSkipped() {
    try { return !!localStorage.getItem(AUTH_SKIP_KEY); } catch (e) { return false; }
  }
  function clearAuthSkip() {
    try { localStorage.removeItem(AUTH_SKIP_KEY); } catch (e) {}
  }
  function skipAuth() {
    const menu = $('auth-menu');
    if (menu) menu.style.display = 'none';
    const form = $('auth-form');
    if (form) form.style.display = 'none';
    const fix = $('fix-menu');
    if (fix) fix.style.display = 'none';
    const bk = $('backup-menu');
    if (bk) bk.style.display = 'none';
    const bki = $('backup-import-menu');
    if (bki) bki.style.display = 'none';
    try { localStorage.setItem(AUTH_SKIP_KEY, String(Date.now())); } catch (e) {}
    AudioManager.gateBGM(true);        // 游客也要有背景音乐
    try { AudioManager.unlock(); } catch (e) {}
    showOverlay('main-menu');
    refreshMenu();
    toast('未登录：进度只存这台设备、不上排行榜，随时可在 设置 → 账号安全 登录');
  }

  function openAuthForm(mode) {
    authMode = mode === 'register' ? 'register' : 'login';
    AudioManager.gateBGM(false);     // 登录 / 注册页不放背景音乐
    $('auth-menu').style.display = 'none';
    const t = $('auth-form-title');
    if (t) t.textContent = authMode === 'register' ? '注册新账号' : '登录';
    const sub = $('btn-auth-submit');
    if (sub) sub.textContent = authMode === 'register' ? '注册并进入' : '登录';
    const tip = $('auth-tip');
    if (tip) {
      tip.innerHTML = authMode === 'register'
        ? '1~8 个字符，特殊符号只能用 - . _<br>密码 4~24 位，不能有空格'
        : '';
    }
    ['auth-name', 'auth-pass'].forEach((id) => {
      const el = $(id);
      if (el) el.value = '';
    });
    setAuthError('');
    showOverlay('auth-form');
    setView('menu');
    const n = $('auth-name');
    if (n && n.focus) setTimeout(() => n.focus(), 60);
  }

  // 找回账号 / 忘记密码：本机有就重设密码，本机没有但榜上有就用榜上身份建号
  async function submitAuth() {
    const name = ($('auth-name') || {}).value || '';
    const pass = ($('auth-pass') || {}).value || '';
    const fail = (m) => {
      setAuthError(m);
      try { AudioManager.playSFX('invalid'); } catch (e) {}
      return false;
    };
    if (!String(name).trim()) return fail('请填写名字');
    if (!String(pass)) return fail('请填写密码');
    if (typeof Account === 'undefined') return fail('账号功能没加载出来，请刷新页面');

    if (authMode === 'register') {
      const r = Account.register(name, pass);
      if (!r.ok) return fail(r.reason);
      afterAuthEnter(r.taken
        ? '找回没设密码的账号「' + r.account.name + '」，进度都在，密码已设置'
        : '注册成功，欢迎「' + r.account.name + '」');
      // 新号和榜上一条「本机码旧成绩」同名：多半是换了链接 / 换了设备的老玩家
      // （存档按网址隔离，这边是空的）。提示用存档码把原进度搬过来。
      if (!r.taken && typeof Board !== 'undefined' && Board.list) {
        try {
          const ghost = Board.list().some((e) => e && e.name === r.account.name &&
            /^u[0-9a-z]+$/i.test(String(e.uid || '')) && (e.score || 0) > 0);
          if (ghost) setTimeout(() => {
            toast('榜上有同名的旧成绩：如果你以前在别的链接玩，回原来的链接 → 设置 → 账号安全 → 生成存档码，再在这边登录页「导入存档码」即可搬回进度');
          }, 1200);
        } catch (e) {}
      }
    } else {
      const r = Account.login(name, pass);
      if (!r.ok) {
        // 老账号没设过密码：登录页没密码可输，引导去「注册」用同名设新密码找回（进度保留）
        if (r.needPass) {
          return fail('这个账号还没设置密码：去上面切到「注册」，用这个名字 + 想用的密码设一次，就能找回原进度');
        }
        // 本机没有 / 密码对不上 → 去服务器找（名字和密码在服务器上也有一份）
        if (r.badAccount && Account.cloudLogin) {
          setAuthError('正在服务器上查找这个账号…');
          const c = await Account.cloudLogin(name, pass);
          if (c && c.ok) {
            afterAuthEnter(c.created
              ? '已在服务器上找到「' + c.account.name + '」，存档一并取回'
              : '欢迎回来「' + c.account.name + '」（服务器登录）');
            return true;
          }
        }
        return fail(r.reason || Account.BAD_PASS);
      }
      afterAuthEnter();
    }
    return true;
  }

  function afterAuthEnter(msg) {
    try { Account.claimGrants(); } catch (e) {}
    clearAuthSkip();          // 登录 / 注册成功：以后开机直接进主页，不再问「要不要登录」
    if (msg) { try { toast(msg); } catch (e) {} }
    // 换账号后内存里的 S / 音频 / 缓存全是上一个号的，直接重载最干净
    setTimeout(() => { try { location.reload(); } catch (e) {} }, msg ? 420 : 60);
  }

  // 切换账号列表
  function renderSwitchList() {
    const box = $('acct-list');
    if (!box) return;
    box.innerHTML = '';
    const cur = Account.current();
    const arr = Account.list();
    if (!arr.length) {
      const p = document.createElement('p');
      p.className = 'history-hint';
      p.textContent = '本机还没有别的账号';
      box.appendChild(p);
      return;
    }
    arr.forEach((a) => {
      const sum = Account.summary(a);
      const mine = !!cur && cur.id === a.id;
      const row = document.createElement('div');
      row.className = 'acct-row' + (mine ? ' cur' : '');
      row.innerHTML = '<span class="acct-main"><b>' + escHtml(a.name || '（还没起名字）') + '</b>' +
        '<i>🪙 ' + sum.coins + ' · ⭐ ' + sum.stars + '</i></span>' +
        '<span class="acct-mark">' + (mine ? '使用中' : '切换') + '</span>';
      row.addEventListener('click', () => {
        if (mine) { toast('现在用的就是这个账号'); return; }
        const r = Account.switchTo(a.id);
        if (!r.ok) { toast(r.reason || '切换失败'); return; }
        toast('已切换到「' + a.name + '」');
        setTimeout(() => { try { location.reload(); } catch (e) {} }, 320);
      });
      box.appendChild(row);
    });
  }

  // 资料不全（缺名字 / 缺密码 / 含敏感词）→ 必须补好才能玩
  function openFixMenu(need) {
    need = need || Account.needsFix();
    AudioManager.gateBGM(false);     // 补资料页不放背景音乐
    const acc = Account.current();
    const title = $('fix-title');
    const tip = $('fix-tip');
    const rows = $('fix-pass-rows');
    const nameIn = $('fix-name');
    setInputError(['fix-name', 'fix-pass', 'fix-pass2'], false);
    const err = $('fix-err');
    if (err) err.textContent = '';

    if (need.sensitive) {
      if (title) title.textContent = '✏️ 修改名字';
      if (tip) tip.textContent = '这个名字里有敏感词，换一个才能继续游戏';
      if (rows) rows.style.display = 'none';
      if (nameIn) nameIn.value = (acc && acc.name) || '';
    } else {
      if (title) title.textContent = '完善账号信息';
      if (tip) tip.textContent = '名字和密码都要有才能继续游戏，填好一次以后就用它登录';
      if (rows) rows.style.display = '';
      if (nameIn) nameIn.value = (acc && acc.name && acc.name !== '奶龙玩家') ? acc.name : '';
      ['fix-pass', 'fix-pass2'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
    }
    showOverlay('fix-menu');
    setView('menu');
  }

  function saveFix() {
    const need = Account.needsFix();
    const nameV = ($('fix-name') || {}).value || '';
    const p1 = ($('fix-pass') || {}).value || '';
    const p2 = ($('fix-pass2') || {}).value || '';
    const fail = (m, ids) => {
      setInputError(ids, true);
      const err = $('fix-err');
      if (err) err.textContent = m;
      try { AudioManager.playSFX('invalid'); } catch (e) {}
      return false;
    };
    setInputError(['fix-name', 'fix-pass', 'fix-pass2'], false);

    if (need.nick || need.sensitive) {
      const r = Account.rename(nameV);
      if (!r.ok) return fail(r.reason, ['fix-name']);
    }
    if (need.pass) {
      if (!p1) return fail('请设置密码', ['fix-pass']);
      if (p1 !== p2) return fail('两次输入的密码不一样', ['fix-pass2']);
      const r = Account.setPassword('', p1);
      if (!r.ok) return fail(r.reason, ['fix-pass']);
    }

    $('fix-menu').style.display = 'none';
    toast('账号信息已保存');
    refreshMenu();
    try {
      if (Account.claimGrants().length) { toast('📮 邮箱收到一封新邮件'); refreshMailBadge(); }
    } catch (e) {}
    // 补齐密码的老账号也顺势存到服务器（注册的新号在注册时就已经自动存了）
    setTimeout(() => { try { maybeCloudOffer(); } catch (e) {} }, 300);
    return true;
  }

  // 回到主页时检查一次（资料不全就弹修复窗口，且没有「关闭」按钮）
  let lastFixPop = 0;
  function maybeAccountGate() {
    if (!accountOk()) return false;
    if (S.playing) return false;

    // ① 昵称还是默认的「奶龙玩家」→ 强制改名。窗口没有返回键、点外面也不关，
    //    只有改名成功才会自己关掉，然后才轮到下面「补密码」的流程。
    if (needForcedRename()) {
      const nm = $('nick-menu');
      if (nm && nm.style.display === 'flex') return true;
      if (Date.now() - lastFixPop < 3000) return true;
      lastFixPop = Date.now();
      openNickMenu(true);
      return true;
    }

    // ② 其它资料不全（缺密码 / 名字含敏感词）→ 补齐才能玩
    const need = Account.needsFix();
    if (!need.any) return false;
    const box = $('fix-menu');
    if (box && box.style.display === 'flex') return true;
    if (Date.now() - lastFixPop < 3000) return true;
    lastFixPop = Date.now();
    openFixMenu(need);
    return true;
  }

  // 玩之前先把账号理顺：没登录也能玩（游客模式，进度只存本机），
  // 登录着但资料不全的才拦下来补资料
  function ensureAccount(then) {
    if (accountOk()) {
      // 还叫「奶龙玩家」→ 先改名，别的地方都不许去
      if (needForcedRename()) { openNickMenu(true); return false; }
      if (Account.needsFix().any) { openFixMenu(); return false; }
    }
    then();
    return true;
  }

  // ==================== ☁️ 账号上云（用玩家自己的密码） ====================
  // 本机账号只在 localStorage 里有哈希，服务器上并没有这个人。
  // 要让「换手机 / 清缓存还能找回」，只能让玩家自己把密码输一次：
  // 本机校验通过后，拿这串明文去服务器按「同样的名字 + 同样的密码」建档，
  // 之后进度就会自动同步上去。密码不会被改动，也不会在这里留存。
  let cloudOffered = false;
  let cloudForced = false;      // 上云窗口的「正在存」态：存成功自己关，也可以被玩家跳过
  let cloudFrom = 'auto';       // 'auto' 启动时自动弹 | 'account' 从账号安全页点进来

  // 云存档页也能关掉：进度本来就在本机，之后在「设置 → 账号安全 → ☁️ 云存档」再补
  function skipCloud() {
    cloudForced = false;
    cloudOffered = true;                 // 本次不再自动弹
    const box = $('cloud-menu');
    if (box) box.style.display = 'none';
    // 从哪进来就回哪去：账号安全页 / 主页
    if (cloudFrom === 'account') showOverlay('account-menu');
    else { showOverlay('main-menu'); refreshMenu(); }
    toast('已跳过上云：进度还在本机，随时可在 设置 → 账号安全 里再存');
  }

  function openCloudMenu(from) {
    cloudForced = true;
    cloudFrom = from === 'account' ? 'account' : 'auto';
    const err = $('cloud-err');
    if (err) err.textContent = '';
    const rn = $('btn-cloud-rename');
    if (rn) rn.style.display = 'none';
    const inp = $('cloud-pass');
    if (inp) inp.value = '';
    showOverlay('cloud-menu');
    if (inp && inp.focus) setTimeout(() => inp.focus(), 60);
  }

  // 名字在服务器被占时的逃生口：先放玩家出去改个名，改完回到存档窗重新存
  function cloudRenameEscape() {
    cloudForced = false;
    const box = $('cloud-menu');
    if (box) box.style.display = 'none';
    openNickMenu(false, () => { try { openCloudMenu(); } catch (e) {} });
  }

  // 把账号存到服务器的提示：正常情况下系统自己就存了（account.js autoCloudSave），
  // 只有「还没绑服务器、本机也没记着密码」的老账号才弹一次输入框
  function maybeCloudOffer() {
    if (cloudOffered) return false;
    if (!accountOk() || S.playing) return false;
    if (typeof Account.pushAccountToCloud !== 'function') return false;
    if (!Account.cloudOk || !Account.cloudOk()) return false;
    if (needForcedRename()) return false;
    let acc = null, need = null;
    try { acc = Account.current(); need = Account.needsFix(); } catch (e) { return false; }
    if (!acc || acc.cloud || acc.ctoken) return false;
    if (!acc.pass) return false;                 // 没密码的账号先去补密码
    if (need && need.any) return false;
    cloudOffered = true;
    const show = () => { try { openCloudMenu(); } catch (e) {} };
    // 先让系统自己存：记着密码就一步都不用玩家点
    if (typeof Account.autoCloudSave === 'function') {
      Promise.resolve(Account.autoCloudSave()).then((r) => {
        if (r && r.ok) { try { toast('☁️ 已自动存到服务器'); } catch (e) {} return; }
        show();   // 没有可用的密码 / 名字被占 → 才请玩家输一次
      }).catch(show);
      return true;
    }
    show();
    return true;
  }

  async function submitCloud() {
    const pass = ($('cloud-pass') || {}).value || '';
    const err = $('cloud-err');
    const fail = (m) => {
      if (err) err.textContent = m;
      try { AudioManager.playSFX('invalid'); } catch (e) {}
      return false;
    };
    if (err) err.textContent = '';
    if (!pass) return fail('请输入密码');
    if (typeof Account.pushAccountToCloud !== 'function') return fail('页面版本太旧，请刷新后再试');
    const btn = $('btn-cloud-save');
    if (btn) { btn.disabled = true; btn.textContent = '正在存…'; }
    let r = null;
    try { r = await Account.pushAccountToCloud(pass); } catch (e) { r = { ok: false, reason: '网络异常' }; }
    if (btn) { btn.disabled = false; btn.textContent = '保存'; }
    if (!r || !r.ok) {
      // 名字在服务器被别的密码占了：给出「改个名字再存」的逃生口，别把玩家锁死在这
      const rn = $('btn-cloud-rename');
      if (rn) rn.style.display = (r && r.nameTaken) ? 'block' : 'none';
      return fail((r && r.reason) || '没存上，稍后再试');
    }
    const rn2 = $('btn-cloud-rename');
    if (rn2) rn2.style.display = 'none';
    cloudForced = false;
    $('cloud-menu').style.display = 'none';
    toast('已存到服务器，换设备也能找回了');
    // 身份码换成了服务器码：旧码那条榜单记录已经撤掉，用新码重新发一次成绩
    setTimeout(() => { try { publishMyScore(true); } catch (e) {} }, 300);
    try { AudioManager.playSFX('coin'); } catch (e) {}
    return true;
  }

  // ==================== 📮 邮箱 ====================
  let mailOpenId = '';

  // 主页邮箱键上的未读角标
  function refreshMailBadge() {
    const badge = $('mail-badge');
    if (!badge) return;
    let n = 0;
    try { n = (typeof Mail !== 'undefined') ? Mail.unread() : 0; } catch (e) { n = 0; }
    if (n > 0) {
      badge.textContent = n > 9 ? '9+' : String(n);
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // 左滑打开的邮件行：同一时间只允许一行打开
  let mailSwipeOpen = null;   // 打开的那行外层 .mail-swipe
  let mailSwipeRow = null;    // 对应的 .mail-row（收起时要连内联位移一起清掉）
  function closeMailSwipe(except) {
    if (mailSwipeOpen && mailSwipeOpen !== except) {
      mailSwipeOpen.classList.remove('open');
      // 必须把行上的内联 transform 一并清掉：只摘 open 类的话，行还停在左移的位置，
      // 删除键就一直露在外面（行收回了删除键没收，看起来就像删除键脱离了那一行）
      if (mailSwipeRow) mailSwipeRow.style.transform = '';
      mailSwipeOpen = null;
      mailSwipeRow = null;
    }
  }

  // 左滑露出「删除」，右滑 / 点一下收回；轻点（抖动 ≤12px）不算滑动，不会露出删除键
  function attachMailSwipe(wrap, row, m) {
    const DEL = 62;                 // 删除键宽度（和 CSS 里一致）
    const TAP_TOL = 12;             // 小于这个位移算点击，不触发左滑
    let sx = 0, sy = 0, base = 0, dx = 0;
    let tracking = false, moved = false, pid = null;
    let wasOpen = false;   // 按下这一瞬是不是「左滑露出删除键」的状态

    const setX = (x) => { row.style.transform = x ? 'translateX(' + x + 'px)' : ''; };
    const isOpen = () => wrap.classList.contains('open');

    row.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      wasOpen = isOpen();          // 先记住：这一下是在「露着删除键」的行上按的
      closeMailSwipe(wrap);
      tracking = true;
      moved = false;
      pid = e.pointerId;
      sx = e.clientX; sy = e.clientY;
      base = isOpen() ? -DEL : 0;
      dx = 0;
      row.style.transition = 'none';
    });

    row.addEventListener('pointermove', (e) => {
      if (!tracking || (pid !== null && e.pointerId !== pid)) return;
      const mx = e.clientX - sx;
      const my = e.clientY - sy;
      if (!moved) {
        // 竖着滑动优先当作滚动列表，不抢；横向分量不明显也不算滑动（点击不露删除键）
        if (Math.abs(my) > 8 && Math.abs(my) >= Math.abs(mx)) { tracking = false; setX(base); row.style.transition = ''; return; }
        if (Math.abs(mx) <= TAP_TOL || Math.abs(mx) <= Math.abs(my)) return;
        moved = true;
        closeMailSwipe(wrap);   // 真正开始左滑了，才收起其他打开的行
      }
      dx = Math.max(-DEL - 16, Math.min(0, base + mx));
      setX(dx);
      if (e.cancelable) e.preventDefault();
    });

    const finish = () => {
      if (!tracking) return;
      tracking = false;
      row.style.transition = '';
      // dx 已经是含 base 的最终偏移（松手时右滑滑回原位 = dx 接近 0 → 收起）
      const open = dx < -DEL / 2;
      wrap.classList.toggle('open', open);
      mailSwipeOpen = open ? wrap : (mailSwipeOpen === wrap ? null : mailSwipeOpen);
      mailSwipeRow = open ? row : (mailSwipeOpen === wrap ? mailSwipeRow : null);
      setX(open ? -DEL : 0);
    };
    ['pointerup', 'pointercancel'].forEach((ev) => row.addEventListener(ev, finish));

    row.addEventListener('click', (e) => {
      if (moved) { moved = false; e.stopPropagation(); e.preventDefault(); return; }
      // 左滑露出「删除」时点邮件：只把它收回原位，不点进邮件
      if (wasOpen) {
        wasOpen = false;
        e.stopPropagation();
        e.preventDefault();
        closeMailSwipe();
        wrap.classList.remove('open');
        mailSwipeOpen = null; mailSwipeRow = null;
        setX(0);
        return;
      }
      if (isOpen()) { closeMailSwipe(); wrap.classList.remove('open'); mailSwipeOpen = null; mailSwipeRow = null; setX(0); return; }
      openMail(m.id);
    });

    const del = wrap.querySelector('.mail-del');
    if (del) del.addEventListener('click', (e) => {
      e.stopPropagation();
      if (m.hasGift && !m.claimed) {
        toast('先领取附件再删除这封邮件');
        wrap.classList.remove('open');
        mailSwipeOpen = null; mailSwipeRow = null;
        setX(0);
        return;
      }
      Mail.remove(m.id);
      toast('邮件已删除');
      refreshMailBadge();
      renderMailList();
      AudioManager.playSFX('select');
    });
  }

  function renderMailList() {
    const box = $('mail-list');
    if (!box) return;
    box.innerHTML = '';
    mailSwipeOpen = null; mailSwipeRow = null;
    // 滚动列表就收起左滑露出的删除键：行滚出视野后删除键还挂在原地，
    // 看起来就像一个悬空的删除键（尤其贴着列表底缘被裁一半的时候）
    if (!box.dataset.swipeScroll) {
      box.addEventListener('scroll', () => { if (mailSwipeOpen) closeMailSwipe(); }, { passive: true });
      box.dataset.swipeScroll = '1';
    }
    const arr = (typeof Mail !== 'undefined') ? Mail.list() : [];
    if (!arr.length) {
      const p = document.createElement('p');
      p.className = 'history-hint';
      p.textContent = '暂时还没有邮件';
      box.appendChild(p);
      return;
    }
    arr.forEach((m) => {
      const wrap = document.createElement('div');
      wrap.classList.add('mail-swipe');
      const row = document.createElement('div');
      row.className = 'mail-row' + (m.read ? '' : ' unread');
      let flag = '';
      if (m.hasGift) {
        flag = m.claimed
          ? '<span class="m-flag done">已领取</span>'
          : '<span class="m-flag">🎁 ' + (m.coins || '附件') + '</span>';
      }
      row.innerHTML = '<span class="m-ico">' + (m.icon || '📮') + '</span>' +
        '<span class="m-main"><b class="m-title">' + escHtml(m.title) + '</b>' +
        '<i class="m-sub">' + escHtml(m.from) + ' · ' + escHtml(m.at) + '</i></span>' +
        flag + (m.read ? '' : '<span class="m-dot"></span>');
      const del = document.createElement('button');
      del.className = 'mail-del';
      del.type = 'button';
      del.textContent = '删除';
      wrap.appendChild(del);
      wrap.appendChild(row);
      attachMailSwipe(wrap, row, m);
      box.appendChild(wrap);
    });
  }

  function openMail(id) {
    const m = (typeof Mail !== 'undefined') ? Mail.get(id) : null;
    if (!m) return;
    mailOpenId = id;
    try { Mail.markRead(id); } catch (e) {}
    // 标题带「：」的邮件拆成 主标题 + 副标题（副标题换行、字号更小，以后发的邮件都按这个格式显示）
    // 详情页标题不带 emoji（列表里仍显示图标）
    const t = $('mail-view-title');
    const sub = $('mail-view-sub');
    const ci = m.title.indexOf('：');
    if (t) t.textContent = ci > 0 ? m.title.slice(0, ci) : m.title;
    if (sub) {
      if (ci > 0) { sub.textContent = m.title.slice(ci + 1); sub.style.display = 'block'; }
      else { sub.textContent = ''; sub.style.display = 'none'; }
    }
    const meta = $('mail-view-meta');
    if (meta) meta.textContent = m.from + ' · ' + m.at;
    const body = $('mail-view-body');
    if (body) body.textContent = m.body;
    const claim = $('btn-mail-claim');
    if (claim) {
      claim.style.display = m.hasGift ? 'block' : 'none';
      claim.disabled = !!m.claimed;
      claim.textContent = m.claimed ? '奖励已领取' : (m.coins ? '领取 ' + m.coins + ' 金币' : '领取奖励');
    }
    $('mail-menu').style.display = 'none';
    showOverlay('mail-view');
    refreshMailBadge();
    AudioManager.playSFX('select');
  }

  function claimMail() {
    if (!mailOpenId) return;
    const r = Mail.claim(mailOpenId);
    if (!r.ok) { toast(r.reason || '领取失败'); return; }
    const claim = $('btn-mail-claim');
    if (claim) { claim.disabled = true; claim.textContent = '奖励已领取'; }
    toast(r.coins ? '领取成功：+' + r.coins + ' 金币' : '领取成功');
    try { AudioManager.playSFX('coin'); } catch (e) {}
    renderMailList();
    refreshMenu();
    refreshMailBadge();
  }

  // 奖励直接送到邮箱（不弹金币数字，玩家自己去邮箱领）
  function claimCompensation() {
    if (!accountOk()) return;
    try {
      if (Account.claimGrants().length) {
        refreshMailBadge();
        toast('📮 邮箱收到一封新邮件');
        try { AudioManager.playSFX('select'); } catch (e) {}
      }
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 调试 / 自动化测试钩子（不影响正常玩法）
  window.__nl_test = {
    start: startLevel,
    myEntry: myBestEntry,
    state: () => S,
    win: levelWin,
    end: endGame,
    outOfResource: handleOutOfResource,
    swap: trySwap,
    hint: useHint,
    clearHint: clearHint,
    canPlaceNew: canPlaceNew,
    pickSpotIn: pickSpotIn,
    reshuffle: reshuffle,
    undoMove: undo,
    useItem: useBackpackItem,
    findMatches: findMatches,
    autoPause: autoPauseIfPlaying,
    pause: pauseGame,
    refreshMenu: refreshMenu,
    toast: toast,
    dailyCompleted: dailyCompleted,
    hud: updateHUD,
    openProvStats: openProvStats,
    renderAdmin: renderAdmin,
    renderAdminUsers: renderAdminUsers,
    serverUsers: collectServerUsers,
    userList: collectUserList,
    openUserList: openAdminUserList,
    openProvUserList: openProvUserList,
    renderProvUserList: renderProvUserList,
    renderUserList: renderAdminUserList,
    setUserListProv: (p) => { adminUlProv = String(p || ''); renderAdminUserList(); },
    iceBase: ICE_BASE,
    detonateAt: detonateAt,
    markSpecial: markSpecial,
    openProvCities: openProvCities,
    matchProvince: matchProvince,
    matchCity: matchCity,
    formatRegion: formatRegion,
    bumpProvHits: bumpProvHits,
    openOverseasList: openOverseasList,
    overseasCountries: OVERSEAS_COUNTRIES,
    overseasHitKey: overseasHitKey,
    refreshProvStats: refreshProvStats,
    provRows: () => provRows,
    statsTotal: statsTotal,
    renderProvList: renderProvList,
    resolveClear: resolveClear,
    collectCargo: collectCargo,
    crackIceAt: crackIceAt,
    iceTotal: iceTotal,
    iceCracks: ICE_CRACKS,
    endModeRun: endModeRun,
    drawStatic: drawStatic,
    resetProvCounted: () => { provCounted = false; }
  };
})();
