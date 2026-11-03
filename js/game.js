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
      grass: { name: '草地', bg: '#e8f7ea', grid: '#d3ecd6' },
      ocean: { name: '海洋', bg: '#e6f2fb', grid: '#cfe6f5' },
      star: { name: '星空', bg: '#ece9f8', grid: '#ddd7f2' },
      candy: { name: '糖果', bg: '#fdeef4', grid: '#f7d8e6' }
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
  const canvas = $('game');
  const ctx = canvas.getContext('2d');

  function computeCell() {
    // 扣除 .game-container(24*2) 与 .board-wrap(18*2) 的横向内边距
    const avail = Math.min(window.innerWidth || MAX_W, 620) - 84;
    return Math.max(28, Math.floor(avail / COLS));
  }

  function resizeCanvas() {
    CELL = computeCell();
    canvas.width = COLS * CELL;
    canvas.height = ROWS * CELL;
    drawStatic();
  }

  // ==================== 图片资源 ====================
  const IMAGES = [];
  let imagesReady = false;

  function loadImages() {
    let loaded = 0;
    let types = (S.levelDef && S.levelDef.colors) || 6;
    for (let i = 0; i < 6; i++) {
      const img = new Image();
      const done = () => {
        loaded++;
        if (loaded >= 6) {
          imagesReady = true;
          const l = $('loading');
          if (l) l.style.display = 'none';
          drawStatic();
        }
      };
      img.onload = done;
      img.onerror = done;
      img.src = './assets/' + i + '.jpg';
      IMAGES[i] = img;
    }
    setTimeout(() => {
      if (!imagesReady) {
        imagesReady = true;
        const l = $('loading');
        if (l) l.style.display = 'none';
        drawStatic();
      }
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
      ctx.save();
      ctx.globalAlpha = 0.85 * pulse;
      ctx.strokeStyle = '#5c8fff';
      ctx.lineWidth = Math.max(2, s * 0.1);
      ctx.beginPath();
      if (type === T.LINE_H) {
        ctx.moveTo(x + s * 0.12, cy);
        ctx.lineTo(x + s * 0.88, cy);
      } else {
        ctx.moveTo(cx, y + s * 0.12);
        ctx.lineTo(cx, y + s * 0.88);
      }
      ctx.stroke();
      ctx.restore();
    } else if (type === T.BOMB) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(255, 80, 80, 0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = 'bold ' + (s * 0.36) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 1;
      ctx.fillText('💣', cx, cy);
      ctx.restore();
    } else if (type === T.RAINBOW) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      const g = ctx.createLinearGradient(x, y, x + s, y + s);
      g.addColorStop(0, 'rgba(255,92,92,' + pulse + ')');
      g.addColorStop(0.5, 'rgba(92,255,143,' + pulse + ')');
      g.addColorStop(1, 'rgba(92,143,255,' + pulse + ')');
      ctx.fillStyle = g;
      roundRect(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.76, s * 0.2);
      ctx.fill();
      ctx.font = (s * 0.55) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1;
      ctx.fillText('🌈', cx, cy);
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

  function drawJelly(r, c) {
    if (!S.jelly[r] || !S.jelly[r][c]) return;
    const pad = CELL * 0.14;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#7cd6ff';
    roundRect(c * CELL + pad, r * CELL + pad, CELL - pad * 2, CELL - pad * 2, 8);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#3aa8e0';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // 静态重绘（无动画）
  function drawStatic() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    roundRect(0, 0, canvas.width, canvas.height, 12);
    ctx.clip();

    const shake = FX.getShakeOffset();
    ctx.translate(shake.x, shake.y);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        drawJelly(r, c);
        if (S.board[r] && S.board[r][c]) drawBlock(c * CELL, r * CELL, S.board[r][c]);
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    roundRect(0, 0, canvas.width, canvas.height, 12);
    ctx.clip();
    const shake = FX.getShakeOffset();
    ctx.translate(shake.x, shake.y);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        drawJelly(r, c);
        if (S.board[r] && S.board[r][c]) {
          const o = custom ? custom(r, c, S.board[r][c]) : null;
          drawBlock(c * CELL, r * CELL, S.board[r][c], o);
        }
      }
    }
    FX.render(ctx);
    ctx.restore();
  }

  // ==================== 动画 ====================
  function tween(dur, onFrame) {
    return new Promise((resolve) => {
      const start = performance.now();
      function step(now) {
        const p = Math.min(1, (now - start) / dur);
        onFrame(p);
        if (p < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });
  }

  function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }

  async function animateSwap(a, b) {
    const ax = a.c * CELL, ay = a.r * CELL;
    const bx = b.c * CELL, by = b.r * CELL;
    const ta = S.board[a.r][a.c], tb = S.board[b.r][b.c];
    await tween(140, (p) => {
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      roundRect(0, 0, canvas.width, canvas.height, 12);
      ctx.clip();
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if ((r === a.r && c === a.c) || (r === b.r && c === b.c)) continue;
        if (S.board[r][c]) drawBlock(c * CELL, r * CELL, S.board[r][c]);
      }
      drawBlock(ax + (bx - ax) * e, ay + (by - ay) * e, ta);
      drawBlock(bx + (ax - bx) * e, by + (ay - by) * e, tb);
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
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      roundRect(0, 0, canvas.width, canvas.height, 12);
      ctx.clip();
      const shake = FX.getShakeOffset();
      ctx.translate(shake.x, shake.y);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          drawJelly(r, c);
          if (!S.board[r][c]) continue;
          const fromR = fallFrom[kOf(r, c)];
          if (fromR !== undefined && fromR !== r) {
            const y = (fromR * CELL) + (r * CELL - fromR * CELL) * e;
            drawBlock(c * CELL, y, S.board[r][c]);
          } else {
            drawBlock(c * CELL, r * CELL, S.board[r][c]);
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

  function updateComboBar() {
    const bar = $('combo-bar');
    if (!bar) return;
    const now = performance.now();
    if (S.combo >= 2 && now < S.comboUntil) {
      bar.classList.add('show');
      bar.dataset.n = String(Math.min(S.combo, 5));
      $('combo-text').textContent = 'x' + S.combo + '  ' + comboMult(S.combo) + '倍';
    } else {
      bar.classList.remove('show');
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
        S.board[plan.r][plan.c].special = plan.type;
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
      expanded.boomPoints.forEach((bp) => {
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
      expanded.boomPoints.forEach((bp) => {
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

      if (expanded.boomPoints.some((b) => b.type === T.BOMB)) AudioManager.playSFX('bomb');
      else if (expanded.boomPoints.some((b) => b.type === T.LINE_H || b.type === T.LINE_V)) AudioManager.playSFX('line');
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
      swapPos = null;
    }
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
      const d = document.createElement('div');
      d.className = 'preview-dot';
      d.style.background = FALLBACK_COLORS[t];
      strip.appendChild(d);
    });
  }

  // ==================== 交换 ====================
  async function trySwap(a, b) {
    if (S.busy || !S.playing) return;
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

      await animateSwap(a, b);
      S.board[a.r][a.c] = bb;
      S.board[b.r][b.c] = ba;

      // 组合技（§2）：两个特殊块相邻
      const combo = Specials.comboAt(S.board, ROWS, COLS, a, b);
      if (combo) {
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

      pushHistory();
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
        endGame();
        return;
      }
    } else if (S.moves <= 0 && S.playing) {
      endGame();
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
  function pushHistory() {
    S.history.push({
      board: JSON.parse(JSON.stringify(S.board)),
      jelly: JSON.parse(JSON.stringify(S.jelly)),
      score: S.score,
      moves: S.moves,
      jellyLeft: S.jellyLeft
    });
    if (S.history.length > 10) S.history.shift();
  }

  function undo() {
    if (S.busy || !S.playing) return;
    if (!S.history.length) {
      toast('暂无可撤销内容');
      return;
    }
    if (S.undoLeft <= 0 && !Store.useItem('undo')) {
      toast('撤回次数已用完，去商店补充');
      return;
    }
    if (S.undoLeft > 0) S.undoLeft--;
    const f = S.history.pop();
    S.board = f.board;
    S.jelly = f.jelly;
    S.score = f.score;
    S.moves = f.moves;
    S.jellyLeft = f.jellyLeft;
    S.selected = null;
    updateHUD();
    updateTargetBar();
    drawStatic();
    AudioManager.playSFX('select');
  }

  function shuffleBoard() {
    if (S.busy || !S.playing) return;
    if (S.shuffleLeft <= 0 && !Store.useItem('shuffle')) {
      toast('洗牌次数已用完，去商店补充');
      return;
    }
    if (S.shuffleLeft > 0) S.shuffleLeft--;
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
    const themes = (S.data.themes || {})[themeName] || { bg: '#f4f4f4', grid: '#e6e6e6' };
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
    S.busy = false;
    S.selected = null;
    S.dragTo = null;
    S.shakeCell = null;
    S.clearedCount = 0;
    S.undoLeft = 3;
    S.shuffleLeft = 3;

    applyTheme(S.levelDef.theme);
    initBoard();

    // 道具：开局炸弹（§7）
    if (opts.startBomb) {
      const r = randInt(ROWS), c = randInt(COLS);
      S.board[r][c].special = T.BOMB;
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
      if (!S.playing) return;
      S.timeLeft = Math.max(0, S.timeLeft - 1);
      updateHUD();
      updateTargetBar();
      if (S.timeLeft <= 0) {
        stopTimer();
        endGame();
      }
    }, 1000);
  }
  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
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

    const sh = $('shuffle-count');
    if (sh) sh.textContent = S.shuffleLeft + (Store.getWallet().items.shuffle || 0);
    const un = $('undo-count');
    if (un) un.textContent = S.undoLeft + (Store.getWallet().items.undo || 0);
  }

  function updateTargetBar() {
    const bar = $('target-bar');
    if (!bar || !S.goal) return;
    bar.textContent = Goals.barText(S.goal);
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

  // ==================== 结算 ====================
  function levelWin() {
    S.playing = false;
    stopTimer();
    Input.setEnabled(false);

    const remainRatio = S.timerOn
      ? S.timeLeft / (S.levelDef.goal.time || 1)
      : (S.moves / (S.levelDef.moves || 1));
    const stars = Goals.stars(S.levelDef, S.score, remainRatio);
    const rec = S.daily
      ? { isNewScore: false, isNewStars: false }
      : Store.recordLevel(S.level, S.score, stars);
    if (!S.daily) S.menuLevel = S.level;

    // 金币产出（§7）
    const coins = Math.max(10, Math.floor(S.score / 100));
    Store.addCoins(coins);
    Tasks.report('play', 1);
    Tasks.report('score', S.score);

    AudioManager.playSFX('star', { stars });
    updateHUD();

    const box = $('level-clear');
    if (box) {
      $('clear-score').textContent = S.score;
      $('clear-high').textContent = Store.getLevelRecord(S.level).score;
      $('clear-moves').textContent = S.timerOn ? Math.round(S.timeLeft) + 's' : S.moves;
      $('clear-coins').textContent = '+' + coins;
      $('clear-new-record').style.display = rec.isNewScore ? 'inline-flex' : 'none';

      const starEls = $('clear-stars').children;
      for (let i = 0; i < starEls.length; i++) {
        starEls[i].classList.toggle('on', i < stars);
      }
      // 每日挑战没有"下一关"
      const nxt = $('btn-next-level');
      if (nxt) nxt.style.display = S.daily ? 'none' : 'inline-block';
      box.style.display = 'flex';
    }

    // 毕业面板（§10）
    if (S.levelDef.final) {
      const total = Object.keys(Store.getProgress()).reduce((s, k) => s + (Store.getProgress()[k].score || 0), 0);
      $('complete-total-score').textContent = total;
      setTimeout(() => {
        if (box) box.style.display = 'none';
        $('game-complete').style.display = 'flex';
      }, 1400);
    }
    saveRun();
  }

  function endGame() {
    if (!S.playing) return;
    S.playing = false;
    stopTimer();
    Input.setEnabled(false);

    const remainRatio = S.timerOn ? S.timeLeft / (S.levelDef.goal.time || 1) : S.moves / (S.levelDef.moves || 1);
    const passed = Goals.isComplete(S.goal);
    const stars = passed ? Goals.stars(S.levelDef, S.score, remainRatio) : 0;
    if (passed && !S.daily) Store.recordLevel(S.level, S.score, stars);
    if (!S.daily) S.menuLevel = S.level;
    const coins = passed ? Math.max(10, Math.floor(S.score / 100)) : Math.floor(S.score / 300);
    Store.addCoins(coins);
    Tasks.report('play', 1);
    Tasks.report('score', S.score);

    AudioManager.playSFX(passed ? 'star' : 'gameover', { stars: Math.max(1, stars) });
    updateHUD();

    const box = $('game-over');
    if (box) {
      $('final-score').textContent = S.score;
      $('final-high').textContent = Store.getLevelRecord(S.level).score;
      $('final-level').textContent = S.daily ? '每日挑战' : S.level;
      $('final-coins').textContent = '+' + coins;
      $('game-over-title').textContent = passed ? '目标达成！' : '步数耗尽';
      box.style.display = 'flex';
    }
    saveRun();
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
      'music-library-menu', 'rename-menu', 'tasks-menu', 'shop-menu', 'history-menu',
      'level-clear', 'game-over', 'game-complete'].forEach((id) => {
      const el = $(id);
      if (el) el.style.display = 'none';
    });
    setView('game');
  }

  // 主页与游戏中的容器高度不同：主页内容更高，需要更长的白色背景
  const MENU_PANELS = ['main-menu', 'settings-menu', 'volume-menu', 'custom-music-menu',
    'music-history-menu', 'playlist-menu', 'music-library-menu', 'rename-menu',
    'tasks-menu', 'shop-menu', 'history-menu'];

  function setView(view) {
    document.body.dataset.view = view;
  }

  function showOverlay(id) {
    const el = $(id);
    if (el) el.style.display = 'flex';
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
        '<button class="shop-buy" ' + (wallet.coins < item.price ? 'disabled' : '') + '>' + item.price + ' 金币</button>';
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
    for (let i = 1; i <= total; i++) {
      const rec = prog[i] || { score: 0, stars: 0 };
      const locked = i > maxUnlocked;
      const row = document.createElement('div');
      row.className = 'history-item' + (locked ? ' locked' : '');
      if (i === (S.menuLevel || 0)) row.classList.add('current');
      const starStr = '★★★'.slice(0, rec.stars) + '☆☆☆'.slice(0, 3 - rec.stars);
      row.innerHTML =
        '<span>第 ' + i + ' 关' + (locked ? ' <small class="lock-tag">未解锁</small>' : '') + '</span>' +
        '<span class="hv">' + starStr + ' <b>' + rec.score + '</b></span>';
      row.addEventListener('click', () => selectMenuLevel(i));
      list.appendChild(row);
    }
  }

  // ==================== 绑定 ====================
  function attachUI() {
    // 画布输入
    Input.attach(canvas, {
      getCellSize: () => CELL,
      getCell: (cx, cy) => {
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
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
    const quit = $('btn-quit');
    if (quit) quit.addEventListener('click', () => {
      saveRun();
      if (!S.daily) S.menuLevel = S.level;
      S.playing = false;
      showOverlay('main-menu');
      refreshMenu();
    });

    // 主页
    const play = $('btn-play');
    if (play) play.addEventListener('click', () => {
      AudioManager.init(Store.getSettings());
      AudioManager.unlock();
      const run = Store.loadRun();
      // 只有存档正好在主页显示的这一关才续玩，否则从这一关重开
      if (run && run.level === S.menuLevel && !run.daily && loadRun()) return;
      startLevel(S.menuLevel || 1);
    });
    const restart = $('btn-restart-level');
    if (restart) restart.addEventListener('click', () => {
      startLevel(S.menuLevel || 1);
    });
    const hist = $('btn-history');
    if (hist) hist.addEventListener('click', () => {
      renderHistory();
      showOverlay('history-menu');
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
    const logout = $('btn-logout');
    if (logout) logout.addEventListener('click', () => {
      if (!confirm('清除所有进度？此操作不可恢复。')) return;
      Store.wipeAll();
      location.reload();
    });

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
    if (bgm) bgm.addEventListener('input', () => {
      $('bgm-volume-val').textContent = Math.round(bgm.value * 100) + '%';
      AudioManager.setVolumes(parseFloat(bgm.value), null);
    });
    if (sfx) sfx.addEventListener('input', () => {
      $('sfx-volume-val').textContent = Math.round(sfx.value * 100) + '%';
      AudioManager.setVolumes(null, parseFloat(sfx.value));
      AudioManager.playSFX('select');
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

    const high = $('menu-current-high');
    if (high) high.textContent = (prog[S.menuLevel] && prog[S.menuLevel].score) || 0;

    const stars = $('menu-total-stars');
    if (stars) stars.textContent = Store.totalStars();
    const coins = $('menu-coins');
    if (coins) coins.textContent = Store.getWallet().coins;

    const play = $('btn-play');
    if (play) {
      const run = Store.loadRun();
      const canResume = !!(run && run.level === S.menuLevel && !run.daily);
      play.textContent = canResume ? '继续游戏' : '开始游戏';
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
    const unlock = () => {
      AudioManager.init(Store.getSettings());
      AudioManager.unlock();
      if (global_Music()) global_Music().restore();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
  }

  function global_Music() {
    return typeof window !== 'undefined' ? window.Music : null;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
