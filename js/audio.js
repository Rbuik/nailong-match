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

    // ===== 统一响度 =====
    // 目标：默认 BGM、音乐库所有歌、导入的歌、游戏音效，在同一个滑块位置
    // 听起来的响度一致（都对齐到 100% 时的这个 RMS 值）
    LOUDNESS_TARGET: 0.0566,
    LOUDNESS_FALLBACK: 0.32,   // 跨域歌测不了响度时的经验系数
    BGM_NOTE_PEAK: 0.24,       // 合成 BGM 主音峰值（100% 音量）
    BGM_BASS_PEAK: 0.10,       // 合成 BGM 低音层峰值
    SFX_PEAK_SCALE: 1.6,       // 音效峰值系数（原来是 2，偏响）

    _bgmTimer: null,
    _noteIndex: 0,
    _drumTimer: null,
    _drumOn: false,
    _custom: null,
    _customUrl: '',
    _failing: false,

    init(settings, canCreate) {
      settings = settings || {};
      if (typeof settings.music === 'boolean') this.musicOn = settings.music;
      if (typeof settings.bgm === 'number') this.bgmVol = settings.bgm;
      if (typeof settings.sfx === 'number') this.sfxVol = settings.sfx;

      // iOS 上「非用户手势创建的 AudioContext」即使之后 resume 也可能永远起不来，
      // 结果就是音乐关着时连音效都没声音。所以 iOS 上把创建推迟到第一次手势。
      if (canCreate !== false && !this.ctx) this.ensureCtx();
      if (this.ctx && this.ctx.state === 'suspended') {
        const p = this.ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
      this.masterReady = !!this.ctx;
      this.bindGestureUnlock();
      this.startWatchdog();
      return this.masterReady;
    },

    ensureCtx() {
      if (this.ctx) return this.ctx;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
        // BGM 走独立总线：关音乐时把总线拉到 0，已经排进时间轴的音（最多提前 0.9 秒）
        // 立刻静音——不然关了开关还要等排好的音播完，听着就是「关了还有延迟」
        this._bgmGain = this.ctx.createGain();
        this._bgmGain.gain.value = 1;
        this._bgmGain.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
      return this.ctx;
    },

    // BGM 总线开关：on=true 恢复到当前 BGM 音量，false 立即静音
    // （音效不走这条总线，不受影响）
    _bgmBusOn(on) {
      try {
        if (!this.ctx || !this._bgmGain) return;
        const t = this.ctx.currentTime;
        const g = this._bgmGain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(Math.max(0.0001, g.value), t);
        g.linearRampToValueAtTime(on ? Math.max(0.0001, this.bgmVol) : 0.0001, t + (on ? 0.02 : 0.05));
      } catch (e) {}
    },

    // 拖「音量」滑条时实时改总线增益：合成 BGM 的音量全走这一条总线，
    // 滑到哪儿声音立刻变到哪儿（以前音量是每个音符排程时算死的，
    // 要等最多 0.9 秒前排好的音播完才变 —— 这就是「音量反馈有延迟」的根因）
    applyBgmVolume() {
      try {
        if (!this.ctx || !this._bgmGain) return;
        const t = this.ctx.currentTime;
        const g = this._bgmGain.gain;
        const target = this.musicOn ? Math.max(0.0001, this.bgmVol) : 0.0001;
        g.cancelScheduledValues(t);
        g.setValueAtTime(Math.max(0.0001, g.value), t);
        g.linearRampToValueAtTime(target, t + 0.03);
      } catch (e) {}
    },

    // 第一下触摸就把音频上下文叫醒：音效独立于背景音乐，
    // 哪怕音乐一直关着，只要碰一下屏幕，之后所有音效都能正常出声。
    _gestureBound: false,
    // 每次点屏幕都 resume + 重设音量 + 补播队列是很贵的，跑起来之后就直接跳过，
    // 免得每一下点击都给音频线程添一次无谓的工作（听感上就是「抖一下」）。
    kickResume() {
      const running = !!(this.ctx && this.ctx.state === 'running');
      const customPaused = !!(this._custom && this._custom.paused);
      if (running && !customPaused) return;
      this.resumeCtx();
    },
    bindGestureUnlock() {
      if (this._gestureBound || typeof document === 'undefined') return;
      this._gestureBound = true;
      const kick = () => { this.kickResume(); };
      ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'].forEach((ev) =>
        document.addEventListener(ev, kick, { passive: true, capture: true }));
    },

    // ---------- 播放看门狗（修「播放几十分钟后自己停了」） ----------
    // 手机上挂机久了，系统会把 AudioContext 挂起 / 把 <audio> 暂停
    // （来电、切后台再回来、省电策略），之前没人把它拉起来，音乐就永远停了。
    // 每 4 秒巡检：上下文挂起就 resume；音乐被暂停就接着播；进度卡住就重载续播。
    _watchdog: null,
    _lastTick: 0,
    _stuckCount: 0,
    _stopped: false,   // 用户主动停掉自定义音乐时置位，看门狗不再强行拉起
    bgmAllowed: true,  // 登录页 / 注册页不允许 BGM，进主界面后再放开

    // 场景级 BGM 开关：关掉时立即静音，且看门狗 / unlock 都不会再把音乐拉起来
    gateBGM(on) {
      this.bgmAllowed = !!on;
      this._bgmBusOn(on);     // 关场景时总线也静音（登录页不许漏出排程里的音）
      if (!on) {
        try { if (this._custom) this._custom.pause(); } catch (e) {}
        if (this._bgmTimer) { clearInterval(this._bgmTimer); this._bgmTimer = null; }
      }
    },
    startWatchdog() {
      if (this._watchdog) return;
      this._watchdog = setInterval(() => {
        try {
          if (!this.musicOn) return;
          if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
          if (this.ctx && this.ctx.state === 'suspended') this.resumeCtx();

          const a = this._custom;
          if (!a) {
            // 没在播自定义音乐：默认合成 BGM 的定时器丢了就重启
            if (!this._stopped && this.bgmAllowed && !this._bgmTimer) this.startBGM();
            return;
          }
          if (a.paused) {
            if (this.bgmAllowed && !a.ended) {
              const p = a.play();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
            return;
          }
          // 播放中但进度一直不动（断流 / 内核卡死）→ 重新加载续播
          const t = a.currentTime;
          if (Math.abs(t - (this._lastTick || 0)) < 0.05) {
            this._stuckCount = (this._stuckCount || 0) + 1;
            if (this._stuckCount >= 4) {
              this._stuckCount = 0;
              try { a.load(); } catch (e) {}
              const p = a.play();
              if (p && typeof p.catch === 'function') p.catch(() => {});
            }
          } else {
            this._stuckCount = 0;
          }
          this._lastTick = t;
        } catch (e) {}
      }, 4000);
    },

    // 用户首次交互时调用（移动端自动播放限制）
    // 确保 AudioContext 处于 running（放在用户手势里调用最可靠）
    resumeCtx() {
      this.ensureCtx();
      if (!this.ctx) return Promise.resolve(false);
      const flush = () => { this.applyCustomVolume(); this._flushTones(); };
      if (this.ctx.state === 'suspended' && this.ctx.resume) {
        let p;
        try { p = this.ctx.resume(); } catch (e) { p = null; }
        if (p && typeof p.then === 'function') {
          // 上下文真正跑起来之后再把音量接管过来：
          // 不然刚进页面时 ctx 还是 suspended，切到 WebAudio 通道的那一步会被跳过，
          // iOS 上 element.volume 又是只读的 → 第一首歌会用 100% 音量播放，
          // 直到下次拖滑块 / 切歌才恢复正常（这就是「一进来不是上次音量」的根因）。
          p.then(flush).catch(() => {});
          return p;
        }
        if (p && typeof p.catch === 'function') p.catch(() => {});
        setTimeout(flush, 60);
        return Promise.resolve(true);
      }
      if (this.ctx.state === 'running') flush();
      return Promise.resolve(true);
    },

    unlock() {
      this.resumeCtx();
      if (this.musicOn && this.bgmAllowed) {
        if (this._custom) {
          if (this._custom.paused) {
            const p = this._custom.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
          }
        } else {
          this.startBGM();
        }
      }
    },

    setVolumes(bgm, sfx) {
      if (typeof bgm === 'number') {
        this.bgmVol = bgm;
        // 滑块一动立即生效（iOS 上 element.volume 无效，走 WebAudio gain）
        // 顺手把可能挂起的上下文叫醒，保证第一次拖动就能听到变化
        if (this.ctx && this.ctx.state !== 'running') this.resumeCtx();
        this.applyBgmVolume();       // 合成 BGM：总线增益实时跟手
        this.applyCustomVolume();    // 自定义歌：gain 节点 / element.volume 实时跟手
      }
      if (typeof sfx === 'number') this.sfxVol = sfx;
    },

    // ---------- 自定义音乐的音量通道 ----------
    // iOS Safari 的 <audio>.volume 是只读的，设了也不响 —— 音乐库里正播的歌
    // 拖滑块完全没变化就是它。所以把 <audio> 接进 WebAudio
    // （MediaElementSource → GainNode），用 gain 控制音量，滑块一动立即生效。
    // 注意：跨域音频接进 WebAudio 会变成静音（CDN 不给 CORS），
    // 这类歌只能用 element.volume（安卓 / 电脑可用）。
    _mediaNodes: null,
    _isIOS() {
      const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
      return /iP(hone|od|ad)/.test(ua) ||
        (/Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
    },
    _ensureMediaGraph(audio, url) {
      if (!audio) return null;
      // 跨域歌不能进 WebAudio（会静音），保持原生播放
      if (url && !this.canMeasure(url)) return null;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      if (!this.ctx) {
        try { this.ctx = new AC(); } catch (e) { return null; }
      }
      if (!this._mediaNodes) this._mediaNodes = new Map();
      if (this._mediaNodes.has(audio)) return this._mediaNodes.get(audio);
      try {
        const src = this.ctx.createMediaElementSource(audio);
        const gain = this.ctx.createGain();
        src.connect(gain);
        gain.connect(this.ctx.destination);
        const node = { src: src, gain: gain };
        // 接进来时就把增益设成「上次保存的音量」，别先按 1.0 全音量放一耳朵
        try { gain.gain.value = this.trackVolume(url); } catch (e) {}
        this._mediaNodes.set(audio, node);
        return node;
      } catch (e) {
        return null;
      }
    },
    // 当前自定义曲目的最终音量：优先 gain 节点（iOS / 同源歌），否则 element.volume
    applyCustomVolume() {
      const a = this._custom;
      if (!a) return;
      const v = this.trackVolume(this._customUrl);
      let node = this._mediaNodes && this._mediaNodes.get(a);
      // 只在 AudioContext 已经跑起来（解锁成功）后才接管，
      // 否则会把还在自动播放的歌变成静音（WebAudio 挂起时不出声）
      if (!node && this.ctx && this.ctx.state === 'running') {
        node = this._ensureMediaGraph(a, this._customUrl);
      }
      if (node) {
        try { node.gain.gain.value = v; } catch (e) {}
        a.volume = 1;
      } else {
        a.volume = v;
      }
    },

    // 调节音效滑块时的实时试听
    sfxDemo() {
      this.playSFX('coin');
    },

    // ---------- 音效发声 ----------
    // 音效与「音乐开关」完全无关：音乐关掉时这里照样出声。
    // 第一次点击时上下文还没跑起来（iOS 冷启动最明显），先排进队列，
    // 等 resume 成功再补播，避免「刚进来没声音」。
    _pendingTones: [],
    _pendingNoise: [],
    _pendingHum: [],
    _tone(freq, type, dur, vol, delay, to) {
      this.ensureCtx();
      if (!this.ctx) return;
      if (this.ctx.state !== 'running') {
        const now = Date.now();
        this._pendingTones.push({ args: [freq, type, dur, vol, delay, to], at: now });
        if (this._pendingTones.length > 8) this._pendingTones.shift();
        if (this._flushTimer) clearTimeout(this._flushTimer);
        this._flushTimer = setTimeout(() => this._flushTones(), 140);
        this.resumeCtx();
        return;
      }
      this._toneNow(freq, type, dur, vol, delay, to);
    },

    _flushTones() {
      if (!this.ctx || this.ctx.state !== 'running') return;
      if (this._flushTimer) { clearTimeout(this._flushTimer); this._flushTimer = null; }
      const q = this._pendingTones.splice(0);
      const now = Date.now();
      q.forEach((it) => {
        if (now - it.at > 900) return;      // 太旧的丢弃，别一股脑炸出来
        this._toneNow.apply(this, it.args);
      });
      const nq = this._pendingNoise.splice(0);
      nq.forEach((it) => {
        if (now - it.at > 900) return;
        this._noiseNow.apply(this, it.args);   // 碎冰这类噪声也要补播，否则前几声是哑的
      });
      const hq = this._pendingHum.splice(0);
      hq.forEach((it) => {
        if (now - it.at > 900) return;
        this._humNow.apply(this, it.args);
      });
    },

    // 低通滤波的「闷响」音（引擎嗡嗡声专用）：锯齿波谐波多但被低通切掉高频，
    // 只留下低沉的嗡嗡，不会像裸锯齿那样扎耳朵；包络慢慢起、一路渐隐
    _hum(freq, dur, vol, delay, to, cutoff) {
      this.ensureCtx();
      if (!this.ctx) return;
      if (this.ctx.state !== 'running') {
        const now = Date.now();
        this._pendingHum.push({ args: [freq, dur, vol, delay, to, cutoff], at: now });
        if (this._pendingHum.length > 8) this._pendingHum.shift();
        if (this._flushTimer) clearTimeout(this._flushTimer);
        this._flushTimer = setTimeout(() => this._flushTones(), 140);
        this.resumeCtx();
        return;
      }
      this._humNow(freq, dur, vol, delay, to, cutoff);
    },

    _humNow(freq, dur, vol, delay, to, cutoff) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      try {
        const t0 = this.ctx.currentTime + (delay || 0);
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, t0);
        if (to && to > 0 && to !== freq) {
          osc.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.85);
        }
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(cutoff || 260, t0);   // 只留低频：低沉、不尖锐
        lp.Q.setValueAtTime(0.7, t0);
        const g = this.ctx.createGain();
        const peak = Math.max(0.0001, vol * this.sfxVol * this.SFX_PEAK_SCALE);
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + 0.06);  // 慢慢起，不「啪」一下
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(lp);
        lp.connect(g);
        g.connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
      } catch (e) {}
    },

    _toneNow(freq, type, dur, vol, delay, to) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      delay = delay || 0;
      try {
        const t0 = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        // 带滑音：炸弹的「轰」要从高处一路坠下去，纯固定频率只能弹出「嘟」
        if (to && to > 0 && to !== freq) {
          osc.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.85);
        }
        // 统一响度：所有音效与音乐在同一条响度线上（原来 ×2 偏响）
        const peak = Math.max(0.0001, vol * this.sfxVol * this.SFX_PEAK_SCALE);
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

    // ---------- 噪声（碎冰 / 裂开类音效） ----------
    // 用一段白噪声 + 带通滤波 + 极快包络模拟「咔」的脆裂声，
    // 纯正弦叠不出来这种碎裂质感。
    _noiseBuf: null,
    _noiseBuffer() {
      if (!this.ctx) return null;
      if (!this._noiseBuf) {
        const len = Math.floor(this.ctx.sampleRate * 0.5);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this._noiseBuf = buf;
      }
      return this._noiseBuf;
    },

    // 和 _tone 一样：上下文还没跑起来时先排队，解锁后补播
    _noise(dur, vol, freq, q, delay, type) {
      this.ensureCtx();
      if (!this.ctx) return;
      if (this.ctx.state !== 'running') {
        const now = Date.now();
        this._pendingNoise.push({ args: [dur, vol, freq, q, delay, type], at: now });
        if (this._pendingNoise.length > 8) this._pendingNoise.shift();
        if (this._flushTimer) clearTimeout(this._flushTimer);
        this._flushTimer = setTimeout(() => this._flushTones(), 140);
        this.resumeCtx();
        return;
      }
      this._noiseNow(dur, vol, freq, q, delay, type);
    },

    _noiseNow(dur, vol, freq, q, delay, type) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      try {
        const t0 = this.ctx.currentTime + (delay || 0);
        const src = this.ctx.createBufferSource();
        src.buffer = this._noiseBuffer();
        const bp = this.ctx.createBiquadFilter();
        // highpass：整段高频噪声（碎冰的「咔嚓」）；bandpass：窄带嘶声
        bp.type = type || 'bandpass';
        bp.frequency.setValueAtTime(freq, t0);
        bp.Q.setValueAtTime(bp.type === 'highpass' ? 0.6 : (q || 1.2), t0);
        const g = this.ctx.createGain();
        const peak = Math.max(0.0001, vol * this.sfxVol * this.SFX_PEAK_SCALE);
        g.gain.setValueAtTime(0.0001, t0);
        // 起音越快越像「裂」，慢一点就变成「呼」
        g.gain.linearRampToValueAtTime(peak, t0 + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        src.connect(bp);
        bp.connect(g);
        g.connect(this.ctx.destination);
        src.start(t0);
        src.stop(t0 + dur + 0.02);
      } catch (e) {}
    },

    // ---------- 音效 ----------
    playSFX(name, opts) {
      opts = opts || {};
      // 音效也在用户手势里触发，ctx 还没 running 就先恢复，否则试听没声音
      if (!this.ctx || this.ctx.state !== 'running') this.resumeCtx();
      switch (name) {
        case 'select':
          this._tone(600, 'sine', 0.08, 0.15);
          this.vibrate(10);
          break;
        case 'swap':
          this._tone(400, 'triangle', 0.1, 0.15);
          this.vibrate(15);
          break;
        case 'stone': {
          // 石头推动：低频摩擦的隆隆声 —— 低通噪声拖尾 + 沉闷的哼鸣下滑，
          // 像重物在石槽里被慢慢推着走（移动轨道滑动专用）
          this._noise(0.5, 0.20, 300, 1.2, 0, 'lowpass');
          this._noise(0.32, 0.10, 900, 1.0, 0.10, 'bandpass');
          this._hum(95, 0.5, 0.13, 0, 55, 160);
          this.vibrate(22);
          break;
        }
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
        case 'bomb': {
          // 炸弹 = 「轰！」：低频下坠的闷响 + 一记中频冲击 + 低频尾噪。
          // 高频噪声 / 碎粒是碎冰的招牌（脆、嘶），这里一点都不要，否则听着像冰块碎了。
          this._tone(150, 'sine', 0.55, 0.45, 0, 42);        // 主「轰」：150Hz 坠到 42Hz
          this._tone(320, 'triangle', 0.18, 0.20, 0.004, 105); // 爆点的「砰」冲击
          this._noise(0.36, 0.17, 380, 1, 0.02, 'lowpass');    // 低频尾巴（烟尘感）
          this._tone(78, 'sine', 0.42, 0.16, 0.02, 50);        // 胸腔那一下
          this._tone(640, 'sine', 0.07, 0.12, 0, 300);         // 手机小喇叭也能听见的「bwup」
          this.vibrate([35, 45, 25]);
          break;
        }
        case 'line':
          this._tone(700, 'square', 0.12, 0.12);
          this._tone(1100, 'square', 0.12, 0.09, 0.06);
          this.vibrate(18);          // 线消扫过去，手上跟着一下
          break;
        case 'ice': {
          // 碎冰：① 极短的高通噪声「咔嚓」破口 ② 一下低频闷响当冰体
          // ③ 几颗随机音高的高频「叮」当飞溅的碎渣 —— 冰是「脆 + 叮」，不能只是一声嘶
          const fin = !!opts.final;
          this._noise(0.11, 0.28, 1500, 0.6, 0, 'highpass');
          this._noise(0.06, 0.20, 3200, 0.6, 0.011, 'highpass');
          this._tone(170, 'sine', 0.08, 0.11);
          // 碎渣在嘴里「嘎吱」的那种颗粒感：几下很短的高频噪声，时间 / 音量都随机
          const grains = fin ? 5 : 2;
          for (let i = 0; i < grains; i++) {
            this._noise(0.03 + Math.random() * 0.03, 0.10 + Math.random() * 0.06,
              1200 + Math.random() * 2600, 0.6, 0.03 + Math.random() * (fin ? 0.20 : 0.10), 'highpass');
          }
          const tinks = fin ? 7 : 3;
          for (let i = 0; i < tinks; i++) {
            const f = 2600 + Math.random() * 3600;
            this._tone(f, 'triangle', 0.045 + Math.random() * 0.035,
              0.05 + Math.random() * 0.03, 0.02 + Math.random() * (fin ? 0.20 : 0.09));
          }
          if (fin) {
            this._noise(0.18, 0.18, 2400, 0.6, 0.10, 'highpass');
            this.vibrate([12, 22, 18]);
          } else {
            this.vibrate(8);
          }
          break;
        }
        case 'coin':
          this._tone(1200, 'sine', 0.08, 0.12);
          this._tone(1600, 'sine', 0.12, 0.1, 0.06);
          break;
        case 'beat':
          // 节奏关的节拍声（每 4 拍重音一次）
          if (opts.accent) {
            this._tone(1568, 'triangle', 0.09, 0.10);
            this._tone(784, 'sine', 0.12, 0.06, 0.01);
          } else {
            this._tone(1046, 'triangle', 0.05, 0.055);
          }
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
        case 'paint': {
          // 🎨 颜料「唰唰唰」：三连快速横扫的窄带嘶声（像刷子来回刷），
          // 一声比一声亮，最后补一点高频「嚓」收尾
          for (let i = 0; i < 3; i++) {
            this._noise(0.09, 0.20, 900 + i * 600, 2.2, i * 0.085, 'bandpass');
          }
          this._noise(0.05, 0.12, 3600, 1.5, 0.26, 'bandpass');
          this.vibrate(12);
          break;
        }
        case 'magnet': {
          // 🧲 磁铁「吸」：低频嗡→升上去的滑音（被拽过去的手感）+ 环绕嘶声，
          // 收尾一记「啪」当吸住的爆点
          this._tone(120, 'sine', 0.34, 0.30, 0, 480);        // 嗡——往上拽
          this._tone(240, 'triangle', 0.30, 0.16, 0.03, 760);
          this._noise(0.30, 0.10, 700, 1.4, 0.02, 'bandpass');
          this._tone(880, 'sine', 0.10, 0.22, 0.34, 300);     // 吸住「啪」
          this._noise(0.10, 0.16, 2400, 1.2, 0.34, 'bandpass');
          this.vibrate([18, 30, 14]);
          break;
        }
        case 'propeller': {
          // 🛩️ 螺旋桨飞机：只走低通滤波的「闷响」通道——低沉的引擎嗡嗡声，
          // 高频全被切掉（不扎耳），两层微失谐叠出拍频发颤，整段慢慢渐隐飞远
          this._hum(78, 1.9, 0.20, 0, 64, 230);                       // 主引擎：嗡——低低地渐渐远去
          this._hum(80.5, 1.9, 0.09, 0, 66, 200);                     // 微失谐副层：拍频让嗡声发颤
          this._noise(1.5, 0.05, 170, 0.6, 0.06, 'lowpass');          // 一层淡淡的气流声，同样渐隐
          this.vibrate(14);
          break;
        }
        case 'rainbow': {
          // 🌈 彩虹爆炸：一记低频「轰」打底 + 一串快速上行琶音（七彩感）+
          // 高频闪烁噪声，比炸弹「闷响」更亮更飘
          this._tone(180, 'sine', 0.42, 0.34, 0, 60);         // 轰
          this._noise(0.30, 0.14, 500, 1, 0, 'lowpass');
          const seq = [523, 659, 784, 988, 1175, 1568];
          for (let i = 0; i < seq.length; i++) {
            this._tone(seq[i], 'triangle', 0.14, 0.14, 0.03 + i * 0.055);
          }
          this._noise(0.20, 0.08, 5200, 1.4, 0.10, 'highpass');
          this.vibrate([30, 40, 30]);
          break;
        }
      }
    },

    // ---------- 合成 BGM ----------
    // 关键：提前排程（lookahead），而不是「到点才响」。
    // 以前是 setInterval 每 250ms 现响一个音——玩家一点按钮 / 棋盘动画卡一下主线程，
    // 定时器就晚到，音乐听起来一卡一卡的。现在每 150ms 把接下来 0.9 秒的音
    // 一次性排进 WebAudio 时间轴，主线程抖一下也不影响已经排好的音。
    BGM_STEP: 0.25,     // 每个音 250ms（和原来的节奏一样）
    BGM_AHEAD: 0.9,     // 提前排多久
    _bgmNext: 0,
    startBGM() {
      if (!this.bgmAllowed) return;   // 登录页等场景不放音乐
      if (this._custom) return;
      // 已在播就绝不重启：unlock() 挂在 pointerdown / touchstart / touchend / click
      // 等 7 种事件上，一次点击会触发好几次；重启会再排一串新音，
      // 而已排进 WebAudio 时间轴的旧音取消不掉 → 几层旋律叠在一起「乱弹钢琴」。
      if (this._bgmTimer) return;
      this._bgmNext = 0;
      this.applyBgmVolume();   // 起播前把总线音量对齐到当前设置（音符本身不再带音量）
      this._bgmNote();
      this._bgmTimer = setInterval(() => this._bgmNote(), 150);
    },

    stopBGM() {
      if (this._bgmTimer) {
        clearInterval(this._bgmTimer);
        this._bgmTimer = null;
      }
      this._bgmNext = 0;
      this.setDrum(false);
    },

    _bgmNote() {
      if (!this.ctx || this.ctx.state !== 'running' || !this.musicOn || !this.bgmAllowed) return;
      const now = this.ctx.currentTime;
      // 切后台再回来：时间轴对不上了，重新起拍，不补一堆过期音
      if (!this._bgmNext || this._bgmNext < now - 0.2) this._bgmNext = now + 0.08;
      let guard = 0;
      while (this._bgmNext < now + this.BGM_AHEAD && guard++ < 24) {
        this._bgmNoteAt(this._bgmNext);
        this._bgmNext += this.BGM_STEP;
      }
    },

    _bgmNoteAt(t0) {
      const f = NOTE[this._noteIndex % NOTE.length];
      try {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t0);
        // 关键：起音用 20ms 的快速爬坡，别让增益从 0 直接跳到峰值——
        // 正弦波在非零相位突然出声会「咔哒」一下，整条 BGM 听着发脏
        g.gain.setValueAtTime(0.0001, t0);
        // 音量全走 _bgmGain 总线（拖滑条实时变），这里不再乘 bgmVol
        g.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.BGM_NOTE_PEAK), t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
        osc.connect(g); g.connect(this._bgmGain || this.ctx.destination);
        osc.start(t0); osc.stop(t0 + 0.22);

        if (this._noteIndex % 2 === 0) {
          const o2 = this.ctx.createOscillator();
          const g2 = this.ctx.createGain();
          o2.type = 'triangle';
          o2.frequency.setValueAtTime(f / 2, t0);
          g2.gain.setValueAtTime(0.0001, t0);
          g2.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.BGM_BASS_PEAK), t0 + 0.02);
          g2.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.27);
          o2.connect(g2); g2.connect(this._bgmGain || this.ctx.destination);
          o2.start(t0); o2.stop(t0 + 0.27);
        }
      } catch (e) {}
      this._noteIndex++;
    },

    // 连击鼓点层（§15：连击 x3 以上叠鼓点）——同样提前排程
    _drumNext: 0,
    setDrum(on) {
      if (on === this._drumOn) return;
      this._drumOn = on;
      if (this._drumTimer) {
        clearInterval(this._drumTimer);
        this._drumTimer = null;
      }
      this._drumNext = 0;
      if (!on) return;
      this._drumTick();
      this._drumTimer = setInterval(() => this._drumTick(), 150);
    },

    _drumTick() {
      if (!this.ctx || this.ctx.state !== 'running' || !this.musicOn) return;
      const now = this.ctx.currentTime;
      if (!this._drumNext || this._drumNext < now - 0.2) this._drumNext = now + 0.05;
      let guard = 0;
      while (this._drumNext < now + this.BGM_AHEAD && guard++ < 24) {
        this._drumAt(this._drumNext);
        this._drumNext += this.BGM_STEP;
      }
    },

    _drumAt(t0) {
      try {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(70, t0);
        osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.09);
        // 起音同样走 8ms 爬坡，去掉鼓点头上的「啪」声
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0001, this.BGM_BASS_PEAK * 0.8), t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
        osc.connect(g); g.connect(this._bgmGain || this.ctx.destination);
        osc.start(t0); osc.stop(t0 + 0.13);
      } catch (e) {}
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
    // 默认 BGM 是合成音，下面已按同一目标校准峰值；
    // 把每首歌解码算出 RMS，乘一个系数后正好落在同一条响度线上，
    // 不会再出现「这首很小声、那首又很大声」。
    _gainCache: null,
    _measuring: null,
    _gainMap() {
      if (!this._gainCache) {
        let m = {};
        try { m = JSON.parse(localStorage.getItem('nl2:trackGain') || '{}') || {}; } catch (e) {}
        this._gainCache = m;
      }
      return this._gainCache;
    },

    gainFor(url) {
      const map = this._gainMap();
      const g = map[url];
      if (typeof g === 'number' && g > 0) return g;
      // 还没测出来：先用已测歌曲的中位数，避免第一耳朵忽大忽小
      const vals = Object.keys(map)
        .map((k) => map[k])
        .filter((v) => typeof v === 'number' && v > 0)
        .sort((a, b) => a - b);
      if (vals.length) return vals[Math.floor(vals.length / 2)];
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
            this.applyCustomVolume();
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
      audio.volume = 1; // 音量统一由 applyCustomVolume 控制（iOS 走 gain 节点）
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
      this._stopped = false;
      // 同源歌在 AudioContext 已解锁时接进 WebAudio（音量滑块才能实时生效）
      if (this.ctx && this.ctx.state === 'running') this._ensureMediaGraph(audio, url);
      this.applyCustomVolume();

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
      this._stopped = true; // 用户主动停的，看门狗不要重启默认 BGM
    },

    setMusicOn(on) {
      this.musicOn = on;
      if (!on) {
        // 排进时间轴的音立即静音（修「音乐开关有延迟」：以前要等 0.9 秒排程播完）
        this._bgmBusOn(false);
        if (this._custom) this._custom.pause();
        if (this._bgmTimer) { clearInterval(this._bgmTimer); this._bgmTimer = null; }
        this.setDrum(false);
      } else {
        if (!this.bgmAllowed) return;   // 登录页等场景不放音乐
        // ctx 还挂着就先叫醒：不然音乐要等下一次触摸才有声，听起来像按键没反应
        if (!this.ctx || this.ctx.state !== 'running') this.resumeCtx();
        this._bgmBusOn(true);
        this._stopped = false;
        if (this._custom) this._custom.play().catch(() => {});
        else this.startBGM();
      }
    }
  };

  global.AudioManager = AudioManager;
})(window);
