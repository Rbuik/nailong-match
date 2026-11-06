const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'game.js'), 'utf8').split('\n');
const start = src.findIndex((l) => l.includes('function drawKeyMark('));
let depth = 0, started = false, end = -1;
// 往回去找注释块开头
let from = start;
for (let i = start - 1; i > start - 8 && i >= 0; i--) { from = i; if (src[i].trim().startsWith('// 钥匙徽标')) break; }
for (let i = start; i < src.length; i++) {
  for (const ch of src[i]) { if (ch === '{') { depth++; started = true; } else if (ch === '}') depth--; }
  if (started && depth === 0) { end = i; break; }
}
const fn = src.slice(from, end + 1).join('\n');
const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>钥匙样式预览</title>
<style>
 body{margin:0;padding:14px;font:13px/1.5 system-ui,"Segoe UI","Microsoft YaHei",sans-serif;background:#f6f1e6;color:#333}
 h2{font-size:13px;margin:0 0 8px;color:#666;font-weight:600}
 .wrap{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
 .cellbox{width:64px;height:64px;border-radius:12px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
 .big{width:180px;height:180px;border-radius:18px}
 canvas{display:block}
</style></head><body>
<h2>新版钥匙（银蓝菱形柄）在深 / 中 / 浅底上的样子</h2>
<div class="wrap" id="row1"></div>
<h2>放大 3 倍</h2>
<div class="wrap" id="row3"></div>
<h2>实际棋盘尺寸 34px（小格）</h2>
<div class="wrap" id="row4"></div>
<script>
${fn}
const ctx2 = {};
function make(bg, cell, scale, parent) {
  const d = document.createElement('div');
  d.className = 'cellbox' + (cell > 100 ? ' big' : '');
  if (cell > 100) { d.style.width = cell + 'px'; d.style.height = cell + 'px'; }
  d.style.background = bg;
  const cv = document.createElement('canvas');
  const dpr = 2;
  cv.width = cell * dpr; cv.height = cell * dpr;
  cv.style.width = cell + 'px'; cv.style.height = cell + 'px';
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  d.appendChild(cv);
  parent.appendChild(d);
  g.save(); g.translate(cell / 2, cell / 2); g.scale(scale, scale);
  drawKeyMark(g, cell, 0.75);
  g.restore();
}
const bgs = ['#2d3a63', '#6f5fa8', '#f2e7d0', '#3f8a68', '#d8546b'];
bgs.forEach((b) => make(b, 64, 1, document.getElementById('row1')));
['#2d3a63', '#f2e7d0'].forEach((b) => make(b, 180, 1, document.getElementById('row3')));
bgs.forEach((b) => make(b, 34, 1, document.getElementById('row4')));
</script></body></html>`;
fs.writeFileSync(path.join(__dirname, 'cargo2.html'), html);
console.log('ok', from, end);
