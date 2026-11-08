// 实测「忘记密码」流程：登录页入口 → 面板 → 本机自动认号（身份码自动填）→ 重设 → 进游戏
// 只动本机 localStorage；pages.dev 与 ntfy.sh 都解析到 127.0.0.1:1，绝不碰线上数据
const http = require('http');
const fs = require('fs');
const PORT = 9232;

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

  await send('Page.navigate', { url: 'http://127.0.0.1:8130/index.html' });
  await sleep(2400);

  // 预置一个「本机已有、但没登录」的账号（密码 abcd1234）
  console.log('seed', await ev(`(function(){
    localStorage.clear();
    const acc = { id: 'pf0rgot1a2b3c', name: '忘记测试', pass: Account.hash('abcd1234'), created: Date.now() - 864e5, last: Date.now() - 3600e3 };
    localStorage.setItem('nl2:accounts', JSON.stringify([acc]));
    localStorage.setItem('nl2:acc:pf0rgot1a2b3c', JSON.stringify({ savedAt: Date.now() - 3600e3, keys: { 'nl2:progress': JSON.stringify({ '1': { stars: 3, score: 4200 } }) } }));
    return 'ok';
  })()`));
  await send('Page.navigate', { url: 'http://127.0.0.1:8130/index.html' });
  await sleep(2400);

  // 1) 登录页 → 登录表单
  console.log('1-login-form', await ev(`(function(){
    document.getElementById('btn-auth-login').click();
    return JSON.stringify({
      menu: document.getElementById('auth-menu').style.display,
      form: document.getElementById('auth-form').style.display,
      forgot: document.getElementById('btn-auth-forgot').style.display,
      text: document.getElementById('btn-auth-forgot').textContent
    });
  })()`));
  await sleep(300);
  await shot('forgot-1-login.png');

  // 注册里不该出现「忘记密码？」
  console.log('1b-register-hide', await ev(`(function(){
    document.getElementById('auth-menu').style.display='flex';
    document.getElementById('btn-auth-register').click();
    const d = document.getElementById('btn-auth-forgot').style.display;
    document.getElementById('auth-menu').style.display='none';
    document.getElementById('btn-auth-login').click();
    return d;
  })()`));
  await sleep(200);

  // 2) 打开忘记密码
  console.log('2-open', await ev(`(function(){
    document.getElementById('btn-auth-forgot').click();
    const f = document.getElementById('auth-forgot');
    return JSON.stringify({
      form: document.getElementById('auth-form').style.display,
      forgot: f.style.display,
      tip: document.getElementById('forgot-tip').textContent
    });
  })()`));
  await sleep(300);
  await shot('forgot-2-empty.png');

  // 3) 输入本机已有的名字：身份码自动填、提示改成「本机认出了」
  console.log('3-autofill', await ev(`(function(){
    const n = document.getElementById('forgot-name');
    n.value = '忘记测试';
    n.dispatchEvent(new Event('input', { bubbles: true }));
    return JSON.stringify({
      uid: document.getElementById('forgot-uid').value,
      ro: document.getElementById('forgot-uid').readOnly,
      uidTip: document.getElementById('forgot-uid-tip').textContent,
      tip: document.getElementById('forgot-tip').textContent
    });
  })()`));
  await sleep(200);
  await shot('forgot-3-local.png');

  // 4) 两次密码不一致 → 报错
  console.log('4-mismatch', await ev(`(function(){
    document.getElementById('forgot-pass').value = 'newpass999';
    document.getElementById('forgot-pass2').value = 'newpass000';
    document.getElementById('btn-forgot-submit').click();
    return document.getElementById('forgot-err').textContent;
  })()`));
  await sleep(300);
  await shot('forgot-4-mismatch.png');

  // 5) 重设成功 → 进主页
  console.log('5-submit', await ev(`(function(){
    document.getElementById('forgot-pass2').value = 'newpass999';
    document.getElementById('btn-forgot-submit').click();
    return 'sent';
  })()`));
  await sleep(2200);
  console.log('5-result', await ev(`(function(){
    const acc = Account.find('pf0rgot1a2b3c');
    return JSON.stringify({
      forgot: document.getElementById('auth-forgot').style.display,
      main: document.getElementById('main-menu').style.display,
      cur: Account.currentId(),
      curRaw: localStorage.getItem('nl2:cur'),
      logged: Account.loggedIn(),
      accs: (Account.list() || []).length,
      hasSkip: !!localStorage.getItem('nl2:authSkip'),
      passOk: acc && acc.pass === Account.hash('newpass999'),
      oldPassBad: acc && acc.pass !== Account.hash('abcd1234'),
      nick: document.getElementById('menu-nick') ? document.getElementById('menu-nick').textContent : '',
      view: document.body.dataset.view
    });
  })()`));
  await shot('forgot-5-done.png');

  // 6) 本机没有这个名字：提示要身份码
  console.log('6-unknown', await ev(`(function(){
    Account.logout();
    document.getElementById('auth-forgot').style.display = 'none';
    document.getElementById('auth-menu').style.display = 'flex';
    document.getElementById('btn-auth-login').click();
    document.getElementById('btn-auth-forgot').click();
    const n = document.getElementById('forgot-name');
    n.value = '查无此人';
    n.dispatchEvent(new Event('input', { bubbles: true }));
    return JSON.stringify({
      uid: document.getElementById('forgot-uid').value,
      ro: document.getElementById('forgot-uid').readOnly,
      tip: document.getElementById('forgot-tip').textContent
    });
  })()`));
  await sleep(250);
  await shot('forgot-6-unknown.png');

  // 7) 账号安全页显示身份码
  console.log('7-account', await ev(`(function(){
    document.getElementById('auth-forgot').style.display='none';
    document.getElementById('auth-menu').style.display='none';
    if (Account.login('忘记测试','newpass999').ok) {
      const cm = document.getElementById('cloud-menu');
      if (cm) cm.style.display = 'none';
      document.getElementById('btn-goto-account').click();
      return JSON.stringify({
        uid: document.getElementById('account-uid').textContent,
        name: document.getElementById('account-cur-name').textContent
      });
    }
    return 'login-fail';
  })()`));
  await sleep(300);
  await shot('forgot-7-account.png');

  ws.close();
})().catch((e) => { console.error('ERR', e && e.message); process.exit(1); });
