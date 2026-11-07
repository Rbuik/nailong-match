// 一次性脚本：生成 8 章章节地图预览图（复用真实 CSS 与 renderChapterMap 的同款结构）
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'js', 'levels.json'), 'utf8'));

const starsOf = (lv) => ((lv * 7 + 3) % 4 === 0 ? 0 : ((lv * 5 + 1) % 3) + 1);   // 假进度：大多数关 1~3 星

const cards = data.chapters.map((ch) => {
  let stars = 0;
  let cells = '';
  for (let lv = ch.from; lv <= ch.to; lv++) {
    const st = starsOf(lv);
    stars += st;
    cells += `<button class="level-chip${st ? ' done' : ''}"><b>${lv}</b><i>${'★★★'.slice(0, st) || '·'}</i></button>`;
  }
  return `<div class="chapter-card">
    <div class="chapter-head">
      <span class="chapter-emoji">${ch.emoji}</span>
      <span class="chapter-name">${ch.name}</span>
      <span class="chapter-stars">⭐ ${stars}/${(ch.to - ch.from + 1) * 3}</span>
    </div>
    <div class="chapter-grid">${cells}</div>
  </div>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="../css/style.css">
<link rel="stylesheet" href="../css/themes.css">
<style>
  body{background:#f6f2e8;margin:0;padding:12px 10px 20px;font-family:system-ui,"Microsoft YaHei",sans-serif;}
  .overlay{position:static;display:flex;width:100%;max-width:430px;margin:0 auto 4px;padding:14px 12px 16px;box-sizing:border-box;}
  .chapters-list{max-height:none;}
  .cap{max-width:430px;margin:14px auto 0;font:12px/1.6 system-ui,"Microsoft YaHei",sans-serif;color:#8b84a0;}
</style></head><body>
<div class="cap">🗺️ 章节地图预览（共 8 章 · 80 关，进度为示例）</div>
<div class="overlay" id="chapters-menu">
  <h2 class="title small">🗺️ 章节地图</h2>
  <div class="chapters-list" id="chapters-list">${cards}</div>
  <button class="btn-secondary" id="btn-close-chapters">返回</button>
</div>
</body></html>`;

fs.writeFileSync(path.join(__dirname, '_preview', 'chapters-map.html'), html, 'utf8');
console.log('written _preview/chapters-map.html');
