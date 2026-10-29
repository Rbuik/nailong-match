// ===================== 配置 =====================
const COLS = 8, ROWS = 8;
const COLORS = ['#ff5c5c', '#5cff8f', '#5c8fff', '#ffd75c', '#c85cff', '#5cffee'];
const TYPES = COLORS.length;
const MAX_W = 480;

// ===================== 自适应格子尺寸 =====================
function computeCell() {
  const available = Math.min(window.innerWidth, MAX_W) - 24;
  return Math.max(28, Math.floor(available / COLS));
}
let CELL = computeCell();

// ===================== 画布 =====================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = COLS * CELL;
canvas.height = ROWS * CELL;

// ===================== 状态 =====================
let board = [];          // board[r][c] = 颜色编号，null 表示空
let score = 0;
let moves = 30;
let busy = false;        // 动画/结算中，禁止操作
let selected = null;     // 选中的格子 {r, c}

const scoreEl = document.getElementById('score');
const movesEl = document.getElementById('moves');

// ===================== 工具 =====================
const randType = () => Math.floor(Math.random() * TYPES);
const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const sleep = ms => new Promise(res => setTimeout(res, ms));

// 找出所有三连及以上，返回 Set("r,c")
function findMatches() {
  const matched = new Set();
  // 横向
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      const same = c < COLS && board[r][c] !== null && board[r][c] === board[r][c - 1];
      if (same) run++;
      else {
        if (run >= 3) for (let k = c - run; k < c; k++) matched.add(`${r},${k}`);
        run = 1;
      }
    }
  }
  // 纵向
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      const same = r < ROWS && board[r][c] !== null && board[r][c] === board[r - 1][c];
      if (same) run++;
      else {
        if (run >= 3) for (let k = r - run; k < r; k++) matched.add(`${k},${c}`);
        run = 1;
      }
    }
  }
  return matched;
}

// 初始化棋盘，保证开局无三连
function initBoard() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let t;
      do { t = randType(); } while (
        (c >= 2 && board[r][c - 1] === t && board[r][c - 2] === t) ||
        (r >= 2 && board[r - 1][c] === t && board[r - 2][c] === t)
      );
      board[r][c] = t;
    }
  }
}

function swap(a, b) {
  [board[a.r][a.c], board[b.r][b.c]] = [board[b.r][b.c], board[a.r][a.c]];
}

const isAdjacent = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;

// 死局检测：是否存在任意一步可消除的交换
function hasPossibleMove() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        swap({ r, c }, { r: nr, c: nc });
        const ok = findMatches().size > 0;
        swap({ r, c }, { r: nr, c: nc });
        if (ok) return true;
      }
    }
  }
  return false;
}

// ===================== 渲染 =====================
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCell(r, c, t, scale = 1, alpha = 1) {
  const x = c * CELL, y = r * CELL;
  const pad = 3, size = CELL - pad * 2;
  const s = size * scale;
  const cx = x + CELL / 2, cy = y + CELL / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.translate(-s / 2, -s / 2);
  ctx.fillStyle = COLORS[t];
  roundRect(0, 0, s, s, 10);
  ctx.fill();
  // 高光
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  roundRect(s * 0.1, s * 0.08, s * 0.8, s * 0.32, 6);
  ctx.fill();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = board[r][c];
      if (t === null) continue;
      drawCell(r, c, t);
    }
  }
  if (selected) {
    const { r, c } = selected;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    roundRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4, 10);
    ctx.stroke();
  }
}

// ===================== 动画辅助 =====================
// 交换动画：两个方块互换位置
async function animateSwap(a, b, dur = 140) {
  const start = performance.now();
  const ax = a.c * CELL, ay = a.r * CELL;
  const bx = b.c * CELL, by = b.r * CELL;
  const ta = board[a.r][a.c], tb = board[b.r][b.c];

  return new Promise(resolve => {
    function frame(now) {
      const p = Math.min(1, (now - start) / dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 其他格子
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if ((r === a.r && c === a.c) || (r === b.r && c === b.c)) continue;
          if (board[r][c] !== null) drawCell(r, c, board[r][c]);
        }
      }
      // 两个移动的方块
      const drawMoving = (t, x0, y0, x1, y1) => {
        if (t === null) return;
        const x = x0 + (x1 - x0) * e;
        const y = y0 + (y1 - y0) * e;
        const pad = 3, s = CELL - pad * 2;
        ctx.fillStyle = COLORS[t];
        roundRect(x + pad, y + pad, s, s, 10);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        roundRect(x + pad + s * 0.1, y + pad + s * 0.08, s * 0.8, s * 0.32, 6);
        ctx.fill();
      };
      drawMoving(ta, ax, ay, bx, by);
      drawMoving(tb, bx, by, ax, ay);

      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

// ===================== 消除 → 下落 → 补充 =====================
async function resolveBoard() {
  let combo = 0;
  while (true) {
    const matched = findMatches();
    if (matched.size === 0) break;
    combo++;
    score += matched.size * 10 * combo;
    scoreEl.textContent = score;

    // 消除动画：缩小消失
    await new Promise(resolve => {
      const start = performance.now();
      const dur = 150;
      const cells = [...matched].map(k => k.split(',').map(Number));
      function frame(now) {
        const p = Math.min(1, (now - start) / dur);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (board[r][c] === null) continue;
            const isMatched = matched.has(`${r},${c}`);
            if (isMatched) drawCell(r, c, board[r][c], 1 - p, 1 - p);
            else drawCell(r, c, board[r][c]);
          }
        }
        if (p < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });

    // 置空
    for (const key of matched) {
      const [r, c] = key.split(',').map(Number);
      board[r][c] = null;
    }

    // 下落 + 顶部补充（记录每个格子的新旧位置，用于动画）
    const fallFrom = {}; // "r,c" -> {fromR, type}
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][c] !== null) {
          if (write !== r) {
            board[write][c] = board[r][c];
            fallFrom[`${write},${c}`] = { fromR: r, type: board[r][c] };
            board[r][c] = null;
          }
          write--;
        }
      }
      let newCount = 0;
      for (let r = write; r >= 0; r--) {
        const t = randType();
        board[r][c] = t;
        fallFrom[`${r},${c}`] = { fromR: -1 - newCount, type: t };
        newCount++;
      }
    }

    // 下落动画
    await new Promise(resolve => {
      const start = performance.now();
      const dur = 180;
      function frame(now) {
        const p = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const t = board[r][c];
            if (t === null) continue;
            const info = fallFrom[`${r},${c}`];
            if (info && info.fromR !== r) {
              const fromY = info.fromR * CELL;
              const toY = r * CELL;
              const y = fromY + (toY - fromY) * e;
              const pad = 3, s = CELL - pad * 2;
              const x = c * CELL;
              ctx.fillStyle = COLORS[t];
              roundRect(x + pad, y + pad, s, s, 10);
              ctx.fill();
              ctx.fillStyle = 'rgba(255,255,255,.25)';
              roundRect(x + pad + s * 0.1, y + pad + s * 0.08, s * 0.8, s * 0.32, 6);
              ctx.fill();
            } else {
              drawCell(r, c, t);
            }
          }
        }
        if (p < 1) requestAnimationFrame(frame);
        else { draw(); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }
}

// ===================== 交互 =====================
function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = (e.clientX - rect.left) * scaleX;
  const py = (e.clientY - rect.top) * scaleY;
  const c = Math.floor(px / CELL);
  const r = Math.floor(py / CELL);
  return inBounds(r, c) ? { r, c } : null;
}

canvas.addEventListener('pointerdown', async (e) => {
  e.preventDefault();
  if (busy || moves <= 0) return;
  const cell = cellFromEvent(e);
  if (!cell) return;

  // 没选中 → 选中
  if (!selected) {
    selected = cell;
    draw();
    return;
  }

  // 点自己 → 取消
  if (selected.r === cell.r && selected.c === cell.c) {
    selected = null;
    draw();
    return;
  }

  // 相邻 → 尝试交换
  if (isAdjacent(selected, cell)) {
    const a = selected, b = cell;
    selected = null;
    busy = true;

    await animateSwap(a, b);
    swap(a, b);

    if (findMatches().size === 0) {
      // 无效交换，换回
      await sleep(60);
      await animateSwap(a, b);
      swap(a, b);
      busy = false;
      draw();
      return;
    }

    moves--;
    movesEl.textContent = moves;
    await resolveBoard();

    // 死局洗牌
    if (!hasPossibleMove()) {
      await sleep(200);
      initBoard();
      draw();
    }
    busy = false;
  } else {
    // 点其他格子 → 改选
    selected = cell;
    draw();
  }
});

// ===================== 窗口缩放重排 =====================
window.addEventListener('resize', () => {
  const newCell = computeCell();
  if (newCell === CELL) return;
  CELL = newCell;
  canvas.width = COLS * CELL;
  canvas.height = ROWS * CELL;
  draw();
});

// ===================== 启动 =====================
function start() {
  score = 0;
  moves = 30;
  selected = null;
  busy = false;
  scoreEl.textContent = 0;
  movesEl.textContent = 30;
  initBoard();
  draw();
}

document.getElementById('restart').addEventListener('click', start);
start();
