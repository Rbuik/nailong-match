// 实测：账号安全页「身份号码」+ 下面的提示行排版
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
    const cdp = JSON.stringify({ captureBeyondViewport: false });
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('_preview/' + name, Buffer.from(r.result.data, 'base64'));
  };

  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8132/index.html?v=' + Date.now() });
  await sleep(2600);

  console.log('layout', await ev(`(function(){
    document.getElementById('btn-goto-account').click();
    const box = document.querySelector('#account-menu .result-box');
    const uid = document.getElementById('account-uid');
    const note = document.querySelector('#account-menu .uid-note');
    const rb = box.getBoundingClientRect(), nb = note.getBoundingClientRect(), ub = uid.getBoundingClientRect();
    return JSON.stringify({
      label: box.children[2].children[0].textContent,
      uidText: uid.textContent,
      noteText: note.textContent,
      noteUnderUid: nb.top >= ub.bottom - 2 && nb.top < ub.bottom + 14,
      noteCentered: Math.abs((nb.left + nb.right)/2 - (rb.left + rb.right)/2) < 8,
      noteVisible: nb.height > 0 && note.style.display !== 'none',
      uidRow: box.children[2].children[1].textContent
    });
  })()`));
  await sleep(400);
  await shot('uidnote.png');
  ws.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
