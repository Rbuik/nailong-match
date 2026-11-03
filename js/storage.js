// storage.js — 存档 v2：分 key 存储 + 版本号迁移 + 星级 / 金币 / 道具 / 签到
// 暴露 window.Store
// 对应优化方案 §21（存档结构升级 + 版本号）、§7（金币道具经济）、§8（连续登录）、§5（星级）

(function (global) {
  'use strict';

  const NS = 'nl2';
  const VERSION = 2;

  const K = {
    meta: NS + ':meta',
    progress: NS + ':progress',   // 每关 { score, stars }
    wallet: NS + ':wallet',       // { coins, items:{} }
    tasks: NS + ':tasks',         // { date, list:[], signDay, signDate }
    settings: NS + ':settings',   // { music, bgm, sfx, theme }
    daily: NS + ':daily',         // 每日挑战当天最佳 { date, best, times }
    visits: NS + ':visits',       // 链接打开次数 { count, first, last }
    save: NS + ':save'            // 当前局
  };

  const DEFAULT_ITEMS = { extraMoves: 0, shuffle: 0, undo: 0, startBomb: 0, rainbow: 0 };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[Store] 写入失败', key, e);
      return false;
    }
  }

  // ---------- 迁移：把 v1 的扁平 key 搬进 v2 ----------
  function migrate() {
    const meta = read(K.meta, { version: 0 });
    if (meta.version >= VERSION) return;

    // v1 -> v2
    const oldScores = read('nailong_level_scores', null);
    if (oldScores) {
      const progress = read(K.progress, {});
      Object.keys(oldScores).forEach((lv) => {
        const best = oldScores[lv] || 0;
        if (!progress[lv]) progress[lv] = { score: best, stars: best > 0 ? 1 : 0 };
      });
      write(K.progress, progress);
    }

    const oldSave = localStorage.getItem('nailong_save');
    if (oldSave) localStorage.setItem(K.save, oldSave);

    write(K.meta, { version: VERSION, migratedAt: Date.now() });
  }

  // ---------- 进度与星级 ----------
  function getProgress() {
    return read(K.progress, {});
  }

  function getLevelRecord(id) {
    return getProgress()[id] || { score: 0, stars: 0 };
  }

  // 只在更好时写入；返回 { isNewScore, isNewStars }
  function recordLevel(id, score, stars) {
    const all = getProgress();
    const cur = all[id] || { score: 0, stars: 0 };
    const isNewScore = score > cur.score;
    const isNewStars = stars > cur.stars;
    all[id] = { score: Math.max(cur.score, score), stars: Math.max(cur.stars, stars) };
    write(K.progress, all);
    return { isNewScore, isNewStars };
  }

  // ---------- 每日挑战：当天最佳分（首次完成也算新纪录） ----------
  function dailyKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function getDailyRecord() {
    const rec = read(K.daily, null);
    if (!rec || rec.date !== dailyKey()) return { date: dailyKey(), best: 0, times: 0 };
    return { date: rec.date, best: rec.best || 0, times: rec.times || 0 };
  }

  // 返回记录后的最佳分和是否刷新
  function recordDaily(score) {
    const cur = getDailyRecord();
    const isNewScore = score > cur.best;
    const next = { date: cur.date, best: Math.max(cur.best, score), times: cur.times + 1 };
    write(K.daily, next);
    return { isNewScore, best: next.best, times: next.times };
  }

  // 玩过标记：只记「这关动过手」，不影响分数与星级（用于主页按钮区分「没玩过 / 玩过没通关」）
  function markPlayed(id) {
    const all = getProgress();
    const cur = all[id] || { score: 0, stars: 0 };
    cur.played = true;
    all[id] = cur;
    write(K.progress, all);
  }

  function hasPlayed(id) {
    const rec = getProgress()[id];
    return !!(rec && rec.played);
  }

  function totalStars() {
    const all = getProgress();
    return Object.keys(all).reduce((s, k) => s + (all[k].stars || 0), 0);
  }

  // 已解锁的最高关：上一关拿到至少 1 星；不超过主线总关数
  function maxUnlockedLevel(maxMain) {
    const all = getProgress();
    let lv = 1;
    while (lv < 9999) {
      const rec = all[lv];
      if (rec && rec.stars >= 1) lv++;
      else break;
    }
    return Math.max(1, Math.min(lv, maxMain));
  }

  // ---------- 钱包 ----------
  function getWallet() {
    const w = read(K.wallet, { coins: 0, items: {} });
    w.items = Object.assign({}, DEFAULT_ITEMS, w.items || {});
    return w;
  }

  function setWallet(w) {
    write(K.wallet, w);
  }

  function addCoins(n) {
    const w = getWallet();
    w.coins = Math.max(0, w.coins + n);
    setWallet(w);
    return w.coins;
  }

  function spendCoins(n) {
    const w = getWallet();
    if (w.coins < n) return false;
    w.coins -= n;
    setWallet(w);
    return true;
  }

  function addItem(key, n) {
    const w = getWallet();
    w.items[key] = (w.items[key] || 0) + (n || 1);
    setWallet(w);
    return w.items[key];
  }

  function useItem(key) {
    const w = getWallet();
    if (!w.items[key] || w.items[key] <= 0) return false;
    w.items[key]--;
    setWallet(w);
    return true;
  }

  // ---------- 每日任务 / 签到 ----------
  function todayKey(d) {
    d = d || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function dayIndex(d) {
    d = d || new Date();
    return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
  }

  function getTaskState() {
    return read(K.tasks, { date: '', list: [], signDay: 0, signDate: '', lastLogin: '' });
  }

  function setTaskState(s) {
    write(K.tasks, s);
  }

  // 签到阶梯（对应 §8）
  const SIGN_REWARDS = [
    { coins: 50 }, { coins: 80 }, { coins: 120 }, { coins: 180 },
    { coins: 250 }, { coins: 350 }, { coins: 500, item: 'rainbow', itemN: 1 }
  ];

  function signIn() {
    const s = getTaskState();
    const today = todayKey();
    if (s.signDate === today) return { ok: false, reason: 'already', day: s.signDay };

    const yesterday = todayKey(new Date(Date.now() - 86400000));
    let day = s.signDate === yesterday ? s.signDay + 1 : 1;
    if (day > SIGN_REWARDS.length) day = 1;

    const reward = SIGN_REWARDS[day - 1];
    addCoins(reward.coins);
    if (reward.item) addItem(reward.item, reward.itemN);

    s.signDay = day;
    s.signDate = today;
    setTaskState(s);
    return { ok: true, day, reward };
  }

  function canSignIn() {
    return getTaskState().signDate !== todayKey();
  }

  // ---------- 设置 ----------
  function getSettings() {
    return Object.assign(
      { music: true, bgm: 0.5, sfx: 0.5, theme: 'grass', dragSwap: true, ghostPreview: true },
      read(K.settings, {})
    );
  }

  function setSettings(patch) {
    const s = Object.assign(getSettings(), patch);
    write(K.settings, s);
    return s;
  }

  // ---------- 链接打开次数（每载入一次页面 +1，供隐藏后台查看） ----------
  function getVisits() {
    return read(K.visits, { count: 0, first: 0, last: 0 });
  }

  function recordVisit() {
    const now = Date.now();
    const v = getVisits();
    v.count += 1;
    if (!v.first) v.first = now;
    v.last = now;
    write(K.visits, v);
    return v;
  }

  function resetVisits() {
    write(K.visits, { count: 0, first: 0, last: 0 });
  }

  // ---------- 当前局存档 ----------
  function saveRun(state) {
    write(K.save, state);
  }

  function loadRun() {
    return read(K.save, null);
  }

  function clearRun() {
    try { localStorage.removeItem(K.save); } catch (e) {}
  }

  function wipeAll() {
    Object.values(K).forEach((k) => {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    ['nailong_save', 'nailong_level_scores', 'nailong_music_history', 'nailong_playlist',
      NS + ':musicHistory', NS + ':playlist', NS + ':playMode']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
  }

  migrate();

  global.Store = {
    K, VERSION, SIGN_REWARDS,
    getProgress, getLevelRecord, recordLevel, getDailyRecord, recordDaily, totalStars, maxUnlockedLevel,
    markPlayed, hasPlayed,
    getWallet, addCoins, spendCoins, addItem, useItem,
    getTaskState, setTaskState, signIn, canSignIn, todayKey, dayIndex,
    getSettings, setSettings, getVisits, recordVisit, resetVisits,
    saveRun, loadRun, clearRun, wipeAll
  };
})(window);
