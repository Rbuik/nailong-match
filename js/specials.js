// specials.js — 特殊块：线消 / 炸弹 / 彩虹 + 7 种组合技
// 对应优化方案 §2（组合技 + 新增线消块）、§19（可辨识外观的数据支持）
// 暴露 window.Specials

(function (global) {
  'use strict';

  const TYPE = { NORMAL: 0, LINE_H: 1, LINE_V: 2, BOMB: 3, RAINBOW: 4 };

  const META = {
    0: { name: '普通块', icon: '', color: null },
    1: { name: '横线消', icon: '↔', color: '#5c8fff' },
    2: { name: '竖线消', icon: '↕', color: '#5c8fff' },
    3: { name: '炸弹', icon: '💣', color: '#ff5c5c' },
    4: { name: '彩虹', icon: '🌈', color: '#c85cff' }
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
  // 优先级：彩虹（5 连 / L 型）> 炸弹（4 连同向两次）> 线消（4 连）
  function planCreation(board, matchedSet, swapped, runs, lShapes) {
    const inMatched = (p) => matchedSet.has(key(p.r, p.c));
    const atSwap = () => {
      if (!swapped) return null;
      for (const p of [swapped.a, swapped.b]) {
        if (inMatched(p) && board[p.r][p.c] && board[p.r][p.c].special === TYPE.NORMAL) return p;
      }
      return null;
    };

    // 1) L / T 型 -> 彩虹
    if (lShapes && lShapes.length) {
      const shape = lShapes[0];
      const s = atSwap();
      if (s && shape.cells.some((p) => p.r === s.r && p.c === s.c)) {
        return { r: s.r, c: s.c, type: TYPE.RAINBOW };
      }
      if (board[shape.center.r][shape.center.c] &&
          board[shape.center.r][shape.center.c].special === TYPE.NORMAL) {
        return { r: shape.center.r, c: shape.center.c, type: TYPE.RAINBOW };
      }
    }

    if (!runs || !runs.length) return null;

    // 2) 5 连 -> 彩虹
    const five = runs.filter((x) => x.len >= 5).sort((a, b) => b.len - a.len)[0];
    if (five) {
      const s = atSwap();
      if (s && five.cells.some((p) => p.r === s.r && p.c === s.c)) {
        return { r: s.r, c: s.c, type: TYPE.RAINBOW };
      }
      const p = five.cells[Math.floor(five.cells.length / 2)];
      if (board[p.r][p.c] && board[p.r][p.c].special === TYPE.NORMAL) {
        return { r: p.r, c: p.c, type: TYPE.RAINBOW };
      }
    }

    // 3) 4 连 -> 线消（按方向），同一批出现两个方向的 4 连 -> 炸弹
    const fours = runs.filter((x) => x.len === 4);
    if (fours.length >= 2) {
      const dirs = new Set(fours.map((f) => f.dir));
      if (dirs.size >= 2) {
        const s = atSwap();
        if (s) return { r: s.r, c: s.c, type: TYPE.BOMB };
        const p = fours[0].cells[1];
        if (board[p.r][p.c] && board[p.r][p.c].special === TYPE.NORMAL) {
          return { r: p.r, c: p.c, type: TYPE.BOMB };
        }
      }
    }
    if (fours.length >= 1) {
      const f = fours[0];
      const wantType = f.dir === 'h' ? TYPE.LINE_H : TYPE.LINE_V;
      const s = atSwap();
      if (s && f.cells.some((p) => p.r === s.r && p.c === s.c)) {
        return { r: s.r, c: s.c, type: wantType };
      }
      const p = f.cells[1];
      if (board[p.r][p.c] && board[p.r][p.c].special === TYPE.NORMAL) {
        return { r: p.r, c: p.c, type: wantType };
      }
    }

    return null;
  }

  // ============ 单个特殊块的作用范围 ============
  function areaOf(type, r, c, R, C, color, board) {
    const out = new Set();
    const add = (rr, cc) => {
      if (rr >= 0 && rr < R && cc >= 0 && cc < C) out.add(key(rr, cc));
    };

    if (type === TYPE.LINE_H) {
      for (let cc = 0; cc < C; cc++) add(r, cc);
    } else if (type === TYPE.LINE_V) {
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
        // 彩虹：优先取场上最多的颜色
        color = opts.rainbowColor != null ? opts.rainbowColor : dominantColor(board, R, C);
        if (color != null) jellyColor = color;
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

    return null;
  }

  global.Specials = {
    TYPE, META,
    detectRuns, detectLShapes, planCreation, expandClears, comboAt, dominantColor, key, parse
  };
})(window);
