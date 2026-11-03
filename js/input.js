// input.js — Pointer Events 统一输入：点选 + 拖拽交换 + 幽灵预览
// 对应优化方案 §12（拖拽交换）、§13（幽灵格）、§23（统一 Pointer Events）
// 暴露 window.Input

(function (global) {
  'use strict';

  const Input = {
    el: null,
    handlers: null,
    enabled: true,
    dragging: false,
    from: null,
    hover: null,
    _start: null,
    _pointerId: null,
    threshold: 0.28, // 相对格子尺寸的拖动阈值

    attach(el, handlers) {
      this.detach();
      this.el = el;
      this.handlers = handlers || {};

      this._onDown = this._down.bind(this);
      this._onMove = this._move.bind(this);
      this._onUp = this._up.bind(this);
      this._onCancel = this._cancel.bind(this);

      el.addEventListener('pointerdown', this._onDown);
      el.addEventListener('pointermove', this._onMove);
      el.addEventListener('pointerup', this._onUp);
      el.addEventListener('pointercancel', this._onCancel);
      el.style.touchAction = 'none';
    },

    detach() {
      if (!this.el) return;
      this.el.removeEventListener('pointerdown', this._onDown);
      this.el.removeEventListener('pointermove', this._onMove);
      this.el.removeEventListener('pointerup', this._onUp);
      this.el.removeEventListener('pointercancel', this._onCancel);
      this.el = null;
    },

    _cellAt(e) {
      if (!this.handlers.getCell) return null;
      return this.handlers.getCell(e.clientX, e.clientY);
    },

    _down(e) {
      if (!this.enabled) return;
      e.preventDefault();
      const cell = this._cellAt(e);
      if (!cell) return;

      this._pointerId = e.pointerId;
      try { this.el.setPointerCapture(e.pointerId); } catch (err) {}

      this._start = {
        x: e.clientX, y: e.clientY,
        cell,
        cellPx: this.handlers.getCellSize ? this.handlers.getCellSize() : 40
      };
      this.from = cell;
      this.dragging = false;
      this.hover = null;
      if (this.handlers.onPress) this.handlers.onPress(cell);
    },

    _move(e) {
      if (!this._start || e.pointerId !== this._pointerId) return;
      e.preventDefault();

      const dx = e.clientX - this._start.x;
      const dy = e.clientY - this._start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const th = this._start.cellPx * this.threshold;

      if (!this.dragging) {
        if (dist < th) return;
        this.dragging = true;
        if (this.handlers.onDragStart) this.handlers.onDragStart(this._start.cell);
      }

      // 取主导方向，得到相邻格
      const d = Math.abs(dx) > Math.abs(dy)
        ? { r: 0, c: dx > 0 ? 1 : -1 }
        : { r: dy > 0 ? 1 : -1, c: 0 };

      const to = { r: this._start.cell.r + d.r, c: this._start.cell.c + d.c };
      const same = this.hover && this.hover.r === to.r && this.hover.c === to.c;
      if (!same) {
        this.hover = to;
        if (this.handlers.onDragMove) this.handlers.onDragMove(this._start.cell, to);
      }
    },

    _up(e) {
      if (!this._start || e.pointerId !== this._pointerId) return;
      const start = this._start;
      const hover = this.hover;
      const wasDragging = this.dragging;

      this._reset();

      if (wasDragging) {
        if (hover) {
          if (this.handlers.onDrop) this.handlers.onDrop(start.cell, hover);
        } else if (this.handlers.onCancelDrag) {
          this.handlers.onCancelDrag();
        }
      } else if (this.handlers.onTap) {
        this.handlers.onTap(start.cell);
      }
    },

    _cancel() {
      const wasDragging = this.dragging;
      this._reset();
      if (wasDragging && this.handlers.onCancelDrag) this.handlers.onCancelDrag();
    },

    _reset() {
      this._start = null;
      this._pointerId = null;
      this.dragging = false;
      this.from = null;
      this.hover = null;
    },

    setEnabled(v) {
      this.enabled = !!v;
      if (!v) this._reset();
    }
  };

  global.Input = Input;
})(window);
