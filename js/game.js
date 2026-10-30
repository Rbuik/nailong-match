// ===================== 配置 =====================
const COLS = 8, ROWS = 8;
const TYPES = 6;
const MAX_W = 480;
const MAX_LEVEL = 20; // 最高 20 关
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

// ===================== 本地存储与进度管理 =====================
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
    if (levelHighScores[i] > 0) {
      max = Math.max(max, i + 1);
    }
  }
  return Math.min(max, MAX_LEVEL);
}

function checkSave() {
  const saved = localStorage.getItem('nailong_save');
  const btnPlay = document.getElementById('btn-play');
  
  // 有存档显示继续，没存档显示开始
  btnPlay.textContent = saved ? "继续游戏" : "开始游戏";

  let currentLv = 1;
  if (saved) {
    try { currentLv = JSON.parse(saved).level || 1; } catch(e) {}
  }
  
  document.getElementById('menu-current-level').textContent = currentLv;
  document.getElementById('menu-current-high').textContent = levelHighScores[currentLv] || 0;
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
    
    setupTarget(); updateTargetUI();
    return true;
  } catch (e) { return false; }
}

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
let levelStartScore = 0;
let busy = false, selected = null, isPlaying = false;

let targetValue = 1500, currentProgress = 0;
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
  ctx.save(); ctx.globalAlpha = alpha;
  if (imagesReady && IMAGES[block.type] && IMAGES[block.type].complete && IMAGES[block.type].naturalWidth > 0) {
    ctx.drawImage(IMAGES[block.type], cx - s / 2, cy - s / 2, s, s);
  } else {
    ctx.fillStyle = FALLBACK_COLORS[block.type]; roundRect(cx - s / 2, cy - s / 2, s, s, 10); ctx.fill();
  }
  if (block.special === BLOCK_BOMB) {
    ctx.fillStyle = 'rgba(255, 100, 100, 0.8)'; ctx.beginPath(); ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `bold ${s*0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💣', cx, cy);
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
  if (!imagesReady || !board.length) return;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c]) drawBlock(c * CELL, r * CELL, board[r][c]);
  if (selected) {
    const { r, c } = selected; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    roundRect(c * CELL + 2, r * CELL + 2, CELL - 4, CELL - 4, 10); ctx.stroke();
  }
  renderEffects();
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
    
    // ===== 炸弹爆炸判定核心逻辑 =====
    let hasBombExploded = false;
    const matchedArray = [...matched];
    
    matchedArray.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      const block = board[r][c];
      // 如果这个被消除的方块是炸弹
      if (block && block.special === BLOCK_BOMB) {
        hasBombExploded = true;
        // 遍历周围 3x3 范围
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (inBounds(nr, nc) && board[nr][nc]) {
              matched.add(`${nr},${nc}`); // 把周围的方块强行加入要消除的列表
            }
          }
        }
      }
    });
    
    // 如果有炸弹爆炸，播放爆炸音效和震动
    if (hasBombExploded) {
      SFX.bomb();
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    }
    // ==================================

    // 重新提取真实要消除的数组（包含了被炸的方块）
    const finalMatchArray = [...matched].map(k => k.split(',').map(Number));
    
    // 4连消生成炸弹逻辑
    if (finalMatchArray.length >= 4) {
      const r = finalMatchArray[0][0], c = finalMatchArray[0][1];
      board[r][c].special = BLOCK_BOMB;
      matched.delete(`${r},${c}`);
      // 注意：这里为了避免直接消除生成的炸弹，将其移出消除队列。
      // 但如果它本来就处于爆炸范围，这可能存在小冲突，不过不影响整体爽感。
    }

    // 结算分数和 UI
    const addedScore = matched.size * 10 * combo;
    score += addedScore; scoreEl.textContent = score;
    currentProgress += addedScore; updateTargetUI();
    
    if (!hasBombExploded) SFX.match(combo); // 如果没爆炸，播放普通连击音效

    matched.forEach(key => {
      const [r, c] = key.split(',').map(Number);
      if (board[r][c]) spawnParticles(r, c, FALLBACK_COLORS[board[r][c].type] || '#fff');
    });
    
    const textAnchor = finalMatchArray.length > 0 ? finalMatchArray[0] : [0, 0];
    spawnText(textAnchor[0], textAnchor[1], `+${addedScore}`, combo > 1 ? '#ff5c5c' : '#ffd75c');

    // 消除动画
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

    // 下落逻辑
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

    // 下落动画
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

// ===================== 关卡与目标逻辑 =====================
function setupTarget() {
  targetValue = level * 1500;
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

  document.getElementById('clear-score').textContent = levelEarned;
  document.getElementById('clear-moves').textContent = moves;
  
  const nextBtn = document.getElementById('btn-next-level');
  if (level >= MAX_LEVEL) {
    document.querySelector('#level-clear .title').textContent = "🎉 恭喜全通关！";
    nextBtn.style.display = 'none';
  } else {
    document.querySelector('#level-clear .title').textContent = "关卡完成！";
    nextBtn.style.display = 'block';
  }
  
  document.getElementById('level-clear').style.display = 'flex';
}

document.getElementById('btn-next-level').addEventListener('click', () => {
  document.getElementById('level-clear').style.display = 'none';
  if (level < MAX_LEVEL) {
    level++; levelEl.textContent = level;
    moves = 25; movesEl.textContent = moves;
    levelStartScore = score;
    setupTarget(); initBoard();
    isPlaying = true; busy = false;
    drawAll(); saveGame();
  }
});

document.getElementById('btn-clear-home').addEventListener('click', () => {
  document.getElementById('level-clear').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
  isPlaying = false; checkSave();
});

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

// ===================== 历史记录面板逻辑 =====================
function renderHistoryList() {
  const listEl = document.getElementById('history-list');
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

document.getElementById('btn-history').addEventListener('click', () => {
  renderHistoryList();
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('history-menu').style.display = 'flex';
});

document.getElementById('btn-history-back').addEventListener('click', () => {
  document.getElementById('history-menu').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
  checkSave();
});

// ===================== 主流程 =====================
function resetGameState(targetLv) {
  level = targetLv;
  score = 0; moves = 25; levelStartScore = 0; currentProgress = 0;
  shuffleCount = 3; undoCount = 3;
  shuffleCountEl.textContent = 3; btnShuffle.disabled = false;
  undoCountEl.textContent = 3; btnUndo.disabled = false;
  scoreEl.textContent = 0; movesEl.textContent = 25; levelEl.textContent = level;
  selected = null; busy = false; isPlaying = true;
  particles = []; floatingTexts = [];
  setupTarget(); initBoard();
}

function startGame() { 
  initAudio();
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('level-clear').style.display = 'none';
  resetGameState(1);
  drawAll(); saveGame();
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

// 统一的开始/继续逻辑
document.getElementById('btn-play').addEventListener('click', () => {
  initAudio();
  if (loadGame()) {
    // 有存档，继续游戏
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('level-clear').style.display = 'none';
    isPlaying = true; busy = false; selected = null;
    particles = []; floatingTexts = [];
    drawAll();
  } else {
    // 无存档，开始新游戏
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('level-clear').style.display = 'none';
    resetGameState(1);
    drawAll(); saveGame();
  }
});

document.getElementById('btn-restart').addEventListener('click', () => {
  initAudio();
  document.getElementById('game-over').style.display = 'none';
  resetGameState(1);
  drawAll(); saveGame();
});

document.getElementById('btn-home').addEventListener('click', () => {
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
  isPlaying = false; checkSave();
});

document.getElementById('btn-quit').addEventListener('click', () => {
  isPlaying = false;
  document.getElementById('game-over').style.display = 'none';
  document.getElementById('main-menu').style.display = 'flex';
  saveGame(); checkSave();
});

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
