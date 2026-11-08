// 实测三处：① 存档账号面板 ② 忘记密码页没有提示 ③ 签到页今天不标补签
const http = require('http');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const list = JSON.parse(await new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: 9234, path: '/json/list' }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d));
    }).on('error', rej);
  }));
  const t = list.filter((x) => x.type === 'page')[0];
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  await new Promise((r) => ws.addEventListener('open', r));
  const send = (method, params) => new Promise((res) => { const mid = ++id; pend.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); return r.result && r.result.result && r.result.result.value; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync('_preview/' + name, Buffer.from(r.result.data, 'base64')); };
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('nl2:authSkip','1')}catch(e){}" });
  await send('Page.navigate', { url: 'http://127.0.0.1:8132/index.html?v=' + Date.now() });
  await sleep(2600);

  // ① 账号安全 → 存档账号
  console.log('1-save', await ev("(function(){" +
    "document.getElementById('btn-goto-account').click();" +
    "document.getElementById('btn-goto-save').click();" +
    "return JSON.stringify({open:document.getElementById('save-menu').style.display," +
    "cloud:!!document.getElementById('btn-goto-cloud'),backup:!!document.getElementById('btn-goto-backup')});" +
    "})()"));
  await sleep(250); await shot('final-1-save.png');
  // 点空白回账号安全
  console.log('1-back', await ev("(function(){document.getElementById('save-menu').click();return document.getElementById('account-menu').style.display;})()"));

  // ② 忘记密码页：没有「（换设备找回才要填）」和「填上名字…」
  console.log('2-forgot', await ev("(function(){" +
    "document.getElementById('account-menu').style.display='none';" +
    "document.getElementById('auth-menu').style.display='flex';" +
    "document.getElementById('btn-goto-login') ? document.getElementById('btn-goto-login').click() : document.querySelector('#auth-menu button').click();" +
    "document.getElementById('btn-auth-forgot').click();" +
    "const tip=document.getElementById('forgot-tip');const uidTip=document.getElementById('forgot-uid-tip');" +
    "return JSON.stringify({uidTipGone:!uidTip,tipHidden:!tip||tip.style.display==='none'||!tip.textContent});" +
    "})()"));
  await sleep(250); await shot('final-2-forgot.png');

  // ③ 签到页今天那格
  console.log('3-sign', await ev("(function(){" +
    "document.getElementById('auth-forgot').style.display='none';" +
    "document.getElementById('auth-menu').style.display='none';" +
    "document.getElementById('main-menu').style.display='flex';" +
    "document.getElementById('btn-welfare').click();" +
    "const cells=Array.from(document.getElementById('welfare-sign').children);" +
    "const tc=cells.filter(c=>String(c.className).indexOf('today')>=0)[0];" +
    "return JSON.stringify({cls:tc.className,html:tc.innerHTML,color:getComputedStyle(tc.querySelector('b')).color});" +
    "})()"));
  await sleep(250); await shot('final-3-sign.png');
  ws.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
