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
    innerHTML: '',
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
  check('关卡记录渲染 20 行', rows.length === 20);
  const lockedRow = rows[4]; // 第 5 关
  lockedRow.dispatch('click');
  check('点击未解锁关卡不跳转（记录页未关闭）', $('history-menu').style.display === 'flex');
  check('未解锁提示 toast', $('toast').textContent.includes('还未解锁'));
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

  console.log(failed ? ('\n' + failed + ' 项失败') : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
