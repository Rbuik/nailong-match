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
  const T = Specials.TYPE;

  const COMBO_WINDOW = 2500;   // 跨步连击窗口（ms）
  const COMBO_DECAY = 900;     // 连击条显示窗口（ms）
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
    cargoLeft: 0,       // 场上还没送达的货物数
    rescueLeft: 0,      // 还没护送到位的奶龙数
    frenzyUntil: 0,     // 狂热模式结束时间
    hintLeft: 2,        // 本局剩余提示次数
    hintCells: null,    // 当前高亮的提示格
    hintUntil: 0,
    mode: 'main',       // main / endless / sprint / rhythm
    reviveUsed: false,  // 本局是否已用过「再来 3 步」
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
    for (let r = 0; r < ROWS; r++) {
      S.board[r] = [];
      S.jelly[r] = [];
      S.ice[r] = [];
      S.chain[r] = [];
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
      }
    }
    placeJelly();
    placeObstacles();
    S.nextQueue = [randType(), randType(), randType()];
  }

  // ==================== 新障碍：冰块 / 锁链 / 货物 ====================
  // 冰块：冻住的格子既不能交换也不能参与连消，只能靠相邻消除（或特殊块）砸开
  // 锁链：可以参与连消，但第一次被消只解链、方块留下
  // 货物：钥匙🔑 / 礼物🎁 / 奶龙🐲 贴在方块上，跟着方块下落，落到最底行才算送达
  function isIced(r, c) {
    return !!(S.ice[r] && S.ice[r][c] > 0);
  }
  function isChained(r, c) {
    return !!(S.chain[r] && S.chain[r][c] > 0);
  }
  function isLocked(r, c) {
    return isIced(r, c) || isChained(r, c);
  }

  function placeObstacles() {
    const d = S.levelDef || {};
    S.cargoLeft = 0;
    S.rescueLeft = 0;
    const free = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) free.push({ r, c });
    shuffleArr(free);

    // 货物只放上半区（必须靠下落送到底），且同一格不会重复放
    const top = free.filter((p) => p.r <= 4);
    let ti = 0;
    const putCargo = (kind, n) => {
      for (let k = 0; k < n && ti < top.length; k++) {
        const p = top[ti++];
        S.board[p.r][p.c].cargo = { kind: kind };
      }
    };
    putCargo('key', Math.max(0, d.cargo || 0));
    putCargo('nailong', Math.max(0, d.rescue || 0));

    // 冰块 / 锁链放在剩下的格子里（不和货物重叠）
    const rest = free.filter((p) => !S.board[p.r][p.c].cargo);
    let ri = 0;
    const take = () => (ri < rest.length ? rest[ri++] : null);
    for (let k = 0; k < (d.ice || 0); k++) { const p = take(); if (!p) break; S.ice[p.r][p.c] = 1; }
    for (let k = 0; k < (d.iceHard || 0); k++) { const p = take(); if (!p) break; S.ice[p.r][p.c] = 2; }
    for (let k = 0; k < (d.chain || 0); k++) { const p = take(); if (!p) break; S.chain[p.r][p.c] = 1; }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const b = S.board[r][c];
        if (b && b.cargo) {
          S.cargoLeft++;
          if (b.cargo.kind === 'nailong') S.rescueLeft++;
        }
      }
    }
  }

  // 冰块层数总量（冰块关的目标值以场上实际层数为准）
  function iceTotal() {
    let n = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) n += (S.ice[r] && S.ice[r][c]) || 0;
    return n;
  }

  // 砸掉一层冰（返回是否真的砸掉了）
  function crackIceAt(r, c) {
    if (!S.ice[r] || !S.ice[r][c]) return false;
    S.ice[r][c]--;
    AudioManager.playSFX('line');
    FX.burst(c * CELL + CELL / 2, r * CELL + CELL / 2, '#9fe8ff', 5);
    if (S.goal) {
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
        const same = c < COLS && S.board[r][c] && S.board[r][c - 1]
          && S.board[r][c].type === S.board[r][c - 1].type
          && !isLocked(r, c) && !isLocked(r, c - 1);
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
          && !isLocked(r, c) && !isLocked(r - 1, c);
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
    const all = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (S.board[r][c]) all.push(S.board[r][c]);
    let tries = 0;
    do {
      shuffleArr(all);
      let i = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) S.board[r][c] = all[i++];
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
    }
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
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = base * 0.12;
    ctx.shadowOffsetY = base * 0.06;
    roundRect(x, y, w, h, radius);
    ctx.fillStyle = '#000';
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
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
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

  // 货物徽标（钥匙 / 奶龙）：圆底 30% 透明度，不挡下面的图案
  // 奶龙用抠图 assets/nailong.png（加载完成前先用 🐲 兜底）
  const NAILONG_IMG = new Image();
  NAILONG_IMG.src = './assets/nailong.png';
  function drawCargoBadge(cx, cy, kind) {
    const isN = kind === 'nailong';
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = isN ? 'rgba(255,196,86,0.30)' : 'rgba(255,255,255,0.30)';
    ctx.fill();
    ctx.strokeStyle = isN ? 'rgba(255,140,0,0.9)' : 'rgba(124,92,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (isN && NAILONG_IMG.complete && NAILONG_IMG.naturalWidth) {
      const s = CELL * 0.46;
      ctx.beginPath();
      ctx.arc(cx, cy, CELL * 0.26, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(NAILONG_IMG, cx - s / 2, cy - s / 2, s, s);
    } else {
      ctx.font = Math.round(CELL * 0.36) + 'px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(isN ? '🐲' : '🔑', cx, cy + 1);
    }
    ctx.restore();
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

        // 货物：贴在方块上的钥匙 / 奶龙
        if (b && b.cargo && !(skip && skip[k])) {
          const cy = (cargoAt && cargoAt[k] != null) ? cargoAt[k] : y;
          drawCargoBadge(x + CELL / 2, cy + CELL / 2, b.cargo.kind);
        }

        // 冰块
        const ice = S.ice[r] ? S.ice[r][c] : 0;
        if (ice > 0) {
          ctx.save();
          roundRect(x + 2, y + 2, CELL - 4, CELL - 4, 9);
          ctx.fillStyle = ice > 1 ? 'rgba(150,220,255,0.60)' : 'rgba(205,240,255,0.42)';
          ctx.fill();
          ctx.strokeStyle = ice > 1 ? 'rgba(70,165,225,0.95)' : 'rgba(150,215,245,0.9)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x + CELL * 0.24, y + CELL * 0.16);
          ctx.lineTo(x + CELL * 0.44, y + CELL * 0.5);
          ctx.lineTo(x + CELL * 0.28, y + CELL * 0.78);
          ctx.stroke();
          if (ice > 1) {
            ctx.beginPath();
            ctx.moveTo(x + CELL * 0.74, y + CELL * 0.2);
            ctx.lineTo(x + CELL * 0.56, y + CELL * 0.5);
            ctx.lineTo(x + CELL * 0.78, y + CELL * 0.8);
            ctx.stroke();
          }
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

    // 选中框
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
      if (ta && ta.cargo) drawCargoBadge(ax + (bx - ax) * e + CELL / 2, ay + (by - ay) * e + CELL / 2, ta.cargo.kind);
      if (tb && tb.cargo) drawCargoBadge(bx + (ax - bx) * e + CELL / 2, by + (ay - by) * e + CELL / 2, tb.cargo.kind);
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
  const FRENZY_MS = 6000;
  let frenzyTimer = null;
  function frenzyActive() {
    return performance.now() < S.frenzyUntil;
  }
  function frenzyMult() {
    return frenzyActive() ? 2 : 1;
  }
  function startFrenzy() {
    S.frenzyUntil = performance.now() + FRENZY_MS;
    const banner = $('frenzy-banner');
    if (banner) {
      banner.classList.add('on');
      setTimeout(() => banner.classList.remove('on'), 1400);
    }
    document.body.classList.add('frenzy');
    AudioManager.playSFX('star', { stars: 3 });
    if (frenzyTimer) clearTimeout(frenzyTimer);
    frenzyTimer = setTimeout(() => {
      document.body.classList.remove('frenzy');
      S.frenzyUntil = 0;
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
      if (plan && S.board[plan.r][plan.c] && S.board[plan.r][plan.c].special === T.NORMAL) {
        markSpecial(plan.r, plan.c, plan.type);
        matched.delete(kOf(plan.r, plan.c));
        // 这一格虽然要留下来变成特殊块（不消除方块），但它属于本次连消，
        // 底下的果冻必须一起消掉，否则果冻关永远清不完
        if (clearJellyAt(plan.r, plan.c)) {
          Tasks.report('jelly', 1);
          if (S.goal) {
            Goals.progress(S.goal, { jelly: 1 });
            updateTargetBar();
          }
        }
        if (plan.type === T.RAINBOW) {
          FX.text(plan.c * CELL + CELL / 2, plan.r * CELL + CELL / 2, '生成彩虹 🌈', '#c85cff', 16);
          AudioManager.playSFX('coin');
        } else if (plan.type === T.BOMB) {
          FX.text(plan.c * CELL + CELL / 2, plan.r * CELL + CELL / 2, '生成炸弹 💣', '#ff5c5c', 16);
          AudioManager.playSFX('coin');
        } else {
          FX.text(plan.c * CELL + CELL / 2, plan.r * CELL + CELL / 2, '生成线消', '#5c8fff', 16);
          AudioManager.playSFX('coin');
        }
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
        if (b.cargo) kickedCargo.push({ r: p.r, c: p.c, cargo: b.cargo });
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
    const gained = Math.round(clearSet.size * 10 * mult * fz * beat);
    S.score += gained;
    S.levelStartScore = S.levelStartScore || 0;

    // 目标推进
    if (S.goal) {
      Goals.progress(S.goal, { scoreDelta: gained, colors: colors, jelly: jellyHit });
      updateTargetBar();
    }
    S.clearedCount += clearSet.size;
    updateHUD();

    // 3) 特效
    boomPoints.forEach((bp) => {
      FX.explosion(bp.c * CELL + CELL / 2, bp.r * CELL + CELL / 2, CELL);
      if (bp.type === T.BOMB) FX.shake(3, 0.18);
      if (bp.type === T.RAINBOW) FX.shake(4, 0.25);
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

    // 掉落 + 补充
    const fallFrom = dropAndFill();
    // 被消掉的货物往下掉一格：落在「被消掉那一格的下面一格」，不从顶端重新开始。
    // 同一列有多个货物时从下往上放，避免互相抢格子。
    kickedCargo.sort((x, y) => y.r - x.r).forEach((d) => {
      let tr = Math.min(ROWS - 1, d.r + 1);
      while (tr < ROWS - 1 && S.board[tr] && S.board[tr][d.c] && S.board[tr][d.c].cargo) tr++;
      const cell = S.board[tr] && S.board[tr][d.c];
      if (cell && !cell.cargo) cell.cargo = d.cargo;
      else if (S.board[0][d.c] && !S.board[0][d.c].cargo) S.board[0][d.c].cargo = d.cargo;
    });
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
    collectCargo();
    drawStatic();
    return gained;
  }

  // 落到最底行的货物就算送达
  function collectCargo() {
    let n = 0, res = 0;
    for (let c = 0; c < COLS; c++) {
      const b = S.board[ROWS - 1][c];
      if (b && b.cargo) {
        const kind = b.cargo.kind;
        b.cargo = null;
        n++;
        if (kind === 'nailong') res++;
        FX.text(c * CELL + CELL / 2, (ROWS - 1) * CELL + CELL / 2,
          kind === 'nailong' ? '奶龙送达 🐲' : '送达 🔑', '#2fa84f', 16);
        FX.burst(c * CELL + CELL / 2, (ROWS - 1) * CELL + CELL / 2, '#7cf29a', 5);
        AudioManager.playSFX('coin');
      }
    }
    if (!n) return 0;
    S.cargoLeft = Math.max(0, S.cargoLeft - n);
    S.rescueLeft = Math.max(0, S.rescueLeft - res);
    Meta.bump('cargo', n);
    if (res) Meta.bump('rescue', res);
    if (S.goal) {
      Goals.progress(S.goal, { cargo: n, rescue: res });
      updateTargetBar();
    }
    updateHUD();
    return n;
  }

  // 立即引爆某一格上的特殊块（供道具自动消耗使用）
  async function detonateAt(r, c) {
    const expanded = Specials.expandClears(S.board, ROWS, COLS, new Set([kOf(r, c)]), {});
    await resolveClear(expanded.cells, expanded.boomPoints);
  }

  // ==================== 彩虹：消场上所有「同图案」方块 ====================
  // 彩虹跟普通块交换时，消掉被交换那个图案在全盘的每一块 + 彩虹自身；
  // 不连锁引爆同色里夹着的炸弹/线消（它们只被当作普通方块消掉），
  // 也绝不直接碰其它图案的方块（掉落后凑出的普通三连属于正常连消）。
  function rainbowSwapInfo(ba, bb) {
    if (!ba || !bb) return null;
    if (ba.special === T.RAINBOW && bb.special === T.NORMAL) return { color: bb.type, fromA: true };
    if (bb.special === T.RAINBOW && ba.special === T.NORMAL) return { color: ba.type, fromA: false };
    return null;
  }

  async function runRainbowClear(color, rainbowCell) {
    // 同图案全消 + 彩虹自己也一起消掉
    const cells = new Set([kOf(rainbowCell.r, rainbowCell.c)]);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const b = S.board[r][c];
        if (!b) continue;
        if (b.special === T.RAINBOW) continue;   // 其它彩虹不连坐
        if (b.type === color) cells.add(kOf(r, c));
      }
    }

    FX.text(rainbowCell.c * CELL + CELL / 2, rainbowCell.r * CELL + CELL / 2 - CELL * 0.3,
      '同图案消除 🌈', '#c85cff', 18);
    FX.burst(rainbowCell.c * CELL + CELL / 2, rainbowCell.r * CELL + CELL / 2, '#c85cff', 6);
    AudioManager.playSFX('line');
    Tasks.report('rainbow', 1);
    Meta.bump('rainbows', 1);
    if (!cells.size) { drawStatic(); return; }
    await resolveClear(cells, []);
  }

  // ==================== 特殊块的生成顺序 ====================
  // 每个特殊块生成时发一个递增编号（跟着方块一起下落/存档），
  // 步数或时间耗尽时按这个顺序依次引爆。
  function nextSpecSeq() {
    S.specSeq = (S.specSeq || 0) + 1;
    return S.specSeq;
  }

  function markSpecial(r, c, type) {
    const b = S.board[r] && S.board[r][c];
    if (!b) return;
    b.special = type;
    b.seq = nextSpecSeq();
  }

  function collectSpecials() {
    const list = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const b = S.board[r][c];
        if (b && b.special && b.special !== T.NORMAL) {
          list.push({ r, c, seq: b.seq || 0, special: b.special });
        }
      }
    }
    return list;
  }

  // 棋盘上剩下的特殊块：按生成先后一个个引爆，全部生效（含引爆后掉落产生的
  // 连消与新特殊块）之后才结束，返回是否因此达成了关卡目标。
  // 中途就算目标已达成也继续引爆完、把棋盘清干净，最后才进结算页。
  // 不弹任何文字提示，节奏收紧（引爆间隔很短），避免结束前拖沓卡顿。
  async function detonateBoardSpecials() {
    const all = collectSpecials();
    if (!all.length) return false;
    await sleep(180);

    for (let guard = 0; guard < 80; guard++) {
      const list = collectSpecials();
      if (list.length) {
        // 编号小的先生成、先引爆；编号相同（老存档）按行列顺序兜底
        list.sort((a, b) => (a.seq - b.seq) || (a.r - b.r) || (a.c - b.c));
        const t = list[0];
        await detonateAt(t.r, t.c);
        await sleep(110);
        continue;
      }
      // 特殊块清完：引爆后的掉落可能产生自然连消，也一并消完再结算
      if (findMatches().size === 0) break;
      await resolveBoard(null);
    }
    return S.goal ? Goals.isComplete(S.goal) : false;
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
    if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) {
      S.selected = null;
      drawStatic();
      return;
    }
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
        commitSnap(snap);
        await runCombo(combo, a, b);
        spendMove();
        await afterTurn();
        return;
      }

      // 彩虹 + 普通块：消掉全场所有同色方块（无视周围有没有三连）
      const rb = rainbowSwapInfo(ba, bb);
      if (rb) {
        commitSnap(snap);
        spendMove();
        // 交换后彩虹已经挪到了对面那格
        await runRainbowClear(rb.color, rb.fromA ? b : a);
        // 消除后的掉落可能再凑出连消
        await resolveBoard(null);
        await afterTurn();
        return;
      }

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

    if (S.goal && Goals.isComplete(S.goal)) {
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
    updateHUD();
    updateTargetBar();
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
    S.levelDef = opts.def || getLevelDef(S.level);
    S.rng = opts.seed != null ? RNG.source(opts.seed) : null;
    S.chapter = S.levelDef.chapter || (S.level ? Math.ceil(S.level / 10) : 0);

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
    S.specSeq = 0;
    S.hintLeft = 3;
    S.hintCells = null;
    S.hintUntil = 0;
    S.reviveUsed = false;
    S.frenzyUntil = 0;
    S.cargoLeft = 0;
    S.rescueLeft = 0;
    document.body.classList.remove('frenzy');
    const fzBanner = $('frenzy-banner');
    if (fzBanner) fzBanner.classList.remove('on');

    applyTheme(S.levelDef.theme);
    initBoard();

    // 冰块 / 货运 / 护送关：目标值以场上实际数量为准，保证一定能完成
    if (S.goal.type === 'ice') S.goal.target = Math.max(1, iceTotal());
    else if (S.goal.type === 'drop') S.goal.target = Math.max(1, S.cargoLeft);
    else if (S.goal.type === 'rescue') S.goal.target = Math.max(1, S.rescueLeft);

    // 道具：开局炸弹（§7）
    if (opts.startBomb) {
      const r = randInt(ROWS), c = randInt(COLS);
      markSpecial(r, c, T.BOMB);
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
        handleOutOfResource();
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

    const coinEl = $('coins');
    if (coinEl) coinEl.textContent = Store.getWallet().coins;
    const starEl = $('stars');
    if (starEl) starEl.textContent = Store.totalStars();

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
        const cur = Math.min(S.goal.byColor[c] || 0, S.goal.target[c]);
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
  function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
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
    const box = $('rules-box');
    const i = Math.max(0, Math.min(RULE_FONTS.length - 1, Number(idx) || 0));
    if (box) box.style.setProperty('--rule-fs', RULE_FONTS[i] + 'px');
    // 到边界时对应按钮变淡，提示已经没法再调
    const minus = $('btn-rule-font-minus');
    const plus = $('btn-rule-font-plus');
    if (minus) minus.classList.toggle('is-off', i <= 0);
    if (plus) plus.classList.toggle('is-off', i >= RULE_FONTS.length - 1);
    return i;
  }

  // ==================== 结算 ====================
  function levelWin() {
    if (S.mode && S.mode !== 'main') { endModeRun(); return; }
    S.playing = false;
    stopTimer();
    stopBeatLoop();
    Input.setEnabled(false);

    const remainRatio = S.timerOn
      ? S.timeLeft / (S.levelDef.goal.time || 1)
      : (S.moves / (S.levelDef.moves || 1));
    const stars = Goals.stars(S.levelDef, S.score, remainRatio);
    // 每日挑战也留一个「当天最佳」的纪录，第一次完成同样算新纪录
    const rec = S.daily
      ? Store.recordDaily(S.score, stars)
      : Store.recordLevel(S.level, S.score, stars);
    if (!S.daily) S.menuLevel = S.level;
    if (!S.daily) Store.markPlayed(S.level);
    if (S.daily) refreshMenu();

    // 金币产出（§7）
    const coins = Math.max(10, Math.floor(S.score / 100));
    Store.addCoins(coins);
    Tasks.report('play', 1);
    Tasks.report('score', S.score);

    // 成就统计
    Meta.bump('wins', 1);
    Meta.bump('scoreTotal', S.score);
    Meta.bump('starsGot', stars);
    if (stars >= 3) Meta.bump('perfect', 1);
    if (S.maxCombo >= 4) Meta.setMax('maxCombo', S.maxCombo);
    const newAch = Meta.check();
    if (newAch.length) setTimeout(() => toast('🏆 解锁成就：' + newAch[0].name), 1200);
    try { recordMyScore(); } catch (e) {}

    // 星星音效稍等一下，和逐颗弹出对齐
    setTimeout(() => AudioManager.playSFX('star', { stars }), 180);
    updateHUD();

    const box = $('level-clear');
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
      box.style.display = 'flex';

      // 等面板真正显示出来再起动画（setTimeout 比 rAF 稳，后台标签页也照常跑）
      setTimeout(() => {
        countUp($('clear-score'), S.score, 720, () => {
          if (rec.isNewScore) $('clear-new-record').style.display = 'inline-flex';
        });
        popStars(starEls, stars, 240);
      }, 30);
    }

    // 毕业面板（§10）：全通关后弹一次；「关卡记录」里也能重现
    if (S.levelDef.final) {
      setTimeout(() => {
        if (box) box.style.display = 'none';
        showCompletePanel();
      }, 1400);
    }
    // 本关已结算：清掉局内存档，避免主页还显示「继续游戏」
    Store.clearRun();
  }

  // ==================== 资源耗尽时的道具救场 ====================
  // 步数用完 / 时间耗尽时，背包里剩下的道具（洗牌、撤回除外）按商店顺序自动发挥用处：
  //  · +3 步（限时关为 +10 秒）：直接续命，游戏继续
  //  · 炸弹 / 彩虹：随机落到棋盘上并立即引爆
  // 全部用完后仍未过关，才弹出结算
  let rescuing = false;

  async function autoUseLeftoverItems() {
    for (let guard = 0; guard < 24; guard++) {
      const items = Store.getWallet().items || {};

      if ((items.extraMoves || 0) > 0) {
        Store.useItem('extraMoves');
        if (S.timerOn) S.timeLeft += 10;
        else S.moves += 3;
        updateHUD();
        checkMovesWarning();
        renderBackpack();
        toast('步数用完了，自动使用「' + (S.timerOn ? '时间 +10 秒' : '+3 步') + '」');
        return true;
      }

      let key = null;
      if ((items.startBomb || 0) > 0) key = 'startBomb';
      else if ((items.rainbow || 0) > 0) key = 'rainbow';
      if (!key) return false;

      const spots = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (S.board[r][c] && S.board[r][c].special === T.NORMAL) spots.push([r, c]);
        }
      }
      if (!spots.length) return false;

      const spot = spots[randInt(spots.length)];
      Store.useItem(key);
      markSpecial(spot[0], spot[1], key === 'startBomb' ? T.BOMB : T.RAINBOW);
      renderBackpack();
      drawStatic();
      toast(key === 'startBomb' ? '自动放置炸弹并引爆 💣' : '自动使用彩虹 🌈');
      AudioManager.playSFX('bomb');
      await sleep(280);
      await detonateAt(spot[0], spot[1]);
      // 引爆后的掉落可能凑出自然连消，一并消完
      if (findMatches().size) await resolveBoard(null);

      if (S.goal && Goals.isComplete(S.goal)) {
        await sleep(240);
        levelWin();
        return true;
      }
    }
    return false;
  }

  async function handleOutOfResource() {
    if (rescuing || !S.playing) return;
    // 无尽 / 冲刺 / 节奏：步数或时间用完直接结束，不动背包道具
    if (S.mode && S.mode !== 'main') { endModeRun(); return; }
    rescuing = true;
    S.busy = true;
    Input.setEnabled(false);

    // 1) 棋盘上剩下的特殊块（十字线 / 炸弹 / 彩虹）：按生成先后依次生效
    const won = await detonateBoardSpecials();
    if (won && S.playing) {
      S.busy = false;
      rescuing = false;
      await sleep(200);
      levelWin();
      return;
    }

    // 2) 背包里剩下的道具（+3 步 / 炸弹 / 彩虹）继续救场
    const saved = await autoUseLeftoverItems();
    S.busy = false;
    rescuing = false;
    if (saved) {
      // 救回来了：限时关要把计时器重新跑起来
      if (S.playing) {
        Input.setEnabled(true);
        if (S.timerOn && S.timeLeft > 0) startTimer();
      }
      return;
    }
    // 3) 差一点点：给一次「再来 3 步」的机会（主线才有）
    if (maybeOfferRevive()) return;
    endGame();
  }

  function endGame() {
    if (!S.playing) return;
    if (S.mode && S.mode !== 'main') { endModeRun(); return; }
    S.playing = false;
    stopTimer();
    stopBeatLoop();
    Input.setEnabled(false);

    const remainRatio = S.timerOn ? S.timeLeft / (S.levelDef.goal.time || 1) : S.moves / (S.levelDef.moves || 1);
    const passed = Goals.isComplete(S.goal);
    const stars = passed ? Goals.stars(S.levelDef, S.score, remainRatio) : 0;
    // 没通关也记本关最高分（只记分不加星）；第一次玩这关同样算「新纪录」
    const rec = S.daily
      ? Store.recordDaily(S.score, stars)
      : Store.recordLevel(S.level, S.score, stars);
    if (!S.daily) S.menuLevel = S.level;
    if (!S.daily) Store.markPlayed(S.level);
    if (S.daily) refreshMenu();
    const coins = passed ? Math.max(10, Math.floor(S.score / 100)) : Math.floor(S.score / 300);
    Store.addCoins(coins);
    Tasks.report('play', 1);
    Tasks.report('score', S.score);

    AudioManager.playSFX(passed ? 'star' : 'gameover', { stars: Math.max(1, stars) });
    updateHUD();

    const box = $('game-over');
    if (box) {
      $('final-score').textContent = '0';
      $('final-high').textContent = S.daily
        ? Store.getDailyRecord().best
        : Store.getLevelRecord(S.level).score;
      $('final-level').textContent = S.daily ? '每日挑战' : S.level;
      $('final-coins').textContent = '+' + coins;
      $('game-over-title').textContent = passed ? '目标达成' : '步数耗尽';
      $('final-new-record').style.display = 'none';
      box.style.display = 'flex';
      // 新纪录等分数滚完再亮
      setTimeout(() => {
        countUp($('final-score'), S.score, 720, () => {
          if (rec.isNewScore) $('final-new-record').style.display = 'inline-flex';
        });
      }, 30);
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
      cargoLeft: S.cargoLeft,
      rescueLeft: S.rescueLeft,
      score: S.score,
      moves: S.moves,
      timeLeft: S.timeLeft,
      jellyLeft: S.jellyLeft,
      goalCurrent: S.goal ? { current: S.goal.current, byColor: S.goal.byColor, jellyCleared: S.goal.jellyCleared } : null,
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
      S.goal.byColor = s.goalCurrent.byColor || S.goal.byColor;
      S.goal.jellyCleared = s.goalCurrent.jellyCleared || 0;
    }
    updateHUD();
    updateTargetBar();
    drawStatic();
    return true;
  }

  // ==================== 面板 ====================
  function hideAllOverlays() {
    ['main-menu', 'settings-menu', 'volume-menu', 'custom-music-menu', 'music-history-menu', 'playlist-menu',
      'music-library-menu', 'rename-menu', 'tasks-menu', 'shop-menu', 'history-menu', 'backpack-menu',
      'rules-menu', 'logout-confirm', 'logout-confirm2', 'pause-menu',
      'chapters-menu', 'story-menu', 'achievements-menu', 'collection-menu', 'welfare-menu',
      'leaderboard-menu', 'modes-menu', 'revive-menu', 'mode-over',
      'level-clear', 'game-over', 'game-complete', 'daily-done'].forEach((id) => {
      const el = $(id);
      if (el) el.style.display = 'none';
    });
    setView('game');
  }

  // 主页与游戏中的容器高度不同：主页内容更高，需要更长的白色背景
  const MENU_PANELS = ['main-menu', 'settings-menu', 'volume-menu', 'custom-music-menu',
    'music-history-menu', 'playlist-menu', 'music-library-menu', 'rename-menu',
    'tasks-menu', 'shop-menu', 'history-menu', 'backpack-menu', 'rules-menu', 'admin-menu',
    'chapters-menu', 'achievements-menu', 'collection-menu', 'welfare-menu',
    'leaderboard-menu', 'modes-menu', 'story-menu', 'daily-done'];

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

    const signBox = $('signin-info');
    if (signBox) {
      const st = Store.getTaskState();
      const can = Store.canSignIn();
      signBox.innerHTML = can
        ? '连续签到第 <b>' + (st.signDay + 1) + '</b> 天可领奖励'
        : '今日已签到（第 <b>' + st.signDay + '</b> 天）';
      const btn = $('btn-signin');
      if (btn) btn.disabled = !can;
    }
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

  function renderShop() {
    const list = $('shop-list');
    if (!list) return;
    const wallet = Store.getWallet();
    $('shop-coins').textContent = wallet.coins;
    list.innerHTML = '';
    Tasks.SHOP.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'shop-row';
      row.innerHTML =
        '<span class="shop-icon">' + item.icon + '</span>' +
        '<div class="shop-info"><b>' + item.name + '</b><small>' + item.desc + '</small></div>' +
        '<span class="shop-own">持有 ' + (wallet.items[item.key] || 0) + '</span>' +
        '<button class="shop-buy" ' + (wallet.coins < item.price ? 'disabled' : '') + '>🪙 ' + item.price + '</button>';
      row.querySelector('.shop-buy').addEventListener('click', () => {
        openBuyConfirm(item);
      });
      list.appendChild(row);
    });
  }

  // 背包：展示买到的道具，并可在局内直接使用
  const ITEM_ACTION = {
    extraMoves: '使用',
    shuffle: '使用',
    undo: '使用',
    startBomb: '放置',
    rainbow: '使用'
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
    const wallet = Store.getWallet();
    if ((wallet.items[key] || 0) <= 0) {
      toast('道具数量不足');
      return false;
    }

    // 先扣道具再刷新数值，避免徽章把刚用掉的那 1 个也算进总数
    Store.useItem(key);

    if (key === 'extraMoves') {
      if (S.timerOn) {
        S.timeLeft += 10;
        toast('时间 +10 秒');
      } else {
        S.moves += 3;
        toast('步数 +3');
      }
      updateHUD();
      checkMovesWarning();
    } else if (key === 'shuffle') {
      S.shuffleLeft += 1;
      updateHUD();
      toast('洗牌 +1 次');
    } else if (key === 'undo') {
      S.undoLeft += 1;
      updateHUD();
      toast('撤回 +1 次');
    } else if (key === 'startBomb' || key === 'rainbow') {
      // 随机挑一个普通格变成炸弹 / 彩虹
      const spots = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!S.board[r][c] || S.board[r][c].special) continue;
          spots.push([r, c]);
        }
      }
      if (!spots.length) {
        toast('棋盘上没有可放置的位置');
        return false;
      }
      const spot = spots[randInt(spots.length)];
      markSpecial(spot[0], spot[1], key === 'startBomb' ? T.BOMB : T.RAINBOW);
      drawStatic();
      AudioManager.playSFX('bomb');
      toast(key === 'startBomb' ? '已在随机位置放了一颗炸弹' : '已把一块变成彩虹');
    }

    renderBackpack();
    return true;
  }

  function renderBackpack() {
    const list = $('backpack-list');
    if (!list) return;
    const hint = $('backpack-hint');
    if (hint) {
      hint.textContent = canUseItems()
        ? '点「使用」立即对本局生效'
        : '道具在游戏中使用；开始一局后即可点「使用」';
    }
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
        '<div class="shop-info"><b>' + item.name + '</b><small>' + item.desc + '</small></div>' +
        '<span class="shop-own">x' + wallet.items[item.key] + '</span>';
      const useBtn = document.createElement('button');
      useBtn.className = 'shop-buy';
      useBtn.textContent = ITEM_ACTION[item.key] || '使用';
      useBtn.disabled = !canUseItems();
      useBtn.addEventListener('click', () => useBackpackItem(item.key));
      row.appendChild(useBtn);
      list.appendChild(row);
    });
  }

  // 关卡记录：点任意一关 → 回主页，并把主页当前关卡切到这一关
  function selectMenuLevel(lv) {
    S.menuLevel = Math.max(1, Math.min(lv, maxMainLevel()));
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

  // 毕业结算画面：每次打开都按存档里的最新数据重新算（总得分 / 总星数）
  function showCompletePanel() {
    const prog = Store.getProgress() || {};
    let totalScore = 0, totalStars = 0;
    Object.keys(prog).forEach((k) => {
      totalScore += (prog[k] && prog[k].score) || 0;
      totalStars += (prog[k] && prog[k].stars) || 0;
    });
    const sc = $('complete-total-score'), st = $('complete-total-stars');
    if (st) st.textContent = String(totalStars);
    if (sc) {
      sc.textContent = '0';
      countUp(sc, totalScore, 900);
    }
    const panel = $('game-complete');
    if (panel) panel.style.display = 'flex';
  }

  function renderHistory() {
    const list = $('history-list');
    if (!list) return;
    // 全通关才显示「重现结算画面」
    const replay = $('btn-replay-ending');
    if (replay) replay.style.display = allLevelsCleared() ? 'inline-block' : 'none';
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
      // 三列等宽左对齐：关卡名 | 星星（固定宽） | 分数（固定宽）
      const starStr = '<span class="star-on">' + '⭐'.repeat(rec.stars) + '</span>' +
        '<span class="star-off">' + '⭐'.repeat(3 - rec.stars) + '</span>';
      // 已解锁的关卡在同样的位置、同样的字号标出模式；未解锁显示「未解锁」
      let tag = ' <small class="lock-tag">未解锁</small>';
      if (!locked) {
        const def = getLevelDef(i);
        const modeName = def && def.goal ? (Goals.LABEL[def.goal.type] || '') : '';
        tag = modeName ? ' <small class="mode-tag">' + modeName + '</small>' : '';
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
    if (!cur) return;
    // 用 rect 算「条目在滚动内容里的位置」：offsetTop 是相对 #history-menu 的，
    // 会把标题等面板高度算进来，导致滚动位置算偏（滑到最底/最顶）
    const listRect = list.getBoundingClientRect();
    const curRect = cur.getBoundingClientRect();
    const curTop = curRect.top - listRect.top + list.scrollTop;
    const max = Math.max(0, list.scrollHeight - list.clientHeight);
    // 让当前关卡垂直居中
    const target = curTop - (list.clientHeight - cur.offsetHeight) / 2;
    const top = Math.max(0, Math.min(target, max));
    const from = list.scrollTop;
    if (Math.abs(top - from) < 1) return; // 已经到位，不用滑
    // 自己补间，兼容不支持平滑滚动 / 虚拟时钟的环境
    const dur = 320;
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      list.scrollTop = from + (top - from) * e;
      if (p < 1) setTimeout(step, 16);
    };
    setTimeout(step, 40);
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

  // 省份名单：计数器 key 只支持英文字母，这里存「全名 → 拼音代号」
  const PROVINCES = [
    ['北京市', 'beijing'], ['天津市', 'tianjin'], ['上海市', 'shanghai'], ['重庆市', 'chongqing'],
    ['河北省', 'hebei'], ['山西省', 'shanxi'], ['辽宁省', 'liaoning'], ['吉林省', 'jilin'],
    ['黑龙江省', 'heilongjiang'], ['江苏省', 'jiangsu'], ['浙江省', 'zhejiang'], ['安徽省', 'anhui'],
    ['福建省', 'fujian'], ['江西省', 'jiangxi'], ['山东省', 'shandong'], ['河南省', 'henan'],
    ['湖北省', 'hubei'], ['湖南省', 'hunan'], ['广东省', 'guangdong'], ['海南省', 'hainan'],
    ['四川省', 'sichuan'], ['贵州省', 'guizhou'], ['云南省', 'yunnan'], ['陕西省', 'shaanxi'],
    ['甘肃省', 'gansu'], ['青海省', 'qinghai'], ['台湾省', 'taiwan'],
    ['内蒙古自治区', 'neimenggu'], ['广西壮族自治区', 'guangxi'], ['西藏自治区', 'xizang'],
    ['宁夏回族自治区', 'ningxia'], ['新疆维吾尔自治区', 'xinjiang'],
    ['香港', 'xianggang'], ['澳门', 'aomen']
  ];

  // 国外 IP 单独一行（算进全网点击，但不归属任何省份）
  const PROV_OVERSEAS = ['🌍 海外', 'overseas'];

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
      // 国外 IP：计入「🌍 海外」（单独一行，也算进全网点击）
      if (known) { hit('prov_' + PROV_OVERSEAS[1]); provCounted = true; return true; }
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
  //   · 国外 IP   → 记到「🌍 海外」一行（固定排最后，也算进全网点击）；
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
  // 计数器只增不减：读回来的数比上次缓存小，一定是请求被限流/截断了，取大者，
  // 否则每次刷新数字都会往回掉（之前「每次进来都不一样」就是这个原因）
  function readAllProv() {
    const cached = provValsCache();
    const list = PROVINCES.concat([PROV_OVERSEAS]);
    return Promise.all(list.map((p) => readProvCount(p[1]).then((n) => {
      const prev = typeof cached[p[1]] === 'number' ? cached[p[1]] : 0;
      if (n >= 0) n = Math.max(n, prev);
      else n = prev;                                     // 读失败 → 沿用上次
      if (n > 0) cached[p[1]] = n;
      return { name: p[0], code: p[1], n: n };
    }))).then((rows) => {
      if (!rows.some((r) => r.n >= 0)) return null;
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
      n: r.n
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
    }
    if (!rows.length && !(oversea && !k)) {
      list.innerHTML = '<li class="prov-empty">没有找到相关省份</li>';
      return;
    }
    let html = rows.map((r) =>
      '<li class="clickable" data-code="' + r.code + '"><span>' + escHtml(r.name) +
      '<i class="prov-arrow">›</i></span><b>' + r.n + '</b></li>').join('');
    // 海外固定排最后（不管次数多少），不参与搜索、不可点
    if (oversea && !k) {
      html += '<li><span>' + escHtml(PROV_OVERSEAS[0]) + '</span><b>' + oversea.n + '</b></li>';
    }
    list.innerHTML = html;
    Array.prototype.forEach.call(list.querySelectorAll('li.clickable'), (li) => {
      li.addEventListener('click', () => {
        const row = provRows.find((r) => r.code === li.getAttribute('data-code'));
        if (row) openProvCities(row);
      });
    });
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
      if (rec && typeof rec.score === 'number') sum += rec.score;
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
    const fontMinus = $('btn-rule-font-minus');
    if (fontMinus) fontMinus.addEventListener('click', () => stepRuleFont(-1));
    const fontPlus = $('btn-rule-font-plus');
    if (fontPlus) fontPlus.addEventListener('click', () => stepRuleFont(1));
    const rulesClose = $('btn-close-rules');
    if (rulesClose) rulesClose.addEventListener('click', () => {
      $('rules-menu').style.display = 'none';
      if (quietPaused) quietResumeGame();
      else showOverlay('main-menu');
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
    // 全通关后：在「返回」下面多一个「重现结算画面」，数据实时取最新存档
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
      const d = Tasks.getDailyChallenge();
      startLevel(9999, { def: d, seed: d.seed, daily: true });
    });
    const dailyDoneHome = $('btn-daily-done-home');
    if (dailyDoneHome) dailyDoneHome.addEventListener('click', () => {
      $('daily-done').style.display = 'none';
      showOverlay('main-menu');
      refreshMenu();
    });
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
      Store.wipeAll();
      location.reload();
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

    // ==================== 隐藏后台：同时按住奶龙图案 + 注销键 3 秒 ====================
    const adminMascot = (typeof document.querySelector === 'function')
      ? document.querySelector('#main-menu .mascot') : null;
    const adminLogout = $('btn-logout');
    if (adminMascot && adminLogout) {
      let holds = 0;
      let holdTimer = null;
      let suppressLogout = false;
      const openAdmin = () => {
        holdTimer = null;
        holds = 0;
        suppressLogout = true; // 松手时不要误触「注销」确认框
        renderAdmin();
        fetchGeoFast().then(renderAdmin);
        // 省份合计刷新后，后台「全网」跟着更新（两边数字始终一致）
        refreshProvStatsThrottled().then(renderAdmin);
        AudioManager.playSFX('select');
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

    // 长按「🌐 全网」板块 3 秒 → 省份统计页
    // 手机上手指微动/页面滚动都会让 pointer 系列事件被 cancel，
    // 所以这里同时接 pointer 与 touch，并给 12px 的容差，只认「按住不动 3 秒」
    const globalSec = $('admin-global-sec') || $('admin-global-title');
    if (globalSec) {
      let pressTimer = null;
      let startX = 0, startY = 0, fired = false;
      const cancel = () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      };
      const begin = (x, y) => {
        cancel();
        fired = false;
        startX = x; startY = y;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          fired = true;
          try { AudioManager.playSFX('coin'); } catch (e) {}
          openProvStats();
        }, 3000);
      };
      const move = (x, y) => {
        if (!pressTimer) return;
        if (Math.abs(x - startX) > 12 || Math.abs(y - startY) > 12) cancel();
      };
      const end = () => { cancel(); };

      globalSec.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        begin(e.clientX, e.clientY);
      });
      globalSec.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
        globalSec.addEventListener(ev, end));

      globalSec.addEventListener('touchstart', (e) => {
        const t = e.touches && e.touches[0];
        if (t) begin(t.clientX, t.clientY);
      }, { passive: true });
      globalSec.addEventListener('touchmove', (e) => {
        const t = e.touches && e.touches[0];
        if (t) move(t.clientX, t.clientY);
      }, { passive: true });
      ['touchend', 'touchcancel'].forEach((ev) => globalSec.addEventListener(ev, end, { passive: true }));

      // 长按不要弹系统菜单
      globalSec.addEventListener('contextmenu', (e) => e.preventDefault());
      // 已经触发跳转后，松手不要再触发一次点击
      globalSec.addEventListener('click', (e) => {
        if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; }
      }, true);
    }

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

    on('btn-chapters', () => { renderChapterMap(); showOverlay('chapters-menu'); });
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
    on('btn-collection', () => { renderSkinPanel(); showOverlay('collection-menu'); });
    on('btn-close-skins', () => { $('collection-menu').style.display = 'none'; showOverlay('main-menu'); });
    on('btn-welfare', () => { renderWelfare(); showOverlay('welfare-menu'); });
    on('btn-close-welfare', () => { $('welfare-menu').style.display = 'none'; showOverlay('main-menu'); });
    on('btn-welfare-signin', doSignIn);
    on('btn-wheel', doWheel);
    on('btn-leaderboard', () => {
      renderLeaderboard();
      showOverlay('leaderboard-menu');
      if (typeof Board !== 'undefined') Board.open(myBestEntry());   // 拉全网 + 开实时推送
    });
    on('btn-close-lb', () => {
      $('leaderboard-menu').style.display = 'none';
      if (typeof Board !== 'undefined') Board.close();
      showOverlay('main-menu');
    });
    on('btn-lb-save', saveNick);
    on('btn-lb-add', addFriendFromInput);
    on('btn-lb-copy', copyMyCode);

    on('btn-story-go', closeStory);
    on('btn-story-skip', closeStory);
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
    const completeHome = $('btn-complete-home');
    if (completeHome) completeHome.addEventListener('click', () => {
      $('game-complete').style.display = 'none';
      S.playing = false;
      S.menuLevel = maxMainLevel();
      showOverlay('main-menu');
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
      $('settings-menu').style.display = 'none';
      syncVolumeUI();
      showOverlay('volume-menu');
    });
    const backVol = $('btn-back-settings');
    if (backVol) backVol.addEventListener('click', () => {
      $('volume-menu').style.display = 'none';
      showOverlay('settings-menu');
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
    const signBtn = $('btn-signin');
    if (signBtn) signBtn.addEventListener('click', () => {
      const r = Store.signIn();
      if (!r.ok) {
        toast('今天已经签过啦');
        return;
      }
      toast('签到成功：第 ' + r.day + ' 天 +' + r.reward.coins + ' 金币' + (r.reward.item ? ' +彩虹' : ''));
      AudioManager.playSFX('coin');
      renderTasks();
      updateHUD();
    });
    const shopBtn = $('btn-goto-shop');
    if (shopBtn) shopBtn.addEventListener('click', () => {
      renderShop();
      showOverlay('shop-menu');
    });
    const closeShop = $('btn-close-shop');
    if (closeShop) closeShop.addEventListener('click', () => $('shop-menu').style.display = 'none');

    // 遮罩点击关闭（§25）
    document.querySelectorAll('.overlay').forEach((ov) => {
      ov.addEventListener('click', (e) => {
        if (e.target === ov && ['main-menu', 'level-clear', 'game-over', 'game-complete'].indexOf(ov.id) < 0) {
          ov.style.display = 'none';
        }
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
    if ($('daily-done-score')) $('daily-done-score').textContent = rec.best || 0;
    showOverlay('daily-done');
  }

  function refreshMenu() {
    const prog = Store.getProgress();
    const maxUnlocked = Store.maxUnlockedLevel(maxMainLevel());
    const max = maxMainLevel();

    // 主页关卡：优先用关卡记录里选中的，其次上次存档的进度
    if (!S.menuLevel) {
      const saved = Store.getSettings().menuLevel;
      S.menuLevel = saved || maxUnlocked;
    }
    S.menuLevel = Math.max(1, Math.min(S.menuLevel, max));

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

    const stars = $('menu-total-stars');
    if (stars) stars.textContent = Store.totalStars();
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

  // ==================== 主循环 ====================
  function loop(now) {
    const dt = Math.min(0.05, (now - (S.lastFrame || now)) / 1000);
    S.lastFrame = now;

    if (!FX.isEmpty() || FX.getShakeOffset().x || FX.getShakeOffset().y) {
      FX.update(dt);
      if (!S.busy) drawStatic();
    }
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

    // 排行榜：别人成绩一变就重绘（只在面板开着的时候）
    if (typeof Board !== 'undefined') {
      Board.onChange(() => {
        const lb = $('leaderboard-menu');
        if (lb && lb.style.display === 'flex') renderLeaderboard();
      });
      publishMyScore();
    }

    attachUI();
    if (global_Music()) global_Music().init();
    refreshMenu();
    Tasks.ensureToday();
    showOverlay('main-menu');
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

  function renderChapterMap() {
    const box = $('chapters-list');
    if (!box) return;
    const maxU = Store.maxUnlockedLevel(maxMainLevel());
    box.innerHTML = '';
    chapters().forEach((ch) => {
      const p = chapterProgress(ch);
      const locked = maxU < ch.from;
      const card = document.createElement('div');
      card.className = 'chapter-card' + (locked ? ' locked' : '');
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
        b.className = 'level-chip' + (open ? '' : ' locked') + ((rec.stars || 0) >= 1 ? ' done' : '');
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
      if (locked) {
        const lk = document.createElement('div');
        lk.className = 'chapter-lock';
        lk.textContent = '通关上一章后解锁';
        card.appendChild(lk);
      }
      box.appendChild(card);
    });
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
    if (firstOfChapter && !Meta.storySeen(chId)) showStory(chId, go);
    else go();
  }

  // ---------- 提示：花一次机会高亮一组可走的交换 ----------
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
  const REVIVE_COST = 200;
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
      yes.textContent = can ? ('花 ' + REVIVE_COST + ' 金币，再来 3 步') : '金币不足';
    }
    S.busy = true;
    Input.setEnabled(false);
    stopTimer();
    showOverlay('revive-menu');
    return true;
  }

  function doRevive() {
    if (!Store.spendCoins(REVIVE_COST)) { toast('金币不够'); return; }
    S.reviveUsed = true;
    if (S.timerOn) S.timeLeft = Math.max(0, S.timeLeft) + 15;
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
    toast(S.timerOn ? '续命成功：+15 秒' : '续命成功：+3 步');
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
      if (el) el.textContent = best[k] > 0 ? ('最佳 ' + best[k]) : '还没挑战过';
    });
  }

  function startMode(mode) {
    const m = MODES[mode];
    if (!m) return;
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
  }

  function endModeRun() {
    S.playing = false;
    stopTimer();
    stopBeatLoop();
    Input.setEnabled(false);
    document.body.classList.remove('frenzy');
    const mode = S.mode === 'main' ? 'endless' : S.mode;
    const r = Meta.recordBest(mode, S.score);
    const coins = Math.max(5, Math.floor(S.score / 200));
    Store.addCoins(coins);
    Meta.bump('modes', 1);
    Meta.setMax('maxCombo', S.maxCombo);
    const got = Meta.check();
    if (got.length) setTimeout(() => toast('🏆 解锁成就：' + got[0].name), 1000);
    if ($('mode-over-title')) $('mode-over-title').textContent = (MODES[mode] || {}).name + ' 结束';
    if ($('mode-over-score')) $('mode-over-score').textContent = '0';
    if ($('mode-over-best')) $('mode-over-best').textContent = r.best;
    if ($('mode-over-coins')) $('mode-over-coins').textContent = '+' + coins;
    if ($('mode-over-record')) $('mode-over-record').style.display = r.isNew ? 'inline-flex' : 'none';
    if ($('mode-over')) $('mode-over').style.display = 'flex';
    setTimeout(() => countUp($('mode-over-score'), S.score, 620), 30);
    S.mode = 'main';
  }

  // ---------- 成就墙 ----------
  function renderAchPanel() {
    Meta.renderAchievements($('ach-list'));
    const n = Meta.unlockedIds().length;
    if ($('ach-total')) $('ach-total').textContent = n + ' / ' + Meta.ACHIEVEMENTS.length;
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

  // ---------- 福利：签到 + 转盘 ----------
  function renderWelfare() {
    const info = Meta.signInfo();
    const dayBox = $('welfare-sign');
    if (dayBox) {
      dayBox.innerHTML = '';
      info.rewards.forEach((r, i) => {
        const d = document.createElement('div');
        const signed = (i + 1) <= info.day;
        d.className = 'sign-day' + (signed ? ' signed' : '') + (i + 1 === info.day + 1 ? ' today' : '');
        d.innerHTML = '<i>第 ' + (i + 1) + ' 天</i><b>' + (r.item ? '🌈' : r.coins) + '</b>';
        dayBox.appendChild(d);
      });
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
  }

  function doSignIn() {
    const r = Meta.signIn();
    if (r.ok) {
      toast('签到成功：+' + r.reward.coins + ' 金币' + (r.reward.item ? ' +彩虹道具' : ''));
      AudioManager.playSFX('coin');
      renderWelfare();
      refreshMenu();
    } else {
      toast('今天已经签过了');
    }
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

  // ---------- 排行榜（本地 + 好友成绩码） ----------
  function myBestEntry() {
    const all = Store.getProgress();
    let best = { score: 0, level: 0 };
    Object.keys(all).forEach((k) => {
      const s = all[k].score || 0;
      if (s > best.score) best = { score: s, level: Number(k) || 0 };
    });
    return { uid: Meta.myUid(), name: Meta.nickname(), score: best.score, level: best.level, ts: Date.now(), me: true };
  }

  // 排行榜：自己的本周最佳 + 好友（好友永久保留，手动删除才消失）
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

  function renderLeaderboard() {
    const box = $('lb-list');
    if (!box) return;
    const me = myBestEntry();

    // 三份数据合并：全网（公共中转）+ 本机导入的好友 + 自己
    // 同一个 uid 只留一条：分数取最高，昵称取时间最新的
    const friendUids = {};
    Meta.friends().forEach((f) => { friendUids[f.uid] = true; });
    const raw = [];
    if (typeof Board !== 'undefined') raw.push.apply(raw, Board.list());
    Meta.friends().forEach((f) => raw.push({ uid: f.uid, name: f.name, score: f.score, ts: f.ts }));
    raw.push(me);

    const byId = {};
    raw.forEach((r) => {
      if (!r || !r.uid) return;
      // 0 分的（还没通关过）不占榜位
      if (!(r.score > 0) && r.uid !== me.uid) return;
      const cur = byId[r.uid];
      if (!cur) {
        byId[r.uid] = { uid: r.uid, name: r.name, score: r.score || 0, ts: r.ts || 0 };
        return;
      }
      if ((r.ts || 0) >= (cur.ts || 0)) cur.name = r.name;
      if ((r.score || 0) > cur.score) cur.score = r.score;
    });

    const rows = Object.keys(byId).map((k) => {
      const r = byId[k];
      return {
        uid: r.uid,
        name: r.name,
        score: r.score,
        me: r.uid === me.uid,
        friend: !!friendUids[r.uid] && r.uid !== me.uid
      };
    }).sort((a, b) => b.score - a.score);

    box.innerHTML = '';
    lbOpenRow = null;
    rows.slice(0, 20).forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row' + (r.me ? ' me' : '');
      const inner = document.createElement('div');
      inner.className = 'lb-swipe';
      inner.innerHTML = '<span class="lb-rank">' + (i + 1) + '</span>' +
        '<span class="lb-name">' + escHtml(String(r.name || '玩家').slice(0, 8)) +
        (r.me ? '<i class="lb-me">我</i>' : r.friend ? '<i>好友</i>' : '') + '</span>' +
        '<span class="lb-score">' + (r.score || 0) + '</span>';
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
    if (!rows.length) {
      const d = document.createElement('div');
      d.className = 'lb-empty';
      d.textContent = '还没有成绩，通关一局就会自动上榜';
      box.appendChild(d);
    }
    if ($('lb-nick')) $('lb-nick').value = Meta.nickname();
  }

  // 自己的成绩变了就立刻发到榜上（最快 6 秒一次，节流在 Board 里做）
  // 还没打过分的（0 分）先不上榜，免得榜里全是 0 分的空名字
  function publishMyScore(force) {
    if (typeof Board === 'undefined') return;
    const me = myBestEntry();
    if (!(me.score > 0)) return;
    try { Board.publish(me, force); } catch (e) {}
  }

  function recordMyScore() { publishMyScore(); }

  function copyMyCode() {
    const me = myBestEntry();
    const code = Meta.makeCode(me);
    if (!code) { toast('生成失败'); return; }
    const done = () => toast('成绩码已复制，发给朋友贴上就行');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => {
        if ($('lb-code')) { $('lb-code').value = code; toast('已填入输入框，手动复制一下'); }
      });
    } else if ($('lb-code')) {
      $('lb-code').value = code;
      toast('已填入输入框，手动复制一下');
    }
  }

  function addFriendFromInput() {
    const raw = $('lb-code') ? $('lb-code').value : '';
    const r = Meta.addFriend(raw);
    if (!r.ok) { toast(r.reason || '成绩码无效'); AudioManager.playSFX('invalid'); return; }
    // 好友的成绩也放进共享榜，别人点开排行榜同样能看到
    if (typeof Board !== 'undefined' && r.entry && r.entry.uid) {
      try { Board.publish({ uid: r.entry.uid, name: r.entry.name, score: r.entry.score, level: r.entry.level }, true); } catch (e) {}
    }
    toast(r.updated ? ('已更新好友：' + r.entry.name + ' ' + r.entry.score) : ('已加入好友：' + r.entry.name + ' ' + r.entry.score));
    if ($('lb-code')) $('lb-code').value = '';
    renderLeaderboard();
    AudioManager.playSFX('coin');
  }

  function saveNick() {
    const v = $('lb-nick') ? $('lb-nick').value : '';
    Meta.setNickname(v);
    toast('昵称已改为「' + Meta.nickname() + '」');
    // 改名立刻同步到榜上（别人开着排行榜会实时看到新昵称）
    publishMyScore(true);
    renderLeaderboard();
    refreshMenu();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // 调试 / 自动化测试钩子（不影响正常玩法）
  window.__nl_test = {
    start: startLevel,
    state: () => S,
    win: levelWin,
    end: endGame,
    outOfResource: handleOutOfResource,
    collectSpecials: collectSpecials,
    swap: trySwap,
    undoMove: undo,
    findMatches: findMatches,
    autoPause: autoPauseIfPlaying,
    pause: pauseGame,
    refreshMenu: refreshMenu,
    dailyCompleted: dailyCompleted,
    hud: updateHUD,
    openProvStats: openProvStats,
    renderAdmin: renderAdmin,
    detonateAt: detonateAt,
    markSpecial: markSpecial,
    openProvCities: openProvCities,
    matchProvince: matchProvince,
    matchCity: matchCity,
    formatRegion: formatRegion,
    bumpProvHits: bumpProvHits,
    refreshProvStats: refreshProvStats,
    provRows: () => provRows,
    statsTotal: statsTotal,
    renderProvList: renderProvList,
    resolveClear: resolveClear,
    collectCargo: collectCargo,
    crackIceAt: crackIceAt,
    iceTotal: iceTotal,
    endModeRun: endModeRun,
    drawStatic: drawStatic,
    resetProvCounted: () => { provCounted = false; }
  };
})();
