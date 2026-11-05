// test-longpress.js — 长按拖拽排序的无浏览器验证（最小 DOM 桩）
// 用法: node test-longpress.js
'use strict';
const fs = require('fs');
const vm = require('vm');

class CL {
  constructor() { this.s = new Set(); }
  add(...c) { c.forEach((x) => x && this.s.add(x)); }
  remove(...c) { c.forEach((x) => this.s.delete(x)); }
  contains(c) { return this.s.has(c); }
  toggle(c, f) { if (f === undefined) this.s.has(c) ? this.s.delete(c) : this.s.add(c); else if (f) this.s.add(c); else this.s.delete(c); }
}

let seq = 0;
class El {
  constructor(tag) {
    this.tagName = tag || 'div';
    this._id = ++seq;
    this.children = [];
    this.parentNode = null;
    this.classList = new CL();
    this.style = {};
    this.dataset = {};
    this._html = '';
    this._l = {};
    this.textContent = '';
    this.value = '';
  }
  get className() { return Array.from(this.classList.s).join(' '); }
  set className(v) { this.classList = new CL(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); }
  get lastElementChild() { return this.children[this.children.length - 1] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const i = this.parentNode.children.indexOf(this);
    return this.parentNode.children[i + 1] || null;
  }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode.removeChild(c);
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentNode = this; return c;
  }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  cloneNode() {
    const e = new El(this.tagName);
    e.className = this.className;
    e._html = this._html;
    e.dataset = Object.assign({}, this.dataset);
    e.children = this.children.map((c) => { const k = c.cloneNode(); k.parentNode = e; return k; });
    return e;
  }
  set innerHTML(v) { this._html = String(v); this.children.forEach((c) => { c.parentNode = null; }); this.children = []; }
  get innerHTML() { return this._html; }
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() {
    const H = 52, TOP = 100;
    const p = this.parentNode;
    const i = p ? p.children.indexOf(this) : 0;
    return { left: 0, top: TOP + i * H, width: 300, height: H, right: 300, bottom: TOP + i * H + H };
  }
  querySelector() { return null; }
  querySelectorAll(sel) {
    const out = [];
    const want = String(sel).replace(/^\./, '');
    const walk = (n) => n.children.forEach((ch) => { if (ch.classList.contains(want)) out.push(ch); walk(ch); });
    walk(this);
    return out;
  }
  addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }
  dispatch(t, ev) {
    const base = { target: this, pointerId: 7, pointerType: 'touch', button: 0, clientX: 0, clientY: 0, preventDefault() {}, stopPropagation() {}, cancelable: true, touches: [] };
    (this._l[t] || []).forEach((fn) => fn(Object.assign(base, ev)));
  }
}

const els = {};
function el(id) { if (!els[id]) { const e = new El('div'); e._id2 = id; els[id] = e; } return els[id]; }

const body = new El('body');
const doc = {
  body,
  documentElement: new El('html'),
  getElementById: (id) => el(id),
  createElement: (t) => new El(t),
  addEventListener() {},
  removeEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => []
};

const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

const AudioManager = {
  playCustom() {}, preloadCustom() {}, setCustomLoop() {}, vibrate() {},
  stopCustom() {}, pauseCustom() {}, resumeCustom() {}
};

const win = {
  document: doc, localStorage, AudioManager,
  addEventListener() {}, removeEventListener() {},
  setTimeout, clearTimeout, console,
  BUILTIN_MUSIC: [{ url: 'https://x/a.mp3', name: 'A' }, { url: 'https://x/b.mp3', name: 'B' }]
};
win.window = win;
Object.assign(win, { navigator: { userAgent: 'node' } });

const ctx = vm.createContext(Object.assign(win, {
  document: doc, localStorage, window: win, AudioManager,
  setTimeout, clearTimeout, console, Math, JSON, Date, Array, Object, String, Number, Boolean, RegExp, Map, Set, Promise, Error, decodeURIComponent, encodeURIComponent, parseInt, parseFloat, isNaN, Intl
}));
ctx.globalThis = ctx;

localStorage.setItem('nl2:playlist', JSON.stringify([
  { url: 'https://x/a.mp3', name: 'A' },
  { url: 'https://x/b.mp3', name: 'B' },
  { url: 'https://x/c.mp3', name: 'C' }
]));

const code = fs.readFileSync('js/music.js', 'utf8');
vm.runInContext(code, ctx, { filename: 'music.js' });
const Music = win.Music;
if (!Music) { console.error('FAIL: window.Music 未导出'); process.exit(1); }

Music.init();

const box = el('playlist-list');
let rows = box.querySelectorAll('.m-item');
console.log('渲染行数:', rows.length);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

(async () => {
  const row0 = rows[0];
  const t = (x, y) => ({ clientX: x, clientY: y });

  // ============ 安卓触摸：touchstart / touchmove / touchend ============
  row0.dispatch('touchstart', { touches: [t(20, 120)], changedTouches: [t(20, 120)] });
  await new Promise((r) => setTimeout(r, 500));

  const ghost = body.children.find((c) => c.classList.contains('drag-ghost'));
  ok(!!ghost, '触摸长按 420ms 后浮起影子（drag-ghost 挂到 body）');
  ok(row0.parentNode && row0.parentNode.classList.contains('lift-src'), '原位变成半透明占位');
  ok(body.classList.contains('m-dragging'), '进入拖动态（锁滚动）');

  // 往下拖过第二行中线（触摸拖动要 preventDefault 挡住列表滚动）
  let prevented = 0;
  const guard = row0._l.touchmove || [];
  row0.dispatch('touchmove', {
    touches: [t(20, 190)], changedTouches: [t(20, 190)],
    preventDefault() { prevented++; }
  });
  ok(prevented > 0 || guard.length > 0, '触摸拖动时调用 preventDefault（页面/列表不跟着滚）');
  ok(prevented > 0, '拖动中确实阻止了默认滚动');
  ok(typeof ghost.style.top === 'string' && ghost.style.top !== '', '影子跟随手指移动 top=' + ghost.style.top);

  const wraps = box.children;
  const order = wraps.map((w) => w.querySelectorAll('.m-item')[0].dataset.url);
  ok(order[0] === 'https://x/b.mp3', '拖动后实时换位，顺序 = ' + order.join(' , '));

  // 松手
  row0.dispatch('touchend', { touches: [], changedTouches: [t(20, 190)] });
  ok(!body.children.some((c) => c.classList.contains('drag-ghost')), '松手后影子移除');
  ok(!body.classList.contains('m-dragging'), '解除滚动锁');

  const saved = JSON.parse(localStorage.getItem('nl2:playlist') || '[]').map((x) => x.url);
  ok(saved[0] === 'https://x/b.mp3', '新顺序已写入存档 = ' + saved.join(' , '));

  // 触摸长按不动 → 松手什么都不做（不再进入多选，改名/删除只能左滑单个操作）
  const box2 = el('playlist-list');
  const rows2 = box2.querySelectorAll('.m-item');
  rows2[0].dispatch('touchstart', { touches: [t(20, 110)] });
  await new Promise((r) => setTimeout(r, 500));
  const liftedWrap2 = rows2[0].parentNode;
  const actsHidden = liftedWrap2.classList.contains('lift-src');
  rows2[0].dispatch('touchend', { touches: [] });
  ok(!rows2[0].classList.contains('selected'), '长按不移动即松手 = 不进多选（没了批量改名/删除）');
  ok(!body.classList.contains('m-dragging'), '松手后解除拖动状态');
  ok(actsHidden, '浮起时原行仍是 lift-src（操作按钮被隐藏，不会露出重命名/删除）');
  const batchBar2 = el('playlist-batch-bar');
  ok(!batchBar2 || batchBar2.style.display !== 'flex', '批量操作栏不会因长按弹出');

  // 触摸滑动（不等待长按）→ 取消长按，不误浮起
  const box3 = el('playlist-list');
  const rows3 = box3.querySelectorAll('.m-item');
  rows3[0].dispatch('touchstart', { touches: [t(20, 110)] });
  rows3[0].dispatch('touchmove', { touches: [t(20, 150)] });
  await new Promise((r) => setTimeout(r, 500));
  rows3[0].dispatch('touchend', { touches: [] });
  ok(!body.children.some((c) => c.classList.contains('drag-ghost')), '滑动滚动时不会误触发拖动');

  // ============ 鼠标：Pointer Events 仍然可用 ============
  const box4 = el('playlist-list');
  const rows4 = box4.querySelectorAll('.m-item');
  rows4[0].dispatch('pointerdown', { pointerType: 'mouse', clientX: 20, clientY: 110 });
  await new Promise((r) => setTimeout(r, 500));
  const ghost4 = body.children.find((c) => c.classList.contains('drag-ghost'));
  ok(!!ghost4, '鼠标长按同样能浮起拖动');
  rows4[0].dispatch('pointerup', { pointerType: 'mouse', clientX: 20, clientY: 110 });

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
