// 实测：局内工具栏新增 🛒 商店（位置 / 是否溢出）+ 点开商店 + 明细里任务/续命的说明
const http = require('http');
const fs = require('fs');
const PORT = 9228;

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
  await send('Page.navigate', { url: 'http://127.0.0.1:8125/index.html' });
  await sleep(2600);
  if (!(await ev('!!Account.current()'))) {
    await ev(`Account.register('商店按钮测试','123456')`);
    await sleep(600);
    await send('Page.navigate', { url: 'http://127.0.0.1:8125/index.html' });
    await sleep(2600);
  }

  // 开局
  await ev(`document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; });
    document.getElementById('btn-play').click(); 'ok'`);
  await sleep(1400);

  // 1. 工具栏几何：五个按键顺序 & 行是否溢出
  console.log('tools', await ev(`(function(){
    var ids = ['btn-music-game','btn-backpack-game','btn-shop-game','btn-rules-game','btn-settings-game'];
    var rects = ids.map(function(i){ var e=document.getElementById(i); var r=e?e.getBoundingClientRect():null;
      return { id:i, left: r?Math.round(r.left):-1, right: r?Math.round(r.right):-1, w: r?Math.round(r.width):0, h: r?Math.round(r.height):0 }; });
    var row = document.querySelector('.tools-row').getBoundingClientRect();
    var strip = document.getElementById('preview-strip').getBoundingClientRect();
    var overflow = ids.some(function(i){ var r=document.getElementById(i).getBoundingClientRect(); return r.right > row.right + 1 || r.left < row.left - 1; });
    var overlap = strip.right > rects[1].left - 1;
    return JSON.stringify({ row:{left:Math.round(row.left),right:Math.round(row.right)},
      strip:{left:Math.round(strip.left),right:Math.round(strip.right),w:Math.round(strip.width)},
      rects: rects, overflow: overflow, stripOverlap: overlap, icon: document.querySelector('#btn-shop-game .icon').textContent,
      title: document.getElementById('btn-shop-game').title });
  })()`));

  await ev(`document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; }); 'ok'`);
  await shot('shop-btn-row.png');

  console.log('state-before', await ev(`(function(){
    var st = window.__nl_test && window.__nl_test.state ? window.__nl_test.state() : null;
    return JSON.stringify({ playing: st && st.playing, paused: st && st.paused, undef: !st });
  })()`));

  // 2. 点游戏界面的 🛒：应打开同一个商店
  await ev(`document.getElementById('btn-shop-game').click(); 'ok'`);
  await sleep(700);
  console.log('shop', await ev(`(function(){
    var s = document.getElementById('shop-menu');
    var cards = document.querySelectorAll('#shop-list .shop-card').length;
    return JSON.stringify({ display: s.style.display, cards: cards,
      coins: document.getElementById('shop-coins').textContent,
      view: document.body.dataset.view });
  })()`));
  await shot('shop-from-game.png');

  // 点空白关掉商店：应回到棋盘
  await ev(`document.getElementById('shop-menu').click(); 'ok'`);
  await sleep(500);
  console.log('closed', await ev(`(function(){
    return JSON.stringify({ shop: document.getElementById('shop-menu').style.display,
      view: document.body.dataset.view,
      board: document.getElementById('game').getBoundingClientRect().width > 100 });
  })()`));
  await ev(`document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; }); 'ok'`);
  await shot('shop-closed.png');

  // 3. 金币明细：造一条「每日任务」+ 一条「续命」记录，看右边小字
  console.log('ledger', await ev(`(function(){
    Store.addCoins(500, '每日任务', '完成 3 局游戏');
    Store.spendCoins(50, '续命', '第 46 关');
    Store.addCoins(20, '每日任务', '通过 1 关');
    return 'ok';
  })()`));
  await ev(`document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; });
    document.getElementById('main-menu').style.display='flex';
    document.getElementById('menu-coins-row').click(); 'ok'`);
  await sleep(600);
  console.log('rows', await ev(`(function(){
    var out = [];
    var list = document.getElementById('ledger-list');
    Array.prototype.forEach.call(list.children, function(row, i){
      if (i > 6) return;
      out.push(row.textContent.replace(/\\s+/g,' ').trim());
    });
    return JSON.stringify(out);
  })()`));
  await shot('ledger-detail2.png');
  ws.close();
})();
