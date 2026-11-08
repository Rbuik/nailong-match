// 实测：局榜以「这一关有没有通关」为准——没通关的（灰色）垫底、名次「—」，通关的照常排名
// 数据全部写在本机 localStorage，ntfy.sh 被解析到 127.0.0.1:1，不会碰公共频道
const http = require('http');
const fs = require('fs');
const PORT = 9227;

function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(d));
    }).on('error', rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const list = JSON.parse(await get('/json/list'));
  const t = list.filter((x) => x.type === 'page')[0];
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const pend = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params) => new Promise((res) => {
    const mid = ++id;
    pend.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    const v = r.result && r.result.result;
    return v && 'value' in v ? v.value : JSON.stringify(r.result);
  };
  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('D:/nailong-match/_preview/' + name, Buffer.from(s.result.data, 'base64'));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 860, deviceScaleFactor: 2, mobile: false });

  await send('Page.navigate', { url: 'http://127.0.0.1:8125/index.html' });
  await sleep(2600);
  if (!(await ev('!!Account.current()'))) {
    console.log('register', await ev(`JSON.stringify(Account.register('通关测试','123456'))`));
    await sleep(600);
    await send('Page.navigate', { url: 'http://127.0.0.1:8125/index.html' });
    await sleep(2600);
  }

  // 我：第 1 关通关（3 星）、第 2 关（收集关）通关（1 星），第 2 关 1300 分
  console.log('setup', await ev(`(function(){
    Store.recordLevel(1, 1200, 3);
    Store.recordLevel(2, 1300, 1);
    Store.markPlayed(2);
    // 假榜单：写本机缓存（不会被发到公共频道）
    var list = [
      // 通关了第 2 关（有星级表），分数不高 → 正常排名
      { uid: 'rival101', name: '通关低分', score: 1300, level: 2, ts: Date.now()-3e6, pv: 'gd', lv: { 1: 4000, 2: 1300 }, st: { 1: 3, 2: 1 } },
      // 没通关第 2 关，分数刷到 9000 → 灰色垫底
      { uid: 'rival102', name: '没通关', score: 9000, level: 2, ts: Date.now()-2e6, pv: 'gd', lv: { 1: 3000, 2: 9000 }, st: { 1: 2 } },
      // 通关了第 2 关（3 星），分数 4200 → 第一名
      { uid: 'rival103', name: '高分通关', score: 4200, level: 2, ts: Date.now()-1e6, pv: 'gd', lv: { 1: 5000, 2: 4200 }, st: { 1: 3, 2: 3 } },
      // 只打过第 1 关的（第 2 关根本没记录）→ 不该出现在第 2 关榜上
      { uid: 'rival104', name: '没打过', score: 2000, level: 1, ts: Date.now()-4e6, pv: 'gd', lv: { 1: 2000 }, st: { 1: 1 } }
    ];
    localStorage.setItem('nl2:lbshare2', JSON.stringify({ ts: Date.now(), list: list }));
    return 'ok';
  })()`));
  // Board 只在页面启动时读缓存：写完假榜单重载一次
  await send('Page.navigate', { url: 'http://127.0.0.1:8125/index.html' });
  await sleep(2600);

  console.log('open', await ev(`(function(){
    document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; });
    document.getElementById('main-menu').style.display = 'flex';
    document.getElementById('btn-leaderboard').click();
    document.getElementById('btn-lb-hub-level').click();
    document.getElementById('lb-level-swap').click();
    var pick = Array.prototype.slice.call(document.getElementById('lb-picker').children)
      .filter(function(b){ return b.textContent === '第 2 关'; })[0];
    if (pick) pick.click();
    var rows = Array.prototype.slice.call(document.getElementById('lb-list').children);
    var out = rows.map(function(r){ return {
      cls: r.className,
      rank: (r.querySelector('.lb-rank') || {}).textContent,
      name: (r.querySelector('.lb-name') || {}).textContent,
      stars: (r.querySelector('.lb-stars') || {}).textContent,
      score: (r.querySelector('.lb-score') || {}).textContent,
      color: (r.querySelector('.lb-score') ? getComputedStyle(r.querySelector('.lb-score')).color : '')
    }; });
    return JSON.stringify(out);
  })()`));
  await sleep(300);
  await shot('lb-pass.png');
  ws.close();
})();
