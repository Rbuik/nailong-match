// cloud.js — 服务器账号（云数据库）
// 名字和密码存在服务端（PostgreSQL + bcrypt 哈希），登录时由服务器校验，
// 校验通过才下发这个账号的存档。换设备 / 清缓存 / 微信里重进都不会丢号。
//
// 接口（服务端 SECURITY DEFINER 函数，表本身不开放直读）：
//   nl_register(nick, pass, uid) -> { ok, token, nick, uid, slot }
//   nl_login(nick, pass)         -> { ok, token, nick, uid, slot }
//   nl_load(token)               -> { ok, nick, uid, slot }
//   nl_save(token, slot)         -> { ok }
// 暴露 window.Cloud
(function (global) {
  'use strict';

  const CFG = global.NL_CLOUD || null;
  const TOKEN_KEY = 'nl2:ctoken';      // 登录令牌（设备级）
  const SYNC_KEY = 'nl2:csync';        // 最后一次同步时间
  const PUSH_MIN_MS = 12e3;            // 两次上传最少间隔（省资源点）

  let cloud = null;
  let sdkOk = false;
  let lastReason = '';

  try {
    const ns = global.WorkBuddyCloud;
    if (ns && ns.createWorkBuddyCloud && CFG) {
      cloud = ns.createWorkBuddyCloud({
        endpoint: CFG.endpoint,
        oauthRelayBaseUrl: CFG.oauthRelayBaseUrl,
        publishableKey: CFG.publishableKey
      });
      sdkOk = !!(cloud && cloud.database);
    }
  } catch (e) {
    sdkOk = false;
  }

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

  // 只有发布域名（和服务端认可的来源）能调通；其余情况统一当成"没网"
  function call(fn, args) {
    if (!sdkOk) {
      return Promise.resolve({ ok: false, offline: true, reason: '云服务没加载出来' });
    }
    return cloud.database.rpc(fn, args)
      .then((res) => {
        const err = res && res.error;
        if (err) {
          lastReason = err.message || '网络异常';
          return { ok: false, offline: true, reason: lastReason };
        }
        const data = res && res.data;
        if (data && typeof data === 'object') return data;
        return { ok: false, offline: true, reason: '服务器返回异常' };
      })
      .catch((e) => {
        lastReason = (e && e.message) || '网络异常';
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
    lastSync: lastSync,
    setLastSync: setLastSync,
    config: CFG
  };
})(window);
