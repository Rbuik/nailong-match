// rng.js — 种子随机（每日挑战 / 可复现布局）
// 暴露 window.RNG

(function (global) {
  'use strict';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedFromDate(d) {
    d = d || new Date();
    return Number(
      String(d.getFullYear()) +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0')
    );
  }

  // 创建一个带便捷方法的随机源；seed 为空则用 Math.random
  function source(seed) {
    const next = seed == null ? Math.random : mulberry32(seed);
    return {
      next,
      // [0, n)
      int(n) { return Math.floor(next() * n); },
      // 从数组取一个
      pick(arr) { return arr[this.int(arr.length)]; },
      // 洗牌（原地）
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = this.int(i + 1);
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      }
    };
  }

  global.RNG = { mulberry32, seedFromDate, source };
})(window);
