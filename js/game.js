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
    lastFrame: 0
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
      const done = () => {
        loaded++;
        // 每张图到位就重绘一次：即使其它图还没到，先到的也能显示
        drawStatic();
        if (loaded >= 6) settle();
      };
      img.onload = done;
      img.onerror = done;
      img.src = './assets/' + i + '.jpg';
      IMAGES[i] = img;
    }
    // 兜底：网络极慢也不让「加载中」卡死（方块会先用颜色占位，图到了再补上）
    setTimeout(() => {
      if (!imagesReady) settle();
    }, 4000);
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
    for (let r = 0; r < ROWS; r++) {
      S.board[r] = [];
      S.jelly[r] = [];
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
      }
    }
    placeJelly();
    S.nextQueue = [randType(), randType(), randType()];
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
        const same = c < COLS && S.board[r][c] && S.board[r][c - 1] && S.board[r][c].type === S.board[r][c - 1].type;
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
        const same = r < ROWS && S.board[r][c] && S.board[r - 1][c] && S.board[r][c].type === S.board[r - 1][c].type;
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
    if (findMatches().size > 0 || !hasPossibleMove()) initBoard();
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
    if (imagesReady && img && img.complete && img.naturalWidth > 0) {
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

  // 静态重绘（无动画）
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
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!S.board[r][c]) continue;
          const fromR = fallFrom[kOf(r, c)];
          const opts = jellyAt(r, c) ? { scale: JELLY_BLOCK_SCALE } : null;
          if (fromR !== undefined && fromR !== r) {
            const y = (fromR * CELL) + (r * CELL - fromR * CELL) * e;
            drawBlock(c * CELL, y, S.board[r][c], opts);
          } else {
            drawBlock(c * CELL, r * CELL, S.board[r][c], opts);
          }
        }
      }
      FX.render(ctx);
      ctx.restore();
    });
  }

  // ==================== 连击 ====================
  function comboMult(n) {
    return MULT[Math.min(n, MULT.length - 1)];
  }

  function bumpCombo() {
    const now = performance.now();
    if (now - S.lastClearAt > COMBO_WINDOW) S.combo = 1;
    else S.combo++;
    S.lastClearAt = now;
    S.comboUntil = now + COMBO_DECAY;
    S.maxCombo = Math.max(S.maxCombo, S.combo);
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
  async function resolveClear(cells, boomPoints) {
    if (!cells || !cells.size) return 0;
    boomPoints = boomPoints || [];

    // 统计颜色（用于收集关）
    const colors = {};
    let jellyHit = 0;
    cells.forEach((k) => {
      const p = Specials.parse(k);
      const b = S.board[p.r][p.c];
      if (b) colors[b.type] = (colors[b.type] || 0) + 1;
      if (S.jelly[p.r] && S.jelly[p.r][p.c]) jellyHit++;
    });

    // 特殊块触发的任务
    boomPoints.forEach((bp) => {
      if (bp.type === T.BOMB) Tasks.report('bomb', 1);
      else if (bp.type === T.RAINBOW) Tasks.report('rainbow', 1);
      else Tasks.report('line', 1);
    });
    if (jellyHit > 0) Tasks.report('jelly', jellyHit);

    bumpCombo();
    const mult = comboMult(S.combo);
    const gained = Math.round(cells.size * 10 * mult);
    S.score += gained;
    S.levelStartScore = S.levelStartScore || 0;

    // 目标推进
    if (S.goal) {
      Goals.progress(S.goal, { scoreDelta: gained, colors: colors, jelly: jellyHit });
      updateTargetBar();
    }
    S.clearedCount += cells.size;
    updateHUD();

    // 特效
    boomPoints.forEach((bp) => {
      FX.explosion(bp.c * CELL + CELL / 2, bp.r * CELL + CELL / 2, CELL);
      if (bp.type === T.BOMB) FX.shake(3, 0.18);
      if (bp.type === T.RAINBOW) FX.shake(4, 0.25);
    });
    cells.forEach((k) => {
      const p = Specials.parse(k);
      const b = S.board[p.r][p.c];
      FX.burst(p.c * CELL + CELL / 2, p.r * CELL + CELL / 2, b ? FALLBACK_COLORS[b.type] : '#fff', 3);
    });

    const anchor = cells.size ? Specials.parse(cells.values().next().value) : { r: 0, c: 0 };
    FX.text(anchor.c * CELL + CELL / 2, anchor.r * CELL + CELL / 2,
      (S.combo >= 2 ? 'x' + S.combo + ' ' : '') + '+' + gained,
      S.combo >= 3 ? '#ff5c5c' : '#ffd75c', 20);

    if (boomPoints.some((b) => b.type === T.BOMB)) AudioManager.playSFX('bomb');
    else if (boomPoints.some((b) => b.type === T.LINE_H || b.type === T.LINE_V)) AudioManager.playSFX('line');
    else AudioManager.playSFX('match', { combo: S.combo });

    await animateClear(cells, S.combo);

    // 清除
    cells.forEach((k) => {
      const p = Specials.parse(k);
      if (S.jelly[p.r] && S.jelly[p.r][p.c]) {
        S.jelly[p.r][p.c] = 0;
        S.jellyLeft = Math.max(0, S.jellyLeft - 1);
      }
      S.board[p.r][p.c] = null;
    });

    // 掉落 + 补充
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
    drawStatic();
    return gained;
  }

  // 立即引爆某一格上的特殊块（供道具自动消耗使用）
  async function detonateAt(r, c) {
    const expanded = Specials.expandClears(S.board, ROWS, COLS, new Set([kOf(r, c)]), {});
    await resolveClear(expanded.cells, expanded.boomPoints);
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

  function specialName(t) {
    if (t === T.RAINBOW) return '彩虹';
    if (t === T.BOMB) return '炸弹';
    return '十字线';
  }

  // 引爆提示固定显示在棋盘正下方（#detonate-tip），不占用 toast
  function showDetonateTip(msg) {
    const el = $('detonate-tip');
    if (!el) return;
    if (msg) {
      el.textContent = msg;
      el.classList.add('show');
    } else {
      el.textContent = '';
      el.classList.remove('show');
    }
  }

  // 棋盘上剩下的特殊块：按生成先后一个个引爆，全部生效（含引爆后掉落产生的
  // 连消与新特殊块）之后才结束，返回是否因此达成了关卡目标。
  // 中途就算目标已达成也继续引爆完、把棋盘清干净，最后才进结算页。
  async function detonateBoardSpecials() {
    const all = collectSpecials();
    if (!all.length) return false;
    showDetonateTip('棋盘上还有 ' + all.length + ' 个特殊块，按生成顺序依次引爆');
    await sleep(420);

    for (let guard = 0; guard < 80; guard++) {
      const list = collectSpecials();
      if (list.length) {
        // 编号小的先生成、先引爆；编号相同（老存档）按行列顺序兜底
        list.sort((a, b) => (a.seq - b.seq) || (a.r - b.r) || (a.c - b.c));
        const t = list[0];
        FX.text(t.c * CELL + CELL / 2, t.r * CELL + CELL / 2 - CELL * 0.4,
          specialName(t.special) + '触发', '#ffb03a', 15);
        await detonateAt(t.r, t.c);
        // 一次爆破可能连带吃掉多个特殊块，剩余数量实时更新到棋盘下方
        const left = collectSpecials().length;
        showDetonateTip(left > 0 ? '正在引爆特殊块…还剩 ' + left + ' 个' : '特殊块全部引爆完毕');
        await sleep(260);
        continue;
      }
      // 特殊块清完：引爆后的掉落可能产生自然连消，也一并消完再结算
      if (findMatches().size === 0) break;
      await resolveBoard(null);
    }
    showDetonateTip('');
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
      d.src = './assets/' + t + '.jpg';
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
      if (S.jelly[p.r] && S.jelly[p.r][p.c]) {
        S.jelly[p.r][p.c] = 0;
        S.jellyLeft = Math.max(0, S.jellyLeft - 1);
      }
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

    saveRun();
  }

  // ==================== 撤销 / 洗牌 ====================
  // 快照 = 「走这一步之前」的完整局面：棋盘、果冻、分数、步数、目标进度全都要，
  // 这样撤回时目标栏和棋盘一起回到走之前（哪怕上一步连消了多次也是同一份快照）
  function makeHistorySnap() {
    return {
      board: JSON.parse(JSON.stringify(S.board)),
      jelly: JSON.parse(JSON.stringify(S.jelly)),
      score: S.score,
      moves: S.moves,
      jellyLeft: S.jellyLeft,
      clearedCount: S.clearedCount,
      goal: S.goal ? {
        current: S.goal.current,
        byColor: JSON.parse(JSON.stringify(S.goal.byColor || {})),
        jellyCleared: S.goal.jellyCleared || 0
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
    S.score = f.score;
    S.moves = f.moves;
    S.jellyLeft = f.jellyLeft;
    S.clearedCount = f.clearedCount != null ? f.clearedCount : S.clearedCount;
    // 目标栏一起撤回：收集数量 / 果冻数 / 得分进度全部回到走之前
    if (f.goal && S.goal) {
      S.goal.current = f.goal.current || 0;
      S.goal.byColor = f.goal.byColor || S.goal.byColor;
      S.goal.jellyCleared = f.goal.jellyCleared || 0;
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
    S.daily = !!opts.daily;
    // 主线只有 20 关，越界一律夹回
    S.level = S.daily ? 0 : Math.max(1, Math.min(level || 1, maxMainLevel()));
    S.levelDef = opts.def || getLevelDef(S.level);
    S.rng = opts.seed != null ? RNG.source(opts.seed) : null;

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
    S.busy = false;
    S.selected = null;
    S.dragTo = null;
    S.shakeCell = null;
    S.clearedCount = 0;
    S.undoLeft = 3;
    S.shuffleLeft = 3;
    S.specSeq = 0;

    applyTheme(S.levelDef.theme);
    initBoard();

    // 道具：开局炸弹（§7）
    if (opts.startBomb) {
      const r = randInt(ROWS), c = randInt(COLS);
      markSpecial(r, c, T.BOMB);
    }

    $('level').textContent = S.daily ? '每日挑战' : S.level;
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
    Input.setEnabled(false);
    S.selected = null;
    S.dragTo = null;
    updatePauseHint();
    drawStatic();
    showOverlay('pause-menu');
  }

  function resumeGame() {
    if (!S.paused) return;
    S.paused = false;
    const box = $('pause-menu');
    if (box) box.style.display = 'none';
    setView('game');
    Input.setEnabled(true);
    if (S.timerOn && S.playing) startTimer();
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
    if (lv) lv.textContent = S.daily ? '每日挑战' : S.level;
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
  }

  function updateTargetBar() {
    const bar = $('target-bar');
    if (!bar || !S.goal) return;
    if (S.goal.type === 'collect') {
      // 收集模式：显示对应棋子的准确图案（assets/{type}.jpg），不用颜色区分
      const parts = Object.keys(S.goal.target || {}).map((c) => {
        const cur = Math.min(S.goal.byColor[c] || 0, S.goal.target[c]);
        return '<span class="goal-chip"><img class="goal-icon" src="./assets/' + c + '.jpg" alt="图案' + c + '">' +
          cur + '/' + S.goal.target[c] + '</span>';
      }).join('');
      bar.innerHTML = '目标：收集 ' + parts;
    } else {
      bar.textContent = Goals.barText(S.goal);
    }
    bar.style.color = Goals.isComplete(S.goal) ? '#1a8f4a' : '#7c5cff';
  }

  function checkMovesWarning() {
    const c = $('moves-container');
    if (!c) return;
    if (!S.timerOn && S.moves <= 5) c.classList.add('step-warning');
    else c.classList.remove('step-warning');
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
    S.playing = false;
    stopTimer();
    Input.setEnabled(false);

    const remainRatio = S.timerOn
      ? S.timeLeft / (S.levelDef.goal.time || 1)
      : (S.moves / (S.levelDef.moves || 1));
    const stars = Goals.stars(S.levelDef, S.score, remainRatio);
    // 每日挑战也留一个「当天最佳」的纪录，第一次完成同样算新纪录
    const rec = S.daily
      ? Store.recordDaily(S.score)
      : Store.recordLevel(S.level, S.score, stars);
    if (!S.daily) S.menuLevel = S.level;
    if (!S.daily) Store.markPlayed(S.level);

    // 金币产出（§7）
    const coins = Math.max(10, Math.floor(S.score / 100));
    Store.addCoins(coins);
    Tasks.report('play', 1);
    Tasks.report('score', S.score);

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

    // 毕业面板（§10）
    if (S.levelDef.final) {
      const total = Object.keys(Store.getProgress()).reduce((s, k) => s + (Store.getProgress()[k].score || 0), 0);
      $('complete-total-score').textContent = '0';
      setTimeout(() => {
        if (box) box.style.display = 'none';
        $('game-complete').style.display = 'flex';
        countUp($('complete-total-score'), total, 900);
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
    endGame();
  }

  function endGame() {
    if (!S.playing) return;
    S.playing = false;
    stopTimer();
    Input.setEnabled(false);

    const remainRatio = S.timerOn ? S.timeLeft / (S.levelDef.goal.time || 1) : S.moves / (S.levelDef.moves || 1);
    const passed = Goals.isComplete(S.goal);
    const stars = passed ? Goals.stars(S.levelDef, S.score, remainRatio) : 0;
    // 没通关也记本关最高分（只记分不加星）；第一次玩这关同样算「新纪录」
    const rec = S.daily
      ? Store.recordDaily(S.score)
      : Store.recordLevel(S.level, S.score, stars);
    if (!S.daily) S.menuLevel = S.level;
    if (!S.daily) Store.markPlayed(S.level);
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
    if (!S.playing || S.daily) return;
    Store.saveRun({
      level: S.level,
      board: S.board,
      jelly: S.jelly,
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
      'level-clear', 'game-over', 'game-complete'].forEach((id) => {
      const el = $(id);
      if (el) el.style.display = 'none';
    });
    setView('game');
  }

  // 主页与游戏中的容器高度不同：主页内容更高，需要更长的白色背景
  const MENU_PANELS = ['main-menu', 'settings-menu', 'volume-menu', 'custom-music-menu',
    'music-history-menu', 'playlist-menu', 'music-library-menu', 'rename-menu',
    'tasks-menu', 'shop-menu', 'history-menu', 'backpack-menu', 'rules-menu', 'admin-menu'];

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
        const res = Tasks.buy(item.key);
        if (!res.ok) {
          toast(res.reason === 'no-coins' ? '金币不足' : '购买失败');
          return;
        }
        toast('已购买 ' + item.name);
        renderShop();
        updateHUD();
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
  const HITS_API = 'https://abacus.jasoncameron.dev/hit/nailong-xiaoxiaole-2026/opens';
  const ABACUS_BASE = 'https://abacus.jasoncameron.dev/';
  const GEO_API = 'https://ipwho.is/?lang=zh-CN';

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

  function matchProvince(region) {
    const r = (region || '').trim();
    if (!r) return null;
    for (let i = 0; i < PROVINCES.length; i++) {
      // 「四川省」这类全名去掉行政后缀就是匹配用的短名
      const short = PROVINCES[i][0].replace(/(维吾尔|回族)?自治区$|省$|市$/, '');
      if (r.indexOf(short) >= 0) return { name: PROVINCES[i][0], code: PROVINCES[i][1] };
    }
    return null;
  }

  // 每次打开页面，把所在省份的计数 +1（供后台省份统计网页读取）
  let provCounted = false;
  function bumpProvHits() {
    if (provCounted) return;
    provCounted = true;
    const p = matchProvince(Store.getNet().geo && Store.getNet().geo.region);
    if (!p || typeof fetch !== 'function') return;
    fetch(ABACUS_BASE + 'hit/nailong-xiaoxiaole-2026/prov_' + p.code, { cache: 'no-store' }).catch(() => {});
  }

  // 长按「🌐 全网」→ 跳转到省份统计网页（只显示 ≥1 的省份，从高到低，可搜索）
  // ============ 省份统计页（整页覆盖，不依赖 blob / 跳转，微信里也能打开）============
  let provRows = [];

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
    const url = ABACUS_BASE + 'get/nailong-xiaoxiaole-2026/prov_' + code;
    return fetchWithTimeout(url, 7000).then((j) => {
      if (j && typeof j.value === 'number') return j.value;
      return fetchWithTimeout(url, 7000).then((j2) => (j2 && typeof j2.value === 'number' ? j2.value : -1));
    });
  }

  // 把全网计数补齐到省份合计，保证「统计页数字加起来 = 后台的全网次数」
  // （公共计数器只增不减，落后时只能多打几下补上）
  function reconcileGlobalTo(sum) {
    if (typeof fetch !== 'function' || !sum) return;
    fetchWithTimeout(ABACUS_BASE + 'get/nailong-xiaoxiaole-2026/opens', 7000).then((j) => {
      let cur = j && typeof j.value === 'number' ? j.value : -1;
      if (cur < 0) return;
      let guard = 0;
      const step = () => {
        if (cur >= sum || guard++ >= 60) {
          Store.patchNet({ globalHits: Math.max(cur, sum) });
          renderAdmin();
          return;
        }
        fetch(HITS_API, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((v) => {
            if (v && typeof v.value === 'number') cur = Math.max(cur, v.value);
            step();
          })
          .catch(step);
      };
      step();
    });
  }

  function openProvStats() {
    const page = $('prov-page');
    if (!page) return;
    const sub = $('prov-sub'), list = $('prov-list'), search = $('prov-search');
    page.style.display = 'flex';
    if (sub) sub.textContent = '正在统计…';
    if (list) list.innerHTML = '';
    if (search) search.value = '';

    Promise.all(PROVINCES.map((p) => readProvCount(p[1]).then((n) => ({ name: p[0], n: n }))))
      .then((rows) => {
        const anyOk = rows.some((r) => r.n >= 0);
        if (anyOk) {
          const data = rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
          provRows = data;
          try { localStorage.setItem('nl2:provCache', JSON.stringify({ ts: Date.now(), data: data })); } catch (e) {}
          // 把省份合计记下来（后台「全网」至少显示到这个数），并把全网计数补齐到合计
          const sum = data.reduce((s, r) => s + r.n, 0);
          try { localStorage.setItem('nl2:provSum', String(sum)); } catch (e) {}
          reconcileGlobalTo(sum);
        } else {
          // 全部请求失败（离线 / 被限流）→ 用上次的结果，至少有内容看
          let cached = null;
          try { cached = JSON.parse(localStorage.getItem('nl2:provCache') || 'null'); } catch (e) {}
          provRows = (cached && Array.isArray(cached.data)) ? cached.data : [];
        }
        renderProvList(search ? search.value : '');
      });
  }

  function normProv(s) {
    return String(s || '').replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔|自治州/g, '');
  }

  function renderProvList(kw) {
    const list = $('prov-list'), sub = $('prov-sub');
    if (!list) return;
    const k = normProv(kw);
    const rows = provRows.filter((r) => !k || normProv(r.name).indexOf(k) >= 0);
    const total = provRows.reduce((s, r) => s + r.n, 0);
    if (sub) {
      sub.textContent = provRows.length
        ? ('共 ' + provRows.length + ' 个省份 · ' + total + ' 次打开')
        : '暂无打开记录';
    }
    if (!rows.length) {
      list.innerHTML = '<li class="prov-empty">没有找到相关省份</li>';
      return;
    }
    list.innerHTML = rows.map((r) =>
      '<li><span>' + escHtml(r.name) + '</span><b>' + r.n + '</b></li>').join('');
  }

  // 打开页面就 +1，结果缓存下来，离线时显示上次的数字
  // 顺带保证「全网 ≥ 本机」：公共计数器没有 set 接口，落后时只能多打几下补上
  function bumpGlobalHits() {
    if (typeof fetch !== 'function') return;
    const local = Store.getVisits().count;
    // 补齐全网时把省份计数一起补，保证统计页加起来仍然等于全网
    const prov = matchProvince(Store.getNet().geo && Store.getNet().geo.region);
    const provHit = () => {
      if (prov) fetch(ABACUS_BASE + 'hit/nailong-xiaoxiaole-2026/prov_' + prov.code, { cache: 'no-store' }).catch(() => {});
    };
    const hit = () => fetch(HITS_API, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && typeof j.value === 'number' ? j.value : null));

    hit().then(async (v) => {
      if (v == null) return;
      let cur = v;
      let guard = 0;
      while (cur < local && guard++ < 30) {
        const n = await hit();
        if (n == null) break;
        provHit();
        cur = Math.max(cur, n);
      }
      Store.patchNet({ globalHits: Math.max(cur, local) });
      renderAdmin();
    }).catch(() => {});
  }

  // 城市级定位：7 天内复用缓存，避免每次联网
  function fetchGeo() {
    const geo = Store.getNet().geo;
    if (geo && geo.ts && Date.now() - geo.ts < 7 * 864e5) return Promise.resolve(geo);
    if (typeof fetch !== 'function') return Promise.resolve(null);
    return fetch(GEO_API, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || j.success === false) return null;
        const g = { country: j.country || '', region: j.region || '', city: j.city || '', ts: Date.now() };
        Store.patchNet({ geo: g });
        return g;
      })
      .catch(() => null);
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

  // 地址统一成「中国-四川省-成都市」：城市没有「市」尾巴的自动补上
  function formatRegion(geo) {
    if (!geo) return '';
    const city = (geo.city || '').trim();
    const withShi = (s) => (s && !/[市区州盟县]$/.test(s) ? s + '市' : s);
    let parts = [geo.country, geo.region, withShi(city)];
    // 直辖市（北京市/北京市）只显示一次
    if (parts[1] && parts[2] && parts[1] === parts[2]) parts = [parts[0], parts[1]];
    return parts.filter(Boolean).join('-');
  }

  function renderAdmin() {
    if (!$('admin-menu')) return;
    const net = Store.getNet();
    const localCount = Store.getVisits().count;
    // 全网 ≥ 本机 ≥ 0，且不低于省份统计的合计（保证和统计页数字对得上）
    let provSum = 0;
    try { provSum = parseInt(localStorage.getItem('nl2:provSum') || '0', 10) || 0; } catch (e) {}
    const g = net.globalHits;
    const globalShown = Math.max(typeof g === 'number' && g > 0 ? g : 0, provSum, localCount);
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
      startLevel(lv);
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
      showOverlay('main-menu');
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
    const dailyBtn = $('btn-daily');
    if (dailyBtn) dailyBtn.addEventListener('click', () => {
      const d = Tasks.getDailyChallenge();
      startLevel(9999, { def: d, seed: d.seed, daily: true });
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
        fetchGeo().then(renderAdmin);
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

    // 省份统计页：搜索框 + 返回
    const provSearch = $('prov-search');
    if (provSearch) provSearch.addEventListener('input', () => renderProvList(provSearch.value));
    const provBack = $('btn-prov-back');
    if (provBack) provBack.addEventListener('click', () => {
      $('prov-page').style.display = 'none';
    });

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
      startLevel(S.level + 1);
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
    if (closeSettings) closeSettings.addEventListener('click', () => $('settings-menu').style.display = 'none');

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
    let bgmDemoAt = 0, sfxDemoAt = 0;
    if (bgm) bgm.addEventListener('input', () => {
      $('bgm-volume-val').textContent = Math.round(bgm.value * 100) + '%';
      AudioManager.setVolumes(parseFloat(bgm.value), null);
      // 边调边听：按当前音量实时弹一小段旋律（节流，拖动时不会炸耳朵）
      const now = Date.now();
      if (now - bgmDemoAt > 160) {
        bgmDemoAt = now;
        AudioManager.bgmDemo();
      }
    });
    if (sfx) sfx.addEventListener('input', () => {
      $('sfx-volume-val').textContent = Math.round(sfx.value * 100) + '%';
      AudioManager.setVolumes(null, parseFloat(sfx.value));
      const now = Date.now();
      if (now - sfxDemoAt > 160) {
        sfxDemoAt = now;
        AudioManager.sfxDemo();
      }
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
    Store.recordVisit(); // 本机打开次数：每载入一次 +1
    // 后台统计：全网计数 +1、城市定位（失败不影响游戏）
    setTimeout(() => { bumpGlobalHits(); fetchGeo().then(bumpProvHits); }, 600);
    AudioManager.init(settings);
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
    const tryPlayMusic = () => {
      AudioManager.init(Store.getSettings());
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
    const onGesture = () => tryPlayMusic();
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
      tryPlayMusic();
    };
    document.addEventListener('WeixinJSBridgeReady', weixinKick, false);
    if (window.WeixinJSBridge) setTimeout(weixinKick, 0);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tryPlayMusic();
    });
    window.addEventListener('pageshow', () => tryPlayMusic());
  }

  function global_Music() {
    return typeof window !== 'undefined' ? window.Music : null;
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
    findMatches: findMatches
  };
})();
