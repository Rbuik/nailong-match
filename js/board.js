// board.js — 共享实时排行榜
// 全网玩家共用一个公共中转主题（ntfy.sh）：谁的成绩变了就发一条，
// 别人开着排行榜时通过 SSE 立刻收到，没开的时候下次进来拉一次历史补齐。
// 本机还会落一份缓存，断网 / 中转挂了也能看到上次的榜单。
// 暴露 window.Board

(function (global) {
  'use strict';

  const BASE = 'https://ntfy.sh/';
  // 换过一次主题：旧主题（nailong-lb-7c41d9e2）被早期验证用的测试成绩污染，
  // 新主题从零开始，谁的历史缓存都不带
  const TOPIC = 'nailong-lb-9k2v7h4q';
  const CACHE = 'nl2:lbshare2';
  // 注销墓碑：玩家注销后广播 t:'d'，所有设备把这个人从榜单里拿掉，
  // 并把 uid 记进本墓碑表，防止旧消息 / 别人手里的快照把已注销的人「复活」。
  // 存在独立的 key（nl2:lb-del）里，注销清档时不清掉它。
  const DELKEY = 'nl2:lb-del';
  const DEL_MAX_AGE = 30 * 864e5;        // 墓碑保留 30 天（中转消息只留 12h，足够盖住）
  const MAX = 60;                        // 榜单最多保留 60 人
  const PUB_MIN_MS = 6e3;                // 自己的成绩最快 6 秒发一次
  const SNAP_MIN_MS = 90e3;              // 合成快照最小间隔
  const POLL_MS = 20e3;                  // 开着面板时的轮询兜底

  // entries: [{ uid, name, score, level, ts, pv, lv, st }]
  //   pv = 省份代码（省榜用），lv = { 关卡号: 本关最高分 }（局榜用），
  //   st = { 关卡号: 星级 1~3 }（榜上星星用，老数据没有就按分数反推）
  let entries = [];
  let status = 'idle';     // idle | syncing | live | offline
  let listeners = [];
  let es = null;           // EventSource
  let pollTimer = null;
  let lastSync = 0;
  let lastPub = 0;
  let lastSnap = 0;
  let opened = false;
  let deleted = {};        // uid -> 注销时间戳

  // 只允许「正式部署的站点」往公共频道发成绩：
  // ① 必须是 http(s) 页面（node / 无 location 的测试环境直接不发）
  // ② localhost / 127.0.0.1 / 带端口号的地址一律不发——本地调试和无头截图测试
  //    都跑在这类地址上，之前放开导致测试成绩（截图奶龙）混进了真榜单
  // file:// 仍然放行：电脑本地双击打开时成绩也要能同步到手机
  function canPublish() {
    try {
      const loc = global.location;
      if (!loc || !loc.protocol) return false;
      if (loc.protocol !== 'https:' && loc.protocol !== 'http:') return false;
      const h = String(loc.hostname || '').toLowerCase();
      if (!h || h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' ||
          h === '::1' || h.indexOf('localhost') >= 0) return false;
      if (loc.port) return false;   // 本地调试服务器都带端口
      return true;
    } catch (e) { return false; }
  }

  // ---------- 本地缓存 ----------
  function load() {
    try {
      const raw = global.localStorage && localStorage.getItem(CACHE);
      const j = raw ? JSON.parse(raw) : null;
      if (j && Array.isArray(j.list)) entries = j.list.map(clean).filter(Boolean);
      if (j && typeof j.ts === 'number') lastSync = j.ts;
      // 老缓存里可能留着「同一人两条」的旧数据，进来就收一次
      if (dedupeSameName()) save();
    } catch (e) {}
  }

  function save() {
    try {
      if (global.localStorage) localStorage.setItem(CACHE, JSON.stringify({ ts: lastSync, list: entries }));
    } catch (e) {}
  }

  // ---------- 注销墓碑 ----------
  function loadDel() {
    try {
      const raw = global.localStorage && localStorage.getItem(DELKEY);
      const j = raw ? JSON.parse(raw) : null;
      if (j && typeof j === 'object') deleted = j;
    } catch (e) {}
  }

  function saveDel() {
    try {
      if (!global.localStorage) return;
      const now = Date.now();
      const out = {};
      Object.keys(deleted).forEach((k) => {
        if (now - deleted[k] < DEL_MAX_AGE) out[k] = deleted[k];
      });
      deleted = out;
      localStorage.setItem(DELKEY, JSON.stringify(deleted));
    } catch (e) {}
  }

  // ---------- 数据校验（谁都能往公共主题发东西，脏数据一律丢掉） ----------
  // 局榜：{ "3": 1280, "7": 990 } —— 只认 1~999 关、分数 1~5e7，最多 80 关
  function cleanLv(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    const keys = Object.keys(raw);
    let n = 0;
    for (let i = 0; i < keys.length && n < 80; i++) {
      const lv = Math.round(Number(keys[i]));
      const sc = Math.round(Number(raw[keys[i]]));
      if (!(lv >= 1 && lv <= 999)) continue;
      if (!isFinite(sc) || sc <= 0 || sc > 5e7) continue;
      out[String(lv)] = sc;
      n++;
    }
    return out;
  }

  function mergeLv(dst, src) {
    let changed = false;
    Object.keys(src || {}).forEach((k) => {
      const v = src[k];
      if (!(v > (dst[k] || 0))) return;
      dst[k] = v;
      changed = true;
    });
    return changed;
  }

  // 星级：{ "3": 3, "7": 2 } —— 只认 1~999 关、1~3 星，最多 80 关
  function cleanSt(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    const keys = Object.keys(raw);
    let n = 0;
    for (let i = 0; i < keys.length && n < 80; i++) {
      const lv = Math.round(Number(keys[i]));
      const st = Math.round(Number(raw[keys[i]]));
      if (!(lv >= 1 && lv <= 999)) continue;
      if (!(st >= 1 && st <= 3)) continue;
      out[String(lv)] = st;
      n++;
    }
    return out;
  }

  function mergeSt(dst, src) {
    let changed = false;
    Object.keys(src || {}).forEach((k) => {
      const v = src[k];
      if (!(v > (dst[k] || 0))) return;
      dst[k] = v;
      changed = true;
    });
    return changed;
  }

  function clean(e) {
    if (!e) return null;
    const uid = String(e.uid || e.u || '');
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(uid)) return null;
    const name = String(e.name || e.n || '玩家').replace(/[\r\n<>]/g, '').trim().slice(0, 8) || '玩家';
    const score = Math.round(Number(e.score != null ? e.score : e.s));
    if (!isFinite(score) || score < 0 || score > 5e7) return null;
    const level = Math.max(0, Math.min(9999, Math.round(Number(e.level != null ? e.level : e.l) || 0)));
    const ts = Number(e.ts || e.t || 0) || Date.now();
    const pvRaw = String(e.pv || e.p || '').toLowerCase();
    const pv = /^[a-z]{2,20}$/.test(pvRaw) ? pvRaw : '';
    const lv = cleanLv(e.lv || e.v || e.lvm);
    const st = cleanSt(e.st || e.sm || e.stm);
    return { uid: uid, name: name, score: score, level: level, ts: ts, pv: pv, lv: lv, st: st };
  }

  function findIdx(uid) {
    for (let i = 0; i < entries.length; i++) if (entries[i].uid === uid) return i;
    return -1;
  }

  // 同一个人：分数取历史最高，昵称按时间取最新，省份跟着最新的走，局分逐关取最高
  function mergeOne(raw) {
    const e = clean(raw);
    if (!e) return false;
    // 已注销的人：墓碑保留期内该 uid 一律不收（重新玩会生成新 uid，
    // 旧 uid 只可能来自没退出的旧页面 / 别人手里的旧快照，统统拒绝）
    if (deleted[e.uid]) return false;
    const i = findIdx(e.uid);
    if (i < 0) {
      entries.push(e);
      trim();
      return true;
    }
    const cur = entries[i];
    let changed = false;
    if (e.ts >= cur.ts && e.name !== cur.name) { cur.name = e.name; changed = true; }
    if (e.ts >= cur.ts && (e.pv || '') !== (cur.pv || '')) { cur.pv = e.pv; changed = true; }
    if (e.score > cur.score) { cur.score = e.score; changed = true; }
    if (e.level > cur.level) { cur.level = e.level; changed = true; }
    if (e.ts > cur.ts) { cur.ts = e.ts; changed = true; }
    if (!cur.lv) cur.lv = {};
    if (mergeLv(cur.lv, e.lv)) changed = true;
    if (!cur.st) cur.st = {};
    if (mergeSt(cur.st, e.st)) changed = true;
    return changed;
  }

  function trim() {
    if (entries.length <= MAX) return;
    entries.sort(byScore);
    entries = entries.slice(0, MAX);
  }

  // ---------- 同一个人换了身份码，榜单上会留下两条同名记录 ----------
  // 把账号存到服务器时，本机码 uXXXX 会换成服务器码 pXXXXXX，旧码那条成绩
  // 还留在公共频道和各设备缓存里；新码再发一次，榜单上就出现两个一模一样的名字。
  // 这里只处理「同名 + 一条本机码 + 一条服务器码」这种明确的情况：
  // 合并成服务器码那条，分数 / 局分取两边最高，避免掉分。
  function isSrvUid(u) { return /^p[0-9a-f]{8,}$/i.test(String(u || '')); }
  function isLocalUid(u) { return /^u[a-z0-9]{6,}$/i.test(String(u || '')); }

  function dedupeSameName() {
    let changed = false;
    for (let i = entries.length - 1; i >= 0; i--) {
      const old = entries[i];
      if (!isLocalUid(old.uid)) continue;
      const key = String(old.name || '').trim().toLowerCase();
      if (!key) continue;
      const srv = entries.filter((b) => b !== old && isSrvUid(b.uid) &&
        String(b.name || '').trim().toLowerCase() === key)[0];
      if (!srv) continue;
      // 旧码上的成绩不能丢：能拿的最高分 / 局分都并到新码那条上
      if ((old.score || 0) > (srv.score || 0)) srv.score = old.score;
      if ((old.level || 0) > (srv.level || 0)) srv.level = old.level;
      if (!srv.lv) srv.lv = {};
      mergeLv(srv.lv, old.lv);
      if (!srv.st) srv.st = {};
      mergeSt(srv.st, old.st);
      if ((old.ts || 0) > (srv.ts || 0)) srv.ts = old.ts;
      if (!srv.pv && old.pv) srv.pv = old.pv;
      entries.splice(i, 1);
      changed = true;
    }
    return changed;
  }

  function byScore(a, b) { return (b.score || 0) - (a.score || 0); }

  // 一条中转消息：单条成绩（t:'e'）、整榜快照（t:'s'）、局分分包（t:'v'）
  function consume(raw) {
    if (!raw) return false;
    let msg = raw;
    if (typeof msg === 'string') {
      const s = msg.trim();
      if (!s || s.charAt(0) !== '{') return false;
      try { msg = JSON.parse(s); } catch (e) { return false; }
    }
    if (!msg || typeof msg !== 'object') return false;
    let changed = false;
    if (msg.t === 's' && Array.isArray(msg.d)) {
      msg.d.forEach((row) => {
        // 快照里是紧凑数组 [uid, name, score, level, ts, pv, lv, st]
        const e = Array.isArray(row)
          ? { uid: row[0], name: row[1], score: row[2], level: row[3], ts: row[4], pv: row[5], lv: row[6], st: row[7] }
          : row;
        if (mergeOne(e)) changed = true;
      });
    } else if (msg.t === 'v' && Array.isArray(msg.d)) {
      // 局分分包：[[uid, { 关卡: 分数 }], ...]（整榜快照太大，按关分批发）
      msg.d.forEach((row) => {
        if (!Array.isArray(row)) return;
        const i = findIdx(String(row[0] || ''));
        if (i < 0) return;
        if (!entries[i].lv) entries[i].lv = {};
        if (mergeLv(entries[i].lv, cleanLv(row[1]))) changed = true;
      });
    } else if (msg.t === 'd' && msg.u) {
      // 注销广播：把这个人从榜单拿掉，并记进墓碑表
      const uid = String(msg.u);
      if (/^[A-Za-z0-9_-]{3,24}$/.test(uid)) {
        const ts = Number(msg.ts) || Date.now();
        if (ts > (deleted[uid] || 0)) { deleted[uid] = ts; saveDel(); }
        const i = findIdx(uid);
        if (i >= 0 && entries[i].ts <= ts) { entries.splice(i, 1); changed = true; }
      }
    } else {
      if (mergeOne(msg)) changed = true;
    }
    if (dedupeSameName()) changed = true;
    return changed;
  }

  function emit() {
    listeners.forEach((fn) => { try { fn(); } catch (e) {} });
  }

  function setStatus(s) {
    if (status === s) return;
    status = s;
    emit();
  }

  // ---------- 拉取 ----------
  function parseNdjson(txt) {
    let changed = false;
    let maxT = 0;   // 消息里最大的服务器时间（unix 秒）
    String(txt || '').split('\n').forEach((line) => {
      const s = line.trim();
      if (!s) return;
      let j;
      try { j = JSON.parse(s); } catch (e) { return; }
      if (!j || j.event !== 'message' || !j.message) return;
      maxT = Math.max(maxT, Number(j.message.time) || 0);
      if (consume(j.message)) changed = true;
    });
    return { changed: changed, maxT: maxT };
  }

  let syncCount = 0;
  function sync() {
    if (typeof fetch !== 'function') return Promise.resolve(false);
    setStatus('syncing');
    syncCount++;
    // 游标 = 上次同步的服务器时间（多回看 5 秒防同秒消息被截）。
    // 两个自愈手段，防止设备时钟偏差把游标卡在「未来」而永远漏消息：
    //   1) 游标至少回看 10 分钟
    //   2) 每 5 次同步全量拉一次（mergeOne 按最高分合并，重复消息无害）
    const sinceSec = lastSync ? Math.floor((lastSync - 5000) / 1000) : 0;
    const since = (!sinceSec || syncCount % 5 === 0) ? 'all'
      : Math.max(0, Math.min(sinceSec, Math.floor(Date.now() / 1000) - 600));
    const url = BASE + TOPIC + '/json?poll=1&since=' + since;
    return fetch(url, { cache: 'no-store' })
      .then((r) => (r && r.ok ? r.text() : ''))
      .then((txt) => {
        const r = parseNdjson(txt);
        // 游标用「服务器消息时间」而不是本机时间：手机时钟偏快几秒时，
        // 按本机时间算 since 会把刚发布的消息当成已同步过，从此一直漏。
        if (r.maxT) lastSync = Math.max(lastSync, r.maxT * 1000);
        else lastSync = Date.now();
        save();
        setStatus('live');
        if (r.changed) emit();
        maybeSnapshot();
        return r.changed;
      })
      .catch(() => { setStatus('offline'); return false; });
  }

  function post(body) {
    if (!canPublish() || typeof fetch !== 'function') return Promise.resolve(false);
    return fetch(BASE + TOPIC, {
      method: 'POST',
      // 用纯文本发，避免被当成 ntfy 的结构化 JSON 消息
      headers: { 'Content-Type': 'text/plain' },
      body: body
    }).then((r) => !!(r && r.ok)).catch(() => false);
  }

  // 整榜快照：中转只保留 12 小时的消息，靠快照把老成绩传下去
  // 总分快照一次发完；局分快照按 10 关一批轮着发（一条消息太大 ntfy 会拒收）
  const SNAP_CHUNK = 10;
  let snapChunk = 0;
  function maybeSnapshot() {
    if (entries.length < 2) return;
    if (Date.now() - lastSnap < SNAP_MIN_MS) return;
    lastSnap = Date.now();
    // 已注销的人不再写进快照，免得其他设备把他「复活」
    const top = entries.filter((e) => !deleted[e.uid]).sort(byScore).slice(0, 30);
    post(JSON.stringify({
      t: 's',
      d: top.map((e) => [e.uid, e.name, e.score, e.level, e.ts, e.pv || '', e.lv || {}, e.st || {}])
    }));
    // 局分分包：只发这一批关卡里有分数的玩家
    const from = snapChunk * SNAP_CHUNK + 1;
    const to = from + SNAP_CHUNK - 1;
    snapChunk = (snapChunk + 1) % 4;
    const rows = [];
    top.forEach((e) => {
      const sub = {};
      Object.keys(e.lv || {}).forEach((k) => {
        const lv = Number(k);
        if (lv >= from && lv <= to) sub[k] = e.lv[k];
      });
      if (Object.keys(sub).length) rows.push([e.uid, sub]);
    });
    if (rows.length) post(JSON.stringify({ t: 'v', d: rows }));
  }

  // ---------- 发自己的成绩 ----------
  function publish(me, force) {
    if (!canPublish()) return false;
    const e = clean(me);
    if (!e) return false;
    const now = Date.now();
    if (!force && now - lastPub < PUB_MIN_MS) return false;
    const before = findIdx(e.uid) >= 0 ? entries[findIdx(e.uid)].score : -1;
    lastPub = now;
    mergeOne({ uid: e.uid, name: e.name, score: e.score, level: e.level, ts: now, pv: e.pv, lv: e.lv, st: e.st });
    dedupeSameName();
    save();
    if (before !== e.score) emit();
    post(JSON.stringify({
      t: 'e', u: e.uid, n: e.name, s: e.score, l: e.level, ts: now, pv: e.pv || '', lv: e.lv || {}, st: e.st || {}
    }));
    return true;
  }

  // ---------- 注销：从榜单上把自己抹掉 ----------
  function remove(uid) {
    uid = String(uid || '');
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(uid)) return false;
    const ts = Date.now();
    deleted[uid] = Math.max(deleted[uid] || 0, ts);
    saveDel();
    const i = findIdx(uid);
    if (i >= 0) {
      entries.splice(i, 1);
      save();
      emit();
    }
    post(JSON.stringify({ t: 'd', u: uid, ts: ts }));
    return true;
  }

  // ---------- 实时流 ----------
  function startStream() {
    if (es || typeof global.EventSource === 'undefined') return;
    try {
      // 不带 since：连接建立后服务器直接推新消息（服务器时间，不受设备时钟偏差影响）
      es = new global.EventSource(BASE + TOPIC + '/sse');
      es.onmessage = (ev) => {
        let j;
        try { j = JSON.parse(ev.data); } catch (e) { return; }
        if (!j || j.event !== 'message' || !j.message) return; // keepalive / open 事件
        // 游标跟服务器时间对齐（同 sync，防时钟偏快漏消息）
        const mt = Number(j.message.time) || 0;
        if (mt) lastSync = Math.max(lastSync, mt * 1000);
        if (consume(j.message)) { lastSync = Math.max(lastSync, Date.now()); save(); emit(); }
      };
      es.onerror = () => { setStatus('offline'); };  // 浏览器会自动重连
      setStatus('live');
    } catch (e) { es = null; }
  }

  function stopStream() {
    if (es) { try { es.close(); } catch (e) {} es = null; }
  }

  // ---------- 对外 ----------
  function open(me) {
    opened = true;
    if (me) publish(me, true);
    sync();
    startStream();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (opened) sync(); }, POLL_MS);
  }

  function close() {
    opened = false;
    stopStream();
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function statusText() {
    if (status === 'live') return '实时';
    if (status === 'syncing') return '同步中…';
    if (status === 'offline') return '离线（本机缓存）';
    return '待同步';
  }

  load();
  loadDel();

  global.Board = {
    open, close, publish, sync, remove,
    list: () => entries.slice().sort(byScore),
    get: (uid) => { const i = findIdx(String(uid || '')); return i < 0 ? null : entries[i]; },
    count: () => entries.length,
    status: () => status,
    statusText: statusText,
    onChange: (fn) => { if (typeof fn === 'function') listeners.push(fn); },
    offChange: (fn) => { listeners = listeners.filter((x) => x !== fn); },
    _topic: TOPIC
  };
})(window);
