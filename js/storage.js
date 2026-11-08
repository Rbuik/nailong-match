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
    visits: NS + ':visits',       // 链接点击次数 { count, first, last }
    net: NS + ':net',             // 后台缓存 { globalHits, geo:{country,region,city,ts} }
    save: NS + ':save'            // 当前局
  };

  const DEFAULT_ITEMS = { extraMoves: 0, extraTime: 0, shuffle: 0, undo: 0, startBomb: 0, rainbow: 0 };

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

  // 记录本关最高分与星级；没通关的成绩也记分（只记分不加星）
  // 返回 { isNewScore, isNewStars, first }：第一次玩这关也算新纪录
  function recordLevel(id, score, stars) {
    const all = getProgress();
    const cur = all[id] || { score: 0, stars: 0 };
    const first = !cur.recorded;              // 这关从未记过任何成绩
    const isNewScore = first || score > (cur.score || 0);
    const isNewStars = stars > (cur.stars || 0);
    all[id] = Object.assign({}, cur, {
      score: Math.max(cur.score || 0, score),
      stars: Math.max(cur.stars || 0, stars),
      recorded: true
    });
    write(K.progress, all);
    return { isNewScore, isNewStars, first };
  }

  // ---------- 每日挑战：当天最佳分（首次完成也算新纪录） ----------
  function dailyKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function getDailyRecord() {
    const rec = read(K.daily, null);
    if (!rec || rec.date !== dailyKey()) return { date: dailyKey(), best: 0, times: 0, stars: 0, moves: 0, coins: 0 };
    return { date: rec.date, best: rec.best || 0, times: rec.times || 0, stars: rec.stars || 0, moves: rec.moves || 0, coins: rec.coins || 0 };
  }

  // 返回记录后的最佳分和是否刷新（当天第一次完成同样算新纪录）
  // stars 也一并记录：拿到 3 星后当天不能再挑战
  // movesUsed：完成挑战这局用的步数（只记历史最少）；bonusCoins：完成奖励金币（一天只发一次）
  function recordDaily(score, stars, movesUsed, bonusCoins) {
    const cur = getDailyRecord();
    const first = !cur.times;
    const isNewScore = first || score > cur.best;
    const completed = (stars || 0) >= 1;   // 过关才算完成任务
    let moves = cur.moves || 0;
    if (completed && typeof movesUsed === 'number' && movesUsed >= 0) {
      moves = moves ? Math.min(moves, movesUsed) : movesUsed;
    }
    const next = {
      date: cur.date,
      best: first ? score : Math.max(cur.best, score),
      times: cur.times + 1,
      stars: Math.max(cur.stars || 0, stars || 0),
      moves: moves,
      coins: bonusCoins ? bonusCoins : (cur.coins || 0)
    };
    write(K.daily, next);
    return { isNewScore, best: next.best, times: next.times, stars: next.stars, moves: next.moves, coins: next.coins, first };
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
    return read(K.tasks, { date: '', list: [], signDay: 0, signDate: '', lastLogin: '', dates: [], cycleStart: '' });
  }

  function setTaskState(s) {
    write(K.tasks, s);
  }

  // 签到阶梯（对应 §8）
  const SIGN_REWARDS = [
    { coins: 50 }, { coins: 50 }, { coins: 50 }, { coins: 50 },
    { coins: 50 }, { coins: 50 }, { coins: 50 }
  ];
  // 连续签到每满 7 天（7/14/21/28…），额外 200 金币发到邮箱
  const SIGN_MILESTONE = { every: 7, coins: 200 };

  // 补签：一次补 1 天，花 50 金币（只补连续天数，不发当日奖励）
  const MAKEUP_COST = 50;

  function dparse(k) {
    const p = String(k || '').split('-').map(Number);
    return new Date(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1);
  }

  // 兼容旧存档：只有 signDay/signDate 时，按它们推导出本周期已签的日期表
  function normSign(s) {
    if (!Array.isArray(s.dates)) s.dates = [];
    // all：所有签过的日期（跨轮保留，日期条判断「签到了变绿」要用它，不能只看本轮 dates）
    if (!Array.isArray(s.all)) s.all = s.dates.slice();
    if (!s.cycleStart) s.cycleStart = '';
    // 老存档没有连续天数：用本轮已签天数近似（旧版一轮最多 7 天，误差最多几天）
    if (typeof s.streak !== 'number') s.streak = s.dates.length;
    if (!s.dates.length && s.signDate) {
      const n = Math.max(1, Math.min(s.signDay || 1, SIGN_REWARDS.length));
      const end = dparse(s.signDate);
      const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1));
      s.cycleStart = todayKey(start);
      s.dates = [];
      for (let i = 0; i < n; i++) {
        s.dates.push(todayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
      }
    }
    return s;
  }

  function signIn() {
    const s = normSign(getTaskState());
    const today = todayKey();
    if (s.signDate === today) return { ok: false, reason: 'already', day: s.signDay };

    const yesterday = todayKey(new Date(Date.now() - 86400000));
    // 连续天数不受「7 天一轮」限制：只要昨天签过就一直 +1（7/14/21/28… 里程碑看这个数）
    const broken = s.dates.indexOf(yesterday) < 0;
    let streak, day;
    if (broken) {
      streak = 1;                       // 断签 → 重新数
      day = 1;
      s.dates = [];
      s.cycleStart = today;
    } else {
      streak = (s.streak || 0) + 1;     // 连续 +1
      if (s.dates.length >= SIGN_REWARDS.length) {
        day = 1;                        // 本轮 7 格签满 → 日期条翻新的一轮，连续天数照常累计
        s.dates = [];
        s.cycleStart = today;
      } else {
        day = s.dates.length + 1;
      }
    }

    const reward = SIGN_REWARDS[day - 1];
    addCoins(reward.coins);
    if (reward.item) addItem(reward.item, reward.itemN);

    s.streak = streak;
    s.dates.push(today);
    if (s.all.indexOf(today) < 0) s.all.push(today);
    if (s.all.length > 400) s.all = s.all.slice(-400);
    s.signDay = s.dates.length;
    s.signDate = today;
    setTaskState(s);
    const milestone = (streak > 0 && streak % SIGN_MILESTONE.every === 0) ? SIGN_MILESTONE.coins : 0;
    return { ok: true, day, reward, streak: streak, milestone: milestone };
  }

  // 签到起始日 = 用户注册（建号）那一天；取不到就退回最早签到的日子，再退回今天
  // 从这一天起：签过的变绿，没签的可以补签；这一天之前不算漏签
  function signStart() {
    const s = normSign(getTaskState());
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let reg = null;
    try {
      const acc = (typeof Account !== 'undefined' && Account && Account.current) ? Account.current() : null;
      if (acc && acc.created) {
        reg = new Date(acc.created);
        if (isNaN(reg.getTime())) reg = null;
        else reg.setHours(0, 0, 0, 0);
      }
    } catch (e) {}
    if (reg) return reg > today ? today : reg;
    const list = (s.all || []).slice().sort();
    if (list.length) return dparse(list[0]);
    return today;
  }

  // 补签：补上指定的漏签日期（不传就补最早漏掉的那天），花 50 金币（不发当日奖励）
  function makeupSign(dateKey) {
    const s = normSign(getTaskState());
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = signStart();
    let miss = null;
    if (dateKey) {
      // 指定日期：必须是注册之后、今天之前、且还没签的
      const dk = dparse(dateKey);
      if (dk >= today) return { ok: false, reason: 'none' };
      if (dk < start) return { ok: false, reason: 'none' };
      if (s.all.indexOf(todayKey(dk)) >= 0) return { ok: false, reason: 'none' };
      miss = todayKey(dk);
    } else {
      const yest = new Date(); yest.setDate(yest.getDate() - 1);
      for (let d = new Date(start); d <= yest; d.setDate(d.getDate() + 1)) {
        const k = todayKey(d);
        if (s.all.indexOf(k) < 0) { miss = k; break; }
      }
    }
    if (!miss) return { ok: false, reason: 'none' };

    const w = getWallet();
    if ((w.coins || 0) < MAKEUP_COST) return { ok: false, reason: 'poor', need: MAKEUP_COST - (w.coins || 0) };
    if (!spendCoins(MAKEUP_COST)) return { ok: false, reason: 'poor', need: MAKEUP_COST };

    s.dates.push(miss);
    s.dates.sort();
    if (s.all.indexOf(miss) < 0) s.all.push(miss);
    s.all.sort();
    if (s.all.length > 400) s.all = s.all.slice(-400);
    s.signDay = s.dates.length;
    s.streak = (s.streak || 0) + 1;   // 补上漏签的那天，连续天数照常 +1
    setTaskState(s);
    return { ok: true, day: s.signDay, date: miss };
  }

  // 福利中心展示用：连续天数 + 可补签天数
  function signStats() {
    const s = normSign(getTaskState());
    const today = todayKey();
    const yesterday = todayKey(new Date(Date.now() - 86400000));
    const signedToday = s.signDate === today;
    let streak = 0;
    if (signedToday || s.all.indexOf(yesterday) >= 0) streak = s.streak || s.signDay || s.dates.length;
    // 可补签天数：从注册那天到昨天，还没签的天数
    let missed = 0;
    const start = signStart();
    const yd = dparse(yesterday);
    for (let d = new Date(start); d <= yd; d.setDate(d.getDate() + 1)) {
      if (s.all.indexOf(todayKey(d)) < 0) missed++;
      if (missed > 400) break;
    }
    return { streak: streak, signedToday: signedToday, missed: missed, canMakeup: missed > 0, day: s.signDay || 0 };
  }

  function canSignIn() {
    return getTaskState().signDate !== todayKey();
  }

  // 本轮签到的起点（Date）；还没签过任何一天时返回 null
  function signCycleStart() {
    const s = normSign(getTaskState());
    if (!s.cycleStart && !s.dates.length) return null;
    return dparse(s.cycleStart || s.dates[0]);
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

  // ---------- 链接点击次数（每载入一次页面 +1，供隐藏后台查看） ----------
  // 统计起点：2026-11-05 00:00:00（本地时间），此前的点击不计入
  const COUNT_START = new Date(2026, 10, 5, 0, 0, 0).getTime();
  // 对外暴露，game.js 里记「全网」时用同一个起点
  function countStart() { return COUNT_START; }

  function getVisits() {
    return read(K.visits, { count: 0, first: 0, last: 0 });
  }

  function recordVisit() {
    const now = Date.now();
    const v = getVisits();
    if (now < COUNT_START) return v;   // 起点之前不算
    v.count += 1;
    if (!v.first) v.first = now;
    v.last = now;
    write(K.visits, v);
    return v;
  }

  function resetVisits() {
    write(K.visits, { count: 0, first: 0, last: 0 });
  }

  // ---------- 后台统计缓存（全网次数 / 定位），离线时展示上次结果 ----------
  function getNet() {
    return read(K.net, { globalHits: 0, geo: null });
  }

  function patchNet(patch) {
    const n = Object.assign(getNet(), patch);
    write(K.net, n);
    return n;
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
    Object.keys(K).forEach((key) => {
      if (key === 'visits' || key === 'net') return; // 后台统计不随注销清空
      try { localStorage.removeItem(K[key]); } catch (e) {}
    });
    ['nailong_save', 'nailong_level_scores', 'nailong_music_history', 'nailong_playlist',
      NS + ':musicHistory', NS + ':playlist', NS + ':playMode']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
  }

  migrate();

  global.Store = {
    K, VERSION, SIGN_REWARDS, SIGN_MILESTONE,
    getProgress, getLevelRecord, recordLevel, getDailyRecord, recordDaily, totalStars, maxUnlockedLevel,
    markPlayed, hasPlayed,
    getWallet, addCoins, spendCoins, addItem, useItem,
    getTaskState, setTaskState, signIn, makeupSign, signStats, canSignIn, MAKEUP_COST, todayKey, dayIndex, signCycleStart, signStart,
    getSettings, setSettings, getVisits, recordVisit, resetVisits, getNet, patchNet, countStart,
    COUNT_START,
    saveRun, loadRun, clearRun, wipeAll
  };
})(window);
