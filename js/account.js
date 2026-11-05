// account.js — 本机账号：注册 / 登录 / 切换 / 修改密码
// 设计：账号表（nl2:accounts）+ 每个账号一份「存档快照」（nl2:acc:<id>）。
// 当前账号的数据仍然放在原来的 nl2:* 里（游戏代码不用改），
// 切换账号时把当前 nl2:* 整体存成快照，再把目标账号的快照铺回来。
// 设备级的 key（访问统计 / 榜单墓碑 / 账号表本身）不参与切换。
//
// 说明：这是纯本机账号，没有服务器。口令不存明文，只存加盐哈希，
// 但本地校验做不到真正的安全（能改 localStorage 的人本来就能改存档）。

(function (global) {
  'use strict';

  const K = {
    accounts: 'nl2:accounts',   // [{ id, name, pass, created, last }]
    cur: 'nl2:cur',             // 当前登录的账号 id
    comp: 'nl2:comp',           // 已领取的补偿 id
    slot: 'nl2:acc:'            // 账号存档快照：nl2:acc:<id>
  };

  // 设备级：切换 / 注销都不动
  const DEVICE_KEYS = {
    'nl2:accounts': 1,
    'nl2:cur': 1,
    'nl2:comp': 1,
    'nl2:visits': 1,
    'nl2:net': 1,
    'nl2:lb-del': 1,
    'nl2:statsVer': 1
  };

  // 一次性补偿（换设备 / 找回账号时丢过金币的补偿）
  const GRANTS = [
    { id: 'yone-coins-1360', name: 'yone', coins: 1360 }
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
  function raw(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }

  function isSlotKey(k) { return String(k).indexOf(K.slot) === 0; }
  function isDeviceKey(k) {
    return !!DEVICE_KEYS[k] || isSlotKey(k);
  }

  // ---------- 口令哈希 ----------
  // 加盐 + 多轮 FNV-1a / 移位混合，纯同步（file:// 下也能用，不依赖 crypto.subtle）
  function hash(pass) {
    const s = 'nl-acc$' + String(pass == null ? '' : pass);
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let round = 0; round < 1200; round++) {
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i) + round;
        h1 = (h1 ^ c) >>> 0;
        h1 = (h1 * 16777619) >>> 0;
        h2 = ((h2 << 5) + h2 + c) >>> 0;
      }
    }
    return 'v1$' + h1.toString(36) + '$' + h2.toString(36);
  }

  // ---------- 账号表 ----------
  function list() {
    const a = read(K.accounts, []);
    return Array.isArray(a) ? a.filter((x) => x && x.id) : [];
  }
  function saveList(a) { write(K.accounts, a); }

  function nameKey(n) { return String(n == null ? '' : n).trim().toLowerCase(); }

  function find(id) {
    if (!id) return null;
    return list().filter((x) => x.id === id)[0] || null;
  }
  function findByName(n) {
    const k = nameKey(n);
    if (!k) return null;
    return list().filter((x) => x.name && nameKey(x.name) === k)[0] || null;
  }
  function currentId() { const v = read(K.cur, ''); return typeof v === 'string' ? v : ''; }
  function current() { return find(currentId()); }
  function loggedIn() { return !!current(); }

  function touch(id) {
    const arr = list();
    const i = arr.findIndex((x) => x.id === id);
    if (i >= 0) { arr[i].last = Date.now(); saveList(arr); }
  }

  // ---------- 当前账号的数据快照 ----------
  function activeSnapshot() {
    const out = {};
    try {
      const n = localStorage.length;
      for (let i = 0; i < n; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf('nl2:') !== 0 || isDeviceKey(k)) continue;
        out[k] = localStorage.getItem(k);
      }
    } catch (e) {}
    return out;
  }

  function wipeActive() {
    const rm = [];
    try {
      const n = localStorage.length;
      for (let i = 0; i < n; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf('nl2:') === 0 && !isDeviceKey(k)) rm.push(k);
      }
    } catch (e) {}
    rm.forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
  }

  function saveCurrent() {
    const acc = current();
    if (!acc) return false;
    return write(K.slot + acc.id, { keys: activeSnapshot(), savedAt: Date.now() });
  }

  function loadSlot(id) {
    const slot = read(K.slot + id, null);
    wipeActive();
    if (slot && slot.keys) {
      Object.keys(slot.keys).forEach((k) => {
        try { localStorage.setItem(k, slot.keys[k]); } catch (e) {}
      });
    }
    // 身份码丢了就补回账号 id（榜单靠它认人）
    if (!raw('nl2:muid')) write('nl2:muid', id);
    return true;
  }

  // ---------- 校验 ----------
  // 名字：走 Meta.validateNick（长度 / 字符 / 敏感词 / 重名），并且不能和本机账号重名
  function checkName(name, excludeId) {
    const taken = list()
      .filter((x) => x.id !== excludeId && x.name)
      .map((x) => x.name);
    if (global.Board && Board.list) {
      try {
        Board.list().forEach((e) => {
          if (e && e.name && e.uid !== excludeId) taken.push(e.name);
        });
      } catch (e) {}
    }
    const r = (global.Meta && Meta.validateNick)
      ? Meta.validateNick(name, taken)
      : { ok: true, name: String(name || '').trim() };
    if (!r.ok) return r;
    const other = findByName(r.name);
    if (other && other.id !== excludeId) return { ok: false, reason: '这个名字已经被别人用了' };
    return r;
  }

  function checkPass(pass) {
    const s = String(pass == null ? '' : pass);
    if (!s) return { ok: false, reason: '请填写密码' };
    if (s.length < 4) return { ok: false, reason: '密码至少 4 位' };
    if (s.length > 24) return { ok: false, reason: '密码最多 24 位' };
    if (/\s/.test(s)) return { ok: false, reason: '密码里不能有空格' };
    return { ok: true, pass: s };
  }

  // 账号名是唯一真源：登录 / 切换 / 注册后同步进存档（排行榜、主页都读 Meta.nickname）
  function syncNick(acc) {
    acc = acc || current();
    if (!acc || !acc.name) return;
    if (!global.Meta || !Meta.setNickname) return;
    try { if (Meta.nickname() !== acc.name) Meta.setNickname(acc.name); } catch (e) {}
  }

  function newUid() {
    if (global.Meta && Meta.myUid) return Meta.myUid();
    return 'u' + Math.random().toString(36).slice(2, 10);
  }

  // ---------- 注册 / 登录 / 注销 / 切换 ----------
  function register(name, pass) {
    const n = checkName(name);
    if (!n.ok) return n;
    const p = checkPass(pass);
    if (!p.ok) return p;

    wipeActive();                       // 新号：从零开始
    const uid = newUid();
    const acc = {
      id: uid,
      name: n.name,
      pass: hash(p.pass),
      created: Date.now(),
      last: Date.now()
    };
    const arr = list();
    arr.push(acc);
    saveList(arr);
    write(K.cur, uid);
    syncNick(acc);
    saveCurrent();
    return { ok: true, account: acc };
  }

  const BAD_PASS = '名字或密码不正确，请确认后再次输入';

  function login(name, pass) {
    const acc = findByName(name);
    if (!acc) return { ok: false, reason: BAD_PASS, badAccount: true };
    if (!acc.pass) return { ok: false, reason: '这个账号还没设置密码', needPass: true, account: acc };
    if (hash(pass) !== acc.pass) return { ok: false, reason: BAD_PASS, badAccount: true };
    wipeActive();
    loadSlot(acc.id);
    write(K.cur, acc.id);
    syncNick(acc);
    touch(acc.id);
    return { ok: true, account: acc };
  }

  // 注销 = 退出登录：数据存进快照留在本机，随时能切回来
  function logout() {
    saveCurrent();
    wipeActive();
    write(K.cur, '');
    return true;
  }

  function switchTo(id) {
    const acc = find(id);
    if (!acc) return { ok: false, reason: '账号不存在' };
    if (currentId() === id) return { ok: true, same: true, account: acc };
    saveCurrent();
    write(K.cur, id);
    loadSlot(id);
    syncNick(acc);
    touch(id);
    return { ok: true, account: acc };
  }

  // ---------- 修改密码 / 改名字 ----------
  function setPassword(oldPass, newPass) {
    const acc = current();
    if (!acc) return { ok: false, reason: '还没有登录' };
    if (acc.pass && hash(oldPass) !== acc.pass) return { ok: false, reason: '原密码不正确', oldBad: true };
    const p = checkPass(newPass);
    if (!p.ok) return p;
    const arr = list();
    const i = arr.findIndex((x) => x.id === acc.id);
    if (i < 0) return { ok: false, reason: '账号不存在' };
    arr[i].pass = hash(p.pass);
    arr[i].last = Date.now();
    saveList(arr);
    return { ok: true };
  }

  function rename(newName) {
    const acc = current();
    if (!acc) return { ok: false, reason: '还没有登录' };
    const r = checkName(newName, acc.id);
    if (!r.ok) return r;
    const arr = list();
    const i = arr.findIndex((x) => x.id === acc.id);
    if (i < 0) return { ok: false, reason: '账号不存在' };
    arr[i].name = r.name;
    saveList(arr);
    if (global.Meta && Meta.setNickname) Meta.setNickname(r.name);
    return { ok: true, name: r.name };
  }

  // ---------- 资料是否完整（缺名字 / 缺密码 / 含敏感词） ----------
  function needsFix() {
    const acc = current();
    if (!acc) return { any: false };
    const badNick = !acc.name || acc.name === '奶龙玩家';
    const badPass = !acc.pass;
    const sens = !!acc.name && !!(global.Meta && Meta.hasSensitive && Meta.hasSensitive(acc.name));
    return { any: !!(badNick || badPass || sens), nick: badNick, pass: badPass, sensitive: sens };
  }

  // ---------- 老版本迁移：本机已有数据但没有账号表 → 认领成一个账号 ----------
  function ensure() {
    const cur = currentId();
    if (cur && find(cur)) return { ok: true, created: false };

    // 只认「真的玩过」的痕迹：光有 nl2:muid / nl2:tasks 是启动时自动写的缓存，不算老用户
    const hasData = !!raw('nl2:mnick') || !!raw('nl2:wallet') || !!raw('nl2:progress') ||
      !!raw('nl2:mstats') || !!raw('nl2:mach') || !!raw('nl2:mbest');
    if (!hasData) return { ok: true, created: false };

    const uid = newUid();
    let name = '';
    try { name = Meta.nickname(); } catch (e) {}
    if (name === '奶龙玩家') name = '';
    // 名字被别人占用（理论上不会）就先空着，后面强制补名字
    if (name && findByName(name)) name = '';
    const acc = {
      id: uid,
      name: name,
      pass: '',                       // 老用户没有密码 → 进来后强制设置
      created: Date.now(),
      last: Date.now(),
      legacy: true
    };
    const arr = list();
    arr.push(acc);
    saveList(arr);
    write(K.cur, uid);
    saveCurrent();
    return { ok: true, created: true, account: acc };
  }

  // ---------- 一次性补偿 ----------
  function claimGrants() {
    const acc = current();
    if (!acc || !global.Store) return [];
    const claimed = read(K.comp, []);
    const got = [];
    GRANTS.forEach((g) => {
      const key = g.id + ':' + acc.id;
      if (claimed.indexOf(key) >= 0) return;
      if (nameKey(acc.name) !== nameKey(g.name)) return;
      Store.addCoins(g.coins);
      claimed.push(key);
      got.push(g);
    });
    if (got.length) write(K.comp, claimed);
    return got;
  }

  // ---------- 列表展示用摘要 ----------
  function summary(acc) {
    const isCur = !!acc && acc.id === currentId();
    let keys = {};
    if (isCur) {
      keys = activeSnapshot();
    } else if (acc) {
      const slot = read(K.slot + acc.id, null);
      keys = (slot && slot.keys) || {};
    }
    let coins = 0, stars = 0;
    try {
      if (keys['nl2:wallet']) coins = (JSON.parse(keys['nl2:wallet']).coins || 0);
    } catch (e) {}
    try {
      if (keys['nl2:progress']) {
        const p = JSON.parse(keys['nl2:progress']) || {};
        Object.keys(p).forEach((k) => { stars += (p[k] && p[k].stars) || 0; });
      }
    } catch (e) {}
    return { coins: coins, stars: stars };
  }

  function all() {
    const arr = list().slice();
    arr.sort((a, b) => (b.last || 0) - (a.last || 0));
    return arr;
  }

  global.Account = {
    K, GRANTS, BAD_PASS,
    hash,
    list: all, find, findByName, current, currentId, loggedIn,
    register, login, logout, switchTo,
    setPassword, rename, needsFix, ensure, claimGrants, summary, syncNick,
    saveCurrent, checkName, checkPass
  };
})(window);
