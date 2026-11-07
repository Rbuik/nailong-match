// 一次性脚本：给 levels.json 追加第五～八章（41~80 关），并升级版本号
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'js', 'levels.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

data.version = 4;
data.maxMainLevel = 80;
data.themes.forest = { name: '森林', bg: '#ffffff', grid: '#eef6ec' };
data.themes.sky = { name: '云端', bg: '#ffffff', grid: '#ecf3fb' };
data.themes.desert = { name: '沙漠', bg: '#ffffff', grid: '#faf1e3' };
data.themes.lava = { name: '熔岩', bg: '#ffffff', grid: '#fbeceb' };

const chapters = [
  {
    id: 5, name: '第五章 · 奶龙的藤蔓花园', theme: 'forest', from: 41, to: 50, emoji: '🌿',
    story: '花园里的藤蔓一夜之间爬满了小路。奶龙提着灯笼往里走，边走边把缠住脚的枝条剪开——它得在藤蔓把整座花园吞掉之前找到出口。'
  },
  {
    id: 6, name: '第六章 · 奶龙的云端轨道', theme: 'sky', from: 51, to: 60, emoji: '☁️',
    story: '出口通向云上。云做的轨道每隔几步就自己挪一格，两扇紫色的门把货物送到对面。奶龙抱紧糖果，踩着滑动的云往前走。'
  },
  {
    id: 7, name: '第七章 · 奶龙的流沙遗迹', theme: 'desert', from: 61, to: 70, emoji: '🏜️',
    story: '云散了，底下是一片会吃人的沙子。雾气里什么都看不清，奶龙只能靠摸——摸着摸着，脚底已经陷下去半寸。'
  },
  {
    id: 8, name: '第八章 · 奶龙的熔岩宝库', theme: 'lava', from: 71, to: 80, emoji: '🔥',
    story: '宝库在火山口。上锁的箱子、滴答倒数的炸弹，最后一道门后就是回家的钥匙。奶龙深吸一口气，冲了进去。'
  }
];

// 41~80：每条 [目标类型, 目标参数, 步数, 额外字段]
const defs = [
  // 第五章：常春藤 / 霜块
  [41, 'collect', { 0: 15, 3: 15 }, 26, { ivy: 2 }],
  [42, 'clear', 20, 24, { ivy: 3 }],
  [43, 'score', 4200, 24, { ivy: 2, ice: 4 }],
  [44, 'ice', 10, 26, { ice: 6, frost: 2 }],
  [45, 'collect', { 1: 18, 4: 18 }, 26, { ivy: 3, frost: 2 }],
  [46, 'drop', 10, 28, { cargo: 10, ivy: 2 }],
  [47, 'clear', 24, 26, { ivy: 4, chain: 3 }],
  [48, 'score', 5200, 22, { ivy: 3, iceHard: 3 }],
  [49, 'rescue', 6, 28, { rescue: 6, ivy: 3 }],
  [50, 'score', 6000, 24, { ivy: 4, frost: 3, ice: 6, boss: true }],

  // 第六章：传送门 / 移动轨道
  [51, 'drop', 10, 26, { cargo: 10, portal: 1 }],
  [52, 'collect', { 2: 18, 5: 18 }, 26, { portal: 1, track: 1 }],
  [53, 'score', 5600, 24, { portal: 2, track: 1 }],
  [54, 'clear', 22, 26, { track: 2 }],
  [55, 'ice', 12, 26, { ice: 6, track: 2 }],
  [56, 'drop', 12, 28, { cargo: 12, portal: 1, track: 2 }],
  [57, 'score', 6200, 24, { portal: 2, track: 2 }],
  [58, 'rescue', 6, 28, { rescue: 6, portal: 1, track: 1 }],
  [59, 'collect', { 0: 20, 2: 20, 4: 20 }, 28, { portal: 2, track: 2 }],
  [60, 'score', 7000, 26, { portal: 2, track: 3, ice: 4, boss: true }],

  // 第七章：流沙 / 迷雾
  [61, 'drop', 12, 28, { cargo: 12, sand: 4 }],
  [62, 'score', 6600, 24, { sand: 6, fog: 8 }],
  [63, 'clear', 24, 26, { sand: 5, fog: 10 }],
  [64, 'collect', { 1: 20, 3: 20 }, 26, { fog: 14 }],
  [65, 'ice', 12, 26, { ice: 6, fog: 12 }],
  [66, 'drop', 12, 28, { cargo: 12, sand: 6, fog: 10 }],
  [67, 'score', 7200, 24, { sand: 8, fog: 12, track: 1 }],
  [68, 'rescue', 6, 30, { rescue: 6, sand: 5, fog: 12 }],
  [69, 'collect', { 0: 22, 2: 22 }, 28, { sand: 8, fog: 16, ice: 4 }],
  [70, 'score', 8000, 26, { sand: 10, fog: 14, portal: 1, boss: true }],

  // 第八章：保险箱 / 步数炸弹
  [71, 'collect', { 4: 20, 5: 20 }, 26, { box: 3 }],
  [72, 'score', 7600, 24, { box: 4, ice: 4 }],
  [73, 'clear', 26, 26, { box: 3, chain: 4 }],
  [74, 'drop', 12, 28, { cargo: 12, tbomb: 1 }],
  [75, 'ice', 14, 28, { ice: 8, tbomb: 2 }],
  [76, 'score', 8200, 24, { tbomb: 2, box: 3 }],
  [77, 'rescue', 8, 30, { rescue: 8, tbomb: 2, sand: 4 }],
  [78, 'collect', { 2: 24, 4: 24 }, 28, { tbomb: 2, fog: 10, ivy: 2 }],
  [79, 'clear', 28, 28, { box: 4, tbomb: 2, track: 2 }],
  [80, 'score', 10000, 26, { tbomb: 3, box: 3, ivy: 2, fog: 8, boss: true, final: true }]
];

function starsFor(goal, moves) {
  let base;
  if (goal.type === 'score' || goal.type === 'moves' || goal.type === 'timed') base = goal.target;
  else base = Math.round(moves * 82 / 10) * 10;
  return [base, Math.round(base * 1.32 / 10) * 10, Math.round(base * 1.66 / 10) * 10];
}

const old = data.levels.filter((l) => l.id <= 40);
const next = defs.map(([id, type, target, moves, extra]) => {
  const goal = { type, target };
  if (type === 'timed') goal.time = extra.time || moves;
  const ch = chapters.find((c) => id >= c.from && id <= c.to);
  const lv = {
    id,
    chapter: ch.id,
    theme: ch.theme,
    moves,
    goal,
    stars: starsFor(goal, moves)
  };
  Object.keys(extra).forEach((k) => { if (k !== 'time') lv[k] = extra[k]; });
  return lv;
});

data.chapters = data.chapters.filter((c) => c.id <= 4).concat(chapters);
data.levels = old.concat(next);

fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('levels:', data.levels.length, 'chapters:', data.chapters.length, 'max:', data.maxMainLevel);
console.log('last:', JSON.stringify(data.levels[data.levels.length - 1]));
