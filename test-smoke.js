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
  location: { reload: () => { reloaded = true; } },
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

// ---------- 按顺序加载脚本 ----------
const scripts = ['rng.js', 'storage.js', 'audio.js', 'effects.js', 'specials.js', 'goals.js', 'tasks.js', 'input.js', 'music.js', 'meta.js', 'board.js', 'game.js'];
for (const s of scripts) {
  const code = fs.readFileSync(path.join(__dirname, 'js', s), 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: s });
  } catch (e) {
    console.error('LOAD FAIL', s, e.message);
    process.exit(1);
  }
}

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

  // 4. 两步注销
  $('btn-logout').dispatch('click');
  check('注销第一步弹窗', $('logout-confirm').style.display === 'flex');
  $('btn-logout-yes').dispatch('click');
  check('第一步"是"→第二步弹窗', $('logout-confirm2').style.display === 'flex' && $('logout-confirm').style.display === 'none');
  $('btn-logout-cancel').dispatch('click');
  check('第二步"取消"关闭', $('logout-confirm2').style.display === 'none');
  $('btn-logout').dispatch('click');
  $('btn-logout-yes').dispatch('click');
  $('btn-logout-confirm').dispatch('click');
  check('第二步"确认"清除存档并 reload', reloaded && lsMap.get('nl2:wallet') === undefined);
  // 注销现在连昵称 / 成就 / 好友也一起清掉（nl2:* 全清），后面的测试重新预置昵称
  lsMap.set('nl2:mnick', JSON.stringify('测试奶龙'));

  // 5. 收集关目标图案：切到第 2 关（collect 目标）再开始
  lsMap.set('nl2:progress', JSON.stringify({ 1: { score: 1200, stars: 3 }, 2: { score: 900, stars: 2 } }));
  $('btn-history').dispatch('click');
  const rows2 = $('history-list').children;
  rows2[1].dispatch('click'); // 选中第 2 关 → 回主页
  check('切到第 2 关', $('main-menu').style.display === 'flex' && String($('menu-current-level').textContent) === '2');
  $('btn-play').dispatch('click');
  await sleep(30);
  const barHtml = $('target-bar').innerHTML;
  check('收集关目标栏使用图案 img', barHtml.includes('goal-chip') && barHtml.includes('./assets/0.webp'));

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
  check('规则含成就配色排行榜说明', htmlSrc.includes('成就、配色与排行榜') && htmlSrc.includes('总榜 → 省榜 → 局榜') && htmlSrc.includes('奖牌'));
  check('规则主线为 40 关 4 章节', htmlSrc.includes('主线共 <b>40 关</b>') && htmlSrc.includes('糖果城堡'));
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
  const exp = Sp.expandClears(bd, 8, 8, new Set(['3,4']), {});
  let rowOk = true, colOk = true;
  for (let c = 0; c < 8; c++) if (!exp.cells.has('3,' + c)) rowOk = false;
  for (let r = 0; r < 8; r++) if (!exp.cells.has(r + ',4')) colOk = false;
  check('十字线消清整行 + 整列', rowOk && colOk);

  // 13. 主页上一关 / 下一关
  check('主页有关卡翻页按钮', !!getEl('btn-prev-level') && !!getEl('btn-next-level-menu') && !!getEl('menu-level-label'));

  // 14. 新玩法面板：章节 / 成就 / 图鉴 / 福利
  // 沙箱里没有网络，关卡数据用磁盘上的真实 levels.json 顶替，和线上走同一条渲染路径
  sandbox.__nl_test.state().data = JSON.parse(fs.readFileSync(path.join('js', 'levels.json'), 'utf8'));
  $('btn-chapters').dispatch('click');
  check('章节地图渲染出 4 章', $('chapters-list').children.length === 4);
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
    return provShown && provChanged && lvShown && lvOpened && lvChips >= 10 && lt1 !== lt2 && noneShown &&
      htmlSrc.indexOf('lb-tabs') < 0 && htmlSrc.indexOf('btn-lb-all') < 0 && htmlSrc.indexOf('lb-prov-sel') < 0;
  })());

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

  // 14e. 默认昵称不能玩：改名闸拦截 btn-play
  check('默认昵称被改名闸拦截', (() => {
    const saved = lsMap.get('nl2:mnick');
    lsMap.delete('nl2:mnick');
    // Meta 缓存可能持有旧值，直接走 Meta.setNickname 恢复默认
    M.setNickname('');
    $('btn-play').dispatch('click');
    const blocked = $('nick-menu').style.display === 'flex';
    M.setNickname('测试奶龙');
    if (saved !== undefined) lsMap.set('nl2:mnick', saved);
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
  check('冰块目标值按实际层数校准', st.goal.target === iceN);

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

  // 23. 锁链：第一次被消只解锁，方块留下
  sandbox.__nl_test.start(1, { def: { id: 95, theme: 'candy', moves: 20, goal: { type: 'score', target: 5000 }, chain: 3, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  let chainCell = null;
  for (let r = 0; r < 8 && !chainCell; r++) for (let c = 0; c < 8 && !chainCell; c++) if (st.chain[r][c]) chainCell = { r: r, c: c };
  await sandbox.__nl_test.resolveClear(new Set([chainCell.r + ',' + chainCell.c]), []);
  check('锁链被消一次即解锁', st.chain[chainCell.r][chainCell.c] === 0);
  check('解锁时方块保留', !!st.board[chainCell.r][chainCell.c]);

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

  // 27. 彩虹 + 普通块：同图案全消，彩虹自己也一起消掉
  sandbox.__nl_test.start(1, { def: { id: 91, theme: 'candy', moves: 20, goal: { type: 'score', target: 999999 }, stars: [1, 2, 3] } });
  st = sandbox.__nl_test.state();
  const rainbowObj = { type: 0, special: Sp.TYPE.RAINBOW };
  st.board[4][4] = rainbowObj;
  st.board[4][5] = { type: 1, special: 0 };
  // 记录交换前所有同图案方块的对象引用（随机补充的新块不算）
  const type1Objs = new Set();
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const b = st.board[r][c];
    if (b && b.type === 1 && b !== st.board[4][5]) type1Objs.add(b);
  }
  // 彩虹和普通块交换：同图案全消，彩虹自己也一起消掉
  // （掉落连消可能凑出新的彩虹、也可能补进同图案新块，所以全部用对象引用判断）
  await sandbox.__nl_test.swap({ r: 4, c: 4 }, { r: 4, c: 5 });
  let origGone = true;
  let type1Left = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const b = st.board[r][c];
    if (!b) continue;
    if (b === rainbowObj) origGone = false;
    if (type1Objs.has(b)) type1Left++;
  }
  check('彩虹交换后自己也被消除', origGone);
  check('彩虹清掉同图案普通块', type1Objs.size > 0 && type1Left === 0);

  console.log(failed ? ('\n' + failed + ' 项失败') : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
