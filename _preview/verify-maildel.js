// 复现邮箱删除键脱离行的场景：多封邮件 + 滑动打开 + 滚动
const http = require('http');
const fs = require('fs');
const PORT = 9233;
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
  if(!(await ev('!!Account.current()'))){await ev(`Account.register('删除键测试','123456')`);await sleep(600);await send('Page.navigate',{url:'http://127.0.0.1:8125/index.html'});await sleep(2600);}

  // 造 6 封已读无附件邮件（时间错开，最新的在最上）
  console.log('mails', await ev(`(function(){
    for (var i=1;i<=6;i++){
      var d=new Date(Date.now()-i*3600e3);
      var pad=function(n){return n<10?'0'+n:''+n;};
      Mail.sendMail({ id:'t'+i, title:'测试邮件 '+i, from:'系统',
        at:d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes()),
        body:'正文' });
      Mail.markRead('t'+i);
    }
    return Mail.list().length;
  })()`));

  await ev(`document.querySelectorAll('.overlay').forEach(function(o){o.style.display='none';});
    document.getElementById('main-menu').style.display='flex';
    document.getElementById('btn-mail').click(); 'ok'`);
  await sleep(600);

  const rows = await ev(`(function(){
    var out=[];
    document.querySelectorAll('#mail-list .mail-swipe').forEach(function(w){
      var r=w.querySelector('.mail-row').getBoundingClientRect();
      var d=w.querySelector('.mail-del').getBoundingClientRect();
      out.push({rowTop:Math.round(r.top),rowBottom:Math.round(r.bottom),delTop:Math.round(d.top),delBottom:Math.round(d.bottom)});
    });
    var listR=document.getElementById('mail-list').getBoundingClientRect();
    return JSON.stringify({list:{top:Math.round(listR.top),bottom:Math.round(listR.bottom)},rows:out});
  })()`);
  console.log('geom', rows);

  // 先造 4 封可见邮件（atTime 必须晚于注册时间）
  await ev(`(function(){
    for (var i=1;i<=4;i++){
      var d=new Date(Date.now()+i*1000);   // 刚刚之后，保证晚于注册
      Mail.sendMail({ id:'v'+i, title:'可见邮件 '+i, from:'系统',
        at:(function(d){var p=function(n){return n<10?'0'+n:''+n;};return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());})(d),
        body:'x' });
      Mail.markRead('v'+i);
    }
    document.querySelectorAll('.overlay').forEach(function(o){o.style.display='none';});
    document.getElementById('btn-mail').click();
    return Mail.list().length;
  })()`);
  await sleep(600);

  // 模拟左滑最后一行（从行中心向左拖 80px）
  const lastGeom = JSON.parse(await ev(`(function(){
    var ws=document.querySelectorAll('#mail-list .mail-swipe');
    var r=ws[ws.length-1].querySelector('.mail-row').getBoundingClientRect();
    return JSON.stringify({x:Math.round(r.left+r.width*0.7), y:Math.round(r.top+r.height/2)});
  })()`));
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:lastGeom.x,y:lastGeom.y,button:'left',clickCount:1});
  for (var i=1;i<=8;i++){
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:lastGeom.x-i*10,y:lastGeom.y,button:'left'});
  }
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:lastGeom.x-80,y:lastGeom.y,button:'left'});
  await sleep(500);
  console.log('after-swipe', await ev(`(function(){
    var ws=document.querySelectorAll('#mail-list .mail-swipe');
    var out=[];
    ws.forEach(function(w){
      var open=w.classList.contains('open');
      var r=w.querySelector('.mail-row').getBoundingClientRect();
      var d=w.querySelector('.mail-del').getBoundingClientRect();
      var tr=w.querySelector('.mail-row').style.transform;
      out.push({open:open,rowTop:Math.round(r.top),delTop:Math.round(d.top),delLeft:Math.round(d.left),tr:tr});
    });
    return JSON.stringify(out);
  })()`));
  // 把列表滚到最底，让打开的行贴着容器下缘
  await ev(`(function(){ var l=document.getElementById('mail-list'); l.scrollTop=l.scrollHeight; return l.scrollTop+'/'+l.scrollHeight; })()`);
  await sleep(300);
  await ev(`document.querySelectorAll('.overlay').forEach(function(o){ if(o.id!=='mail-menu') o.style.display='none'; }); 'ok'`);
  console.log('scrolled-geom', await ev(`(function(){
    var l=document.getElementById('mail-list');
    var ws=l.querySelectorAll('.mail-swipe');
    var last=ws[ws.length-1];
    var r=last.querySelector('.mail-row').getBoundingClientRect();
    var d=last.querySelector('.mail-del').getBoundingClientRect();
    var lc=l.getBoundingClientRect();
    return JSON.stringify({listBottom:Math.round(lc.bottom),rowTop:Math.round(r.top),rowBottom:Math.round(r.bottom),delTop:Math.round(d.top),delBottom:Math.round(d.bottom)});
  })()`));
  await shot('mail-swipe-test.png');

  // 验证 1：滑开一行后，按住另一行（哪怕只是滚动取消）→ 之前那行必须完全收回
  await ev(`(function(){
    var ws=document.querySelectorAll('#mail-list .mail-swipe');
    var a=ws[2].querySelector('.mail-row'), b=ws[3].querySelector('.mail-row');
    var rect=b.getBoundingClientRect();
    var opts={bubbles:true,pointerId:9,pointerType:'touch',clientX:rect.left+60,clientY:rect.top+20};
    a.dispatchEvent(new PointerEvent('pointerup',Object.assign({},opts)));
    a.dispatchEvent(new PointerEvent('pointerdown',opts));
    b.dispatchEvent(new PointerEvent('pointerdown',opts));   // 按另一行 → closeMailSwipe
    b.dispatchEvent(new PointerEvent('pointercancel',opts));
    return 'ok';
  })()`);
  await sleep(300);
  console.log('zombie-check', await ev(`(function(){
    var ws=document.querySelectorAll('#mail-list .mail-swipe');
    var out=[];
    ws.forEach(function(w,i){
      out.push({i:i, open:w.classList.contains('open'), tr:w.querySelector('.mail-row').style.transform||'none'});
    });
    return JSON.stringify(out);
  })()`));

  // 验证 2：滑开后滚动列表 → 自动收起
  await ev(`(function(){
    var ws=document.querySelectorAll('#mail-list .mail-swipe');
    var r=ws[2].querySelector('.mail-row').getBoundingClientRect();
    var opts={bubbles:true,pointerId:9,pointerType:'touch',clientX:r.left+60,clientY:r.top+20};
    ws[2].querySelector('.mail-row').dispatchEvent(new PointerEvent('pointerdown',opts));
    for(var i=1;i<=8;i++){ opts.clientX=r.left+60-i*10; ws[2].querySelector('.mail-row').dispatchEvent(new PointerEvent('pointermove',opts)); }
    ws[2].querySelector('.mail-row').dispatchEvent(new PointerEvent('pointerup',opts));
    var l=document.getElementById('mail-list');
    l.scrollTop=l.scrollHeight-40;   // 触发 scroll → 应自动收起
    l.dispatchEvent(new Event('scroll'));
    return 'ok';
  })()`);
  await sleep(300);
  console.log('scroll-close', await ev(`(function(){
    var ws=document.querySelectorAll('#mail-list .mail-swipe');
    var anyOpen=false, anyTr=false;
    ws.forEach(function(w){ if(w.classList.contains('open')) anyOpen=true;
      if(w.querySelector('.mail-row').style.transform) anyTr=true; });
    return JSON.stringify({anyOpen:anyOpen, anyInlineTransform:anyTr});
  })()`));
  ws.close();
})();
