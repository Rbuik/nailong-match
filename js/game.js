// ===================== 配置 =====================
const COLS = 8, ROWS = 8;
const TYPES = 6;
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

// ===================== 图片资源 =====================
const IMAGES = [];
let imagesReady = false;

function loadImages() {
  let loaded = 0;
  for (let i = 0; i < TYPES; i++) {
    const img = new Image();
    img.src = `./assets/${i}.png`;
    img.onload = () => {
      loaded++;
      if (loaded === TYPES) {
        imagesReady = true;
        start();
      }
    };
    img.onerror = () => {
      console.error(`图片加载失败: ./assets/${i}.png`);
      loaded++;
      if (loaded === TYPES) { imagesReady = true; start(); }
    };
    IMAGES.push(img);
  }
}

// ===================== 状态 =====================
let board = [];
let score = 0;
let moves = 30;
let busy = false;
let selected = null;

const scoreEl = document.getElementById('score');
const movesEl = document.getElementById('moves');

// ===================== 工具 =====================
const randType = () => Math.floor(Math.random() * TYPES);
const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const sleep = ms => new Promise(res => setTimeout(res, ms));

function findMatches() {
  const matched = new Set();
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

function drawBlock(px, py, t, size = CELL - 6, alpha = 1, scale = 1) {
  if (!imagesReady || t === null || t === undefined) return;
  const s = size * scale;
  const cx = px + CELL / 2;
  const cy = py + CELL / 2;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(IMAGES[t], cx - s / 2, cy - s / 2, s, s);
  ctx.restore();
}

function drawCell(r, c, t, scale = 1, alpha = 1) {
  drawBlock(c * CELL, r * CELL, t, CELL - 6, alpha, scale);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!imagesReady) return;
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

// ===================== 动画 =====================
async function animateSwap(a, b, dur = 140) {
  const start = performance.now();
  const ax = a.c * CELL, ay = a.r * CELL;
  const bx = b.c * CELL, by = b.r * CELL;
  const ta = board[a.r][a.c], tb = board[b.r][b.c];

  return new Promise(resolve => {
    function frame(now) {
      const p = Math.min(1, (now - start) / dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if ((r === a.r && c === a.c) || (r === b.r && c === b.c)) continue;
          if (board[r][c] !== null) drawCell(r, c, board[r][c]);
        }
      }

      const x1 = ax + (bx - ax) * e;
      const y1 = ay + (by - ay) * e;
      const x2 = bx + (ax - bx) * e;
      const y2 = by + (ay - by) * e;
      drawBlock(x1, y1, ta);
      drawBlock(x2, y2, tb);

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

    await new Promise(resolve => {
      const start = performance.now();
      const dur = 150;
      function frame(now) {
        const p = Math.min(1, (now - start) / dur);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (board[r][c] === null) continue;
            if (matched.has(`${r},${c}`)) drawCell(r, c, board[r][c], 1 - p, 1 - p);
            else drawCell(r, c, board[r][c]);
          }
        }
        if (p < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });

    for (const key of matched) {
      const [r, c] = key.split(',').map(Number);
      board[r][c] = null;
    }

    const fallFrom = {};
    for (let c = 0; c < COLS; c++) {
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][c] !== null) {
          if (write !== r) {
            board[write][c] = board[r][c];
            fallFrom[`${write},${c}`] = r;
            board[r][c] = null;
          }
          write--;
        }
      }
      let newCount = 0;
      for (let r = write; r >= 0; r--) {
        board[r][c] = randType();
        fallFrom[`${r},${c}`] = -1 - newCount;
        newCount++;
      }
    }

    await new Promise(resolve => {
      const start = performance.now();
      const dur = 180;
      function frame(now) {
        const p = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const t = board[r][c];
            if (t === null) continue;
            const fromR = fallFrom[`${r},${c}`];
            if (fromR !== undefined && fromR !== r) {
              const fromY = fromR * CELL;
              const toY = r * CELL;
              const y = fromY + (toY - fromY) * e;
              drawBlock(c * CELL, y, t);
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
  if (!imagesReady || busy || moves <= 0) return;
  const cell = cellFromEvent(e);
  if (!cell) return;

  if (!selected) {
    selected = cell;
    draw();
    return;
  }

  if (selected.r === cell.r && selected.c === cell.c) {
    selected = null;
    draw();
    return;
  }

  if (isAdjacent(selected, cell)) {
    const a = selected, b = cell;
    selected = null;
    busy = true;

    await animateSwap(a, b);
    swap(a, b);

    if (findMatches().size === 0) {
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

    if (!hasPossibleMove()) {
      await sleep(200);
      initBoard();
      draw();
    }
    busy = false;
  } else {
    selected = cell;
    draw();
  }
});

// ===================== 缩放重排 =====================
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
  const loading = document.getElementById('loading');
  if (loading) loading.style.display = 'none';
  initBoard();
  draw();
}

document.getElementById('restart').addEventListener('click', start);

// 先加载图片，加载完自动 start()
loadImages();
