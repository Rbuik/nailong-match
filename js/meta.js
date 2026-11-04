// meta.js — 成就 / 皮肤图鉴 / 签到转盘 / 排行榜 / 关卡编辑器 / 各模式最佳分
// 全部走 localStorage，不上传任何个人信息（沿用「不记 IP」的统计口径）
// 暴露 window.Meta

(function (global) {
  'use strict';

  const K = {
    stats: 'nl2:mstats',        // 累计计数（成就用）
    ach: 'nl2:mach',            // 已解锁成就 id
    skin: 'nl2:mskin',          // 当前皮肤
    skins: 'nl2:mskins',        // 已解锁皮肤
    wheel: 'nl2:mwheel',        // { date, result }
    board: 'nl2:mboard',        // 旧周榜（仅用于迁移好友记录）
    friends: 'nl2:mfriends',    // 好友列表（永久保存，手动删才消失）
    uid: 'nl2:muid',            // 本机身份码（用来认出「加自己」）
    best: 'nl2:mbest',          // { endless, sprint, rhythm }
    story: 'nl2:mstory',        // 已看过的章节
    nick: 'nl2:mnick'           // 昵称
  };

  function read(k, fb) {
    try {
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fb;
    } catch (e) { return fb; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }

  // ==================== 累计计数 ====================
  const STAT_KEYS = ['wins', 'starsGot', 'scoreTotal', 'maxCombo', 'rainbows', 'bombs', 'lines',
    'jelly', 'ice', 'cargo', 'rescue', 'perfect', 'noUndo', 'daily', 'checkin'];

  function stats() {
    const s = read(K.stats, {});
    STAT_KEYS.forEach((k) => { if (typeof s[k] !== 'number') s[k] = 0; });
    return s;
  }

  function bump(key, n) {
    const s = stats();
    s[key] = (s[key] || 0) + (n == null ? 1 : n);
    if (key === 'maxCombo') s.maxCombo = Math.max(s.maxCombo, n || 0);
    write(K.stats, s);
    return s;
  }

  function setMax(key, v) {
    const s = stats();
    if (v > (s[key] || 0)) { s[key] = v; write(K.stats, s); }
  }

  // ==================== 成就 ====================
  const ACHIEVEMENTS = [
    { id: 'first', icon: '🌱', name: '初次消除', desc: '通关第 1 关', test: (c) => c.cleared >= 1 },
    { id: 'stars10', icon: '⭐', name: '星星收集者', desc: '累计 10 颗星', test: (c) => c.stars >= 10 },
    { id: 'stars30', icon: '🌟', name: '星空旅人', desc: '累计 30 颗星', test: (c) => c.stars >= 30 },
    { id: 'stars60', icon: '✨', name: '披星戴月', desc: '累计 60 颗星', test: (c) => c.stars >= 60 },
    { id: 'combo6', icon: '🔥', name: '连击狂人', desc: '单局打出 6 连击', test: (c) => c.maxCombo >= 6 },
    { id: 'rainbow10', icon: '🌈', name: '彩虹猎人', desc: '累计造出 10 个彩虹', test: (c) => c.rainbows >= 10 },
    { id: 'bomb50', icon: '💣', name: '爆破专家', desc: '累计引爆 50 个炸弹', test: (c) => c.bombs >= 50 },
    { id: 'line100', icon: '➡️', name: '线消达人', desc: '累计触发 100 次线消', test: (c) => c.lines >= 100 },
    { id: 'ice100', icon: '🧊', name: '冰块终结者', desc: '累计敲碎 100 层冰', test: (c) => c.ice >= 100 },
    { id: 'cargo50', icon: '🔑', name: '快递小哥', desc: '累计送达 50 件货物', test: (c) => c.cargo >= 50 },
    { id: 'rescue30', icon: '🐲', name: '奶龙守护者', desc: '累计护送 30 只奶龙', test: (c) => c.rescue >= 30 },
    { id: 'jelly200', icon: '🟪', name: '果冻清道夫', desc: '累计清除 200 格果冻', test: (c) => c.jelly >= 200 },
    { id: 'perfect10', icon: '👑', name: '十全十美', desc: '累计 10 次三星通关', test: (c) => c.perfect >= 10 },
    { id: 'lv20', icon: '🏅', name: '过半征程', desc: '通关 20 个主线关', test: (c) => c.cleared >= 20 },
    { id: 'lv40', icon: '🏆', name: '通关大师', desc: '通关全部主线关', test: (c) => c.cleared >= 40 },
    { id: 'endless', icon: '♾️', name: '无尽旅人', desc: '无尽模式拿到 20000 分', test: (c) => c.endless >= 20000 },
    { id: 'sprint', icon: '⏱️', name: '冲刺高手', desc: '60 秒冲刺拿到 8000 分', test: (c) => c.sprint >= 8000 },
    { id: 'rhythm', icon: '🎧', name: '节拍感', desc: '节奏关拿到 6000 分', test: (c) => c.rhythm >= 6000 },
    { id: 'checkin7', icon: '📅', name: '签到达人', desc: '累计签到 7 天', test: (c) => c.checkin >= 7 }
  ];

  function unlockedIds() {
    const a = read(K.ach, []);
    return Array.isArray(a) ? a : [];
  }

  // 用最新数据检查所有成就，返回本次新解锁的成就对象
  function check(extra) {
    const list = unlockedIds();
    const st = stats();
    const best = getBest();
    const ctx = Object.assign({}, st, {
      stars: (global.Store && Store.totalStars) ? Store.totalStars() : 0,
      cleared: clearedCount(),
      endless: best.endless || 0,
      sprint: best.sprint || 0,
      rhythm: best.rhythm || 0
    }, extra || {});
    const got = [];
    ACHIEVEMENTS.forEach((a) => {
      if (list.indexOf(a.id) >= 0) return;
      let ok = false;
      try { ok = !!a.test(ctx); } catch (e) { ok = false; }
      if (ok) { list.push(a.id); got.push(a); }
    });
    if (got.length) write(K.ach, list);
    return got;
  }

  function clearedCount() {
    if (!global.Store) return 0;
    const all = Store.getProgress ? Store.getProgress() : {};
    let n = 0;
    Object.keys(all).forEach((k) => { if ((all[k].stars || 0) >= 1) n++; });
    return n;
  }

  // ==================== 皮肤（图鉴） ====================
  const SKINS = [
    { id: 'default', name: '原味奶龙', icon: '🧸', stars: 0, desc: '默认外观' },
    { id: 'mint', name: '薄荷清凉', icon: '🌿', stars: 12, desc: '棋盘泛一层薄荷绿光' },
    { id: 'sakura', name: '樱花软糖', icon: '🌸', stars: 30, desc: '粉粉嫩嫩的樱花描边' },
    { id: 'galaxy', name: '星夜流萤', icon: '🌌', stars: 60, desc: '深色描边 + 星点光晕' },
    { id: 'gold', name: '黄金奶龙', icon: '🏆', stars: 100, desc: '全套金光，通关才算拥有' }
  ];

  function currentSkin() {
    const id = read(K.skin, 'default');
    return SKINS.some((s) => s.id === id) ? id : 'default';
  }

  function applySkin(id) {
    const skin = SKINS.filter((s) => s.id === id)[0] || SKINS[0];
    const stars = (global.Store && Store.totalStars) ? Store.totalStars() : 0;
    if (stars < skin.stars) return { ok: false, need: skin.stars };
    write(K.skin, skin.id);
    document.body.dataset.skin = skin.id;
    return { ok: true, skin: skin };
  }

  function unlockSkin(id) {
    const list = read(K.skins, ['default']);
    if (list.indexOf(id) < 0) { list.push(id); write(K.skins, list); }
  }

  // ==================== 各模式最佳分 ====================
  function getBest() {
    const b = read(K.best, {});
    return { endless: b.endless || 0, sprint: b.sprint || 0, rhythm: b.rhythm || 0 };
  }

  function recordBest(mode, score) {
    const b = read(K.best, {});
    const old = b[mode] || 0;
    const isNew = score > old;
    if (isNew) { b[mode] = score; write(K.best, b); }
    return { best: Math.max(old, score), isNew };
  }

  // ==================== 每日转盘 ====================
  const WHEEL = [
    { label: '50 金币', coins: 50, w: 26 },
    { label: '80 金币', coins: 80, w: 22 },
    { label: '120 金币', coins: 120, w: 18 },
    { label: '180 金币', coins: 180, w: 14 },
    { label: '300 金币', coins: 300, w: 8 },
    { label: '洗牌 +1', item: 'shuffle', w: 6 },
    { label: '撤回 +1', item: 'undo', w: 6 }
  ];

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function wheelState() {
    const s = read(K.wheel, { date: '', result: '' });
    return { date: s.date || '', result: s.result || '', used: s.date === todayKey() };
  }

  function canSpin() { return !wheelState().used; }

  function spin() {
    if (!canSpin()) return { ok: false };
    const total = WHEEL.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < WHEEL.length; i++) {
      r -= WHEEL[i].w;
      if (r <= 0) { idx = i; break; }
    }
    const prize = WHEEL[idx];
    if (global.Store) {
      if (prize.coins) Store.addCoins(prize.coins);
      if (prize.item) Store.addItem(prize.item, 1);
    }
    write(K.wheel, { date: todayKey(), result: prize.label });
    return { ok: true, prize: prize, index: idx, labels: WHEEL.map((x) => x.label) };
  }

  // ==================== 签到（复用 Store.signIn） ====================
  function signInfo() {
    const s = global.Store ? Store.getTaskState() : { signDay: 0, signDate: '' };
    return {
      day: s.signDay || 0,
      signedToday: global.Store ? !Store.canSignIn() : true,
      rewards: (global.Store && Store.SIGN_REWARDS) || []
    };
  }

  function signIn() {
    if (!global.Store) return { ok: false };
    const r = Store.signIn();
    if (r.ok) bump('checkin', 1);
    return r;
  }

  // ==================== 排行榜（本地 + 好友成绩码） ====================
  function weekKey(d) {
    d = d || new Date();
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = (t.getDay() + 6) % 7;          // 周一为一周起点
    t.setDate(t.getDate() - day);
    return 'W' + t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }

  function nickname() {
    const n = read(K.nick, '');
    return n || '奶龙玩家';
  }

  function setNickname(n) {
    const v = String(n || '').trim().slice(0, 8);
    write(K.nick, v || '奶龙玩家');
    return nickname();
  }

  // ==================== 好友榜（纯本地，永久保存） ====================
  // 本机身份码：只用来认出「这是自己的码」，不含任何设备信息
  function myUid() {
    let u = read(K.uid, '');
    if (typeof u !== 'string' || !u) {
      u = 'u' + Math.random().toString(36).slice(2, 10);
      write(K.uid, u);
    }
    return u;
  }

  function friends() {
    let list = read(K.friends, null);
    if (!Array.isArray(list)) {
      // 老版本把好友塞在周榜里（每周会清空）→ 迁移一次，之后永久保存
      const old = read(K.board, { list: [] });
      list = (Array.isArray(old.list) ? old.list : []).map((x, i) => ({
        uid: x.uid || ('old' + i),
        name: String(x.name || '好友').slice(0, 8),
        score: Math.max(0, x.score || 0),
        level: x.level || 0,
        ts: x.ts || Date.now()
      }));
      write(K.friends, list);
    }
    return list;
  }

  function saveFriends(list) {
    const arr = (list || []).slice(0, 50);
    write(K.friends, arr);
    return arr;
  }

  function board() {
    const b = read(K.board, { week: weekKey(), list: [] });
    if (b.week !== weekKey()) return { week: weekKey(), list: [] };
    return { week: b.week, list: Array.isArray(b.list) ? b.list : [] };
  }

  // 成绩码：把自己的成绩发给朋友，对方粘贴进来即可同榜
  function makeCode(entry) {
    try {
      const payload = { v: 2, u: myUid(), n: entry.name, s: entry.score, l: entry.level || 0, w: weekKey() };
      return 'NL1-' + btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=+$/, '');
    } catch (e) { return ''; }
  }

  function readCode(code) {
    try {
      const body = String(code || '').trim().replace(/^NL1-/, '');
      if (!body) return null;
      const json = decodeURIComponent(escape(atob(body)));
      const p = JSON.parse(json);
      if (!p || typeof p.s !== 'number') return null;
      return {
        uid: String(p.u || ''),
        name: String(p.n || '好友').slice(0, 8),
        score: Math.max(0, Math.round(p.s)),
        level: p.l || 0,
        week: p.w || ''
      };
    } catch (e) { return null; }
  }

  // 加好友：同一 uid 只保留一条 —— 好友改名/分数变化后重新发码，粘进来就是「更新」
  function addFriend(code) {
    const e = readCode(code);
    if (!e) return { ok: false, reason: '码不对' };
    if (e.uid && e.uid === myUid()) return { ok: false, reason: '这是你自己的成绩码，不用加' };
    if (e.week && e.week !== weekKey()) return { ok: false, reason: '这是上周的成绩码，让对方重新复制一次' };
    const list = friends();
    let idx = -1;
    if (e.uid) idx = list.findIndex((x) => x.uid === e.uid);
    if (idx < 0 && !e.uid) idx = list.findIndex((x) => x.name === e.name);
    let updated = false;
    if (idx >= 0) {
      list[idx] = { uid: e.uid || list[idx].uid, name: e.name, score: e.score, level: e.level, ts: Date.now() };
      updated = true;
    } else {
      list.push({ uid: e.uid || ('n' + Date.now()), name: e.name, score: e.score, level: e.level, ts: Date.now() });
    }
    saveFriends(list);
    return { ok: true, entry: e, updated: updated };
  }

  function removeFriend(id) {
    const list = friends().filter((x) => x.uid !== id);
    saveFriends(list);
    return list;
  }
  function clearFriends() {
    saveFriends([]);
    return [];
  }
  function addBoard(entry) {          // 兼容旧调用
    return addFriendEntry(entry);
  }
  function addFriendEntry(entry) {
    const list = friends();
    list.push({
      uid: entry.uid || ('n' + Date.now()),
      name: String(entry.name || '好友').slice(0, 8),
      score: Math.max(0, entry.score || 0),
      level: entry.level || 0,
      ts: Date.now()
    });
    saveFriends(list);
    return weekKey();
  }

  // ==================== 剧情 ====================
  function storySeen(id) {
    const l = read(K.story, []);
    return Array.isArray(l) && l.indexOf(id) >= 0;
  }
  function markStory(id) {
    const l = read(K.story, []);
    if (Array.isArray(l) && l.indexOf(id) < 0) { l.push(id); write(K.story, l); }
  }

  // ==================== 渲染：成就墙 ====================
  function renderAchievements(box) {
    if (!box) return;
    const list = unlockedIds();
    box.innerHTML = '';
    ACHIEVEMENTS.forEach((a) => {
      const got = list.indexOf(a.id) >= 0;
      const row = document.createElement('div');
      row.className = 'ach-row' + (got ? ' got' : '');
      row.innerHTML =
        '<span class="ach-icon">' + a.icon + '</span>' +
        '<span class="ach-main"><b>' + a.name + '</b><i>' + a.desc + '</i></span>' +
        '<span class="ach-mark">' + (got ? '已获得' : '未获得') + '</span>';
      box.appendChild(row);
    });
  }

  // ==================== 渲染：皮肤 ====================
  function renderSkins(box, onPick) {
    if (!box) return;
    const stars = (global.Store && Store.totalStars) ? Store.totalStars() : 0;
    const cur = currentSkin();
    box.innerHTML = '';
    SKINS.forEach((s) => {
      const own = stars >= s.stars;
      const row = document.createElement('div');
      row.className = 'skin-row' + (own ? '' : ' locked') + (s.id === cur ? ' active' : '');
      row.innerHTML =
        '<span class="skin-icon">' + s.icon + '</span>' +
        '<span class="skin-main"><b>' + s.name + '</b><i>' + s.desc + '</i></span>' +
        '<span class="skin-mark">' + (s.id === cur ? '使用中' : own ? '点击使用' : '需 ' + s.stars + ' ⭐') + '</span>';
      row.addEventListener('click', () => { if (onPick) onPick(s, own); });
      box.appendChild(row);
    });
  }

  global.Meta = {
    ACHIEVEMENTS, SKINS, WHEEL,
    stats, bump, setMax, check, unlockedIds, clearedCount,
    currentSkin, applySkin, unlockSkin, renderSkins,
    getBest, recordBest,
    canSpin, spin, wheelState,
    signInfo, signIn,
    weekKey, nickname, setNickname, board, addBoard, makeCode, addFriend,
    myUid, friends, removeFriend, clearFriends,
    storySeen, markStory,
    renderAchievements
  };
})(window);
