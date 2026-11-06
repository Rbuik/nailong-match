// tasks.js — 每日任务 / 每日挑战 / 商店
// 对应优化方案 §6（每日任务 & 每日挑战）、§7（金币道具经济）
// 暴露 window.Tasks

(function (global) {
  'use strict';

  const POOL = [
    { id: 'match4', desc: '完成 3 次 4 连消除', target: 3, reward: 80, event: 'match4' },
    { id: 'bomb', desc: '触发 2 次炸弹', target: 2, reward: 80, event: 'bomb' },
    { id: 'combo4', desc: '单局连击达到 x4', target: 1, reward: 120, event: 'combo4' },
    { id: 'jelly', desc: '清除 15 格果冻', target: 15, reward: 100, event: 'jelly' },
    { id: 'play3', desc: '完成 3 局游戏', target: 3, reward: 60, event: 'play' },
    { id: 'score5000', desc: '累计获得 5000 分', target: 5000, reward: 150, event: 'score' },
    { id: 'rainbow', desc: '触发 1 次彩虹', target: 1, reward: 120, event: 'rainbow' },
    { id: 'line', desc: '触发 3 次线消', target: 3, reward: 90, event: 'line' }
  ];

  // 商店（§7）
  const SHOP = [
    { key: 'extraMoves', name: '+3 步', price: 300, desc: '本局步数 +3', icon: '👣' },
    { key: 'shuffle', name: '洗牌 +1', price: 150, desc: '重排棋盘一次', icon: '🔄' },
    { key: 'undo', name: '撤回 +1', price: 150, desc: '回退上一步', icon: '↩️' },
    { key: 'startBomb', name: '开局炸弹', price: 200, desc: '开局在随机位置放一颗炸弹', icon: '💣' },
    { key: 'rainbow', name: '彩虹道具', price: 500, desc: '随机把一块变成彩虹', icon: '🌈' }
  ];

  function todayStr() {
    return Store.todayKey();
  }

  // 保证今天的任务已生成（同一日期固定，不随刷新变化）
  function ensureToday() {
    const s = Store.getTaskState();
    const today = todayStr();
    if (s.date === today && Array.isArray(s.list) && s.list.length === 3) return s;

    const rng = RNG.source(RNG.seedFromDate(new Date()));
    const picked = rng.shuffle(POOL.slice()).slice(0, 3);
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
