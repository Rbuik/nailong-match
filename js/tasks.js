// tasks.js — 每日任务 / 每日挑战 / 商店
// 对应优化方案 §6（每日任务 & 每日挑战）、§7（金币道具经济）
// 暴露 window.Tasks

(function (global) {
  'use strict';

  const POOL = [
    // 简单 20 金币
    { id: 'win1', desc: '通过 1 关', target: 1, reward: 20, event: 'win' },
    { id: 'combo3', desc: '单局连击达到 x3', target: 1, reward: 20, event: 'combo3' },
    // 中等 40 金币
    { id: 'play3', desc: '完成 3 局游戏', target: 3, reward: 40, event: 'play' },
    { id: 'bomb', desc: '触发 2 次炸弹', target: 2, reward: 40, event: 'bomb' },
    { id: 'match4', desc: '完成 3 次 4 连消除', target: 3, reward: 40, event: 'match4' },
    { id: 'line', desc: '触发 3 次线消', target: 3, reward: 40, event: 'line' },
    // 困难 60 金币
    { id: 'combo4', desc: '单局连击达到 x4', target: 1, reward: 60, event: 'combo4' },
    { id: 'rainbow', desc: '触发 1 次彩虹', target: 1, reward: 60, event: 'rainbow' },
    { id: 'jelly', desc: '清除 15 格果冻', target: 15, reward: 60, event: 'jelly' },
    { id: 'score5000', desc: '累计获得 5000 分', target: 5000, reward: 60, event: 'score' }
  ];

  // 商店：价格按「生成难度 × 能力大小」排成阶梯
  // 150 洗牌 / 撤回 ｜ 200 线消 / 炸弹 ｜ 300 霜块、+3 步 / +7s
  // 350 磁铁 ｜ 400 螺旋桨 ｜ 450 颜料 ｜ 500 彩虹
  const SHOP = [
    { key: 'extraMoves', name: '+3 步', price: 300, desc: '本局步数 +3', icon: '👣' },
    { key: 'extraTime', name: '+7s', price: 300, desc: '本局时间 +7s（限时关）', icon: '⏱️' },
    { key: 'shuffle', name: '洗牌 +1', price: 150, desc: '重排棋盘一次', icon: '🔄' },
    { key: 'undo', name: '撤回 +1', price: 150, desc: '回退上一步', icon: '↩️' },
    { key: 'startLine', name: '开局线消', price: 200, desc: '开局在随机位置放一条线消', icon: '➖' },
    { key: 'startBomb', name: '开局炸弹', price: 200, desc: '开局在随机位置放一颗炸弹', icon: '💣' },
    { key: 'startFrost', name: '开局霜块', price: 300, desc: '开局放一块霜块；消掉后 3 步机关暂停', icon: '❄️' },
    { key: 'startMagnet', name: '开局磁铁', price: 350, desc: '开局放一块磁铁；吸同行同列同色一起消', icon: '🧲' },
    { key: 'startPropeller', name: '开局螺旋桨', price: 400, desc: '开局放一块螺旋桨；斜扫两条对角线', icon: '🛩️' },
    { key: 'startPaint', name: '开局颜料', price: 450, desc: '开局放一块颜料；把一大片刷成同色', icon: '🎨' },
    { key: 'rainbow', name: '彩虹道具', price: 500, desc: '随机把一块变成彩虹', icon: '🌈' }
  ];

  function todayStr() {
    return Store.todayKey();
  }

  // 每天出几个任务
  const DAILY_COUNT = 5;

  // 奖励只有 20 / 40 / 60 三档：先每档各抽一个，剩下的名额从全部剩余里补
  function pickDaily(rng, prevIds) {
    const tiers = [20, 40, 60];
    const groups = {};
    tiers.forEach((r) => {
      groups[r] = rng.shuffle(POOL.filter((p) => p.reward === r).slice());
      // 上一批出过的压到队尾
      groups[r].sort((a, b) =>
        (prevIds.indexOf(a.id) >= 0 ? 1 : 0) - (prevIds.indexOf(b.id) >= 0 ? 1 : 0));
    });
    const picked = tiers.map((r) => groups[r].shift());
    const rest = rng.shuffle(tiers.reduce((arr, r) => arr.concat(groups[r]), []));
    // 补位时同样把上一批出过的压到队尾，尽量整批换新
    rest.sort((a, b) =>
      (prevIds.indexOf(a.id) >= 0 ? 1 : 0) - (prevIds.indexOf(b.id) >= 0 ? 1 : 0));
    while (picked.length < DAILY_COUNT && rest.length) picked.push(rest.shift());
    return rng.shuffle(picked);
  }

  // 保证今天的任务已生成（同一日期固定，不随刷新变化）
  function ensureToday() {
    const s = Store.getTaskState();
    const today = todayStr();
    // 旧版本存档里可能有 80/120 之类的面值 → 直接重抽，保证只出现 20 / 40 / 60
    const bad = (s.list || []).some((t) => [20, 40, 60].indexOf(t.reward) < 0);
    if (s.date === today && Array.isArray(s.list) && s.list.length === DAILY_COUNT && !bad) return s;

    // 「每天的任务尽量不要一样」：上一批出过的压到候选队尾，通常能整批换新
    const prevIds = (Array.isArray(s.list) && s.date && s.date !== today)
      ? s.list.map((t) => t.id) : [];
    const rng = RNG.source(RNG.seedFromDate(new Date()));
    const picked = pickDaily(rng, prevIds);
    s.date = today;
    s.list = picked.map((p) => ({
      id: p.id,
      desc: p.desc,
      target: p.target,
      reward: p.reward,
      event: p.event,
      progress: 0,
      claimed: false
    }));
    Store.setTaskState(s);
    return s;
  }

  function getToday() {
    return ensureToday().list;
  }

  // 上报事件，推进任务进度
  function report(eventType, amount) {
    const s = ensureToday();
    let touched = false;
    s.list.forEach((t) => {
      if (t.claimed) return;
      if (t.event !== eventType) return;
      t.progress = Math.min(t.target, t.progress + (amount == null ? 1 : amount));
      touched = true;
    });
    if (touched) Store.setTaskState(s);
    return s.list;
  }

  function claim(taskId) {
    const s = ensureToday();
    const t = s.list.find((x) => x.id === taskId);
    if (!t || t.claimed || t.progress < t.target) return false;
    t.claimed = true;
    Store.setTaskState(s);
    Store.addCoins(t.reward);
    if (global.Meta && Meta.bump) Meta.bump('daily', 1);   // 成就：累计完成每日任务
    AudioManager.playSFX('coin');
    return t.reward;
  }

  // 每日挑战：固定种子（全服同布局），步数固定，目标按日期递增
  function getDailyChallenge() {
    const seed = RNG.seedFromDate(new Date());
    const rng = RNG.source(seed);
    const dayIndex = Store.dayIndex();
    const target = 1500 + (dayIndex % 30) * 200;
    return {
      id: 'daily',
      daily: true,
      seed,
      theme: ['grass', 'ocean', 'star', 'candy'][seed % 4],
      moves: 20,
      colors: 5 + (dayIndex % 2),
      goal: { type: 'score', target },
      stars: [target, Math.round(target * 1.3), Math.round(target * 1.7)]
    };
  }

  function buy(key) {
    const item = SHOP.find((x) => x.key === key);
    if (!item) return { ok: false, reason: 'no-item' };
    if (!Store.spendCoins(item.price)) return { ok: false, reason: 'no-coins' };
    Store.addItem(key, 1);
    AudioManager.playSFX('coin');
    return { ok: true, item };
  }

  global.Tasks = { POOL, SHOP, getToday, report, claim, getDailyChallenge, buy, ensureToday };
})(window);
