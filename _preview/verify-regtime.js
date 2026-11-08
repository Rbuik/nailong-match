// 实测：换设备登录后「注册时间」要按服务器上的真实建号时间，而不是本机登录那一刻
// 本机账号的 created 故意写成「现在」，Cloud.pull 用桩返回 2026-11-06 19:18
// —— 修正后：注册时间回到 11-06，邮箱里 11-08 的公告不再被「建号之前」过滤掉
const http = require('http');
const fs = require('fs');
const PORT = 9233;

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
  await send('Page.navigate', { url: 'http://127.0.0.1:8132/index.html' });
  await sleep(2400);

  // 本机账号：created = 现在（模拟「换设备后登录，本机新建账号」的错误状态）
  console.log('seed', await ev(`(function(){
    localStorage.clear();
    const acc = { id: 'pregtime1a2b3c', name: '注册时间测试', pass: Account.hash('abcd1234'), created: Date.now(), last: Date.now(), cloud: 1, ctoken: 'stub-token' };
    localStorage.setItem('nl2:accounts', JSON.stringify([acc]));
    localStorage.setItem('nl2:cur', JSON.stringify('pregtime1a2b3c'));
    localStorage.setItem('nl2:muid', JSON.stringify('pregtime1a2b3c'));
    localStorage.setItem('nl2:mnick', JSON.stringify('注册时间测试'));
    return 'ok';
  })()`));
  await send('Page.navigate', { url: 'http://127.0.0.1:8132/index.html' });
  await sleep(2400);

  // 修正前：注册时间显示今天，邮箱少了 11-08 11:30 的公告
  console.log('before', await ev(`(function(){
    document.getElementById('btn-mail').click();
    return JSON.stringify({
      created: Account.current().created,
      createdText: new Date(Account.current().created).toLocaleString('zh-CN'),
      mails: Mail.list().map(function(m){ return m.title; })
    });
  })()`));
  await sleep(300);
  await shot('regtime-1-before.png');

  // 服务器说这个号是 11-06 19:18 建的
  console.log('pull', await ev(`(function(){
    const ts = new Date('2026-11-06T19:18:00+08:00').getTime();
    Cloud.pull = function(){ return Promise.resolve({ ok:true, nick:'注册时间测试', uid:'pregtime1a2b3c', created: ts, slot: null }); };
    return Account.pullCloud().then(function(ok){
      return JSON.stringify({
        ok: ok,
        created: Account.current().created,
        createdText: new Date(Account.current().created).toLocaleString('zh-CN'),
        mails: Mail.list().map(function(m){ return m.title; })
      });
    });
  })()`));

  // 邮箱重新渲染
  console.log('after-mail', await ev(`(function(){
    document.getElementById('mail-menu').style.display = 'none';
    document.getElementById('btn-mail').click();
    return JSON.stringify({
      rows: document.querySelectorAll('#mail-list .mail-row').length,
      titles: Array.prototype.map.call(document.querySelectorAll('#mail-list .mail-title'), function(x){ return x.textContent; })
    });
  })()`));
  await sleep(300);
  await shot('regtime-2-mail.png');

  // 账号安全页的注册时间
  console.log('account-page', await ev(`(function(){
    document.getElementById('mail-menu').style.display='none';
    document.getElementById('btn-goto-account').click();
    return JSON.stringify({
      created: document.getElementById('account-created').textContent,
      name: document.getElementById('account-cur-name').textContent
    });
  })()`));
  await sleep(300);
  await shot('regtime-3-account.png');

  ws.close();
})().catch((e) => { console.error('ERR', e && e.message); process.exit(1); });
