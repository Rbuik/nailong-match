// 实测：主页金币箭头位置 + 46 关目标栏新文案
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
  await send('Page.navigate', { url: 'http://127.0.0.1:8125/index.html' });
  await sleep(2600);
  if (!(await ev('!!Account.current()'))) {
    await ev(`Account.register('目标栏测试','123456')`);
    await sleep(600);
    await send('Page.navigate', { url: 'http://127.0.0.1:8125/index.html' });
    await sleep(2600);
  }

  // 1. 主页金币行几何：金币› 与 数字 的相对位置
  await ev(`document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; });
    var m = document.getElementById('main-menu'); if (m) m.style.display='flex'; 'ok'`);
  console.log('coins-row', await ev(`(function(){
    var row = document.getElementById('menu-coins-row');
    var label = row.querySelector('span');
    var num = document.getElementById('menu-coins');
    var a = label.getBoundingClientRect(), b = num.getBoundingClientRect();
    return JSON.stringify({ labelRight: Math.round(a.right), numLeft: Math.round(b.left),
      arrowRightNextToLabel: Math.round(b.left) > Math.round(a.right) });
  })()`));
  await shot('coins-arrow.png');

  // 2. 第 46 关目标栏
  console.log('bar', await ev(`(function(){
    __nl_test.start(46);
    return document.getElementById('target-bar').textContent;
  })()`));
  await sleep(900);
  await ev(`document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; }); 'ok'`);
  console.log('bar2', await ev(`document.getElementById('target-bar').textContent`));
  await shot('target-bar-46.png');
  ws.close();
})();
