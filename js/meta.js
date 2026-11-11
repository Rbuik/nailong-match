// meta.js — 成就 / 皮肤图鉴 / 签到转盘 / 排行榜 / 关卡编辑器 / 各模式最佳分
// 全部走 localStorage，不上传任何个人信息（沿用「不记 IP」的统计口径）
// 暴露 window.Meta

(function (global) {
  'use strict';

  const K = {
    stats: 'nl2:mstats',        // 累计计数（成就用）
    ach: 'nl2:mach',            // 已解锁成就 id（满级「彩」）
    acht: 'nl2:macht',          // 成就阶数 { id: 1~4 }，0/缺省为灰
    achc: 'nl2:machc',          // 已领奖的阶 { id: [1,2,3] }，缺省 = 一次都没领
    skin: 'nl2:mskin',          // 当前皮肤
    skins: 'nl2:mskins',        // 已解锁皮肤
    wheel: 'nl2:mwheel',        // { date, result }
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
    'jelly', 'ice', 'cargo', 'candy', 'rescue', 'perfect', 'noUndo', 'daily', 'checkin'];

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
  // 每枚成就都有 5 阶：灰（未解锁）→ 铜 → 银 → 金 → 彩（满级）
  // tiers 依次是「铜 / 银 / 金 / 彩」四道门槛，进度达到哪一档就升到哪个颜色
  const ACH_TIERS = ['灰', '铜', '银', '金', '彩'];

  // 每升一阶的奖励金币：铜 50 / 银 100 / 金 150 / 彩 200（灰没有奖励）
  const TIER_COINS = [0, 50, 100, 150, 200];

  const ACHIEVEMENTS = [
    { id: 'first',    icon: '🌱', name: '初次消除',   desc: '累计通关次数',     key: 'wins',      tiers: [1, 10, 50, 100] },
    { id: 'stars10',  icon: '⭐', name: '星星收集者', desc: '累计星星',         key: 'stars',     tiers: [10, 20, 35, 60] },
    { id: 'stars30',  icon: '🌟', name: '星空旅人',   desc: '累计星星',         key: 'stars',     tiers: [30, 45, 60, 90] },
    { id: 'stars60',  icon: '✨', name: '披星戴月',   desc: '累计星星',         key: 'stars',     tiers: [60, 80, 100, 120] },
    { id: 'combo6',   icon: '🔥', name: '连击狂人',   desc: '单局最高连击',     key: 'maxCombo',  tiers: [4, 6, 8, 10] },
    { id: 'rainbow10',icon: '🌈', name: '彩虹猎人',   desc: '累计造出彩虹',     key: 'rainbows',  tiers: [3, 10, 25, 50] },
    { id: 'bomb50',   icon: '💣', name: '爆破专家',   desc: '累计引爆炸弹',     key: 'bombs',     tiers: [10, 50, 100, 200] },
    { id: 'line100',  icon: '➡️', name: '线消达人',   desc: '累计触发线消',     key: 'lines',     tiers: [20, 100, 200, 400] },
    { id: 'ice100',   icon: '🧊', name: '冰块终结者', desc: '累计敲碎冰层',     key: 'ice',       tiers: [20, 100, 250, 500] },
    { id: 'cargo50',  icon: '🔑', name: '快递达人',   desc: '累计送达货物',     key: 'cargo',     tiers: [10, 50, 100, 200] },
    { id: 'candylover', icon: '🍬', name: '糖果爱好者', desc: '累计送达糖果',     key: 'candy',     tiers: [10, 30, 80, 150] },
    { id: 'rescue30', icon: '奶龙', iconImg: './assets/nailong.png', name: '奶龙守护者', desc: '累计护送奶龙', key: 'rescue', tiers: [5, 30, 60, 120] },
    { id: 'jelly200', icon: '🟪', name: '果冻清道夫', desc: '累计清除果冻',     key: 'jelly',     tiers: [50, 200, 400, 800] },
    { id: 'perfect10',icon: '👑', name: '十全十美',   desc: '累计三星通关',     key: 'perfect',   tiers: [3, 10, 25, 50] },
    { id: 'endless',  icon: '♾️', name: '无尽旅人',   desc: '无尽模式最高分',   key: 'endless',   tiers: [5000, 20000, 50000, 100000] },
    { id: 'sprint',   icon: '⏱️', name: '冲刺高手',   desc: '60s冲刺最高分',  key: 'sprint',    tiers: [2000, 8000, 20000, 40000] },
    { id: 'rhythm',   icon: '🎧', name: '节拍感',     desc: '节奏关最高分',     key: 'rhythm',    tiers: [1500, 6000, 15000, 30000] },
    { id: 'checkin7', icon: '📅', name: '签到达人',   desc: '累计签到天数',     key: 'checkin',   tiers: [1, 3, 7, 14] },
    { id: 'checkin30',icon: '🗓️', name: '签到铁人',   desc: '累计签到天数',     key: 'checkin',   tiers: [30, 60, 100, 180] },
    { id: 'score100k',icon: '🧮', name: '分数收割机', desc: '累计总分',         key: 'scoreTotal',tiers: [10000, 50000, 250000, 500000] },
    { id: 'wins250',  icon: '🎮', name: '消消乐老手', desc: '累计通关次数',     key: 'wins',      tiers: [200, 500, 1000, 2000] },
    { id: 'daily30',  icon: '🎯', name: '任务好手',   desc: '累计完成每日任务', key: 'daily',     tiers: [10, 30, 80, 150] },
    { id: 'combo12',  icon: '⚡', name: '连击传说',   desc: '单局最高连击',     key: 'maxCombo',  tiers: [12, 15, 18, 22] },
    { id: 'bomb500',  icon: '🧨', name: '爆破大师',   desc: '累计引爆炸弹',     key: 'bombs',     tiers: [350, 500, 800, 1200] },
    { id: 'ice1000',  icon: '❄️', name: '破冰巨轮',   desc: '累计敲碎冰层',     key: 'ice',       tiers: [800, 1500, 2500, 4000] }
  ];

  function unlockedIds() {
    const a = read(K.ach, []);
    return Array.isArray(a) ? a : [];
  }

  // 已升到的阶：{ 成就id: 1~4 }；0 / 缺省 = 灰色未解锁
  // 老存档只有「已获得 id 数组」，一律按满级（彩）算
  function tiersMap() {
    const t = read(K.acht, {});
    const map = (t && typeof t === 'object') ? t : {};
    unlockedIds().forEach((id) => { map[id] = 4; });
    return map;
  }

  function tierOf(id) {
    const v = Math.round(Number(tiersMap()[id] || 0));
    return Math.max(0, Math.min(4, v));
  }

  function saveTier(id, tier) {
    const map = read(K.acht, {});
    const m = (map && typeof map === 'object') ? map : {};
    if ((m[id] || 0) >= tier) return;
    m[id] = tier;
    write(K.acht, m);
  }

  // ==================== 成就奖励（铜 / 银 / 金 / 彩 各领一次） ====================
  // 已领奖记录：{ 成就id: [1,2,3] }（数字是阶），没领过的阶就是「有红点」
  function claimedMap() {
    const m = read(K.achc, {});
    return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
  }

  function isTierClaimed(id, tier) {
    const l = claimedMap()[id];
    return Array.isArray(l) && l.indexOf(tier) >= 0;
  }

  function tierCoin(tier) {
    return TIER_COINS[tier] || 0;
  }

  // 已经解锁的阶（1 = 铜 … 4 = 彩），灰不算
  function unlockedTiers(id) {
    const t = tierOf(id);
    const list = [];
    for (let i = 1; i <= t; i++) list.push(i);
    return list;
  }

  // 已解锁但还没领奖的阶
  function claimableTiers(id) {
    return unlockedTiers(id).filter((t) => !isTierClaimed(id, t));
  }

  function hasPending(id) {
    return claimableTiers(id).length > 0;
  }

  // 一共有多少枚成就「有奖没领」（红点数字 / 要不要显示红点都用它）
  function pendingCount() {
    return ACHIEVEMENTS.filter((a) => hasPending(a.id)).length;
  }

  // 领地某一阶的奖励：金币直接进钱包，返回 { ok, coins }
  function claimTier(id, tier) {
    const a = ACHIEVEMENTS.filter((x) => x.id === id)[0];
    if (!a) return { ok: false, reason: '没有这枚成就' };
    const t = Math.round(Number(tier) || 0);
    if (t < 1 || t > 4) return { ok: false, reason: '没有这一阶' };
    if (tierOf(id) < t) return { ok: false, reason: '还没解锁这一阶' };
    if (isTierClaimed(id, t)) return { ok: false, reason: '已经领过了' };
    const coins = tierCoin(t);
    const m = claimedMap();
    const arr = Array.isArray(m[id]) ? m[id].slice() : [];
    arr.push(t);
    m[id] = arr;
    write(K.achc, m);
    if (coins && global.Store && Store.addCoins) Store.addCoins(coins, '成就奖励', a.name + ' · ' + ACH_TIERS[t]);
    return { ok: true, coins: coins, tier: t, label: ACH_TIERS[t], ach: a };
  }

  // 成就判定的数据源（累计计数 + 存档里的星星 / 通关数 + 各模式最佳）
  function achContext(extra) {
    const st = stats();
    const best = getBest();
    return Object.assign({}, st, {
      stars: (global.Store && Store.totalStars) ? Store.totalStars() : 0,
      cleared: clearedCount(),
      endless: best.endless || 0,
      sprint: best.sprint || 0,
      rhythm: best.rhythm || 0
    }, extra || {});
  }

  function valueOf(a, ctx) {
    const v = Number(ctx[a.key]);
    return isFinite(v) ? v : 0;
  }

  // 当前值 → 阶（0 灰 / 1 铜 / 2 银 / 3 金 / 4 彩）
  function tierByValue(a, ctx) {
    const v = valueOf(a, ctx);
    let t = 0;
    for (let i = 0; i < a.tiers.length; i++) if (v >= a.tiers[i]) t = i + 1;
    return t;
  }

  // 用最新数据检查所有成就，返回本次「升阶」的成就（按新阶从高到低）
  function check(extra) {
    const ctx = achContext(extra);
    const got = [];
    ACHIEVEMENTS.forEach((a) => {
      const t = tierByValue(a, ctx);
      const cur = tierOf(a.id);
      if (t > cur) {
        saveTier(a.id, t);
        got.push({ id: a.id, a: a, tier: t, label: ACH_TIERS[t] });
      }
    });
    if (got.length) {
      // 同步旧字段（有些地方还在读「已获得数组」）
      const list = unlockedIds();
      ACHIEVEMENTS.forEach((a) => {
        if (tierOf(a.id) >= 4 && list.indexOf(a.id) < 0) list.push(a.id);
      });
      write(K.ach, list);
    }
    return got.sort((x, y) => y.tier - x.tier);
  }

  function clearedCount() {
    if (!global.Store) return 0;
    const all = Store.getProgress ? Store.getProgress() : {};
    let n = 0;
    Object.keys(all).forEach((k) => { if ((all[k].stars || 0) >= 1) n++; });
    return n;
  }

  // ==================== 皮肤（图鉴） ====================
  // 颜色依次：黄、红、橙、绿、青、蓝、紫、黑；icon 是对应颜色的方块色块
  const SKINS = [
    { id: 'default', name: '黄色', icon: '■', color: '#ffd94a', stars: 0,   desc: '默认配色' },
    { id: 'red',     name: '红色', icon: '■', color: '#ff5a5a', stars: 10,  desc: '红色光晕，目标栏淡红底' },
    { id: 'orange',  name: '橙色', icon: '■', color: '#ff9a3c', stars: 20,  desc: '橙色光晕，目标栏淡橙底' },
    { id: 'mint',    name: '绿色', icon: '■', color: '#3ecf8e', stars: 35,  desc: '绿色光晕，目标栏淡绿底' },
    { id: 'cyan',    name: '青色', icon: '■', color: '#4ecbff', stars: 55,  desc: '青色光晕，目标栏淡青底' },
    { id: 'blue',    name: '蓝色', icon: '■', color: '#5c8fff', stars: 80,  desc: '蓝色光晕，目标栏淡蓝底' },
    { id: 'galaxy',  name: '紫色', icon: '■', color: '#9a8cf0', stars: 110, desc: '紫色光晕，目标栏淡紫底' },
    { id: 'black',   name: '彩色', icon: '🎨', color: '#ff8fab', stars: 150, desc: '彩色光晕，目标栏淡彩底' }
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
      if (prize.coins) Store.addCoins(prize.coins, '转盘奖励');
      if (prize.item) Store.addItem(prize.item, 1);
    }
    write(K.wheel, { date: todayKey(), result: prize.label });
    return { ok: true, prize: prize, index: idx, labels: WHEEL.map((x) => x.label) };
  }

  // ==================== 签到（复用 Store.signIn） ====================
  function signInfo() {
    const s = global.Store ? Store.getTaskState() : { signDay: 0, signDate: '', dates: [] };
    return {
      day: s.signDay || 0,
      signedToday: global.Store ? !Store.canSignIn() : true,
      rewards: (global.Store && Store.SIGN_REWARDS) || [],
      dates: Array.isArray(s.dates) ? s.dates : [],
      // 所有签过的日期（跨轮保留）：日期条判断「签到了变绿」用它
      all: Array.isArray(s.all) ? s.all : (Array.isArray(s.dates) ? s.dates : [])
    };
  }

  function signIn() {
    if (!global.Store) return { ok: false };
    const r = Store.signIn();
    if (r.ok) bump('checkin', 1);
    return r;
  }

  // 补签（300 金币 / 天）：只补连续天数，不发当日奖励；dateKey 指定要补的那天
  function makeup(dateKey) {
    if (!global.Store) return { ok: false };
    const r = Store.makeupSign(dateKey);
    if (r.ok) bump('checkin', 1);
    return r;
  }

  // 福利中心底部展示：连续签到 N 天 + 可补签天数
  function signStats() {
    if (!global.Store || !Store.signStats) return { streak: 0, signedToday: true, missed: 0, canMakeup: false, day: 0 };
    return Store.signStats();
  }

  // ==================== 昵称 ====================
  function nickname() {
    const n = read(K.nick, '');
    return n || '奶龙玩家';
  }

  function isDefaultNick() {
    return nickname() === '奶龙玩家';
  }

  // 昵称规则：1-8 字；中文 / 字母 / 数字 + 特殊符号只允许 - . _；不能重名（taken 由调用方收集）
  // 敏感词：命中就不许用（忽略大小写 / 空格 / - . _，「黄君丽」是点名要屏蔽的）
  const SENSITIVE = [
    '黄君丽',
    '傻逼', '傻b', '煞笔', '沙比', '智障', '脑残', '贱人', '婊子', '尼玛', '操你', '干你',
    '色情', '赌博', '毒品', '诈骗'
  ];

  function plainText(v) {
    return String(v == null ? '' : v).toLowerCase().replace(/[\s._\-]/g, '');
  }

  function hasSensitive(v) {
    const s = plainText(v);
    if (!s) return false;
    return SENSITIVE.some((w) => s.indexOf(plainText(w)) >= 0);
  }

  function validateNick(v, taken) {
    const s = String(v || '').trim();
    if (!s) return { ok: false, reason: '昵称不能为空' };
    if (s === '奶龙玩家') return { ok: false, reason: '不能再用「奶龙玩家」，换一个吧' };
    if (s.length > 8) return { ok: false, reason: '昵称要 1-8 个字符（一个字母或符号都算一个）' };
    if (!/^[\u4e00-\u9fa5A-Za-z0-9._\-]+$/.test(s)) return { ok: false, reason: '特殊符号只能用 - . _ 三个' };
    if (hasSensitive(s)) return { ok: false, reason: '改名字含敏感词，请重新输入', sensitive: true };
    if (taken && taken.indexOf(s) >= 0) return { ok: false, reason: '这个名字已经被别人用了' };
    return { ok: true, name: s };
  }

  function setNickname(n) {
    const v = String(n || '').trim().slice(0, 8);
    write(K.nick, v || '奶龙玩家');
    return nickname();
  }

  // ==================== 本机身份码 ====================
  // 本机身份码：只用来认出「这是自己的码」，不含任何设备信息
  function myUid() {
    let u = read(K.uid, '');
    if (typeof u !== 'string' || !u) {
      u = 'u' + Math.random().toString(36).slice(2, 10);
      write(K.uid, u);
    }
    return u;
  }

  // 找回旧账号：把共享榜上的身份码绑回本机（设置 → 找回旧账号）
  function bindUid(uid) {
    const s = String(uid || '').trim();
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(s)) return false;
    write(K.uid, s);
    return true;
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
  function renderAchievements(box, onOpen) {
    if (!box) return;
    const ctx = achContext();
    box.innerHTML = '';
    ACHIEVEMENTS.forEach((a) => {
      const tier = tierByValue(a, ctx);
      const cur = valueOf(a, ctx);
      const next = a.tiers[Math.min(tier, 3)];
      const row = document.createElement('div');
      row.className = 'ach-row t' + tier;
      // 有奖没领 → 右上角一个小红点
      if (hasPending(a.id)) row.className += ' pending';
      const prog = tier >= 4
        ? '已满级'
        : cur + ' / ' + next + '（下一个：' + ACH_TIERS[tier + 1] + '）';
      const iconHtml = a.iconImg
        ? '<img src="' + a.iconImg + '" alt="">'
        : a.icon;
      row.innerHTML =
        '<span class="ach-icon">' + iconHtml + '</span>' +
        '<span class="ach-main"><b>' + a.name + '</b><i>' + a.desc + ' · ' + prog + '</i></span>' +
        '<span class="ach-mark t' + tier + '">' + ACH_TIERS[tier] + '</span>' +
        '<i class="ach-dot" aria-hidden="true"></i>';
      row.addEventListener('click', () => { if (onOpen) onOpen(a, tier); });
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
      // 「彩色」的图标用彩虹渐变图（assets/rainbow.jpg），其余用同款大小的纯色铺满方块
      const iconHtml = s.id === 'black'
        ? '<span class="skin-icon skin-icon-img"></span>'
        : '<span class="skin-icon" style="background-color:' + (s.color || '#ffd94a') + '"></span>';
      row.innerHTML =
        iconHtml +
        '<span class="skin-main"><b>' + s.name + '</b><i>' + s.desc + '</i></span>' +
        '<span class="skin-mark">' + (s.id === cur ? '使用中' : own ? '点击使用' : '需 ' + s.stars + ' ⭐') + '</span>';
      row.addEventListener('click', () => { if (onPick) onPick(s, own); });
      box.appendChild(row);
    });
  }

  global.Meta = {
    ACHIEVEMENTS, ACH_TIERS, TIER_COINS, SKINS, WHEEL,
    stats, bump, setMax, check, unlockedIds, clearedCount,
    tierOf, tiersMap, achContext, tierByValue,
    tierCoin, isTierClaimed, unlockedTiers, claimableTiers, hasPending, pendingCount, claimTier,
    currentSkin, applySkin, unlockSkin, renderSkins,
    getBest, recordBest,
    canSpin, spin, wheelState,
    signInfo, signIn, makeup, signStats,
    nickname, isDefaultNick, validateNick, setNickname, hasSensitive, SENSITIVE,
    myUid, bindUid,
    storySeen, markStory,
    renderAchievements
  };
})(window);
