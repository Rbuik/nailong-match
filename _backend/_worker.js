// 奶龙消消乐 · 账号后端（Cloudflare Pages Functions，跑在 nailong-match.pages.dev/api/*）
// 与前端 js/cloud.js 一一对应：
//   POST /api/rpc/nl_register {p_nick,p_pass,p_uid} -> {ok,token,nick,uid,slot}
//   POST /api/rpc/nl_login    {p_nick,p_pass}       -> {ok,token,nick,uid,slot}
//   POST /api/rpc/nl_load     {p_token}             -> {ok,nick,uid,slot}
//   POST /api/rpc/nl_save     {p_token,p_slot}      -> {ok}
//   POST /api/rpc/nl_setpass  {p_token,p_new}       -> {ok}
// 其它路径全部交给静态资源。密码 PBKDF2-SHA256 加盐，明文不落库。

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

const ITER = 12000;          // PBKDF2 迭代（兼顾免费版 CPU 限额）
const TOKEN_DAYS = 365;      // 令牌有效期
const NICK_MAX = 12;
const PASS_MIN = 4;
const PASS_MAX = 24;

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS)
  });
}

function toHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

function randHex(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return toHex(b);
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

async function pbkdf2(pass, saltHex) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: ITER, hash: 'SHA-256' },
    key, 256
  );
  return toHex(new Uint8Array(bits));
}

async function makePass(pass) {
  const salt = randHex(16);
  const hash = await pbkdf2(pass, salt);
  return 'pbkdf2$' + ITER + '$' + salt + '$' + hash;
}

async function checkPass(pass, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = parseInt(parts[1], 10) || ITER;
  const salt = parts[2];
  const want = parts[3];
  let got;
  if (iter === ITER) {
    got = await pbkdf2(pass, salt);
  } else {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexToBytes(salt), iterations: iter, hash: 'SHA-256' }, key, 256);
    got = toHex(new Uint8Array(bits));
  }
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

function nickOk(nick) {
  if (!nick || nick.length > NICK_MAX) return false;
  return !/\s/.test(nick);
}

function passOk(pass) {
  if (!pass || pass.length < PASS_MIN || pass.length > PASS_MAX) return false;
  return !/\s/.test(pass);
}

function nickKey(nick) {
  return nick.trim().toLowerCase();
}

async function issueToken(env, accId) {
  const token = randHex(24);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token, acc_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, accId, now, now + TOKEN_DAYS * 864e5).run();
  return token;
}

async function accByToken(env, token) {
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT a.id, a.nick, a.slot, s.expires_at FROM sessions s JOIN accounts a ON a.id = s.acc_id WHERE s.token = ?'
  ).bind(token).first();
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    return null;
  }
  return row;
}

function parseSlot(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
}

// ---------- 各接口 ----------
async function doRegister(env, b) {
  const nick = String(b.p_nick || '').trim();
  const pass = String(b.p_pass || '');
  if (!nickOk(nick)) return json({ ok: false, reason: '名字要 1-12 个字，不能有空格' });
  if (!passOk(pass)) return json({ ok: false, reason: '密码要 4-24 位，不能有空格' });
  const key = nickKey(nick);
  const exist = await env.DB.prepare('SELECT id FROM accounts WHERE nick_key = ?').bind(key).first();
  if (exist) return json({ ok: false, reason: '这个名字已经被注册了，换个名字或直接登录' });

  const now = Date.now();
  const id = 'p' + randHex(7);
  await env.DB.prepare(
    'INSERT INTO accounts (id, nick_key, nick, pass, slot, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)'
  ).bind(id, key, nick, await makePass(pass), now, now).run();

  const token = await issueToken(env, id);
  return json({ ok: true, token: token, nick: nick, uid: id, slot: null });
}

async function doLogin(env, b) {
  const nick = String(b.p_nick || '').trim();
  const pass = String(b.p_pass || '');
  if (!nick || !pass) return json({ ok: false, reason: '名字或密码不对' });
  const row = await env.DB.prepare(
    'SELECT id, nick, pass, slot FROM accounts WHERE nick_key = ?'
  ).bind(nickKey(nick)).first();
  if (!row) return json({ ok: false, reason: '没有找到这个玩家' });
  if (!await checkPass(pass, row.pass)) return json({ ok: false, reason: '密码不对' });
  const token = await issueToken(env, row.id);
  return json({ ok: true, token: token, nick: row.nick, uid: row.id, slot: parseSlot(row.slot) });
}

async function doLoad(env, b) {
  const row = await accByToken(env, String(b.p_token || ''));
  if (!row) return json({ ok: false, reason: '登录已过期，请重新登录' });
  return json({ ok: true, nick: row.nick, uid: row.id, slot: parseSlot(row.slot) });
}

async function doSave(env, b) {
  const row = await accByToken(env, String(b.p_token || ''));
  if (!row) return json({ ok: false, reason: '登录已过期，请重新登录' });
  const slot = b.p_slot;
  if (!slot || typeof slot !== 'object' || !slot.keys) return json({ ok: false, reason: '存档格式不对' });
  const text = JSON.stringify(slot);
  if (text.length > 900000) return json({ ok: false, reason: '存档太大' });
  await env.DB.prepare('UPDATE accounts SET slot = ?, updated_at = ? WHERE id = ?')
    .bind(text, Date.now(), row.id).run();
  return json({ ok: true });
}

async function doSetPass(env, b) {
  const row = await accByToken(env, String(b.p_token || ''));
  if (!row) return json({ ok: false, reason: '登录已过期，请重新登录' });
  const np = String(b.p_new || '');
  if (!passOk(np)) return json({ ok: false, reason: '密码要 4-24 位，不能有空格' });
  await env.DB.prepare('UPDATE accounts SET pass = ?, updated_at = ? WHERE id = ?')
    .bind(await makePass(np), Date.now(), row.id).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api')) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const fn = url.pathname.replace(/^\/api\/?/, '').replace(/^rpc\//, '').replace(/^\//, '');

    if (request.method === 'GET') {
      if (fn === '' || fn === 'health') {
        let n = 0;
        try {
          const r = await env.DB.prepare('SELECT count(*) AS c FROM accounts').first();
          n = Number(r && r.c) || 0;
        } catch (e) {}
        return json({ ok: true, service: 'nailong-api', accounts: n });
      }
      return json({ ok: false, reason: '只接受 POST' }, 405);
    }

    let body = {};
    try { body = await request.json(); } catch (e) { body = {}; }

    switch (fn) {
      case 'nl_register': return doRegister(env, body);
      case 'nl_login':    return doLogin(env, body);
      case 'nl_load':     return doLoad(env, body);
      case 'nl_save':     return doSave(env, body);
      case 'nl_setpass':  return doSetPass(env, body);
      default:            return json({ ok: false, reason: '接口不存在' }, 404);
    }
  }
};
