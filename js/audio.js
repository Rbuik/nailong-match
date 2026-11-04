// audio.js — AudioManager
// 对应优化方案 §22（音频系统解耦）、§15（音效分层）、§25（失败可重试）
// 暴露 window.AudioManager

(function (global) {
  'use strict';

  const NOTE = [
    523.25, 659.25, 783.99, 1046.50, 783.99, 659.25,
    587.33, 698.46, 880.00, 1174.66, 880.00, 698.46,
    659.25, 783.99, 987.77, 1318.51, 987.77, 783.99,
    698.46, 880.00, 1046.50, 1396.91, 1046.50, 880.00
  ];

  const AudioManager = {
    ctx: null,
    masterReady: false,
    musicOn: true,
    bgmVol: 0.5,
    sfxVol: 0.5,

    _bgmTimer: null,
    _noteIndex: 0,
    _drumTimer: null,
    _drumOn: false,
    _custom: null,
    _customUrl: '',
    _failing: false,

    init(settings) {
      settings = settings || {};
      if (typeof settings.music === 'boolean') this.musicOn = settings.music;
      if (typeof settings.bgm === 'number') this.bgmVol = settings.bgm;
      if (typeof settings.sfx === 'number') this.sfxVol = settings.sfx;

      if (!this.ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      this.masterReady = !!this.ctx;
      return this.masterReady;
    },

    // 用户首次交互时调用（移动端自动播放限制）
    unlock() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      if (this.musicOn) {
        if (this._custom) this._custom.play().catch(() => {});
        else this.startBGM();
      }
    },

    setVolumes(bgm, sfx) {
      if (typeof bgm === 'number') {
        this.bgmVol = bgm;
        if (this._custom) this._custom.volume = this.trackVolume(this._customUrl);
      }
      if (typeof sfx === 'number') this.sfxVol = sfx;
    },

    // 调节背景音乐滑块时的实时试听：按当前音量弹一小段旋律
    bgmDemo() {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const seq = [[523.25, 0], [659.25, 0.09], [783.99, 0.18]];
      seq.forEach(([f, d]) => {
        try {
          const t0 = this.ctx.currentTime + d;
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f, t0);
          g.gain.setValueAtTime(0.04 * this.bgmVol * 2, t0);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
          osc.connect(g); g.connect(this.ctx.destination);
          osc.start(t0); osc.stop(t0 + 0.2);
        } catch (e) {}
      });
    },

    // 调节音效滑块时的实时试听
    sfxDemo() {
      this.playSFX('coin');
    },

    _tone(freq, type, dur, vol, delay) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      delay = delay || 0;
      try {
        const t0 = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        const peak = Math.max(0.0001, vol * this.sfxVol * 2);
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      } catch (e) {}
    },

    vibrate(pattern) {
      if (navigator.vibrate) {
        try { navigator.vibrate(pattern); } catch (e) {}
      }
    },

    // ---------- 音效 ----------
    playSFX(name, opts) {
      opts = opts || {};
      switch (name) {
        case 'select':
          this._tone(600, 'sine', 0.08, 0.15);
          this.vibrate(10);
          break;
        case 'swap':
          this._tone(400, 'triangle', 0.1, 0.15);
          this.vibrate(15);
          break;
        case 'invalid':
          this._tone(200, 'sawtooth', 0.15, 0.1);
          this.vibrate([20, 50, 20]);
          break;
        case 'match': {
          // 连击越高音越高（§15）
          const c = Math.min(opts.combo || 1, 8);
          const base = 500 + (c - 1) * 120;
          const boost = Math.min(1.6, 1 + (c - 1) * 0.14);
          this._tone(base, 'sine', 0.15, 0.15 * boost);
          this._tone(base * 1.5, 'sine', 0.15, 0.1 * boost, 0.05);
          if (c >= 3) this._tone(base * 2, 'sine', 0.18, 0.08 * boost, 0.08);
          break;
        }
        case 'bomb':
          this._tone(90, 'sine', 0.5, 0.22);
          this._tone(60, 'sine', 0.6, 0.18, 0.05);
          this._tone(180, 'triangle', 0.25, 0.12, 0.02);
          this.vibrate([40, 50, 40]);
          break;
        case 'line':
          this._tone(700, 'square', 0.12, 0.12);
          this._tone(1100, 'square', 0.12, 0.09, 0.06);
          this.vibrate(20);
          break;
        case 'coin':
          this._tone(1200, 'sine', 0.08, 0.12);
          this._tone(1600, 'sine', 0.12, 0.1, 0.06);
          break;
        case 'win':
          this._tone(500, 'sine', 0.15, 0.25, 0);
          this._tone(600, 'sine', 0.15, 0.25, 0.15);
          this._tone(800, 'sine', 0.3, 0.25, 0.3);
          this.vibrate([50, 50, 100]);
          break;
        case 'star': {
          // 星级越高越华丽（§15）
          const n = Math.max(1, Math.min(3, opts.stars || 1));
          const seq = [523.25, 659.25, 783.99, 1046.50];
          for (let i = 0; i < n + 1; i++) {
            this._tone(seq[i % seq.length] * (n === 3 ? 1.25 : 1), 'sine', 0.22, 0.22, i * 0.12);
          }
          this.vibrate(n === 3 ? [60, 40, 60, 40, 120] : [40, 40, 60]);
          break;
        }
        case 'gameover':
          this._tone(400, 'sine', 0.25, 0.25, 0);
          this._tone(300, 'sine', 0.25, 0.25, 0.25);
          this._tone(200, 'sine', 0.5, 0.25, 0.5);
          this.vibrate([100, 50, 100]);
          break;
      }
    },

    // ---------- 合成 BGM ----------
    startBGM() {
      if (this._custom) return;
      if (this._bgmTimer) clearInterval(this._bgmTimer);
      this._bgmTimer = setInterval(() => this._bgmNote(), 250);
    },

    stopBGM() {
      if (this._bgmTimer) {
        clearInterval(this._bgmTimer);
        this._bgmTimer = null;
      }
      this.setDrum(false);
    },

    _bgmNote() {
      if (!this.ctx || this.ctx.state !== 'running' || !this.musicOn) return;
      const f = NOTE[this._noteIndex % NOTE.length];
      try {
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t0);
        g.gain.setValueAtTime(0.04 * this.bgmVol * 2, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        osc.connect(g); g.connect(this.ctx.destination);
        osc.start(t0); osc.stop(t0 + 0.2);

        if (this._noteIndex % 2 === 0) {
          const o2 = this.ctx.createOscillator();
          const g2 = this.ctx.createGain();
          o2.type = 'triangle';
          o2.frequency.setValueAtTime(f / 2, t0);
          g2.gain.setValueAtTime(0.02 * this.bgmVol * 2, t0);
          g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
          o2.connect(g2); g2.connect(this.ctx.destination);
          o2.start(t0); o2.stop(t0 + 0.25);
        }
      } catch (e) {}
      this._noteIndex++;
    },

    // 连击鼓点层（§15：连击 x3 以上叠鼓点）
    setDrum(on) {
      if (on === this._drumOn) return;
      this._drumOn = on;
      if (this._drumTimer) {
        clearInterval(this._drumTimer);
        this._drumTimer = null;
      }
      if (!on) return;
      this._drumTimer = setInterval(() => {
        if (!this.ctx || this.ctx.state !== 'running' || !this.musicOn) return;
        try {
          const t0 = this.ctx.currentTime;
          const osc = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(70, t0);
          osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.09);
          g.gain.setValueAtTime(0.09 * this.bgmVol * 2, t0);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
          osc.connect(g); g.connect(this.ctx.destination);
          osc.start(t0); osc.stop(t0 + 0.13);
        } catch (e) {}
      }, 250);
    },

    // ---------- 自定义 BGM ----------
    // 曲目池：同一个 URL 复用同一个 <audio> 并提前 preload，
    // 切歌时直接 play → 不留空档（换歌、循环都秒跟）
    _pool: null,
    poolFor(url) {
      if (!this._pool) this._pool = {};
      let a = this._pool[url];
      if (!a) {
        a = new Audio();
        a.preload = 'auto';
        a.src = url;
        try { a.load(); } catch (e) {}
        this._pool[url] = a;
      }
      return a;
    },
    // 后台预加载（最多 12 首，避免占内存）
    preloadCustom(urls) {
      if (!Array.isArray(urls)) return;
      urls.filter(Boolean).slice(0, 12).forEach((u) => {
        try { this.poolFor(u); } catch (e) {}
        this.measureLoudness(u);
      });
    },

    // ---------- 响度统一 ----------
    // 目标：所有歌（含默认背景音乐）响度一致。
    // 默认 BGM 是合成音（振幅 0.04×音量×2 的音阶），折算响度约 0.0566×音量；
    // 把每首歌解码算出 RMS，乘一个系数后正好落在同一条响度线上，
    // 不会再出现「这首很小声、那首又很大声」。
    _gainCache: null,
    _measuring: null,
    LOUDNESS_TARGET: 0.0566,
    LOUDNESS_FALLBACK: 0.32,   // 跨域歌测不了响度时的经验系数

    _gainMap() {
      if (!this._gainCache) {
        let m = {};
        try { m = JSON.parse(localStorage.getItem('nl2:trackGain') || '{}') || {}; } catch (e) {}
        this._gainCache = m;
      }
      return this._gainCache;
    },

    gainFor(url) {
      const g = this._gainMap()[url];
      if (typeof g === 'number' && g > 0) return g;
      // 同源的歌马上就能测出来，先用 1 不至于突然变小；跨域的用经验值兜底
      return this.canMeasure(url) ? 1 : this.LOUDNESS_FALLBACK;
    },

    // 某首歌当前的最终音量（滑块音量 × 响度系数，封顶 1）
    trackVolume(url) {
      return Math.min(1, this.bgmVol * this.gainFor(url));
    },

    // 只有同源（内置/本地/同域）音频能 fetch 下来解码；跨域 CDN 不给 CORS，测不了
    canMeasure(url) {
      try {
        if (!/^https?:/i.test(url)) return true;
        if (typeof location === 'undefined' || !/^https?:/i.test(location.protocol)) return false;
        return new URL(url, location.href).host === location.host;
      } catch (e) {
        return false;
      }
    },

    measureLoudness(url) {
      if (!url || !this.canMeasure(url)) return;
      const map = this._gainMap();
      if (typeof map[url] === 'number') return;
      if (!this._measuring) this._measuring = {};
      if (this._measuring[url]) return;
      this._measuring[url] = true;

      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC || typeof fetch !== 'function') return;
      const ctx = this.ctx || new AC();
      fetch(url, { cache: 'force-cache' })
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .then((buf) => (buf ? ctx.decodeAudioData(buf) : null))
        .then((audio) => {
          if (!audio) return;
          let sum = 0, n = 0;
          for (let ch = 0; ch < Math.min(2, audio.numberOfChannels); ch++) {
            const data = audio.getChannelData(ch);
            for (let i = 0; i < data.length; i += 64) {
              sum += data[i] * data[i];
              n++;
            }
          }
          if (!n) return;
          const rms = Math.sqrt(sum / n);
          if (rms < 0.001) return;
          const gain = Math.max(0.08, Math.min(2.5, this.LOUDNESS_TARGET / rms));
          map[url] = Math.round(gain * 1000) / 1000;
          try { localStorage.setItem('nl2:trackGain', JSON.stringify(map)); } catch (e) {}
          // 正在播的就是这首歌 → 立刻应用新音量
          if (this._custom && this._customUrl === url) {
            this._custom.volume = this.trackVolume(url);
          }
        })
        .catch(() => {});
    },

    // opts: { loop: boolean, onEnded: function, restart: boolean }
    playCustom(url, onFail, opts) {
      opts = opts || {};
      this.stopBGM();

      const prevUrl = this._customUrl;
      const prev = this._custom;
      this._customUrl = url;
      this._failing = false;

      if (!url) {
        if (prev) { prev.onended = null; prev.onerror = null; prev.pause(); }
        this._custom = null;
        return;
      }

      let audio = null;
      try { audio = this.poolFor(url); } catch (e) {}
      if (!audio) {
        if (onFail) onFail();
        return;
      }

      // 换歌：旧曲只暂停，留在池里（下次切回来仍然是秒开）
      if (prev && prev !== audio) {
        prev.onended = null;
        prev.onerror = null;
        prev.pause();
      }

      const sameTrack = prevUrl === url && prev === audio && !audio.ended;
      audio.preload = 'auto';
      audio.volume = this.trackVolume(url);
      audio.loop = opts.loop !== false && !opts.onEnded;
      audio.onerror = () => {
        this._failing = true;
        this._custom = null;
        this._customUrl = '';
        if (onFail) onFail();
        else console.warn('[Audio] 自定义音频加载失败:', url);
      };
      audio.onended = opts.onEnded ? () => { if (!audio.loop) opts.onEnded(); } : null;

      this._custom = audio;

      // 同一首只改播放模式时不要重头播；其余情况从头开始
      if (!sameTrack || opts.restart) {
        try { audio.currentTime = 0; } catch (e) {}
      }
      if (this.musicOn) {
        const p = audio.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    },

    // 播放列表用：切歌时只换 url，不重置音量
    setCustomLoop(on) {
      if (this._custom) this._custom.loop = !!on;
    },

    currentCustomUrl() {
      return this._customUrl || '';
    },

    isCustomPlaying() {
      return !!(this._custom && !this._custom.paused);
    },

    toggleCustom() {
      if (!this._custom) return;
      if (this._custom.paused) this._custom.play().catch(() => {});
      else this._custom.pause();
    },

    hasCustomFailed() {
      return this._failing;
    },

    stopCustom() {
      if (this._custom) {
        this._custom.pause();
        this._custom = null;
      }
      this._customUrl = '';
    },

    setMusicOn(on) {
      this.musicOn = on;
      if (!on) {
        if (this._custom) this._custom.pause();
        if (this._bgmTimer) { clearInterval(this._bgmTimer); this._bgmTimer = null; }
        this.setDrum(false);
      } else {
        if (this._custom) this._custom.play().catch(() => {});
        else this.startBGM();
      }
    }
  };

  global.AudioManager = AudioManager;
})(window);
