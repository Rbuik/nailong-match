// 实测：成绩单称号「等级·玩家名」的显示与长度（8 字昵称不撑破卡片）
const http = require('http');
const fs = require('fs');
const PORT = 9230;
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
  const shot=async(name)=>{const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('D:/nailong-match/_preview/'+name,Buffer.from(s.result.data,'base64'));};
  await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:8125/index.html'});await sleep(2600);
  if(!(await ev('!!Account.current()'))){await ev(`Account.register('称号测试','123456')`);await sleep(600);await send('Page.navigate',{url:'http://127.0.0.1:8125/index.html'});await sleep(2600);}

  // 通关 23/46 → 达人；昵称改成 8 个字（最长的合法昵称）
  console.log('setup', await ev(`(function(){
    for (var i=1;i<=23;i++) Store.recordLevel(i, 2000+i, 2);
    Meta.setNickname('奶龙大玩家啊啊啊');   // 8 字（最长的合法昵称）
    return Meta.nickname() + ' / 已通 ' + Object.keys(Store.getProgress()).length;
  })()`));

  await ev(`document.querySelectorAll('.overlay').forEach(function(o){o.style.display='none';});
    document.getElementById('main-menu').style.display='flex';
    document.getElementById('btn-history').click(); 'ok'`);
  await sleep(500);
  await ev(`document.getElementById('btn-replay-ending').click(); 'ok'`);
  await sleep(1500);
  console.log('title', await ev(`document.getElementById('master-title').textContent`));
  console.log('sizes-A', await ev(`(function(){
    var greet = document.querySelector('.master-greet-txt');
    var b = document.getElementById('master-title');
    return JSON.stringify({ greet: getComputedStyle(greet).fontSize, title: getComputedStyle(b).fontSize,
      len: b.textContent.length, clipped: b.scrollWidth > b.clientWidth + 1 });
  })()`));
  // 换成短昵称，字号必须一模一样
  await ev(`Meta.setNickname('奶龙'); document.getElementById('btn-history').click(); 'ok'`);
  await sleep(400);
  await ev(`document.getElementById('btn-replay-ending').click(); 'ok'`);
  await sleep(1200);
  console.log('sizes-B', await ev(`(function(){
    var b = document.getElementById('master-title');
    return JSON.stringify({ text: b.textContent, title: getComputedStyle(b).fontSize,
      len: b.textContent.length, clipped: b.scrollWidth > b.clientWidth + 1 });
  })()`));
  console.log('fit', await ev(`(function(){
    var b = document.getElementById('master-title');
    var card = document.querySelector('.master-card');
    var box = document.querySelector('.master-title-box');
    var rb = b.getBoundingClientRect(), rc = card.getBoundingClientRect(), rbox = box.getBoundingClientRect();
    return JSON.stringify({ fontSize: getComputedStyle(b).fontSize, textW: Math.round(rb.width),
      boxW: Math.round(rbox.width), cardRight: Math.round(rc.right), titleRight: Math.round(rb.right),
      clipped: b.scrollWidth > b.clientWidth + 1, overflowed: rb.right > rc.right - 8 });
  })()`));
  await ev(`document.querySelectorAll('.overlay').forEach(function(o){o.style.display='none';});
    document.getElementById('game-complete').style.display='flex'; 'ok'`);
  await shot('title-rank.png');
  ws.close();
})();
