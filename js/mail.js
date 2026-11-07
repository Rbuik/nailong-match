// mail.js — 系统邮箱：收系统发的公告与奖励
// 邮件正文写在代码里（SYSTEM_MAILS），每个账号各自记录「已读 / 已领取」（nl2:mail），
// 切换账号时随账号存档一起走，不会串号。暴露 window.Mail

(function (global) {
  'use strict';

  const KEY = 'nl2:mail';

  // 系统邮件：以后要发新公告 / 奖励，往这里加一条就行（id 唯一）
  // 想只发给某个人，加 to: '名字' 即可（不写 to 就是全服都看得到）
  const SYSTEM_MAILS = [
    {
      id: 'welcome-2026-11',
      at: '2026-11-05 12:00',
      icon: '🎉',
      title: '欢迎来到奶龙消消乐',
      from: '系统',
      body: '谢谢你来玩奶龙消消乐！这是一点小小的见面礼，先去购物商店挑个顺手的道具吧。\n\n以后有活动、补偿、版本更新，都会发到这封信箱里，记得常来看看。',
      coins: 200
    },
    {
      id: 'notice-account-2026-11',
      at: '2026-11-05 18:00',
      icon: '📢',
      title: '账号系统上线：注册 / 登录 / 切换账号',
      from: '系统',
      body: '现在第一次进来要先「注册」或「登录」，名字和密码都要有才能开始玩。\n\n· 设置 → 🔐 账号安全：可以修改密码、切换本机的其他账号\n· 名字具有唯一性，1~8 个字符（一个字母或符号都算一个），特殊符号只能用 - . _\n\n账号数据存在本机，同一台设备上可以来回切换。',
      coins: 0
    },
    {
      id: 'notice-rules-2026-11',
      at: '2026-11-05 19:00',
      icon: '📖',
      title: '说明页更新：功能介绍和玩法说明分开了',
      from: '系统',
      body: '左上角的 📖 说明现在先让你选看哪一份：\n\n· 🧩 功能介绍：章节、更多玩法、金币道具、每日挑战、福利、成就与配色、排行榜、音乐、账号\n· 🎮 玩法说明：基本玩法、特殊块、组合技、连击、关卡目标、障碍与货物、星级、分数与纪录、提示与续命\n\n只想查一个机制的时候，不用再翻完一整页了。',
      coins: 0
    },
    {
      id: 'notice-master-2026-11-08',
      at: '2026-11-08 11:30',
      icon: '🏆',
      title: '「消消乐大师」上线 + 云存档全自动',
      from: '系统',
      body: '· 📖 说明两页都精简了，功能介绍改成按按键位置一层层讲\n· 🏆 关卡记录右下角「结算」随时打开「消消乐大师」成绩单：称号、通关进度、总分、总星、三星关卡、成就\n· ☁️ 账号和进度现在自动存到服务器，不用再手动点\n· 🍬 成就新增「糖果爱好者」，关卡记录里能看出哪些关运送糖果',
      coins: 0
    }
  ];

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

  function state() {
    const s = read(KEY, null);
    if (!s || typeof s !== 'object') return { read: {}, claimed: {}, extra: [], hidden: {} };
    return {
      read: s.read && typeof s.read === 'object' ? s.read : {},
      claimed: s.claimed && typeof s.claimed === 'object' ? s.claimed : {},
      extra: Array.isArray(s.extra) ? s.extra : [],
      hidden: s.hidden && typeof s.hidden === 'object' ? s.hidden : {}
    };
  }

  function save(s) { return write(KEY, s); }

  // 当前账号的名字（只发给某个人的邮件靠它过滤）
  function myName() {
    try {
      if (global.Account && Account.current && Account.current()) {
        const n = Account.current().name || '';
        if (n) return String(n).trim().toLowerCase();
      }
    } catch (e) {}
    try {
      if (global.Meta && Meta.nickname) return String(Meta.nickname() || '').trim().toLowerCase();
    } catch (e) {}
    return '';
  }

  function visible(m) {
    if (!m || !m.to) return true;
    return String(m.to).trim().toLowerCase() === myName();
  }

  function normalize(m) {
    return {
      id: m.id,
      at: m.at || '',
      icon: m.icon || '📮',
      title: m.title || '系统邮件',
      from: m.from || '系统',
      body: m.body || '',
      coins: m.coins || 0,
      items: m.items || null
    };
  }

  // 列表：最新的排前面，带上「已读 / 已领取」状态
  function list() {
    const s = state();
    const alive = (m) => m && m.id && !s.hidden[m.id];
    const all = SYSTEM_MAILS.filter(visible).filter(alive)
      .concat(s.extra.filter(visible).filter(alive).map(normalize));
    const seen = Object.create(null);
    const uniq = all.filter((m) => {
      if (!m || !m.id || seen[m.id]) return false;
      seen[m.id] = true;
      return true;
    });
    return uniq.map((m) => ({
      id: m.id,
      at: m.at,
      icon: m.icon || '📮',
      title: m.title,
      from: m.from || '系统',
      body: m.body || '',
      coins: m.coins || 0,
      items: m.items || null,
      read: !!s.read[m.id],
      claimed: !!s.claimed[m.id],
      hasGift: !!(m.coins || m.items)
    })).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  }

  // 发一封邮件到当前账号的邮箱（奖励走这里，金币作为附件，等用户自己领）
  function sendMail(m) {
    if (!m || !m.id) return null;
    const s = state();
    if (s.extra.filter((x) => x && x.id === m.id)[0]) return normalize(m);
    const clean = normalize(m);
    s.extra.push(clean);
    save(s);
    return clean;
  }

  function get(id) {
    return list().filter((m) => m.id === id)[0] || null;
  }

  function unread() {
    return list().filter((m) => !m.read).length;
  }

  function hasGift() {
    return list().filter((m) => m.hasGift && !m.claimed).length;
  }

  function markRead(id) {
    const s = state();
    if (!s.read[id]) { s.read[id] = Date.now(); save(s); }
    return true;
  }

  // 领取附件：只发一次
  function claim(id) {
    const m = get(id);
    if (!m) return { ok: false, reason: '邮件不存在' };
    if (!m.hasGift) return { ok: false, reason: '这封邮件没有附件' };
    if (m.claimed) return { ok: false, reason: '奖励已经领过了' };
    const s = state();
    s.read[id] = s.read[id] || Date.now();
    s.claimed[id] = Date.now();
    save(s);

    let coins = 0;
    const items = [];
    if (m.coins) {
      coins = m.coins;
      if (global.Store && Store.addCoins) Store.addCoins(coins);
    }
    if (m.items) {
      Object.keys(m.items).forEach((k) => {
        if (global.Store && Store.addItem) Store.addItem(k, m.items[k]);
        items.push({ key: k, n: m.items[k] });
      });
    }
    return { ok: true, coins: coins, items: items };
  }

  // 删除一封（系统邮件写死在代码里，只能记进 hidden 藏起来；本机发的直接从 extra 拿走）
  function remove(id) {
    const m = get(id);
    if (!m) return { ok: false, reason: '邮件不存在' };
    const s = state();
    s.hidden[id] = Date.now();
    s.extra = s.extra.filter((x) => !x || x.id !== id);
    save(s);
    return { ok: true, id: id };
  }

  // 一键已读：把当前能看到的全部标为已读
  function markAllRead() {
    const s = state();
    let n = 0;
    list().forEach((m) => {
      if (s.read[m.id]) return;
      s.read[m.id] = Date.now();
      n++;
    });
    if (n) save(s);
    return n;
  }

  // 一键删除：不删还没领奖励的邮件（免得把金币一起删掉）
  function removeAll() {
    const s = state();
    const keepGift = [];
    let n = 0;
    list().forEach((m) => {
      if (m.hasGift && !m.claimed) { keepGift.push(m.id); return; }
      s.hidden[m.id] = Date.now();
      s.extra = s.extra.filter((x) => !x || x.id !== m.id);
      n++;
    });
    if (n) save(s);
    return { removed: n, kept: keepGift.length };
  }

  global.Mail = {
    list, get, unread, hasGift, markRead, claim, sendMail, remove, markAllRead, removeAll,
    SYSTEM_MAILS
  };
})(window);
