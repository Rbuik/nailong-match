// 奶龙消消乐 · 账号后端（Cloudflare Pages Functions，跑在 nailong-match.pages.dev/api/*）
// 与前端 js/cloud.js 一一对应：
//   POST /api/rpc/nl_register {p_nick,p_pass,p_uid} -> {ok,token,nick,uid,slot}
//   POST /api/rpc/nl_login    {p_nick,p_pass}       -> {ok,token,nick,uid,slot}
//   POST /api/rpc/nl_load     {p_token}             -> {ok,nick,uid,slot}
//   POST /api/rpc/nl_save     {p_token,p_slot}      -> {ok}
//   POST /api/rpc/nl_setpass  {p_token,p_new}       -> {ok}
//   POST /api/rpc/nl_rename   {p_token,p_nick}      -> {ok}
//   POST /api/rpc/nl_recover  {p_nick,p_uid,p_new}  -> {ok,token,nick,uid,slot}  忘记密码
//   POST /api/rpc/nl_delete   {p_token}             -> {ok}
//   POST /api/rpc/nl_users    {p_key}               -> {ok,users:[{uid,name,created}]}  后台名单
// 其它路径全部交给静态资源。密码 PBKDF2-SHA256 加盐，明文不落库。

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

const ITER = 12000;          // PBKDF2 迭代（兼顾免费版 CPU 限额）
const TOKEN_DAYS = 365;      // 令牌有效期
const NICK_MAX = 8;
const PASS_MIN = 4;
const PASS_MAX = 24;
const USERS_KEY = 'nl-admin-7k2v';   // 后台名单的轻口令（只防随手扫接口，名单本身不含任何私密信息）

// 省份代码（和前端 PROVINCES 里的代码一致）：注册 / 登录 / 存档时由客户端带上来。
// 省只存在账号上，后台名单才显示得出来；以前只在发成绩时随榜单消息走，
// 于是「建了号但从没发过成绩」的玩家（林夕 / 来一吨）在后台就是「未定位」。
function pvOk(v) { return /^[a-z]{2,20}$/.test(String(v || '')); }

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
  // 名字区分大小写：Yone / yone 是两个不同的号（只去掉首尾空格）
  return nick.trim();
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
    'SELECT a.id, a.nick, a.slot, a.created_at, s.expires_at FROM sessions s JOIN accounts a ON a.id = s.acc_id WHERE s.token = ?'
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
  if (!nickOk(nick)) return json({ ok: false, reason: '名字要 1-8 个字符（一个字母或符号都算一个），不能有空格' });
  if (!passOk(pass)) return json({ ok: false, reason: '密码要 4-24 位，不能有空格' });
  const key = nickKey(nick);
  const exist = await env.DB.prepare('SELECT id FROM accounts WHERE nick_key = ?').bind(key).first();
  if (exist) return json({ ok: false, reason: '这个名字已经被注册了，换个名字或直接登录' });

  const now = Date.now();
  const id = 'p' + randHex(7);
  const pv = pvOk(b.p_pv) ? String(b.p_pv).toLowerCase() : null;
  await env.DB.prepare(
    'INSERT INTO accounts (id, nick_key, nick, pass, slot, pv, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)'
  ).bind(id, key, nick, await makePass(pass), pv, now, now).run();

  const token = await issueToken(env, id);
  return json({ ok: true, token: token, nick: nick, uid: id, created: now, slot: null });
}

async function doLogin(env, b) {
  const nick = String(b.p_nick || '').trim();
  const pass = String(b.p_pass || '');
  if (!nick || !pass) return json({ ok: false, reason: '名字或密码不对' });
  const row = await env.DB.prepare(
    'SELECT id, nick, pass, slot, pv, created_at FROM accounts WHERE nick_key = ?'
  ).bind(nickKey(nick)).first();
  // 登录兜底：精确匹配不到时，允许大小写不同（只有一个候选才认）——
  // 老玩家当年注册写的是「Yone」，今天顺手输「yone」不该直接查无此人
  let acc = row;
  if (!acc) {
    const rs = await env.DB.prepare(
      'SELECT id, nick, pass, slot, pv, created_at FROM accounts WHERE lower(nick_key) = lower(?)'
    ).bind(nickKey(nick)).all();
    const hits = (rs && rs.results) || [];
    if (hits.length === 1) acc = hits[0];
  }
  if (!acc) return json({ ok: false, reason: '没有找到这个玩家' });
  if (!await checkPass(pass, acc.pass)) return json({ ok: false, reason: '密码不对' });
  // 这次登录带了定位、和库里不一样就顺手更新（老账号补上省，后台名单才显示得出）
  const pv = pvOk(b.p_pv) ? String(b.p_pv).toLowerCase() : '';
  if (pv && pv !== String(acc.pv || '')) {
    await env.DB.prepare('UPDATE accounts SET pv = ? WHERE id = ?').bind(pv, acc.id).run();
  }
  const token = await issueToken(env, acc.id);
  // created：账号真实的注册时间（客户端换设备建本地账号时要用它，不能当成「今天刚注册」）
  return json({ ok: true, token: token, nick: acc.nick, uid: acc.id,
    created: Number(acc.created_at) || 0, pv: pv || String(acc.pv || ''), slot: parseSlot(acc.slot) });
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
  const pv = pvOk(b.p_pv) ? String(b.p_pv).toLowerCase() : null;
  await env.DB.prepare('UPDATE accounts SET slot = ?, pv = COALESCE(?, pv), updated_at = ? WHERE id = ?')
    .bind(text, pv, Date.now(), row.id).run();
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

// 改昵称：账号名就是榜单 / 登录用的名字，全服唯一（区分大小写）
async function doRename(env, b) {
  const row = await accByToken(env, String(b.p_token || ''));
  if (!row) return json({ ok: false, reason: '登录已过期，请重新登录' });
  const nick = String(b.p_nick || '').trim();
  if (!nickOk(nick)) return json({ ok: false, reason: '名字要 1-8 个字符（一个字母或符号都算一个），不能有空格' });
  const key = nickKey(nick);
  const exist = await env.DB.prepare('SELECT id FROM accounts WHERE nick_key = ?').bind(key).first();
  if (exist && exist.id !== row.id) return json({ ok: false, reason: '这个名字已经被别人用了' });
  await env.DB.prepare('UPDATE accounts SET nick = ?, nick_key = ?, updated_at = ? WHERE id = ?')
    .bind(nick, key, Date.now(), row.id).run();
  return json({ ok: true, nick: nick });
}

// 忘记密码：用「名字 + 身份码」核验身份后重设密码，并把服务器上的存档一起取回。
// 身份码就是账号 id（p 开头），只在玩家自己的「设置 → 账号安全」里能看到，算第二凭证；
// 没有邮箱 / 手机可发验证码，这是唯一不靠旧密码的找回方式。
// 重设成功后删掉这个账号的全部旧令牌：别的地方要重新登录（防止密码泄露后被顶号）。
async function doRecover(env, b) {
  const nick = String(b.p_nick || '').trim();
  const uid = String(b.p_uid || '').trim();
  const np = String(b.p_new || '');
  if (!nick) return json({ ok: false, reason: '请填写名字' });
  if (!passOk(np)) return json({ ok: false, reason: '密码要 4-24 位，不能有空格' });
  if (!/^p[0-9a-z]{6,}$/i.test(uid)) return json({ ok: false, reason: '身份码格式不对，是 p 开头的一串字母数字' });

  const key = nickKey(nick);
  let row = await env.DB.prepare('SELECT id, nick, slot, created_at FROM accounts WHERE nick_key = ?').bind(key).first();
  if (!row) {
    // 大小写不同的老名字：只有一个候选才认（和登录的兜底一致）
    const rs = await env.DB.prepare('SELECT id, nick, slot, created_at FROM accounts WHERE lower(nick_key) = lower(?)')
      .bind(key).all();
    const hits = (rs && rs.results) || [];
    if (hits.length === 1) row = hits[0];
  }
  if (!row) return json({ ok: false, reason: '服务器上没有这个名字，检查一下有没有打错' });
  if (String(row.id).toLowerCase() !== uid.toLowerCase()) {
    return json({ ok: false, reason: '名字和身份码对不上，检查一下身份码' });
  }

  await env.DB.prepare('UPDATE accounts SET pass = ?, updated_at = ? WHERE id = ?')
    .bind(await makePass(np), Date.now(), row.id).run();
  await env.DB.prepare('DELETE FROM sessions WHERE acc_id = ?').bind(row.id).run();
  const token = await issueToken(env, row.id);
  return json({ ok: true, token: token, nick: row.nick, uid: row.id,
    created: Number(row.created_at) || 0, slot: parseSlot(row.slot) });
}

// 注销账号：把这个号在服务器上的存档、令牌、账号行一起删掉。
// 必须真删：否则玩家注销后用同样的名字再登录，旧进度会被云端"找回来"。
async function doDelete(env, b) {
  const row = await accByToken(env, String(b.p_token || ''));
  if (!row) return json({ ok: true, gone: true });   // 本来就没有，也算删掉了
  await env.DB.prepare('DELETE FROM sessions WHERE acc_id = ?').bind(row.id).run();
  await env.DB.prepare('DELETE FROM accounts WHERE id = ?').bind(row.id).run();
  return json({ ok: true, uid: row.id });
}

// 后台用户名单：服务器上真实建过档的账号（只回名字 / 身份号码 / 注册时间，
// 不含密码和存档）。后台隐藏页的「全服」原来只合并「本机账号表 + 共享榜」，
// 于是像林夕这种「在服务器建了号、但从没往榜单发过成绩、也不在这台设备上」
// 的玩家就查不到，这里补一个只读名单把它补齐。
async function doUsers(env, b) {
  if (String(b.p_key || '') !== USERS_KEY) return json({ ok: false, reason: '没权限' }, 403);
  const rs = await env.DB.prepare('SELECT id, nick, pv, created_at FROM accounts ORDER BY created_at').all();
  const users = ((rs && rs.results) || []).map((r) => ({
    uid: String(r.id || ''),
    name: String(r.nick || ''),
    pv: String(r.pv || ''),
    created: Number(r.created_at) || 0
  })).filter((u) => u.uid && u.name);
  // 已注销 / 隐藏的名字：客户端的「玩家名单」会把它们过滤掉
  // （账号行已删，但各设备的本机缓存 / 榜单缓存里可能还留着名字）
  let hidden = [];
  try {
    const hr = await env.DB.prepare('SELECT nick_key FROM hidden_names').all();
    hidden = ((hr && hr.results) || []).map((r) => String(r.nick_key || ''))
      .filter((n) => n).map((n) => n.toLowerCase());
  } catch (e) {}   // 表还没建（老库）就不下发
  return json({ ok: true, users: users, hidden: hidden });
}

// 定位放在客户端做（ipip 国内库最准）；服务端问腾讯只会拿到 Cloudflare 机房位置，所以不在这做。
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
      case 'nl_rename':   return doRename(env, body);
      case 'nl_recover':  return doRecover(env, body);
      case 'nl_delete':   return doDelete(env, body);
      case 'nl_users':    return doUsers(env, body);
      default:            return json({ ok: false, reason: '接口不存在' }, 404);
    }
  }
};
