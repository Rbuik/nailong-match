// effects.js — 粒子 / 飘字 / 冲击波 对象池 + 震屏
// 对应优化方案 §24（特效对象池）、§14（震屏）
// 暴露 window.FX

(function (global) {
  'use strict';

  const MAX_P = 600;
  const MAX_T = 40;
  const MAX_W = 40;
  const CELL_LIKE = 56;   // 光束粗细参考（和棋盘格子尺寸一个量级）

  function Pool(factory, size) {
    const free = [];
    const active = [];
    for (let i = 0; i < size; i++) free.push(factory());
    return {
      spawn() {
        const o = free.pop() || factory();
        active.push(o);
        return o;
      },
      recycle(i) {
        const o = active[i];
        active.splice(i, 1);
        if (free.length < size) free.push(o);
      },
      active
    };
  }

  const pPool = Pool(() => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: '#fff', size: 3 }), 200);
  const tPool = Pool(() => ({ x: 0, y: 0, text: '', color: '#fff', life: 0, max: 1, dy: -3, size: 20 }), 20);
  const wPool = Pool(() => ({ x: 0, y: 0, r: 0, maxR: 0, life: 0, max: 1, color: '#fff' }), 16);
  const bPool = Pool(() => ({ x: 0, y: 0, horiz: true, life: 0, max: 1, color: '#fff' }), 8);

  const FX = {
    shakeX: 0,
    shakeY: 0,
    _shakePower: 0,
    _shakeLeft: 0,
    _shakeDur: 0,

    // §14 屏幕轻微震动
    shake(power, dur) {
      this._shakePower = Math.max(this._shakePower, power || 3);
      this._shakeDur = dur || 0.18;
      this._shakeLeft = this._shakeDur;
    },

    getShakeOffset() {
      return { x: this.shakeX, y: this.shakeY };
    },

    burst(x, y, color, count) {
      count = count || 4;
      for (let i = 0; i < count; i++) {
        if (pPool.active.length >= MAX_P) break;
        const p = pPool.spawn();
        p.x = x; p.y = y;
        p.vx = (Math.random() - 0.5) * 8;
        p.vy = (Math.random() - 0.5) * 8;
        p.life = 1; p.max = 1;
        p.color = color || '#fff';
        p.size = 3;
      }
    },

    explosion(x, y, cell) {
      const c = cell || 40;
      this.wave(x, y, c * 0.3, c * 2.2, '#ffd75c');
      this.wave(x, y, c * 0.2, c * 1.8, '#ff5c5c');
      for (let i = 0; i < 28; i++) {
        if (pPool.active.length >= MAX_P) break;
        const p = pPool.spawn();
        const a = (Math.PI * 2 / 28) * i + Math.random() * 0.2;
        const sp = 8 + Math.random() * 8;
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp;
        p.life = 1.4; p.max = 1.4;
        p.color = i % 3 === 0 ? '#fff' : (i % 3 === 1 ? '#ffd75c' : '#ff5c5c');
        p.size = 3 + Math.random() * 5;
      }
      for (let i = 0; i < 16; i++) {
        if (pPool.active.length >= MAX_P) break;
        const p = pPool.spawn();
        p.x = x; p.y = y;
        p.vx = (Math.random() - 0.5) * 12;
        p.vy = (Math.random() - 0.5) * 12;
        p.life = 0.9; p.max = 0.9;
        p.color = '#ffffff';
        p.size = 2 + Math.random() * 4;
      }
    },

    text(x, y, str, color, size) {
      if (tPool.active.length >= MAX_T) return;
      const t = tPool.spawn();
      t.x = x; t.y = y;
      t.text = str;
      t.color = color || '#ffd75c';
      t.life = 2; t.max = 2;
      t.dy = -3;
      t.size = size || 20;
    },

    // 全屏闪光（炸弹橙色一闪 / 彩虹白闪）
    flash(color, alpha, dur) {
      this._flash = {
        color: color || '#fff',
        alpha: alpha == null ? 0.3 : alpha,
        left: dur || 0.25,
        dur: dur || 0.25
      };
    },

    // 线消光束：horiz=true 横贯棋盘，false 竖贯棋盘
    beam(x, y, horiz, color) {
      if (bPool.active.length >= 8) return;
      const b = bPool.spawn();
      b.x = x; b.y = y;
      b.horiz = !!horiz;
      b.life = 0.55; b.max = 0.55;
      b.color = color || '#5c8fff';
    },

    // 彩虹波纹：从彩虹块位置荡出五色圆环
    rainbow(x, y) {
      const colors = ['#ff5c5c', '#ffb13d', '#3ecf7a', '#5c8fff', '#c85cff'];
      for (let i = 0; i < colors.length; i++) {
        this.wave(x, y, 8 + i * 6, 140 + i * 46, colors[i]);
      }
      for (let i = 0; i < 24; i++) {
        if (pPool.active.length >= MAX_P) break;
        const p = pPool.spawn();
        const a = (Math.PI * 2 / 24) * i;
        p.x = x; p.y = y;
        p.vx = Math.cos(a) * (6 + Math.random() * 6);
        p.vy = Math.sin(a) * (6 + Math.random() * 6);
        p.life = 1.2; p.max = 1.2;
        p.color = colors[i % colors.length];
        p.size = 3 + Math.random() * 4;
      }
    },

    wave(x, y, r, maxR, color) {
      if (wPool.active.length >= MAX_W) return;
      const w = wPool.spawn();
      w.x = x; w.y = y;
      w.r = r || 6;
      w.maxR = maxR || 80;
      w.life = 1; w.max = 1;
      w.color = color || '#fff';
    },

    clear() {
      pPool.active.length = 0;
      tPool.active.length = 0;
      wPool.active.length = 0;
      bPool.active.length = 0;
      this._flash = null;
      this.shakeX = 0; this.shakeY = 0;
      this._shakePower = 0;
      this._shakeLeft = 0;
    },

    isEmpty() {
      return pPool.active.length === 0 && tPool.active.length === 0 &&
        wPool.active.length === 0 && bPool.active.length === 0 && !this._flash;
    },

    update(dt) {
      dt = Math.min(dt || 0.016, 0.05);
      const f = dt * 60; // 以 60fps 为单位

      for (let i = pPool.active.length - 1; i >= 0; i--) {
        const p = pPool.active[i];
        p.x += p.vx * f;
        p.y += p.vy * f;
        p.vx *= Math.pow(0.96, f);
        p.vy *= Math.pow(0.96, f);
        p.life -= 0.04 * f;
        if (p.life <= 0) pPool.recycle(i);
      }
      for (let i = tPool.active.length - 1; i >= 0; i--) {
        const t = tPool.active[i];
        t.y += t.dy * f;
        t.life -= 0.015 * f;
        if (t.life <= 0) tPool.recycle(i);
      }
      for (let i = wPool.active.length - 1; i >= 0; i--) {
        const w = wPool.active[i];
        w.r += (w.maxR - w.r) * 0.15 * f;
        w.life -= 0.05 * f;
        if (w.life <= 0) wPool.recycle(i);
      }

      // 光束衰减
      for (let i = bPool.active.length - 1; i >= 0; i--) {
        const b = bPool.active[i];
        b.life -= 0.018 * f;
        if (b.life <= 0) bPool.recycle(i);
      }
      // 闪光衰减
      if (this._flash) {
        this._flash.left -= dt;
        if (this._flash.left <= 0) this._flash = null;
      }

      // 震屏衰减
      if (this._shakeLeft > 0) {
        this._shakeLeft -= dt;
        const ratio = Math.max(0, this._shakeLeft / this._shakeDur);
        const p = this._shakePower * ratio;
        this.shakeX = (Math.random() - 0.5) * 2 * p;
        this.shakeY = (Math.random() - 0.5) * 2 * p;
        if (this._shakeLeft <= 0) {
          this.shakeX = 0; this.shakeY = 0;
          this._shakePower = 0;
        }
      }
    },

    render(ctx) {
      // 光束画在最底（压在波纹下面，像一道扫过的光）
      if (bPool.active.length) {
        const W = ctx.canvas.width, H = ctx.canvas.height;
        bPool.active.forEach((b) => {
          const t = 1 - Math.max(0, b.life / b.max);      // 0→1 展开
          const a = Math.max(0, Math.min(1, b.life / b.max * 1.6));
          const thick = 8 + t * (CELL_LIKE * 0.8);
          ctx.globalAlpha = a * 0.75;
          const g = b.horiz
            ? ctx.createLinearGradient(0, b.y - thick / 2, 0, b.y + thick / 2)
            : ctx.createLinearGradient(b.x - thick / 2, 0, b.x + thick / 2, 0);
          g.addColorStop(0, 'rgba(255,255,255,0)');
          g.addColorStop(0.5, b.color);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          if (b.horiz) ctx.fillRect(0, b.y - thick / 2, W, thick);
          else ctx.fillRect(b.x - thick / 2, 0, thick, H);
        });
      }
      // 全屏闪光
      if (this._flash) {
        const f = this._flash;
        ctx.globalAlpha = Math.max(0, Math.min(1, f.alpha * (f.left / f.dur)));
        ctx.fillStyle = f.color;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      }
      wPool.active.forEach((w) => {
        ctx.globalAlpha = Math.max(0, w.life) * 0.8;
        ctx.strokeStyle = w.color;
        ctx.lineWidth = 6 * w.life;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
        ctx.stroke();
      });
      pPool.active.forEach((p) => {
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (p.size || 3) * (p.life / p.max), 0, Math.PI * 2);
        ctx.fill();
      });
      tPool.active.forEach((t) => {
        ctx.globalAlpha = Math.max(0, Math.min(1, t.life / t.max));
        ctx.fillStyle = t.color;
        ctx.font = `bold ${t.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 4;
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillText(t.text, t.x, t.y);
      });
      ctx.globalAlpha = 1;
    }
  };

  global.FX = FX;
})(window);
