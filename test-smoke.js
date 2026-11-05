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
    style: { setProperty() {}, display: '', removeProperty() {} },
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
// 预生成 querySelectorAll('.overlay') 用到的元素
['main-menu', 'settings-menu', 'volume-menu', 'custom-music-menu', 'music-history-menu',
  'playlist-menu', 'music-library-menu', 'rename-menu', 'tasks-menu', 'shop-menu', 'history-menu',
  'backpack-menu', 'logout-confirm', 'logout-confirm2', 'level-clear', 'game-over', 'game-complete'
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
  $('btn-close-backpack').dispatch('click');
  check('背包关闭', $('backpack-menu').style.display === 'none');

  // 4. 注销账号：入口搬到「设置 → 账号安全」（切换账号下面），主页换成邮箱键
  const htmlSrc0 = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check('主页不再有注销按钮，右下角是 📮 邮箱键',
    htmlSrc0.includes('id="btn-mail"') && htmlSrc0.indexOf('id="btn-mail"') < htmlSrc0.indexOf('id="home-menu"'));
  check('注销账号在账号安全面板里、切换账号下面',
    htmlSrc0.indexOf('id="btn-logout"') > htmlSrc0.indexOf('id="btn-goto-switch"') &&
    htmlSrc0.indexOf('id="btn-logout"') < htmlSrc0.indexOf('id="btn-close-account"'));
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
    htmlSrc0.indexOf('id="btn-admin-hits"') < htmlSrc0.indexOf('id="btn-admin-close"'));
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
  $('btn-admin-hits-back').dispatch('click');
  check('「点击数量」返回一级', $('admin-page-hits').style.display === 'none' && $('admin-nav').style.display === 'flex');
  $('btn-admin-users').dispatch('click');
  check('点「全服用户」进二级页', $('admin-page-users').style.display === 'flex' && $('admin-nav').style.display === 'none');
  check('全服用户页把用户数 / 省份数填上了',
    !!$('admin-users').textContent && !!$('admin-provs').textContent);
  $('btn-admin-users-back').dispatch('click');
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
  check('名单页打开、标题是全服', $('admin-user-list').style.display === 'flex' &&
    String($('admin-ul-title').textContent).indexOf('全服') >= 0);
  check('名单列出全部用户', $('admin-ul-list').children.length === su2.users);
  $('admin-ul-swap').dispatch('click');
  check('⇄ 弹出「全服 + 每个省」的选择', $('admin-ul-picker').style.display === 'grid' &&
    $('admin-ul-picker').children.length >= 30 &&
    String($('admin-ul-picker').children[0].textContent) === '全服');
  sandbox.__nl_test.setUserListProv('guangdong');
  check('筛到广东省只剩外省玩家', $('admin-ul-list').children.length === 1 &&
    String($('admin-ul-list').children[0].children[0].innerHTML).indexOf('外省玩家') >= 0);
  sandbox.__nl_test.setUserListProv('');
  check('切回全服又全部列出', $('admin-ul-list').children.length === su2.users);

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

  useBtns[0].dispatch('click'); // +3 步
  check('使用「+3 步」生效', Number($('moves').textContent) === movesBefore + 3);
  check('「+3 步」消耗 1 个', (sandbox.Store.getWallet().items.extraMoves || 0) === 0);

  const shuffleBefore = Number($('shuffle-count').textContent);
  packRows2 = $('backpack-list').children; // 使用后重渲染
  packRows2[0].children[packRows2[0].children.length - 1].dispatch('click'); // 洗牌 +1（转入本局）
  check('使用「洗牌」转入本局次数', (sandbox.Store.getWallet().items.shuffle || 0) === 0);
  check('洗牌徽章 +1（只算本局次数）', Number($('shuffle-count').textContent) === shuffleBefore + 1);

  packRows2 = $('backpack-list').children;
  packRows2[0].children[packRows2[0].children.length - 1].dispatch('click'); // 开局炸弹（局内放置）
  check('使用「炸弹」放置成功', $('toast').textContent.includes('炸弹'));
  check('「炸弹」消耗 1 个', (sandbox.Store.getWallet().items.startBomb || 0) === 0);
  $('btn-close-backpack').dispatch('click');

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
  check('未开局点击不消耗道具', (sandbox.Store.getWallet().items.rainbow || 0) === 1);
  check('未开局有引导提示', $('toast').textContent.includes('局内使用'));

  // 9. 玩法规则面板
  $('btn-close-backpack').dispatch('click');
  $('btn-rules').dispatch('click');
  check('规则面板打开', $('rules-menu').style.display === 'flex');
  const htmlSrc = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  check('规则含星级评价说明', htmlSrc.includes('星级评价') && htmlSrc.includes('分数线'));
  check('规则说明线消横清行竖清列', htmlSrc.includes('横着连的清整行、竖着连的清整列'));
  check('规则含 8 种目标', ['普通得分', '收集方块', '清除果冻', '限时得分', '极限步数', '敲碎冰块', '运送钥匙', '护送奶龙'].every((s) => htmlSrc.includes(s)));
  check('规则含障碍与货物说明', htmlSrc.includes('障碍与货物') && htmlSrc.includes('送到最底行') && htmlSrc.includes('落到被消掉那一格的下面一格'));
  check('规则含狂热与节奏说明', htmlSrc.includes('狂热 6 秒') && htmlSrc.includes('节奏关卡'));
  check('规则含提示与续命说明', htmlSrc.includes('每局免费') && htmlSrc.includes('200 金币'));
  check('规则含更多玩法与福利说明', htmlSrc.includes('无尽模式') && htmlSrc.includes('每日转盘'));
  check('规则含成就配色排行榜说明', htmlSrc.includes('成就与配色') && htmlSrc.includes('排行榜与奖牌') && htmlSrc.includes('总榜 → 省榜 → 局榜'));
  check('规则里昵称只说「名字具有唯一性」，不提旧默认名 / 榜上重名',
    htmlSrc.includes('名字具有唯一性') && !htmlSrc.includes('不能和榜上的人重名') &&
    !htmlSrc.includes('默认的「奶龙玩家」'));
  check('规则页不剧透总章节数 / 总关数', !htmlSrc.includes('主线共 <b>40 关</b>') && !htmlSrc.includes('40 关') && !htmlSrc.includes('4 个章节'));
  check('规则含补签说明', htmlSrc.includes('补签') && htmlSrc.includes('300 金币'));
  check('结算页有继续游戏按钮且在进入下一关上面',
    htmlSrc.includes('btn-clear-continue') && htmlSrc.indexOf('btn-clear-continue') < htmlSrc.indexOf('id="btn-next-level"'));
  check('主页关卡记录在更多玩法前面（已交换）',
    htmlSrc.indexOf('btn-history') >= 0 && htmlSrc.indexOf('btn-history') < htmlSrc.indexOf('btn-modes'));
  check('福利中心底部有连续签到与补签',
    htmlSrc.includes('welfare-streak') && htmlSrc.includes('btn-welfare-makeup') &&
    htmlSrc.indexOf('welfare-streak') > htmlSrc.indexOf('btn-wheel'));
  check('省榜 / 局榜更换符号在标题右边', htmlSrc.includes('lb-title-row') && htmlSrc.includes('lb-swap') &&
    htmlSrc.indexOf('lb-view-title') < htmlSrc.indexOf('lb-prov-swap'));
  // 📖 规则首页 → 功能介绍 / 玩法规则 分开
  $('btn-goto-features').dispatch('click');
  check('点「功能介绍」进入功能介绍页', $('features-menu').style.display === 'flex' && $('rules-menu').style.display === 'none');
  const featsHtml = htmlSrc.slice(htmlSrc.indexOf('id="features-box"'), htmlSrc.indexOf('id="btn-features-back"'));
  check('功能介绍里放的是系统功能（章节 / 福利 / 账号）',
    featsHtml.includes('主线与章节') && featsHtml.includes('福利中心') && featsHtml.includes('账号与昵称') &&
    featsHtml.includes('📮 邮箱') && featsHtml.includes('注销账号') &&
    !featsHtml.includes('基本玩法'));
  $('btn-features-back').dispatch('click');
  check('功能介绍「返回」回到规则首页', $('features-menu').style.display === 'none' && $('rules-menu').style.display === 'flex');
  $('btn-goto-play-rules').dispatch('click');
  check('点「玩法规则」进入玩法规则页', $('play-rules-menu').style.display === 'flex');
  const playHtml = htmlSrc.slice(htmlSrc.indexOf('id="play-rules-box"'), htmlSrc.indexOf('id="btn-play-rules-back"'));
  check('玩法规则里放的是单局玩法（基本玩法 / 特殊块 / 星级）',
    playHtml.includes('基本玩法') && playHtml.includes('特殊块怎么来') &&
    playHtml.includes('星级评价怎么算') && !playHtml.includes('福利中心'));
  $('btn-play-rules-back').dispatch('click');
  check('玩法规则「返回」回到规则首页', $('play-rules-menu').style.display === 'none' && $('rules-menu').style.display === 'flex');
  $('btn-close-rules').dispatch('click');
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
  if ($('story-menu').style.display === 'flex') $('btn-story-skip').dispatch('click');
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
  $('btn-close-chapters').dispatch('click');

  $('btn-achievements').dispatch('click');
  check('成就墙渲染出全部成就', $('ach-list').children.length === sandbox.Meta.ACHIEVEMENTS.length);
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
  $('btn-close-ach').dispatch('click');

  $('btn-collection').dispatch('click');
  check('图鉴渲染出全部皮肤', $('skin-list').children.length === sandbox.Meta.SKINS.length);
  $('btn-close-skins').dispatch('click');

  $('btn-welfare').dispatch('click');
  check('福利中心渲染 7 天签到', $('welfare-sign').children.length === 7);
  $('btn-close-welfare').dispatch('click');

  $('btn-modes').dispatch('click');
  check('更多玩法面板打开', $('modes-menu').style.display === 'flex');
  $('btn-close-modes').dispatch('click');

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
  $('btn-lb-view-back').dispatch('click');
  $('btn-close-lb').dispatch('click');

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
    $('btn-lb-view-back').dispatch('click');
    $('btn-lb-hub-level').dispatch('click');
    const lvShown = $('lb-level-swap').style.display === 'inline-block' && $('lb-prov-swap').style.display === 'none';
    $('lb-level-swap').dispatch('click');
    const lvOpened = $('lb-picker').style.display === 'grid';
    const lvChips = ($('lb-picker').children || []).length;
    const lt1 = String($('lb-view-title').textContent);
    ($('lb-picker').children || [])[lvChips - 1].dispatch('click');
    const lt2 = String($('lb-view-title').textContent);
    $('btn-lb-view-back').dispatch('click');
    $('btn-lb-hub-all').dispatch('click');
    const noneShown = $('lb-prov-swap').style.display === 'none' && $('lb-level-swap').style.display === 'none';
    $('btn-lb-view-back').dispatch('click');
    $('btn-close-lb').dispatch('click');
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
    $('btn-history-back').dispatch('click');
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
    $('btn-lb-view-back').dispatch('click');
    $('btn-close-lb').dispatch('click');
    lsMap.set('nl2:progress', saved);
    sandbox.__nl_test.refreshMenu();
    return ok;
  })());

  // 14d4.（已撤销）刷新恢复功能：刷新后统一回到主页

  // 14d4a. 福利中心：连续签到天数 + 补签（300 金币 / 天，不发奖励）
  check('福利中心显示连续签到并可补签', (() => {
    const Store = sandbox.Store;
    const today = Store.todayKey();
    const savedTasks = lsMap.get('nl2:tasks');
    const savedWallet = lsMap.get('nl2:wallet');
    // 本周期从 2 天前开始，只签了今天 → 漏了前天和昨天，可补 2 天
    lsMap.set('nl2:tasks', JSON.stringify({ date: today, list: [], signDay: 1, signDate: today, dates: [today], cycleStart: Store.todayKey(new Date(Date.now() - 2 * 86400000)) }));
    lsMap.set('nl2:wallet', JSON.stringify({ coins: 1000, items: {} }));
    $('btn-welfare').dispatch('click');
    const streakTxt = String($('welfare-streak').textContent);
    const mkBtn = $('btn-welfare-makeup');
    const enabled = mkBtn.disabled !== true && String(mkBtn.textContent).indexOf('补签') >= 0;
    mkBtn.dispatch('click');
    const coins = sandbox.Store.getWallet().coins;
    const st = sandbox.Store.signStats();
    $('btn-close-welfare').dispatch('click');
    if (savedTasks !== undefined) lsMap.set('nl2:tasks', savedTasks);
    if (savedWallet !== undefined) lsMap.set('nl2:wallet', savedWallet);
    return streakTxt.indexOf('连续签到 1 天') >= 0 && enabled &&
      coins === 700 && st.streak === 2 && st.day === 2;
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
  check('冰块目标值按实际层数校准', st.goal.target === iceLayers);

  // 16. 货运关：货物数量 + 目标值
  const dropDef = { id: 98, theme: 'candy', moves: 20, goal: { type: 'drop', target: 4 }, cargo: 4, stars: [1, 2, 3] };
  sandbox.__nl_test.start(1, { def: dropDef });
  let cargoN = 0;
  st = sandbox.__nl_test.state();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (st.board[r][c] && st.board[r][c].cargo) cargoN++;
  check('货运关放置 4 件货物', cargoN === 4);
  check('货运关目标值 = 货物数', st.goal.target === cargoN);

  // 17. 护送关
  const rescueDef = { id: 97, theme: 'ocean', moves: 20, goal: { type: 'rescue', target: 3 }, rescue: 3, stars: [1, 2, 3] };
  sandbox.__nl_test.start(1, { def: rescueDef });
  st = sandbox.__nl_test.state();
  check('护送关目标值 = 奶龙数', st.goal.target === 3 && st.rescueLeft === 3);

  // 18. 提示按钮：消耗次数并高亮
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
  let iceCell = null;
  for (let r = 0; r < 8 && !iceCell; r++) for (let c = 0; c < 8 && !iceCell; c++) if (st.ice[r][c]) iceCell = { r: r, c: c };
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
  check('冰块目标进度推进', (st.goal.iceCleared || 0) >= iceBefore + 1);

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

  // 25. 全障碍也不会卡死（整片冰时 resolveClear 安全返回）
  const allIce = new Set();
  sandbox.__nl_test.start(1, { def: { id: 93, theme: 'candy', moves: 20, goal: { type: 'ice', target: 64 }, ice: 30, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (st.ice[r][c]) allIce.add(r + ',' + c);
  const r0 = await sandbox.__nl_test.resolveClear(allIce, []);
  check('全是冰时安全返回 0', r0 === 0);

  // 26. 货物被消掉 → 落到下面一格（不从顶端重生）
  sandbox.__nl_test.start(1, { def: { id: 92, theme: 'candy', moves: 20, goal: { type: 'drop', target: 2 }, cargo: 2, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  const cargoObj = { kind: 'key' };
  st.board[5][3] = { type: 1, special: 0, cargo: cargoObj };
  await sandbox.__nl_test.resolveClear(new Set(['5,3']), []);
  check('货物被消后落到下一格', !!(st.board[6][3] && st.board[6][3].cargo === cargoObj));

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
    ['btn-goto-volume', 'btn-goto-playlist', 'btn-goto-import', 'btn-reset-bgm'].every((id) =>
      htmlSrc.indexOf(id) > htmlSrc.indexOf('id="music-settings-menu"')));
  check('账号安全里装修改密码 + 切换账号（修改密码在上面）',
    htmlSrc.indexOf('id="btn-goto-password"') > 0 &&
    htmlSrc.indexOf('id="btn-goto-password"') < htmlSrc.indexOf('id="btn-goto-switch"'));

  // 29. 登录页 / 登录失败提示
  $('settings-menu').style.display = 'flex';
  $('btn-goto-account').dispatch('click');
  check('账号安全面板显示当前账号', $('account-menu').style.display === 'flex' &&
    String($('account-cur-name').textContent) === '测试奶龙');
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

  // 32b. ii 的 666 金币（同样走邮箱，只发一次，名字大小写不敏感）
  const iiReg = sandbox.Account.register('II', 'ii123456');
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

  // 35. 📮 邮箱：系统邮件 / 未读角标 / 领取奖励
  const mailListAll = sandbox.Mail.list();
  const giftMail = mailListAll.filter((m) => m.hasGift)[0];
  check('邮箱里有系统邮件（公告 + 带奖励的）',
    mailListAll.length >= 3 && !!giftMail && !!giftMail.coins);
  check('未读数和已读状态初始正确', sandbox.Mail.get(giftMail.id).read === false);
  sandbox.__nl_test && null;
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
  $('btn-mail-claim').dispatch('click');
  check('领取附件金币到账', sandbox.Store.getWallet().coins === coinsBeforeMail + giftMail.coins);
  check('同一封邮件不能重复领',
    sandbox.Mail.claim(giftMail.id).ok === false &&
    sandbox.Store.getWallet().coins === coinsBeforeMail + giftMail.coins);
  $('btn-mail-back').dispatch('click');
  check('邮件详情「返回」回到列表', $('mail-menu').style.display === 'flex' && $('mail-view').style.display === 'none');
  $('btn-mail-close').dispatch('click');
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
  // 真实手指：按下 → 抬起 → click（滑动后的这一下不算点击）
  row0.dispatch('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 240, clientY: 40, button: 0, preventDefault() {} });
  row0.dispatch('pointerup', { pointerId: 1, clientX: 240, clientY: 40 });
  row0.dispatch('click');
  check('再点一下收回删除键，不会误开邮件',
    !wraps[0].classList.contains('open') && $('mail-view').style.display !== 'flex');

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
  sandbox.Mail.sendMail({ id: 'utest-gift', at: '2026-11-05 20:30', title: '测试奖励', coins: 50 });
  $('btn-mail-del-all').dispatch('click');
  check('一键删除先变成「再点一次确认」',
    $('btn-mail-del-all').textContent.indexOf('确认') >= 0 &&
    sandbox.Mail.list().length === leftBefore);
  $('btn-mail-del-all').dispatch('click');
  check('确认后清空邮箱，但保留没领奖励的那封',
    sandbox.Mail.list().length === 1 && !!sandbox.Mail.get('utest-gift') &&
    $('btn-mail-list') !== null);
  sandbox.Mail.claim('utest-gift');
  sandbox.Mail.removeAll();
  $('btn-mail').dispatch('click');       // 重新渲染列表
  check('奖励领完就能一键删干净', sandbox.Mail.list().length === 0 &&
    $('mail-list').children.length === 1 &&
    String($('mail-list').children[0].textContent).indexOf('暂时还没有邮件') >= 0);
  $('btn-mail-close').dispatch('click');

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

  console.log(failed ? ('\n' + failed + ' 项失败') : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
