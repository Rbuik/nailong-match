// 用 CDP 在真页面里量金币明细的布局（无头 Chrome，不写任何公共服务）
const http = require('http');

function get(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9223, path }, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(d));
    }).on('error', rej);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let target = null;
  for (let i = 0; i < 40; i++) {
    try {
      await get('/json/version');
      break;
    } catch (e) { await sleep(250); }
  }
  const list = JSON.parse(await get('/json/list'));
  target = list.filter((t) => t.type === 'page')[0] || JSON.parse(await get('/json/new?http://127.0.0.1:8123/index.html'));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8123/index.html' });
  await sleep(2500);
  console.log('login?', await evaluate('typeof Account !== "undefined" && !!Account.current()'));
  console.log('reg', await evaluate('JSON.stringify(Account.register("布局测试","123456"))'));
  await evaluate('location.reload()');
  await sleep(2500);
  console.log('after reload login?', await evaluate('!!Account.current()'));

  await evaluate(`(function(){
    Store.addCoins(120, '测试收入');
    Store.spendCoins(150, '购买道具', '洗牌 +1');
    Store.addCoins(60, '成就奖励', '连击狂人 · 金');
    var arr = JSON.parse(localStorage.getItem('nl2:ledger'));
    arr.push({ t: new Date(new Date().getFullYear()-1, new Date().getMonth(), 15).getTime(), d: 80, m: '去年收入' });
    localStorage.setItem('nl2:ledger', JSON.stringify(arr));
    document.getElementById('menu-coins-row').click();
    return 'ok';
  })()`);
  await sleep(600);

  const geo = await evaluate(`(function(){
    var bar = document.querySelector('.ledger-bar');
    var sels = bar.querySelectorAll('.ledger-sel');
    var out = [];
    for (var i=0;i<sels.length;i++){ var r=sels[i].getBoundingClientRect(); out.push({id:sels[i].id, x:Math.round(r.x), w:Math.round(r.width), h:Math.round(r.height), val: sels[i].value, txt: sels[i].options[sels[i].selectedIndex] && sels[i].options[sels[i].selectedIndex].text}); }
    var list = document.getElementById('ledger-list').getBoundingClientRect();
    var row = document.querySelector('.ledger-row').getBoundingClientRect();
    var det = document.querySelector('.ledger-detail');
    var detS = det ? getComputedStyle(det) : null;
    var more = document.querySelector('.menu-coins-more');
    var num = document.getElementById('menu-coins');
    var wrapChildren = Array.prototype.map.call(document.querySelector('.menu-coins-wrap').children, function(c){return c.tagName+'.'+c.className;});
    return JSON.stringify({ sels: out, barW: Math.round(bar.getBoundingClientRect().width), listW: Math.round(list.width), rowW: Math.round(row.width),
      det: det ? { size: detS.fontSize, weight: detS.fontWeight, color: detS.color } : null,
      detailBeforeMemo: det ? (det.nextSibling && String(det.nextSibling.textContent).length > 0) : null,
      arrowFirst: wrapChildren, coins: num.textContent, menuCoinsDisplay: !!num });
  })()`);
  console.log('geo', geo);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  require('fs').writeFileSync('D:/nailong-match/_preview/coin-ledger3.png', Buffer.from(shot.result.data, 'base64'));
  console.log('shot ok');
  ws.close();
})();
