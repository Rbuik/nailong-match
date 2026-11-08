// cloud.js — 服务器账号（Cloudflare 后端）
// 名字和密码存在服务器（Cloudflare D1 数据库，PBKDF2 加盐哈希），
// 登录时由服务器校验，校验通过才下发这个账号的存档。
// 换设备 / 清缓存 / 微信里重进都不会丢号。
//
// 接口（都在 <endpoint>/api/rpc/ 下）：
//   nl_register {p_nick,p_pass,p_uid} -> {ok, token, nick, uid, slot}
//   nl_login    {p_nick,p_pass}       -> {ok, token, nick, uid, slot}
//   nl_load     {p_token}             -> {ok, nick, uid, slot}
//   nl_save     {p_token,p_slot}      -> {ok}
//   nl_setpass  {p_token,p_new}       -> {ok}
//   nl_recover  {p_nick,p_uid,p_new}  -> {ok, token, nick, uid, slot}   忘记密码
//   nl_rename   {p_token,p_nick}      -> {ok}
//   nl_delete   {p_token}             -> {ok}        注销：服务器上整号删除
// 暴露 window.Cloud
(function (global) {
  'use strict';

  const CFG = global.NL_CLOUD || null;
  const TOKEN_KEY = 'nl2:ctoken';      // 登录令牌（设备级）
  const SYNC_KEY = 'nl2:csync';        // 最后一次同步时间
  const PUSH_MIN_MS = 12e3;            // 两次上传最少间隔
  const TIMEOUT_MS = 9000;             // 单次请求超时，超时就当没网

  const API = (CFG && CFG.endpoint) ? String(CFG.endpoint).replace(/\/+$/, '') + '/api/rpc/' : '';
  const sdkOk = !!API;

  let lastReason = '';

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, String(v));
    } catch (e) {}
    return null;
  }

  function token() { return ls(TOKEN_KEY) || ''; }
  function setToken(t) { ls(TOKEN_KEY, t || null); }
  function lastSync() { return Number(ls(SYNC_KEY) || 0) || 0; }
  function setLastSync(ts) { ls(SYNC_KEY, String(ts || Date.now())); }

  // 统一发请求：出任何问题都当成"没网"，静默降级成本机存档
  function call(fn, args) {
    if (!sdkOk) return Promise.resolve({ ok: false, offline: true, reason: '云服务没配置' });
    if (typeof fetch !== 'function') return Promise.resolve({ ok: false, offline: true, reason: '这个浏览器不支持云同步' });
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, TIMEOUT_MS) : null;
    let req;
    try {
      req = fetch(API + fn, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {}),
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (e) {
      if (timer) clearTimeout(timer);
      return Promise.resolve({ ok: false, offline: true, reason: '网络异常' });
    }
    return req.then((res) => {
      if (timer) clearTimeout(timer);
      if (!res.ok) { lastReason = '服务器忙（' + res.status + '）'; return { ok: false, offline: true, reason: lastReason }; }
      return res.json();
    }).then((data) => {
      if (!data || typeof data !== 'object') {
        return { ok: false, offline: true, reason: lastReason || '服务器返回异常' };
      }
      if (data.ok === false) lastReason = data.reason || '';
      return data;
    }).catch((e) => {
      if (timer) clearTimeout(timer);
      lastReason = (e && e.name === 'AbortError') ? '网络超时' : ((e && e.message) || '网络异常');
      return { ok: false, offline: true, reason: lastReason };
    });
  }

  function register(nick, pass, uid) {
    return call('nl_register', { p_nick: String(nick || ''), p_pass: String(pass || ''), p_uid: String(uid || '') })
      .then((r) => {
        if (r && r.ok && r.token) setToken(r.token);
        return r;
      });
  }

  function login(nick, pass) {
    return call('nl_login', { p_nick: String(nick || ''), p_pass: String(pass || '') })
      .then((r) => {
        if (r && r.ok && r.token) setToken(r.token);
        return r;
      });
  }

  function pull() {
    if (!token()) return Promise.resolve({ ok: false, offline: true, reason: '还没登录' });
    return call('nl_load', { p_token: token() }).then((r) => {
      if (r && r.ok === false && String(r.reason || '').indexOf('过期') >= 0) setToken(null);
      return r;
    });
  }

  let pushing = false;
  function push(slot, force) {
    if (!token() || !slot || !sdkOk) return Promise.resolve({ ok: false, offline: true });
    if (pushing) return Promise.resolve({ ok: false, busy: true });
    if (!force && Date.now() - lastSync() < PUSH_MIN_MS) return Promise.resolve({ ok: false, throttled: true });
    pushing = true;
    return call('nl_save', { p_token: token(), p_slot: slot })
      .then((r) => {
        pushing = false;
        if (r && r.ok) setLastSync(Date.now());
        else if (r && r.ok === false && String(r.reason || '').indexOf('过期') >= 0) setToken(null);
        return r;
      })
      .catch((e) => {
        pushing = false;
        return { ok: false, offline: true, reason: (e && e.message) || '网络异常' };
      });
  }

  function setPass(newPass) {
    if (!token()) return Promise.resolve({ ok: false, offline: true, reason: '还没登录' });
    return call('nl_setpass', { p_token: token(), p_new: String(newPass || '') })
      .then((r) => {
        if (r && r.ok === false && String(r.reason || '').indexOf('过期') >= 0) setToken(null);
        return r;
      });
  }

  // 改名字：账号名就是服务器上的昵称，改完排行榜 / 换设备登录都用新名字
  function rename(nick) {
    if (!token()) return Promise.resolve({ ok: false, offline: true, reason: '还没登录' });
    return call('nl_rename', { p_token: token(), p_nick: String(nick || '') })
      .then((r) => {
        if (r && r.ok === false && String(r.reason || '').indexOf('过期') >= 0) setToken(null);
        return r;
      });
  }

  // 忘记密码：名字 + 身份码（服务器上的账号 id）核验通过后重设密码，存档一起取回
  function recover(nick, uid, newPass) {
    if (!sdkOk) return Promise.resolve({ ok: false, offline: true, reason: '云服务没配置' });
    return call('nl_recover', {
      p_nick: String(nick || ''),
      p_uid: String(uid || ''),
      p_new: String(newPass || '')
    });
  }

  // 注销：把服务器上这个号整个删掉（账号行 + 令牌 + 存档）
  // 不删的话，玩家用同样的名字再登录，旧进度会被"找回来"
  function remove() {
    if (!token()) return Promise.resolve({ ok: true, gone: true });
    return call('nl_delete', { p_token: token() })
      .then((r) => {
        if (r && r.ok) setToken(null);
        return r;
      });
  }

  global.Cloud = {
    ready: () => sdkOk,
    signedIn: () => !!token(),
    token: token,
    setToken: setToken,
    signOut: () => { setToken(null); },
    register: register,
    login: login,
    pull: pull,
    push: push,
    setPass: setPass,
    recover: recover,
    rename: rename,
    remove: remove,
    lastSync: lastSync,
    setLastSync: setLastSync,
    config: CFG
  };
})(window);
