// ===================== 配置 =====================
const COLS = 8, ROWS = 8;
const TYPES = 6;
const MAX_W = 480;
const MAX_LEVEL = 20;
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

// ===================== 本地存储与进度 =====================
let levelHighScores = JSON.parse(localStorage.getItem('nailong_level_scores') || '{}');

function saveLevelScore(lv, sc) {
  if (!levelHighScores[lv] || sc > levelHighScores[lv]) {
    levelHighScores[lv] = sc;
    localStorage.setItem('nailong_level_scores', JSON.stringify(levelHighScores));
  }
}

function getMaxUnlockedLevel() {
  let max = 1;
  for (let i = 1; i <= MAX_LEVEL; i++) {
    if (levelHighScores[i] > 0) max = Math.max(max, i + 1);
  }
  return Math.min(max, MAX_LEVEL);
}

function checkSave() {
  const saved = localStorage.getItem('nailong_save');
  const btnPlay = document.getElementById('btn-play');
  if (btnPlay) {
    btnPlay.textContent = saved ? "继续游戏" : "开始游戏";
  }

  let currentLv = 1;
  if (saved) {
    try { currentLv = JSON.parse(saved).level || 1; } catch(e) {}
  }
  
  const menuLv = document.getElementById('menu-current-level');
  const menuHigh = document.getElementById('menu-current-high');
  if (menuLv) menuLv.textContent = currentLv;
  if (menuHigh) menuHigh.textContent = levelHighScores[currentLv] || 0;
}

function saveGame() {
  if (!isPlaying) return;
  const state = { board, score, moves, level, levelStartScore, currentProgress, shuffleCount, undoCount, history };
  localStorage.setItem('nailong_save', JSON.stringify(state));
}

function loadGame() {
  const saved = localStorage.getItem('nailong_save');
  if (!saved) return false;
  try {
    const state = JSON.parse(saved);
    board = state.board; score = state.score; moves = state.moves; level = state.level;
    levelStartScore = state.levelStartScore; currentProgress = state.currentProgress;
    shuffleCount = state.shuffleCount; undoCount = state.undoCount; history = state.history;

    scoreEl.textContent = score; movesEl.textContent = moves; levelEl.textContent = level;
    shuffleCountEl.textContent = shuffleCount; undoCountEl.textContent = undoCount;
    if (shuffleCount === 0) btnShuffle.disabled = true;
    if (undoCount === 0) btnUndo.disabled = true;
    
    targetValue = 1000 + (level - 1) * 100;
    targetBar.textContent = `目标：得分 ${currentProgress} / ${targetValue}`;
    return true;
  } catch (e) { return false; }
}

// ===================== 资源加载（只用 jpg） =====================
const IMAGES = []; let imagesReady = false;
function loadImages() {
  let loaded = 0;
  const finish = () => {
    loaded++;
    if (loaded === TYPES) {
      imagesReady = true;
      const l = document.getElementById('loading');
      if (l) l.style.display = 'none';
      drawAll();
    }
  };
  for (let i = 0; i < TYPES; i++) {
    const img = new Image();
    img.onload = () => {
      console.log(`图片加载成功: ./assets/${i}.jpg`);
      finish();
    };
    img.onerror = () => {
      console.error(`图片加载失败: ./assets/${i}.jpg（将回退为彩色方块）`);
      finish();
    };
    img.src = `./assets/${i}.jpg`;
    IMAGES.push(img);
  }
  // 最多等 5 秒，超时直接开始
  setTimeout(() => {
    if (!imagesReady) {
      imagesReady = true;
      const l = document.getElementById('loading');
      if (l) l.style.display = 'none';
      drawAll();
    }
  }, 5000);
}

// ===================== 游戏状态 =====================
let board = [];
let score = 0, moves = 25, level = 1;
let levelStartScore = 0;
let busy = false, selected = null, isPlaying = false;

let targetValue = 1000, currentProgress = 0;
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
      else { if (run >= 3) for (let k = c - run; k < c; k++) matched.add(`${r},${k}`); run = 1; }
    }
  }
  for (let c = 0; c < COLS; c++) {
    let run = 1;
    for (let r = 1; r <= ROWS; r++) {
      const same = r < ROWS && board[r][c] && board[r-1][c] && board[r][c].type === board[r-1][c].type;
      if (same) run++;
      else { if (run >= 3) for (let k = r - run; k < r; k++) matched.add(`${k},${c}`); run = 1; }
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
  for (let i = 0; i < 4; i++) {
    particles.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 1, color: color || '#fff' });
  }
}
function spawnText(r, c, text, color = '#ffd75c') {
  floatingTexts.push({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2, text, color, life: 2.0, dy: -3 });
}
function updateEffects() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.x += p.vx; p.y += p.vy; p.life -= 0.05; if (p.life <= 0) particles.splice(i, 1);
  }
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const t = floatingTexts[i]; t.y += t.dy; t.life -= 0.015; if (t.life <= 0) floatingTexts.splice(i, 1);
  }
}

// ===================== 渲染 =====================
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawBlock(px, py, block, size = CELL - 6, alpha = 1, scale = 1) {
  if (!block) return;
  const s = size * scale, cx = px + CELL / 2, cy = py + CELL / 2;
  const x = cx - s / 2, y = cy - s / 2;
  const radius = Math.max(4, s * 0.18);

  ctx.save();
  ctx.globalAlpha = alpha;

  // 1. 底部投影
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = s * 0.12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = s * 0.06;
  roundRect(x, y, s, s, radius);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  // 2. 图片 / 回退色（圆角裁剪）
  ctx.save();
  roundRect(x, y, s, s, radius);
  ctx.clip();

  if (imagesReady && IMAGES[block.type] && IMAGES[block.type].complete && IMAGES[block.type].naturalWidth > 0) {
    ctx.drawImage(IMAGES[block.type], x, y, s, s);
  } else {
    ctx.fillStyle = FALLBACK_COLORS[block.type];
    ctx.fillRect(x, y, s, s);
  }

  // 2.1 顶部高光渐变
  const hl = ctx.createLinearGradient(x, y, x, y + s);
  hl.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
  hl.addColorStop(0.35, 'rgba(255, 255, 255, 0.12)');
  hl.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
  hl.addColorStop(1, 'rgba(0, 0, 0, 0.18)');
  ctx.fillStyle = hl;
  ctx.fillRect(x, y, s, s);

  ctx.restore(); // 解除裁剪

  // 3. 内侧亮描边
  ctx.save();
  roundRect(x + 1, y + 1, s - 2, s - 2, Math.max(3, radius - 1));
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // 4. 外侧暗描边
  ctx.save();
  roundRect(x, y, s, s, radius);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // 5. 炸弹标记
  if (block.special === BLOCK_BOMB) {
    ctx.fillStyle = 'rgba(255, 100, 100, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${s * 0.4}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💣', cx, cy);
  }

  ctx.restore();
}

function renderEffects() {
  particles.forEach(p => { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 3 * p.life, 0, Math.PI * 2); ctx.fill(); });
  floatingTexts.forEach(t => {
    const alpha = Math.max(0, Math.min(1, t.life));
    ctx.globalAlpha = alpha; ctx.fillStyle = t.color; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
    ctx.strokeText(t.text, t.x, t.y); ctx.fillText(t.text, t.x, t.y);
  });
  ctx.globalAlpha = 1;
}

function drawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 圆角裁剪整个棋盘，避免方块溢出四角
  const R = 20;
  ctx.save();
  roundRect(0, 0, canvas.width, canvas.height, R);
  ctx.clip();

  if (!imagesReady || !board.length) { ctx.restore(); return; }

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c]) drawBlock(c * CELL, r * CELL, board[r][c]);

  if (selected) {
    const { r, c } = selected;
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    roundRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4, 10);
    ctx.stroke();
  }

  renderEffects();
  ctx.restore();
}

function loop() {
  if (floatingTexts.length > 0 || particles.length > 0) {
    updateEffects();
    if (!busy) drawAll();
  }
  requestAnimationFrame(loop);
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
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if ((r === a.r && c === a.c) || (r === b.r && c === b.c)) continue;
        if (board[r][c]) drawBlock(c * CELL, r * CELL, board[r][c]);
      }
      drawBlock(ax + (bx - ax) * e, ay + (by - ay) * e, ta);
      drawBlock(bx + (ax - bx) * e, by + (ay - by) * e, tb);
      renderEffects(); 
      if (p < 1) requestAnimationFrame(frame); else resolve();
    }
    requestAnimationFrame(frame);
  });
}

async function resolveBoard() {
  let combo = 0;
  while (true) {
    let matched = findMatches();
    if (matched.size === 0) break;
    combo++;
    
    let hasBombExploded = false;
    const matchedArray = [...matched];
    
    matchedArray.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      const block = board[r][c];
      if (block && block.special === BLOCK_BOMB) {
        hasBombExploded = true;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc) && board[nr][nc]) {
              matched.add(`${nr},${nc}`); 
            }
          }
        }
      }
    });
    
    if (hasBombExploded) {
      SFX.bomb();
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    }

    const finalMatchArray = [...matched].map(k => k.split(',').map(Number));
    
    if (finalMatchArray.length >= 4) {
      const r = finalMatchArray[0][0], c = finalMatchArray[0][1];
      board[r][c].special = BLOCK_BOMB;
      matched.delete(`${r},${c}`);
    }

    const addedScore = matched.size * 10 * combo;
    score += addedScore; scoreEl.textContent = score;
    currentProgress += addedScore; updateTargetUI();
    
    if (!hasBombExploded) SFX.match(combo); 

    matched.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      if (board[r][c]) spawnParticles(r, c, FALLBACK_COLORS[board[r][c].type] || '#fff');
    });
    
    const textAnchor = finalMatchArray.length > 0 ? finalMatchArray[0] : [0, 0];
    spawnText(textAnchor[0], textAnchor[1], `+${addedScore}`, combo > 1 ? '#ff5c5c' : '#ffd75c');

    await new Promise(resolve => {
      const start = performance.now(); const dur = 150;
      function frame(now) {
        const p = Math.min(1, (now - start) / dur);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          if (!board[r][c]) continue;
          if (matched.has(`${r},${c}`)) drawBlock(c * CELL, r * CELL, board[r][c], CELL - 6, 1 - p, 1 - p);
          else drawBlock(c * CELL, r * CELL, board[r][c]);
        }
        renderEffects(); 
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
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          if (!board[r][c]) continue;
          const fromR = fallFrom[`${r},${c}`];
          if (fromR !== undefined && fromR !== r) {
            const y = (fromR * CELL) + (r * CELL - fromR * CELL) * e;
            drawBlock(c * CELL, y, board[r][c]);
          } else { drawBlock(c * CELL, r * CELL, board[r][c]); }
        }
        renderEffects(); 
        if (p < 1) requestAnimationFrame(frame); else { drawAll(); resolve(); }
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

  if (!selected) { selected = cell; SFX.select(); drawAll(); return; }
  if (selected.r === cell.r && selected.c === cell.c) { selected = null; drawAll(); return; }

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
      busy = false; drawAll(); return;
    }

    moves--; movesEl.textContent = moves;
    await resolveBoard();

    if (moves <= 0) {
      localStorage.removeItem('nailong_save');
      if (currentProgress >= targetValue) handleLevelWin(); 
      else endGame();       
      busy = false; return;
    }

    if (!hasPossibleMove()) {
      await sleep(200); initBoard(); drawAll();
    }
    busy = false;
    saveGame();
  } else {
    selected = cell; SFX.select(); drawAll();
  }
});

// ===================== 难度与关卡逻辑 =====================
function setupLevelDifficulty() {
  moves = 25;
  targetValue = 1000 + (level - 1) * 100;
  currentProgress = 0;
  targetBar.textContent = `目标：得分达到 ${targetValue} 分`;
}

function updateTargetUI() {
  targetBar.textContent = `目标：得分 ${currentProgress} / ${targetValue}`;
}

function handleLevelWin() {
  isPlaying = false;
  SFX.win();
  
  const levelEarned = score - levelStartScore;
  saveLevelScore(level, levelEarned); 

  const clearScoreEl = document.getElementById('clear-score');
  const clearMovesEl = document.getElementById('clear-moves');
  if(clearScoreEl) clearScoreEl.textContent = levelEarned;
  if(clearMovesEl) clearMovesEl.textContent = moves;
  
  const nextBtn = document.getElementById('btn-next-level');
  const titleEl = document.querySelector('#level-clear .title');
  if (level >= MAX_LEVEL) {
    if(titleEl) titleEl.textContent = "🎉 恭喜全通关！";
    if(nextBtn) nextBtn.style.display = 'none';
  } else {
    if(titleEl) titleEl.textContent = "关卡完成！";
    if(nextBtn) nextBtn.style.display = 'block';
  }
  
  document.getElementById('level-clear').style.display = 'flex';
}

const btnNextLevel = document.getElementById('btn-next-level');
if(btnNextLevel) {
  btnNextLevel.addEventListener('click', () => {
    document.getElementById('level-clear').style.display = 'none';
    if (level < MAX_LEVEL) {
      level++; levelEl.textContent = level;
      levelStartScore = score;
      setupLevelDifficulty();
      movesEl.textContent = moves;
      initBoard();
      isPlaying = true; busy = false;
      drawAll(); saveGame();
    }
  });
}

const btnClearHome = document.getElementById('btn-clear-home');
if(btnClearHome) {
  btnClearHome.addEventListener('click', () => {
    document.getElementById('level-clear').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    isPlaying = false; checkSave();
  });
}

// ===================== 道具功能 =====================
btnShuffle.addEventListener('click', () => {
  if (shuffleCount <= 0 || busy || !isPlaying) return;
  shuffleCount--; shuffleCountEl.textContent = shuffleCount;
  if (shuffleCount === 0) btnShuffle.disabled = true;
  initBoard(); drawAll(); SFX.swap(); saveGame();
});

btnUndo.addEventListener('click', () => {
  if (undoCount <= 0 || busy || !isPlaying || !history.board) return;
  undoCount--; undoCountEl.textContent = undoCount;
  if (undoCount === 0) btnUndo.disabled = true;
  
  board = history.board; score = history.score; moves = history.moves;
  scoreEl.textContent = score; movesEl.textContent = moves;
  selected = null; drawAll(); SFX.select(); saveGame();
});

// ===================== 历史记录 =====================
function renderHistoryList() {
  const listEl = document.getElementById('history-list');
  if (!listEl) return;
  listEl.innerHTML = '';
  
  const maxUnlocked = getMaxUnlockedLevel();

  for (let i = 1; i <= MAX_LEVEL; i++) {
    const hs = levelHighScores[i] || 0;
    const isUnlocked = i <= maxUnlocked;
    
    const div = document.createElement('div');
    div.className = 'history-item';
    
    if (isUnlocked) {
      div.innerHTML = `<span>第 ${i} 关</span><span class="score">${hs} 分</span>`;
      div.addEventListener('click', () => startGameAtLevel(i));
    } else {
      div.style.opacity = '0.5';
      div.style.cursor = 'not-allowed';
      div.innerHTML = `<span>🔒 第 ${i} 关</span><span class="score">-</span>`;
    }
    listEl.appendChild(div);
  }
}

const btnHistory = document.getElementById('btn-history');
if(btnHistory) {
  btnHistory.addEventListener('click', () => {
    renderHistoryList();
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('history-menu').style.display = 'flex';
  });
}

const btnHistoryBack = document.getElementById('btn-history-back');
if(btnHistoryBack) {
  btnHistoryBack.addEventListener('click', () => {
    document.getElementById('history-menu').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    checkSave();
  });
}

// ===================== 主流程 =====================
function resetGameState(targetLv) {
  level = targetLv;
  score = 0; levelStartScore = 0;
  shuffleCount = 3; undoCount = 3;
  shuffleCountEl.textContent = 3; btnShuffle.disabled = false;
  undoCountEl.textContent = 3; btnUndo.disabled = false;
  scoreEl.textContent = 0; levelEl.textContent = level;
  
  selected = null; busy = false; isPlaying = true;
  particles = []; floatingTexts = [];
  
  setupLevelDifficulty();
  movesEl.textContent = moves;
  initBoard();
}

function startGameAtLevel(lv) { 
  initAudio();
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('history-menu').style.display = 'none';
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('level-clear').style.display = 'none';
  resetGameState(lv);
  drawAll(); saveGame();
}

// 统一的开始/继续
const btnPlay = document.getElementById('btn-play');
if(btnPlay) {
  btnPlay.addEventListener('click', () => {
    initAudio();
    if (loadGame()) {
      document.getElementById('main-menu').style.display = 'none';
      document.getElementById('game-over').style.display = 'none';
      document.getElementById('level-clear').style.display = 'none';
      isPlaying = true; busy = false; selected = null;
      particles = []; floatingTexts = [];
      drawAll();
    } else {
      startGameAtLevel(1);
    }
  });
}

function endGame() {
  isPlaying = false;
  localStorage.removeItem('nailong_save'); 
  
  const levelEarned = score - levelStartScore;
  saveLevelScore(level, levelEarned); 

  SFX.gameOver();
  document.getElementById('final-score').textContent = levelEarned;
  document.getElementById('final-level').textContent = level;
  document.getElementById('game-over').style.display = 'flex';
}

const btnRestart = document.getElementById('btn-restart');
if(btnRestart) btnRestart.addEventListener('click', () => startGameAtLevel(level));

const btnHome = document.getElementById('btn-home');
if(btnHome) {
  btnHome.addEventListener('click', () => {
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    isPlaying = false; checkSave();
  });
}

const btnQuit = document.getElementById('btn-quit');
if(btnQuit) {
  btnQuit.addEventListener('click', () => {
    isPlaying = false;
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    saveGame(); checkSave();
  });
}

window.addEventListener('resize', () => {
  const newCell = computeCell();
  if (newCell !== CELL) {
    CELL = newCell;
    canvas.width = COLS * CELL; canvas.height = ROWS * CELL;
    drawAll();
  }
});

loop();
loadImages();
checkSave();
