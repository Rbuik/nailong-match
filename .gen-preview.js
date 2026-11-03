// 生成桌面单文件「结算画面预览.html」：内联项目原始 CSS，1:1 还原结算面板
const fs = require('fs');
const path = require('path');

const root = __dirname;
const styleCss = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const themeCss = fs.readFileSync(path.join(root, 'css/themes.css'), 'utf8');

const shellCss = `
/* ================= 预览页外壳（不改动游戏样式） ================= */
html, body.preview-body {
  height: auto; min-height: 100%; overflow: auto;
  background: #eceef4;
  touch-action: auto;
}
body.preview-body {
  display: block; padding: 22px 16px 44px;
  font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.pv-bar {
  max-width: 900px; margin: 0 auto 20px;
  background: #fff; border-radius: 16px; padding: 16px 18px;
  box-shadow: 0 4px 18px rgba(30, 35, 60, .08);
  display: flex; flex-direction: column; gap: 12px;
}
.pv-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.pv-head h1 { font-size: 17px; font-weight: 800; color: #22232b; letter-spacing: .3px; }
.pv-head small { font-size: 12px; color: #9aa0ae; font-weight: 500; }
.pv-group { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.pv-group .label { font-size: 12px; color: #9aa0ae; margin-right: 2px; }
.pv-tabs button, .pv-size button, .pv-replay {
  border: 1px solid rgba(0,0,0,.10); background: #f6f7fb; color: #4a4f5c;
  font-size: 13px; font-weight: 700; padding: 9px 14px; border-radius: 10px;
  cursor: pointer; transition: all .15s ease; font-family: inherit;
}
.pv-tabs button:hover, .pv-size button:hover, .pv-replay:hover { background: #eef0f8; }
.pv-tabs button.on {
  background: linear-gradient(135deg, #7c5cff, #5c8fff); color: #fff; border-color: transparent;
  box-shadow: 0 4px 12px rgba(124, 92, 255, .32);
}
.pv-size button.on { background: #22232b; color: #fff; border-color: transparent; }
.pv-replay { background: #fff; border-color: rgba(124,92,255,.35); color: #6a4dff; }
.pv-stage { display: flex; justify-content: center; }
.pv-phone {
  position: relative; width: 390px; height: 780px;
  background: #fff; border-radius: 28px; overflow: hidden;
  box-shadow: 0 22px 55px rgba(24, 28, 48, .22), 0 0 0 8px #f8f9fc, 0 0 0 9px rgba(0,0,0,.06);
  transition: width .2s ease, height .2s ease;
}
.pv-phone .game-container {
  position: absolute; inset: 0; width: 100%; max-width: none; height: 100%;
  border-radius: 0; box-shadow: none; padding: 0; gap: 0;
}
.pv-phone .overlay { border-radius: 0; }
.pv-note { max-width: 900px; margin: 16px auto 0; font-size: 12px; color: #9aa0ae; text-align: center; line-height: 1.7; }
.pv-key { max-width: 900px; margin: 14px auto 0; background: rgba(255,255,255,.7); border-radius: 12px; padding: 12px 16px; font-size: 12px; color: #6c7280; line-height: 1.9; }
.pv-key b { color: #3d4250; }
@media (max-width: 460px) {
  .pv-phone { width: 100% !important; height: 700px; border-radius: 20px; }
}
`;

const bodyHtml = `
<header class="pv-bar">
  <div class="pv-head">
    <h1>结算画面预览</h1>
    <small>奶龙消消乐 · 与游戏内 1:1 同款样式（点按钮切换状态）</small>
  </div>
  <div class="pv-group">
    <span class="label">结算类型</span>
    <div class="pv-tabs" id="pv-tabs">
      <button data-state="clear3" class="on">三星通关</button>
      <button data-state="clear2">二星通关</button>
      <button data-state="clear1">一星通关</button>
      <button data-state="over">步数耗尽</button>
      <button data-state="complete">全通关毕业</button>
    </div>
  </div>
  <div class="pv-group">
    <span class="label">屏幕宽度</span>
    <div class="pv-size" id="pv-size">
      <button data-size="390" class="on">390 手机</button>
      <button data-size="560">560 宽屏</button>
    </div>
    <button class="pv-replay" id="pv-replay">↻ 重放动画</button>
  </div>
</header>

<main class="pv-stage">
  <div class="pv-phone" id="pv-phone">
    <div class="game-container" data-theme="grass">

      <div class="overlay" id="level-clear">
        <h2 class="title small">关卡完成</h2>
        <div class="stars-row" id="clear-stars">
          <span>★</span><span>★</span><span>★</span>
        </div>
        <div class="result-box">
          <p><span>本关得分</span><span style="display:flex;align-items:center;">
            <span id="clear-new-record" class="new-record-badge">新纪录</span>
            <b id="clear-score">0</b></span></p>
          <p><span>历史最高</span><b id="clear-high">0</b></p>
          <p><span>剩余步数</span><b id="clear-moves">0</b></p>
          <p><span>金币奖励</span><b id="clear-coins">+0</b></p>
        </div>
        <button class="btn-primary" id="btn-next-level">进入下一关</button>
        <button class="btn-secondary" id="btn-clear-home">返回主页</button>
      </div>

      <div class="overlay" id="game-over" style="display:none;">
        <h2 class="title small" id="game-over-title">步数耗尽</h2>
        <div class="result-box">
          <p><span>本局得分</span><b id="final-score">0</b></p>
          <p><span>历史最高</span><b id="final-high">0</b></p>
          <p><span>达到关卡</span><b id="final-level">1</b></p>
          <p><span>金币奖励</span><b id="final-coins">+0</b></p>
        </div>
        <button class="btn-primary" id="btn-restart">重新挑战</button>
        <button class="btn-secondary" id="btn-home">返回主页</button>
      </div>

      <div class="overlay" id="game-complete" style="display:none;">
        <h2 class="title small">🎉 恭喜全通关！</h2>
        <div class="complete-badge">
          <span class="icon">👑</span>
          <span class="text">消消乐大师</span>
        </div>
        <div class="result-box" style="width:85%;">
          <p style="justify-content:center;flex-direction:column;gap:8px;">
            <span style="font-size:13px;color:#666;">主线历史总得分</span>
            <b id="complete-total-score" style="font-size:30px;color:#ff8c00;">0</b>
          </p>
        </div>
        <button class="btn-secondary" id="btn-complete-home">回到主页</button>
      </div>

    </div>
  </div>
</main>

<div class="pv-key">
  <b>演示规则</b>：金币奖励 = max(10, 得分 ÷ 100)；星星按「得分阈值 或 剩余步数比例」计算（2 星线 30%、3 星线 60%）。<br>
  <b>交互</b>：切换状态会重放星星弹出动画；点「重放动画」可再触发一次。
</div>
<p class="pv-note">此文件仅用于预览结算画面，不影响游戏本体（改动游戏请编辑 nailong-match 项目）。</p>
`;

const script = `
<script>
(function () {
  var STATES = {
    clear3:   { panel: 'level-clear', stars: 3, score: 2680, high: 2680, moves: 9, coins: 26, record: true },
    clear2:   { panel: 'level-clear', stars: 2, score: 1840, high: 2450, moves: 6, coins: 18, record: false },
    clear1:   { panel: 'level-clear', stars: 1, score: 1060, high: 2450, moves: 2, coins: 10, record: false },
    over:     { panel: 'game-over',   score: 940, high: 2450, level: 5, coins: 3 },
    complete: { panel: 'game-complete', total: 48620 }
  };
  var panels = ['level-clear', 'game-over', 'game-complete'];
  var starEls = document.querySelectorAll('#clear-stars span');

  function render(key) {
    var d = STATES[key];
    panels.forEach(function (id) {
      document.getElementById(id).style.display = (id === d.panel) ? 'flex' : 'none';
    });

    if (d.panel === 'level-clear') {
      // 先清掉 on 再逐颗点亮，保证动画重放
      starEls.forEach(function (el) { el.classList.remove('on'); });
      document.getElementById('clear-score').textContent = d.score;
      document.getElementById('clear-high').textContent = d.high;
      document.getElementById('clear-moves').textContent = d.moves;
      document.getElementById('clear-coins').textContent = '+' + d.coins;
      document.getElementById('clear-new-record').style.display = d.record ? 'inline-flex' : 'none';
      setTimeout(function () {
        starEls.forEach(function (el, i) {
          if (i < d.stars) setTimeout(function () { el.classList.add('on'); }, 60 + i * 130);
        });
      }, 30);
    } else if (d.panel === 'game-over') {
      document.getElementById('final-score').textContent = d.score;
      document.getElementById('final-high').textContent = d.high;
      document.getElementById('final-level').textContent = d.level;
      document.getElementById('final-coins').textContent = '+' + d.coins;
    } else {
      document.getElementById('complete-total-score').textContent = d.total;
    }
  }

  var current = 'clear3';
  var tabs = document.getElementById('pv-tabs');
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    tabs.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
    current = b.dataset.state;
    render(current);
  });

  document.getElementById('pv-replay').addEventListener('click', function () {
    panels.forEach(function (id) { document.getElementById(id).style.display = 'none'; });
    setTimeout(function () { render(current); }, 40);
  });

  var phone = document.getElementById('pv-phone');
  document.getElementById('pv-size').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    this.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
    var w = Number(b.dataset.size);
    phone.style.width = w + 'px';
    phone.style.height = (w > 480 ? 800 : 780) + 'px';
  });

  render(current);
})();
</script>
`;

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>结算画面预览 · 奶龙消消乐</title>
<style>
${styleCss}
</style>
<style>
${themeCss}
</style>
<style>
${shellCss}
</style>
</head>
<body class="preview-body">
${bodyHtml}
${script}
</body>
</html>
`;

const out = path.join(process.env.USERPROFILE || 'C:/Users/buik', 'Desktop', '结算画面预览.html');
fs.writeFileSync(out, html, 'utf8');
console.log('written:', out, (html.length / 1024).toFixed(1) + 'KB');
