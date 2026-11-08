// 实测：自绘年/月/类型下拉的宽度与位置跟当前按键对齐 + 商店两行 / 背包一行
const http = require('http');
const fs = require('fs');
const PORT = 9226;

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
    console.log('register', await ev(`JSON.stringify(Account.register('对齐测试','123456'))`));
    await sleep(600);
    await send('Page.navigate', { url: 'http://127.0.0.1:8125/index.html' });
    await sleep(2600);
  }

  console.log('open', await ev(`(function(){
    document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; });
    var m = document.getElementById('main-menu'); if (m) m.style.display='flex';
    document.getElementById('menu-coins-row').click();
    return document.getElementById('coin-menu').style.display;
  })()`));
  await sleep(300);

  const measure = (kind, btnId) => `(function(){
    document.getElementById('${btnId}').click();
    var pop = document.getElementById('ledger-pop');
    var btn = document.getElementById('${btnId}');
    var a = btn.getBoundingClientRect(), b = pop.getBoundingClientRect();
    return JSON.stringify({ kind: '${kind}', open: pop.style.display, n: pop.children.length,
      btn: [Math.round(a.left), Math.round(a.width)], pop: [Math.round(b.left), Math.round(b.width)],
      sameLeft: Math.abs(a.left - b.left) < 1.5, sameWidth: Math.abs(a.width - b.width) < 1.5,
      gap: Math.round(b.top - a.bottom) });
  })()`;

  console.log('month', await ev(measure('month', 'ledger-month')));
  await sleep(150);
  await shot('popalign-month.png');
  console.log('year', await ev(measure('year', 'ledger-year')));
  await sleep(150);
  await shot('popalign-year.png');
  console.log('type', await ev(measure('type', 'ledger-type')));
  await sleep(150);
  await shot('popalign-type.png');

  // 商店：卡片说明应该是两行；背包：一句话
  console.log('shop', await ev(`(function(){
    document.getElementById('ledger-type').click();   // 先收起列表
    document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; });
    document.getElementById('main-menu').style.display='flex';
    document.getElementById('btn-goto-shop').click();
    var d = document.querySelectorAll('#shop-list .shop-card-desc');
    return JSON.stringify(Array.prototype.slice.call(d).map(function(x){
      return { text: x.textContent, brs: (x.innerHTML.match(/<br>/g) || []).length };
    }).slice(0, 8));
  })()`));
  await sleep(150);
  await shot('shop-twoline.png');

  console.log('bag', await ev(`(function(){
    document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; });
    document.getElementById('main-menu').style.display='flex';
    Store.addItem('startFrost', 2); Store.addItem('startMagnet', 1); Store.addItem('shuffle', 1);
    document.getElementById('btn-backpack-home').click();
    var d = document.querySelectorAll('#backpack-menu small');
    return JSON.stringify(Array.prototype.slice.call(d).map(function(x){ return x.textContent; }));
  })()`));
  await sleep(150);
  await shot('backpack-oneline2.png');
  ws.close();
})();
