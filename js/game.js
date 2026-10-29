// ===================== 配置 =====================
const COLS = 8, ROWS = 8;
const TYPES = 6;
const MAX_W = 480;
const FALLBACK_COLORS = ['#ff5c5c', '#5cff8f', '#5c8fff', '#ffd75c', '#c85cff', '#5cffee'];

const BLOCK_NORMAL = 0, BLOCK_BOMB = 1;

// ===================== 音效系统 =====================
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, type, duration, volume = 0.1, delay = 0) {
  if (!audioCtx || audioCtx.state !== 'running') return;
  try {
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime + delay);
    gainNode.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + delay + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + duration);
    osc.connect(gainNode); gainNode.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + delay);
    osc.stop(audioCtx.currentTime + delay + duration);
  } catch (e) {}
}

const SFX = {
  select: () => playTone(600, 'sine', 0.08, 0.15),
  swap: () => playTone(400, 'triangle', 0.1, 0.15),
  invalid: () => playTone(200, 'sawtooth', 0.15, 0.1),
  match: (combo) => {
    const baseFreq = 500 + (combo - 1) * 150;
    playTone(baseFreq, 'sine', 0.15, 0.15);
    playTone(baseFreq * 1.5, 'sine', 0.15, 0.1, 0.05);
  },
  bomb: () => { playTone(150, 'sawtooth', 0.4, 0.2); playTone(100, 'sawtooth', 0.4, 0.2, 0.1); },
  win: () => { playTone(500, 'sine', 0.1, 0.15, 0); playTone(600, 'sine', 0.1, 0.15, 0.1); playTone(800, 'sine', 0.2, 0.15, 0.2); },
  gameOver: () => { playTone(400, 'sine', 0.2, 0.2, 0); playTone(300, 'sine', 0.2, 0.2, 0.2); playTone(200, 'sine', 0.4, 0.2, 0.4); }
};

// ===================== 自适应 =====================
function computeCell() {
  const available = Math.min(window.innerWidth, MAX_W) - 24;
  return Math.max(28, Math.floor(available / COLS));
}
let CELL = computeCell();

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = COLS * CELL; canvas.height = ROWS * CELL;

// ===================== 本地存储 =====================
let highScore = parseInt(localStorage.getItem('nailong_high_score') || '0', 10);
let highLevel = parseInt(localStorage.getItem('nailong_high_level') || '1', 10);
document.getElementById('menu-high-score').textContent = highScore;
document.getElementById('menu-high-level').textContent = highLevel;

// ===================== 资源加载 =====================
const IMAGES = []; let imagesReady = false;
function loadImages() {
  let loaded = 0;
  for (let i = 0; i < TYPES; i++) {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = `./assets/${i}.png?v=${new Date().getTime()}`;
    img.onload = () => { loaded++; if (loaded === TYPES) { imagesReady = true; document.getElementById('loading').style.display = 'none'; } };
    img.onerror = () => { console.error(`图片加载失败: ./assets/${i}.png`); loaded++; if (loaded === TYPES) { imagesReady = true; document.getElementById('loading').style.display = 'none'; } };
    IMAGES.push(img);
  }
}

// ===================== 游戏状态 =====================
let board = [];
let score = 0, moves = 25, level = 1;
let levelStartScore = 0; // 记录本关开始时的分数
let busy = false, selected = null, isPlaying = false;

let targetType = 'score', targetValue = 1000, currentProgress = 0;
let shuffleCount = 3, undoCount = 3;
let history = { board: null, score: 0, moves: 0 };
let particles = [], floatingTexts = [];

const scoreEl = document.getElementById('score');
const movesEl = document.getElementById('moves');
const levelEl = document.getElementById('level');
const targetBar = document.getElementById('target-bar');
const btnShuffle = document.getElementById('btn-shuffle');
const btnUndo = document.getElementById('btn-undo');
const shuffleCountEl = document.getElementById('shuffle-count');
const undoCountEl = document.getElementById('undo-count');

// ===================== 核心逻辑 =====================
const randType = () => Math.floor(Math.random() * TYPES);
const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const sleep = ms => new Promise(res => setTimeout(res, ms));

function initBoard() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let t;
      do { t = randType(); } while (
        (c >= 2 && board[r][c - 1]?.type === t && board[r][c - 2]?.type === t) ||
        (r >= 2 && board[r - 1][c]?.type === t && board[r - 2][c]?.type === t)
      );
      board[r][c] = { type: t, special: BLOCK_NORMAL };
    }
  }
}

function findMatches() {
  const matched = new Set();
  for (let r = 0; r < ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= COLS; c++) {
      const same = c < COLS && board[r][c] && board[r][c-1] && board[r][c].type === board[r][c-1].type;
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
      const same = r < ROWS && board[r][c] && board[r-1][c] && board[r][c].type === board[r-1][c].type;
      if (same) run++;
      else {
        if (run >= 3) for (let k = r - run; k < r; k++) matched.add(`${k},${c}`);
        run = 1;
      }
    }
  }
  return matched;
}

function hasPossibleMove() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        [board[r][c], board[nr][nc]] = [board[nr][nc], board[r][c]];
        const ok = findMatches().size > 0;
        [board[r][c], board[nr][nc]] = [board[nr][nc], board[r][c]];
        if (ok) return true;
      }
    }
  }
  return false;
}

// ===================== 特效 =====================
function spawnParticles(r, c, color) {
  const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
  for (let i = 0; i < 6; i++) {
    particles.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 1, color: color || '#fff' });
  }
}

function spawnText(r, c, text, color = '#ffd75c') {
  floatingTexts.push({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2, text, color, life: 1, dy: -2 });
}

function updateEffects() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.life -= 0.05;
    if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const t = floatingTexts[i];
    t.y += t.dy; t.life -= 0.02;
    if (t.life <= 0) floatingTexts.splice(i, 1);
  }
}

// ===================== 渲染 =====================
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawBlock(px, py, block, size = CELL - 6, alpha = 1, scale = 1) {
  if (!block) return;
  const s = size * scale, cx = px + CELL / 2, cy = py + CELL / 2;
  ctx.save(); ctx.globalAlpha = alpha;

  if (imagesReady && IMAGES[block.type] && IMAGES[block.type].complete && IMAGES[block.type].naturalWidth > 0) {
    ctx.drawImage(IMAGES[block.type], cx - s / 2, cy - s / 2, s, s);
  } else {
    ctx.fillStyle = FALLBACK_COLORS[block.type];
    roundRect(cx - s / 2, cy - s / 2, s, s, 10); ctx.fill();
  }

  if (block.special === BLOCK_BOMB) {
    ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${s*0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('💣', cx, cy);
  }
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!imagesReady || !board.length) return;
  
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) drawBlock(c * CELL, r * CELL, board[r][c]);
    }
  }
  if (selected) {
    const { r, c } = selected;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    roundRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4, 10); ctx.stroke();
  }

  particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 4 * p.life, 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1;

  floatingTexts.forEach(t => {
    ctx.globalAlpha = t.life; ctx.fillStyle = t.color; ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(t.text, t.x, t.y); ctx.fillText(t.text, t.x, t.y);
  });
  ctx.globalAlpha = 1;
}

// ===================== 动画与消除 =====================
async function animateSwap(a, b, dur = 140) {
  const start = performance.now();
  const ax = a.c * CELL, ay = a.r * CELL, bx = b.c * CELL, by = b.r * CELL;
  const ta = board[a.r][a.c], tb = board[b.r][b.c];

  return new Promise(resolve => {
    function frame(now) {
      const p = Math.min(1, (now - start) / dur);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if ((r === a.r && c === a.c) || (r === b.r && c === b.c)) continue;
          if (board[r][c]) drawBlock(c * CELL, r * CELL, board[r][c]);
        }
      }
      drawBlock(ax + (bx - ax) * e, ay + (by - ay) * e, ta);
      drawBlock(bx + (ax - bx) * e, by + (ay - by) * e, tb);

      if (p < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

async function resolveBoard() {
  let combo = 0;
  while (true) {
    const matched = findMatches();
    if (matched.size === 0) break;
    combo++;

    const matchArray = [...matched].map(k => k.split(',').map(Number));
    
    if (matchArray.length >= 4) {
      const r = matchArray[0][0], c = matchArray[0][1];
      board[r][c].special = BLOCK_BOMB;
      matched.delete(`${r},${c}`);
      SFX.bomb();
    }

    const addedScore = matched.size * 10 * combo;
    score += addedScore;
    scoreEl.textContent = score;
    currentProgress += addedScore;
    updateTargetUI();
    
    SFX.match(combo);
    if (navigator.vibrate && combo > 1) navigator.vibrate(30);

    matched.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      if (board[r][c]) spawnParticles(r, c, FALLBACK_COLORS[board[r][c].type]);
    });
    spawnText(matchArray[0][0], matchArray[0][1], `+${addedScore}`, combo > 1 ? '#ff5c5c' : '#ffd75c');

    await new Promise(resolve => {
      const start = performance.now(); const dur = 150;
      function frame(now) {
        const p = Math.min(1, (now - start) / dur);
        updateEffects();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (!board[r][c]) continue;
            if (matched.has(`${r},${c}`)) drawBlock(c * CELL, r * CELL, board[r][c], CELL - 6, 1 - p, 1 - p);
            else drawBlock(c * CELL, r * CELL, board[r][c]);
          }
        }
        particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 4 * p.life, 0, Math.PI * 2); ctx.fill(); });
        floatingTexts.forEach(t => { ctx.globalAlpha = t.life; ctx.fillStyle = t.color; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(t.text, t.x, t.y); ctx.fillText(t.text, t.x, t.y); });
        ctx.globalAlpha = 1;
        if (p < 1) requestAnimationFrame(frame); else resolve();
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
        if (board[r][c]) {
          if (write !== r) { board[write][c] = board[r][c]; fallFrom[`${write},${c}`] = r; board[r][c] = null; }
          write--;
        }
      }
      let newCount = 0;
      for (let r = write; r >= 0; r--) {
        board[r][c] = { type: randType(), special: BLOCK_NORMAL };
        fallFrom[`${r},${c}`] = -1 - newCount; newCount++;
      }
    }

    await new Promise(resolve => {
      const start = performance.now(); const dur = 180;
      function frame(now) {
        const p = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        updateEffects();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            if (!board[r][c]) continue;
            const fromR = fallFrom[`${r},${c}`];
            if (fromR !== undefined && fromR !== r) {
              const y = (fromR * CELL) + (r * CELL - fromR * CELL) * e;
              drawBlock(c * CELL, y, board[r][c]);
            } else { drawBlock(c * CELL, r * CELL, board[r][c]); }
          }
        }
        particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 4 * p.life, 0, Math.PI * 2); ctx.fill(); });
        floatingTexts.forEach(t => { ctx.globalAlpha = t.life; ctx.fillStyle = t.color; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(t.text, t.x, t.y); ctx.fillText(t.text, t.x, t.y); });
        ctx.globalAlpha = 1;
        if (p < 1) requestAnimationFrame(frame); else { draw(); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }
}

// ===================== 交互 =====================
function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  const c = Math.floor(((e.clientX - rect.left) * scaleX) / CELL);
  const r = Math.floor(((e.clientY - rect.top) * scaleY) / CELL);
  return inBounds(r, c) ? { r, c } : null;
}

canvas.addEventListener('pointerdown', async (e) => {
  e.preventDefault();
  if (!imagesReady || busy || !isPlaying || moves <= 0) return;
  initAudio();
  const cell = cellFromEvent(e);
  if (!cell) return;

  if (!selected) { selected = cell; SFX.select(); draw(); return; }
  if (selected.r === cell.r && selected.c === cell.c) { selected = null; draw(); return; }

  if (Math.abs(selected.r - cell.r) + Math.abs(selected.c - cell.c) === 1) {
    const a = selected, b = cell;
    selected = null; busy = true; SFX.swap();
    history = { board: JSON.parse(JSON.stringify(board)), score: score, moves: moves };

    await animateSwap(a, b);
    [board[a.r][a.c], board[b.r][b.c]] = [board[b.r][b.c], board[a.r][a.c]];

    if (findMatches().size === 0) {
      await sleep(60); SFX.invalid();
      await animateSwap(a, b);
      [board[a.r][a.c], board[b.r][b.c]] = [board[b.r][b.c], board[a.r][a.c]];
      busy = false; draw(); return;
    }

    moves--; movesEl.textContent = moves;
    await resolveBoard();

    // 过关判定
    if (currentProgress >= targetValue) {
      handleLevelWin();
      busy = false; return;
    }

    if (moves <= 0) {
      endGame(); busy = false; return;
    }

    if (!hasPossibleMove()) {
      await sleep(200); initBoard(); draw();
    }
    busy = false;
  } else {
    selected = cell; SFX.select(); draw();
  }
});

// ===================== 关卡与目标逻辑 =====================
function setupTarget() {
  if (Math.random() > 0.5) {
    targetType = 'score'; targetValue = level * 1000 + 500;
    targetBar.textContent = `目标：得分达到 ${targetValue} 分`;
  } else {
    targetType = 'collect'; targetValue = 10 + level * 5;
    targetBar.textContent = `目标：消除任意 ${targetValue} 个方块`;
  }
  currentProgress = 0;
  levelStartScore = score; // 记录进入本关时的分数
}

function updateTargetUI() {
  if (targetType === 'score') targetBar.textContent = `目标：得分 ${currentProgress} / ${targetValue}`;
  else targetBar.textContent = `目标：消除方块 ${currentProgress} / ${targetValue}`;
}

function handleLevelWin() {
  isPlaying = false;
  SFX.win();
  if (level >= highLevel) {
    highLevel = level + 1;
    localStorage.setItem('nailong_high_level', highLevel);
    document.getElementById('menu-high-level').textContent = highLevel;
  }
  // 计算本关得分
  const levelEarned = score - levelStartScore;
  document.getElementById('clear-score').textContent = levelEarned;
  document.getElementById('clear-moves').textContent = moves;
  document.getElementById('level-clear').style.display = 'flex';
}

// 进入下一关
document.getElementById('btn-next-level').addEventListener('click', () => {
  document.getElementById('level-clear').style.display = 'none';
  level++;
  levelEl.textContent = level;
  moves += 15; 
  movesEl.textContent = moves;
  
  setupTarget();
  initBoard();
  isPlaying = true;
  busy = false;
  draw();
});

// 过关界面返回主页
document.getElementById('btn-clear-home').addEventListener('click', () => {
  document.getElementById('level-clear').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
  isPlaying = false;
});

// ===================== 道具功能 =====================
btnShuffle.addEventListener('click', () => {
  if (shuffleCount <= 0 || busy || !isPlaying) return;
  shuffleCount--; 
  shuffleCountEl.textContent = shuffleCount;
  if (shuffleCount === 0) btnShuffle.disabled = true;
  initBoard(); draw(); SFX.swap();
});

btnUndo.addEventListener('click', () => {
  if (undoCount <= 0 || busy || !isPlaying || !history.board) return;
  undoCount--; 
  undoCountEl.textContent = undoCount;
  if (undoCount === 0) btnUndo.disabled = true;
  
  board = history.board;
  score = history.score;
  moves = history.moves;
  scoreEl.textContent = score;
  movesEl.textContent = moves;
  selected = null;
  draw(); SFX.select();
});

// ===================== 主流程 =====================
function startGame() {
  initAudio();
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('level-clear').style.display = 'none';
  
  score = 0; moves = 25; level = 1; 
  shuffleCount = 3; undoCount = 3;
  shuffleCountEl.textContent = 3; btnShuffle.disabled = false;
  undoCountEl.textContent = 3; btnUndo.disabled = false;
  
  scoreEl.textContent = 0; movesEl.textContent = 25; levelEl.textContent = 1;
  selected = null; busy = false; isPlaying = true;
  
  particles = []; floatingTexts = [];
  setupTarget();
  initBoard();
  draw();
}

function endGame() {
  isPlaying = false;
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('nailong_high_score', highScore);
    document.getElementById('menu-high-score').textContent = highScore;
  }
  SFX.gameOver();
  document.getElementById('final-score').textContent = score;
  document.getElementById('final-level').textContent = level;
  document.getElementById('game-over').style.display = 'flex';
}

// 按钮绑定
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', startGame);
document.getElementById('btn-home').addEventListener('click', () => {
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
  isPlaying = false;
});
document.getElementById('btn-quit').addEventListener('click', () => {
  isPlaying = false;
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
});

window.addEventListener('resize', () => {
  const newCell = computeCell();
  if (newCell === CELL) return;
  CELL = newCell;
  canvas.width = COLS * CELL; canvas.height = ROWS * CELL;
  draw();
});

loadImages();
