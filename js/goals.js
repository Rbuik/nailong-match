// goals.js — 5 种目标类型判定 + 星级评价
// 对应优化方案 §1（目标多样化）、§5（星星评价）
// 暴露 window.Goals

(function (global) {
  'use strict';

  const TYPES = ['score', 'collect', 'clear', 'timed', 'moves'];

  const LABEL = {
    score: '得分',
    collect: '收集',
    clear: '清除果冻',
    timed: '限时得分',
    moves: '极限步数'
  };

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  // 由 levels.json 的 goal 定义构造运行时状态
  function create(def) {
    const d = clone(def || {});
    const state = {
      type: TYPES.indexOf(d.type) >= 0 ? d.type : 'score',
      target: d.target,
      current: 0,
      byColor: {},
      jellyCleared: 0,
      timeLimit: d.time || 0,
      timeLeft: d.time || 0
    };
    if (state.type === 'collect') {
      state.byColor = {};
      Object.keys(state.target || {}).forEach((c) => { state.byColor[c] = 0; });
    }
    return state;
  }

  // 每次消除后推进进度
  // ctx = { scoreDelta, colors: {type:count}, jelly: number }
  function progress(state, ctx) {
    ctx = ctx || {};
    if (state.type === 'collect') {
      const colors = ctx.colors || {};
      Object.keys(state.byColor).forEach((c) => {
        state.byColor[c] += colors[c] || 0;
      });
      return;
    }
    if (state.type === 'clear') {
      state.jellyCleared += ctx.jelly || 0;
      return;
    }
    // score / timed / moves 都看分数
    state.current += ctx.scoreDelta || 0;
  }

  function isComplete(state) {
    if (!state) return false;
    switch (state.type) {
      case 'collect':
        return Object.keys(state.target || {}).every(
          (c) => (state.byColor[c] || 0) >= state.target[c]
        );
      case 'clear':
        return state.jellyCleared >= state.target;
      default:
        return state.current >= state.target;
    }
  }

  // 目标进度 0~1
  function ratio(state) {
    if (!state) return 0;
    if (state.type === 'collect') {
      const keys = Object.keys(state.target || {});
      if (!keys.length) return 1;
      const sum = keys.reduce((s, c) => s + Math.min(1, (state.byColor[c] || 0) / state.target[c]), 0);
      return sum / keys.length;
    }
    if (state.type === 'clear') {
      return Math.min(1, state.jellyCleared / (state.target || 1));
    }
    return Math.min(1, state.current / (state.target || 1));
  }

  function remainText(state) {
    if (!state) return '';
    switch (state.type) {
      case 'collect': {
        const parts = Object.keys(state.target || {}).map((c) => {
          const need = Math.max(0, state.target[c] - (state.byColor[c] || 0));
          return `色${c} ${need}`;
        });
        return parts.join(' / ');
      }
      case 'clear':
        return `还剩 ${Math.max(0, state.target - state.jellyCleared)} 格`;
      case 'timed':
        return `${Math.round(state.timeLeft)}s / 目标 ${state.target}`;
      default:
        return `还差 ${Math.max(0, state.target - state.current)} 分`;
    }
  }

  function barText(state) {
    if (!state) return '';
    if (state.type === 'collect') {
      const parts = Object.keys(state.target || {}).map(
        (c) => `${Math.min(state.byColor[c] || 0, state.target[c])}/${state.target[c]}`
      );
      return `目标：收集 ${parts.join(' · ')}`;
    }
    if (state.type === 'clear') {
      return `目标：清除果冻 ${Math.min(state.jellyCleared, state.target)} / ${state.target}`;
    }
    if (state.type === 'timed') {
      return `目标：限时 ${state.timeLimit}s 内得 ${state.current} / ${state.target} 分`;
    }
    return `目标：得分 ${state.current} / ${state.target}（${remainText(state)}）`;
  }

  // 星级：1 星过关，2/3 星看分数阈值或剩余步数比例
  function stars(def, score, remainRatio) {
    const th = (def && def.stars) || [];
    const s1 = th[0] || (def && def.goal && def.goal.target) || 1;
    const s2 = th[1] || s1 * 1.4;
    const s3 = th[2] || s1 * 1.9;

    if (score >= s3 || remainRatio >= 0.6) return 3;
    if (score >= s2 || remainRatio >= 0.3) return 2;
    return 1;
  }

  global.Goals = {
    TYPES, LABEL,
    create, progress, isComplete, ratio, remainText, barText, stars
  };
})(window);
