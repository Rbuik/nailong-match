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
    ledger: NS + ':ledger',       // 金币明细 [{ t:时间, d:正负金额, m:说明, x:具体说明 }]
    ledgerInit: NS + ':ledgerInit', // 明细上线时补记过历史收支（只补一次）
    ledgerDetail: NS + ':ledgerDetail', // 老记录补过「具体买了什么 / 哪一阶成就」（只补一次）
    ledgerTop: NS + ':ledgerTop',       // 已经按余额对齐过一次「历史收支」
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

  // 钱包一变就通知外面（主页 / 商店 / 明细页的数字要跟着走，不用等手动刷新）
  const walletSubs = [];
  function onWallet(fn) {
    if (typeof fn === 'function' && walletSubs.indexOf(fn) < 0) walletSubs.push(fn);
  }

  function setWallet(w) {
    write(K.wallet, w);
    for (let i = 0; i < walletSubs.length; i++) {
      try { walletSubs[i](w); } catch (e) {}
    }
  }

  // ---------- 金币明细 ----------
  // 只保留最近 300 条，避免存档无限膨胀；每次进出账都记一条（金额正=收入、负=支出）
  // x = 具体说明（买的是哪个道具 / 领的是哪枚成就），列表里用灰色小字显示
  const LEDGER_MAX = 300;
  function readLedger() {
    const a = read(K.ledger, []);
    return Array.isArray(a) ? a.filter((x) => x && typeof x.d === 'number' && x.t) : [];
  }
  // 明细上线前的金币进出没有逐笔记账，第一笔先按余额补一条「历史收支」，
  // 保证明细里的加总 = 钱包余额；时间落在建号那天，之后就不再补了
  function createdTime() {
    let t = 0;
    try {
      const acc = (typeof Account !== 'undefined' && Account && Account.current) ? Account.current() : null;
      const d = acc && acc.created ? new Date(acc.created) : null;
      if (d && !isNaN(d.getTime())) t = d.getTime();
    } catch (e) {}
    return t;
  }

  // 明细上线时对齐一次：上线之前的每一笔还原不出来，就压成一条「历史收支」，
  // 让明细全部加起来正好等于钱包余额。老档可能已经有零散记录，所以按差额补而不是整笔重置。
  function ensureLedger() {
    if (read(K.ledgerInit, false) && read(K.ledgerTop, false)) return;
    write(K.ledgerInit, true);
    write(K.ledgerTop, true);
    const arr = readLedger();
    const sum = arr.reduce((a, x) => a + x.d, 0);
    const diff = getWallet().coins - sum;
    if (!diff) return;
    // 时间落在建号那天（比任何一笔都早，排在明细最前面）
    let t = createdTime() || Date.now();
    const earliest = arr.length ? Math.min.apply(null, arr.map((x) => x.t)) : 0;
    if (earliest && t >= earliest) t = earliest - 60000;
    arr.push({ t: t, d: diff, m: '历史收支', x: '明细上线前' });
    arr.sort((a, b) => a.t - b.t);
    while (arr.length > LEDGER_MAX) arr.shift();
    write(K.ledger, arr);
  }
  // 上线早期记的「购买道具 / 成就奖励」没有具体说明：按当时的金额把能认出来的补上
  // （道具价格、成就阶位都是固定的，反推即可；同价位的几种就一起写上）
  const PRICE_DETAIL = {
    20: '霜块道具', 150: '洗牌 / 撤回 +1', 180: '炸弹道具', 210: '磁铁道具',
    230: '线消道具', 250: '螺旋桨道具', 300: '彩虹 / +3 步 / +7s', 500: '颜料道具'
  };
  const TIER_DETAIL = { 50: '铜阶', 100: '银阶', 150: '金阶', 200: '彩阶' };
  function fillLegacyDetail() {
    if (read(K.ledgerDetail, false)) return;
    write(K.ledgerDetail, true);
    const arr = readLedger();
    let changed = false;
    arr.forEach((x) => {
      if (x.x) return;                       // 已经有具体说明的跳过
      let d = '';
      if (x.m === '购买道具' && x.d < 0) d = PRICE_DETAIL[-x.d] || '';
      else if (x.m === '成就奖励' && x.d > 0) d = TIER_DETAIL[x.d] || '';
      if (d) { x.x = d; changed = true; }
    });
    if (changed) write(K.ledger, arr);
  }

  function getLedger() {
    ensureLedger();
    fillLegacyDetail();
    return readLedger();
  }
  function pushLedger(delta, memo, detail) {
    if (!delta) return;
    const arr = readLedger();
    const row = {
      t: Date.now(),
      d: delta,
      m: String(memo || (delta > 0 ? '金币收入' : '金币支出'))
    };
    if (detail) row.x = String(detail);
    arr.push(row);
    while (arr.length > LEDGER_MAX) arr.shift();
    write(K.ledger, arr);
  }

  function addCoins(n, memo, detail) {
    const w = getWallet();
    w.coins = Math.max(0, w.coins + n);
    setWallet(w);
    pushLedger(n, memo, detail);
    return w.coins;
  }

  // 撤回一笔刚发的奖励（续玩二次结算时把第一次的金币撤回，一局只留最后一条奖励）：
  // 从明细尾部往前找「金额 / 说明 / 具体说明」都对上的最新一条，删掉并把金币扣回
  function cancelReward(amount, memo, detail) {
    if (!amount) return false;
    const arr = readLedger();
    const m = String(memo || ''), x = String(detail || '');
    for (let i = arr.length - 1; i >= 0; i--) {
      const it = arr[i];
      if (it && it.d === amount && it.m === m && (it.x || '') === x) {
        arr.splice(i, 1);
        write(K.ledger, arr);
        const w = getWallet();
        w.coins = Math.max(0, w.coins - amount);
        setWallet(w);
        return true;
      }
    }
    return false;
  }

  function spendCoins(n, memo, detail) {
    const w = getWallet();
    if (w.coins < n) return false;
    w.coins -= n;
    setWallet(w);
    pushLedger(-n, memo, detail);
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
    return read(K.tasks, { date: '', list: [], signDay: 0, signDate: '', lastLogin: '', all: [], total: 0 });
  }

  function setTaskState(s) {
    write(K.tasks, s);
  }

  // 签到阶梯（对应 §8）
  const SIGN_REWARDS = [
    { coins: 50 }, { coins: 50 }, { coins: 50 }, { coins: 50 },
    { coins: 50 }, { coins: 50 }, { coins: 50 }
  ];
  // 连续签到每满 7 天（7/14/21/28…），额外 100 金币发到邮箱
  const SIGN_MILESTONE = { every: 7, coins: 100 };

  // 补签：一次补 1 天，花 50 金币（只补连续天数，不发当日奖励）
  const MAKEUP_COST = 50;

  function dparse(k) {
    const p = String(k || '').split('-').map(Number);
    return new Date(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1);
  }

  // 兼容旧存档：把老字段归一化成「累计签到天数 total + 全部已签日期 all」
  function normSign(s) {
    if (!Array.isArray(s.all)) s.all = [];
    if (!Array.isArray(s.dates)) s.dates = [];
    // 累计天数：优先用已存的 total；没有就从已签日期数 / 老 streak / signDay 近似
    if (typeof s.total !== 'number' || s.total < 0) {
      s.total = s.all.length || s.dates.length || s.streak || s.signDay || 0;
    }
    return s;
  }

  function signIn() {
    const s = normSign(getTaskState());
    const today = todayKey();
    if (s.signDate === today) return { ok: false, reason: 'already', day: s.total };

    // 累计天数：永远 +1，不按 7 天一轮清零（累签天数是累积的）
    s.total = (s.total || 0) + 1;
    const reward = SIGN_REWARDS[(s.total - 1) % SIGN_REWARDS.length];
    addCoins(reward.coins, '签到奖励');
    if (reward.item) addItem(reward.item, reward.itemN);

    s.signDate = today;
    if (s.all.indexOf(today) < 0) s.all.push(today);
    if (s.all.length > 400) s.all = s.all.slice(-400);
    setTaskState(s);

    // 累签天数每满 7（7/14/21/28…）额外 100 金币（连签奖励）
    const milestone = (s.total > 0 && s.total % SIGN_MILESTONE.every === 0) ? SIGN_MILESTONE.coins : 0;
    return { ok: true, day: s.total, reward, streak: s.total, milestone: milestone };
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
    if (!spendCoins(MAKEUP_COST, '补签')) return { ok: false, reason: 'poor', need: MAKEUP_COST };

    s.all.push(miss);
    s.all.sort();
    if (s.all.length > 400) s.all = s.all.slice(-400);
    s.total = (s.total || 0) + 1;   // 补签也计入累签天数（不发当日奖励）
    setTaskState(s);
    return { ok: true, day: s.total, date: miss };
  }

  // 福利中心展示用：累签天数 + 可补签天数
  function signStats() {
    const s = normSign(getTaskState());
    const today = todayKey();
    const signedToday = s.signDate === today;
    const total = s.total || 0;
    // 可补签天数：从注册那天到昨天，还没签的天数
    let missed = 0;
    const start = signStart();
    const yesterday = todayKey(new Date(Date.now() - 86400000));
    const yd = dparse(yesterday);
    for (let d = new Date(start); d <= yd; d.setDate(d.getDate() + 1)) {
      if (s.all.indexOf(todayKey(d)) < 0) missed++;
      if (missed > 400) break;
    }
    return { streak: total, signedToday: signedToday, missed: missed, canMakeup: missed > 0, day: total };
  }

  function canSignIn() {
    return getTaskState().signDate !== todayKey();
  }

  // 本轮签到的起点（Date）；还没签过任何一天时返回 null
  function signCycleStart() {
    const s = normSign(getTaskState());
    if (!s.all || !s.all.length) return null;
    return dparse(s.all[0]);
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
    getWallet, onWallet, addCoins, cancelReward, spendCoins, addItem, useItem, getLedger, LEDGER_MAX,
    getTaskState, setTaskState, signIn, makeupSign, signStats, canSignIn, MAKEUP_COST, todayKey, dayIndex, signCycleStart, signStart,
    getSettings, setSettings, getVisits, recordVisit, resetVisits, getNet, patchNet, countStart,
    COUNT_START,
    saveRun, loadRun, clearRun, wipeAll
  };
})(window);
