// 临时实验：厚冰一次相邻消除到底掉几层；锁链是否参与三连
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// 复用 test-smoke 的加载方式太重，这里直接读它的桩部分
const src = fs.readFileSync('test-smoke.js', 'utf8');
// 找到 sandbox 建立的方式——直接照搬前 300 行执行太复杂，改为手工最小桩
const lsMap = new Map();
const localStorageStub = {
  getItem: (k) => (lsMap.has(k) ? lsMap.get(k) : null),
  setItem: (k, v) => lsMap.set(k, String(v)),
  removeItem: (k) => lsMap.delete(k),
  clear: () => lsMap.clear(),
  get length() { return lsMap.size; },
  key: (i) => Array.from(lsMap.keys())[i] || null
};
const sandbox = {
  window: {},
  localStorage: localStorageStub,
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  navigator: { userAgent: 'node', maxTouchPoints: 0 },
  document: null,
  location: undefined,
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: () => 0,
  performance: { now: () => Date.now() },
  Image: class { set src(v) {} },
  AudioContext: class {},
  fetch: undefined
};
sandbox.global = sandbox;
sandbox.window = sandbox;

const ctx = vm.createContext(sandbox);
for (const f of ['js/specials.js', 'js/storage.js', 'js/rng.js', 'js/effects.js', 'js/goals.js', 'js/tasks.js']) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
console.log('loaded modules ok');
console.log('Specials?', typeof sandbox.Specials);
