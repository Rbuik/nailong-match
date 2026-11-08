// 实测：登录页 / 云存档页都能点背景关掉，关掉后按游客玩；刷新不再拦；注册后游客进度顺延
// 只在本地跑，ntfy.sh 解析到 127.0.0.1:1，不上公共服务
const http = require('http');
const fs = require('fs');
const PORT = 9231;

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

  await send('Page.navigate', { url: 'http://127.0.0.1:8125/index.html' });
  await sleep(2800);

  // 1) 全新设备：应该停在登录页
  console.log('1-start', await ev(`JSON.stringify({
    auth: document.getElementById('auth-menu').style.display,
    main: document.getElementById('main-menu').style.display,
    logged: Account.loggedIn()
  })`));

  // 2) 点登录页背景 → 游客进主页
  console.log('2-skip', await ev(`(function(){
    document.getElementById('auth-menu').click();
    return JSON.stringify({
      auth: document.getElementById('auth-menu').style.display,
      main: document.getElementById('main-menu').style.display,
      skip: !!localStorage.getItem('nl2:authSkip'),
      view: document.body.dataset.view
    });
  })()`));
  await sleep(300);
  await shot('guest-menu.png');

  // 3) 游客点开始游戏：不该再弹登录页（第一章首次进入会有剧情页，点「继续前进」进局）
  console.log('3-play', await ev(`(function(){
    document.getElementById('btn-play').click();
    var st = __nl_test.state();
    var ov = Array.prototype.filter.call(document.querySelectorAll('.overlay'),
      function(o){ return o.style.display === 'flex'; }).map(function(o){ return o.id; });
    if (document.getElementById('story-menu').style.display === 'flex') {
      document.getElementById('btn-story-go').click();
    }
    return JSON.stringify({
      auth: document.getElementById('auth-menu').style.display,
      overlays: ov,
      playing: st.playing
    });
  })()`));
  await sleep(700);
  console.log('3-play2', await ev(`(function(){
    var st = __nl_test.state();
    return JSON.stringify({ view: document.body.dataset.view, playing: st.playing, level: st.level,
      auth: document.getElementById('auth-menu').style.display });
  })()`));
  await shot('guest-play.png');

  // 4) 装成玩了一会儿：写点进度，再刷新
  console.log('4-progress', await ev(`(function(){
    Store.recordLevel(1, 1234, 3);
    Store.recordLevel(2, 1600, 2);
    return JSON.stringify(Store.getProgress());
  })()`));
  await send('Page.navigate', { url: 'http://127.0.0.1:8125/index.html' });
  await sleep(2800);
  console.log('4-reload', await ev(`JSON.stringify({
    auth: document.getElementById('auth-menu').style.display,
    main: document.getElementById('main-menu').style.display,
    progress: Object.keys(Store.getProgress()).length
  })`));

  // 5) 云存档页点背景关掉（从 设置 → 账号安全 → ☁️ 云存档）
  console.log('5-cloud', await ev(`(function(){
    document.getElementById('btn-custom-music').click();
    document.getElementById('btn-goto-account').click();
    document.getElementById('btn-goto-cloud').click();
    var opened = document.getElementById('cloud-menu').style.display;
    document.getElementById('cloud-menu').click();
    return JSON.stringify({
      opened: opened,
      closed: document.getElementById('cloud-menu').style.display,
      back: document.getElementById('account-menu').style.display
    });
  })()`));
  await sleep(300);

  // 6) 游客注册：进度应该顺延（本机玩过的 2 关还在）
  console.log('6-before', await ev(`JSON.stringify({
    logged: Account.loggedIn(),
    progress: localStorage.getItem('nl2:progress'),
    keys: Object.keys(localStorage).filter(function(k){ return k.indexOf('nl2:')===0; })
  })`));
  console.log('6-register', await ev(`(function(){
    document.getElementById('btn-goto-switch').click();
    document.getElementById('btn-switch-login').click();
    document.getElementById('btn-auth-register').click();
    document.getElementById('auth-name').value = '游客转正';
    document.getElementById('auth-pass').value = 'ab1234';
    document.getElementById('btn-auth-submit').click();
    return 'sent';
  })()`));
  await sleep(150);
  console.log('6-mid', await ev(`JSON.stringify({
    logged: Account.loggedIn(),
    name: Account.loggedIn() ? Account.current().name : '',
    progress: localStorage.getItem('nl2:progress')
  })`));
  await sleep(2200);
  console.log('6-after', await ev(`JSON.stringify({
    auth: document.getElementById('auth-menu').style.display,
    main: document.getElementById('main-menu').style.display,
    skip: !!localStorage.getItem('nl2:authSkip'),
    logged: Account.loggedIn(),
    name: Account.loggedIn() ? Account.current().name : '',
    progress: Object.keys(Store.getProgress()).length
  })`));
  await shot('guest-after-register.png');
  ws.close();
})();
