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
  clear: () => lsMap.clear()
};
// 预置：已有 2 个洗牌道具、第 1 关 3 星（解锁到第 2 关）
lsMap.set('nl2:wallet', JSON.stringify({ coins: 500, items: { shuffle: 2, undo: 1 } }));
lsMap.set('nl2:progress', JSON.stringify({ 1: { score: 1200, stars: 3 } }));

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
  localStorage: localStorageStub,
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
const scripts = ['rng.js', 'storage.js', 'audio.js', 'effects.js', 'specials.js', 'goals.js', 'tasks.js', 'input.js', 'music.js', 'game.js'];
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

  // 5. 收集关目标图案：切到第 2 关（collect 目标）再开始
  lsMap.set('nl2:progress', JSON.stringify({ 1: { score: 1200, stars: 3 }, 2: { score: 900, stars: 2 } }));
  $('btn-history').dispatch('click');
  const rows2 = $('history-list').children;
  rows2[1].dispatch('click'); // 选中第 2 关 → 回主页
  check('切到第 2 关', $('main-menu').style.display === 'flex' && String($('menu-current-level').textContent) === '2');
  $('btn-play').dispatch('click');
  await sleep(30);
  const barHtml = $('target-bar').innerHTML;
  check('收集关目标栏使用图案 img', barHtml.includes('goal-chip') && barHtml.includes('./assets/0.jpg'));

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
  check('规则含星级评价说明', htmlSrc.includes('2 星线') && htmlSrc.includes('3 星线') && htmlSrc.includes('分数线'));
  check('规则说明十字架横竖都清', htmlSrc.includes('整行 + 整列') && htmlSrc.includes('一起清'));
  check('规则含 5 种模式', ['得分', '收集指定方块', '清光果冻', '限时得分', '极限步数'].every((s) => htmlSrc.includes(s)));
  check('规则首屏有速记条', htmlSrc.includes('rule-tldr') && htmlSrc.includes('三连就消'));
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

  console.log(failed ? ('\n' + failed + ' 项失败') : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
