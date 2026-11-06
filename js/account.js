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
    'nl2:statsVer': 1,
    'nl2:purged': 1      // 注销记录：注销过的号不许再从服务器"找回来"
  };

  // 一次性补偿（换设备 / 找回账号时丢过金币的补偿）
  // 奖励不直接进钱包，而是塞进这个账号的邮箱，玩家自己点「领取」才到账
  const GRANTS = [
    {
      id: 'gift-yone-1360', name: 'yone', coins: 1360,
      title: '给你的小礼物',
      body: '谢谢你来玩奶龙消消乐，附件里的金币是给你的一点心意。\n\n点下面的按钮就能收进钱包，别忘了用哦。'
    },
    {
      id: 'gift-ii-666', name: 'ii', coins: 666,
      title: '给你的小礼物',
      body: '谢谢你来玩奶龙消消乐，附件里的金币是给你的一点心意。\n\n点下面的按钮就能收进钱包，别忘了用哦。'
    }
  ];

  function stamp() {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' + n : String(n));
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // 把奖励发到这个账号的邮箱（金币作附件）；没有邮箱模块就直接进钱包，至少不丢
  function deliverGrant(g) {
    if (global.Mail && Mail.sendMail) {
      return !!Mail.sendMail({
        id: g.id,
        at: stamp(),
        icon: '🎁',
        title: g.title || '系统奖励',
        from: '系统',
        body: g.body || '附件里的金币点下面的按钮就能收进钱包。',
        coins: g.coins || 0,
        items: g.items || null
      });
    }
    if (g.coins && global.Store && Store.addCoins) Store.addCoins(g.coins);
    return true;
  }

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

  // 名字区分大小写：Yone 和 yone 是两个不同的号（登录 / 注册 / 改名都按原样比）
  function nameKey(n) { return String(n == null ? '' : n).trim(); }

  function find(id) {
    if (!id) return null;
    return list().filter((x) => x.id === id)[0] || null;
  }
  function findByName(n) {
    const k = nameKey(n);
    if (!k) return null;
    return list().filter((x) => x.name && nameKey(x.name) === k)[0] || null;
  }
  // 登录兜底：精确匹配不到时按大小写不敏感找一个（只有一个候选才认）。
  // 名字本身区分大小写，但老玩家当年注册写的是「Yone」、今天顺手输「yone」，
  // 不该直接被判「查无此人」。
  function findByNameLoose(n) {
    const k = nameKey(n).toLowerCase();
    if (!k) return null;
    const hits = list().filter((x) => x.name && String(x.name).trim().toLowerCase() === k);
    return hits.length === 1 ? hits[0] : null;
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
        // 只有服务器身份码 p… 的榜上名字才算占用；本机码 u… 是临时的，
        // 玩家清缓存/换设备后码会变，用原名不该被旧榜条目拦住
        Board.list().forEach((e) => {
          if (e && e.name && e.uid !== excludeId &&
              /^p[0-9a-f]{8,}$/i.test(String(e.uid || ''))) taken.push(e.name);
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
    const p = checkPass(pass);
    if (!p.ok) return p;
    // 老玩家的号还没设过密码：注册同名直接接管这份账号（进度保留），把新密码设上——
    // 不然登录没密码可输、注册又被本机这个无密码号拦住，两头堵死进不来
    const orphan = findByName(name);
    if (orphan && !orphan.pass) {
      const v = (global.Meta && Meta.validateNick)
        ? Meta.validateNick(name, [])
        : { ok: true, name: String(name || '').trim() };
      if (!v.ok) return v;
      const arr = list();
      const i = arr.findIndex((x) => x.id === orphan.id);
      if (i < 0) return { ok: false, reason: '账号不存在' };
      arr[i].pass = hash(p.pass);
      arr[i].last = Date.now();
      saveList(arr);
      saveCurrent();                    // 当前登录着别的号就先存好它的进度
      write(K.cur, orphan.id);
      loadSlot(orphan.id);              // 这份老进度铺回来
      const acc = find(orphan.id);
      syncNick(acc);
      saveCurrent();
      bgRegister(acc, p.pass);          // 顺手把号建到服务器
      return { ok: true, account: acc, taken: true };
    }
    const n = checkName(name);
    if (!n.ok) return n;

    saveCurrent();                      // 已登录时注册新号，别把当前号的进度弄丢
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
    bgRegister(acc, p.pass);
    return { ok: true, account: acc };
  }

  const BAD_PASS = '名字或密码不正确，请确认后再次输入';

  function login(name, pass) {
    const acc = findByName(name) || findByNameLoose(name);
    if (!acc) return { ok: false, reason: BAD_PASS, badAccount: true };
    if (!acc.pass) return { ok: false, reason: '这个账号还没设置密码', needPass: true, account: acc };
    if (hash(pass) !== acc.pass) return { ok: false, reason: BAD_PASS, badAccount: true };
    saveCurrent();                 // 别把上一个号没存的进度 wipe 掉
    wipeActive();
    loadSlot(acc.id);
    write(K.cur, acc.id);
    syncNick(acc);
    touch(acc.id);
    // 老账号（云端上线前建的）下次登录时静默搬上服务器：服务器上没有就帮它建档
    bgLogin(acc, pass).then((ok) => { if (!ok) bgRegister(acc, pass); });
    return { ok: true, account: acc };
  }

  // 注销 = 退出登录：数据存进快照留在本机，随时能切回来
  function logout() {
    saveCurrent();
    wipeActive();
    write(K.cur, '');
    return true;
  }

  // ---------- 注销停机牌 ----------
  // 注销过的号记一笔（设备级 key）：之后再用同样的名字/身份登录，不许从服务器"找回"旧进度
  const PURGE_KEY = 'nl2:purged';
  function purgedList() {
    const a = read(PURGE_KEY, []);
    return Array.isArray(a) ? a.filter((x) => x && typeof x === 'object') : [];
  }
  function markPurged(nick, uid) {
    const k = nameKey(nick);
    const now = Date.now();
    const keep = purgedList()
      .filter((x) => now - (Number(x.at) || 0) < 30 * 864e5)
      .filter((x) => !(uid && x.uid === uid) && !(k && x.k === k));
    keep.push({ k: k, uid: uid || '', at: now });
    write(PURGE_KEY, keep.slice(-20));
  }
  function wasPurged(uid, nick) {
    const k = nameKey(nick);
    return purgedList().some((x) => (uid && x.uid === uid) || (k && x.k === k));
  }

  // 注销账号 = 彻底删除：本机这份存档、账号表里的记录、榜单成绩、邮箱等全部清掉
  // 服务器上的号也要真删（由调用方 await）：只清本机的话，玩家用同样的名字再登录，
  // 云端会把旧存档整套拉回来，进度看起来一点没变。
  // （榜单删除广播 Board.remove 由调用方先发，它的墓碑 nl2:lb-del 是设备级 key，不会被这里清掉）
  function purge() {
    const acc = current();
    const uid = (acc && acc.id) || currentId() || '';
    const nick = (acc && acc.name) || '';
    const token = (acc && acc.ctoken) || (cloudOk() ? global.Cloud.token() : '');

    let remote = Promise.resolve({ ok: false, gone: true });
    if (cloudOk() && token) {
      try {
        global.Cloud.setToken(token);
        remote = global.Cloud.remove().catch(() => ({ ok: false }));
      } catch (e) {}
    }
    // 先立停机牌：万一服务器这次没删掉，之后同名登录也不许把旧进度拉回来
    if (nick || uid) { try { markPurged(nick, uid); } catch (e) {} }

    const arr = list().filter((x) => !acc || x.id !== acc.id);
    saveList(arr);
    if (uid) { try { localStorage.removeItem(K.slot + uid); } catch (e) {} }
    try { if (global.Store && Store.wipeAll) Store.wipeAll(); } catch (e) {}   // 顺带清 v1 老键
    wipeActive();
    write(K.cur, '');
    try { sessionStorage.clear(); } catch (e) {}
    return remote.then((r) => {
      try { if (cloudOk()) global.Cloud.signOut(); } catch (e) {}
      return { ok: true, uid: uid, left: arr.length, cloudGone: !!(r && r.ok) };
    });
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
    if (cloudOk()) { useAccToken(acc); pullCloud(); }   // 切过来的号也和服务器对一次
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
    // 服务器上的密码一起改：有令牌直接改；令牌丢了但有旧密码，就先登录拿令牌再改
    // （注意只用这个号自己的令牌，别拿设备上别人的令牌去改别人的号）
    if (cloudOk()) {
      if (acc.ctoken) {
        try {
          global.Cloud.setToken(acc.ctoken);
          global.Cloud.setPass(p.pass).catch(() => {});
        } catch (e) {}
      } else if (acc.cloud && oldPass) {
        try {
          global.Cloud.login(acc.name, oldPass)
            .then((r) => ((r && r.ok) ? global.Cloud.setPass(p.pass) : null))
            .catch(() => {});
        } catch (e) {}
      }
    }
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
    // 服务器上的名字一起改；只用这个号自己的令牌，失败不影响本机
    if (cloudOk() && acc.ctoken) {
      try {
        global.Cloud.setToken(acc.ctoken);
        global.Cloud.rename(r.name).catch(() => {});
      } catch (e) {}
    }
    return { ok: true, name: r.name };
  }

  // ---------- 云端账号同步 ----------
  // 名字和密码在服务器上也存一份（cloud.js / cloud-config.js）：
  //   · 注册 / 改密成功后后台写服务器（失败静默，游戏照常玩）
  //   · 本机登录不上时 game.js 会调 cloudLogin() 去服务器找这个号
  //   · 存档定期推上服务器，登录 / 启动时拉回来合并（savedAt 新的赢）
  //   · 令牌存账号记录（acc.ctoken），切账号不用重新输密码
  // 服务器不可达 / 域名没放行 → 全部静默降级为纯本机模式，不影响玩

  function cloudOk() {
    return typeof global.Cloud !== 'undefined' && global.Cloud && global.Cloud.ready();
  }

  function markCloud(acc) {
    if (!acc) return;
    acc.cloud = 1;
    const arr = list();
    const i = arr.findIndex((x) => x.id === acc.id);
    if (i >= 0) { arr[i].cloud = 1; saveList(arr); }
  }

  function slotOf(id) {
    try { return JSON.parse(raw(K.slot + id) || 'null'); } catch (e) { return null; }
  }

  // 把账号 id 迁成服务器身份码（快照跟着搬家）
  function migrateAccId(acc, uid) {
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(String(uid || '')) ||
        !acc || acc.id === uid || find(uid)) return false;
    const oldId = acc.id;
    try {
      const oldSlot = raw(K.slot + acc.id);
      if (oldSlot != null) { try { localStorage.setItem(K.slot + uid, oldSlot); } catch (e1) {} }
      try { localStorage.removeItem(K.slot + acc.id); } catch (e0) {}
    } catch (e) {}
    const arr = list();
    const i = arr.findIndex((x) => x.id === acc.id);
    if (i >= 0) { arr[i].id = uid; arr[i].cloud = 1; saveList(arr); }
    if (currentId() === acc.id) { write(K.cur, uid); write('nl2:muid', uid); }
    acc.id = uid;
    acc.cloud = 1;
    // 身份码换了，榜单上按旧码存的那条要撤掉（广播注销墓碑）：
    // 否则新码再发一次成绩，榜单上就出现两个一模一样的名字
    if (oldId && /^[A-Za-z0-9_-]{3,24}$/.test(oldId) && oldId !== uid) {
      try { if (global.Board && Board.remove) Board.remove(oldId); } catch (e2) {}
    }
    return true;
  }

  function useAccToken(acc) {
    if (!cloudOk()) return false;
    if (acc && acc.ctoken) { global.Cloud.setToken(acc.ctoken); return true; }
    return global.Cloud.signedIn();
  }

  // 本次会话是否成功从服务器拉过数据。没拉过之前禁止自动推：
  // 防止「本机是空的（还没来得及拉/恢复失败）」把服务器上的好存档覆盖掉
  let cloudPulled = false;

  // 当前账号的存档推上服务器（cloud.js 自带 12 秒节流）
  function pushCloud(force) {
    if (!cloudOk()) return Promise.resolve(false);
    const acc = current();
    if (!acc || !useAccToken(acc)) return Promise.resolve(false);
    if (!force && !cloudPulled) return Promise.resolve(false);
    saveCurrent();
    const slot = slotOf(acc.id);
    if (!slot) return Promise.resolve(false);
    return global.Cloud.push(slot, !!force)
      .then((r) => {
        if (r && r.ok) { if (r.token) acc.ctoken = r.token; return true; }
        if (r && !r.ok && String(r.reason || '').indexOf('过期') >= 0) {
          // 令牌失效（比如服务器上这个号被重建 / 删过）：解除绑定，
          // 让「存到服务器」的提示能重新出现，玩家重输密码即可重新建档
          try {
            acc.ctoken = null; acc.cloud = 0;
            const arr = list();
            const i = arr.findIndex((x) => x.id === acc.id);
            if (i >= 0) { arr[i].ctoken = null; arr[i].cloud = 0; saveList(arr); }
          } catch (e) {}
        }
        return false;
      })
      .catch(() => false);
  }

  // 从服务器拉这份账号的存档；服务器的新就换掉本机（是当前号就热替换）
  function pullCloud() {
    if (!cloudOk()) return Promise.resolve(false);
    const acc = current();
    if (!acc || !useAccToken(acc)) return Promise.resolve(false);
    return global.Cloud.pull().then((r) => {
      if (!r || !r.ok) return false;
      cloudPulled = true;
      const srv = r.slot && r.slot.keys ? r.slot : null;
      const loc = slotOf(acc.id);
      const srvT = (srv && srv.savedAt) || 0;
      const locT = (loc && loc.savedAt) || 0;
      if (srv && srvT >= locT) {
        write(K.slot + acc.id, srv);
        if (currentId() === acc.id) { wipeActive(); loadSlot(acc.id); syncNick(acc); }
      } else if (srvT < locT) {
        return pushCloud(true);   // 本机的新：把服务器补上
      }
      return true;
    }).catch(() => false);
  }

  // 注册成功后后台在服务器建同一份；名字已被服务器占用（比如之前注册过一半）
  // 就改用登录验证——密码对得上就把这个服务器身份绑到本机账号上
  // 注意：注册出来的一定是「新号」，服务器上如果还留着同名旧存档，不能被它盖回来
  function bgRegister(acc, pass) {
    if (!cloudOk()) return;
    const bind = (r) => {
      if (!r || !r.ok) return;
      markCloud(acc);
      const uid = String(r.uid || '');
      if (uid && acc.id !== uid && !find(uid)) migrateAccId(acc, uid);
      if (r.token) {
        acc.ctoken = r.token;
        const arr = list();
        const i = arr.findIndex((x) => x.id === acc.id);
        if (i >= 0) { arr[i].ctoken = r.token; saveList(arr); }
      }
      // 新注册以本机为准（这一份是干净的），直接推上去，不拉服务器
      cloudPulled = true;
      return pushCloud(true);
    };
    // 服务器上还有这个名字但已经注销过：先把旧号删掉，再重新建档
    const onTake = (r) => {
      if (!r || !r.ok) return null;
      if (wasPurged(r.uid, acc.name)) {
        return global.Cloud.remove()
          .then(() => global.Cloud.register(acc.name, pass, acc.id))
          .then((r2) => ((r2 && r2.ok) ? bind(r2) : null));
      }
      return bind(r);
    };
    global.Cloud.register(acc.name, pass, acc.id)
      .then((r) => (r && r.ok ? bind(r) : global.Cloud.login(acc.name, pass).then(onTake)))
      .catch(() => {});
  }

  // 登录成功后后台刷新令牌 + 拉服务器最新存档
  function bgLogin(acc, pass) {
    if (!cloudOk()) return Promise.resolve(false);
    return global.Cloud.login(acc.name, pass).then((r) => {
      if (!r || !r.ok) return false;
      markCloud(acc);
      const uid = String(r.uid || '');
      if (uid && acc.id !== uid) migrateAccId(acc, uid);
      if (r.token) {
        acc.ctoken = r.token;
        const arr = list();
        const i = arr.findIndex((x) => x.id === acc.id);
        if (i >= 0) { arr[i].ctoken = r.token; saveList(arr); }
      }
      return pullCloud();
    }).catch(() => false);
  }

  // 用玩家自己输入的密码，把本机账号存到服务器（同名同密码）
  // 为什么要输密码：本机只存哈希，服务器建档必须要一次明文，只有玩家本人有。
  // 校验通过后建号 / 认领，再按 savedAt 决定是上传本机存档还是取回服务器存档。
  function pushAccountToCloud(pass) {
    const acc = current();
    if (!acc) return Promise.resolve({ ok: false, reason: '还没有登录' });
    if (!cloudOk()) return Promise.resolve({ ok: false, reason: '现在连不上服务器，稍后再试' });
    if (acc.pass && hash(pass) !== acc.pass) {
      return Promise.resolve({ ok: false, reason: '这个密码和本机账号对不上，再想想', oldBad: true });
    }
    const p = checkPass(pass);
    if (!p.ok) return Promise.resolve(p);
    if (!acc.name || acc.name === '奶龙玩家') {
      return Promise.resolve({ ok: false, reason: '先把昵称改好，再存到服务器' });
    }

    const bind = (r) => {
      if (!r || !r.ok) return Promise.resolve({ ok: false, reason: (r && r.reason) || '没存上，稍后再试' });
      markCloud(acc);
      const uid = String(r.uid || '');
      if (uid && acc.id !== uid && !find(uid)) migrateAccId(acc, uid);
      if (r.token) {
        acc.ctoken = r.token;
        const arr = list();
        const i = arr.findIndex((x) => x.id === acc.id);
        if (i >= 0) { arr[i].ctoken = r.token; saveList(arr); }
      }
      // 服务器上可能已有旧存档：让 pullCloud 按 savedAt 决定谁覆盖谁，别盲目推
      return pullCloud().then(() => ({ ok: true, uid: uid, merged: true }));
    };

    return global.Cloud.register(acc.name, p.pass, acc.id)
      .then((r) => ((r && r.ok) ? bind(r) : global.Cloud.login(acc.name, p.pass).then((r2) => {
        if (r2 && r2.ok) return bind(r2);
        // 服务器上已有同名号、且密码也对不上（多半是玩家在另一个链接用别的密码先占了名）：
        // 必须给出路，不然「关不掉的存档窗」会把玩家锁死在这个页面
        return { ok: false, nameTaken: true,
          reason: '服务器上已经有叫「' + acc.name + '」的号，和这个密码对不上' };
      })))
      .catch(() => ({ ok: false, reason: '网络异常，稍后再试' }));
  }

  // 本机没有这个号 → 去服务器找（名字和密码在服务器上）
  function cloudLogin(name, pass) {
    if (!cloudOk()) return Promise.resolve({ ok: false, reason: BAD_PASS, badAccount: true });
    const p = checkPass(pass);
    if (!p.ok) return Promise.resolve(p);
    return global.Cloud.login(name, pass).then((r) => {
      if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || BAD_PASS, badAccount: true };
      // 这个号在本机注销过：不能再从服务器把旧存档找回来
      if (wasPurged(String(r.uid || ''), r.nick || name)) {
        try { global.Cloud.remove().catch(() => {}); } catch (e) {}
        return { ok: false, reason: '这个账号已经注销了，换个名字重新注册就行', badAccount: true, purged: true };
      }
      const uid = String(r.uid || '');
      const nick = String(r.nick || name).trim() || String(name).trim();
      saveCurrent();
      let acc = find(uid) || findByName(nick) || findByName(name);
      if (!acc) {
        acc = { id: uid, name: nick, pass: hash(pass), created: Date.now(), last: Date.now(), cloud: 1 };
        const arr = list();
        arr.push(acc);
        saveList(arr);
        wipeActive();
        const srv = r.slot && r.slot.keys ? r.slot : null;
        if (srv) write(K.slot + uid, srv);
        loadSlot(uid);
        write(K.cur, uid);
        write('nl2:muid', uid);
        if (r.token) acc.ctoken = r.token;
        syncNick(acc);
        saveCurrent();
        cloudPulled = true;
        return { ok: true, account: acc, created: true };
      }
      if (acc.id !== uid) migrateAccId(acc, uid);
      const loc = slotOf(acc.id);
      const srv = r.slot && r.slot.keys ? r.slot : null;
      const srvT = (srv && srv.savedAt) || 0;
      const locT = (loc && loc.savedAt) || 0;
      wipeActive();
      if (srv && srvT >= locT) write(K.slot + acc.id, srv);
      loadSlot(acc.id);
      write(K.cur, acc.id);
      write('nl2:muid', acc.id);
      markCloud(acc);
      if (r.token) {
        acc.ctoken = r.token;
        const arr = list();
        const i = arr.findIndex((x) => x.id === acc.id);
        if (i >= 0) { arr[i].ctoken = r.token; saveList(arr); }
      }
      touch(acc.id);
      syncNick(acc);
      cloudPulled = true;
      if (!srv || srvT < locT) pushCloud(true);   // 本机的新：补给服务器
      return { ok: true, account: acc };
    });
  }

  // 开机自愈：有令牌就拉一次服务器；之后定期把当前号推上去，关页面前兜底一次
  function startCloudSync() {
    if (!cloudOk()) return;
    setTimeout(() => { pullCloud(); }, 1500);
    setInterval(() => { pushCloud(false); }, 30e3);
    global.addEventListener && global.addEventListener('pagehide', () => { pushCloud(true); });
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
      // 补偿奖励按名字发，和账号一样区分大小写：只有名字完全一致才发
      if (String(acc.name || '').trim() !== String(g.name).trim()) return;
      if (!deliverGrant(g)) return;
      claimed.push(key);
      got.push(g);
    });
    if (got.length) write(K.comp, claimed);
    return got;
  }

  // 用服务器上验证过的账号进入：把下发的存档铺成本机账号（本机只当离线缓存）
  function adoptCloud(info) {
    info = info || {};
    const uid = String(info.uid || '').trim();
    const nick = String(info.nick || '').trim();
    const slot = info.slot && typeof info.slot === 'object' ? info.slot : null;
    if (!uid) return { ok: false, reason: '服务器没有返回身份码' };
    let arr = list();
    // 名字在本机被另一个账号占着 → 以云端这个号为准，把旧的腾开
    const same = findByName(nick);
    if (same && same.id !== uid) arr = arr.filter((a) => a.id !== same.id);
    let acc = arr.filter((a) => a.id === uid)[0];
    if (!acc) {
      acc = { id: uid, name: nick, pass: '', created: Date.now(), last: Date.now(), cloud: true };
      arr.push(acc);
    } else {
      acc.name = nick || acc.name;
      acc.last = Date.now();
      acc.cloud = true;
      acc.pass = '';          // 本机不再保存密码，校验交给服务器
    }
    saveList(arr);
    if (currentId() && currentId() !== uid) saveCurrent();
    write(K.cur, uid);
    wipeActive();
    if (slot && slot.keys) {
      Object.keys(slot.keys).forEach((k) => {
        try { localStorage.setItem(k, slot.keys[k]); } catch (e) {}
      });
    }
    if (!raw('nl2:muid')) write('nl2:muid', uid);
    syncNick(acc);
    return { ok: true, account: acc };
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

  // ---------- 存档码：把账号表 + 每个账号的进度打成一段可复制的文本 ----------
  // 用途：换网址 / 换设备 / 微信清缓存后 localStorage 会丢，粘回来就能恢复
  const BACKUP_TAG = 'NL2BK1';

  function b64enc(str) {
    try {
      const bytes = new TextEncoder().encode(str);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    } catch (e) {
      try { return btoa(unescape(encodeURIComponent(str))); } catch (e2) { return ''; }
    }
  }

  function b64dec(s) {
    const bin = atob(String(s || '').replace(/\s+/g, ''));
    try {
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (e) {
      return decodeURIComponent(escape(bin));
    }
  }

  function exportBackup() {
    saveCurrent();                       // 当前账号先落一份快照，别漏了最新进度
    const data = { v: 1, at: Date.now(), cur: currentId(), accounts: list(), slots: {} };
    data.accounts.forEach((a) => {
      const s = read(K.slot + a.id, null);
      if (s && s.keys) data.slots[a.id] = s;
    });
    return BACKUP_TAG + '.' + b64enc(JSON.stringify(data));
  }

  // 合并式导入：同 id 的账号 / 快照用备份里的覆盖，本机独有的账号保留
  function importBackup(code) {
    const raw = String(code == null ? '' : code).trim();
    if (!raw) return { ok: false, reason: '请粘贴存档码' };
    if (raw.indexOf(BACKUP_TAG + '.') !== 0) return { ok: false, reason: '存档码格式不对，要整段复制' };
    let data = null;
    try { data = JSON.parse(b64dec(raw.slice(BACKUP_TAG.length + 1))); }
    catch (e) { return { ok: false, reason: '存档码解析失败，可能没复制完整' }; }
    if (!data || !Array.isArray(data.accounts)) return { ok: false, reason: '存档码里没有账号数据' };
    const valid = data.accounts.filter((a) => a && a.id && a.name);
    if (!valid.length) return { ok: false, reason: '存档码里没有账号数据' };

    const byId = Object.create(null);
    list().forEach((a) => { byId[a.id] = a; });
    valid.forEach((a) => { byId[a.id] = a; });
    saveList(Object.keys(byId).map((k) => byId[k]));

    const src = data.slots || {};
    Object.keys(src).forEach((id) => {
      const s = src[id];
      if (s && s.keys) write(K.slot + id, s);
    });
    return { ok: true, count: valid.length };
  }

  global.Account = {
    K, GRANTS, BAD_PASS,
    hash,
    list: all, find, findByName, current, currentId, loggedIn,
    register, login, logout, switchTo,
    setPassword, rename, needsFix, ensure, claimGrants, summary, syncNick, purge,
    saveCurrent, checkName, checkPass,
    exportBackup, importBackup,
    cloudLogin, pushCloud, pullCloud, pushAccountToCloud, startCloudSync, cloudOk
  };
})(window);
