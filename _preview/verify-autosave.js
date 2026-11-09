// 实测自动存档自愈：开机拉取失败（模拟手机刚开页面网没就绪）→ 每轮补拉 → 成功后恢复推送
// 桩 Cloud 不碰真实服务器；账号数据全在本机预置
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

  await send('Page.enable');
  // 页面脚本执行前：预置一个已登录账号（带令牌），并注入游客标记
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    try {
      localStorage.setItem('nl2:authSkip', '1');
      localStorage.setItem('nl2:accounts', JSON.stringify([
        { id: 'pushtest001', name: '同步测试', pass: '', created: 1, last: 1, cloud: 1, ctoken: 'stubtok' }
      ]));
      localStorage.setItem('nl2:cur', JSON.stringify('pushtest001'));
      localStorage.setItem('nl2:acc:pushtest001', JSON.stringify({ keys: { 'nl2:wallet': '{"coins":50,"items":{}}' }, savedAt: 1 }));
    } catch (e) {}
  ` });

  await send('Page.navigate', { url: 'http://127.0.0.1:8132/index.html?v=' + Date.now() });
  await sleep(2800);

  // 换上桩 Cloud：前 2 次 pull 失败（模拟没网），之后成功；push 计数
  const stub = await ev(`(function(){
    let pulls = 0, pushFails = 2;
    window.__pulls = 0; window.__pushOk = 0; window.__pullFailReason = '';
    window.Cloud = {
      ready: function () { return true; },
      token: function () { return 'stubtok'; },
      setToken: function () {},
      signedIn: function () { return true; },
      lastSync: function () { return 0; },
      setLastSync: function () {},
      pull: function () {
        window.__pulls++;
        if (pulls < 2) { pulls++; window.__pullFailReason = 'offline#' + pulls; return Promise.resolve({ ok: false, offline: true, reason: '网络超时' }); }
        return Promise.resolve({ ok: true, created: 111, slot: { keys: { 'nl2:wallet': '{"coins":50,"items":{}}' }, savedAt: 1 } });
      },
      push: function (slot, force) {
        if (pushFails > 0) { pushFails--; return Promise.resolve({ ok: false, offline: true, reason: '网络超时' }); }
        window.__pushOk++;
        return Promise.resolve({ ok: true });
      },
      register: function () { return Promise.resolve({ ok: false }); },
      login: function () { return Promise.resolve({ ok: false }); },
      setPass: function () { return Promise.resolve({ ok: true }); },
      rename: function () { return Promise.resolve({ ok: true }); },
      remove: function () { return Promise.resolve({ ok: true }); },
      recover: function () { return Promise.resolve({ ok: false }); }
    };
    // 真正的 startCloudSync 在 boot 已跑过（那时真 Cloud 离线，pull 失败）
    // 现在补一个同步循环，模拟「服务器恢复后」的自动存档
    try { if (window.Account && window.Account.startCloudSync) window.Account.startCloudSync(); } catch (e) { return 'err:' + e.message; }
    return 'stub-ok';
  })()`);
  console.log('stub', stub);

  // 轮询 100 秒：等第 3 轮 30s tick（前两轮 pull 失败/第三轮成功 → 之后推送）
  for (let i = 0; i < 22; i++) {
    await sleep(5000);
    const s = await ev("JSON.stringify({pulls:window.__pulls,pushOk:window.__pushOk,fail:window.__pullFailReason})");
    console.log(i * 5 + 5 + 's', s);
    const o = JSON.parse(s);
    if (o.pushOk >= 1) break;
  }
  ws.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
