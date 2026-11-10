// test-smoke.js — 无浏览器冒烟测试（DOM 桩）
// 用法: node test-smoke.js
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// ---------- 通用魔法对象 ----------
function makeEl(id) {
  const listeners = {};
  const el = {
    id: id || '',
    style: { setProperty() {}, removeProperty() {}, get display() { return this._d || ''; }, set display(v) { if (id === 'auth-menu' && v === 'none') { console.log('CLOSED-STACK-START'); console.log(new Error().stack); console.log('CLOSED-STACK-END'); } this._d = v; } },
    dataset: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      toggle(c, f) { if (f === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (f) this._s.add(c); else this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    children: [],
    childNodes: [],
    _attrs: {},
    getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    removeAttribute(k) { delete this._attrs[k]; },
    firstChild: null,
    value: '0.5',
    textContent: '',
    width: 320,
    height: 320,
    appendChild(c) { this.children.push(c); this.childNodes.push(c); this.lastChild = c; },
    remove() {},
    querySelector() { return makeEl('qs'); },
    querySelectorAll() { return []; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatch(t, ev) { (listeners[t] || []).forEach((fn) => fn(ev || { target: el, preventDefault() {}, stopPropagation() {} })); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 320, height: 320, right: 320, bottom: 320 }; },
    getContext() { return magicCtx; },
    closest() { return null; }
  };
  Object.defineProperty(el, 'lastElementChild', { get() { return this.children[this.children.length - 1] || null; } });
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return html; },
    // 真实 DOM 里 innerHTML 赋值会清空子节点，桩也照做
    set(v) { html = v; this.children.length = 0; this.childNodes.length = 0; }
  });
  return el;
}

const noop = function () {};
const magicCtx = new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return makeEl('canvas');
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'measureText') return () => ({ width: 10 });
    if (typeof k === 'symbol') return undefined;
    if (!(k in t)) return noop;
    return t[k];
  },
  set(t, k, v) { t[k] = v; return true; }
});

// ---------- localStorage 桩 ----------
const lsMap = new Map();
const localStorageStub = {
  getItem: (k) => (lsMap.has(k) ? lsMap.get(k) : null),
  setItem: (k, v) => lsMap.set(k, String(v)),
  removeItem: (k) => lsMap.delete(k),
  clear: () => lsMap.clear(),
  get length() { return lsMap.size; },
  key: (i) => { const ks = Array.from(lsMap.keys()); return i < ks.length ? ks[i] : null; }
};
// ---------- sessionStorage 桩（刷新后留在原页面用） ----------
const ssMap = new Map();
const sessionStorageStub = {
  getItem: (k) => (ssMap.has(k) ? ssMap.get(k) : null),
  setItem: (k, v) => ssMap.set(k, String(v)),
  removeItem: (k) => ssMap.delete(k),
  clear: () => ssMap.clear()
};
// 预置：已有 2 个洗牌道具、第 1 关 3 星（解锁到第 2 关）
lsMap.set('nl2:wallet', JSON.stringify({ coins: 500, items: { shuffle: 2, undo: 1 } }));
lsMap.set('nl2:progress', JSON.stringify({ 1: { score: 1200, stars: 3 } }));
// 预置昵称：默认「奶龙玩家」会被改名闸拦住，测试里先改好
lsMap.set('nl2:mnick', JSON.stringify('测试奶龙'));

// ---------- 元素注册表 ----------
const els = {};
function getEl(id) { if (!els[id]) els[id] = makeEl(id); return els[id]; }
// 预生成 querySelectorAll('.overlay') 用到的元素（点背景回上一层是绑在所有面板上的）
['main-menu', 'home-menu', 'admin-menu', 'admin-user-list', 'prov-user-list', 'rules-menu',
  'features-menu', 'play-rules-menu', 'mail-menu', 'mail-view', 'settings-menu',
  'music-settings-menu', 'account-menu', 'backup-menu', 'backup-import-menu', 'password-menu',
  'save-menu',
  'switch-menu', 'volume-menu', 'custom-music-menu', 'music-history-menu',
  'playlist-menu', 'music-library-menu', 'rename-menu', 'tasks-menu', 'shop-menu', 'history-menu',
  'backpack-menu', 'pause-menu', 'logout-confirm', 'logout-confirm2', 'level-clear', 'game-over',
  'daily-done', 'game-complete', 'chapters-menu', 'story-menu', 'modes-menu', 'mode-over',
  'daily-menu', 'daily-lb',
  'achievements-menu', 'ach-detail', 'collection-menu', 'welfare-menu', 'leaderboard-menu',
  'lb-view', 'nick-menu', 'revive-menu', 'auth-menu', 'auth-form', 'auth-forgot', 'fix-menu', 'cloud-menu',
  'buy-confirm', 'use-confirm', 'reset-bgm-confirm', 'mail-delall-confirm', 'makeup-menu', 'coin-menu'
].forEach((id) => getEl(id));

const documentStub = {
  readyState: 'complete',
  getElementById: getEl,
  createElement: (tag) => makeEl(tag),
  querySelectorAll: (sel) => (sel === '.overlay' ? Object.keys(els).map(getEl) : []),
  addEventListener: noop,
  documentElement: { style: { setProperty() {} } },
  body: makeEl('body')
};

let reloaded = false;
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  performance,
  btoa,
  atob,
  localStorage: localStorageStub,
  sessionStorage: sessionStorageStub,
  document: documentStub,
  navigator: { userAgent: 'node' },
  // 模拟正式站点（canPublish 只放行部署站点；fetch 已被桩拦住，不会真发网络请求）
  location: {
    protocol: 'https:',
    hostname: 'rbuik.github.io',
    port: '',
    reload: () => { reloaded = true; }
  },
  requestAnimationFrame: noop,
  Image: class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } },
  Audio: class { constructor() {} play() {} },
  fetch: () => Promise.reject(new Error('no fetch in test')),
  confirm: () => true,
  addEventListener: noop,
  removeEventListener: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop }),
  window: null
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// ---------- 假云服务（只在最后「注销要连服务器一起删」的用例里打开） ----------
let curToken = '';
const fakeServer = {
  rows: {},          // nickKey -> { uid, nick, pass, slot }
  tokens: {},        // token -> nickKey
  seq: 0,
  on: false,
  reset() { this.rows = {}; this.tokens = {}; this.seq = 0; curToken = ''; },
  byNick(n) {
    // 和真服务器一致：先精确匹配；不行再大小写不敏感找一个（唯一才认）
    const t = String(n || '').trim();
    if (this.rows[t]) return this.rows[t];
    const k = t.toLowerCase();
    const hits = Object.keys(this.rows).filter((x) => x.toLowerCase() === k);
    return hits.length === 1 ? this.rows[hits[0]] : null;
  },
  issue(k) { const t = 'tk' + (++this.seq); this.tokens[t] = k; return t; },
  rowOf(t) { const k = this.tokens[t]; return k ? this.rows[k] || null : null; }
};
sandbox.__cloudOn = false;
sandbox.Cloud = {
  ready: () => !!sandbox.__cloudOn,
  signedIn: () => !!curToken,
  token: () => curToken,
  setToken: (t) => { curToken = t || ''; },
  signOut: () => { curToken = ''; },
  register: (nick, pass, uid) => {
    const k = String(nick || '').trim();
    if (fakeServer.rows[k]) return Promise.resolve({ ok: false, reason: '这个名字已经被注册了' });
    const row = { uid: 'srv' + (++fakeServer.seq), nick: nick, pass: pass, slot: null };
    fakeServer.rows[k] = row;
    return Promise.resolve({ ok: true, token: fakeServer.issue(k), uid: row.uid, nick: row.nick, slot: null });
  },
  login: (nick, pass) => {
    const row = fakeServer.byNick(nick);
    if (!row || row.pass !== pass) return Promise.resolve({ ok: false, reason: '没有找到这个玩家' });
    return Promise.resolve({ ok: true, token: fakeServer.issue(String(nick).trim()), uid: row.uid, nick: row.nick, slot: row.slot });
  },
  pull: () => {
    const row = fakeServer.rowOf(curToken);
    if (!row) return Promise.resolve({ ok: false, reason: '登录已过期' });
    return Promise.resolve({ ok: true, nick: row.nick, uid: row.uid, slot: row.slot });
  },
  push: (slot) => {
    const row = fakeServer.rowOf(curToken);
    if (!row) return Promise.resolve({ ok: false, reason: '登录已过期' });
    row.slot = slot;
    return Promise.resolve({ ok: true });
  },
  remove: () => {
    const k = fakeServer.tokens[curToken];
    if (k && fakeServer.rows[k]) delete fakeServer.rows[k];
    return Promise.resolve({ ok: true });
  },
  setPass: () => Promise.resolve({ ok: true }),
  rename: () => Promise.resolve({ ok: true }),
  lastSync: () => 0,
  setLastSync: () => {}
};

// ---------- 按顺序加载脚本（game.js 最后：它一加载就 boot） ----------
const scripts = ['rng.js', 'storage.js', 'audio.js', 'effects.js', 'specials.js', 'goals.js', 'tasks.js', 'input.js', 'music.js', 'meta.js', 'mail.js', 'account.js', 'board.js'];
function loadScript(name) {
  const code = fs.readFileSync(path.join(__dirname, 'js', name), 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: name });
  } catch (e) {
    console.error('LOAD FAIL', name, e.message);
    process.exit(1);
  }
}
scripts.forEach(loadScript);

// 预置账号：把上面预置的存档认领成「测试奶龙」，并设好密码（这样 boot 直接进主页）
sandbox.Account.ensure();
sandbox.Account.setPassword('', '123456');
if (!sandbox.Account.loggedIn()) { console.error('预置账号失败'); process.exit(1); }

loadScript('game.js');

// ---------- 等待 boot 完成再跑断言 ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
function check(name, ok) {
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name);
  if (!ok) failed++;
}

(async () => {
  await sleep(50); // boot() 里的微任务（fetch 失败走 fallback）

  const $ = getEl;

  // 1. boot 完成，主页显示
  check('boot 完成：主页 display flex', $('main-menu').style.display === 'flex');

  // 2. 未解锁关卡：先打开关卡记录，点第 5 关（锁定）
  $('btn-history').dispatch('click');
  check('关卡记录打开', $('history-menu').style.display === 'flex');
  const rows = $('history-list').children;
  check('关卡记录只列出已解锁 + 1 个未解锁（共 3 行）', rows.length === 3);
  const lockedRow = rows[2]; // 第 3 关（唯一显示的未解锁关）
  lockedRow.dispatch('click');
  check('点击未解锁关卡不跳转（记录页未关闭）', $('history-menu').style.display === 'flex');
  check('未解锁提示 toast', $('toast').textContent.includes('未解锁'));
  check('未解锁的关卡分数位直接空着（不是「未开始」，也不是 0 分）',
    String(lockedRow.innerHTML).indexOf('未开始') < 0 &&
    String(lockedRow.innerHTML).indexOf('未解锁') >= 0 &&
    String(lockedRow.innerHTML).indexOf('not-start') < 0 &&
    !/>0<\/span>/.test(String(lockedRow.innerHTML)));
  check('已解锁但还没打的关卡才显示灰色「未开始」',
    String(rows[1].innerHTML).indexOf('not-start') >= 0 &&
    String(rows[1].innerHTML).indexOf('未开始') >= 0);
  // 已解锁的第 1 关可以点
  rows[0].dispatch('click');
  check('点击已解锁关卡回到主页', $('main-menu').style.display === 'flex');

  // 3. 背包：预置 2 洗牌 + 1 撤回（渲染走 DOM API，检查子节点）
  $('btn-backpack-home').dispatch('click');
  check('背包面板打开', $('backpack-menu').style.display === 'flex');
  const packRows = $('backpack-list').children;
  check('背包列出 2 种道具', packRows.length === 2);
  check('背包显示洗牌道具 x2', packRows.some && packRows.some((r) => r.innerHTML.includes('洗牌') && r.innerHTML.includes('x2')));
  check('背包显示撤回道具 x1', packRows.some && packRows.some((r) => r.innerHTML.includes('撤回') && r.innerHTML.includes('x1')));
  $('backpack-menu').dispatch('click');
  check('背包关闭', $('backpack-menu').style.display === 'none');

  // 4. 注销账号：入口搬到「设置 → 账号安全」（切换账号下面），主页换成邮箱键
  const htmlSrc0 = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(__dirname, 'css', 'themes.css'), 'utf8') +
    fs.readFileSync(path.join(__dirname, 'css', 'style.css'), 'utf8');
  const jsSrc = fs.readFileSync(path.join(__dirname, 'js', 'game.js'), 'utf8') +
    fs.readFileSync(path.join(__dirname, 'js', 'music.js'), 'utf8') +
    fs.readFileSync(path.join(__dirname, 'js', 'account.js'), 'utf8');
  check('主页不再有注销按钮，右下角是 📮 邮箱键',
    htmlSrc0.includes('id="btn-mail"') && htmlSrc0.indexOf('id="btn-mail"') < htmlSrc0.indexOf('id="home-menu"'));
  check('注销账号在账号安全面板里、切换账号下面（面板没有返回键）',
    htmlSrc0.indexOf('id="btn-logout"') > htmlSrc0.indexOf('id="btn-goto-switch"') &&
    !htmlSrc0.includes('id="btn-close-account"'));
  check('注销确认文案说明会删除全部数据', htmlSrc0.includes('全部数据') && htmlSrc0.includes('不可恢复'));
  // 4b. 邮箱键放在 🏠 下面（左上角竖排，📮 图标）
  check('邮箱键在 🏠 下面、用 📮、带未读角标',
    htmlSrc0.indexOf('class="corner-col"') < htmlSrc0.indexOf('id="btn-mail"') &&
    htmlSrc0.indexOf('id="btn-home-menu"') < htmlSrc0.indexOf('id="btn-mail"') &&
    htmlSrc0.indexOf('id="btn-mail"') < htmlSrc0.indexOf('id="btn-rules"') &&
    /id="btn-mail"[^>]*>\s*<span class="icon">📮<\/span>/.test(htmlSrc0));
  check('主页底部不再有邮箱按钮', !htmlSrc0.includes('class="mail-ico"'));

  // 4c. 后台分层：一级「点击数量 / 全服用户」
  check('后台一级有「点击数量」和「全服用户」',
    htmlSrc0.includes('id="btn-admin-hits"') && htmlSrc0.includes('id="btn-admin-users"') &&
    htmlSrc0.indexOf('id="btn-admin-hits"') < htmlSrc0.indexOf('id="admin-page-hits"'));
  check('「点击数量」页还是原来的后台内容（全网 / 本机）',
    htmlSrc0.indexOf('id="admin-page-hits"') > 0 && htmlSrc0.includes('admin-global-sec') &&
    htmlSrc0.includes('id="admin-visits"'));
  check('「全服用户」页有用户数量 / 省份数量',
    htmlSrc0.indexOf('id="admin-page-users"') > 0 && htmlSrc0.includes('id="admin-users"') &&
    htmlSrc0.includes('id="admin-provs"'));
  check('全服用户页没有说明文字、也没有直接进省份统计的按钮',
    !htmlSrc0.includes('榜上有成绩的玩家') && !htmlSrc0.includes('btn-admin-users-to-stats'));
  check('省份统计入口回到隐藏手势（后台标题 + 全网同时按住）',
    htmlSrc0.includes('id="admin-title"'));
  $('admin-menu').style.display = 'flex';
  $('btn-admin-hits').dispatch('click');
  check('点「点击数量」进二级页', $('admin-page-hits').style.display === 'flex' && $('admin-nav').style.display === 'none');
  $('admin-menu').dispatch('click');
  check('「点击数量」返回一级', $('admin-page-hits').style.display === 'none' && $('admin-nav').style.display === 'flex');
  $('btn-admin-users').dispatch('click');
  check('点「全服用户」进二级页', $('admin-page-users').style.display === 'flex' && $('admin-nav').style.display === 'none');
  check('全服用户页把用户数 / 省份数填上了',
    !!$('admin-users').textContent && !!$('admin-provs').textContent);
  $('admin-menu').dispatch('click');
  check('「全服用户」返回一级', $('admin-page-users').style.display === 'none' && $('admin-nav').style.display === 'flex');
  $('admin-menu').style.display = 'none';

  // 4d. 全服用户口径：有名字 + 有密码的账号才算（不在榜上也算），省份按账号所在省
  const realBoardList = sandbox.Board.list;
  const realNet = lsMap.get('nl2:net');
  sandbox.Board.list = () => [];                 // 先把榜清空，单看「本机账号」
  sandbox.Store.patchNet({ geo: { region: '四川省', city: '成都市', country: '中国' } });
  const namedWithPass = () => sandbox.Account.list().filter((a) => a.name && a.pass).length;
  let su = sandbox.__nl_test.serverUsers();
  check('用户数量 = 本机有名字有密码的账号数（一个成绩都没发也算）',
    su.users === namedWithPass() && su.users >= 1);
  check('省份数量 = 账号所在的省（本机四川 → 1 个省）', su.provs === 1);

  // 没密码 / 没名字的账号都不算用户
  const accArr = JSON.parse(lsMap.get('nl2:accounts'));
  accArr.push({ id: 'utest-nopass', name: '没密码的号', pass: '', created: Date.now() });
  lsMap.set('nl2:accounts', JSON.stringify(accArr));
  check('没密码的账号不算用户', sandbox.__nl_test.serverUsers().users === su.users);
  const accArr2 = JSON.parse(lsMap.get('nl2:accounts'));
  accArr2[accArr2.length - 1].pass = 'v1$x$y';
  lsMap.set('nl2:accounts', JSON.stringify(accArr2));
  check('补上密码就算一个用户（还是没上榜）', sandbox.__nl_test.serverUsers().users === su.users + 1);
  const accArr3 = JSON.parse(lsMap.get('nl2:accounts'));
  accArr3[accArr3.length - 1].name = '';
  lsMap.set('nl2:accounts', JSON.stringify(accArr3));
  check('名字空了的账号不算用户', sandbox.__nl_test.serverUsers().users === su.users);

  // 榜上别的省的玩家：算一个用户、省份 +1（同名不重复算）
  sandbox.Board.list = () => [
    { uid: 'x-other', name: '外省玩家', score: 10, level: 1, ts: 1, pv: 'guangdong' },
    { uid: 'x-dup', name: (sandbox.Account.current() || {}).name, score: 5, level: 1, ts: 1, pv: 'sichuan' }
  ];
  const su2 = sandbox.__nl_test.serverUsers();
  check('榜上别的玩家算用户，和本机同名的只算一次', su2.users === su.users + 1);
  check('外省玩家的省份也算进去（四川 + 广东 = 2 个省）', su2.provs === 2);

  check('后台面板显示的就是这份数', (() => {
    $('admin-page-users').style.display = 'flex';
    sandbox.__nl_test.renderAdminUsers();
    const r = sandbox.__nl_test.serverUsers();
    return String($('admin-users').textContent) === String(r.users) &&
      String($('admin-provs').textContent) === String(r.provs);
  })());
  $('admin-page-users').style.display = 'none';

  // 4e. 后台「全服」页：板块标题改名 + 长按弹出的全服用户名单（可按省筛）
  check('后台一级入口还是「全服用户」', htmlSrc0.includes('id="btn-admin-users">👥 全服用户<'));
  check('二级页板块标题改成「全服」', (() => {
    const at = htmlSrc0.indexOf('id="admin-user-sec-title"');
    if (at < 0) return false;
    const seg = htmlSrc0.slice(at, at + 60);
    return seg.indexOf('全服') >= 0 && seg.indexOf('全服用户') < 0;
  })());
  const ulRows = sandbox.__nl_test.userList();
  check('名单 = 本机账号 + 榜上玩家（和用户数量同一口径）', ulRows.length === su2.users);
  check('名单带所在省', (ulRows.filter((u) => u.name === '外省玩家')[0] || {}).prov === 'guangdong');
  sandbox.__nl_test.openUserList();
  check('名单页打开、标题是「玩家 · 全服」', $('admin-user-list').style.display === 'flex' &&
    String($('admin-ul-title').textContent).indexOf('玩家 · 全服') === 0);
  check('名单列出全部用户', $('admin-ul-list').children.length === su2.users);
  check('名单按总分从高到低排（10 分外省玩家在最前）', (() => {
    const html = String($('admin-ul-list').children[0].children[0].innerHTML);
    return html.indexOf('外省玩家') >= 0;
  })());
  check('分数在省份左边、两列都有值', (() => {
    const html = String($('admin-ul-list').children[0].children[0].innerHTML);
    return html.indexOf('ul-score') >= 0 && html.indexOf('ul-score') < html.indexOf('ul-prov') &&
      html.indexOf('>10<') >= 0;
  })());
  $('admin-ul-swap').dispatch('click');
  check('⇄ 弹出「全服 + 每个省」的选择', $('admin-ul-picker').style.display === 'grid' &&
    $('admin-ul-picker').children.length >= 30 &&
    String($('admin-ul-picker').children[0].textContent) === '全服');
  sandbox.__nl_test.setUserListProv('guangdong');
  check('筛到广东省只剩外省玩家', $('admin-ul-list').children.length === 1 &&
    String($('admin-ul-list').children[0].children[0].innerHTML).indexOf('外省玩家') >= 0);
  // 选了具体省份：省份列去掉，行改成和排行榜一样的 col4（星星 / 分数同一条线）
  check('筛到具体省份：省份列去掉，行用排行榜同款 col4 排列', (() => {
    const inner = $('admin-ul-list').children[0].children[0];
    return inner.className === 'lb-swipe col4' && inner.innerHTML.indexOf('ul-prov') < 0 &&
      inner.innerHTML.indexOf('ul-score') >= 0 && inner.innerHTML.indexOf('lb-stars') >= 0;
  })());
  sandbox.__nl_test.setUserListProv('');
  check('切回全服又全部列出（省份列回来，还是 col5）', $('admin-ul-list').children.length === su2.users &&
    $('admin-ul-list').children[0].children[0].className === 'lb-swipe col5' &&
    String($('admin-ul-list').children[0].children[0].innerHTML).indexOf('ul-prov') >= 0);
  check('切回全服又全部列出', $('admin-ul-list').children.length === su2.users);
  const ulSearch = $('admin-ul-search');
  ulSearch.value = '外省';
  ulSearch.dispatch('input');
  check('搜索只筛当前范围里的玩家', $('admin-ul-list').children.length === 1 &&
    String($('admin-ul-list').children[0].children[0].innerHTML).indexOf('外省玩家') >= 0);
  ulSearch.value = '查不到的名字';
  ulSearch.dispatch('input');
  check('搜不到时给空提示', $('admin-ul-list').children.length === 1 &&
    String($('admin-ul-list').children[0].textContent).indexOf('没有找到') >= 0);
  ulSearch.value = '';
  ulSearch.dispatch('input');
  check('清空搜索恢复全部', $('admin-ul-list').children.length === su2.users);

  // 4e-2. 只在服务器建了档、既不在本机也没上过榜的号（林夕）也要进后台名单
  sandbox.__nl_test.setServerAccs([{ uid: 'pLinxiTest01', name: '林夕', created: 0 }]);
  check('服务器账号并进「用户数量」', sandbox.__nl_test.serverUsers().users === su2.users + 1);
  const ulRows2 = sandbox.__nl_test.userList();
  const linxi = ulRows2.filter((u) => u.name === '林夕')[0];
  check('服务器账号进了名单（省份未知、0 分）', !!linxi && linxi.prov === '' && linxi.score === 0);
  sandbox.__nl_test.renderUserList();
  const ulHtml = Array.from($('admin-ul-list').children).map((r) => String(r.children[0].innerHTML));
  const linxiAt = ulHtml.findIndex((h) => h.indexOf('林夕') >= 0);
  check('名单里画出服务器账号（分数 —、省份未定位）', linxiAt >= 0 &&
    ulHtml[linxiAt].indexOf('未定位') >= 0 && ulHtml[linxiAt].indexOf('—') >= 0);
  check('服务器账号灰显、排在所有有分玩家后面', linxiAt === ulHtml.length - 1 &&
    $('admin-ul-list').children[linxiAt].className.indexOf('none') >= 0);
  check('标题人数跟着算上服务器账号', String($('admin-ul-title').textContent)
    .indexOf('（' + (su2.users + 1) + '）') >= 0);
  // 服务器账号带定位（注册/登录/存档时上传的省）就直接显示省，不再「未定位」
  sandbox.__nl_test.setServerAccs([{ uid: 'pLinxiTest01', name: '林夕', pv: 'sichuan', created: 0 }]);
  sandbox.__nl_test.renderUserList();
  check('服务器账号有定位时显示省份', (() => {
    const rows = Array.from($('admin-ul-list').children);
    const hit = rows.filter((r) => String(r.children[0].innerHTML).indexOf('林夕') >= 0)[0];
    return !!hit && String(hit.children[0].innerHTML).indexOf('四川') >= 0 &&
      String(hit.children[0].innerHTML).indexOf('未定位') < 0;
  })());
  // 4e-3. 服务器下发的「已注销 / 隐藏」名字（hix / i）：名单与用户数量都不再出现
  sandbox.__nl_test.setServerAccs(
    [{ uid: 'pLinxiTest01', name: '林夕', created: 0 }, { uid: 'pHixTest00001', name: 'hix', created: 0 }],
    ['hix', 'I']);
  check('服务器隐藏名单（hix / i，不区分大小写）不再进「玩家名单」与「用户数量」',
    !sandbox.__nl_test.userList().some((u) => String(u.name).toLowerCase() === 'hix') &&
    sandbox.__nl_test.serverUsers().users === su2.users + 1);   // 林夕还在，hix 被滤掉
  sandbox.__nl_test.setServerAccs([]);
  sandbox.__nl_test.setServerAccs([]);
  sandbox.__nl_test.renderUserList();
  check('拿掉服务器名单后恢复原样', $('admin-ul-list').children.length === su2.users);

  // 4f. 用户详情 / 省份详情：点击「用户数量 / 省份数量」进入
  check('用户详情 / 省份详情改为点击数量进入（按键和提示已删）', (() => {
    const iU = htmlSrc0.indexOf('id="admin-users-row"');
    const iP = htmlSrc0.indexOf('id="admin-provs-row"');
    const iBack = htmlSrc0.indexOf('id="prov-user-list"');
    return iU > 0 && iP > iU && iBack > iP &&
      !htmlSrc0.includes('id="btn-admin-ul-open"') &&
      !htmlSrc0.includes('id="btn-admin-prov-open"') &&
      jsSrc.includes("addEventListener('click', () => openAdminUserList(''))") &&
      jsSrc.includes("addEventListener('click', openProvUserList)") &&
      !htmlSrc0.includes('长按「用户数量」');
  })());
  check('隐藏手势入口已搬走（不再长按进名单）',
    !htmlSrc0.includes("$('admin-user-sec-title'), openAdminUserList"));
  check('省份详情：列出有用户的省份（带人数），搜索可过滤', (() => {
    sandbox.__nl_test.openProvUserList();
    const opened = $('prov-user-list').style.display === 'flex';
    const rows = Array.prototype.slice.call($('prov-ul-list').children);
    const gd = rows.filter((r) => String(r.innerHTML).indexOf('广东') >= 0)[0] || null;
    const okRows = opened && rows.length >= 2 && gd &&
      String(gd.innerHTML).indexOf('1 人') >= 0;
    const se = $('prov-ul-search');
    se.value = '不存在的省';
    se.dispatch('input');
    const firstEmpty = $('prov-ul-list').children[0];
    const empty = !!firstEmpty && String(firstEmpty.textContent).indexOf('没有找到') >= 0;
    if (!(okRows && empty)) console.log('[dbg]', {opened, rows: rows.length, gd: !!gd, gdHtml: gd && String(gd.innerHTML), emptyOk: empty, emptyText: String($('prov-ul-list').textContent).slice(0,60), searchVal: se.value});
    se.value = '';
    se.dispatch('input');
    return okRows && empty;
  })());
  check('点省份直接进该省玩家名单', (() => {
    const rows = Array.prototype.slice.call($('prov-ul-list').children);
    const gd = rows.filter((r) => String(r.innerHTML).indexOf('广东') >= 0)[0];
    gd.dispatch('click');
    const inList = $('admin-user-list').style.display === 'flex' &&
      String($('admin-ul-title').textContent).indexOf('玩家 · 广东') === 0 &&
      $('admin-ul-list').children.length === 1;
    // 省份详情页必须同时收掉（不收会盖在名单页上面，看起来像「点了没反应」）
    const pvClosed = $('prov-user-list').style.display === 'none';
    $('admin-user-list').dispatch('click');
    return inList && pvClosed && $('admin-user-list').style.display === 'none';
  })());
  check('省份详情搜索框与列表同宽（90%）', cssSrc.includes('#prov-ul-search { width: 90%;'));
  (() => {
    sandbox.__nl_test.resetProvCounted();
    const okKey = sandbox.__nl_test.overseasHitKey('JP') === 'ovr_JP' &&
      sandbox.__nl_test.overseasHitKey('', '日本') === 'ovr_JP' &&
      sandbox.__nl_test.overseasHitKey('', '') === null;
    // 记账路径：海外 IP（日本）不再只进总数，还细分到 ovr_JP
    const counted = sandbox.__nl_test.bumpProvHits({ countryCode: 'JP', country: 'Japan' }) === true;
    check('海外点击细分记到国家码（ovr_JP）', okKey && counted);
  })();
  sandbox.__nl_test.openOverseasList({ code: 'overseas', name: '🌍 海外', n: 0 });
  await sleep(80);   // 读计数（沙箱 fetch 全失败）走完
  check('海外行点开显示国家/地区统计页',
    String($('prov-title').textContent).indexOf('海外') >= 0 &&
    String($('prov-sub').textContent).length > 0);
  $('btn-prov-back').dispatch('click');   // 回到省份列表
  check('历史导入 / 恢复默认音乐都是蓝键',
    htmlSrc0.includes('class="btn-primary" id="btn-goto-history-music"') &&
    htmlSrc0.includes('class="btn-primary" id="btn-reset-bgm"'));
  check('蓝键统一为注销那种描边效果（蓝色版）',
    cssSrc.includes('.btn-primary {') &&
    cssSrc.includes('background: rgba(92, 143, 255, 0.08);') &&
    cssSrc.includes('border: 2px solid rgba(92, 143, 255, 0.55)'));
  check('红/绿键同款描边效果、普通键黑色描边',
    cssSrc.includes('background: rgba(255, 92, 92, 0.08);') &&
    cssSrc.includes('border: 2px solid rgba(255, 92, 92, 0.55);') &&
    cssSrc.includes('border: 2px solid rgba(67, 197, 109, 0.55);') &&
    cssSrc.includes('background: rgba(0, 0, 0, 0.05);') &&
    cssSrc.includes('border: 2px solid rgba(0, 0, 0, 0.65);'));
  check('海外列表显示「未识别出国家」', jsSrc.includes('未识别出国家') && !jsSrc.includes('未细分国家'));
  check('棋盘选中框保持黑色、彩色配色用彩虹渐变光晕',
    jsSrc.includes("ctx.strokeStyle = '#333';") && htmlSrc0.includes('棋盘配色') &&
    !jsSrc.includes('彩虹光晕') && !jsSrc.includes('彩色方块拼边') &&
    cssSrc.includes('linear-gradient(135deg, #f5a06b') && cssSrc.includes('mask-composite: exclude') &&
    !cssSrc.includes('repeating-conic-gradient'));
  check('邮件删除键更小、轻点不露删除键',
    cssSrc.includes('width: 54px;') && jsSrc.includes('TAP_TOL = 12'));
  check('一键删除 / 恢复默认音乐都弹确认窗口',
    htmlSrc0.includes('id="mail-delall-confirm"') && htmlSrc0.includes('id="reset-bgm-confirm"') &&
    jsSrc.includes("on('btn-mail-delall-yes'") && jsSrc.includes("on('btn-reset-bgm-yes'"));
  check('邮件详情主标题不带 emoji、副标题更小',
    !jsSrc.includes("(m.icon || '📮') + ' ' + (ci > 0") && cssSrc.includes('.mail-subtitle {') &&
    cssSrc.includes('font-size: 17px;'));

  // 4g. 特殊块专属特效 + 主页关卡跟随 + 按键配色
  check('特效新增 flash / beam / rainbow', (() => {
    const FX = sandbox.FX;
    FX.flash('#ffb13d', 0.3, 0.2);
    FX.beam(100, 100, true, '#5c8fff');
    FX.beam(100, 100, false, '#5c8fff');
    FX.rainbow(100, 100);
    const busy = !FX.isEmpty();
    FX.clear();
    return busy && FX.isEmpty() && typeof FX.flash === 'function' &&
      typeof FX.beam === 'function' && typeof FX.rainbow === 'function';
  })());
  check('登录其它账号（文案已改且是蓝键）',
    htmlSrc0.includes('class="btn-primary" id="btn-switch-login">登录其它账号</button>'));
  check('所有面板不再有「返回 / 关闭」键：退出一律点面板外空白回上一层', (() => {
    const gjs = fs.readFileSync(path.join(__dirname, 'js', 'game.js'), 'utf8');
    // 只剩结算页 / 暂停页的「返回主页」这类主动作键（不是退出面板的返回键）
    const backBtns = htmlSrc0.match(/<button[^>]*>[^<]*返回[^<]*<\/button>/g) || [];
    const onlyHome = backBtns.every((b) => b.indexOf('返回主页') >= 0 || b.indexOf('btn-nick-cancel') >= 0 || b.indexOf('返 回') >= 0);
    const closeBtns = htmlSrc0.match(/<button[^>]*>[^<]*关闭[^<]*<\/button>/g) || [];
    return onlyHome && closeBtns.length === 0 &&
      /function panelBack\(id\)/.test(gjs) &&
      /e\.target !== ov\) return;\s*\n\s*panelBack\(ov\.id\)/.test(gjs) &&
      /'mail-view': 'mail-menu'/.test(gjs) && /'chapters-menu': 'main-menu'/.test(gjs);
  })());
  check('每日挑战结算页：使用步数 + 获得金币两行、没有返回主页键，点空白回主页', (() => {
    const gjs = fs.readFileSync(path.join(__dirname, 'js', 'game.js'), 'utf8');
    const sjs = fs.readFileSync(path.join(__dirname, 'js', 'storage.js'), 'utf8');
    const sec = htmlSrc0.slice(htmlSrc0.indexOf('id="daily-done"'), htmlSrc0.indexOf('id="game-complete"'));
    return sec.includes('使用步数') && sec.includes('id="daily-done-moves"') && sec.includes('id="daily-done-coins"') &&
      !sec.includes('daily-done-score') && !sec.includes('btn-daily-done-home') &&
      /id="daily-done-star-num"[\s\S]*id="daily-done-moves"[\s\S]*id="daily-done-coins"/.test(sec) &&
      gjs.includes("'daily-done': 'main-menu'") &&
      /recordDaily\(S\.score, starsNow, dailyMovesUsed, dailyBonus\)/.test(gjs) &&
      /bonus = 100 \+ Math\.max\(30 \* movesLeft, Math\.floor\(S\.score \/ 10\) \+ 100\);/.test(gjs) &&
      /function recordDaily\(score, stars, movesUsed, bonusCoins\)/.test(sjs) &&
      /moves: moves,/.test(sjs) && /coins: bonusCoins \? bonusCoins/.test(sjs);
  })());
  check('每日挑战两条结算路径都发完成奖励（最后一步达标走 endGame 也照发），老档补发 30 枚', (() => {
    const gjs = fs.readFileSync(path.join(__dirname, 'js', 'game.js'), 'utf8');
    const sjs = fs.readFileSync(path.join(__dirname, 'js', 'storage.js'), 'utf8');
    return /function dailySettle\(starsNow, allowGrant\)/.test(gjs) &&
      /const ds = dailySettle\(starsNow, !again\);/.test(gjs) &&
      /const ds = S\.daily \? dailySettle\(stars, true\) : \{ movesUsed: -1, bonus: 0 \};/.test(gjs) &&
      /recordDaily\(S\.score, stars, ds\.movesUsed, ds\.bonus\)/.test(gjs) &&
      /rec\.stars >= 1 && !rec\.moves\) \? '—'/.test(gjs) &&
      /Store\.addCoins\(30, '每日挑战补发'\);/.test(gjs) && /Store\.patchDaily\(\{ coins: 30 \}\);/.test(gjs) &&
      /function patchDaily\(patch\)/.test(sjs) && /patchDaily,/.test(sjs);
  })());
  check('三星后封盘：「✅ 已完成今日挑战」出现在面板的开始键上（绿色），点了只看战绩', (() => {
    const gjs = fs.readFileSync(path.join(__dirname, 'js', 'game.js'), 'utf8');
    const css = fs.readFileSync(path.join(__dirname, 'css', 'themes.css'), 'utf8');
    return /btn\.textContent = done \? '✅ 已完成今日挑战' : txt;/.test(gjs) &&
      /'▶ 继续挑战'/.test(gjs) &&                                            // 有当天没打完的存档 → 继续挑战
      /btn\.classList\.toggle\('is-done', done\)/.test(gjs) &&
      /if \(dailyCompleted\(\)\) \{ showDailyDone\(\); return; \}/.test(gjs) &&   // 三星后再点只看战绩，不能再打
      /\.btn-primary\.is-done\s*\{[^}]*#1a8f4a/.test(css) &&                 // 开始键变绿
      !/dailyBtn\.textContent = done \?/.test(gjs);                          // 主页按钮不再显示完成态
  })());
  check('每日挑战面板：开始挑战 / 查看榜单两个键，点空白回主页、榜单点空白回面板', (() => {
    const gjs = fs.readFileSync(path.join(__dirname, 'js', 'game.js'), 'utf8');
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    return html.includes('id="daily-menu"') && html.includes('id="daily-lb"') &&
      html.includes('id="btn-daily-start"') && html.includes('id="btn-daily-lb"') &&
      html.indexOf('btn-daily-start') < html.indexOf('btn-daily-lb') &&
      /'daily-menu': 'main-menu'/.test(gjs) && /'daily-lb': 'daily-menu'/.test(gjs) &&
      /syncDailyMenu\(\);/.test(gjs) && /showOverlay\('daily-menu'\);/.test(gjs) &&
      /function renderDailyLb/.test(gjs);
  })());
  check('每日挑战榜单数据层：dl 消息 / ds 快照 / 星多→步少→通关早 / 注销同步移除', (() => {
    const bjs = fs.readFileSync(path.join(__dirname, 'js', 'board.js'), 'utf8');
    return /t === 'dl'/.test(bjs) && /t === 'ds'/.test(bjs) &&
      /publishDaily,/.test(bjs) && /dailyList:/.test(bjs) &&
      /function dailyBetter\(a, b\)/.test(bjs) &&
      /if \(a\.stars !== b\.stars\) return a\.stars > b\.stars;/.test(bjs) &&
      /const di = findDailyIdx\(uid\);/.test(bjs) &&
      /DLKEY = 'nl2:lbdaily'/.test(bjs);
  })());
  check('每日挑战榜每天 00:00 重置：隔天成绩自动丢弃（pruneDaily 按本地零点过滤），快照也不广播隔天条目',
    (() => {
      const bjs = fs.readFileSync(path.join(__dirname, 'js', 'board.js'), 'utf8');
      return /function todayStart\(\)/.test(bjs) && /function pruneDaily\(\)/.test(bjs) &&
        /new Date\(d\.getFullYear\(\), d\.getMonth\(\), d\.getDate\(\)\)\.getTime\(\)/.test(bjs) &&
        /function mergeDaily\(raw\) \{\s*\n\s*pruneDaily\(\);/.test(bjs) &&
        /if \(pruneDaily\(\)\) saveD\(\);/.test(bjs) &&
        /pruneDaily\(\); return dEntries\.slice\(\)\.sort\(dailyCmp\);/.test(bjs);
    })());
  check('每日挑战成绩自动发榜（打完且拿到星才发）', (() => {
    const gjs = fs.readFileSync(path.join(__dirname, 'js', 'game.js'), 'utf8');
    return /publishDailyRecord\(starsNow, dailyMovesUsed\)/.test(gjs) &&
      /function publishDailyRecord/.test(gjs) && /Board\.publishDaily\(/.test(gjs);
  })());
  check('邮箱底部只留 ✅ / 🗑️ 两个小圆钮，放在滚动区外面（下方右对齐）', (() => {
    const sec = htmlSrc0.slice(htmlSrc0.indexOf('id="mail-list"'), htmlSrc0.indexOf('id="mail-view"'));
    return /class="mail-emoji-btn" id="btn-mail-read-all"[^>]*>✅</.test(sec) &&
      /class="mail-emoji-btn" id="btn-mail-del-all"[^>]*>🗑️</.test(sec) &&
      !sec.includes('一键已读') && !sec.includes('一键删除') &&
      !htmlSrc0.includes('<div class="mail-list-wrap">') &&
      /<div class="mail-list" id="mail-list"><\/div>\s*<div class="mail-tools">/.test(htmlSrc0) &&
      /\.mail-list\s*\{[^}]*max-height:\s*62vh/.test(cssSrc) &&
      /\.mail-tools\s*\{[^}]*justify-content:\s*flex-end/.test(cssSrc) &&
      !/\.mail-tools\s*\{[^}]*position:\s*absolute/.test(cssSrc) &&
      /\.mail-emoji-btn\s*\{[^}]*width:\s*34px[^}]*height:\s*34px/.test(cssSrc);
  })());
  check('切换账号 / 存档码是蓝键',
    htmlSrc0.includes('class="btn-primary" id="btn-goto-switch"') &&
    htmlSrc0.includes('class="btn-primary" id="btn-goto-backup"'));
  check('生成 / 复制是蓝键',
    htmlSrc0.includes('class="btn-primary" id="btn-backup-gen"') &&
    htmlSrc0.includes('class="btn-primary" id="btn-backup-copy"'));

  // 收尾：把测试用的假账号摘掉、恢复榜单与定位
  const accClean = JSON.parse(lsMap.get('nl2:accounts')).filter((a) => a.id !== 'utest-nopass');
  lsMap.set('nl2:accounts', JSON.stringify(accClean));
  sandbox.Board.list = realBoardList;
  if (realNet === undefined) lsMap.delete('nl2:net'); else lsMap.set('nl2:net', realNet);

  // 后面的用例按「空仓库」起手，这里把钱包重置回初始状态
  lsMap.set('nl2:wallet', JSON.stringify({ coins: 500, items: {} }));
  $('main-menu').style.display = 'flex';

  // 5. 收集关目标图案：切到第 2 关（collect 目标）再开始
  lsMap.set('nl2:progress', JSON.stringify({ 1: { score: 1200, stars: 3 }, 2: { score: 900, stars: 2 } }));
  $('btn-history').dispatch('click');
  const rows2 = $('history-list').children;
  rows2[1].dispatch('click'); // 选中第 2 关 → 回主页
  check('切到第 2 关', $('main-menu').style.display === 'flex' && String($('menu-current-level').textContent) === '2');
  $('btn-play').dispatch('click');
  await sleep(30);
  const barHtml = $('target-bar').innerHTML;
  // 收集目标每次随机两种，不能再写死 0 号图案
  check('收集关目标栏使用图案 img', /goal-chip/.test(barHtml) && /assets\/\d\.webp/.test(barHtml));

  // 6. 中央倍数横幅元素存在
  check('中央横幅存在（倍数显示）', !!getEl('center-banner') && !!getEl('center-banner-text'));

  // 7. 道具使用：局内点「使用」立即生效
  sandbox.Store.addItem('extraMoves', 1);
  sandbox.Store.addItem('shuffle', 1);
  sandbox.Store.addItem('startBomb', 1);
  const movesBefore = Number($('moves').textContent);
  $('btn-backpack-game').dispatch('click'); // 游戏界面背包
  let packRows2 = $('backpack-list').children;
  check('背包按拥有道具渲染 3 行', packRows2.length === 3);
  const useBtns = packRows2.map((r) => r.children[r.children.length - 1]);
  check('局内使用按钮可点', useBtns.every((b) => b && b.disabled === false));

  const useConfirmOpen = () => $('use-confirm').style.display === 'flex';
  useBtns[0].dispatch('click'); // +3 步：先弹确认
  check('点「使用」先弹确认窗口', useConfirmOpen() && $('use-confirm-text').innerHTML.includes('+3 步'));
  $('btn-use-yes').dispatch('click');
  check('确认后「+3 步」生效', !useConfirmOpen() && Number($('moves').textContent) === movesBefore + 3);
  check('「+3 步」消耗 1 个', (sandbox.Store.getWallet().items.extraMoves || 0) === 0);

  const shuffleBefore = Number($('shuffle-count').textContent);
  packRows2 = $('backpack-list').children; // 使用后重渲染
  packRows2[0].children[packRows2[0].children.length - 1].dispatch('click'); // 洗牌 +1（弹确认）
  $('btn-use-no').dispatch('click'); // 先取消：不消耗
  check('取消使用不消耗道具', !useConfirmOpen() && (sandbox.Store.getWallet().items.shuffle || 0) === 1);
  packRows2[0].children[packRows2[0].children.length - 1].dispatch('click');
  $('btn-use-yes').dispatch('click');
  check('使用「洗牌」转入本局次数', (sandbox.Store.getWallet().items.shuffle || 0) === 0);
  check('洗牌徽章 +1（只算本局次数）', Number($('shuffle-count').textContent) === shuffleBefore + 1);

  packRows2 = $('backpack-list').children;
  packRows2[0].children[packRows2[0].children.length - 1].dispatch('click'); // 开局炸弹（局内放置，弹确认）
  $('btn-use-yes').dispatch('click');
  check('使用「炸弹」放置成功', $('toast').textContent.includes('炸弹'));
  check('「炸弹」消耗 1 个', (sandbox.Store.getWallet().items.startBomb || 0) === 0);
  $('backpack-menu').dispatch('click');

  // 8. 未开局时道具不可用（先暂停 → 回主页，主页应显示「继续游戏」）
  $('btn-pause').dispatch('click');
  check('暂停面板打开', $('pause-menu').style.display === 'flex');
  $('btn-pause-home').dispatch('click');
  check('暂停后回主页显示「继续游戏」', $('btn-play').textContent.includes('继续游戏'));
  sandbox.Store.addItem('rainbow', 1);
  $('btn-backpack-home').dispatch('click');
  const homeRows = $('backpack-list').children;
  const homeBtn = homeRows[0].children[homeRows[0].children.length - 1];
  check('未开局时使用按钮禁用', homeBtn.disabled === true);
  homeBtn.dispatch('click');
  check('未开局点击不弹确认、不消耗道具', $('use-confirm').style.display !== 'flex' && (sandbox.Store.getWallet().items.rainbow || 0) === 1);

  // 9. 玩法规则面板
  $('backpack-menu').dispatch('click');
  $('btn-rules').dispatch('click');
  check('规则面板打开', $('rules-menu').style.display === 'flex');
  const htmlSrc = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check('规则含星级评价说明', htmlSrc.includes('星级评价') && htmlSrc.includes('分数线'));
  check('规则说明线消横清行竖清列', htmlSrc.includes('横连清整行、竖连清整列'));
  check('规则含 8 种目标', ['普通得分', '收集方块', '清除果冻', '限时得分', '极限步数', '敲碎冰块', '运送钥匙', '护送奶龙'].every((s) => htmlSrc.includes(s)));
  check('规则含障碍与货物说明', htmlSrc.includes('障碍与货物') && htmlSrc.includes('送到最底行') && htmlSrc.includes('下面离它最近的那个方块'));
  check('规则含狂热与节奏说明', htmlSrc.includes('狂热 6 秒') && htmlSrc.includes('节奏关卡'));
  check('规则含提示与续命说明', htmlSrc.includes('每局免费') && htmlSrc.includes('300 金币') && htmlSrc.includes('+7s'));
  check('规则含更多玩法与福利说明', htmlSrc.includes('无尽模式') && htmlSrc.includes('转盘'));  check('规则含成就配色排行榜说明', htmlSrc.includes('棋盘配色') && htmlSrc.includes('🏅 成就') && htmlSrc.includes('总榜 → 省榜 → 局榜'));
  check('规则里昵称只说「唯一且区分大小写」，不提旧默认名 / 榜上重名',
    htmlSrc.includes('唯一且区分大小写') && !htmlSrc.includes('不能和榜上的人重名') &&
    !htmlSrc.includes('默认的「奶龙玩家」'));
  check('规则页不剧透总章节数 / 总关数', !htmlSrc.includes('主线共 <b>40 关</b>') && !htmlSrc.includes('40 关') && !htmlSrc.includes('4 个章节'));
  check('规则含补签说明（50 金币、不发奖励）', htmlSrc.includes('补签') && htmlSrc.includes('50 金币') && htmlSrc.includes('不发'));
  check('结算页有继续游戏按钮且在进入下一关上面',
    htmlSrc.includes('btn-clear-continue') && htmlSrc.indexOf('btn-clear-continue') < htmlSrc.indexOf('id="btn-next-level"'));
  check('主页每日任务在更多玩法前面（已交换）',
    htmlSrc.indexOf('btn-goto-tasks') >= 0 && htmlSrc.indexOf('btn-goto-tasks') < htmlSrc.indexOf('btn-modes'));
  check('签到键上面是连续签到天数（黑色）、补签走红色日期弹窗',
    htmlSrc.includes('welfare-streak') && !htmlSrc.includes('btn-welfare-makeup') &&
    htmlSrc.indexOf('welfare-streak') < htmlSrc.indexOf('id="btn-welfare-signin"') &&
    htmlSrc.includes('id="makeup-menu"') && htmlSrc.includes('btn-makeup-go') &&
    htmlSrc.includes('id="makeup-confirm"') && htmlSrc.includes('btn-makeup-yes'));
  check('省榜 / 局榜更换符号在标题右边', htmlSrc.includes('lb-title-row') && htmlSrc.includes('lb-swap') &&
    htmlSrc.indexOf('lb-view-title') < htmlSrc.indexOf('lb-prov-swap'));
  // 📖 规则首页 → 功能介绍 / 玩法规则 分开
  $('btn-goto-features').dispatch('click');
  check('点「功能介绍」进入功能介绍页', $('features-menu').style.display === 'flex' && $('rules-menu').style.display === 'none');
  const featsHtml = htmlSrc.slice(htmlSrc.indexOf('id="features-box"'), htmlSrc.indexOf('id="play-rules-menu"'));
  check('功能介绍按按键层次排：左上角 / 右上角 / 中间 / 按钮区 / 局内 / 结算 / 账号（标题只写区域名，不写序号）',
    featsHtml.includes('<h3>左上角</h3>') && featsHtml.includes('<h3>右上角</h3>') &&
    featsHtml.includes('<h3>进度与开始</h3>') && featsHtml.includes('<h3>主页按钮区</h3>') &&
    featsHtml.includes('<h3>局内按键</h3>') && featsHtml.includes('<h3>结算与成绩单</h3>') &&
    featsHtml.includes('<h3>账号与云存档</h3>') && !/[①②③④⑤⑥⑦]/.test(featsHtml) &&
    featsHtml.includes('📮 邮箱') && !featsHtml.includes('基本玩法') &&
    !featsHtml.includes('所有人同一局') &&
    /🎯 每日任务[\s\S]*?<\/p>\s*<p><b>📅 每日挑战/.test(featsHtml));
  check('说明页文案按最新要求更新（金币 / 退出面板 / 称号分类 / 忘记密码 / 删「场上还剩」）',
    featsHtml.includes('点<b>「金币」</b>可查看<b>金币明细</b>') && !featsHtml.includes('点右边的数字不跳转') &&
    featsHtml.includes('<b>👆 退出面板</b>：点面板外的空白回上一层。</p>') && !featsHtml.includes('按游客玩') &&
    featsHtml.includes('称号分为：学徒→新星→达人→高手→大师→宗师') &&
    featsHtml.includes('需填写「名字 + 身份号码」') && !featsHtml.includes('同一台手机上直接设新密码') &&
    !featsHtml.includes('场上还剩 N 件') && featsHtml.includes('同一天所有人的') &&
    featsHtml.includes('棋盘与榜单都在<b>每日00:00重置</b>'));
  $('features-menu').dispatch('click');
  check('功能介绍「返回」回到规则首页', $('features-menu').style.display === 'none' && $('rules-menu').style.display === 'flex');
  $('btn-goto-play-rules').dispatch('click');
  check('点「玩法规则」进入玩法规则页', $('play-rules-menu').style.display === 'flex');
  const playHtml = htmlSrc.slice(htmlSrc.indexOf('id="play-rules-box"'), htmlSrc.indexOf('id="mail-menu"'));
  check('玩法规则里放的是单局玩法（基本玩法 / 特殊块 / 星级）',
    playHtml.includes('基本玩法') && playHtml.includes('✨ 特殊块') &&
    playHtml.includes('星级评价怎么算') && !playHtml.includes('福利中心'));
  $('play-rules-menu').dispatch('click');
  check('玩法规则「返回」回到规则首页', $('play-rules-menu').style.display === 'none' && $('rules-menu').style.display === 'flex');
  $('rules-menu').dispatch('click');
  check('规则关闭回到主页', $('rules-menu').style.display === 'none' && $('main-menu').style.display === 'flex');

  // 10. 主页主按钮文案：已通关 → 重新开始；未通关 → 开始游戏
  $('btn-history').dispatch('click');
  $('history-list').children[2].dispatch('click'); // 第 3 关：有解锁但无记录
  check('未通关显示「开始游戏」', $('btn-play').textContent.includes('开始游戏'));
  $('btn-history').dispatch('click');
  $('history-list').children[0].dispatch('click'); // 第 1 关：3 星
  check('已通关显示「重新开始」', $('btn-play').textContent.includes('重新开始'));

  // 11. 洗牌次数用完后必须玩家自己补（不再自动扣背包）
  $('btn-play').dispatch('click');
  await sleep(30);
  // 第 1 关是第一章开头 → 先过剧情，再进关卡
  if ($('story-menu').style.display === 'flex') $('btn-story-go').dispatch('click');
  await sleep(10);
  const walletShuffle = sandbox.Store.getWallet().items.shuffle || 0;
  for (let i = 0; i < 4; i++) $('btn-shuffle').dispatch('click');
  check('洗牌用完后提示去背包补充', $('toast').textContent.includes('用完了'));
  check('洗牌不再自动扣背包', (sandbox.Store.getWallet().items.shuffle || 0) === walletShuffle);

  // 12. 十字线消：整行 + 整列一起清
  const Sp = sandbox.Specials;
  const bd = [];
  for (let r = 0; r < 8; r++) {
    bd[r] = [];
    for (let c = 0; c < 8; c++) bd[r][c] = { type: (r + c) % 3, special: 0 };
  }
  bd[3][4].special = Sp.TYPE.LINE_H;
  const rbExp = Sp.expandClears(bd, 8, 8, new Set(['3,4']), {});
  let rowOk = true, colOk = true;
  for (let c = 0; c < 8; c++) if (!rbExp.cells.has('3,' + c)) rowOk = false;
  for (let r = 0; r < 8; r++) if (!rbExp.cells.has(r + ',4')) colOk = false;
  check('十字线消清整行 + 整列', rowOk && colOk);

  // 13. 主页上一关 / 下一关
  check('主页有关卡翻页按钮', !!getEl('btn-prev-level') && !!getEl('btn-next-level-menu') && !!getEl('menu-level-label'));

  // 14. 新玩法面板：章节 / 成就 / 图鉴 / 福利
  // 沙箱里没有网络，关卡数据用磁盘上的真实 levels.json 顶替，和线上走同一条渲染路径
  sandbox.__nl_test.state().data = JSON.parse(fs.readFileSync(path.join('js', 'levels.json'), 'utf8'));
  $('btn-chapters').dispatch('click');
  const chJson = JSON.parse(fs.readFileSync(path.join('js', 'levels.json'), 'utf8'));
  const chKids = $('chapters-list').children;
  const countCh = () => chKids.filter((c) => String(c.className || '').indexOf('chapter-card') === 0).length;
  const moreOf = () => chKids.filter((c) => String(c.className || '') === 'chapter-more')[0];
  const maxU0 = sandbox.Store.maxUnlockedLevel(40);
  check('章节地图只显示已解锁的章节（未玩到的章节不提前露出）',
    countCh() === chJson.chapters.filter((c) => maxU0 >= c.from).length && countCh() < chJson.chapters.length);
  check('章节地图最底下写「更多章节等待解锁…」',
    !!moreOf() && String(moreOf().textContent).indexOf('更多章节等待解锁') >= 0 &&
    chKids[chKids.length - 1] === moreOf());
  // 打通第一章之后，第二章才会出现在地图上
  for (let i = 1; i <= 10; i++) sandbox.Store.recordLevel(i, 900, 1);
  $('btn-chapters').dispatch('click');
  check('打通第一章后第二章才出现', countCh() === 2);
  $('chapters-menu').dispatch('click');

  $('btn-achievements').dispatch('click');
  check('成就墙渲染出全部成就', $('ach-list').children.length === sandbox.Meta.ACHIEVEMENTS.length);
  check('省份全部用简写（北京/四川/内蒙古）',
    jsSrc.includes("['北京', 'beijing']") && jsSrc.includes("['四川', 'sichuan']") &&
    jsSrc.includes("['内蒙古', 'neimenggu']") && !jsSrc.includes("['内蒙古自治区'"));
  check('章节地图打开时滑到当前关卡（和关卡记录同款）',
    jsSrc.includes("scrollChaptersToCurrent()") && jsSrc.includes("level-chip.current") ||
    (jsSrc.includes("' current'") && jsSrc.includes('function scrollChaptersToCurrent') &&
     jsSrc.includes("on('btn-chapters', () => { renderChapterMap(); showOverlay('chapters-menu'); scrollChaptersToCurrent(); })")));
  check('更多玩法右上角黑色 + 最佳分带「分」',
    cssSrc.includes('.mode-head span { font-size: 11px; color: #222;') &&
    jsSrc.includes("'最佳 ' + best[k] + ' 分'"));
  check('商店有「线消道具」230 金币（比 180 的炸弹贵，按消除得分定价）', (() => {
    const t = fs.readFileSync(path.join(__dirname, 'js', 'tasks.js'), 'utf8');
    return t.includes("{ key: 'startLine', name: '线消道具', price: 230") &&
      t.indexOf("key: 'startLine'") > t.indexOf("key: 'startBomb'");
  })());
  check('所有滑动区域不显示滚动条灰线',
    cssSrc.includes('*::-webkit-scrollbar { width: 0; height: 0; display: none; }') &&
    !cssSrc.includes('scrollbar-thumb'));
  check('玩家栏省份列三个字宽靠右、省份详情人数贴最右',
    cssSrc.includes('width: 42px;') && cssSrc.includes('.ul-prov') &&
    cssSrc.includes('#prov-ul-list .ul-prov'));
  check('成就面板可视区加大（66vh、更密排列）', cssSrc.includes('max-height: 66vh;') && cssSrc.includes('gap: 6px;'));
  check('彩虹特殊块还是 emoji（游戏棋盘），「彩色」配色图标用彩虹图',
    jsSrc.includes("ctx.fillText('🌈'") && !jsSrc.includes('RAINBOW_IMG') &&
    fs.existsSync(path.join(__dirname, 'assets', 'rainbow.jpg')) &&
    fs.readFileSync(path.join(__dirname, 'js', 'meta.js'), 'utf8').includes("s.id === 'black'") &&
    fs.readFileSync(path.join(__dirname, 'js', 'meta.js'), 'utf8').includes("background-color:' + (s.color") &&
    cssSrc.includes('.skin-icon-img') && cssSrc.includes("url('../assets/rainbow.jpg')"));
  check('快递小哥改名为快递达人', (() => {
    const a = sandbox.Meta.ACHIEVEMENTS.filter((x) => x.id === 'cargo50')[0];
    return !!a && a.name === '快递达人';
  })());
  check('奶龙守护者图标用最新版奶龙图片', (() => {
    const a = sandbox.Meta.ACHIEVEMENTS.filter((x) => x.id === 'rescue30')[0];
    if (!a || String(a.iconImg || '').indexOf('assets/nailong.png') < 0) return false;
    sandbox.Meta.renderAchievements($('ach-list'));
    const html = ($('ach-list').children || []).map((r) => String(r.innerHTML || '')).join('');
    return html.indexOf('<img src="./assets/nailong.png"') >= 0;
  })());
  $('achievements-menu').dispatch('click');

  $('btn-collection').dispatch('click');
  check('图鉴渲染出全部皮肤', $('skin-list').children.length === sandbox.Meta.SKINS.length);
  $('collection-menu').dispatch('click');

  $('btn-welfare').dispatch('click');
  check('签到日期条：今天居中，两边各 4 天（共 9 格），每天标出当日金币', (() => {
    const cells = Array.from($('welfare-sign').children || []);
    const todayIdx = cells.findIndex((c) => String(c.className).indexOf('today') >= 0);
    return cells.length === 9 && todayIdx === 4 &&
      cells.every((c) => /[✓🌈]|\d{2}/.test(String(c.innerHTML)));
  })());
  $('welfare-menu').dispatch('click');

  $('btn-modes').dispatch('click');
  check('更多玩法面板打开', $('modes-menu').style.display === 'flex');
  $('modes-menu').dispatch('click');

  // 14. 排行榜：先进「选榜单」，再进列表
  $('btn-leaderboard').dispatch('click');
  check('排行榜面板打开', $('leaderboard-menu').style.display === 'flex');
  check('排行榜只有总榜 / 省榜 / 局榜三个入口',
    !!getEl('btn-lb-hub-all') && !!getEl('btn-lb-hub-prov') && !!getEl('btn-lb-hub-level'));
  check('排行榜不再有成绩码 / 改名入口',
    htmlSrc.indexOf('lb-code') < 0 && htmlSrc.indexOf('lb-nick') < 0 && htmlSrc.indexOf('btn-lb-copy') < 0);
  $('btn-lb-hub-all').dispatch('click');
  check('点总榜才进排行榜列表', $('lb-view').style.display === 'flex' && $('lb-list').children.length >= 1);

  // 14b. 好友：自己的码加不进 / 好友永久保留 / 同 uid 更新不重复 / 左滑删除按钮
  const M = sandbox.Meta;
  const myCode = M.makeCode({ name: M.nickname(), score: 1234, level: 1 });
  check('自己的成绩码加不进', M.addFriend(myCode).ok === false);
  const mk = (uid, name, score) => 'NL1-' + btoa(unescape(encodeURIComponent(JSON.stringify({ v: 2, u: uid, n: name, s: score, w: M.weekKey() })))).replace(/=+$/, '');
  check('加入好友', M.addFriend(mk('t-f1', '阿呆', 900)).ok === true && M.friends().length === 1);
  check('好友改名重新发码只更新同一条', (() => {
    const r = M.addFriend(mk('t-f1', '阿呆2号', 1300));
    return r.updated === true && M.friends().length === 1 && M.friends()[0].name === '阿呆2号';
  })());
  M.removeFriend('t-f1');
  check('好友删干净', M.friends().length === 0);
  check('好友行渲染删除按钮', (() => {
    M.addFriend(mk('t-f2', '阿呆3号', 700));
    sandbox.__nl_test.refreshMenu();
    $('btn-lb-hub-all').dispatch('click');
    let dels = 0, meRow = false;
    ($('lb-list').children || []).forEach((row) => {
      if (String(row.className || '').split(' ').indexOf('me') >= 0) meRow = true;
      (row.children || []).forEach((ch) => { if (ch.className === 'lb-del') dels++; });
    });
    return dels >= 1 && meRow;
  })());
  $('lb-view').dispatch('click');
  $('leaderboard-menu').dispatch('click');

  // 14c. 昵称规则 + 省榜 / 局榜选择器
  check('昵称不能用默认名', !M.validateNick('奶龙玩家', []).ok);
  check('昵称只允许 - . _ 特殊符号', !M.validateNick('a@b', []).ok && M.validateNick('a-b.c', []).ok && M.validateNick('a_b', []).ok);
  check('昵称不能重名', !M.validateNick('阿呆', ['阿呆']).ok);
  check('省榜 / 局榜 ⇄ 弹出全量列表直接挑选', (() => {
    $('btn-leaderboard').dispatch('click');
    $('btn-lb-hub-prov').dispatch('click');
    const provShown = $('lb-prov-swap').style.display === 'inline-block' && $('lb-level-swap').style.display === 'none';
    // 点 ⇄ → 弹出全部省份面板；点最后一个省 → 标题直接变、面板收起
    $('lb-prov-swap').dispatch('click');
    const opened = $('lb-picker').style.display === 'grid';
    const chips = ($('lb-picker').children || []).length;
    const t1 = String($('lb-view-title').textContent);
    ($('lb-picker').children || [])[chips - 1].dispatch('click');
    const closed = $('lb-picker').style.display === 'none';
    const t2 = String($('lb-view-title').textContent);
    const provChanged = opened && closed && chips >= 20 && t1 !== t2 && t2.indexOf('省') >= 0;
    $('lb-view').dispatch('click');
    $('btn-lb-hub-level').dispatch('click');
    const lvShown = $('lb-level-swap').style.display === 'inline-block' && $('lb-prov-swap').style.display === 'none';
    $('lb-level-swap').dispatch('click');
    const lvOpened = $('lb-picker').style.display === 'grid';
    const lvChips = ($('lb-picker').children || []).length;
    const lt1 = String($('lb-view-title').textContent);
    ($('lb-picker').children || [])[lvChips - 1].dispatch('click');
    const lt2 = String($('lb-view-title').textContent);
    $('lb-view').dispatch('click');
    $('btn-lb-hub-all').dispatch('click');
    const noneShown = $('lb-prov-swap').style.display === 'none' && $('lb-level-swap').style.display === 'none';
    $('lb-view').dispatch('click');
    $('leaderboard-menu').dispatch('click');
    // 局榜选关面板只列已解锁的关（此时打通到第 10 关，所以正好 10 个选项）
    const lbUnlocked = sandbox.Store.maxUnlockedLevel(40);
    return provShown && provChanged && lvShown && lvOpened && lt1 !== lt2 && noneShown &&
      lvChips === lbUnlocked && lbUnlocked < 40 &&
      htmlSrc.indexOf('lb-tabs') < 0 && htmlSrc.indexOf('btn-lb-all') < 0 && htmlSrc.indexOf('lb-prov-sel') < 0;
  })());

  // 14c-2. 收集关每次随机两种方块 + 冰块五道裂纹
  check('收集关每次开局随机换两种方块（数量照关卡定义）', (() => {
    const pairs = new Set();
    for (let i = 0; i < 30; i++) {
      sandbox.__nl_test.start(2);
      const t = sandbox.__nl_test.state().goal.target;
      const keys = Object.keys(t);
      if (keys.length !== 2) return false;
      if (keys.some((k) => !(Number(k) >= 0 && Number(k) <= 5))) return false;
      if (keys.some((k) => t[k] !== 12)) return false;
      pairs.add(keys.slice().sort().join('+'));
    }
    return pairs.size > 1;   // 30 局里出现过多于一种组合 → 真的随机
  })());
  check('冰块一出现就是五道裂纹', sandbox.__nl_test.iceCracks.length === 5);

  // 14d. 局榜排名与奖牌：我一关 1200，对手 900 → 我第一，拿金牌
  check('局榜按单关最高分排名', (() => {
    sandbox.Board.publish({ uid: 'rival001', name: '对手', score: 900, level: 1, lv: { 1: 900 } }, true);
    sandbox.Board.publish({ uid: 'rival002', name: '对手2', score: 800, level: 1, lv: { 1: 800 } }, true);
    // 切到第 1 关（测试里默认停在第 2 关）
    $('btn-prev-level').dispatch('click');
    $('btn-prev-level').dispatch('click');
    sandbox.__nl_test.refreshMenu();
    const medal = getEl('menu-high-medal').textContent;
    $('btn-history').dispatch('click');
    let rowsWithMedal = 0, medalLeftOfStars = false;
    ($('history-list').children || []).forEach((r) => {
      const h = String(r.innerHTML || '');
      if (h.indexOf('🥇') >= 0) {
        rowsWithMedal++;
        // 奖牌必须夹在星星列里、且在星星左边
        if (h.indexOf('h-stars') >= 0 && h.indexOf('lb-medal') < h.indexOf('star-on')) medalLeftOfStars = true;
      }
    });
    $('history-menu').dispatch('click');
    return medal === '🥇' && rowsWithMedal >= 1 && medalLeftOfStars;
  })());

  // 14d2. 局榜上只有我一个人，也要挂奖牌
  check('一个人上榜也有奖牌', (() => {
    $('btn-next-level-menu').dispatch('click');   // 第 1 关 → 第 2 关（这一局只有我自己）
    sandbox.__nl_test.refreshMenu();
    const m = getEl('menu-high-medal').textContent;
    const shown = getEl('menu-high-medal').style.display !== 'none';
    $('btn-prev-level').dispatch('click');
    sandbox.__nl_test.refreshMenu();
    return m === '🥇' && shown;
  })());

  // 14d2b. 局榜：没通过这一关的玩家灰显、不参与排名（第 1 关目标 1000 分）
  check('局榜：没通关的玩家灰显、名次「—」不占位；通关的第一名照常拿奖牌', (() => {
    $('btn-leaderboard').dispatch('click');
    $('btn-lb-hub-level').dispatch('click');
    $('lb-level-swap').dispatch('click');
    const pick = ($('lb-picker').children || []).filter((b) => String(b.textContent) === '第 1 关')[0];
    if (pick) pick.dispatch('click');
    const rows = ($('lb-list').children || []);
    let sawLow = false, sawMe = false, ok = true;
    rows.forEach((row) => {
      const cls = String(row.className || '');
      const inner = (row.children || [])[0];
      const h = String((inner && inner.innerHTML) || '');
      if (h.indexOf('对手') >= 0) {
        sawLow = true;
        // 没到目标分：整行灰显、名次是「—」、分数数字照常显示
        if (cls.indexOf('none') < 0 || h.indexOf('lb-rank">—') < 0 ||
          !/lb-score">[0-9]+<\/span>/.test(h)) ok = false;
      }
      if (h.indexOf('我') >= 0) {
        sawMe = true;
        // 我 1200 ≥ 目标 1000：正常名次 + 金牌
        if (cls.indexOf('none') >= 0 || h.indexOf('🥇') < 0) ok = false;
      }
    });
    $('lb-view').dispatch('click');
    $('leaderboard-menu').dispatch('click');
    return sawLow && sawMe && ok;
  })());
  check('局榜以「这一关有没有通关」为准：星级 > 0 才算通关，没通关灰显垫底不排名', (() => {
    return /r\.pass = \(r\.stars \|\| 0\) > 0/.test(jsSrc) &&
      /if \(!meRow \|\| !meRow\.pass\) return 0/.test(jsSrc) &&
      /const passed = rows\.filter\(\(r\) => r\.pass\)/.test(jsSrc) &&
      /const noRank = lbTab === 'level' && r\.pass === false/.test(jsSrc) &&
      /function entryPassed/.test(jsSrc) &&
      /if \(passed\) cur\.pass = true/.test(jsSrc) &&
      /Object\.keys\(st\)\.length/.test(jsSrc) &&
      /\.lb-row\.none \.lb-stars,/.test(cssSrc);
  })());

  // 14d2c. 非分数关（第 2 关是收集关）同样按「有没有通关」卡排名
  check('局榜：收集关没通关的分数再高也灰显，通关了分数低照常排名', (() => {
    // 第 2 关（收集关）：一个通关了但分数低，一个没通关但刷了 9000 分
    sandbox.Board.publish({ uid: 'rival003', name: '通关了', score: 1300, level: 2,
      lv: { 2: 1300 }, st: { 2: 1 } }, true);
    sandbox.Board.publish({ uid: 'rival004', name: '没通关', score: 9000, level: 2,
      lv: { 2: 9000 }, st: { 1: 3 } }, true);
    $('btn-leaderboard').dispatch('click');
    $('btn-lb-hub-level').dispatch('click');
    $('lb-level-swap').dispatch('click');
    const pick = ($('lb-picker').children || []).filter((b) => String(b.textContent) === '第 2 关')[0];
    if (pick) pick.dispatch('click');
    const rows = ($('lb-list').children || []).map((row) => {
      const inner = (row.children || [])[0];
      return { cls: String(row.className || ''), h: String((inner && inner.innerHTML) || '') };
    });
    let passIdx = -1, failIdx = -1;
    rows.forEach((r, i) => {
      if (r.h.indexOf('通关了') >= 0) passIdx = i;
      if (r.h.indexOf('没通关') >= 0) failIdx = i;
    });
    const passOk = passIdx >= 0 && rows[passIdx].cls.indexOf('none') < 0 &&
      /lb-rank">[0-9🥇🥈🥉]/.test(rows[passIdx].h);
    const failOk = failIdx >= 0 && rows[failIdx].cls.indexOf('none') >= 0 &&
      /lb-rank">—/.test(rows[failIdx].h) && /lb-score">9000</.test(rows[failIdx].h);
    const orderOk = passIdx >= 0 && failIdx >= 0 && passIdx < failIdx;
    $('lb-view').dispatch('click');
    $('leaderboard-menu').dispatch('click');
    return passOk && failOk && orderOk;
  })());

  // 14d3. 0 分的人在榜上显示「未上榜」，名次也不挂奖牌
  check('零分显示未上榜', (() => {
    const saved = lsMap.get('nl2:progress');
    lsMap.set('nl2:progress', JSON.stringify({}));
    sandbox.__nl_test.refreshMenu();
    $('btn-leaderboard').dispatch('click');
    $('btn-lb-hub-all').dispatch('click');
    // 榜行是 row > .lb-swipe > span，桩里 innerHTML 不会往下拼，两层都读
    const txt = Array.prototype.map.call($('lb-list').children || [], (r) =>
      String(r.innerHTML || '') +
      Array.prototype.map.call(r.children || [], (c) => String(c.innerHTML || '')).join('')
    ).join('');
    const ok = txt.indexOf('未上榜') >= 0 && txt.indexOf('lb-score none') >= 0;
    $('lb-view').dispatch('click');
    $('leaderboard-menu').dispatch('click');
    lsMap.set('nl2:progress', saved);
    sandbox.__nl_test.refreshMenu();
    return ok;
  })());

  // 14d3-2. 分数左边带星星：总榜 = 总星数，局榜 = 这一局的星
  check('榜上分数左边带星星（总榜总星数 / 局榜本局星）', (() => {
    sandbox.__nl_test.refreshMenu();
    const entry = sandbox.__nl_test.myEntry();
    const st = entry.st || {};
    const totalStars = Object.keys(st).reduce((n, k) => n + (st[k] || 0), 0);
    const rowHtml = () => Array.prototype.map.call($('lb-list').children || [], (r) =>
      Array.prototype.map.call(r.children || [], (c) => String(c.innerHTML || '')).join('')
    ).join('|');
    $('btn-leaderboard').dispatch('click');
    $('btn-lb-hub-all').dispatch('click');
    const allTxt = rowHtml();
    $('lb-view').dispatch('click');
    $('btn-lb-hub-level').dispatch('click');
    // 挑一个「有星」的关卡（局榜默认可能停在没打过的关上）
    const wantLv = Object.keys(st).filter((k) => st[k] > 0)
      .sort((a, b) => Number(a) - Number(b))[0];
    $('lb-level-swap').dispatch('click');
    const pick = ($('lb-picker').children || [])
      .filter((b) => String(b.textContent) === '第 ' + wantLv + ' 关')[0];
    if (pick) pick.dispatch('click');
    const lvTxt = rowHtml();
    $('lb-view').dispatch('click');
    $('leaderboard-menu').dispatch('click');
    const lvStars = (st[wantLv] || 0);
    // 总榜：图标 + 右对齐数字（★ 87）；局榜：这一局的 ★★★
    return totalStars > 0 && allTxt.indexOf('★</i><b>' + totalStars + '</b>') >= 0 &&
      lvStars > 0 && lvTxt.indexOf('★'.repeat(lvStars)) >= 0;
  })());
  // 14d3-3. 星星跟着榜单一起同步（发出去 / 快照里都带 st）
  check('排行榜协议带真星级（st），老数据按分数门槛反推', (() => {
    const src = fs.readFileSync(path.join(__dirname, 'js', 'board.js'), 'utf8');
    return /st: e\.st \|\| \{\}/.test(src) && /function cleanSt/.test(src) &&
      /e\.lv \|\| \{\}, e\.st \|\| \{\}\]/.test(src) &&
      /st: row\[7\]/.test(src) && /function starsFromScore/.test(jsSrc) &&
      /function totalStarsOf/.test(jsSrc);
  })());


  // 14d3-3c. 局内工具栏：背包和说明中间多一个购物商店
  check('局内工具栏 🎒 背包 与 📖 说明 中间是 🛒 商店，点它进同一个购物商店', (() => {
    const row = htmlSrc0.slice(htmlSrc0.indexOf('class="tools-row"'), htmlSrc0.indexOf('tools-row tools-row-2'));
    const seq = ['btn-music-game', 'btn-backpack-game', 'btn-shop-game', 'btn-rules-game', 'btn-settings-game']
      .map((id) => row.indexOf('id="' + id + '"'));
    const ordered = seq.every((pos, i) => pos >= 0 && (i === 0 || pos > seq[i - 1]));
    const icon = /id="btn-shop-game"[^>]*>\s*<span class="icon">🛒<\/span>/.test(row);
    return ordered && icon &&
      /const shopGameBtn = \$\('btn-shop-game'\)/.test(jsSrc) &&
      /function openShop\(\)/.test(jsSrc) &&
      // 局内逛商店静默暂停，关掉接着打
      /if \(S\.playing\) quietPauseGame\(\);\s*\n\s*renderShop\(\);/.test(jsSrc) &&
      htmlSrc0.indexOf('🎒 背包 / 🛒 商店 / 📖 说明') > 0;
  })());

  // 14d3-4. 金币明细：主页点金币进去，按年月 + 类型筛选，明细可上下滚动
  check('金币明细：年 / 月 / 类型三个等宽按键（自绘列表，不用原生下拉）、每笔进出都记账、宽度和其它滚动页一致', (() => {
    const sec = htmlSrc0.slice(htmlSrc0.indexOf('id="coin-menu"'), htmlSrc0.indexOf('id="pause-menu"'));
    const barOk =
      sec.includes('id="ledger-year"') && sec.includes('id="ledger-month"') &&
      sec.includes('id="ledger-type"') && sec.includes('id="ledger-pop"') &&
      !/<select/.test(sec) &&                                        // 原生 select 全部去掉
      (sec.match(/class="ledger-sel"/g) || []).length === 3 &&       // 三个长得一样的按键
      !sec.includes('ledger-prev') && !sec.includes('ledger-next') &&
      sec.includes('id="ledger-list"') &&
      htmlSrc0.includes('id="menu-coins-row"') &&
      // 主页金币：左边「图标 + 金币 + ›」整块可点（数字不在里面），数字仍在最右
      /<span id="menu-coins-btn" title="查看金币明细"><i id="menu-coins-ico" class="menu-coins-ico">🪙<\/i> 金币<em class="menu-coins-more">›<\/em><\/span><span class="menu-coins-wrap"><b id="menu-coins">0<\/b><\/span>/.test(htmlSrc0) &&
      /menu-coins-btn/.test(jsSrc) &&                                    // 点击只绑在左边这一块上
      !/\.menu-coins-row\s*\{[^}]*cursor:\s*pointer/.test(cssSrc) &&     // 整行不再可点
      /\.menu-coins-btn\s*\{[^}]*cursor:\s*pointer/.test(cssSrc) &&
      /\.ledger-list\s*\{[^}]*width:\s*90%/.test(cssSrc) &&
      /\.ledger-list\s*\{[^}]*max-height:\s*64vh/.test(cssSrc) &&
      /\.ledger-bar\s*\{[^}]*width:\s*90%/.test(cssSrc) &&
      /\.ledger-bar\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*1fr\)/.test(cssSrc) &&
      /\.ledger-detail\s*\{[^}]*font-size:\s*11px[^}]*font-weight:\s*400/.test(cssSrc) &&
      // 点过的按键不留蓝焦点框（要跟选择器一起消失，含 :focus-visible）
      /button:focus,[^{]*\{[^}]*outline:\s*none\s*!important/.test(cssSrc) &&
      /button:focus-visible[^{]*\{[^}]*outline:\s*none\s*!important/.test(cssSrc) &&
      // 自绘下拉：绝对定位挂在按键下面，未来月份点不了
      /\.ledger-pop\s*\{[^}]*position:\s*absolute/.test(cssSrc) &&
      /\.ledger-opt\.is-off\s*\{[^}]*pointer-events:\s*none/.test(cssSrc) &&
      /function openLedgerPop/.test(jsSrc) &&
      /function applyLedgerChoice/.test(jsSrc) &&
      /function closeLedgerPop/.test(jsSrc) &&
      // 自绘列表的宽度 / 左右位置按当前按键的实测尺寸来，跟三个选择器对齐
      /function placeLedgerPop/.test(jsSrc) &&
      /pop\.style\.width = btn\.offsetWidth/.test(jsSrc) &&
      /pop\.style\.left = btn\.offsetLeft/.test(jsSrc) &&
      /'coin-menu': 'main-menu'/.test(jsSrc);

    // 干净起点（不要自动补记的「历史收支」干扰计数）
    lsMap.set('nl2:ledger', '[]');
    lsMap.set('nl2:ledgerInit', 'true');
    lsMap.set('nl2:ledgerTop', 'true');
    sandbox.Store.addCoins(120, '测试收入');
    sandbox.Store.spendCoins(50, '购买道具', '洗牌 +1');
    // 去年还有一笔（用来验证换年份）
    const rows = JSON.parse(lsMap.get('nl2:ledger'));
    const lastYear = new Date(new Date().getFullYear() - 1, new Date().getMonth(), 15).getTime();
    rows.push({ t: lastYear, d: 80, m: '去年收入' });   // 去年同一个月，换年份后能直接看到
    lsMap.set('nl2:ledger', JSON.stringify(rows));

    // 只有金币图标能进明细：点行里其它地方（金币两个字、›、右边的数字）都不跳
    $('menu-coins-row').dispatch('click');
    $('menu-coins').dispatch('click');
    const rowNoJump = $('coin-menu').style.display !== 'flex';
    $('menu-coins-btn').dispatch('click');
    const opened = rowNoJump && $('coin-menu').style.display === 'flex';
    const rowsAll = $('ledger-list').children.length;              // 本月只有 2 笔
    const allTxt = $('ledger-list').children.map((c) => String(c.innerHTML)).join('|');

    const curY = String(new Date().getFullYear());
    const curM = new Date().getMonth() + 1;
    // 三个按键上的字：带「年」「月」后缀，类型默认全部
    const labelsOk = String($('ledger-year').textContent) === curY + ' 年' &&
      String($('ledger-month').textContent) === curM + ' 月' &&
      String($('ledger-type').textContent) === '全部';

    // 点「月」：列表弹出来，12 项都带「月」，未来的月份灰掉点不了
    $('ledger-month').dispatch('click');
    const popOpen = $('ledger-pop').style.display === 'flex';
    let monthOpts = $('ledger-pop').children;
    const monthLabels = monthOpts.map((o) => String(o.textContent));
    const monthListOk = monthOpts.length === 12 && monthLabels[0] === '1 月' && monthLabels[11] === '12 月';
    const futureOff = monthOpts.every((o, i) => (i + 1 <= curM) ||
      (o.disabled === true && String(o.className).indexOf('is-off') >= 0));
    const activeOk = monthOpts.filter((o) => String(o.className).indexOf('is-active') >= 0)
      .map((o) => String(o.textContent)).join(',') === curM + ' 月';
    // 点里面的一项才算选中（列表自己关掉，按键文字跟着变）
    const janOpt = monthOpts[0];
    janOpt.dispatch('click');
    const pickMonthOk = String($('ledger-month').textContent) === '1 月' &&
      $('ledger-pop').style.display === 'none';
    // 再点开可以换回来
    $('ledger-month').dispatch('click');
    $('ledger-pop').children[curM - 1].dispatch('click');
    const backMonthOk = String($('ledger-month').textContent) === curM + ' 月';

    // 点开另一个按键：上一个自动收起（一次只开一个）
    $('ledger-month').dispatch('click');
    $('ledger-year').dispatch('click');
    let yearOpts = $('ledger-pop').children;
    const yearLabels = yearOpts.map((o) => String(o.textContent));
    const oneAtATime = $('ledger-pop').style.display === 'flex' &&
      $('ledger-year').classList.contains('is-open') &&
      !$('ledger-month').classList.contains('is-open') &&
      yearLabels.filter((x) => /年$/.test(x)).length === yearLabels.length;
    // 再点同一个按键 → 收起
    $('ledger-year').dispatch('click');
    const toggleOk = $('ledger-pop').style.display === 'none' &&
      !$('ledger-year').classList.contains('is-open');

    // 只看收入
    $('ledger-type').dispatch('click');
    $('ledger-pop').children.filter((o) => String(o.textContent) === '收入')[0].dispatch('click');
    const rowsIncome = $('ledger-list').children.length;
    const incomeTxt = String($('ledger-list').children[0].innerHTML);
    // 只看支出：具体买了什么用小字写在「购买道具」右边
    $('ledger-type').dispatch('click');
    $('ledger-pop').children.filter((o) => String(o.textContent) === '支出')[0].dispatch('click');
    const rowsExpense = $('ledger-list').children.length;
    const expenseTxt = String($('ledger-list').children[0].innerHTML);
    const detailOk = expenseTxt.indexOf('购买道具<small class="ledger-detail">洗牌 +1</small>') >= 0;
    $('ledger-type').dispatch('click');
    $('ledger-pop').children.filter((o) => String(o.textContent) === '全部')[0].dispatch('click');

    // 换到去年：年份列表只到今年（不能选未来），过去年份 12 个月都能选
    const prevY = String(Number(curY) - 1);
    $('ledger-year').dispatch('click');
    yearOpts = $('ledger-pop').children;
    const hasPrev = yearOpts.map((o) => String(o.textContent)).indexOf(prevY + ' 年') >= 0;
    yearOpts.filter((o) => String(o.textContent) === prevY + ' 年')[0].dispatch('click');
    const prevTxt = $('ledger-list').children.map((c) => String(c.innerHTML)).join('|');
    const prevRows = $('ledger-list').children.length;
    $('ledger-month').dispatch('click');
    const prevAllMonths = $('ledger-pop').children.every((o) => String(o.className).indexOf('is-off') < 0);
    $('ledger-month').dispatch('click');

    // 回到今年：未来月份灰掉，点了不生效（月份还是当月）
    $('ledger-year').dispatch('click');
    $('ledger-pop').children.filter((o) => String(o.textContent) === curY + ' 年')[0].dispatch('click');
    $('ledger-month').dispatch('click');
    const futureOpt = $('ledger-pop').children[11];
    futureOpt.dispatch('click');                                   // 12 月是灰的
    const clampOk = String($('ledger-month').textContent) === curM + ' 月' &&
      $('ledger-pop').style.display === 'flex';
    $('ledger-month').dispatch('click');                           // 收起
    const rowsBack = $('ledger-list').children.length;

    // 没有记录的月份 → 空提示
    if (curM !== 1) {
      $('ledger-month').dispatch('click');
      $('ledger-pop').children[0].dispatch('click');
    }
    const janEmpty = curM === 1 ? true
      : ($('ledger-list').children.length === 1 &&
        String($('ledger-list').children[0].className).indexOf('ledger-empty') >= 0);
    if (curM !== 1) {
      $('ledger-month').dispatch('click');
      $('ledger-pop').children[curM - 1].dispatch('click');
    }

    // 列表开着时点空白：先收起列表（面板不动），再点一次才回主页
    $('ledger-month').dispatch('click');
    const popBefore = $('ledger-pop').style.display;
    $('coin-menu').dispatch('click');
    const popFirst = popBefore === 'flex' && $('ledger-pop').style.display === 'none' &&
      $('coin-menu').style.display === 'flex';
    $('coin-menu').dispatch('click');
    const backHome = $('coin-menu').style.display === 'none';

    // 退出再点进来：上次选到哪年哪月、哪个类型，还是那一页
    $('ledger-month').dispatch('click');
    $('ledger-pop').children[1].dispatch('click');                 // 2 月
    $('ledger-type').dispatch('click');
    $('ledger-pop').children.filter((o) => String(o.textContent) === '收入')[0].dispatch('click');
    $('menu-coins-btn').dispatch('click');
    const keepSel = String($('ledger-month').textContent) === '2 月' &&
      String($('ledger-type').textContent) === '收入' &&
      $('coin-menu').style.display === 'flex';
    $('coin-menu').dispatch('click');
    $('ledger-type').dispatch('click');
    $('ledger-pop').children.filter((o) => String(o.textContent) === '全部')[0].dispatch('click');

    // 金币数字实时更新：进账后主页数字当场变，不用手动刷新
    const before = sandbox.Store.getWallet().coins;
    sandbox.Store.addCoins(100, '实时测试');
    const liveCoin = String($('menu-coins').textContent) === String(before + 100);
    sandbox.Store.spendCoins(100, '撤回实时测试');

    return barOk && opened && rowsAll === 2 && allTxt.includes('测试收入') && allTxt.includes('购买道具') &&
      labelsOk && popOpen && monthListOk && futureOff && activeOk && pickMonthOk && backMonthOk &&
      oneAtATime && toggleOk &&
      rowsIncome === 1 && incomeTxt.includes('+120') &&
      rowsExpense === 1 && expenseTxt.includes('−50') && detailOk &&
      hasPrev && prevRows === 1 && prevTxt.includes('去年收入') && prevAllMonths &&
      clampOk && rowsBack === 2 && janEmpty && popFirst && backHome && keepSel && liveCoin;
  })());

  // 14d3-5. 明细上线前的金币：按余额补一条「历史收支」，补过就不再补
  check('金币明细：上线前的收支补成一条「历史收支」，让明细加总 = 钱包余额（只补一次）', (() => {
    const wallet = JSON.parse(lsMap.get('nl2:wallet'));
    const savedLedger = lsMap.get('nl2:ledger');
    lsMap.set('nl2:wallet', JSON.stringify({ coins: 777, items: wallet.items || {} }));
    lsMap.delete('nl2:ledger');
    lsMap.delete('nl2:ledgerInit');
    const first = sandbox.Store.getLedger();
    const seeded = first.length === 1 && first[0].d === 777 && first[0].m === '历史收支' &&
      String(first[0].x || '').length > 0 && String(lsMap.get('nl2:ledgerInit')) === 'true';
    // 再来一次不会重复补
    sandbox.Store.addCoins(3, '后续收入');
    const again = sandbox.Store.getLedger();
    const onceOk = again.length === 2 && again.filter((x) => x.m === '历史收支').length === 1;
    const total = again.reduce((a, x) => a + x.d, 0);
    const balanceOk = total === sandbox.Store.getWallet().coins;
    // 老档：明细刚上线时已经有几笔零散记录（余额对不上）→ 按差额补，不是整笔重置
    lsMap.set('nl2:wallet', JSON.stringify({ coins: 400, items: wallet.items || {} }));
    lsMap.set('nl2:ledger', JSON.stringify([{ t: Date.now(), d: -50, m: '购买道具', x: '洗牌 +1' }]));
    lsMap.delete('nl2:ledgerInit');
    lsMap.delete('nl2:ledgerTop');
    const mixed = sandbox.Store.getLedger();
    const last = mixed.filter((x) => x.m === '历史收支')[0];
    const topUpOk = mixed.length === 2 && !!last && last.d === 450 &&
      String(lsMap.get('nl2:ledgerTop')) === 'true' &&
      mixed.reduce((a, x) => a + x.d, 0) === 400 &&
      last.t <= mixed.filter((x) => x.m !== '历史收支')[0].t;   // 排在明细最前面
    // 还原，后面的用例还要用
    lsMap.set('nl2:wallet', JSON.stringify(wallet));
    if (savedLedger === undefined) lsMap.delete('nl2:ledger'); else lsMap.set('nl2:ledger', savedLedger);
    lsMap.set('nl2:ledgerInit', 'true');
    lsMap.set('nl2:ledgerTop', 'true');
    return seeded && onceOk && balanceOk && topUpOk;
  })());

  // 14d3-6. 老记录（没有具体说明的购买道具 / 成就奖励）也要补上具体说明
  check('金币明细：老的「购买道具 / 成就奖励」记录也按金额补上具体说明（只认得出才补）', (() => {
    const saved = lsMap.get('nl2:ledger');
    const now = Date.now();
    lsMap.set('nl2:ledger', JSON.stringify([
      { t: now, d: -150, m: '购买道具' },
      { t: now, d: 100, m: '成就奖励' },
      { t: now, d: 30, m: '通关奖励' }
    ]));
    lsMap.delete('nl2:ledgerDetail');
    const rows = sandbox.Store.getLedger();
    const buy = rows.filter((x) => x.m === '购买道具')[0];
    const ach = rows.filter((x) => x.m === '成就奖励')[0];
    const other = rows.filter((x) => x.m === '通关奖励')[0];
    const ok = !!buy.x && buy.x.indexOf('洗牌') >= 0 && ach.x === '银阶' && !other.x;
    // 已经有说明的记录不改
    lsMap.set('nl2:ledger', JSON.stringify([{ t: now, d: -150, m: '购买道具', x: '洗牌 +1' }]));
    lsMap.delete('nl2:ledgerDetail');
    const kept = sandbox.Store.getLedger()[0].x === '洗牌 +1';
    if (saved === undefined) lsMap.delete('nl2:ledger'); else lsMap.set('nl2:ledger', saved);
    return ok && kept;
  })());

  // 14d4a. 签到入口：日期条状态 + 点红色漏签日补签（50 金币 / 天，不发奖励）
  check('漏签日子标红写「补签」，点开补签窗 → 确认窗，扣 50 金币补签且不发奖励', (() => {
    const Store = sandbox.Store;
    const today = Store.todayKey();
    const savedTasks = lsMap.get('nl2:tasks');
    const savedWallet = lsMap.get('nl2:wallet');
    const savedAccs = lsMap.get('nl2:accounts');
    // 签到起始日 = 注册那天：把建号时间改成 3 天前 → 前天/昨天/大前天三天漏签，4 天前在注册之前不算漏签
    const accs = JSON.parse(savedAccs || '[]');
    accs.forEach((a) => { a.created = Date.now() - 3 * 86400000; });
    lsMap.set('nl2:accounts', JSON.stringify(accs));
    // 只签了今天
    const cycleStart = Store.todayKey(new Date(Date.now() - 2 * 86400000));
    lsMap.set('nl2:tasks', JSON.stringify({ date: today, list: [], signDay: 1, signDate: today, dates: [today], cycleStart: cycleStart }));
    lsMap.set('nl2:wallet', JSON.stringify({ coins: 1000, items: {} }));
    $('btn-welfare').dispatch('click');
    const streakTxt = String($('welfare-streak').textContent);
    const all = ($('welfare-sign').children || []);
    const cells = all.filter((c) => String(c.className).indexOf('missed') >= 0);
    const beforeRegOk = String(all[0].className).indexOf('missed') < 0 &&
      String(all[0].className).indexOf('before') >= 0 &&
      String(all[0].innerHTML).indexOf('—') >= 0;   // 注册之前：灰色一条杠，不标补签
    const missedOk = cells.length === 3 && cells.every((c) => String(c.innerHTML).indexOf('补签') >= 0);
    cells[0].dispatch('click');
    // 第一步：补签窗口（费用 50、不发奖励）
    const panelShown = $('makeup-menu').style.display === 'flex';
    const panelTxt = String($('makeup-menu-cost').innerHTML);
    $('btn-makeup-go').dispatch('click');
    // 第二步：确认窗口
    const dialogShown = $('makeup-confirm').style.display === 'flex' && $('makeup-menu').style.display === 'none';
    $('btn-makeup-yes').dispatch('click');
    const coins = sandbox.Store.getWallet().coins;
    const st = sandbox.Store.signStats();
    const dialogClosed = $('makeup-confirm').style.display === 'none';
    $('welfare-menu').dispatch('click');
    if (savedTasks !== undefined) lsMap.set('nl2:tasks', savedTasks);
    if (savedWallet !== undefined) lsMap.set('nl2:wallet', savedWallet);
    if (savedAccs !== undefined) lsMap.set('nl2:accounts', savedAccs); else lsMap.delete('nl2:accounts');
    return streakTxt.indexOf('连续签到 1 天') >= 0 && beforeRegOk && missedOk && panelShown &&
      panelTxt.indexOf('50') >= 0 && panelTxt.indexOf('不发') >= 0 && dialogShown && dialogClosed &&
      coins === 950 && st.streak === 2 && st.day === 2;
  })());

  // 14d4a2. 今天不算漏签：没签也正常显示当日奖励（黑字 50），不标「补签」、点了也不弹补签窗
  check('签到页今天那格不标「补签」：正常显示当日奖励 50、黑字，不弹补签窗', (() => {
    const Store = sandbox.Store;
    const savedAccs = lsMap.get('nl2:accounts');
    const savedTasks = lsMap.get('nl2:tasks');
    const savedWallet = lsMap.get('nl2:wallet');
    const accs = JSON.parse(savedAccs || '[]');
    accs.forEach((a) => { a.created = Date.now() - 3 * 86400000; });
    lsMap.set('nl2:accounts', JSON.stringify(accs));
    lsMap.set('nl2:tasks', JSON.stringify({ date: Store.todayKey(), list: [], signDay: 0, signDate: '', dates: [], cycleStart: Store.todayKey(new Date(Date.now() - 2 * 86400000)) }));
    lsMap.set('nl2:wallet', JSON.stringify({ coins: 1000, items: {} }));
    $('btn-welfare').dispatch('click');
    const all = Array.from($('welfare-sign').children || []);
    const todayCell = all.filter((c) => String(c.className).indexOf('today') >= 0)[0];
    const ok = todayCell &&
      String(todayCell.className).indexOf('missed') < 0 &&
      String(todayCell.innerHTML).indexOf('补签') < 0 &&
      String(todayCell.innerHTML).indexOf('50') >= 0;   // 日期下面是当日奖励 50
    todayCell.dispatch('click');
    const noPanel = $('makeup-menu').style.display !== 'flex';
    $('welfare-menu').dispatch('click');
    if (savedTasks !== undefined) lsMap.set('nl2:tasks', savedTasks);
    if (savedWallet !== undefined) lsMap.set('nl2:wallet', savedWallet);
    if (savedAccs !== undefined) lsMap.set('nl2:accounts', savedAccs); else lsMap.delete('nl2:accounts');
    return ok && noPanel && /\.sign-day\.today:not\(\.signed\)/.test(cssSrc);
  })());

  // 14d4b. 注销：Board.remove 把人从榜单拿掉，旧消息 / 老快照不再复活
  check('注销后从排行榜消失且不复活', (() => {
    const e = { uid: 'udeltest001', name: '要删的人', score: 5000, level: 3, ts: Date.now() - 60000, pv: '', lv: {} };
    sandbox.Board.publish(e, true);
    const inList = sandbox.Board.list().some((r) => r.uid === 'udeltest001');
    sandbox.Board.remove('udeltest001');
    const gone = !sandbox.Board.list().some((r) => r.uid === 'udeltest001');
    // ts 早于注销时间的旧消息一律不收
    sandbox.Board.publish(Object.assign({}, e, { name: '复活尝试' }), true);
    const noRevive = !sandbox.Board.list().some((r) => r.uid === 'udeltest001');
    return inList && gone && noRevive;
  })());

  // 14e. 账号没有名字不能玩：补资料窗口拦下 btn-play
  check('账号缺名字时被弹窗拦截', (() => {
    const arr = JSON.parse(lsMap.get('nl2:accounts'));
    const mine = arr.filter((a) => a.id === sandbox.Account.current().id)[0];
    const old = mine.name;
    mine.name = '';
    lsMap.set('nl2:accounts', JSON.stringify(arr));
    $('btn-play').dispatch('click');
    const blocked = $('fix-menu').style.display === 'flex';
    mine.name = old;
    lsMap.set('nl2:accounts', JSON.stringify(arr));
    $('fix-menu').style.display = 'none';
    return blocked;
  })());

  // 14f. 成就五阶：灰 → 铜 → 银 → 金 → 彩（按进度依次解锁）
  check('成就按进度依次升阶', (() => {
    const savedStats = lsMap.get('nl2:mstats');
    const savedAcht = lsMap.get('nl2:macht');
    const savedAch = lsMap.get('nl2:mach');
    lsMap.delete('nl2:macht');
    lsMap.delete('nl2:mach');
    lsMap.set('nl2:mstats', JSON.stringify({ wins: 2 }));
    M.check();
    const t1 = M.tierOf('first');       // 2 ≥ 1 → 铜
    lsMap.set('nl2:mstats', JSON.stringify({ wins: 12 }));
    M.check();
    const t2 = M.tierOf('first');       // 12 ≥ 10 → 银
    lsMap.set('nl2:mstats', JSON.stringify({ wins: 200 }));
    M.check();
    const t3 = M.tierOf('first');       // 200 ≥ 100 → 彩
    if (savedStats === undefined) lsMap.delete('nl2:mstats'); else lsMap.set('nl2:mstats', savedStats);
    if (savedAcht === undefined) lsMap.delete('nl2:macht'); else lsMap.set('nl2:macht', savedAcht);
    if (savedAch === undefined) lsMap.delete('nl2:mach'); else lsMap.set('nl2:mach', savedAch);
    return t1 === 1 && t2 === 2 && t3 === 4;
  })());

  // 15. 冰块关：铺冰 + 目标值校准 + 冰上格子不可交换
  const iceDef = { id: 99, theme: 'candy', moves: 20, goal: { type: 'ice', target: 10 }, ice: 10, stars: [1, 2, 3] };
  sandbox.__nl_test.start(1, { def: iceDef });
  let iceN = 0;
  let st = sandbox.__nl_test.state();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (st.ice[r][c]) iceN++;
  check('冰块关铺出 10 块冰', iceN === 10);
  // 冰块一出现就是 2 层（目标按层数算 = 10 块 × 2 层）
  let iceLayers = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) iceLayers += st.ice[r][c] || 0;
  check('每块冰一出现就是 2 层', iceLayers === iceN * 2);
  // 目标按「块」算：玩家数得出 10 块冰，目标就是 10（不再按层数虚高到 20）
  check('冰块目标值按实际块数校准（不是按层）', st.goal.target === iceN);

  // 16. 货运关：货物数量 + 目标值
  const dropDef = { id: 98, theme: 'candy', moves: 20, goal: { type: 'drop', target: 4 }, cargo: 4, stars: [1, 2, 3] };
  sandbox.__nl_test.start(1, { def: dropDef });
  let cargoN = 0;
  st = sandbox.__nl_test.state();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (st.board[r][c] && st.board[r][c].cargo) cargoN++;
  check('货运关放置 4 件货物', cargoN === 4);
  check('货运关目标值 = 货物数', st.goal.target === cargoN);

  // 16b. 第四章开始：运送关的货物里混入糖果，目标栏写「运送货物」并报「场上还剩 N 件」
  sandbox.__nl_test.start(1, { def: { id: 33, chapter: 4, theme: 'candy', moves: 30, goal: { type: 'drop', target: 10 }, cargo: 10, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  let candyCnt = 0, keyCnt = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const b = st.board[r][c];
    if (b && b.cargo) {
      const list = Array.isArray(b.cargo) ? b.cargo : [b.cargo];
      list.forEach((cg) => { if (cg.kind === 'candy') candyCnt++; else if (cg.kind === 'key') keyCnt++; });
    }
  }
  const bar0 = sandbox.Goals.barText(st.goal);
  check('第四章运送关钥匙 + 糖果混装（数量和目标一致；目标栏只写「运送货物 x/y」，不再有「场上还剩」）',
    candyCnt === 5 && keyCnt === 5 && st.goal.hasCandy === true && st.goal.target === 10 &&
    bar0.indexOf('运送货物') >= 0 && bar0.indexOf('场上还剩') < 0 &&
    bar0.indexOf('运送糖果') < 0);
  // 第三章（id < 31）仍是纯钥匙
  sandbox.__nl_test.start(1, { def: { id: 21, chapter: 3, theme: 'ocean', moves: 30, goal: { type: 'drop', target: 7 }, cargo: 7, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  let ch3Candy = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const b = st.board[r][c];
    if (b && b.cargo) {
      const list = Array.isArray(b.cargo) ? b.cargo : [b.cargo];
      list.forEach((cg) => { if (cg.kind === 'candy') ch3Candy++; });
    }
  }
  check('第四章之前没有糖果', ch3Candy === 0 && st.goal.hasCandy !== true);

  // 17. 护送关
  const rescueDef = { id: 97, theme: 'ocean', moves: 20, goal: { type: 'rescue', target: 3 }, rescue: 3, stars: [1, 2, 3] };
  sandbox.__nl_test.start(1, { def: rescueDef });
  st = sandbox.__nl_test.state();
  check('护送关目标值 = 奶龙数', st.goal.target === 3 && st.rescueLeft === 3);

  // 17b. 关卡数据写错（要求 5 只但只铺了 4 只）时，目标跟着场上实际数量走
  sandbox.__nl_test.start(1, { def: { id: 95, theme: 'ocean', moves: 20, goal: { type: 'rescue', target: 5 }, rescue: 4, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  let nlOnBoard = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    if (st.board[r][c] && st.board[r][c].cargo && st.board[r][c].cargo.kind === 'nailong') nlOnBoard++;
  }
  check('目标数永远和棋盘上的奶龙数一致（写错也不会出现打不过的关）',
    nlOnBoard === 4 && st.goal.target === 4);

  // 17c. 货物被消掉时会往下掉一格；下面那格已经有货也照掉，两件重合在一起
  sandbox.__nl_test.start(1, { def: { id: 94, theme: 'ocean', moves: 20, goal: { type: 'rescue', target: 1 }, rescue: 1, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  // 确定性棋盘：避免随机特殊块把消除集合扩出去、干扰断言
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) st.board[r][c] = { type: (r + c * 2) % 6, special: 0 };
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (st.board[r][c]) st.board[r][c].cargo = null;
  st.board[2][0].cargo = { kind: 'nailong' };      // 要被消掉的那只
  st.board[3][0].cargo = { kind: 'key' };          // 正下方已经有一件货（照掉，重合）
  for (let r = 4; r < 7; r++) st.board[r][0].cargo = { kind: 'key' };   // 整列都是货
  const countCargo = () => {
    let n = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const b = st.board[r][c];
        if (!b || !b.cargo) continue;
        n += Array.isArray(b.cargo) ? b.cargo.length : 1;   // 一格可能压着多件
      }
    }
    return n;
  };
  // cargoGot 记的是「送达的货物总数」（奶龙也算在内），和场上剩的一起就是全部
  const cargoTotal = () => countCargo() + (st.goal.cargoGot || 0);
  const cargoCntBefore = cargoTotal();
  const delivBefore = st.goal.cargoGot || 0;
  await sandbox.__nl_test.resolveClear(new Set(['2,0']), []);
  check('货物被顶下时不会丢（下面有货也照掉，总数守恒）', cargoTotal() === cargoCntBefore);
  // 新规则：被消的货物落到「下面最近的方块」上（r3 的方块），不再直接送达；
  // r2 的奶龙和 r3 原有的钥匙叠在一格，等方块被送到最底行才算送达
  check('货物被消后落到下方最近的方块上（奶龙叠在 r3 钥匙上面，不直接送达）',
    (st.goal.cargoGot || 0) === delivBefore &&
    Array.isArray(st.board[3][0].cargo) &&
    st.board[3][0].cargo.length === 2 &&
    st.board[3][0].cargo[1].kind === 'nailong' &&
    !(st.board[7][0] && st.board[7][0].cargo));

  // 17c-2. 洗牌：钥匙 / 奶龙钉在原位，只有底下的方块参与洗牌
  sandbox.__nl_test.start(1, { def: { id: 95, theme: 'ocean', moves: 20, goal: { type: 'rescue', target: 2 }, rescue: 2, drop: 1, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (st.board[r][c]) st.board[r][c].cargo = null;
  st.board[1][2].cargo = { kind: 'nailong' };
  st.board[4][5].cargo = { kind: 'nailong' };
  st.board[6][1].cargo = { kind: 'key' };
  const cargoMap = () => {
    const m = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const b = st.board[r][c];
        if (b && b.cargo) m.push(r + ',' + c + ':' + b.cargo.kind);
      }
    }
    return m.join('|');
  };
  const cargoSnapshot = cargoMap();
  let cargoKept = cargoSnapshot.split('|').length === 3;
  for (let i = 0; i < 8 && cargoKept; i++) {
    sandbox.__nl_test.reshuffle();
    if (cargoMap() !== cargoSnapshot) cargoKept = false;
  }
  check('洗牌时钥匙 / 奶龙位置不变（只洗底下的方块）', cargoKept);
  check('洗牌后棋盘没有现成的三消', sandbox.__nl_test.findMatches().size === 0);

  // 17d. 总分只算通关的关卡：没过关那一局的分数不进总分
  sandbox.Store.recordLevel(40, 9999, 0);    // 第 40 关没通关，分再高也不算
  sandbox.Store.recordLevel(39, 1200, 3);    // 通关了才算
  const progAll = sandbox.Store.getProgress();
  const expectTotal = Object.keys(progAll).reduce(
    (n, k) => n + ((progAll[k] && progAll[k].stars > 0) ? (progAll[k].score || 0) : 0), 0);
  const myEntry = sandbox.__nl_test.myEntry();
  check('总分只累加已通关关卡（没过关的高分不算）',
    expectTotal > 0 && myEntry.score === expectTotal &&
    expectTotal < 9999 + 1200);
  check('总分口径的代码里带着 stars > 0 的过滤',
    /r\.stars > 0 \? \(r\.score \|\| 0\) : 0/.test(jsSrc) &&
    /if \(!\(all\[k\] && all\[k\]\.stars > 0\)\) return;/.test(jsSrc));

  // 17e. 过关后还能接着玩：步数关显示「剩余步数」，限时关显示「剩余秒数」（除了单位完全一样）
  sandbox.__nl_test.start(1, { def: { id: 92, theme: 'ocean', moves: 20, goal: { type: 'score', target: 100 }, stars: [100, 200, 300] } });
  sandbox.__nl_test.state().moves = 7;
  sandbox.__nl_test.win();
  check('步数关过关后：还有剩余步数点击继续游戏',
    $('btn-clear-continue').style.display === 'inline-block' &&
    $('btn-clear-continue').textContent === '还有剩余步数点击继续游戏');
  sandbox.__nl_test.start(1, { def: { id: 91, theme: 'ocean', moves: 20, goal: { type: 'timed', target: 100, time: 60 }, stars: [100, 200, 300] } });
  sandbox.__nl_test.state().timeLeft = 42;
  sandbox.__nl_test.win();
  check('限时关过关后：还有剩余秒数点击继续游戏（只把步数换成秒数）',
    $('btn-clear-continue').style.display === 'inline-block' &&
    $('btn-clear-continue').textContent === '还有剩余秒数点击继续游戏' &&
    $('clear-moves-label').textContent === '剩余时间');

  // 17f. 每日挑战结算逻辑与普通关不同：不显示历史最高；按键按三星与否变化
  lsMap.delete('nl2:daily');
  sandbox.__nl_test.start(9999, { def: { id: 9001, theme: 'ocean', moves: 20, goal: { type: 'score', target: 100 }, stars: [100, 200, 300] }, daily: true });
  sandbox.__nl_test.state().moves = 7;
  sandbox.__nl_test.win();
  check('每日挑战过关没到三星：不显示历史最高，按键只有重新开始（蓝色、和返回主页一样大）和返回主页',
    $('clear-high-row').style.display === 'none' &&
    $('btn-clear-continue').style.display === 'inline-block' &&
    $('btn-clear-continue').textContent === '🔄 重新开始' &&
    $('btn-clear-continue').classList.contains('daily-restart') &&
    $('clear-moves-label').textContent === '使用步数' &&
    String($('clear-moves').textContent) === '13' &&              // 20 步用了 13 步
    $('btn-next-level').style.display === 'none' &&
    $('btn-clear-home').style.display !== 'none') &&
  check('「重新开始」蓝色、大小与「返回主页」一致（180px / 14px / 17px）',
    /#level-clear #btn-clear-continue\.daily-restart\s*\{[^}]*width:\s*180px/.test(cssSrc) &&
    /#level-clear #btn-clear-continue\.daily-restart\s*\{[^}]*padding:\s*14px 0/.test(cssSrc) &&
    /#level-clear #btn-clear-continue\.daily-restart\s*\{[^}]*font-size:\s*17px/.test(cssSrc) &&
    /#level-clear #btn-clear-continue\.daily-restart\s*\{[^}]*#3a78ff/.test(cssSrc));
  lsMap.delete('nl2:daily');
  sandbox.__nl_test.start(9999, { def: { id: 9001, theme: 'ocean', moves: 20, goal: { type: 'score', target: 100 }, stars: [100, 200, 300] }, daily: true });
  sandbox.__nl_test.state().moves = 19;
  sandbox.__nl_test.state().score = 500;    // 三星分
  sandbox.__nl_test.win();
  check('每日挑战拿到三星：当天封盘，按键只有返回主页',
    $('btn-clear-continue').style.display === 'none' &&
    $('btn-next-level').style.display === 'none' &&
    JSON.parse(lsMap.get('nl2:daily') || '{}').stars === 3);
  check('每日挑战重开走 restartCurrentLevel（失败后点重新挑战不会再变成第 1 关）',
    /const again = \$\('btn-restart'\);[\s\S]{0,400}restartCurrentLevel\(\);/.test(jsSrc) &&
    /rt\.textContent = S\.daily \? '🔄 重新开始' : '重新挑战';/.test(jsSrc));
  lsMap.delete('nl2:daily');   // 还原，别影响后面的用例

  // 17g. 每日挑战中途退出 → 回来是「继续」不是重开（棋盘 / 步数 / 分数原样回来）
  const ddef = sandbox.Tasks.getDailyChallenge();
  sandbox.__nl_test.start(9999, { def: ddef, seed: ddef.seed, daily: true });
  sandbox.__nl_test.state().moves = 14;
  sandbox.__nl_test.state().score = 321;
  sandbox.__nl_test.saveRun();                     // 模拟中途退出时的自动存档
  sandbox.__nl_test.start(1, {});                  // 先去玩了别的
  const resumed = sandbox.__nl_test.loadRun();     // 回到每日挑战面板点「继续挑战」
  check('每日挑战中途退出后能继续：局面 / 步数 / 分数原样回来，不是重新开始',
    resumed === true &&
    sandbox.__nl_test.state().daily === true &&
    sandbox.__nl_test.state().moves === 14 &&
    sandbox.__nl_test.state().score === 321);
  lsMap.delete('nl2:save');    // 还原
  check('每日挑战续玩校验同一天的种子（跨天存档自动作废），开局入口先试续玩再重开',
    /if \(s\.daily\) \{[\s\S]{0,400}s\.seed !== d\.seed\) return false;/.test(jsSrc) &&
    /run\.daily && d && run\.seed === d\.seed && loadRun\(\) return;|if \(run && run\.daily && d && run\.seed === d\.seed && loadRun\(\)\) return;/.test(jsSrc));

  // 18. 提示按钮：消耗次数并高亮（先开一局正常的，上面两局已经结算掉了）
  sandbox.__nl_test.start(1, { def: { id: 90, theme: 'candy', moves: 20, goal: { type: 'score', target: 100 }, stars: [1, 2, 3] } });
  const hintBefore = sandbox.__nl_test.state().hintLeft;
  $('btn-hint').dispatch('click');
  st = sandbox.__nl_test.state();
  check('点提示后次数 -1', st.hintLeft === hintBefore - 1);
  check('点提示后有高亮格子', Array.isArray(st.hintCells) && st.hintCells.length === 2);

  // 19. 金币不足时「再来 3 步」按钮禁用
  sandbox.Store.addCoins(-999999);
  sandbox.__nl_test.state().reviveUsed = false;
  const coinsNow = sandbox.Store.getWallet().coins;
  check('金币不足时复活不可用', coinsNow < 200);

  // 20. 模式：无尽开局
  sandbox.__nl_test.start(1, { def: { id: 0, theme: 'star', colors: 6, moves: 40, stars: [0, 0, 0], goal: { type: 'score', target: 999999 } }, mode: 'endless' });
  st = sandbox.__nl_test.state();
  check('无尽模式开局（40 步无目标）', st.mode === 'endless' && st.moves === 40);
  check('无尽模式目标栏显示最佳分', $('target-bar').textContent.includes('无尽'));

  // 21. 节奏关：踩点倍率函数可用
  sandbox.__nl_test.start(1, { def: { id: 0, theme: 'ocean', colors: 6, moves: 0, stars: [0, 0, 0], goal: { type: 'timed', target: 999999, time: 90 } }, mode: 'rhythm' });
  st = sandbox.__nl_test.state();
  check('节奏关开局（90 秒限时）', st.mode === 'rhythm' && st.timerOn === true);

  // 22. 冰块：相邻消除砸掉一层冰并推进目标
  sandbox.__nl_test.start(1, { def: { id: 96, theme: 'candy', moves: 20, goal: { type: 'ice', target: 3 }, ice: 3, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  // 确定性布置：全盘无特殊块，只放一块 2 层厚冰 —— 随机棋盘可能把两块冰都铺在
  // nb 旁边，一次消除砸透两块，进度 +2 会让下面的断言偶发翻车
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    st.board[r][c] = { type: (r + c * 2) % 6, special: 0 };
    st.ice[r][c] = 0;
    st.chain[r][c] = 0;
  }
  st.ice[4][3] = 2;
  const iceCell = { r: 4, c: 3 };
  // 邻格必须本身没有冰/锁链，否则这次「消除」会撞障碍而不算
  let nb = null;
  [{ r: iceCell.r, c: iceCell.c + 1 }, { r: iceCell.r, c: iceCell.c - 1 }, { r: iceCell.r - 1, c: iceCell.c }, { r: iceCell.r + 1, c: iceCell.c }]
    .some((p) => {
      if (p.r >= 0 && p.r < 8 && p.c >= 0 && p.c < 8 && st.board[p.r][p.c] && !st.ice[p.r][p.c] && !st.chain[p.r][p.c]) { nb = p; return true; }
      return false;
    });
  const iceBefore = st.goal.iceCleared || 0;
  const iceBeforeVal = st.ice[iceCell.r][iceCell.c];
  await sandbox.__nl_test.resolveClear(new Set([nb.r + ',' + nb.c]), []);
  // 厚冰有 2 层，一次相邻消除只砸掉一层
  check('相邻消除砸掉一层冰', st.ice[iceCell.r][iceCell.c] === iceBeforeVal - 1);
  // 进度按「块」算：只掉一层还不算清掉一块，砸透那一块才 +1
  check('只砸掉一层时目标进度不动（按块算）', (st.goal.iceCleared || 0) === iceBefore);
  if (st.ice[iceCell.r][iceCell.c] > 0) {
    // 再砸一次把这整块砸透（新的一步：每步每格只砸一层，这里手动清一次记账）
    st.iceHitMove = {};
    await sandbox.__nl_test.resolveClear(new Set([nb.r + ',' + nb.c]), []);
  }
  check('整块冰砸透后目标进度 +1', (st.goal.iceCleared || 0) === iceBefore + 1);

  // 22b. 厚冰：一次相邻消除只能砸掉 1 层（2 层厚冰必须砸两次）
  sandbox.__nl_test.start(1, { def: { id: 97, theme: 'candy', moves: 20, goal: { type: 'ice', target: 8 }, iceHard: 4, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  let hardCell = null;
  for (let r = 0; r < 8 && !hardCell; r++) for (let c = 0; c < 8 && !hardCell; c++) {
    if (st.ice[r][c] === 3 && st.board[r][c]) hardCell = { r: r, c: c };
  }
  let hnb = null;
  [{ r: hardCell.r, c: hardCell.c + 1 }, { r: hardCell.r, c: hardCell.c - 1 }, { r: hardCell.r - 1, c: hardCell.c }, { r: hardCell.r + 1, c: hardCell.c }]
    .some((p) => {
      if (p.r >= 0 && p.r < 8 && p.c >= 0 && p.c < 8 && st.board[p.r][p.c] && !st.ice[p.r][p.c] && !st.chain[p.r][p.c]) { hnb = p; return true; }
      return false;
    });
  await sandbox.__nl_test.resolveClear(new Set([hnb.r + ',' + hnb.c]), []);
  check('厚冰一次相邻消除只砸一层（3 层还剩 2 层）', st.ice[hardCell.r][hardCell.c] === 2);

  // 22c. 厚冰被两侧同时消除（夹心）也只砸一层
  const hr = hardCell.r, hc = hardCell.c;
  if (hc >= 1 && hc <= 6 && st.ice[hr][hc - 1] === 0 && st.ice[hr][hc + 1] === 0 &&
      !st.chain[hr][hc - 1] && !st.chain[hr][hc + 1]) {
    sandbox.__nl_test.start(1, { def: { id: 98, theme: 'candy', moves: 20, goal: { type: 'ice', target: 8 }, iceHard: 4, stars: [1, 2, 3] } });
    st = sandbox.__nl_test.state();
    let hc2 = null;
    for (let r = 0; r < 8 && !hc2; r++) for (let c = 1; c < 7 && !hc2; c++) {
      if (st.ice[r][c] === 3 && st.board[r][c] && st.ice[r][c - 1] === 0 && st.ice[r][c + 1] === 0 &&
          st.board[r][c - 1] && st.board[r][c + 1] && !st.chain[r][c - 1] && !st.chain[r][c + 1]) hc2 = { r: r, c: c };
    }
    if (hc2) {
      await sandbox.__nl_test.resolveClear(new Set([hc2.r + ',' + (hc2.c - 1), hc2.r + ',' + (hc2.c + 1)]), []);
      check('厚冰两侧同时消除仍只砸一层', st.ice[hc2.r][hc2.c] === 2);
    }
  }

  // 23. 锁链：第一次被消只解锁，方块留下
  sandbox.__nl_test.start(1, { def: { id: 95, theme: 'candy', moves: 20, goal: { type: 'score', target: 5000 }, chain: 3, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  let chainCell = null;
  for (let r = 0; r < 8 && !chainCell; r++) for (let c = 0; c < 8 && !chainCell; c++) if (st.chain[r][c]) chainCell = { r: r, c: c };
  await sandbox.__nl_test.resolveClear(new Set([chainCell.r + ',' + chainCell.c]), []);
  check('锁链被消一次即解锁', st.chain[chainCell.r][chainCell.c] === 0);
  check('解锁时方块保留', !!st.board[chainCell.r][chainCell.c]);

  // 23b. 锁链参与同色三连：交换凑成带锁链格的三连也能消（解链不消块）
  sandbox.__nl_test.start(1, { def: { id: 92, theme: 'candy', moves: 20, goal: { type: 'score', target: 999999 }, chain: 1, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  let cc2 = null;
  for (let r = 0; r < 8 && !cc2; r++) for (let c = 2; c < 6 && !cc2; c++) {
    if (st.chain[r][c] && st.board[r][c] && !st.ice[r][c] &&
        st.board[r][c - 1] && st.board[r][c - 2] && !st.chain[r][c - 1] && !st.chain[r][c - 2] && !st.ice[r][c - 1] && !st.ice[r][c - 2] &&
        st.board[r][c + 1] && !st.chain[r][c + 1] && !st.ice[r][c + 1]) cc2 = { r: r, c: c };
  }
  if (cc2) {
    // 摆成 …type5, type0, [锁链type0], type0 …，交换左边两格凑成三连
    st.board[cc2.r][cc2.c] = { type: 0, special: 0 };
    st.board[cc2.r][cc2.c + 1] = { type: 0, special: 0 };
    st.board[cc2.r][cc2.c - 1] = { type: 5, special: 0 };
    st.board[cc2.r][cc2.c - 2] = { type: 0, special: 0 };
    await sandbox.__nl_test.swap({ r: cc2.r, c: cc2.c - 2 }, { r: cc2.r, c: cc2.c - 1 });
    check('锁链格参与三连：交换凑成也能解链', st.chain[cc2.r][cc2.c] === 0);
    check('解链时锁链格方块保留', !!st.board[cc2.r][cc2.c]);
  }

  // 24. 货物：落到底行即送达并推进目标
  sandbox.__nl_test.start(1, { def: { id: 94, theme: 'candy', moves: 20, goal: { type: 'drop', target: 2 }, cargo: 2, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  st.board[6][0] = { type: 0, special: 0, cargo: { kind: 'key' } };
  const cargoBefore = st.goal.cargoGot || 0;
  await sandbox.__nl_test.resolveClear(new Set(['7,0']), []);
  check('货物落到底行即送达', (st.goal.cargoGot || 0) === cargoBefore + 1);

  // 24b. 运送关随机对局守恒：送达数 + 场上剩余数恒等于开局总数，
  // 目标数永远等于「已送达 + 场上剩的」，撤回后要一模一样地回到走之前
  await (async () => {
    const countOnBoard = () => {
      let n = 0;
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const b = st.board[r] && st.board[r][c];
        if (b && b.cargo) n += Array.isArray(b.cargo) ? b.cargo.length : 1;
      }
      return n;
    };
    const defs = [
      { id: 46, theme: 'forest', moves: 60, goal: { type: 'drop', target: 10 }, cargo: 10, ivy: 2, stars: [1, 2, 3] },
      { id: 55, theme: 'sky', moves: 60, goal: { type: 'drop', target: 8 }, cargo: 8, portal: 2, track: 2, stars: [1, 2, 3] },
      { id: 65, theme: 'desert', moves: 60, goal: { type: 'drop', target: 8 }, cargo: 8, sand: 6, fog: 10, stars: [1, 2, 3] }
    ];
    let bad = '';
    for (const def of defs) {
      if (bad) break;
      sandbox.__nl_test.start(1, { def: def });
      st = sandbox.__nl_test.state();
      st.undoLeft = 999;              // 测试里每步都要撤回，别被「每局 3 次」拦住
      const initial = countOnBoard();
      const hasSand = !!def.sand;
      for (let mv = 0; mv < 6 && st.playing && !bad; mv++) {
        // 先在本地找一步确定能消的交换（不打动画、不耗步数），再真正走这一步
        let move = null;
        for (let r = 0; r < 8 && !move; r++) for (let c = 0; c < 8 && !move; c++) {
          for (const d of [[0, 1], [1, 0]]) {
            const r2 = r + d[0], c2 = c + d[1];
            if (r2 >= 8 || c2 >= 8) continue;
            const a = st.board[r][c], b = st.board[r2][c2];
            if (!a || !b) continue;
            if (st.chain[r][c] || st.chain[r2][c2] || st.ice[r][c] > 0 || st.ice[r2][c2] > 0) continue;
            st.board[r][c] = b; st.board[r2][c2] = a;
            const ok = sandbox.__nl_test.findMatches().size > 0;
            st.board[r][c] = a; st.board[r2][c2] = b;
            if (ok) { move = [{ r: r, c: c }, { r: r2, c: c2 }]; break; }
          }
        }
        if (!move) break;
        const gotBefore = st.goal.cargoGot || 0;
        const onBefore = countOnBoard();
        await sandbox.__nl_test.swap(move[0], move[1]);
        if (!st.playing) break;
        const gotNow = st.goal.cargoGot || 0;
        const onNow = countOnBoard();
        if (gotNow === gotBefore && onNow === onBefore) continue;   // 没消成（比如全是障碍），换一步
        // 目标数必须跟着场上走：已送达 + 场上剩的
        if (st.goal.target !== gotNow + onNow) {
          bad = def.id + ' 目标数没校准：target=' + st.goal.target + ' 已送=' + gotNow + ' 场上=' + onNow;
        } else if (gotNow + onNow > gotBefore + onBefore) {
          bad = def.id + ' 货物凭空变多：走之前共=' + (gotBefore + onBefore) + ' 走之后共=' + (gotNow + onNow);
        } else if (!hasSand && gotNow + onNow < gotBefore + onBefore) {
          bad = def.id + ' 货物凭空消失：走之前共=' + (gotBefore + onBefore) + ' 走之后共=' + (gotNow + onNow);
        }
        if (bad) break;
        // 撤回：必须一模一样回到走之前
        sandbox.__nl_test.undoMove();
        const uGot = st.goal.cargoGot || 0, uOn = countOnBoard();
        if (uGot !== gotBefore || uOn !== onBefore) {
          bad = def.id + ' 撤回后货物对不上：应 ' + gotBefore + '+' + onBefore + ' 实 ' + uGot + '+' + uOn;
          break;
        }
        // 撤回后重走这一步（棋盘已经回到走之前，同样的交换应该照样能消）
        await sandbox.__nl_test.swap(move[0], move[1]);
      }
      if (!bad && !hasSand && (st.goal.cargoGot || 0) + countOnBoard() !== initial) {
        bad = def.id + ' 一整局下来货物总数变了：开局=' + initial +
          ' 现在=' + ((st.goal.cargoGot || 0) + countOnBoard());
      }
    }
    check('运送关随机对局：目标数永远=已送达+场上剩的，货物不丢不重，撤回能精确回到走之前', !bad);
    if (bad) console.log('  ↳ 失败详情: ' + bad);
  })();

  // 25. 全障碍也不会卡死（整片冰时 resolveClear 安全返回）
  const allIce = new Set();
  sandbox.__nl_test.start(1, { def: { id: 93, theme: 'candy', moves: 20, goal: { type: 'ice', target: 64 }, ice: 30, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (st.ice[r][c]) allIce.add(r + ',' + c);
  const r0 = await sandbox.__nl_test.resolveClear(allIce, []);
  check('全是冰时安全返回 0', r0 === 0);

  // 26. 货物被消掉 → 落到下方最近的方块上（r6），不直接送达；整列没方块才直送
  sandbox.__nl_test.start(1, { def: { id: 92, theme: 'candy', moves: 20, goal: { type: 'drop', target: 2 }, cargo: 2, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  // 确定性棋盘：避免随机特殊块把消除集合扩到别处、干扰断言
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) st.board[r][c] = { type: (r + c * 2) % 6, special: 0 };
  const cargoObj = { kind: 'key' };
  st.board[5][3] = { type: 1, special: 0, cargo: cargoObj };
  const delivBefore26 = st.goal.cargoGot || 0;
  await sandbox.__nl_test.resolveClear(new Set(['5,3']), []);
  check('货物被消后落到下方最近的方块（r6），暂不送达',
    (st.goal.cargoGot || 0) === delivBefore26 &&
    st.board[6][3] && st.board[6][3].cargo && st.board[6][3].cargo.kind === 'key' &&
    !(st.board[5][3] && st.board[5][3].cargo === cargoObj));

  // 26b. 被消货物下面整列没有方块 → 直接算运送成功
  sandbox.__nl_test.start(1, { def: { id: 92, theme: 'candy', moves: 20, goal: { type: 'drop', target: 2 }, cargo: 2, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) st.board[r][c] = { type: (r + c * 2) % 6, special: 0 };
  const cargoObj2 = { kind: 'key' };
  st.board[2][5] = { type: 1, special: 0, cargo: cargoObj2 };
  for (let r = 3; r < 8; r++) st.board[r][5] = null;   // 下面整列掏空
  const delivBefore26b = st.goal.cargoGot || 0;
  await sandbox.__nl_test.resolveClear(new Set(['2,5']), []);
  check('被消货物下面没有方块时直接送达',
    (st.goal.cargoGot || 0) === delivBefore26b + 1);

  // 27. 彩虹 + 普通块交换、彩虹本身没被消（没凑成三连）：不触发，换回原位
  sandbox.__nl_test.start(1, { def: { id: 91, theme: 'candy', moves: 20, goal: { type: 'score', target: 999999 }, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  // 铺一个确定性的无三连棋盘（横竖步进都不会连成 3 个），排除随机棋盘偶发三连干扰
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    st.board[r][c] = { type: (r + c * 2) % 6, special: 0 };
  }
  const rainbowObj = { type: 0, special: Sp.TYPE.RAINBOW };
  st.board[4][4] = rainbowObj;
  st.board[4][5] = { type: 1, special: 0 };
  st.board[4][3] = { type: 2, special: 0 };
  st.board[3][4] = { type: 3, special: 0 };
  st.board[5][4] = { type: 4, special: 0 };
  st.board[3][5] = { type: 5, special: 0 };
  st.board[5][5] = { type: 2, special: 0 };
  st.board[4][6] = { type: 3, special: 0 };
  // 记录交换前彩虹图案（type 0）的方块对象引用
  const type0Objs = new Set();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const b = st.board[r][c];
    if (b && b.type === 0 && b !== rainbowObj) type0Objs.add(b);
  }
  await sandbox.__nl_test.swap({ r: 4, c: 4 }, { r: 4, c: 5 });
  check('彩虹没被消时交换不触发（彩虹回到原位）', st.board[4][4] === rainbowObj);
  let type0Left2 = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const b = st.board[r][c];
    if (b && type0Objs.has(b)) type0Left2++;
  }
  check('彩虹不触发时什么都不消', type0Objs.size > 0 && type0Left2 === type0Objs.size);

  // 27c. 彩虹作为三连的一部分被消掉：自身图案的全盘方块都消掉，彩虹也消掉
  sandbox.__nl_test.start(1, { def: { id: 90, theme: 'candy', moves: 20, goal: { type: 'score', target: 999999 }, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  const rainbowObj2 = { type: 0, special: Sp.TYPE.RAINBOW };
  st.board[4][4] = rainbowObj2;
  st.board[4][5] = { type: 0, special: 0 };
  st.board[4][6] = { type: 7, special: 0 };
  st.board[4][7] = { type: 0, special: 0 };
  st.board[3][4] = { type: 1, special: 0 };
  st.board[5][4] = { type: 2, special: 0 };
  st.board[3][5] = { type: 3, special: 0 };
  st.board[5][5] = { type: 4, special: 0 };
  st.board[3][6] = { type: 1, special: 0 };
  st.board[5][6] = { type: 2, special: 0 };
  st.board[3][7] = { type: 3, special: 0 };
  st.board[5][7] = { type: 4, special: 0 };
  const type0Objs2 = new Set();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const b = st.board[r][c];
    if (b && b.type === 0 && b !== rainbowObj2) type0Objs2.add(b);
  }
  // 交换后凑成 (4,4)(4,5)(4,6) 三连，其中 (4,4) 是彩虹
  await sandbox.__nl_test.swap({ r: 4, c: 6 }, { r: 4, c: 7 });
  let r2gone = true, t0left = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const b = st.board[r][c];
    if (!b) continue;
    if (b === rainbowObj2) r2gone = false;
    if (type0Objs2.has(b)) t0left++;
  }
  check('彩虹被三连消掉后自己也被消除', r2gone);
  check('彩虹触发时清掉自身图案的全盘方块', type0Objs2.size > 0 && t0left === 0);

  // 27b. 彩虹被普通三连 / 炸弹 / 线消波及消除时：引爆彩虹自身图案（不是场上最多的颜色）
  const rbBoard = [...Array(8)].map(() => [...Array(8)].map(() => ({ type: 1, special: 0 })));
  rbBoard[2][2] = { type: 0, special: Sp.TYPE.RAINBOW };   // 0.jpg 带彩虹
  rbBoard[4][4] = { type: 0, special: 0 };
  rbBoard[5][5] = { type: 0, special: 0 };
  // 场上 type 1 占绝大多数（旧逻辑会引爆 type 1）——新逻辑必须引爆 type 0
  const rbExp2 = Sp.expandClears(rbBoard, 8, 8, new Set(['2,2']), {});
  check('彩虹被消除时展开自身图案的全场方块',
    rbExp2.cells.has('4,4') && rbExp2.cells.has('5,5') && !rbExp2.cells.has('2,5'));

  // 28. 设置结构：只有「音乐设置」和「账号安全」
  check('设置只有音乐设置 / 账号安全两个入口',
    htmlSrc.includes('btn-goto-music-settings') && htmlSrc.includes('btn-goto-account') &&
    !htmlSrc.includes('id="btn-recover"'));
  check('音乐设置里装音量 / 播放列表 / 导入 / 恢复默认',
    ['btn-goto-volume', 'btn-goto-playlist', 'btn-goto-import'].every((id) =>
      htmlSrc.indexOf(id) > htmlSrc.indexOf('id="music-settings-menu"')) &&
    htmlSrc.indexOf('id="btn-reset-bgm"') > htmlSrc.indexOf('id="music-settings-menu"'));
  check('账号安全里装修改密码 + 切换账号（修改密码在上面）',
    htmlSrc.indexOf('id="btn-goto-password"') > 0 &&
    htmlSrc.indexOf('id="btn-goto-password"') < htmlSrc.indexOf('id="btn-goto-switch"'));

  // 29. 登录页 / 登录失败提示
  $('settings-menu').style.display = 'flex';
  $('btn-goto-account').dispatch('click');
  check('账号安全面板显示当前账号 + 注册时间（yy-MM-dd HH:mm:ss 补零，比如 26-11-06 19:18:22）', $('account-menu').style.display === 'flex' &&
    String($('account-cur-name').textContent) === '测试奶龙' &&
    /^\d{2}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String($('account-created').textContent)));
  check('账号安全页右边的值和左边标签一样大（16px），身份号码本身小一号（13px）', (() => {
    const css = fs.readFileSync(path.join(__dirname, 'css', 'themes.css'), 'utf8');
    return /#account-menu \.result-box b \{ font-size: 16px/.test(css) &&
      /#account-menu b#account-uid \{[^}]*font-size: 13px/.test(css);   // 优先级要压过上面 16px 的 b 规则
  })());
  $('btn-goto-switch').dispatch('click');
  check('切换账号列表有当前账号', $('switch-menu').style.display === 'flex' &&
    $('acct-list').children.length >= 1);
  $('btn-switch-login').dispatch('click');
  check('「登录其他账号」→ 退出当前号并回到登录页',
    $('auth-menu').style.display === 'flex' && !sandbox.Account.loggedIn());

  $('btn-auth-login').dispatch('click');
  $('auth-name').value = '测试奶龙';
  $('auth-pass').value = 'wrong-pass';
  $('btn-auth-submit').dispatch('click');
  await sleep(80);   // submitAuth 现在是 async：本机失败后会去服务器找（沙盒里没有云，直接走到失败提示）
  check('密码错：两个输入框都变红', $('auth-name').classList.contains('error') &&
    $('auth-pass').classList.contains('error'));
  check('密码错：下面出现红色小字提示',
    String($('auth-err').textContent) === '名字或密码不正确，请确认后再次输入');

  $('auth-pass').value = '123456';
  $('btn-auth-submit').dispatch('click');
  await sleep(150);
  check('名字密码都对：直接进入', sandbox.Account.loggedIn() &&
    sandbox.Account.current().name === '测试奶龙');
  const coinsAtSwitchAway = sandbox.Store.getWallet().coins;

  // 30. 注册：敏感词拦下，普通名字建新号
  sandbox.Account.logout();
  $('btn-auth-register').dispatch('click');
  $('auth-name').value = '黄君丽';
  $('auth-pass').value = 'ab1234';
  $('btn-auth-submit').dispatch('click');
  check('敏感词：输入框变红', $('auth-name').classList.contains('error'));
  check('敏感词：提示「改名字含敏感词，请重新输入」',
    String($('auth-err').textContent) === '改名字含敏感词，请重新输入');

  $('auth-name').value = '小号';
  $('btn-auth-submit').dispatch('click');
  await sleep(520);
  check('注册出来是一个新号（金币 / 进度都是空的）',
    sandbox.Account.current().name === '小号' &&
    sandbox.Store.getWallet().coins === 0 &&
    Object.keys(sandbox.Store.getProgress()).length === 0);

  // 31. 切换账号：切回原号，数据各自独立
  const mainAcc = sandbox.Account.list().filter((a) => a.name === '测试奶龙')[0];
  check('本机存了两个账号', sandbox.Account.list().length === 2);
  const sw = sandbox.Account.switchTo(mainAcc.id);
  check('切换回原号：金币和关卡进度都在',
    sw.ok && sandbox.Store.getWallet().coins === coinsAtSwitchAway &&
    (sandbox.Store.getProgress()[1] || {}).stars === 3);
  check('切回来名字也回到原号', sandbox.Meta.nickname() === '测试奶龙');

  // 31b-3. 存档码：换网址 / 换设备时整份搬回来
  check('账号安全页和登录页都有存档码入口',
    htmlSrc0.includes('id="btn-goto-backup"') && htmlSrc0.includes('id="backup-menu"') &&
    htmlSrc0.includes('id="btn-auth-backup"'));
  check('生成页只有生成框 + 生成/复制同排（没有返回键，点背景回账号页）',
    htmlSrc0.includes('点击下面的「生成」') &&
    htmlSrc0.indexOf('id="btn-backup-copy"') > 0 &&
    htmlSrc0.indexOf('class="btn-row"') > 0 &&
    !htmlSrc0.includes('id="btn-backup-back"'));
  check('导入页只有粘贴框 + 导入键（没有返回键，点背景回上一层）',
    htmlSrc0.includes('id="backup-import-menu"') &&
    htmlSrc0.includes('点击下面的「导入」') &&
    !htmlSrc0.includes('id="btn-backup-import-back"') &&
    !htmlSrc0.includes('id="backup-input" placeholder="把存档码粘贴到这里'));
  check('存档码：导出 → 清空存储 → 导入，账号和进度都回来', (() => {
    const curIdBefore = sandbox.Account.currentId();
    const code = sandbox.Account.exportBackup();
    const nAcc = sandbox.Account.list().length;
    const coins = sandbox.Store.getWallet().coins;
    const stars = Object.keys(sandbox.Store.getProgress()).length;
    Array.from(lsMap.keys()).filter((k) => k.indexOf('nl2:') === 0).forEach((k) => lsMap.delete(k));
    const curId = curIdBefore;
    const cleared = sandbox.Account.list().length;
    const r = sandbox.Account.importBackup(code);
    const back = sandbox.Account.list();
    const sw = sandbox.Account.switchTo(curId);
    return cleared === 0 && r.ok === true && back.length === nAcc && sw.ok === true &&
      sandbox.Store.getWallet().coins === coins &&
      Object.keys(sandbox.Store.getProgress()).length === stars;
  })());
  check('存档码乱贴会被挡下', (() => {
    const before = sandbox.Account.list().length;
    const r = sandbox.Account.importBackup('随便一段文字');
    return r.ok === false && sandbox.Account.list().length === before;
  })());

  // 32. yone 的 1360 金币奖励：发到邮箱，自己领
  const coinsBeforeYone = sandbox.Store.getWallet().coins;
  const yReg = sandbox.Account.register('yone', 'yone1234');
  const coinsFresh = sandbox.Store.getWallet().coins;
  const grants = sandbox.Account.claimGrants();
  const yMail = sandbox.Mail.get('gift-yone-1360');
  check('注册 yone 后奖励进邮箱（1360 金币作附件）',
    yReg.ok && grants.length === 1 && !!yMail && yMail.coins === 1360 &&
    yMail.hasGift === true);
  check('邮件里的金币不会自动进钱包', coinsFresh === sandbox.Store.getWallet().coins);
  check('奖励邮件不会重复发', sandbox.Account.claimGrants().length === 0);
  check('在邮箱里领取后才到账',
    sandbox.Mail.claim('gift-yone-1360').ok === true &&
    sandbox.Store.getWallet().coins === coinsFresh + 1360);

  // 32b. ii 的 666 金币：补偿按名字发，和账号一样区分大小写
  const iiUpper = sandbox.Account.register('II', 'ii123456');
  const iiUpperGrant = sandbox.Account.claimGrants();
  check('名字写成 II（大写）不发补偿：补偿也区分大小写',
    iiUpper.ok && iiUpperGrant.length === 0 && !sandbox.Mail.get('gift-ii-666'));
  const iiReg = sandbox.Account.register('ii', 'ii123456');
  const coinsIi = sandbox.Store.getWallet().coins;
  const iiGrant = sandbox.Account.claimGrants();
  const iiMail = sandbox.Mail.get('gift-ii-666');
  check('注册 ii 后邮箱收到 666 金币的奖励',
    iiReg.ok && iiGrant.length === 1 && !!iiMail && iiMail.coins === 666 &&
    sandbox.Store.getWallet().coins === coinsIi);
  check('ii 的奖励不会重复发', sandbox.Account.claimGrants().length === 0);
  check('ii 领取后 666 金币到账',
    sandbox.Mail.claim('gift-ii-666').ok === true &&
    sandbox.Store.getWallet().coins === coinsIi + 666);
  check('别的账号看不到发给 ii 的邮件', (() => {
    const main = sandbox.Account.list().filter((a) => a.name === '测试奶龙')[0];
    sandbox.Account.switchTo(main.id);
    const seen = sandbox.Mail.list().filter((m) => m.id === 'gift-ii-666').length;
    sandbox.Account.switchTo(sandbox.Account.list().filter((a) => a.name === 'II')[0].id);
    return seen === 0;
  })());

  // 33. 老账号缺名字 / 缺密码 → 弹窗补齐才能玩
  sandbox.Account.logout();
  lsMap.set('nl2:wallet', JSON.stringify({ coins: 10, items: {} }));
  lsMap.set('nl2:mnick', JSON.stringify('老玩家'));
  const ensured = sandbox.Account.ensure();
  check('老存档会被认领成账号、但没有密码', ensured.ok &&
    sandbox.Account.needsFix().pass === true && sandbox.Account.current().name === '老玩家');
  $('btn-play').dispatch('click');
  await sleep(20);
  check('资料不全时点「开始游戏」→ 被拦下并弹出补资料窗口',
    $('fix-menu').style.display === 'flex');
  $('fix-name').value = '老玩家';
  $('fix-pass').value = 'abcd1234';
  $('fix-pass2').value = 'abcd1234';
  $('btn-fix-save').dispatch('click');
  check('补好名字 + 密码后不再拦', $('fix-menu').style.display === 'none' &&
    !sandbox.Account.needsFix().any && !!sandbox.Account.current().pass);

  // 34. 已存在账号的名字含敏感词 → 弹改名字窗口
  const accList = JSON.parse(lsMap.get('nl2:accounts'));
  const meAcc = accList.filter((a) => a.id === sandbox.Account.current().id)[0];
  meAcc.name = '黄君丽';
  lsMap.set('nl2:accounts', JSON.stringify(accList));
  check('已存在账号含敏感词 → 判定需要改名', sandbox.Account.needsFix().sensitive === true);
  $('btn-play').dispatch('click');
  await sleep(20);
  check('含敏感词会弹修复窗口，且只让改名字',
    $('fix-menu').style.display === 'flex' && $('fix-pass-rows').style.display === 'none');
  $('fix-name').value = '老玩家2';
  $('btn-fix-save').dispatch('click');
  check('改完名字就放行', sandbox.Account.needsFix().any === false &&
    sandbox.Account.current().name === '老玩家2');

  // 35. 名字还是默认的「奶龙玩家」→ 强制改名窗口（没有返回键，改完才自己关）
  const nickAccs = JSON.parse(lsMap.get('nl2:accounts'));
  nickAccs.filter((a) => a.id === sandbox.Account.current().id)[0].name = '奶龙玩家';
  lsMap.set('nl2:accounts', JSON.stringify(nickAccs));
  $('btn-play').dispatch('click');
  await sleep(20);
  check('名字是「奶龙玩家」→ 点开始游戏被拦下，弹出改名窗口',
    $('nick-menu').style.display === 'flex');
  check('强制改名窗口没有返回键（关不掉）', $('btn-nick-cancel').style.display === 'none');
  $('btn-nick-cancel').dispatch('click');
  check('点返回也关不掉这个窗口', $('nick-menu').style.display === 'flex');
  $('btn-nick-save').dispatch('click');
  check('空名字点确定 → 窗口还在，并给出原因',
    $('nick-menu').style.display === 'flex' && $('nick-err').textContent.length > 0);
  $('nick-input').value = '奶龙玩家';
  $('btn-nick-save').dispatch('click');
  check('还想叫「奶龙玩家」→ 被拒绝', $('nick-menu').style.display === 'flex' &&
    $('nick-err').textContent.indexOf('奶龙玩家') >= 0);
  $('nick-input').value = '小龙人';
  $('btn-nick-save').dispatch('click');
  check('改名成功 → 窗口自动关闭，账号名一起更新',
    $('nick-menu').style.display === 'none' && sandbox.Account.current().name === '小龙人');

  // 35b. 账号上云：玩家自己输密码建档（没网时也要说清楚，不能静默失败）
  check('上云窗口：只有黑色「存到服务器」一个按钮，没有「以后再说」',
    /id="cloud-menu"/.test(htmlSrc0) && /id="cloud-pass"/.test(htmlSrc0) &&
    /class="btn-secondary" id="btn-cloud-save"/.test(htmlSrc0) &&
    !/btn-cloud-later/.test(htmlSrc0));
  check('账号上云是新方法（供界面调用）',
    typeof sandbox.Account.pushAccountToCloud === 'function');
  check('账号安全页有常驻的「存到服务器」入口', /id="btn-goto-cloud"/.test(htmlSrc0));
  // 16b. 存档账号面板：云存档 + 存档码 二合一，点空白回账号安全页
  check('「💾 存档账号」在切换账号下面，里面是云存档 + 存档码；点空白回账号安全页', (() => {
    const box = htmlSrc0.slice(htmlSrc0.indexOf('id="account-menu"'), htmlSrc0.indexOf('id="save-menu"'));
    const inOrder = box.indexOf('btn-goto-switch') >= 0 && box.indexOf('btn-goto-save') >= 0 &&
      box.indexOf('btn-goto-switch') < box.indexOf('btn-goto-save') &&
      box.indexOf('btn-goto-cloud') < 0 && box.indexOf('btn-goto-backup') < 0;
    const save = htmlSrc0.slice(htmlSrc0.indexOf('id="save-menu"'), htmlSrc0.indexOf('save-menu') + 400);
    const hasBoth = /id="btn-goto-cloud"/.test(save) && /id="btn-goto-backup"/.test(save);
    // 真点一下：存档账号面板打开 → 点背景回账号安全页
    $('btn-goto-account').dispatch('click');
    $('btn-goto-save').dispatch('click');
    const opened = $('save-menu').style.display === 'flex' && $('account-menu').style.display === 'none';
    $('save-menu').dispatch('click');
    const back = $('save-menu').style.display === 'none' && $('account-menu').style.display === 'flex';
    $('account-menu').dispatch('click');
    return inOrder && hasBoth && opened && back && /'save-menu': 'account-menu'/.test(jsSrc);
  })());
  check('已绑定的号点「存到服务器」先真实推送验证（号被删过会自动解绑重弹窗口）',
    /pushCloud\(true\)\.then/.test(jsSrc) && !/已经存到服务器了/.test(jsSrc));
  // 16c. 自动存档健壮性：开机拉取失败时每轮先补拉（不然整场都不会自动存）；令牌过期自动解绑重绑
  check('自动存档：拉取没成功先补拉再推；令牌过期自动解绑并尝试重绑', (() => {
    const accSrc = fs.readFileSync(path.join(__dirname, 'js', 'account.js'), 'utf8');
    return /if \(!cloudPulled\) \{ pullCloud\(\); return; \}/.test(accSrc) &&
      /function expireAcc\(acc\)/.test(accSrc) &&
      /String\(r\.reason \|\| ''\)\.indexOf\('过期'\) >= 0\) \{\s*\n\s*expireAcc\(acc\);\s*\n\s*try \{ autoCloudSave\(\); \} catch \(e\) \{\}/.test(accSrc) &&
      /String\(r\.reason \|\| ''\)\.indexOf\('过期'\) >= 0\) expireAcc\(acc\);/.test(accSrc);
  })());
  // 16d. 每次退出都要上传：切后台（visibilitychange → hidden）普通推；关页面（pagehide）keepalive 兜底
  check('每次退出都上传服务器：切后台立即推，关闭页面用 keepalive 兜底', (() => {
    const accSrc = fs.readFileSync(path.join(__dirname, 'js', 'account.js'), 'utf8');
    const cloudSrc = fs.readFileSync(path.join(__dirname, 'js', 'cloud.js'), 'utf8');
    return /visibilitychange'[\s\S]{0,200}visibilityState === 'hidden'[\s\S]{0,120}onLeave\(false\)/.test(accSrc) &&
      /addEventListener\('pagehide', \(\) => onLeave\(true\)\)/.test(accSrc) &&
      /function pushCloud\(force, urgent\)/.test(accSrc) &&
      /Cloud\.push\(slot, !!force, !!urgent\)/.test(accSrc) &&
      /function push\(slot, force, urgent\)/.test(cloudSrc) &&
      /keepalive: ka/.test(cloudSrc) &&
      /pushing && !urgent/.test(cloudSrc);   // 退出推送不被「正在推送」挡掉
  })());
  check('上云窗口点背景可以关掉（进度仍在本机，之后在账号安全里再存）',
    /case 'cloud-menu':\s*\n\s*skipCloud\(\);/.test(jsSrc) &&
    /function skipCloud\(\)/.test(jsSrc) && /cloudOffered = true;/.test(jsSrc) &&
    !/if \(typeof cloudForced !== 'undefined' && cloudForced\)/.test(jsSrc));
  check('注册后自动把账号存到服务器', /bgRegister\(acc, p\.pass\)/.test(jsSrc));
  check('改名 / 改密码会同步到服务器',
    /Cloud\.rename/.test(jsSrc) && /Cloud\.setPass/.test(jsSrc));
  const cloudTry = await sandbox.Account.pushAccountToCloud('abcd1234');
  check('连不上服务器时上云会返回可读的失败原因',
    cloudTry && cloudTry.ok === false && !!cloudTry.reason);

  // 名字改回测试用的「老玩家2」，后面的用例还按这个名字找账号
  sandbox.Account.rename('老玩家2');
  check('测试账号名复位', sandbox.Account.current().name === '老玩家2');

  // 35. 📮 邮箱：系统邮件 / 未读角标 / 领取奖励
  // 34b. 欢迎邮件时间 = 建号时间；建号之前的系统邮件不展示；金币明细公告对所有老玩家可见
  check('邮箱：欢迎邮件按建号时间显示，注册之前发的系统邮件看不到', (() => {
    const curId = sandbox.Account.current().id;
    const accs = JSON.parse(lsMap.get('nl2:accounts'));
    const me = accs.filter((a) => a.id === curId)[0];
    const saved = me.created;
    me.created = new Date(2026, 10, 6, 9, 0, 0).getTime();     // 2026-11-06 09:00 建号
    lsMap.set('nl2:accounts', JSON.stringify(accs));
    const list = sandbox.Mail.list();
    const ids = list.map((m) => m.id);
    const welcome = list.filter((m) => m.id === 'welcome-2026-11')[0];
    const welcomeOk = !!welcome && welcome.at === '2026-11-06 09:00';
    // 11-05 发的两封公告：建号之前 → 看不到；11-08 发的两封 → 能看到（含金币明细公告）
    const oldHidden = ids.indexOf('notice-account-2026-11') < 0 && ids.indexOf('notice-rules-2026-11') < 0;
    const newVisible = ids.indexOf('notice-master-2026-11-08') >= 0 && ids.indexOf('notice-ledger-2026-11-08') >= 0;
    me.created = saved;
    lsMap.set('nl2:accounts', JSON.stringify(accs));
    return welcomeOk && oldHidden && newVisible;
  })());

  // 新号看不到建号之前的系统邮件，这里补一封「刚发的」带奖励邮件，后面的领取用例用它
  const nowStamp = (() => {
    const d = new Date();
    const p = (n) => (n < 10 ? '0' + n : String(n));
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  })();
  sandbox.Mail.sendMail({ id: 'utest-gift-b', at: nowStamp, icon: '🎁', title: '测试奖励', coins: 50 });
  const mailListAll = sandbox.Mail.list();
  const giftMail = mailListAll.filter((m) => m.hasGift)[0];
  check('邮箱里有系统邮件（公告 + 带奖励的）',
    mailListAll.length >= 3 && !!giftMail && !!giftMail.coins);
  // 34c. 开服玩家礼：只发给 2026-11-09 11:05:00 之前注册的玩家（精确到秒）
  check('开服玩家邮件：截止前注册的能看到（666 金币），截止后注册的看不到', (() => {
    const curId = sandbox.Account.current().id;
    const accs = JSON.parse(lsMap.get('nl2:accounts'));
    const me = accs.filter((a) => a.id === curId)[0];
    const saved = me.created;
    const setCreated = (ts) => { me.created = ts; lsMap.set('nl2:accounts', JSON.stringify(accs)); };
    setCreated(new Date(2026, 10, 8, 20, 0, 0).getTime());    // 截止前 → 能看到
    const got = sandbox.Mail.list().filter((m) => m.id === 'opengift-2026-11-09')[0];
    const gotOk = !!got && got.coins === 666 && got.title === '欢迎成为开服玩家';
    setCreated(new Date(2026, 10, 9, 11, 5, 30).getTime());   // 截止后（11:05:30）→ 看不到
    const lateGone = sandbox.Mail.list().every((m) => m.id !== 'opengift-2026-11-09');
    setCreated(new Date(2026, 10, 9, 11, 4, 59).getTime());   // 11:04:59（卡点前 1 秒）→ 能看到
    const edgeOk = sandbox.Mail.list().some((m) => m.id === 'opengift-2026-11-09');
    setCreated(saved);
    lsMap.set('nl2:accounts', JSON.stringify(accs));
    return gotOk && lateGone && edgeOk;
  })());
  check('邮件领取后的按钮是「已领取 xxx 金币」（不再是「奖励已领取」）',
    /已领取 ' \+ m\.coins \+ ' 金币/.test(jsSrc) &&
    /已领取 ' \+ r\.coins \+ ' 金币/.test(jsSrc) &&
    !jsSrc.includes("'奖励已领取'"));
  check('未读数和已读状态初始正确', sandbox.Mail.get(giftMail.id).read === false);
  sandbox.__nl_test.refreshMenu();          // 刚补的那封要让角标重新算一遍
  $('main-menu').style.display = 'flex';
  check('主页邮箱键显示未读角标（数字 = 未读封数）',
    String($('mail-badge').textContent) === String(mailListAll.length) && $('mail-badge').style.display !== 'none');
  $('btn-mail').dispatch('click');
  check('点主页邮箱键打开邮箱列表',
    $('mail-menu').style.display === 'flex' && $('mail-list').children.length === mailListAll.length);

  const coinsBeforeMail = sandbox.Store.getWallet().coins;
  const giftIdx = mailListAll.findIndex((m) => m.id === giftMail.id);
  $('mail-list').children[giftIdx].children[1].dispatch('click');
  check('点邮件进详情页，正文有内容',
    $('mail-view').style.display === 'flex' && $('mail-view-body').textContent.length > 10);
  check('打开邮件即标为已读', sandbox.Mail.get(giftMail.id).read === true);
  // 标题带「：」的邮件：详情页拆成主标题 + 副标题（副标题换行、字号小一号）
  const rulesMail = (sandbox.Mail.list() || []).filter((m) => String(m.title).indexOf('：') >= 0)[0];
  if (rulesMail) {
    $('mail-view').dispatch('click');
    const ri = (sandbox.Mail.list() || []).findIndex((m) => m.id === rulesMail.id);
    $('mail-list').children[ri].children[1].dispatch('click');
    const ci = rulesMail.title.indexOf('：');
    check('标题带「：」拆成主标题 + 副标题',
      String($('mail-view-title').textContent).indexOf(rulesMail.title.slice(0, ci)) >= 0 &&
      String($('mail-view-title').textContent).indexOf(rulesMail.title.slice(ci + 1)) < 0 &&
      String($('mail-view-sub').textContent) === rulesMail.title.slice(ci + 1) &&
      $('mail-view-sub').style.display === 'block');
    // 回到带奖励那封的详情页，继续后面的领取断言
    $('mail-view').dispatch('click');
    $('mail-list').children[giftIdx].children[1].dispatch('click');
  }
  $('btn-mail-claim').dispatch('click');
  check('领取附件金币到账', sandbox.Store.getWallet().coins === coinsBeforeMail + giftMail.coins);
  check('同一封邮件不能重复领',
    sandbox.Mail.claim(giftMail.id).ok === false &&
    sandbox.Store.getWallet().coins === coinsBeforeMail + giftMail.coins);
  $('mail-view').dispatch('click');
  check('邮件详情「返回」回到列表', $('mail-menu').style.display === 'flex' && $('mail-view').style.display === 'none');
  $('mail-menu').dispatch('click');
  check('邮箱「返回」回到主页', $('main-menu').style.display === 'flex' && $('mail-menu').style.display === 'none');

  // 邮箱状态跟着账号走，不串号
  const otherAcc = sandbox.Account.list().filter((a) => a.name === '测试奶龙')[0];
  sandbox.Account.switchTo(otherAcc.id);
  check('换个账号，邮箱领取状态是各自独立的', sandbox.Mail.get(giftMail.id).claimed === false);
  sandbox.Account.switchTo(sandbox.Account.list().filter((a) => a.name === '老玩家2')[0].id);
  check('切回来奖励还是已领取', sandbox.Mail.get(giftMail.id).claimed === true);

  // 35b. 左滑删除 + 一键已读 / 一键删除
  $('main-menu').style.display = 'flex';
  $('btn-mail').dispatch('click');
  const wraps = $('mail-list').children;
  check('每封邮件都套了可左滑的容器', wraps.length >= 3 && wraps[0].classList.contains('mail-swipe'));
  const row0 = wraps[0].children[1];
  row0.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 300, clientY: 40, button: 0, preventDefault() {} });
  row0.dispatch('pointermove', { pointerId: 1, clientX: 200, clientY: 44, cancelable: true, preventDefault() {} });
  row0.dispatch('pointerup', { pointerId: 1, clientX: 200, clientY: 44 });
  check('左滑超过一半 → 露出删除键', wraps[0].classList.contains('open'));
  // 真实手指：按下 → 抬起 → click（左滑露出删除键时，点一下只收回原位，不点进邮件）
  row0.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 240, clientY: 40, button: 0, preventDefault() {} });
  row0.dispatch('pointerup', { pointerId: 1, clientX: 240, clientY: 40 });
  row0.dispatch('click');
  check('左滑露出删除键时点邮件：只收回原位，不点进邮件',
    !wraps[0].classList.contains('open') && $('mail-view').style.display !== 'flex');
  // 正常状态再点：才进入邮件详情
  row0.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 240, clientY: 40, button: 0, preventDefault() {} });
  row0.dispatch('pointerup', { pointerId: 1, clientX: 240, clientY: 40 });
  row0.dispatch('click');
  check('正常状态点邮件进入详情', $('mail-view').style.display === 'flex');
  $('mail-view').dispatch('click');   // 回到列表

  const leftBefore = sandbox.Mail.list().length;
  $('btn-mail-read-all').dispatch('click');
  check('一键已读：全部标为已读、角标消失',
    sandbox.Mail.unread() === 0 && $('mail-badge').style.display === 'none');

  // 单封删除：删掉的邮件不再出现
  const victim = sandbox.Mail.list()[0];
  const rmR = sandbox.Mail.remove(victim.id);
  check('删除单封邮件', rmR.ok && sandbox.Mail.get(victim.id) === null &&
    sandbox.Mail.list().length === leftBefore - 1);

  // 一键删除：未领奖励的邮件不删
  // 先把其它带奖励的邮件领掉，保证「一键删除」只会剩下下面这封没领奖的
  sandbox.Mail.list().filter((m) => m.hasGift && !m.claimed && m.id !== 'utest-gift')
    .forEach((m) => sandbox.Mail.claim(m.id));
  sandbox.Mail.sendMail({ id: 'utest-gift', at: nowStamp, title: '测试奖励', coins: 50 });
  $('btn-mail-del-all').dispatch('click');
  check('一键删除先弹确认窗口',
    $('mail-delall-confirm').style.display === 'flex' &&
    sandbox.Mail.list().length === leftBefore);
  $('btn-mail-delall-yes').dispatch('click');
  check('确认后清空邮箱，但保留没领奖励的那封',
    $('mail-delall-confirm').style.display === 'none' &&
    sandbox.Mail.list().length === 1 && !!sandbox.Mail.get('utest-gift') &&
    $('btn-mail-list') !== null);
  sandbox.Mail.claim('utest-gift');
  sandbox.Mail.removeAll();
  $('btn-mail').dispatch('click');       // 重新渲染列表
  check('奖励领完就能一键删干净', sandbox.Mail.list().length === 0 &&
    $('mail-list').children.length === 1 &&
    String($('mail-list').children[0].textContent).indexOf('暂时还没有邮件') >= 0);
  $('mail-menu').dispatch('click');

  // 36. 注销账号 = 彻底删除
  const purgeId = sandbox.Account.current().id;
  const accCountBefore = sandbox.Account.list().length;
  lsMap.set('nl2:mail', lsMap.get('nl2:mail') || '{}');
  reloaded = false;
  $('btn-logout').dispatch('click');
  check('注销账号弹第一步确认', $('logout-confirm').style.display === 'flex');
  $('btn-logout-yes').dispatch('click');
  check('第一步「是」→ 第二步确认', $('logout-confirm2').style.display === 'flex');
  $('btn-logout-cancel').dispatch('click');
  check('第二步「取消」不删号', $('logout-confirm2').style.display === 'none' && sandbox.Account.loggedIn());
  $('btn-logout').dispatch('click');
  $('btn-logout-yes').dispatch('click');
  $('btn-logout-confirm').dispatch('click');
  await sleep(260);
  check('注销后这个号从账号表里消失（其他号还在）',
    sandbox.Account.list().length === accCountBefore - 1 && !sandbox.Account.loggedIn());
  check('注销后存档快照也删掉', !lsMap.has('nl2:acc:' + purgeId));
  check('注销后本机存档全清（金币 / 进度 / 邮箱）',
    !lsMap.has('nl2:wallet') && !lsMap.has('nl2:progress') && !lsMap.has('nl2:mail'));
  check('注销后自动回到登录页', reloaded === true);

  // 37. 注销要把服务器上的号一起删掉：否则同名再登录，旧进度会被云端整套"找回来"
  fakeServer.reset();
  sandbox.__cloudOn = true;
  sandbox.Account.register('注销测试', 'e2e1234');
  await sleep(60);                                   // bgRegister 是后台 promise
  check('注册后服务器上能看到这个号', !!fakeServer.byNick('注销测试'));
  sandbox.Store.addCoins(777);
  sandbox.Store.recordLevel(7, 4321, 3);
  await sandbox.Account.pushCloud(true);
  check('玩出来的进度已经推到服务器',
    !!(fakeServer.byNick('注销测试') && fakeServer.byNick('注销测试').slot));

  const prRes = await sandbox.Account.purge();
  check('注销把服务器上的号删掉了（含存档）',
    !fakeServer.byNick('注销测试') && prRes && prRes.cloudGone === true);
  check('注销后本机进度 / 金币一起清空',
    !lsMap.has('nl2:progress') && !lsMap.has('nl2:wallet'));

  // 服务器上万一没删干净（断网 / 请求失败）：停机牌要拦住"找回"
  fakeServer.rows['注销测试'] = {
    uid: 'srv-residue', nick: '注销测试', pass: 'e2e1234',
    slot: { keys: { 'nl2:progress': '{"7":{"score":4321,"stars":3}}' }, savedAt: Date.now() }
  };
  const back = await sandbox.Account.cloudLogin('注销测试', 'e2e1234');
  check('注销过的号不能再从服务器找回旧进度', !back.ok && back.purged === true &&
    !sandbox.Account.loggedIn() && !lsMap.has('nl2:progress'));

  // 同名重新注册：服务器上残留的旧号先删掉，新号从零开始
  fakeServer.rows['注销测试'] = {
    uid: 'srv-residue', nick: '注销测试', pass: 'e2e1234',
    slot: { keys: { 'nl2:progress': '{"7":{"score":4321,"stars":3}}' }, savedAt: Date.now() }
  };
  sandbox.Account.register('注销测试', 'e2e1234');
  await sleep(80);
  check('同名重新注册后进度是空的（不被服务器旧存档盖回来）',
    !lsMap.has('nl2:progress') && !lsMap.has('nl2:wallet'));
  sandbox.__cloudOn = false;

  // 38. 换身份号码（本机码 u… → 服务器码 p…）后，榜单不能出现两个一模一样的名字
  sandbox.Board.publish({ uid: 'uabc12345', name: '重名去重', score: 500, level: 2 }, true);
  check('本机码成绩进榜', sandbox.Board.list().filter((e) => e.name === '重名去重').length === 1);
  sandbox.Board.publish({ uid: 'p0123456789abcdef', name: '重名去重', score: 900, level: 4 }, true);
  const dup1 = sandbox.Board.list().filter((e) => e.name === '重名去重');
  check('同一人换码后榜单只剩一条', dup1.length === 1 && dup1[0].uid === 'p0123456789abcdef');
  check('合并后分数取两边最高（不掉分）', dup1[0].score === 900);

  sandbox.Board.publish({ uid: 'uabc99999', name: '重名去重2', score: 1500, level: 5 }, true);
  sandbox.Board.publish({ uid: 'pfedcba9876543210', name: '重名去重2', score: 100, level: 1 }, true);
  const dup2 = sandbox.Board.list().filter((e) => e.name === '重名去重2');
  check('旧码分数更高时并到新码上，不掉分', dup2.length === 1 && dup2[0].score === 1500);

  sandbox.Board.publish({ uid: 'uabc11111', name: '同名两人', score: 100, level: 1 }, true);
  sandbox.Board.publish({ uid: 'uabc22222', name: '同名两人', score: 200, level: 2 }, true);
  check('两条都是本机码时不合并（不误伤重名玩家）',
    sandbox.Board.list().filter((e) => e.name === '同名两人').length === 2);

  // 真的走一遍「存到服务器」：迁码时要把旧码那条从榜单撤掉
  fakeServer.reset();
  sandbox.__cloudOn = false;
  sandbox.Account.register('换码测试', 'e2e1234');
  const oldUid = sandbox.Account.current().id;
  sandbox.Board.publish({ uid: oldUid, name: '换码测试', score: 1234, level: 3 }, true);
  check('迁码前榜单上有本机码那条', !!sandbox.Board.get(oldUid));
  sandbox.__cloudOn = true;
  const up = await sandbox.Account.pushAccountToCloud('e2e1234');
  check('存到服务器成功', !!(up && up.ok));
  const newUid = sandbox.Account.current().id;
  check('身份号码换成了服务器码', newUid !== oldUid && newUid.indexOf('srv') === 0);
  check('迁码后旧码那条已经从榜单撤掉', !sandbox.Board.get(oldUid));
  check('迁码后榜单上没有两条同名', sandbox.Board.list().filter((e) => e.name === '换码测试').length === 0);
  sandbox.__cloudOn = false;

  // 39b. 名字占用只看服务器码：旧的本机码榜条目不能把玩家的原名锁死（用户反馈：玩家「七」）
  const realBoardForNick = sandbox.Board.list;
  sandbox.Board.list = () => [
    { uid: 'u-stale0001', name: '七', score: 1290, level: 1, ts: 1 },
    { uid: 'pabcdef123456', name: '帅哥', score: 3010, level: 1, ts: 1 }
  ];
  const rNickLocal = sandbox.Account.rename('七');
  check('榜上旧本机码的名字不算占用，玩家能改回原名',
    rNickLocal.ok === true && sandbox.Account.current().name === '七');
  const rNickCloud = sandbox.Account.rename('帅哥');
  check('榜上服务器码（p…）的名字仍算占用',
    rNickCloud.ok === false && String(rNickCloud.reason).indexOf('别人') >= 0);
  sandbox.Board.list = realBoardForNick;
  check('改名菜单的占用判断同样只认服务器码',
    /\/\^p\[0-9a-f\]\{8,\}\$\/i\.test\(String\(e\.uid \|\| ''\)\)/.test(jsSrc));

  // 39c. 老账号没设密码：注册同名直接接管（进度保留），登录页给出找回引导（用户反馈）
  sandbox.Account.register('没密码的号', 'temp1234');
  const arrNp = JSON.parse(lsMap.get('nl2:accounts'));
  arrNp[arrNp.length - 1].pass = '';
  lsMap.set('nl2:accounts', JSON.stringify(arrNp));
  const coinsBefore = sandbox.Store.getWallet().coins;
  sandbox.Store.addCoins(77);
  sandbox.Account.register('过渡账号', 'temp1234');     // 切走，触发保存「没密码的号」的快照
  check('没密码的号用同名注册会被接管而不是被拒',
    (() => { const r = sandbox.Account.register('没密码的号', 'newpass99');
      return r.ok === true && r.taken === true && sandbox.Account.current().name === '没密码的号'; })());
  check('接管后进度还在（77 金币铺回来）',
    sandbox.Store.getWallet().coins === coinsBefore + 77);
  check('接管后密码已设置，能用新密码登录',
    sandbox.Account.login('没密码的号', 'newpass99').ok === true &&
    sandbox.Account.login('没密码的号', 'wrongpass').ok === false);
  check('登录页对无密码账号给出「去注册找回」的引导',
    jsSrc.indexOf('去上面切到「注册」') > 0);
  check('换链接的新号注册时提示用存档码搬回旧进度',
    jsSrc.indexOf('回原来的链接 → 设置 → 账号安全 → 生成存档码') > 0);
  // 39d. 存服务器遇「名字被占 + 密码对不上」：给逃生口，不能把玩家锁死（用户反馈）
  check('云窗口默认隐藏「改个名字再存」，只在名字被占时出现',
    /id="btn-cloud-rename" style="display:none;"/.test(htmlSrc0) &&
    /nameTaken\) \? 'block' : 'none'/.test(jsSrc));
  check('名字被占时返回 nameTaken 标记和可读原因',
    jsSrc.indexOf('nameTaken: true') > 0 &&
    jsSrc.indexOf('和这个密码对不上') > 0);
  check('逃生口：改名成功后回到存服务器窗口',
    jsSrc.indexOf('cloudRenameEscape') > 0 &&
    jsSrc.indexOf('openNickMenu(false, () => { try { openCloudMenu(); } catch (e) {} });') > 0);
  check('令牌失效自动解绑，让「存到服务器」能重新提示',
    jsSrc.indexOf("indexOf('过期') >= 0") > 0 && jsSrc.indexOf('arr[i].ctoken = null') > 0);

  // 39. 顶栏统一：只有关卡 / 步数 / 得分，金币星星一律不上顶栏
  check('游戏顶栏只有 关卡 / 步数 / 得分 三项',
    /id="hud"[\s\S]*?id="score"/.test(htmlSrc0) &&
    !/hud-mini/.test(htmlSrc0) && !/id="coins"/.test(htmlSrc0) && !/id="stars"/.test(htmlSrc0));
  check('窄屏不再隐藏任何顶栏项（各手机显示一致）', !/\.hud-mini\s*{ display: none/.test(cssSrc));
  // 39b. 狂热改成「棋盘下方」倒计时小标：不再有横幅；小标自己呼吸，不闪棋盘
  check('狂热小标放在棋盘下方（🔥 双倍 Ns），不再有闪动横幅',
    /id="frenzy-chip"/.test(htmlSrc0) && /id="frenzy-left"/.test(htmlSrc0) &&
    !/frenzy-banner/.test(htmlSrc0) && !/frenzyPulse/.test(cssSrc) &&
    /\.hud-frenzy\s*{/.test(cssSrc) && /\.frenzy-slot\s*{/.test(cssSrc) &&
    htmlSrc0.indexOf('id="frenzy-chip"') > htmlSrc0.indexOf('class="board-wrap"') &&
    !/id="hud"[\s\S]{0,400}frenzy-chip/.test(htmlSrc0));
  // 39b-2. 双倍小标：位置再往下一点（不再负 margin 贴棋盘）、字号再大一点，并且和钥匙 / 奶龙同样呼吸
  check('双倍小标离棋盘更远、字号更大，并且有呼吸动效',
    /\.frenzy-slot\s*{[^}]*margin-top:\s*5px;/.test(cssSrc) &&
    !/\.frenzy-slot\s*{[^}]*margin-top:\s*-/.test(cssSrc) &&
    /\.hud-frenzy\s*{[^}]*font-size:\s*15px;/.test(cssSrc) &&
    /\.hud-frenzy b\s*{\s*color:\s*#e0561a;\s*font-size:\s*18px;/.test(cssSrc) &&
    /animation:\s*frenzy-breathe/.test(cssSrc) &&
    /@keyframes\s+frenzy-breathe/.test(cssSrc) &&
    /@keyframes\s+frenzy-breathe[^@]*transform:\s*scale\(/.test(cssSrc) &&
    /prefers-reduced-motion[^}]*\.hud-frenzy\s*{\s*animation:\s*none/.test(cssSrc));
  check('狂热倒计时逐秒递减并在结束时收起',
    /function paintFrenzy/.test(jsSrc) && /function stopFrenzy/.test(jsSrc) &&
    /setInterval\(paintFrenzy, 200\)/.test(jsSrc));
  // 39c. 搜索区分大小写：不再 toLowerCase 归一化后再比对
  check('玩家 / 省份搜索区分大小写',
    /String\(adminUlQuery \|\| ''\)\.trim\(\);/.test(jsSrc) &&
    /String\(u\.name\)\.indexOf\(q\) >= 0/.test(jsSrc) &&
    /String\(provUlQuery \|\| ''\)\.trim\(\);/.test(jsSrc) &&
    !/adminUlQuery \|\| ''\)\.trim\(\)\.toLowerCase/.test(jsSrc) &&
    !/provUlQuery \|\| ''\)\.trim\(\)\.toLowerCase/.test(jsSrc));
  // 39d. 黑底播报 1 秒（不用等太久）
  // 提示条停留 1 秒（普通提示）；排队提示按传入的毫秒数播
  check('黑底播报停留 1 秒', /paintToast\(msg, 1000\)/.test(jsSrc) && /remove\('show'\)/.test(jsSrc));
  // 40. 白色页面撑满整屏高度：随手机屏幕高度自适应
  check('页面容器最小高度跟随整屏（vh + dvh 双写兼容地址栏）',
    cssSrc.includes('min-height: calc(100vh - 12px);') &&
    cssSrc.includes('min-height: calc(100dvh - 12px);'));
  check('游戏页内容在多出的高度里垂直居中', /\.game-container\s*{[^}]*justify-content: center;/.test(cssSrc));

  // 41. 本轮改动（2026-11-06 晚）
  // 41a. 名字区分大小写：Yone / yone 是两个不同的号；登录有大小写唯一兜底
  check('名字区分大小写：大小写不同的两个名字都能注册成功', (() => {
    const a = sandbox.Account.register('CaseGuy', 'pass1234');
    const b = sandbox.Account.register('caseguy', 'pass5678');
    return a.ok === true && b.ok === true;
  })());
  check('名字区分大小写：它们是两个不同的号', (() => {
    try {
      const arr = JSON.parse(lsMap.get('nl2:accounts') || '[]');
      const names = arr.map((x) => x.name);
      return names.indexOf('CaseGuy') >= 0 && names.indexOf('caseguy') >= 0;
    } catch (e) { return false; }
  })());
  check('登录写错大小写：唯一候选时能兜底找回', (() => {
    sandbox.Account.register('SoloOne', 'solo1234');
    const r = sandbox.Account.login('soloone', 'solo1234');
    return r.ok === true && sandbox.Account.current().name === 'SoloOne';
  })());
  // 41b. 提示：照着走那一步 / 洗牌 / 撤回后高亮立刻消失
  sandbox.__nl_test.start(1, { def: { id: 96, theme: 'candy', moves: 20, goal: { type: 'score', target: 5000 }, stars: [1, 2, 3] } });
  sandbox.__nl_test.hint();
  const hintCells0 = sandbox.__nl_test.state().hintCells;
  check('提示：点击后棋盘上出现高亮对', Array.isArray(hintCells0) && hintCells0.length === 2);
  await sandbox.__nl_test.swap(hintCells0[0], hintCells0[1]);
  check('照着提示走那一步后，提示框立刻消失', !sandbox.__nl_test.state().hintCells && !sandbox.__nl_test.state().hintUntil);
  // 41c. 连击弹窗停留缩短
  check('连击弹窗显示窗口 620ms', /COMBO_DECAY = 620/.test(jsSrc));
  check('连击弹窗淡出过渡 0.16s', /transition: opacity 0\.16s ease/.test(cssSrc));
  // 41d. 任何道具都不许系统代用
  check('自动使用道具的代码已整体移除', !/autoUseLeftoverItems/.test(jsSrc));
  await (async () => {
    sandbox.__nl_test.start(1, { def: { id: 96, theme: 'candy', moves: 1, goal: { type: 'score', target: 5000 }, stars: [1, 2, 3] } });
    sandbox.Store.addItem('extraMoves', 2);
    const before = sandbox.Store.getWallet().items.extraMoves;
    const movesBefore = sandbox.__nl_test.state().moves;
    await sandbox.__nl_test.outOfResource();
    const after = sandbox.Store.getWallet().items.extraMoves;
    check('步数走完：背包「+3 步」原封不动、步数也不偷偷加',
      after === before && sandbox.__nl_test.state().moves === movesBefore);
  })();
  // 41e. 钥匙 / 奶龙徽标高清：按屏幕 DPR 栅格化
  check('货物徽标按 DPR 栅格化（高分屏不糊）',
    /g\.scale\(dpr, dpr\)/.test(jsSrc) &&
    /const w = \(sp\.width \/ dpr\) \* scale;/.test(jsSrc) &&
    /c\.dpr !== dpr/.test(jsSrc));
  // 41f. 背景音乐提前排程：点按钮 / 动画卡顿不再拖慢音乐
  const audioSrc = fs.readFileSync(path.join(__dirname, 'js', 'audio.js'), 'utf8');
  const fxSrc = fs.readFileSync(path.join(__dirname, 'js', 'effects.js'), 'utf8');
  check('BGM / 鼓点改为提前排程（lookahead）',
    /BGM_AHEAD/.test(audioSrc) && /_bgmNoteAt\(/.test(audioSrc) && /_drumAt\(/.test(audioSrc));
  check('每次点击不再无脑 resume / 重设音量', /kickResume/.test(audioSrc) &&
    !/const kick = \(\) => \{ this\.resumeCtx\(\); \}/.test(audioSrc));
  // 41f-2. 碎冰音效：噪声带通合成的「咔 / 嚓」，整块砸透再多一下
  check('破冰有碎冰音效（噪声合成，整块砸透更响）',
    /case 'ice': \{/.test(audioSrc) && /_noiseNow\(/.test(audioSrc) &&
    /_noiseBuffer\(\)/.test(audioSrc) && /opts\.final/.test(audioSrc) &&
    /AudioManager\.playSFX\('ice', \{ final:/.test(jsSrc));
  // 41f-2b. 炸弹音效：必须是「轰」的低频下坠，不能像碎冰那样高频「咔」
  check('炸弹音效是低频「轰」（滑音下坠 + 低频尾噪，不含高频碎粒）', (() => {
    const m = /case 'bomb': \{[\s\S]*?break;\s*\}/.exec(audioSrc);
    if (!m) return false;
    const blk = m[0];
    return /_tone\(150, 'sine', 0\.55, 0\.45, 0, 42\)/.test(blk) &&
      /exponentialRampToValueAtTime/.test(audioSrc) &&
      /'lowpass'/.test(blk) && !/'highpass'/.test(blk) &&
      !/_noise\(0\.03 \+ Math\.random/.test(blk);
  })());
  // 41f-2c. 炸弹爆炸喷彩带（纸带翻转飘落）
  check('炸弹爆炸喷彩带（纸带翻转飘落）',
    /confetti\(x, y, 26\)/.test(fxSrc) && /kind === 'confetti'/.test(fxSrc) &&
    /Math\.abs\(Math\.cos\(p\.rot\)\)/.test(fxSrc) && /kind = 'confetti'/.test(fxSrc));
  // 41f-3. 连击窗口改短：停手一拍连击就断
  check('连击窗口缩到 1600ms', /const COMBO_WINDOW = 1600;/.test(jsSrc));
  // 41f-4. 结算「继续游戏」按钮：绿色、宽度刚好包住文字
  check('继续游戏按钮绿色且宽度自适应文字',
    /#level-clear #btn-clear-continue\s*\{[^}]*fit-content/.test(cssSrc) &&
    /#level-clear #btn-clear-continue\s*\{[^}]*#1a8f4a/.test(cssSrc) &&
    /class="btn-secondary" id="btn-clear-continue"/.test(htmlSrc));
  // 41f-5. 钥匙换样式：银蓝「菱形柄」古堡钥匙
  check('钥匙用 🔑 emoji 样式（剪影黑描边，蓝光保留）',
    /🔑/.test(jsSrc) && /keyEmojiSilhouette/.test(jsSrc) &&
    /g\.strokeStyle = '#000'/.test(jsSrc));
  // 41f-6. 说明页：改名属于功能，写进「功能介绍」；玩法说明里不再重复；不举 Yone / yone 的例子
  check('改名位置写进「功能介绍」，玩法说明里不再重复，也不举大小写的例子', (() => {
      const f0 = htmlSrc0.indexOf('id="features-box"');
      const f1 = htmlSrc0.indexOf('id="play-rules-menu"');
      const p0 = htmlSrc0.indexOf('id="play-rules-box"');
      const p1 = htmlSrc0.indexOf('id="mail-menu"');
      return /🏠 主页[\s\S]{0,60}改名/.test(htmlSrc0.slice(f0, f1)) &&
        !/改名/.test(htmlSrc0.slice(p0, p1));
    })() && !/Yone/.test(htmlSrc0));
  // 41f-7. 入口叫「说明」：📖 说明 / 🎮 玩法说明 / 说明字号
  check('入口文案改成「说明」：📖 说明 + 🎮 玩法说明，不再叫玩法规则',
    htmlSrc0.includes('<h2 class="title small">📖 说明</h2>') &&
    htmlSrc0.includes('🎮 玩法说明') && !htmlSrc0.includes('🎮 玩法规则') &&
    htmlSrc0.includes('说明字号'));
  // 41f-8. 榜上星星占固定一格：★ 一列对齐，数字紧跟 ★（不右推、不留大空档）
  check('榜上星星 / 分数用固定列宽，并整体再往右挪三个字（空档列）', (() => {
    const g4 = /\.lb-swipe\.col4\s*\{[^}]*\}/.exec(cssSrc);
    const num = /\.lb-stars b\s*\{[^}]*\}/.exec(cssSrc);
    return !!g4 && /grid-template-columns:\s*26px minmax\(0, 1fr\) 42px 40px 6ch/.test(g4[0]) &&
      /\.lb-swipe\.col4 \.lb-stars,\s*\n\.lb-swipe\.col5 \.lb-stars\s*\{\s*grid-column:\s*4/.test(cssSrc) &&
      !!num && /text-align:\s*left/.test(num[0]) && !/min-width/.test(num[0]) &&
      /lb-star-ico/.test(jsSrc) && cssSrc.includes('lb-star-ico');
  })());
  // 41g. 剧情过场去掉「跳过剧情」
  check('剧情过场只有「继续前进」，没有「跳过剧情」',
    htmlSrc0.includes('id="btn-story-go"') && !htmlSrc0.includes('btn-story-skip') &&
    !htmlSrc0.includes('跳过剧情'));
  // 41g-2. 关卡记录页去掉多余的那句引导文案（标题下面直接是列表）
  const histBlock = htmlSrc0.slice(htmlSrc0.indexOf('id="history-menu"'), htmlSrc0.indexOf('id="backpack-menu"'));
  check('关卡记录页不再有「点任意一关即可回到主页并切换到该关」',
    !htmlSrc0.includes('点任意一关即可回到主页') &&
    histBlock.length > 0 && !/history-hint/.test(histBlock) && /id="history-list"/.test(histBlock));
  // 关卡记录滚动区：比原来高，宽度与成就页滚动区一致
  check('关卡记录滚动区加高，宽度和成就页一致', (() => {
    const pick = (s) => (cssSrc.match(new RegExp('\\.' + s + '\\s*\\{([^}]*)\\}')) || [null, ''])[1];
    const h = pick('history-list');
    const a = pick('ach-list');
    const w = (s) => (s.match(/width:\s*([\d.]+)%/) || [null, ''])[1];
    return w(h) === w(a) && /max-height:\s*64vh/.test(h) && /max-height:\s*66vh/.test(a);
  })());
  // 41h. 一格只放一样东西：货物 / 冰 / 锁链 / 特殊块上不再叠新东西
  sandbox.__nl_test.start(1, { def: { id: 96, theme: 'candy', moves: 20, goal: { type: 'score', target: 5000 }, stars: [1, 2, 3] } });
  const stOne = sandbox.__nl_test.state();
  stOne.board[3][3].cargo = { kind: 'key' };
  stOne.ice[3][4] = 2;
  stOne.chain[3][5] = 1;
  check('有货物 / 冰 / 锁链 / 特殊块的格子不放新东西',
    sandbox.__nl_test.canPlaceNew(3, 3) === false &&
    sandbox.__nl_test.canPlaceNew(3, 4) === false &&
    sandbox.__nl_test.canPlaceNew(3, 5) === false &&
    sandbox.__nl_test.canPlaceNew(3, 6) === true);
  const altSpot = sandbox.__nl_test.pickSpotIn(new Set(['3,3', '3,4', '3,6']));
  check('原定点被占时，新东西挪到本轮要消掉的其他空格上',
    !!altSpot && altSpot.r === 3 && altSpot.c === 6);
  // 41i. 钥匙 / 奶龙黑色描边
  check('钥匙 / 奶龙徽标用黑色描边（奶龙走剪影 8 方向铺边）',
    /g\.strokeStyle = '#000'/.test(jsSrc) && /nailongSilhouette/.test(jsSrc) &&
    /for \(let i = 0; i < 8; i\+\+\)/.test(jsSrc));
  // 41j. 钥匙改用 🔑 emoji 本体，黑描边走「剪影沿 8 向铺边」（和奶龙同一套）
  check('钥匙改用 🔑 emoji + 剪影 8 向黑描边',
    /function keyEmojiSilhouette/.test(jsSrc) &&
    /keyEmojiSilhouette\(Math\.round\(s \* dpr\), dpr\)/.test(jsSrc) &&
    /g\.fillText\('🔑'/.test(jsSrc) &&
    !/function drawKeyMark/.test(jsSrc) &&
    !/g\.strokeText\(t, 0, 1\)/.test(jsSrc) &&
    !/const t = isN \? '奶龙' : '🔑'/.test(jsSrc));

  // 41k. 章节奖励：打通一整章 → 邮箱收到「恭喜通过第X章」+200 金币，只发一次
  check('通过一整章发「恭喜通过第X章」邮件（200 金币，只发一次）', (() => {
    // 先把第 1 章清空，再一关一关补上，确认「没打通不发、打通才发、不重复发」
    for (let lv = 1; lv <= 10; lv++) sandbox.Store.recordLevel(lv, 0, 0);
    sandbox.__nl_test.refreshMenu();
    const none = sandbox.Mail.list().filter((m) => m.id === 'chapter-clear-1').length;
    for (let lv = 1; lv <= 9; lv++) sandbox.Store.recordLevel(lv, 1000, 1);
    sandbox.__nl_test.refreshMenu();
    const partial = sandbox.Mail.list().filter((m) => m.id === 'chapter-clear-1').length;
    sandbox.Store.recordLevel(10, 1000, 1);
    sandbox.__nl_test.refreshMenu();
    sandbox.__nl_test.refreshMenu();
    const list = sandbox.Mail.list().filter((m) => m.id === 'chapter-clear-1');
    const m = list[0] || {};
    return none === 0 && partial === 0 && list.length === 1 &&
      m.title === '恭喜通过第1章' && m.coins === 200 && m.hasGift === true &&
      sandbox.Mail.claim('chapter-clear-1').coins === 200;
  })());
  check('章节奖励发到邮箱、由玩家自己领（不会直接塞进钱包）',
    /chapter-clear-' \+ ch\.id/.test(jsSrc) && /Mail\.sendMail\(\{/.test(jsSrc) &&
    /coins: CHAPTER_COIN/.test(jsSrc) && /grantChapterMails\(\)/.test(jsSrc));

  // 41l. 商店新增「+7s」（300 金币，排在 +3 步下面，限时关专用）
  check('商店在「+3 步」下面有「+7s」道具（300 金币）', (() => {
    const shop = sandbox.Tasks.SHOP;
    const i3 = shop.findIndex((x) => x.key === 'extraMoves');
    const i10 = shop.findIndex((x) => x.key === 'extraTime');
    return i3 >= 0 && i10 === i3 + 1 && shop[i10].price === 300 &&
      shop[i10].name === '+7s' && sandbox.Store.getWallet().items.extraTime === 0;
  })());
  check('每日任务：每天 5 个、池子 10 个，新增连击 x3 / 通过 1 关（各 20 金币）', (() => {
    const pool = sandbox.Tasks.POOL;
    const c3 = pool.find((x) => x.id === 'combo3');
    const w1 = pool.find((x) => x.id === 'win1');
    return pool.length === 10 &&
      c3 && c3.reward === 20 && c3.event === 'combo3' &&
      w1 && w1.reward === 20 && w1.event === 'win' &&
      sandbox.Tasks.getToday().length === 5;
  })());
  check('每日任务奖励只有 20/40/60 三档，每天每档至少一个', (() => {
    const pool = sandbox.Tasks.POOL;
    const tiers = [20, 40, 60];
    if (!pool.every((p) => tiers.indexOf(p.reward) >= 0)) return false;
    if (!tiers.every((r) => pool.some((p) => p.reward === r))) return false;
    const today = sandbox.Tasks.getToday();
    return today.length === 5 && tiers.every((r) => today.some((t) => t.reward === r));
  })());
  check('结算秒弹：特效一停立刻放行，不再垫固定延时', (() => {
    const fn = jsSrc.slice(jsSrc.indexOf('async function waitForEffects'), jsSrc.indexOf('async function handleOutOfResource'));
    return /await sleep\(30\)/.test(fn) && /await sleep\(50\)/.test(fn) &&
      !/await sleep\(80\)/.test(fn) && /cap = 2000/.test(fn);
  })());
  check('货物送达计分：每件 +150，浮字带分数', (() => {
    const fn = jsSrc.slice(jsSrc.indexOf('function deliverCargo'), jsSrc.indexOf('function collectCargo'));
    return /const bonus = n \* 150/.test(fn) && /S\.score \+= bonus/.test(fn) && /\+' \+ bonus/.test(fn);
  })());
  check('默认 BGM 去杂音：主音 / 低音 / 鼓点起音都有爬坡，不再「咔哒」', (() => {
    const a = fs.readFileSync(path.join(__dirname, 'js', 'audio.js'), 'utf8');
    const bgm = a.slice(a.indexOf('_bgmNoteAt(t0)'), a.indexOf('_drumNext'));
    const drum = a.slice(a.indexOf('_drumAt(t0)'), a.indexOf('自定义 BGM'));
    return (bgm.match(/setValueAtTime\(0\.0001, t0\)/g) || []).length >= 2 &&
      /exponentialRampToValueAtTime[^;]*t0 \+ 0\.02\)/.test(bgm) &&
      /setValueAtTime\(0\.0001, t0\)/.test(drum);
  })());
  check('签到：每天固定 50 金币；连续满 7 天额外 200 金币走邮箱', (() => {
    const S2 = sandbox.Store;
    const saved = lsMap.get('nl2:tasks');
    const dates = [];
    for (let i = 6; i >= 1; i--) dates.push(S2.todayKey(new Date(Date.now() - i * 86400000)));
    lsMap.set('nl2:tasks', JSON.stringify({ dates: dates, streak: 6, cycleStart: dates[0], signDate: dates[5] }));
    const r = S2.signIn();
    const ok = r.ok && r.reward.coins === 50 && r.streak === 7 && r.milestone === 200;
    const yesterday2 = S2.todayKey(new Date(Date.now() - 86400000));
    lsMap.set('nl2:tasks', JSON.stringify({ dates: [yesterday2], streak: 1, cycleStart: yesterday2, signDate: yesterday2 }));
    const r2 = S2.signIn();
    const ok2 = r2.ok && r2.reward.coins === 50 && r2.milestone === 0;
    if (saved !== undefined) lsMap.set('nl2:tasks', saved); else lsMap.delete('nl2:tasks');
    return ok && ok2 && S2.SIGN_MILESTONE.coins === 200 && S2.SIGN_MILESTONE.every === 7;
  })());
  check('登录页不可退出：点背景跳不过去了，必须登录 / 注册 / 导入存档码（或本机账号）进入', (() => {
    const hadSkip = lsMap.get('nl2:authSkip');
    $('auth-menu').style.display = 'none';
    $('auth-form').style.display = 'flex';
    $('auth-form').dispatch('click');
    const formBack = $('auth-form').style.display === 'none' && $('auth-menu').style.display === 'flex';
    $('auth-menu').dispatch('click');
    const stuck = $('auth-menu').style.display === 'flex' &&
      $('main-menu').style.display !== 'flex' && !lsMap.get('nl2:authSkip');
    // 源码：skipAuth 已删；启动不再看 authSkip 标记；本机数据照样认领成账号（登录页卡片可进）
    const srcOk = !/function skipAuth\(\)/.test(jsSrc) &&
      /AUTH_SKIP_KEY = 'nl2:authSkip'/.test(jsSrc) &&
      !/else if \(authSkipped\(\)\) \{/.test(jsSrc) &&
      /case 'auth-menu':\s*\n\s*\/\/ 登录页不可退出/.test(jsSrc) &&
      /if \(typeof Account !== 'undefined'\) Account\.ensure\(\)/.test(jsSrc) &&
      /'auth-form': 'auth-menu'/.test(jsSrc) &&
      /'nl2:authSkip': 1/.test(jsSrc) &&
      !/if \(!accountOk\(\)\) \{ showAuthScreen\(\); return false; \}/.test(jsSrc);
    // 还原：后面的用例都按「已登录」跑
    if (hadSkip === undefined) lsMap.delete('nl2:authSkip'); else lsMap.set('nl2:authSkip', hadSkip);
    $('main-menu').style.display = 'flex';
    return formBack && stuck && srcOk;
  })());
  check('忘记密码：登录页有入口；本机有号直接重设，换设备用「名字 + 身份号码」核验后重设', (() => {
    const cloudSrc = fs.readFileSync(path.join(__dirname, 'js', 'cloud.js'), 'utf8');
    const backSrc = fs.readFileSync(path.join(__dirname, '_backend', '_worker.js'), 'utf8');
    const fg = htmlSrc.slice(htmlSrc.indexOf('id="auth-forgot"'), htmlSrc.indexOf('id="fix-menu"'));
    const domOk = /id="btn-auth-forgot"[^>]*>忘记密码</.test(htmlSrc) &&
      fg.includes('id="forgot-name"') && fg.includes('id="forgot-uid"') &&
      fg.includes('id="forgot-pass"') && fg.includes('id="forgot-pass2"') &&
      fg.includes('id="btn-forgot-submit"') && !fg.includes('btn-forgot-back');
    // 点空白回登录表单（名字还留着），不是回登录菜单
    $('auth-form').style.display = 'flex';
    $('auth-forgot').style.display = 'flex';
    $('auth-forgot').dispatch('click');
    const back = $('auth-forgot').style.display === 'none' && $('auth-form').style.display === 'flex';
    $('auth-form').style.display = 'none';
    const srcOk = /function resetPassword\(name, uid, newPass\)/.test(jsSrc) &&
      /function localAccount\(name\)/.test(jsSrc) &&
      /Cloud\.recover\(acc\.name, acc\.id, p\.pass\)/.test(jsSrc) &&
      /needUid: true/.test(jsSrc) &&
      /function recover\(nick, uid, newPass\)/.test(cloudSrc) &&
      /nl_recover/.test(cloudSrc) && /doRecover/.test(backSrc) &&
      /'auth-forgot': 'auth-form'/.test(jsSrc) && /case 'auth-forgot':/.test(jsSrc) &&
      /\.auth-link/.test(cssSrc) && /id="account-uid"/.test(htmlSrc) &&
      // 账号安全页：「身份号码」下面紧跟一行「忘记密码时需填…重置密码」
      /<p><span>身份号码<\/span><b id="account-uid"/.test(htmlSrc) &&
      /class="uid-note">忘记密码时需填「名字\+身份号码」重置密码<\/p>/.test(htmlSrc) &&
      /\.result-box p\.uid-note/.test(cssSrc);
    if (!(domOk && back && srcOk)) console.log('[DBG-FORGOT]', domOk, back, srcOk,
      'disp=', $('auth-forgot').style.display, 'form=', $('auth-form').style.display);
    return domOk && back && srcOk;
  })());
  check('注册时间以服务器为准：换设备登录不把「今天」当建号时间，邮箱历史公告不再被过滤', (() => {
    const accSrc = fs.readFileSync(path.join(__dirname, 'js', 'account.js'), 'utf8');
    const backSrc = fs.readFileSync(path.join(__dirname, '_backend', '_worker.js'), 'utf8');
    return /function adoptCreated\(acc, created\)/.test(accSrc) &&
      /created: Number\(r\.created\) \|\| Date\.now\(\)/.test(accSrc) &&
      /created: Number\(info\.created\) \|\| Date\.now\(\)/.test(accSrc) &&
      /adoptCreated\(acc, r\.created\)/.test(accSrc) &&
      /created: Number\(acc\.created_at\) \|\| 0/.test(backSrc) &&
      /created: Number\(row\.created_at\) \|\| 0/.test(backSrc) &&
      /a\.created_at/.test(backSrc);
  })());
  check('成绩单：卡片严格居中（stage width:100% 包裹、标题悬浮上方、不改卡片尺寸）、无底部文案、进度线恒满格', (() => {
    const gc = htmlSrc.slice(htmlSrc.indexOf('id="game-complete"'), htmlSrc.indexOf('id="chapters-menu"'));
    return gc.includes('master-stage') && !gc.includes('master-foot') &&
      !gc.includes('继续闯关') && !gc.includes('满分毕业') &&
      gc.includes('master-bar') &&
      /#game-complete \.master-stage \{[^}]*width:\s*100%/.test(cssSrc) &&
      /#game-complete \.master-stage > \.title\.small \{[^}]*position:\s*absolute/.test(cssSrc) &&
      !/\.master-foot \{/.test(cssSrc) &&
      /\.master-bar span\s*\{[^}]*width:\s*100%/.test(cssSrc) &&
      !/master-bar-fill/.test(jsSrc);
  })());
  check('每日任务尽量不重样：上一批出过的排到候选队尾，通常整批换新', (() => {
    const saved = lsMap.get('nl2:tasks');
    lsMap.set('nl2:tasks', JSON.stringify({ date: '2020-01-01', list: [
      { id: 'match4' }, { id: 'bomb' }, { id: 'combo4' }, { id: 'jelly' }, { id: 'play3' }
    ] }));
    const today = sandbox.Tasks.getToday();
    const todayIds = today.map((t) => t.id);
    lsMap.set('nl2:tasks', saved);
    // 旧 5 个里最多只允许出现 0 个（池子剩 5 个没出过的正好顶上）
    const overlap = ['match4', 'bomb', 'combo4', 'jelly', 'play3'].filter((x) => todayIds.indexOf(x) >= 0);
    return todayIds.length === 5 && overlap.length === 0;
  })());
  check('每日任务面板没有签到区（签到去「🎁 签到入口」）', (() => {
    const panel = htmlSrc.slice(htmlSrc.indexOf('id="tasks-menu"'), htmlSrc.indexOf('id="shop-menu"'));
    return !panel.includes('signin-box') && !panel.includes('btn-signin') && !panel.includes('签到领金币') &&
      !jsSrc.includes('signin-info') && !jsSrc.includes("if (signBtn)") && !cssSrc.includes('.signin-box');
  })());
  check('combo3 / win 事件真的会上报（每日任务能推进）',
    /if \(S\.combo >= 3\) Tasks\.report\('combo3', 1\);/.test(jsSrc) &&
    /Tasks\.report\('win', 1\);/.test(jsSrc) &&
    /Tasks\.report\('play', 1\);/.test(jsSrc));
  check('「+7s」限时关真的加 7 秒，步数关不白扣', (() => {
    sandbox.__nl_test.start(1, { def: { id: 88, theme: 'ocean', moves: 20, goal: { type: 'timed', target: 100, time: 60 }, stars: [1, 2, 3] } });
    sandbox.__nl_test.state().timeLeft = 42;
    sandbox.Store.addItem('extraTime', 1);
    const ok = sandbox.__nl_test.useItem('extraTime');
    const after = sandbox.__nl_test.state().timeLeft;
    sandbox.__nl_test.start(1, { def: { id: 87, theme: 'candy', moves: 20, goal: { type: 'score', target: 100 }, stars: [1, 2, 3] } });
    sandbox.Store.addItem('extraTime', 1);
    const have = sandbox.Store.getWallet().items.extraTime;
    const bad = sandbox.__nl_test.useItem('extraTime');
    const still = sandbox.Store.getWallet().items.extraTime;
    return ok === true && Math.round(after) === 49 && bad === false && still === have;
  })());

  // 41m. 续命：300 金币；限时关的按钮写「再来 7s」（和 HUD 的 Ns 格式一致）
  check('续命 300 金币，限时关按钮写「再来 7s」',
    /const REVIVE_COST = 300;/.test(jsSrc) && /再来 7s/.test(jsSrc) &&
    !/REVIVE_COST = 200/.test(jsSrc) && htmlSrc.includes('花 300 金币，再来 3 步'));

  // 41n. 星级只升不降：2 星过关后又用剩余步数打完，结算 / 纪录都保持 2 星
  sandbox.__nl_test.start(1, { def: { id: 1, theme: 'candy', moves: 20, goal: { type: 'score', target: 500 }, stars: [1000, 2000, 3000] } });
  sandbox.__nl_test.state().score = 1000;   // 只到 1 星线
  sandbox.__nl_test.state().moves = 0;      // 一点步数不剩 → 这次只算 1 星
  sandbox.Store.recordLevel(1, 1500, 2);    // 这一关历史最好 2 星
  sandbox.__nl_test.win(true);
  await sleep(60);
  check('2 星过关后用剩余步数继续打，结算与纪录仍取 2 星（只升不降）',
    sandbox.Store.getLevelRecord(1).stars === 2 &&
    /Math\.max\(starsNow, bestStars\)/.test(jsSrc) &&
    /popStars\(starEls, stars, 240\)/.test(jsSrc));

  // 41o. 星星整列右移 / 后台玩家分数字左带星 / 名字 1~8 个字符 / 结算音效跟面板同拍
  const workerSrc = fs.readFileSync(path.join(__dirname, '_backend', '_worker.js'), 'utf8');
  check('排行榜星星整列左对齐、后台星星也左对齐（固定列）', (() => {
    const host = /\.lb-stars\s*\{[^}]*justify-content:\s*flex-start/.exec(cssSrc);
    const ul = /\.ul-stars\s*\{[^}]*justify-content:\s*flex-start/.exec(cssSrc);
    const g5 = /\.lb-swipe\.col5\s*\{[^}]*\}/.exec(cssSrc);
    return !!host && /justify-content:\s*flex-start/.test(host[0]) &&
      !!ul && /justify-content:\s*flex-start/.test(ul[0]) && !!g5;
  })());
  check('后台玩家名单每行带总星数（分数左边 ★ N）', (() => {
    const rows = sandbox.__nl_test.userList();
    return Array.isArray(rows) && rows.every((u) => typeof u.stars === 'number') &&
      /class="lb-stars ul-stars"/.test(jsSrc) && /\.ul-stars\s*\{/.test(cssSrc) &&
      !/admin-ul-list \.lb-swipe \{ padding-right: 4px; \}/.test(cssSrc);
  })());
  // 41p. 本轮：结算键右下角（小号黄色）/ 结算画面点任意处退回关卡记录 / 榜单加高 / 列对齐 / 星数滚动
  check('「结算」键钉在关卡记录右下角：小号黄色刚好包住文字',
    /#history-menu #btn-replay-ending\s*\{[^}]*right: 16px/.test(cssSrc) &&
    /#history-menu #btn-replay-ending\s*\{[^}]*bottom: 16px/.test(cssSrc) &&
    /#history-menu #btn-replay-ending\s*\{[^}]*width: auto/.test(cssSrc) &&
    /class="btn-primary" id="btn-replay-ending">结算</.test(htmlSrc));
  check('结算画面没有「回到主页」键，点任意处退出回关卡记录',
    !htmlSrc.includes('btn-complete-home') && !jsSrc.includes('btn-complete-home') &&
    /\$\('game-complete'\)/.test(jsSrc) && /completePanel\.addEventListener\('click'/.test(jsSrc) &&
    /showOverlay\('history-menu'\)/.test(jsSrc));
  check('排行榜列表加高到 52vh', /max-height: 52vh/.test(cssSrc));
  check('分数列固定宽度左对齐（榜一定边界，后台省份间隔 21px）',
    /\.lb-score\s*\{[^}]*text-align: left/.test(cssSrc) &&
    /\.lb-score\s*\{[^}]*min-width: 3\.6em/.test(cssSrc) &&
    /\.ul-prov\s*\{[^}]*margin-left: 21px/.test(cssSrc) &&
    /\.ul-score\s*\{[^}]*text-align: left/.test(cssSrc));
  check('结算画面总星数与总分同时长滚动', /countUp\(st, totalStars, 900\)/.test(jsSrc));
  check('名字长度只能 1-7 个字符（一个字母或符号都算一个）', (() => {
    const v1 = sandbox.Meta.validateNick('a');
    const v7 = sandbox.Meta.validateNick('abcdefg');
    const v8 = sandbox.Meta.validateNick('abcdefgh');
    return v1.ok && v7.ok && !v8.ok && /NICK_MAX = 7;/.test(workerSrc) &&
      workerSrc.includes('1-7 个字符') && !/NICK_MAX = 12/.test(workerSrc) &&
      /maxlength="7"/.test(htmlSrc) && !/maxlength="8"/.test(htmlSrc);
  })());
  check('结算音效和结算画面同一拍出来（通关 / 失败都是）',
    /box\.style\.display = 'flex';\s*\n\s*winSfx\(\);/.test(jsSrc) &&
    /box\.style\.display = 'flex';\s*\n\s*endSfx\(\);/.test(jsSrc) &&
    !/setTimeout\(\(\) => AudioManager\.playSFX\('star'/.test(jsSrc));
  // 42. BGM 防重入：startBGM 已在播就不再重启，否则 unlock 挂在 7 种手势事件上，
  //     一次点击会叠好几层错开的旋律，听起来像乱弹钢琴
  check('合成 BGM 防重入：已在播时 startBGM 直接返回，不重启不叠音', (() => {
    const aSrc = fs.readFileSync(path.join(__dirname, 'js', 'audio.js'), 'utf8');
    const m = aSrc.match(/startBGM\(\) \{([\s\S]*?)\n    \},/);
    const body = m ? m[1] : '';
    return body.includes('if (this._bgmTimer) return;') &&
      !body.includes('clearInterval(this._bgmTimer)');
  })());

  // 41q. 本轮：说明精简 / 功能介绍按按键层次 / 消消乐大师成绩单 / 糖果关卡可见 / 榜单固定列
  //      成就调整（分数收割机门槛、删两枚、加糖果爱好者）/ 云存档自动化
  check('成绩单标题改成「🎉 恭喜」，没有副标题、四格数字都滚动', (() => {
    const fn = jsSrc.slice(jsSrc.indexOf('function showCompletePanel'), jsSrc.indexOf('function levelHasCandy'));
    return !htmlSrc.includes('恭喜全通关') && /master-greet[\s\S]{0,160}master-greet-txt/.test(htmlSrc) &&
      /master-greet-txt">恭喜</.test(htmlSrc) &&
      htmlSrc.includes('id="master-title"') &&
      htmlSrc.includes('id="master-bar-fill"') &&
      htmlSrc.includes('id="complete-total-score"') && htmlSrc.includes('id="complete-total-stars"') &&
      htmlSrc.includes('id="master-perfect"') && htmlSrc.includes('id="master-ach"') &&
      !htmlSrc.includes('id="master-sub"') && !fn.includes('master-sub') &&
      /countUp\(pf, perfect, 900\)/.test(fn) && /countUp\(ac, achGot, 900\)/.test(fn);
  })());
  check('成绩单「🎉 恭喜」是彩虹色：文字渐变裁切 + 🎉 用彩虹填充图片', (() => {
    const fn = jsSrc.slice(jsSrc.indexOf('function showCompletePanel'), jsSrc.indexOf('function levelHasCandy'));
    return /\.master-greet-txt\s*\{[^}]*background:\s*linear-gradient/.test(cssSrc) &&
      /\.master-greet-txt\s*\{[^}]*background-clip:\s*text/.test(cssSrc) &&
      /\.master-greet-ico img\s*\{[^}]*object-fit:\s*contain/.test(cssSrc) &&
      /rainbowEmojiData\('🎉'\)/.test(fn) &&
      /master-greet-ico/.test(fn);
  })());
  check('成绩单按进度算称号（等级·玩家名），全三星才叫宗师；文案不写「/总数」「还差」', (() => {
    const fn = jsSrc.slice(jsSrc.indexOf('function showCompletePanel'), jsSrc.indexOf('function levelHasCandy'));
    // 称号 = 等级 + 「·」 + 玩家名，例如「达人·奶龙玩家」
    return /let rank = '学徒'/.test(fn) &&
      /rank = \(perfect >= total\) \? '宗师' : '大师'/.test(fn) &&
      /rank = '高手'/.test(fn) && /rank = '达人'/.test(fn) && /rank = '新星'/.test(fn) &&
      /const title = rank \+ '·' \+ nick/.test(fn) &&
      /Meta\.nickname\(\)/.test(fn) &&
      !/消消乐学徒|消消乐达人/.test(fn) &&
      /'已通 ' \+ cleared \+ ' 关 · 三星 ' \+ perfect \+ ' 关'/.test(fn) &&
      !/还差/.test(fn) && !fn.includes('主线全部通关');
  })());
  check('所有称号左边的方块统一放原色奶龙贴图（不再用奖牌 / 皇冠 emoji）', (() => {
    const fn = jsSrc.slice(jsSrc.indexOf('function showCompletePanel'), jsSrc.indexOf('function levelHasCandy'));
    return /crownBox\.innerHTML = '<img src="\.\/assets\/nailong\.png" alt="奶龙">'/.test(fn) &&
      !fn.includes("crown = '") && !fn.includes("setText('master-crown'") &&
      /\.master-crown img\s*\{[^}]*object-fit:\s*contain/.test(cssSrc) &&
      htmlSrc.includes('id="master-crown"') && /master-crown" id="master-crown"><img src="\.\/assets\/nailong\.png"/.test(htmlSrc);
  })());
  check('奖杯详情页没有返回键，点卡片外空白回成就页；彩杯背景是渐变、奖杯本体彩虹填色',
    !htmlSrc.includes('btn-ach-detail-back') && !jsSrc.includes('btn-ach-detail-back') &&
    /detailPanel\.addEventListener\('click'/.test(jsSrc) &&
    /e\.target\.closest\('\.ach-detail-card'\)/.test(jsSrc) &&
    /\.ach-trophy\.t4\s*\{[^}]*linear-gradient/.test(cssSrc) &&
    !/\.ach-trophy\.t4::before/.test(cssSrc) &&
    /\.ach-trophy\.t4\s*\{[^}]*overflow:\s*hidden/.test(cssSrc) &&
    /#ach-detail\.t4\s*\{[^}]*linear-gradient/.test(cssSrc) &&
    !/#ach-detail\.t4\s*\{[^}]*url\(/.test(cssSrc) &&
    /fill:\s*url\(#ach-rainbow-pat\)/.test(cssSrc) && htmlSrc.includes('ach-rainbow-pat'));
  check('彩阶标题图标是彩虹填充（emoji 形状 + 渐变填色），不是 emoji 原色也不是单色剪影', (() => {
    const fn = jsSrc.slice(jsSrc.indexOf('function rainbowEmojiData'), jsSrc.indexOf('function updateAchDot'));
    const detail = jsSrc.slice(jsSrc.indexOf('function renderAchDetail'), jsSrc.indexOf('function stepAchDetail'));
    return /globalCompositeOperation = 'source-in'/.test(fn) &&
      /createLinearGradient/.test(fn) &&
      /toDataURL/.test(fn) &&
      /rainbowEmojiData\(a\.icon\)/.test(detail) &&
      /ach-d-rainbow/.test(detail) &&
      /\.t4 \.ach-d-ico \{ filter: none; \}/.test(cssSrc);
  })());
  check('点进成就详情一律停在已解锁的最高一阶', (() => {
    const open = jsSrc.slice(jsSrc.indexOf('function openAchDetail'), jsSrc.indexOf('function renderAchDetail'));
    const go = jsSrc.slice(jsSrc.indexOf('function gotoAch'), jsSrc.indexOf('function claimAchReward'));
    return /achDetail = \{ id: id, tier: t \}/.test(open) &&
      /achDetail = \{ id: nx\.id, tier: Math\.max\(1, Meta\.tierOf\(nx\.id\)\) \}/.test(go);
  })());
  check('弹层 touch-action: pan-y（安卓上背景左右滑不会被浏览器当滚动掐掉，成就详情才能切成就）',
    /touch-action: pan-y/.test(cssSrc.slice(cssSrc.indexOf('.overlay {'), cssSrc.indexOf('.overlay {') + 300)));
  check('详情页整页随阶变色：卡片/遮罩挂 tN 类、领取键用主题色、奖杯右下角没 emoji、标题左边是图标剪影',
    /card\.className = 'ach-detail-card t' \+ tier/.test(jsSrc) &&
    /dPanel\.className = 'overlay t' \+ tier/.test(jsSrc) &&
    /\.ach-detail-card\.t1\s*\{[^}]*--ach-c1/.test(cssSrc) &&
    /#ach-detail\.t4\s*\{[^}]*background/.test(cssSrc) &&
    /#btn-ach-claim\.btn-primary\s*\{[^}]*var\(--ach-c1/.test(cssSrc) &&
    !htmlSrc.includes('ach-trophy-ico') && !cssSrc.includes('ach-trophy-ico') && !jsSrc.includes('ach-d-icon') &&
    /ach-d-ico/.test(jsSrc) && /\.ach-d-ico\s*\{[^}]*brightness\(/.test(cssSrc));
  check('成就：加了「糖果爱好者」，删了「过半征程」「通关大师」', (() => {
    const ids = sandbox.Meta.ACHIEVEMENTS.map((a) => a.id);
    const candy = sandbox.Meta.ACHIEVEMENTS.filter((a) => a.id === 'candylover')[0];
    return ids.indexOf('candylover') >= 0 && candy.name === '糖果爱好者' && candy.key === 'candy' &&
      ids.indexOf('lv20') < 0 && ids.indexOf('lv40') < 0 &&
      !jsSrc.includes('过半征程') && !jsSrc.includes('通关大师') &&
      sandbox.Meta.ACHIEVEMENTS.length === 25;
  })());
  check('分数收割机门槛改成 10000 / 50000 / 250000 / 500000', (() => {
    const a = sandbox.Meta.ACHIEVEMENTS.filter((x) => x.id === 'score100k')[0];
    return JSON.stringify(a.tiers) === JSON.stringify([10000, 50000, 250000, 500000]);
  })());
  check('糖果计数接进累计统计（成就用）', (() => {
    const metaSrc = fs.readFileSync(path.join(__dirname, 'js', 'meta.js'), 'utf8');
    return /Meta\.bump\('candy', candies\)/.test(jsSrc) && /'cargo', 'candy', 'rescue'/.test(metaSrc);
  })());
  check('关卡记录标「运送货物」四个字（不带 🍬），章节地图也不挂 🍬 角标',
    /function levelHasCandy/.test(jsSrc) && /return '运送货物';/.test(jsSrc) &&
    !/运送糖果/.test(jsSrc) && !/chip-candy/.test(jsSrc) &&
    /d\.id >= 31 && \(d\.cargo \|\| 0\) > 0/.test(jsSrc));
  // 41r. 成就奖励：铜 / 银 / 金 / 彩 各 50 / 100 / 150 / 200 金币，可领时亮红点
  check('成就四阶奖励金币：铜 50 / 银 100 / 金 150 / 彩 200', (() => {
    return JSON.stringify(sandbox.Meta.TIER_COINS) === JSON.stringify([0, 50, 100, 150, 200]) &&
      sandbox.Meta.tierCoin(1) === 50 && sandbox.Meta.tierCoin(4) === 200;
  })());
  check('成就领奖：领一次进钱包、不能重复领、没领的阶算「有红点」', (() => {
    const id = 'first';
    localStorageStub.setItem('nl2:macht', JSON.stringify({ first: 2 }));   // 已经到银杯
    localStorageStub.setItem('nl2:machc', JSON.stringify({}));
    const before = sandbox.Store.getWallet().coins;
    const pend0 = sandbox.Meta.claimableTiers(id).length;
    const r1 = sandbox.Meta.claimTier(id, 1);
    const r2 = sandbox.Meta.claimTier(id, 1);
    const after = sandbox.Store.getWallet().coins;
    const pend1 = sandbox.Meta.claimableTiers(id).length;
    return pend0 === 2 && r1.ok && r1.coins === 50 && !r2.ok &&
      after === before + 50 && pend1 === 1 &&
      sandbox.Meta.isTierClaimed(id, 1) && !sandbox.Meta.isTierClaimed(id, 2) &&
      sandbox.Meta.hasPending(id) && sandbox.Meta.pendingCount() >= 1;
  })());
  check('成就墙 / 成就键的红点：没领奖才有 .pending 与小圆点元素', (() => {
    return /hasPending\(a\.id\)/.test(fs.readFileSync(path.join(__dirname, 'js', 'meta.js'), 'utf8')) &&
      /class="ach-dot"/.test(fs.readFileSync(path.join(__dirname, 'js', 'meta.js'), 'utf8')) &&
      htmlSrc.includes('id="ach-dot"') && htmlSrc.includes('id="ach-detail"') &&
      htmlSrc.includes('id="btn-ach-claim"') && htmlSrc.includes('ach-trophy-svg') &&
      /function updateAchDot/.test(jsSrc) && /updateAchDot\(\)/.test(jsSrc);
  })());
  check('榜单改用固定列：星星列、分数列各自对齐（col4 / col5）',
    /lb-swipe col4/.test(jsSrc) && /lb-swipe col5/.test(jsSrc) &&
    /\.lb-swipe\.col4\s*\{[^}]*display: grid/.test(cssSrc) &&
    /\.lb-swipe\.col5\s*\{[^}]*display: grid/.test(cssSrc) &&
    /\.lb-swipe\.col4 \.lb-score,\s*\n\.lb-swipe\.col5 \.lb-score\s*\{[^}]*text-align: left/.test(cssSrc));
  check('云存档自动化：记着密码就系统自己存，不用玩家点',
    /function autoCloudSave/.test(jsSrc) && /autoCloudSave, rememberedPass/.test(jsSrc) &&
    /function rememberPass/.test(jsSrc) && /rememberPass\(acc, pass\)/.test(jsSrc) &&
    /Account\.autoCloudSave\(\)/.test(jsSrc) && htmlSrc.includes('☁️ 云存档') &&
    htmlSrc.includes('自动存到服务器'));

  // ==================== 80 关扩展：新特殊块 + 新机关 ====================
  const lvlJson = JSON.parse(fs.readFileSync(path.join('js', 'levels.json'), 'utf8'));
  check('主线扩到 80 关 / 8 章，新增 4 个主题（森林 / 云端 / 沙漠 / 熔岩）',
    lvlJson.levels.length === 80 && lvlJson.maxMainLevel === 80 && lvlJson.chapters.length === 8 &&
    ['forest', 'sky', 'desert', 'lava'].every((t) => lvlJson.themes[t]) &&
    ['forest', 'sky', 'desert', 'lava'].every((t) => /data-theme/.test(cssSrc)));
  check('41~50 关带常春藤 / 霜块，51~60 带传送门 / 轨道，61~70 带流沙 / 迷雾，71~80 带保险箱 / 步数炸弹', (() => {
    const seg = (from, to) => lvlJson.levels.slice(from - 1, to);
    return seg(41, 50).some((l) => l.ivy) && seg(41, 50).some((l) => l.frost) &&
      seg(51, 60).some((l) => l.portal) && seg(51, 60).some((l) => l.track) &&
      seg(61, 70).some((l) => l.sand) && seg(61, 70).some((l) => l.fog) &&
      seg(71, 80).some((l) => l.box) && seg(71, 80).some((l) => l.tbomb) &&
      lvlJson.levels[79].final === true;
  })());

  check('新增四种特殊块：磁铁 🧲 / 颜料 🎨 / 霜块 ❄️ / 螺旋桨 🛩️',
    Sp.TYPE.MAGNET === 5 && Sp.TYPE.PAINT === 6 && Sp.TYPE.FROST === 7 && Sp.TYPE.PROPELLER === 8 &&
    Sp.META[5].icon === '🧲' && Sp.META[6].icon === '🎨' &&
    Sp.META[7].icon === '❄️' && Sp.META[8].icon === '🛩️');

  check('生成规则：7 连 → 颜料，6 连 → 磁铁，5 连 → 彩虹，4 连 → 线消，L/T → 炸弹', (() => {
    // 底色用棋盘格（(r+c)%2），保证背景自己不会连成长串
    const line = (len) => {
      const b = [...Array(8)].map((_, r) => [...Array(8)].map((_, c) => ({ type: (r + c) % 2, special: 0 })));
      for (let c = 0; c < len; c++) b[3][c] = { type: 2, special: 0 };
      const runs = Sp.detectRuns(b, 8, 8).filter((x) => x.cells[0].r === 3);
      return Sp.planCreation(b, new Set(runs[0].cells.map((p) => p.r + ',' + p.c)), null, runs, []);
    };
    const p7 = line(7), p6 = line(6), p5 = line(5), p4 = line(4);
    return p7 && p7.type === Sp.TYPE.PAINT && p6 && p6.type === Sp.TYPE.MAGNET &&
      p5 && p5.type === Sp.TYPE.RAINBOW && p4 && (p4.type === Sp.TYPE.LINE_H || p4.type === Sp.TYPE.LINE_V);
  })());

  check('大 L/T（7 格以上）→ 螺旋桨', (() => {
    const b = [...Array(8)].map((_, r) => [...Array(8)].map((_, c) => ({ type: (r + c) % 2, special: 0 })));
    for (let c = 0; c < 4; c++) b[3][c] = { type: 2, special: 0 };   // 横 4
    for (let r = 0; r < 4; r++) b[r][1] = { type: 2, special: 0 };   // 竖 4（与横共用一格 → L 型 7 格）
    const runs = Sp.detectRuns(b, 8, 8).filter((x) => x.cells[0].r === 3 || x.cells[0].c === 1);
    const shapes = Sp.detectLShapes(b, 8, 8, runs);
    const plan = Sp.planCreation(b, new Set(), null, runs, shapes);
    return shapes.length && shapes[0].size >= 7 && plan && plan.type === Sp.TYPE.PROPELLER;
  })());

  check('磁铁吸身边 7×7 的同色方块；螺旋桨斜扫两条对角线', (() => {
    const b = [...Array(8)].map(() => [...Array(8)].map(() => ({ type: 0, special: 0 })));
    b[3][4] = { type: 2, special: Sp.TYPE.MAGNET };
    b[1][2] = { type: 2, special: 0 };   // 7×7 内同色 → 吸
    b[0][4] = { type: 2, special: 0 };   // 正上 3 格 → 吸
    b[6][7] = { type: 2, special: 0 };   // 斜对角 3+3 → 吸
    b[4][5] = { type: 1, special: 0 };   // 7×7 内但不同色 → 不吸
    b[3][0] = { type: 2, special: 0 };   // 左边 4 格（出了 7×7）→ 不吸
    b[0][0] = { type: 2, special: 0 };   // 横向出了 7×7 → 不吸
    const m = Sp.expandClears(b, 8, 8, new Set(['3,4']), {});
    const prop = [...Array(8)].map(() => [...Array(8)].map(() => ({ type: 1, special: 0 })));
    prop[2][2] = { type: 1, special: Sp.TYPE.PROPELLER };
    const pr = Sp.expandClears(prop, 8, 8, new Set(['2,2']), {});
    return m.cells.has('3,4') && m.cells.has('1,2') && m.cells.has('0,4') && m.cells.has('6,7') &&
      !m.cells.has('4,5') && !m.cells.has('3,0') && !m.cells.has('0,0') &&
      pr.cells.has('0,0') && pr.cells.has('1,1') && pr.cells.has('3,3') &&
      pr.cells.has('0,4') && pr.cells.has('5,5') && !pr.cells.has('0,1');
  })());
  check('四个道具有专属音效 + 磁铁吸引特效（FX.attract），专属音效不再叠 match', (() => {
    const ajq = fs.readFileSync(path.join(__dirname, 'js', 'audio.js'), 'utf8');
    const fx = fs.readFileSync(path.join(__dirname, 'js', 'effects.js'), 'utf8');
    const gjs = fs.readFileSync(path.join(__dirname, 'js', 'game.js'), 'utf8');
    return /case 'paint':/.test(ajq) && /case 'magnet':/.test(ajq) &&
      /case 'propeller':/.test(ajq) && /case 'rainbow':/.test(ajq) &&
      /attract\(x, y, tx, ty, color, count\)/.test(fx) && /kind === 'attract'/.test(fx) &&
      /FX\.attract\(/.test(gjs) &&
      /playSFX\('paint'\)/.test(gjs) && /playSFX\('magnet'\)/.test(gjs) &&
      /playSFX\('propeller'\)/.test(gjs) && /playSFX\('rainbow'\)/.test(gjs) &&
      /else if \(!dedicatedBoomSfx\) AudioManager\.playSFX\('match'/.test(gjs);
  })());
  check('飞机音效是低沉不刺耳的嗡嗡声（低通滤波 78Hz 双层拍频）且整段渐隐，不再扑扑扑', (() => {
    const ajq = fs.readFileSync(path.join(__dirname, 'js', 'audio.js'), 'utf8');
    const m = ajq.match(/case 'propeller': \{[\s\S]*?\n        \}/);
    if (!m) return false;
    const body = m[0];
    // 必须走 _hum（带低通，高频被切掉才不会尖锐），不能再用裸锯齿 / 方波直接发声
    return /this\._hum\(78, 1\.9, 0\.20, 0, 64, 230\)/.test(body) &&
      /this\._hum\(80\.5, 1\.9, 0\.09, 0, 66, 200\)/.test(body) &&
      !/this\._tone\(/.test(body) && body.indexOf('扑、扑、扑') < 0 &&
      /_humNow\(freq, dur, vol, delay, to, cutoff\)/.test(ajq) &&
      /lp\.type = 'lowpass'/.test(ajq);
  })());
  check('音乐开关不再有延迟：BGM 走独立总线，关掉立即静音、打开先叫醒 ctx', (() => {
    const ajq = fs.readFileSync(path.join(__dirname, 'js', 'audio.js'), 'utf8');
    return /_bgmGain = this\.ctx\.createGain\(\)/.test(ajq) &&
      /this\._bgmBusOn\(false\);/.test(ajq) &&
      /this\.resumeCtx\(\);[\s\S]{0,80}this\._bgmBusOn\(true\);/.test(ajq) &&
      /g\.connect\(this\._bgmGain \|\| this\.ctx\.destination\)/.test(ajq);
  })());
  check('音量滑条实时生效：合成 BGM 音量走总线 applyBgmVolume，音符排程不再乘 bgmVol', (() => {
    const ajq = fs.readFileSync(path.join(__dirname, 'js', 'audio.js'), 'utf8');
    return /applyBgmVolume\(\) \{/.test(ajq) &&
      /this\.applyBgmVolume\(\);\s*\/\/ 合成 BGM/.test(ajq) &&
      !/BGM_NOTE_PEAK \* this\.bgmVol/.test(ajq) && !/BGM_BASS_PEAK \* this\.bgmVol/.test(ajq) &&
      /g\.linearRampToValueAtTime\(on \? Math\.max\(0\.0001, this\.bgmVol\) : 0\.0001/.test(ajq) &&
      /this\.applyBgmVolume\(\);\s*\/\/ 起播前把总线音量对齐到当前设置/.test(ajq);
  })());
  check('提示 / 洗牌 / 撤回次数用完（0）时徽章变灰（badge.empty）',
    /classList\.toggle\('empty', !\(S\.hintLeft > 0\)\)/.test(jsSrc) &&
    /classList\.toggle\('empty', !\(S\.shuffleLeft > 0\)\)/.test(jsSrc) &&
    /classList\.toggle\('empty', !\(S\.undoLeft > 0\)\)/.test(jsSrc) &&
    /\.tool-btn \.badge\.empty\s*\{[^}]*background:\s*#b8b2c4/.test(cssSrc));
  check('关卡记录：未解锁空着、已解锁没打过显示灰色「未开始」（字号同「未解锁」小标签）',
    /\.history-item \.h-score\.not-start\s*\{[^}]*#b0a9c0/.test(cssSrc) &&
    /\.history-item \.h-score\.not-start\s*\{[^}]*font-size:\s*10px/.test(cssSrc) &&
    /\.history-item \.lock-tag\s*\{\s*font-size:\s*10px/.test(cssSrc) &&
    /: \(locked \? '<span class="h-score"><\/span>'/.test(jsSrc) &&
    /'<span class="h-score not-start">未开始<\/span>'/.test(jsSrc));
  check('玩家名单省份列固定宽、名字列放得下 7 个中文字：「未定位」不再把分数列挤歪',
    /grid-template-columns: 26px minmax\(0, 1fr\) 22px 34px 6ch 56px;/.test(cssSrc) &&
    !/6ch minmax\(0, max-content\)/.test(cssSrc) &&
    /hiddenNames = new Set\(Array\.isArray\(r\.hidden\)/.test(jsSrc) &&
    /if \(isHiddenName\(n\)\) return;/.test(jsSrc) &&
    workerSrc.includes('hidden_names') && /hidden: hidden \}/.test(workerSrc));
  check('IP 定位：ipip（国内库）优先单独问，其它源只在它失败时兜底；不再抢跑定错省',
    jsSrc.includes('myip.ipip.net/json') && /const GEO_VER = 4;/.test(jsSrc) &&
    /pickGeoSource\('ipip'\)/.test(jsSrc) && /onlyForeign/.test(jsSrc) &&
    /if \(src\.name === 'ipip'\) return;/.test(jsSrc) &&
    !/fetchOwnGeo/.test(jsSrc) && !/'\/api\/nl_geo'/.test(jsSrc));

  check('超级融合：彩虹+磁铁 = 磁力虹吸，炸弹+磁铁 = 磁力爆破，双磁铁 = 双磁十字，霜块组合带定格', (() => {
    const b = [...Array(8)].map(() => [...Array(8)].map(() => ({ type: 1, special: 0 })));
    b[3][3] = { type: 1, special: Sp.TYPE.RAINBOW };
    b[3][4] = { type: 1, special: Sp.TYPE.MAGNET };
    const c1 = Sp.comboAt(b, 8, 8, { r: 3, c: 3 }, { r: 3, c: 4 });
    b[3][3] = { type: 1, special: Sp.TYPE.BOMB };
    const c2 = Sp.comboAt(b, 8, 8, { r: 3, c: 3 }, { r: 3, c: 4 });
    b[3][3] = { type: 1, special: Sp.TYPE.MAGNET };
    const c3 = Sp.comboAt(b, 8, 8, { r: 3, c: 3 }, { r: 3, c: 4 });
    b[3][3] = { type: 1, special: Sp.TYPE.FROST };
    const c4 = Sp.comboAt(b, 8, 8, { r: 3, c: 3 }, { r: 3, c: 4 });
    b[3][3] = { type: 1, special: Sp.TYPE.PROPELLER };
    b[3][4] = { type: 1, special: Sp.TYPE.LINE_H };
    const c5 = Sp.comboAt(b, 8, 8, { r: 3, c: 3 }, { r: 3, c: 4 });
    return c1 && c1.label === '磁力虹吸' && c2 && c2.label === '磁力爆破' &&
      c3 && c3.label === '双磁十字' && c4 && c4.freeze === 3 &&
      c5 && !!c5.label;
  })());

  check('新标准：弯的也算数（横4+竖3 同色 6 格 → 磁铁，横3+竖3 → 炸弹），十字交叉 → 螺旋桨', (() => {
    const mk = () => [...Array(8)].map((_, r) => [...Array(8)].map((_, c) => ({ type: (r + c) % 2, special: 0 })));
    // 横 4 + 竖 3（共用一格）= 同色 6 格 → 磁铁
    const b1 = mk();
    for (let c = 0; c < 4; c++) b1[3][c] = { type: 2, special: 0 };
    for (let r = 1; r < 4; r++) b1[r][2] = { type: 2, special: 0 };
    const runs1 = Sp.detectRuns(b1, 8, 8).filter((x) => x.cells[0].r === 3 || x.cells[0].c === 2);
    const cells1 = new Set();
    runs1.forEach((x) => x.cells.forEach((p) => cells1.add(p.r + ',' + p.c)));
    const plan1 = Sp.planCreation(b1, cells1, null, runs1, Sp.detectLShapes(b1, 8, 8, runs1));
    // 横 3 + 竖 3（共用一格）= 5 格 L 型 → 炸弹
    const b2 = mk();
    for (let c = 0; c < 3; c++) b2[3][c] = { type: 2, special: 0 };
    for (let r = 1; r < 4; r++) b2[r][1] = { type: 2, special: 0 };
    const runs2 = Sp.detectRuns(b2, 8, 8).filter((x) => x.cells[0].r === 3 || x.cells[0].c === 1);
    const cells2 = new Set();
    runs2.forEach((x) => x.cells.forEach((p) => cells2.add(p.r + ',' + p.c)));
    const plan2 = Sp.planCreation(b2, cells2, null, runs2, Sp.detectLShapes(b2, 8, 8, runs2));
    // 横 4 + 竖 4 交叉 → 螺旋桨
    const b3 = mk();
    for (let c = 0; c < 4; c++) b3[3][c] = { type: 2, special: 0 };
    for (let r = 0; r < 4; r++) b3[r][1] = { type: 2, special: 0 };
    const runs3 = Sp.detectRuns(b3, 8, 8).filter((x) => x.cells[0].r === 3 || x.cells[0].c === 1);
    const plan3 = Sp.planCreation(b3, new Set(), null, runs3, Sp.detectLShapes(b3, 8, 8, runs3));
    return plan1 && plan1.type === Sp.TYPE.MAGNET &&
      plan2 && plan2.type === Sp.TYPE.BOMB &&
      plan3 && plan3.type === Sp.TYPE.PROPELLER;
  })());

  check('说明页组合技每一条的「A + B」都加粗，格式统一', (() => {
    const sec = htmlSrc.slice(htmlSrc.indexOf('💥 组合技'), htmlSrc.indexOf('🔥 连击与倍率'));
    const lines = sec.split('\n').filter((l) => l.includes('<p>·'));
    return lines.length >= 9 && lines.every((l) => {
      const t = l.trim();
      return t.includes('→') ? /<p>· <b>.+<\/b> →/.test(t) : /<p>· <b>.+<\/b>/.test(t);
    });
  })());

  check('README 目录是树形结构（├──/└── + 行内说明），仓库根列表顺序不变', (() => {
    const md = fs.readFileSync('README.md', 'utf8');
    const order = ['_backend', '_preview', '_sql', 'assets', 'css', 'js',
      '.gen-preview.js', '.gitattributes', '.gitignore',
      '04e09ed9f0027f5098706fd59f75b873.txt', '969204503f687f55d49123a656b135b9.txt',
      'README.md', '_gen-chaptermap.js', '_gen-levels.js', 'index.html',
      'project.config.json', 'project.private.config.json', 'test-longpress.js', 'test-smoke.js'];
    let pos = -1;
    const inOrder = order.every((name) => {
      const i = md.indexOf(name, pos + 1);
      if (i < 0) return false;
      pos = i;
      return true;
    });
    return inOrder && /├── /.test(md) && /└── /.test(md) && /│   └── /.test(md) &&
      /├── js\/\s+# 游戏逻辑/.test(md) && md.length < 3200 &&
      // 简介不再写关数
      !md.includes('主线 80 关') &&
      // 所有行内说明的 # 必须纵向对齐
      (() => {
        const cols = md.split('\n')
          .filter((l) => /[│├└]/.test(l) && l.includes('#'))
          .map((l) => l.indexOf('#'));
        return cols.length > 10 && cols.every((c) => c === cols[0]);
      })();
  })());

  check('商店按「消除得分」定价：颜料 500 > 彩虹 300 > 螺旋桨 250 > 线消 230 > 磁铁 210 > 炸弹 180 > 霜块 20', (() => {
    const shop = sandbox.Tasks.SHOP;
    const by = (k) => shop.find((x) => x.key === k);
    const need = ['startFrost', 'startBomb', 'startMagnet', 'rainbow', 'startPropeller', 'startLine', 'startPaint'];
    if (!need.every((k) => by(k))) return false;
    return by('startPaint').price === 500 && by('rainbow').price === 300 &&
      by('startPropeller').price === 250 && by('startLine').price === 230 &&
      by('startMagnet').price === 210 && by('startBomb').price === 180 &&
      by('startFrost').price === 20 &&
      // 彩虹和线消价格互换：彩虹比线消贵
      by('rainbow').price > by('startLine').price &&
      // 商店里特殊道具按价格从低到高排，霜块最便宜、颜料最贵
      shop.findIndex((x) => x.price === 20) < shop.findIndex((x) => x.price === 500);
  })());

  check('彩虹被消时静默额外 +50 分（不写进说明页）', (() => {
    const fn = jsSrc.slice(jsSrc.indexOf('const gained = Math.round'), jsSrc.indexOf('const gained = Math.round') + 400);
    return /rainbowBonus/.test(jsSrc) &&
      /bp\.type === T\.RAINBOW \? 50 : 0/.test(jsSrc) &&
      /\+ rainbowBonus/.test(jsSrc) &&
      !htmlSrc.includes('+50') && !htmlSrc.includes('额外 50');
  })());

  check('商店关闭再打开：记住停在第几张，卡片位置和小圆点一起还原', (() => {
    return /let shopIdx = 0/.test(jsSrc) &&
      /shopIdx = idx/.test(jsSrc) &&
      /function restoreShopScroll/.test(jsSrc) &&
      /stage\.scrollLeft = shopIdx \* shopStepOf/.test(jsSrc) &&
      /i === shopIdx \? ' on' : ''/.test(jsSrc) &&
      /applyShopDot\(shopIdx\)/.test(jsSrc) &&
      /restoreShopScroll\(\);\s*\n\s*if \(typeof requestAnimationFrame/.test(jsSrc) &&
      /case 'shop-menu':\s*\n\s*syncShopDot\(\);/.test(jsSrc);
  })());

  check('特殊道具都叫「xx道具」，说明里不留分号、不带「开局」；商店两行、只有背包合成一行', (() => {
    const shop = sandbox.Tasks.SHOP;
    const specials = ['startFrost', 'startBomb', 'startMagnet', 'startPropeller', 'startLine', 'startPaint', 'rainbow'];
    const namesOk = specials.every((k) => {
      const it = shop.find((x) => x.key === k);
      return it && /道具$/.test(it.name) && !/^开局/.test(it.name);
    });
    // 商店里任何道具的名字 / 说明都不许出现「开局」
    const noKaiJu = shop.every((it) => it.name.indexOf('开局') < 0 && it.desc.indexOf('开局') < 0);
    const noSemi = specials.every((k) => shop.find((x) => x.key === k).desc.indexOf('；') < 0);
    // 数据里这四件本来就是两句，用换行分开：商店卡片照旧显示两行
    const twoLine = ['startFrost', 'startMagnet', 'startPropeller', 'startPaint']
      .every((k) => {
        const d = shop.find((x) => x.key === k).desc;
        return d.split('\n').length === 2 && d.indexOf('，') < 0;
      });
    // 只有背包把换行换成逗号，接成一句话
    const packInline = jsSrc.indexOf("item.desc.replace(/\\n+/g, '，')") >= 0;
    // 商店卡片仍然用 <br> 换行
    const shopBr = jsSrc.indexOf("item.desc.replace(/\\n/g, '<br>')") >= 0;
    return namesOk && noKaiJu && noSemi && twoLine && packInline && shopBr;
  })());

  check('通关奖励 / 过关奖励在明细里写明是第几关；每日挑战的奖励写「每日挑战」', (() => {
    const lv = jsSrc.split("'第 ' + S.level + ' 关'").length - 1;
    return lv >= 3 && jsSrc.indexOf("'通关奖励', '第 ' + S.level + ' 关'") >= 0 &&
      /passed \? '通关奖励' : '过关奖励', '第 ' \+ S\.level \+ ' 关'/.test(jsSrc) &&
      /addCoins\(bonus, '通关奖励', '每日挑战'\)/.test(jsSrc);
  })());
  check('每日挑战：三星才发金币；奖励 = 100 + max(30×剩余步数, 总分/10+100)；没通关 / 没三星一分不发', (() => {
    return /allowGrant && \(starsNow \|\| 0\) >= 3 && !Store\.getDailyRecord\(\)\.coins/.test(jsSrc) &&
      /const movesLeft = Math\.max\(0, \(S\.levelDef\.moves \|\| 20\) - movesUsed\);/.test(jsSrc) &&
      /bonus = 100 \+ Math\.max\(30 \* movesLeft, Math\.floor\(S\.score \/ 10\) \+ 100\);/.test(jsSrc) &&
      /if \(S\.daily\) \{\s*\n\s*coins = dailyBonus;/.test(jsSrc) &&      // 通关结算：金额就是按步算的奖励
      /if \(!S\.daily\) \{\s*\n\s*coins = passed \?/.test(jsSrc);         // 步数耗尽结算：每日挑战不发
  })());
  check('每日挑战的两个结算画面都不显示「历史最高」那一行（普通关照常）',
    /const hiRow = \$\('clear-high-row'\);\s*\n\s*if \(hiRow\) hiRow\.style\.display = S\.daily \? 'none' : '';/.test(jsSrc) &&
    /const hiRow2 = \$\('final-high-row'\);\s*\n\s*if \(hiRow2\) hiRow2\.style\.display = S\.daily \? 'none' : '';/.test(jsSrc));

  check('每日任务 / 续命 在明细里也写明来由（哪个任务、第几关）', (() => {
    const tj = fs.readFileSync(path.join(__dirname, 'js', 'tasks.js'), 'utf8');
    return /Store\.addCoins\(t\.reward, '每日任务', t\.desc\)/.test(tj) &&
      /Store\.spendCoins\(REVIVE_COST, '续命', S\.daily \? '每日挑战' : \('第 ' \+ S\.level \+ ' 关'\)\)/.test(jsSrc);
  })());

  check('商店做成横滑卡片（一次一张 + 圆点指示），背包仍是竖排列表',
    htmlSrc.includes('class="shop-stage"') && htmlSrc.includes('id="shop-dots"') &&
    /\.shop-stage\s*\{[^}]*scroll-snap-type:\s*x mandatory/.test(cssSrc) &&
    /\.shop-card\s*\{[^}]*scroll-snap-align:\s*center/.test(cssSrc) &&
    /function syncShopDot/.test(jsSrc) &&
    jsSrc.includes("card.className = 'shop-card'") &&
    /id="backpack-list"/.test(htmlSrc) && /\.shop-list\s*\{[^}]*flex-direction:\s*column/.test(cssSrc));

  check('背包道具右边的按键统一写「使用」，放置类也在列', (() => {
    return /startMagnet:\s*'使用'/.test(jsSrc) && /startPaint:\s*'使用'/.test(jsSrc) &&
      /startPropeller:\s*'使用'/.test(jsSrc) && /startFrost:\s*'使用'/.test(jsSrc) &&
      !/:\s*'放置'/.test(jsSrc) &&
      /'startMagnet'\s*\?\s*T\.MAGNET/.test(jsSrc) && /'startPaint'\s*\?\s*T\.PAINT/.test(jsSrc) &&
      /'startPropeller'\s*\?\s*T\.PROPELLER/.test(jsSrc) && /'startFrost'\s*\?\s*T\.FROST/.test(jsSrc) &&
      /已在随机位置放了一块磁铁/.test(jsSrc);
  })());

  check('棋盘接入机关：状态数组 / 开局摆放 / 每步结算 / 失败原因 / 传送门与流沙 / 存档与快照', (() => {
    return /S\.ivy = \[\]/.test(jsSrc) && /S\.tbomb = \[\]/.test(jsSrc) && /S\.portalAt = \[\]/.test(jsSrc) &&
      /function growIvy/.test(jsSrc) && /function burySand/.test(jsSrc) &&
      /function shiftTrack/.test(jsSrc) && /function spawnFrost/.test(jsSrc) &&
      /function tickHazards/.test(jsSrc) && /tickHazards\(\);/.test(jsSrc) &&
      /function failByHazard/.test(jsSrc) && /S\.failReason/.test(jsSrc) &&
      /function teleportCargo/.test(jsSrc) && /teleportCargo\(\)/.test(jsSrc) &&
      /function chipBox/.test(jsSrc) && /function paintArea/.test(jsSrc) &&
      /IVY_FAIL/.test(jsSrc) && /S\.sand\[ROWS - 1\] && S\.sand\[ROWS - 1\]\[c\]/.test(jsSrc) &&
      /ivy: S\.ivy,/.test(jsSrc) && /fog: S\.fog,/.test(jsSrc) &&
      /frostTurns: S\.frostTurns \|\| 0/.test(jsSrc);
  })());

  check('颜料刷成的颜色取「颜料块底下」那格自己的颜色；生成特殊块时黑底提示条也报一声', (() => {
    const iPaint = jsSrc.indexOf('function paintArea');
    const paintSrc = iPaint >= 0 ? jsSrc.slice(iPaint, iPaint + 700) : '';
    // 颜色优先用颜料块自己的 type（正下方那格），不是「场上最多的颜色」
    const colorOk = /self\.type/.test(paintSrc) &&
      paintSrc.indexOf('dominantColor') > paintSrc.indexOf('self.type');
    // 生成提示：每种特殊块有名字，生成时走 toast
    const genOk = /const SPECIAL_NAMES/.test(jsSrc) &&
      /SPECIAL_NAMES\[T\.RAINBOW\]/.test(jsSrc) &&
      /SPECIAL_NAMES\[plan\.type\]/.test(jsSrc) &&
      /这步生成了「'/.test(jsSrc);
    // 提示条挂在双倍那一行下面：真正负责贴位置的 paintToast 里按 frenzy-slot 算 top
    const iPaintToast = jsSrc.indexOf('function paintToast');
    const toastOk = iPaintToast >= 0 &&
      /frenzy-slot/.test(jsSrc.slice(iPaintToast, iPaintToast + 900)) &&
      /el\.style\.bottom = 'auto'/.test(jsSrc);
    // 生成提示不带 🎁，而且走排队：一步里连出好几个道具时逐条在同一位置播
    const queueOk = /function toastQueued/.test(jsSrc) && /const toastQueue = \[\]/.test(jsSrc) &&
      /toastQueued\('这步生成了「'/.test(jsSrc) && !/🎁 这步生成了/.test(jsSrc);
    return colorOk && genOk && toastOk && queueOk;
  })());

  check('霜块❄️ 只在机关关卡自动生成（普通关不会冒霜块）', (() => {
    return /function hasHazardLevel/.test(jsSrc) &&
      /S\.hazardLevel = hasHazardLevel\(S\.levelDef\)/.test(jsSrc) &&
      /S\.turnCount % FROST_EVERY === 0 && S\.hazardLevel\) spawnFrost\(\)/.test(jsSrc) &&
      (() => {
        const i = jsSrc.indexOf('function hasHazardLevel');
        const body = i >= 0 ? jsSrc.slice(i, i + 400) : '';
        return /d\.ivy/.test(body) && /d\.sand/.test(body) && /d\.portal/.test(body) && /d\.track/.test(body);
      })();
  })());

  // 霜块只在机关关卡自动生成：普通关（第 1 关）标记为 false，机关关（第 41 关）为 true
  const startAndFlag = (lv) => { sandbox.__nl_test.start(lv, {}); return sandbox.__nl_test.state().hazardLevel; };
  const flagPlain = startAndFlag(1);
  const flagHazard = startAndFlag(41);
  check('霜块只在机关关卡：普通关 hazardLevel=false，机关关 hazardLevel=true',
    flagPlain === false && flagHazard === true);

  check('规则页：线消带 ↔️/↕️ 图示，霜块写明「只在机关关卡时每 6 步长一个」', (() => {
    return htmlSrc0.indexOf('<b>线消↔️/↕️</b>') > 0 &&
      htmlSrc0.indexOf('线消</b>：4 连生成') < 0 &&
      htmlSrc0.indexOf('<b>霜块❄️</b>：在机关关卡时，每6步自动长一个；消掉它，3 步内所有机关暂停。') > 0;
  })());

  check('机关提示条：页面有 hazard-bar，样式有 hazard-chip，开局 / 每步都会刷新',
    htmlSrc.includes('id="hazard-bar"') &&
    /\.hazard-bar\s*\{[^}]*display:\s*none/.test(cssSrc) && /\.hazard-chip/.test(cssSrc) &&
    /function updateHazardBar/.test(jsSrc) && /updateHazardBar\(\);/.test(jsSrc));

  check('机关提示条挪到棋盘下方「双倍」右边，目标栏下面不再放任何东西', (() => {
    const slot = htmlSrc0.slice(htmlSrc0.indexOf('class="frenzy-slot"'), htmlSrc0.indexOf('节拍条') >= 0 ? htmlSrc0.indexOf('节拍条') : htmlSrc0.indexOf('id="beat-bar"'));
    const between = htmlSrc0.slice(htmlSrc0.indexOf('id="target-bar"'), htmlSrc0.indexOf('class="tools"'));
    return slot.includes('id="frenzy-chip"') && slot.indexOf('id="frenzy-chip"') < slot.indexOf('id="hazard-bar"') &&
      !between.includes('id="hazard-bar"') &&
      /\.hazard-bar\s*\{[^}]*max-width:\s*100%/.test(cssSrc) &&
      /\.hazard-bar\s*\{[^}]*flex-wrap:\s*wrap/.test(cssSrc) &&
      !/\.hazard-bar\s*\{[^}]*margin-top/.test(cssSrc);
  })());

  check('新特殊块在棋盘上有专属画法（emoji + 光晕）', (() => {
    const seg = jsSrc.slice(jsSrc.indexOf('function drawSpecialOverlay'), jsSrc.indexOf('function tileBaseColor'));
    return seg.includes("'🧲'") && seg.includes("'🎨'") && seg.includes("'❄️'") && seg.includes("'🛩️'");
  })());

  console.log(failed ? ('\n' + failed + ' 项失败') : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
