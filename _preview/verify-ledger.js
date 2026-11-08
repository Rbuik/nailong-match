// 用无头 Chrome 实测：历史收支补记 / 下拉不被重建（不闪退）/ 退出再进保留筛选 / 邮件文案
const http = require('http');
const fs = require('fs');
const PORT = 9224;

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
  await send('Runtime.enable');

  await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html' });
  await sleep(2500);
  console.log('account', await ev(`JSON.stringify(Account.current() && { n: Account.current().name, c: Account.current().created })`));
  if (!(await ev('!!Account.current()'))) {
    console.log('register', await ev(`JSON.stringify(Account.register('明细测试','123456'))`));
    await sleep(600);
  }

  // 造数据：建号 11-05、余额 400、明细里只有今天的一笔支出 50
  console.log('seed', await ev(`(function(){
    var acc = Account.current();
    var arr = JSON.parse(localStorage.getItem('nl2:accounts') || '[]');
    arr.forEach(function(a){ if (a.id === acc.id) a.created = new Date(2026, 10, 5, 10, 0, 0).getTime(); });
    localStorage.setItem('nl2:accounts', JSON.stringify(arr));
    localStorage.setItem('nl2:wallet', JSON.stringify({ coins: 400, items: {} }));
    localStorage.setItem('nl2:ledger', JSON.stringify([{ t: Date.now(), d: -50, m: '购买道具', x: '洗牌 +1' }]));
    localStorage.removeItem('nl2:ledgerInit');
    localStorage.removeItem('nl2:ledgerTop');
    Account.saveCurrent && Account.saveCurrent();
    return 'ok';
  })()`));
  await sleep(300);
  await send('Page.navigate', { url: 'http://127.0.0.1:8124/index.html' });
  await sleep(2500);

  console.log('open', await ev(`(function(){
    document.querySelectorAll('.overlay').forEach(function(o){ o.style.display='none'; });
    var m = document.getElementById('main-menu'); if (m) m.style.display='flex';
    document.getElementById('menu-coins-row').click();
    return document.getElementById('coin-menu').style.display;
  })()`));
  await sleep(300);

  console.log('rows', await ev(`document.getElementById('ledger-list').innerText.replace(/\\n/g,' | ')`));
  console.log('sum', await ev(`JSON.stringify({
    ledgerSum: Store.getLedger().reduce(function(a,x){return a+x.d;},0),
    coins: Store.getWallet().coins,
    history: Store.getLedger().filter(function(x){return x.m==='历史收支';}).map(function(x){return new Date(x.t).toISOString()+' d='+x.d;})
  })`));

  // 切到 11 月 / 10 月：历史收支应该在 11-05 那一月
  console.log('nov', await ev(`(function(){
    var ms = document.getElementById('ledger-month');
    ms.value='11'; ms.dispatchEvent(new Event('change'));
    var nov = document.getElementById('ledger-list').innerText.replace(/\\n/g,' | ');
    ms.value='10'; ms.dispatchEvent(new Event('change'));
    var oct = document.getElementById('ledger-list').innerText.replace(/\\n/g,' | ');
    ms.value='11'; ms.dispatchEvent(new Event('change'));
    return JSON.stringify({ nov: nov, oct: oct });
  })()`));

  // 下拉选项对象身份：换年份前后同一个 option（说明没被重建，不会让打开的下拉闪退）
  console.log('identity', await ev(`(function(){
    var ms = document.getElementById('ledger-month');
    var before = ms.children[5];
    var ys = document.getElementById('ledger-year');
    var y0 = ys.value;
    ys.value = String(Number(y0) - 1); ys.dispatchEvent(new Event('change'));
    var mid = ms.children[5];
    ys.value = y0; ys.dispatchEvent(new Event('change'));
    var after = ms.children[5];
    var m2 = document.getElementById('ledger-month');
    var mBefore = m2.children[3];
    m2.value = '03'; m2.dispatchEvent(new Event('change'));
    var mAfter = m2.children[3];
    return JSON.stringify({ monthSameAcrossYear: before === mid && mid === after, monthSameAcrossMonth: mBefore === mAfter });
  })()`));

  // 退出再进来：保留上次的年月 / 类型
  console.log('keep', await ev(`(function(){
    var ms = document.getElementById('ledger-month');
    var ts = document.getElementById('ledger-type');
    ms.value='10'; ms.dispatchEvent(new Event('change'));
    ts.value='expense'; ts.dispatchEvent(new Event('change'));
    document.getElementById('coin-menu').click();               // 点空白退出
    var closed = document.getElementById('coin-menu').style.display;
    document.getElementById('menu-coins-row').click();          // 再进来
    return JSON.stringify({ closed: closed, month: ms.value, type: ts.value, open: document.getElementById('coin-menu').style.display });
  })()`));

  // 邮件文案
  console.log('mail', await ev(`(function(){
    var m = Mail.get('notice-ledger-2026-11-08');
    return JSON.stringify({ found: !!m, hasOld: m ? m.body.indexOf('不会让你选到未来的月份') >= 0 : null,
      hasHist: m ? m.body.indexOf('历史收支') >= 0 : null, body: m ? m.body : '' });
  })()`));

  await ev(`(function(){
    var ts = document.getElementById('ledger-type'); ts.value='all'; ts.dispatchEvent(new Event('change'));
    var ms = document.getElementById('ledger-month'); ms.value='11'; ms.dispatchEvent(new Event('change'));
    return 'ok';
  })()`);
  await sleep(200);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('D:/nailong-match/_preview/coin-ledger6.png', Buffer.from(shot.result.data, 'base64'));
  ws.close();
})();
