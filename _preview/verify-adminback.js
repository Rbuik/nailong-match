// 实测：后台名单页「点背景返回」——从省份详情进的回省份详情，从后台直接进的回后台
const http = require('http');
const PORT = 9234;
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
  await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8125/index.html'});await sleep(2600);
  if(!(await ev('!!Account.current()'))){await ev(`Account.register('返回测试','123456')`);await sleep(600);await send('Page.navigate',{url:'http://127.0.0.1:8125/index.html'});await sleep(2600);}
  await ev(`document.querySelectorAll('.overlay').forEach(function(o){o.style.display='none';});
    document.getElementById('main-menu').style.display='flex'; 'ok'`);

  const vis = `({ admin: document.getElementById('admin-menu').style.display,
    ul: document.getElementById('admin-user-list').style.display,
    prov: document.getElementById('prov-user-list').style.display,
    ulTitle: document.getElementById('admin-ul-title').textContent })`;

  // 长按 3 秒开后台
  await ev(`(function(){
    var a=document.querySelector('#main-menu .mascot'), b=document.getElementById('btn-home-menu');
    ['pointerdown'].forEach(function(t){ a.dispatchEvent(new PointerEvent(t,{bubbles:true})); b.dispatchEvent(new PointerEvent(t,{bubbles:true})); });
    return 'holding';
  })()`);
  await sleep(3400);
  await ev(`(function(){
    var a=document.querySelector('#main-menu .mascot'), b=document.getElementById('btn-home-menu');
    ['pointerup'].forEach(function(t){ a.dispatchEvent(new PointerEvent(t,{bubbles:true})); b.dispatchEvent(new PointerEvent(t,{bubbles:true})); });
    return 'released';
  })()`);
  await sleep(900);
  console.log('after-open-admin', await ev(vis));

  // 路径 A：后台 → 省份数量（省份详情）→ 点省份（玩家·xx）→ 点背景应回省份详情
  await ev(`document.getElementById('admin-provs-row').click(); 'ok'`);
  await sleep(400);
  console.log('p3-open', await ev(vis));
  await ev(`(function(){ var r=document.querySelector('#prov-ul-list .lb-row'); if(r) r.click(); return 'ok'; })()`);
  await sleep(400);
  console.log('p1-open', await ev(vis));
  // 量列几何：星星列 / 分数列的起点要和排行榜 col4 一致；省模式下不应有省份列
  console.log('cols', await ev(`(function(){
    var inner=document.querySelector('#admin-ul-list .lb-row .lb-swipe');
    var cs=getComputedStyle(inner);
    var stars=inner.querySelector('.lb-stars'), score=inner.querySelector('.ul-score');
    var sr=stars.getBoundingClientRect(), cr=score.getBoundingClientRect(), ir=inner.getBoundingClientRect();
    return JSON.stringify({cls:inner.className, cols:cs.gridTemplateColumns,
      starsLeft:Math.round(sr.left-ir.left), scoreLeft:Math.round(cr.left-ir.left),
      hasProv: !!inner.querySelector('.ul-prov')});
  })()`));
  await ev(`document.getElementById('admin-user-list').click(); 'ok'`);
  await sleep(400);
  console.log('p1-back(expect prov)', await ev(vis));

  // 路径 B：后台 → 用户数量（玩家·全服）→ 点背景应回后台
  await ev(`document.getElementById('admin-menu').style.display='flex'; document.getElementById('admin-users-row').click(); 'ok'`);
  await sleep(400);
  console.log('p1-open-B', await ev(vis));
  await ev(`document.getElementById('admin-user-list').click(); 'ok'`);
  await sleep(400);
  console.log('p1-back-B(expect admin)', await ev(vis));
  ws.close();
})();
