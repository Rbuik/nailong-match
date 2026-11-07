// specials.js — 特殊块：线消 / 炸弹 / 彩虹 + 7 种组合技
// 对应优化方案 §2（组合技 + 新增线消块）、§19（可辨识外观的数据支持）
// 暴露 window.Specials

(function (global) {
  'use strict';

  const TYPE = {
    NORMAL: 0, LINE_H: 1, LINE_V: 2, BOMB: 3, RAINBOW: 4,
    MAGNET: 5,      // 🧲 磁铁：吸走同行同列的同色方块
    PAINT: 6,       // 🎨 颜料：消除后把一片方块统一成同一种颜色
    FROST: 7,       // ❄️ 霜块（正向）：消除后让所有机关暂停几回合，方便提前布局
    PROPELLER: 8    // 🛩️ 螺旋桨：斜向扫两条对角线，补行列 / 炸弹的盲区
  };

  const META = {
    0: { name: '普通块', icon: '', color: null },
    1: { name: '横线消', icon: '↔', color: '#5c8fff' },
    2: { name: '竖线消', icon: '↕', color: '#5c8fff' },
    3: { name: '炸弹', icon: '💣', color: '#ff5c5c' },
    4: { name: '彩虹', icon: '🌈', color: '#c85cff' },
    5: { name: '磁铁', icon: '🧲', color: '#ff5c8a' },
    6: { name: '颜料', icon: '🎨', color: '#ff9a3c' },
    7: { name: '霜块', icon: '❄️', color: '#5cc8ff' },
    8: { name: '螺旋桨', icon: '🛩️', color: '#2fc7b8' }
  };

  function key(r, c) { return r + ',' + c; }
  function parse(k) {
    const p = k.split(',');
    return { r: +p[0], c: +p[1] };
  }

  // ============ run 检测：带方向的 3/4/5 连 ============
  function detectRuns(board, R, C) {
    const runs = [];
    // 横向
    for (let r = 0; r < R; r++) {
      let start = 0;
      for (let c = 1; c <= C; c++) {
        const same = c < C && board[r][c] && board[r][start] && board[r][c].type === board[r][start].type;
        if (!same) {
          const len = c - start;
          if (len >= 3) {
            const cells = [];
            for (let k = start; k < c; k++) cells.push({ r, c: k });
            runs.push({ dir: 'h', len, cells });
          }
          start = c;
        }
      }
    }
    // 纵向
    for (let c = 0; c < C; c++) {
      let start = 0;
      for (let r = 1; r <= R; r++) {
        const same = r < R && board[r][c] && board[start][c] && board[r][c].type === board[start][c].type;
        if (!same) {
          const len = r - start;
          if (len >= 3) {
            const cells = [];
            for (let k = start; k < r; k++) cells.push({ r: k, c });
            runs.push({ dir: 'v', len, cells });
          }
          start = r;
        }
      }
    }
    return runs;
  }

  // L / T 型：同一格同时属于横 3+ 与竖 3+
  function detectLShapes(board, R, C, runs) {
    const shapes = [];
    const hCells = new Map();
    const vCells = new Map();

    runs.forEach((run) => {
      const map = run.dir === 'h' ? hCells : vCells;
      run.cells.forEach((p) => {
        const k = key(p.r, p.c);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(run);
      });
    });

    hCells.forEach((hRuns, k) => {
      if (!vCells.has(k)) return;
      const vRuns = vCells.get(k);
      hRuns.forEach((h) => {
        vRuns.forEach((v) => {
          const set = new Set();
          h.cells.forEach((p) => set.add(key(p.r, p.c)));
          v.cells.forEach((p) => set.add(key(p.r, p.c)));
          if (set.size >= 5) {
            shapes.push({ center: parse(k), cells: Array.from(set).map(parse), size: set.size });
          }
        });
      });
    });

    return shapes;
  }

  // ============ 生成判定 ============
  // 返回 { r, c, type } 或 null
  // 每种特殊块一条独立路径，互不重复：
  //   十字交叉（横竖都 4+）→ 螺旋桨 🛩️ ｜ 一步消同色 ≥7（不限形状）→ 颜料 🎨
  //   一步消同色 6 → 磁铁 🧲 ｜ 5 连直线 → 彩虹 🌈 ｜ L/T → 炸弹 💣 ｜ 4 连 → 线消
  function planCreation(board, matchedSet, swapped, runs, lShapes) {
    const inMatched = (p) => matchedSet.has(key(p.r, p.c));
    const atSwap = () => {
      if (!swapped) return null;
      for (const p of [swapped.a, swapped.b]) {
        if (inMatched(p) && board[p.r][p.c] && board[p.r][p.c].special === TYPE.NORMAL) return p;
      }
      return null;
    };
    const empty = (p) => board[p.r] && board[p.r][p.c] && board[p.r][p.c].special === TYPE.NORMAL;
    // 定点优先放在玩家刚交换的那一格（最符合直觉），否则放到这一串的中间
    const pick = (cells, fallbackIdx) => {
      const s = atSwap();
      if (s && cells.some((p) => p.r === s.r && p.c === s.c)) return { r: s.r, c: s.c };
      const p = cells[fallbackIdx == null ? Math.floor(cells.length / 2) : fallbackIdx];
      if (p && empty(p)) return { r: p.r, c: p.c };
      // 中间那格已经压着东西（货物 / 冰 / 锁链）→ 往后找一格空的
      for (let i = 0; i < cells.length; i++) if (empty(cells[i])) return { r: cells[i].r, c: cells[i].c };
      return null;
    };

    const list = (runs || []).slice().sort((a, b) => b.len - a.len);

    // 1) 十字型：横竖两条 4+ 交叉 -> 螺旋桨
    const h4 = list.filter((x) => x.dir === 'h' && x.len >= 4);
    const v4 = list.filter((x) => x.dir === 'v' && x.len >= 4);
    for (const h of h4) {
      for (const v of v4) {
        const cross = h.cells.find((p) => v.cells.some((q) => q.r === p.r && q.c === p.c));
        if (cross) {
          const cells = [...h.cells, ...v.cells.filter((q) => !(q.r === cross.r && q.c === cross.c))];
          const at = pick(cells, 0);
          if (at) return { r: at.r, c: at.c, type: TYPE.PROPELLER };
        }
      }
    }

    // 2) 一步消掉的同色个数（不限形状，直线 / L / T 都算格数）：≥7 -> 颜料，6 -> 磁铁
    if (matchedSet && matchedSet.size) {
      const byColor = new Map();
      matchedSet.forEach((k) => {
        const p = parse(k);
        const b = board[p.r] && board[p.r][p.c];
        if (!b) return;
        if (!byColor.has(b.type)) byColor.set(b.type, []);
        byColor.get(b.type).push(p);
      });
      let best = null;
      byColor.forEach((cells) => {
        if (!best || cells.length > best.cells.length) best = { cells };
      });
      if (best && best.cells.length >= 6) {
        const at = pick(best.cells);
        if (at) return { r: at.r, c: at.c, type: best.cells.length >= 7 ? TYPE.PAINT : TYPE.MAGNET };
      }
    }

    // 3) 5 连 -> 彩虹
    const five = list.filter((x) => x.len >= 5)[0];
    if (five) {
      const at = pick(five.cells);
      if (at) return { r: at.r, c: at.c, type: TYPE.RAINBOW };
    }

    // 4) L / T 型 -> 炸弹
    if (lShapes && lShapes.length) {
      const shape = lShapes.slice().sort((a, b) => b.size - a.size)[0];
      const at = pick(shape.cells);
      if (at) return { r: at.r, c: at.c, type: TYPE.BOMB };
    }

    // 5) 4 连 -> 线消（按方向），同一批出现两个方向的 4 连 -> 炸弹
    const fours = list.filter((x) => x.len === 4);
    if (fours.length >= 2) {
      const dirs = new Set(fours.map((f) => f.dir));
      if (dirs.size >= 2) {
        const at = pick(fours[0].cells, 1);
        if (at) return { r: at.r, c: at.c, type: TYPE.BOMB };
      }
    }
    if (fours.length >= 1) {
      const f = fours[0];
      const wantType = f.dir === 'h' ? TYPE.LINE_H : TYPE.LINE_V;
      const at = pick(f.cells, 1);
      if (at) return { r: at.r, c: at.c, type: wantType };
    }

    return null;
  }

  // ============ 单个特殊块的作用范围 ============
  function areaOf(type, r, c, R, C, color, board) {
    const out = new Set();
    const add = (rr, cc) => {
      if (rr >= 0 && rr < R && cc >= 0 && cc < C) out.add(key(rr, cc));
    };

    if (type === TYPE.LINE_H || type === TYPE.LINE_V) {
      // 十字架：横向 + 纵向同时清（整行 + 整列）
      for (let cc = 0; cc < C; cc++) add(r, cc);
      for (let rr = 0; rr < R; rr++) add(rr, c);
    } else if (type === TYPE.BOMB) {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) add(r + dr, c + dc);
    } else if (type === TYPE.RAINBOW) {
      if (color != null && color >= 0) {
        // 全场同色
        for (let rr = 0; rr < R; rr++) for (let cc = 0; cc < C; cc++) {
          if (board[rr][cc] && board[rr][cc].type === color) add(rr, cc);
        }
      } else {
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) add(r + dr, c + dc);
      }
    } else if (type === TYPE.MAGNET) {
      // 🧲 磁铁：把「同行 + 同列」里的同色方块吸过来一起消（外加身边 3x3）
      for (let cc = 0; cc < C; cc++) {
        const b = board[r][cc];
        if (b && (color == null || b.type === color)) add(r, cc);
      }
      for (let rr = 0; rr < R; rr++) {
        const b = board[rr][c];
        if (b && (color == null || b.type === color)) add(rr, c);
      }
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) add(r + dr, c + dc);
    } else if (type === TYPE.PAINT) {
      // 🎨 颜料：自身 5x5 一片（变色效果由 game.js 在消除后统一改色）
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) add(r + dr, c + dc);
    } else if (type === TYPE.PROPELLER) {
      // 🛩️ 螺旋桨：两条对角线一路扫到底（补行列 / 炸弹的斜向盲区）
      for (let d = -Math.max(R, C); d <= Math.max(R, C); d++) {
        add(r + d, c + d);
        add(r + d, c - d);
      }
    } else if (type === TYPE.FROST) {
      // ❄️ 霜块只消自己，真正的效果是「冻结机关」（game.js 里处理）
      add(r, c);
    }
    return out;
  }

  // 迭代扩展：把被消除的特殊块一起引爆（链式）
  function expandClears(board, R, C, seed, opts) {
    opts = opts || {};
    const cells = new Set(seed);
    const boomPoints = [];
    const queue = Array.from(cells).map((k) => ({ k, cause: 'match' }));
    const visitedSpecial = new Set();
    let jellyColor = null;

    while (queue.length) {
      const { k } = queue.shift();
      const p = parse(k);
      const block = board[p.r] && board[p.r][p.c];
      if (!block) continue;
      if (block.special === TYPE.NORMAL) continue;

      const sk = k + ':' + block.special;
      if (visitedSpecial.has(sk)) continue;
      visitedSpecial.add(sk);

      let color = null;
      if (block.special === TYPE.RAINBOW) {
        // 彩虹块被消除时（无论三连 / 炸弹 / 线消波及），触发的是
        // 「彩虹自身图案」的全场消除：0.jpg 带彩虹 → 全场 0.jpg 都消掉。
        // 只有彩虹块没有图案时才退回场上最多的颜色。
        if (block.type != null && block.type >= 0) color = block.type;
        else color = opts.rainbowColor != null ? opts.rainbowColor : dominantColor(board, R, C);
        if (color != null) jellyColor = color;
      } else if (block.special === TYPE.MAGNET) {
        // 磁铁吸的是「自己这一种颜色」
        color = (block.type != null && block.type >= 0) ? block.type : dominantColor(board, R, C);
      }

      const area = areaOf(block.special, p.r, p.c, R, C, color, board);
      boomPoints.push({ r: p.r, c: p.c, type: block.special });

      area.forEach((ak) => {
        if (!cells.has(ak)) {
          cells.add(ak);
          queue.push({ k: ak });
        } else {
          // 已在集合里但可能也是特殊块，仍需展开
          queue.push({ k: ak });
        }
      });
    }

    return { cells, boomPoints, rainbowColor: jellyColor };
  }

  function dominantColor(board, R, C) {
    const cnt = {};
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const b = board[r][c];
      if (b) cnt[b.type] = (cnt[b.type] || 0) + 1;
    }
    let best = null, max = 0;
    Object.keys(cnt).forEach((k) => {
      if (cnt[k] > max) { max = cnt[k]; best = +k; }
    });
    return best;
  }

  // ============ 组合技（两个特殊块相邻交换）============
  // 返回 { label, cells:Set, clearAll? } 或 null
  function comboAt(board, R, C, a, b) {
    const ba = board[a.r][a.c];
    const bb = board[b.r][b.c];
    if (!ba || !bb) return null;
    if (ba.special === TYPE.NORMAL || bb.special === TYPE.NORMAL) return null;

    const t1 = ba.special, t2 = bb.special;
    const cells = new Set();
    const addRow = (r) => { for (let c = 0; c < C; c++) cells.add(key(r, c)); };
    const addCol = (c) => { for (let r = 0; r < R; r++) cells.add(key(r, c)); };
    const addBox = (cr, cc, rad) => {
      for (let dr = -rad; dr <= rad; dr++) for (let dc = -rad; dc <= rad; dc++) {
        const rr = cr + dr, cc2 = cc + dc;
        if (rr >= 0 && rr < R && cc2 >= 0 && cc2 < C) cells.add(key(rr, cc2));
      }
    };
    const addColor = (color) => {
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        if (board[r][c] && board[r][c].type === color) cells.add(key(r, c));
      }
    };

    const isLine = (t) => t === TYPE.LINE_H || t === TYPE.LINE_V;
    const pair = [t1, t2].sort((x, y) => x - y).join('-');
    const midR = Math.round((a.r + b.r) / 2);
    const midC = Math.round((a.c + b.c) / 2);

    // 彩虹 + 彩虹：全屏
    if (t1 === TYPE.RAINBOW && t2 === TYPE.RAINBOW) {
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) cells.add(key(r, c));
      return { label: '全屏清场', cells, clearAll: true, sfx: 'bomb' };
    }

    // ============ 超级融合：磁铁参与的组合 ============
    // 彩虹 + 磁铁：全场某色被「吸」到一起再爆掉（比彩虹+线消更彻底）
    if ((t1 === TYPE.RAINBOW && t2 === TYPE.MAGNET) || (t1 === TYPE.MAGNET && t2 === TYPE.RAINBOW)) {
      const color = dominantColor(board, R, C);
      addColor(color);
      addRow(midR); addCol(midC);
      addBox(midR, midC, 1);
      return { label: '磁力虹吸', cells, sfx: 'bomb', power: 5 };
    }

    // 炸弹 + 磁铁：同色全被吸过来炸（磁力爆破）
    if ((t1 === TYPE.BOMB && t2 === TYPE.MAGNET) || (t1 === TYPE.MAGNET && t2 === TYPE.BOMB)) {
      const magnet = t1 === TYPE.MAGNET ? ba : bb;
      const color = (magnet && magnet.type != null && magnet.type >= 0) ? magnet.type : dominantColor(board, R, C);
      addColor(color);
      addBox(midR, midC, 1);
      return { label: '磁力爆破', cells, sfx: 'bomb', power: 4 };
    }

    // 磁铁 + 磁铁：两行两列全扫（双磁十字）
    if (t1 === TYPE.MAGNET && t2 === TYPE.MAGNET) {
      addRow(a.r); addCol(a.c); addRow(b.r); addCol(b.c);
      return { label: '双磁十字', cells, sfx: 'line', power: 4 };
    }

    // 磁铁 + 线消：行列 + 同色（磁力线扫）
    if ((t1 === TYPE.MAGNET && isLine(t2)) || (t2 === TYPE.MAGNET && isLine(t1))) {
      const magnet = t1 === TYPE.MAGNET ? ba : bb;
      const color = (magnet && magnet.type != null && magnet.type >= 0) ? magnet.type : dominantColor(board, R, C);
      addColor(color);
      addRow(midR); addCol(midC);
      return { label: '磁力线扫', cells, sfx: 'line' };
    }

    // 霜块 + 任意：一大片 + 冻结机关 3 回合
    if (t1 === TYPE.FROST || t2 === TYPE.FROST) {
      addBox(midR, midC, 2);
      addRow(midR); addCol(midC);
      return { label: '霜冻定格', cells, sfx: 'star', freeze: 3 };
    }

    // 颜料 + 任意：一片改成同色再全消（调色清场）
    if (t1 === TYPE.PAINT || t2 === TYPE.PAINT) {
      const color = dominantColor(board, R, C);
      addColor(color);
      addBox(midR, midC, 2);
      return { label: '调色清场', cells, sfx: 'line', paint: 2 };
    }

    // 螺旋桨 + 螺旋桨：全盘 X 形来回扫两遍
    if (t1 === TYPE.PROPELLER && t2 === TYPE.PROPELLER) {
      for (let d = -Math.max(R, C); d <= Math.max(R, C); d++) {
        const add2 = (rr, cc) => { if (rr >= 0 && rr < R && cc >= 0 && cc < C) cells.add(key(rr, cc)); };
        add2(a.r + d, a.c + d); add2(a.r + d, a.c - d);
        add2(b.r + d, b.c + d); add2(b.r + d, b.c - d);
      }
      return { label: '风车全扫', cells, sfx: 'line', power: 5 };
    }

    // 螺旋桨 + 炸弹：斜向四臂 + 3x3
    if ((t1 === TYPE.PROPELLER && t2 === TYPE.BOMB) || (t1 === TYPE.BOMB && t2 === TYPE.PROPELLER)) {
      for (let d = -Math.max(R, C); d <= Math.max(R, C); d++) {
        const add2 = (rr, cc) => { if (rr >= 0 && rr < R && cc >= 0 && cc < C) cells.add(key(rr, cc)); };
        add2(midR + d, midC + d); add2(midR + d, midC - d);
      }
      addBox(midR, midC, 1);
      return { label: '旋爆', cells, sfx: 'bomb', power: 4 };
    }

    // 彩虹 + 炸弹：全场某色变炸弹并引爆
    if ((t1 === TYPE.RAINBOW && t2 === TYPE.BOMB) || (t1 === TYPE.BOMB && t2 === TYPE.RAINBOW)) {
      const color = dominantColor(board, R, C);
      addColor(color);
      addBox(midR, midC, 2);
      return { label: '同色爆破', cells, sfx: 'bomb' };
    }

    // 彩虹 + 线消：全场某色 → 线消
    if (t1 === TYPE.RAINBOW || t2 === TYPE.RAINBOW) {
      const color = dominantColor(board, R, C);
      addColor(color);
      addRow(midR); addCol(midC);
      return { label: '同色线消', cells, sfx: 'line' };
    }

    // 炸弹 + 炸弹：5x5
    if (t1 === TYPE.BOMB && t2 === TYPE.BOMB) {
      addBox(midR, midC, 2);
      return { label: '大爆轰', cells, sfx: 'bomb', power: 5 };
    }

    // 炸弹 + 线消：十字炸弹
    if ((t1 === TYPE.BOMB && isLine(t2)) || (t2 === TYPE.BOMB && isLine(t1))) {
      addRow(midR); addCol(midC);
      addBox(midR, midC, 1);
      return { label: '十字炸弹', cells, sfx: 'bomb', power: 4 };
    }

    // 线消 + 线消：十字
    if (isLine(t1) && isLine(t2)) {
      if (t1 === TYPE.LINE_H && t2 === TYPE.LINE_H) {
        addRow(midR); addRow(midR - 1); addRow(midR + 1);
        return { label: '三行横扫', cells, sfx: 'line' };
      }
      if (t1 === TYPE.LINE_V && t2 === TYPE.LINE_V) {
        addCol(midC); addCol(midC - 1); addCol(midC + 1);
        return { label: '三列纵切', cells, sfx: 'line' };
      }
      addRow(midR); addCol(midC);
      return { label: '十字爆破', cells, sfx: 'line' };
    }

    // 兜底：其它没单列的融合，把两个块各自的作用范围合在一起
    // （保证任何两个特殊块相碰都有反馈，不会白交换一次）
    areaOf(t1, a.r, a.c, R, C, ba.type, board).forEach((k) => cells.add(k));
    areaOf(t2, b.r, b.c, R, C, bb.type, board).forEach((k) => cells.add(k));
    if (cells.size) return { label: '双特殊融合', cells, sfx: 'bomb' };

    return null;
  }

  global.Specials = {
    TYPE, META,
    detectRuns, detectLShapes, planCreation, expandClears, comboAt, dominantColor, key, parse
  };
})(window);
