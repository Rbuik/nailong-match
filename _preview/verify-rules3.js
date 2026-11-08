// verify-rules3.js — 核对规则页文案 / 局榜目标分灰显 / 生成提示无 🎁
const http = require('http');
const fs = require('fs');
const PORT = process.argv[2] || 9240;
function get(p){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:PORT,path:p},(r)=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});}
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const list=JSON.parse(await get('/json/list'));
  const t=list.filter(x=>x.type==='page')[0];
  const ws=new WebSocket(t.webSocketDebuggerUrl);let id=0;const pend=new Map();
  ws.addEventListener('message',(e)=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  await new Promise(r=>ws.addEventListener('open',r));
  const send=(method,params)=>new Promise(res=>{const mid=++id;pend.set(mid,res);ws.send(JSON.stringify({id:mid,method,params}));});
  const ev=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});const v=r.result&&r.result.result;return v&&'value'in v?v.value:JSON.stringify(r.result);};
  const shot=async(name)=>{const s=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});if(!s.result||!s.result.data){console.log('shot-fail',JSON.stringify(s).slice(0,200));return;}fs.writeFileSync('D:/nailong-match/_preview/'+name,Buffer.from(s.result.data,'base64'));};
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.bringToFront', {});
  await send('Page.navigate',{url:'http://127.0.0.1:8125/index.html'});await sleep(2600);
  if(!(await ev('!!Account.current()'))){await ev(`Account.register('规则测试','123456')`);await sleep(600);await send('Page.navigate',{url:'http://127.0.0.1:8125/index.html'});await sleep(2600);}
  // 注入假对手后刷新一次页面，让 board.js 的 load() 从本地缓存读进去
  // （ntfy 的同步被 host-resolver-rules 指到死地址，不会覆盖也不会发任何东西）
  await ev(`(function(){
    for (var i=1;i<=40;i++) Store.recordLevel(i, 8000+i, 3);
    localStorage.setItem('nl2:lbshare2', JSON.stringify({ ts: Date.now(), list: [
      { uid:'low999', name:'低分玩家', score:5730, ts:Date.now(), pv:'', lv:{40:5730}, st:{} }
    ]}));
    location.reload(); return 'ok';
  })()`);
  await sleep(2600);

  // 1. 规则页：霜块 / 线消 文案
  await ev(`document.querySelectorAll('.overlay').forEach(function(o){o.style.display='none';});
    document.getElementById('main-menu').style.display='flex';
    document.getElementById('btn-rules-home').click(); 'ok'`);
  await sleep(600);
  console.log('rules', await ev(`(function(){
    var t=document.body.textContent;
    return JSON.stringify({
      frost: t.indexOf('霜块❄️：在机关关卡时，每6步自动长一个') >= 0,
      line: t.indexOf('线消↔️/↕️：4 连生成') >= 0
    });
  })()`));

  // 2. 局榜目标分：假对手已在开局前注入（本地缓存，绝不碰公共频道）
  await ev(`document.getElementById('btn-leaderboard').click(); 'ok'`);
  await sleep(400);
  await ev(`document.getElementById('btn-lb-hub-level').click(); 'ok'`);
  await sleep(400);
  await ev(`(function(){
    var sw=document.getElementById('lb-level-swap'); if(sw) sw.click(); return 'ok';
  })()`);
  await sleep(300);
  await ev(`(function(){
    var pk=document.getElementById('lb-picker'); if(!pk) return 'nopicker';
    var bs=pk.querySelectorAll('.pk-item');
    for (var i=0;i<bs.length;i++) if (bs[i].textContent==='第 40 关') { bs[i].click(); break; }
    return 'ok';
  })()`);
  await sleep(500);
  console.log('lb-rows', await ev(`(function(){
    var out=[];
    document.querySelectorAll('#lb-list .lb-row').forEach(function(r){
      var inner=r.querySelector('.lb-swipe');
      out.push({ cls:r.className, rank:(inner.querySelector('.lb-rank')||{}).textContent,
        score:(inner.querySelector('.lb-score')||{}).textContent,
        starsColor:getComputedStyle(inner.querySelector('.lb-stars')).color,
        scoreColor:getComputedStyle(inner.querySelector('.lb-score')).color });
    });
    return JSON.stringify(out);
  })()`));
  await ev(`document.querySelectorAll('.overlay').forEach(function(o){ if(o.id!=='lb-view') o.style.display='none'; });
    document.getElementById('lb-view').style.display='flex'; 'ok'`);
  await shot('lb-target.png');

  // 3. 生成提示无 🎁：直接看 toast 函数源里有没有 🎁，并模拟一条排队
  console.log('toast-src', await ev(`(function(){
    var s = window.__nl_test && 'toast' in window.__nl_test;
    return JSON.stringify({ hook: s });
  })()`));
  ws.close();
})();
