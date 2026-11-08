// 实测：自绘年/月/类型下拉（一次只开一个、点选项生效）+ 背包说明一行 + 截图
const http = require('http');
const fs = require('fs');
const PORT = 9225;

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
    console.log('register', await ev(`JSON.stringify(Account.register('下拉测试','123456'))`));
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

  // 点月份 → 列表打开
  console.log('pop1', await ev(`(function(){
    document.getElementById('ledger-month').click();
    var pop = document.getElementById('ledger-pop');
    return JSON.stringify({ open: pop.style.display, n: pop.children.length,
      first: pop.children[0] && pop.children[0].textContent,
      last: pop.children[11] && pop.children[11].textContent,
      lastOff: pop.children[11] && pop.children[11].className });
  })()`));
  await sleep(150);
  await shot('ledger-pop-month.png');

  // 不收起直接点年份 → 月份列表应该收起，只开年份
  console.log('pop2', await ev(`(function(){
    document.getElementById('ledger-year').click();
    var pop = document.getElementById('ledger-pop');
    var months = document.getElementById('ledger-month');
    return JSON.stringify({ open: pop.style.display, n: pop.children.length,
      firstOpt: pop.children[0] && pop.children[0].textContent,
      monthClosed: months.className.indexOf('is-open') < 0,
      yearOpen: document.getElementById('ledger-year').className.indexOf('is-open') >= 0 });
  })()`));

  // 再点年份自己 → 收起
  console.log('pop3', await ev(`(function(){
    document.getElementById('ledger-year').click();
    return JSON.stringify({ open: document.getElementById('ledger-pop').style.display });
  })()`));

  // 点类型 → 选「支出」→ 列表关掉、按键文字变、列表过滤
  console.log('type', await ev(`(function(){
    document.getElementById('ledger-type').click();
    var pop = document.getElementById('ledger-pop');
    var opts = Array.prototype.slice.call(pop.children);
    var exp = opts.filter(function(o){ return o.textContent === '支出'; })[0];
    exp.click();
    return JSON.stringify({ closed: document.getElementById('ledger-pop').style.display,
      btn: document.getElementById('ledger-type').textContent,
      rows: document.getElementById('ledger-list').children.length });
  })()`));

  // 退出再进：保留上次选择
  console.log('keep', await ev(`(function(){
    document.getElementById('coin-menu').click();
    var closed = document.getElementById('coin-menu').style.display;
    document.getElementById('menu-coins-row').click();
    return JSON.stringify({ closed: closed, type: document.getElementById('ledger-type').textContent,
      open: document.getElementById('coin-menu').style.display });
  })()`));

  // 背包：两行说明合并成一句
  console.log('bag', await ev(`(function(){
    document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; });
    var m = document.getElementById('main-menu'); if (m) m.style.display='flex';
    var b = document.getElementById('btn-backpack') || document.getElementById('btn-pack');
    if (!b) return 'no-btn';
    b.click();
    return 'ok';
  })()`));
  await sleep(300);
  console.log('bag-text', await ev(`JSON.stringify({
    descs: Array.prototype.slice.call(document.querySelectorAll('#backpack-menu small')).map(function(x){ return x.textContent; })
  })`));
  await sleep(150);
  await shot('backpack-oneline.png');
  ws.close();
})();
