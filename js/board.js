// board.js — 共享实时排行榜
// 全网玩家共用一个公共中转主题（ntfy.sh）：谁的成绩变了就发一条，
// 别人开着排行榜时通过 SSE 立刻收到，没开的时候下次进来拉一次历史补齐。
// 本机还会落一份缓存，断网 / 中转挂了也能看到上次的榜单。
// 暴露 window.Board

(function (global) {
  'use strict';

  const BASE = 'https://ntfy.sh/';
  const TOPIC = 'nailong-lb-7c41d9e2';   // 固定主题，所有人共用一张榜
  const CACHE = 'nl2:lbshare';
  const MAX = 60;                        // 榜单最多保留 60 人
  const PUB_MIN_MS = 6e3;                // 自己的成绩最快 6 秒发一次
  const SNAP_MIN_MS = 90e3;              // 合成快照最小间隔
  const POLL_MS = 20e3;                  // 开着面板时的轮询兜底

  let entries = [];        // [{ uid, name, score, level, ts }]
  let status = 'idle';     // idle | syncing | live | offline
  let listeners = [];
  let es = null;           // EventSource
  let pollTimer = null;
  let lastSync = 0;
  let lastPub = 0;
  let lastSnap = 0;
  let opened = false;

  // ---------- 本地缓存 ----------
  function load() {
    try {
      const raw = global.localStorage && localStorage.getItem(CACHE);
      const j = raw ? JSON.parse(raw) : null;
      if (j && Array.isArray(j.list)) entries = j.list.map(clean).filter(Boolean);
      if (j && typeof j.ts === 'number') lastSync = j.ts;
    } catch (e) {}
  }

  function save() {
    try {
      if (global.localStorage) localStorage.setItem(CACHE, JSON.stringify({ ts: lastSync, list: entries }));
    } catch (e) {}
  }

  // ---------- 数据校验（谁都能往公共主题发东西，脏数据一律丢掉） ----------
  function clean(e) {
    if (!e) return null;
    const uid = String(e.uid || e.u || '');
    if (!/^[A-Za-z0-9_-]{3,24}$/.test(uid)) return null;
    const name = String(e.name || e.n || '玩家').replace(/[\r\n<>]/g, '').trim().slice(0, 8) || '玩家';
    const score = Math.round(Number(e.score != null ? e.score : e.s));
    if (!isFinite(score) || score < 0 || score > 5e7) return null;
    const level = Math.max(0, Math.min(9999, Math.round(Number(e.level != null ? e.level : e.l) || 0)));
    const ts = Number(e.ts || e.t || 0) || Date.now();
    return { uid: uid, name: name, score: score, level: level, ts: ts };
  }

  function findIdx(uid) {
    for (let i = 0; i < entries.length; i++) if (entries[i].uid === uid) return i;
    return -1;
  }

  // 同一个人：分数取历史最高，昵称按时间取最新
  function mergeOne(raw) {
    const e = clean(raw);
    if (!e) return false;
    const i = findIdx(e.uid);
    if (i < 0) {
      entries.push(e);
      trim();
      return true;
    }
    const cur = entries[i];
    let changed = false;
    if (e.ts >= cur.ts && e.name !== cur.name) { cur.name = e.name; changed = true; }
    if (e.score > cur.score) { cur.score = e.score; changed = true; }
    if (e.level > cur.level) { cur.level = e.level; changed = true; }
    if (e.ts > cur.ts) { cur.ts = e.ts; changed = true; }
    return changed;
  }

  function trim() {
    if (entries.length <= MAX) return;
    entries.sort(byScore);
    entries = entries.slice(0, MAX);
  }

  function byScore(a, b) { return (b.score || 0) - (a.score || 0); }

  // 一条中转消息：可能是单条成绩（t:'e'），也可能是整榜快照（t:'s'）
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
        // 快照里是紧凑数组 [uid, name, score, level, ts]
        const e = Array.isArray(row)
          ? { uid: row[0], name: row[1], score: row[2], level: row[3], ts: row[4] }
          : row;
        if (mergeOne(e)) changed = true;
      });
    } else {
      if (mergeOne(msg)) changed = true;
    }
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
    String(txt || '').split('\n').forEach((line) => {
      const s = line.trim();
      if (!s) return;
      let j;
      try { j = JSON.parse(s); } catch (e) { return; }
      if (!j || j.event !== 'message' || !j.message) return;
      if (consume(j.message)) changed = true;
    });
    return changed;
  }

  function sync() {
    if (typeof fetch !== 'function') return Promise.resolve(false);
    setStatus('syncing');
    // 多回看 5 秒，防止同一秒内发的消息被 since 截掉
    const since = lastSync ? Math.max(0, Math.floor((lastSync - 5000) / 1000)) : 0;
    const url = BASE + TOPIC + '/json?poll=1&since=' + (since ? since : 'all');
    return fetch(url, { cache: 'no-store' })
      .then((r) => (r && r.ok ? r.text() : ''))
      .then((txt) => {
        const changed = parseNdjson(txt);
        lastSync = Date.now();
        save();
        setStatus('live');
        if (changed) emit();
        maybeSnapshot();
        return changed;
      })
      .catch(() => { setStatus('offline'); return false; });
  }

  function post(body) {
    if (typeof fetch !== 'function') return Promise.resolve(false);
    return fetch(BASE + TOPIC, {
      method: 'POST',
      // 用纯文本发，避免被当成 ntfy 的结构化 JSON 消息
      headers: { 'Content-Type': 'text/plain' },
      body: body
    }).then((r) => !!(r && r.ok)).catch(() => false);
  }

  // 整榜快照：中转只保留 12 小时的消息，靠快照把老成绩传下去
  function maybeSnapshot() {
    if (entries.length < 2) return;
    if (Date.now() - lastSnap < SNAP_MIN_MS) return;
    lastSnap = Date.now();
    const d = entries.slice(0, MAX).map((e) => [e.uid, e.name, e.score, e.level, e.ts]);
    post(JSON.stringify({ t: 's', d: d }));
  }

  // ---------- 发自己的成绩 ----------
  function publish(me, force) {
    const e = clean(me);
    if (!e) return false;
    const now = Date.now();
    if (!force && now - lastPub < PUB_MIN_MS) return false;
    const before = findIdx(e.uid) >= 0 ? entries[findIdx(e.uid)].score : -1;
    lastPub = now;
    mergeOne({ uid: e.uid, name: e.name, score: e.score, level: e.level, ts: now });
    save();
    if (before !== e.score) emit();
    post(JSON.stringify({ t: 'e', u: e.uid, n: e.name, s: e.score, l: e.level, ts: now }));
    return true;
  }

  // ---------- 实时流 ----------
  function startStream() {
    if (es || typeof global.EventSource === 'undefined') return;
    try {
      es = new global.EventSource(BASE + TOPIC + '/sse?since=' + Math.floor(Date.now() / 1000));
      es.onmessage = (ev) => {
        let j;
        try { j = JSON.parse(ev.data); } catch (e) { return; }
        if (!j || j.event !== 'message' || !j.message) return; // keepalive / open 事件
        if (consume(j.message)) { lastSync = Date.now(); save(); emit(); }
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

  global.Board = {
    open, close, publish, sync,
    list: () => entries.slice().sort(byScore),
    count: () => entries.length,
    status: () => status,
    statusText: statusText,
    onChange: (fn) => { if (typeof fn === 'function') listeners.push(fn); },
    offChange: (fn) => { listeners = listeners.filter((x) => x !== fn); },
    _topic: TOPIC
  };
})(window);
