// music.js — 音乐播放列表 / 历史导入 / 重命名 / 播放模式
// 恢复 v1 的音乐管理能力，接口统一走 AudioManager（§22），交互统一用 Pointer Events（§23）
// 暴露 window.Music

(function (global) {
  'use strict';

  const K = {
    history: 'nl2:musicHistory',
    playlist: 'nl2:playlist',
    mode: 'nl2:playMode',
    order: 'nl2:musicOrder'   // 音乐库/历史列表的自定义顺序（长按拖动排序）
  };

  const ACTION_W = 60;      // 每个滑动按钮宽度
  const LONG_PRESS = 420;   // 长按浮起可拖动排序（ms）
  const MOVE_TOL = 6;       // 判定为滑动的位移阈值

  const $ = (id) => document.getElementById(id);

  let currentUrl = '';          // 当前播放的 url
  let selected = new Set();     // 多选集合（url）
  let renameTarget = null;      // { url }
  let renameBackTo = '';        // 改名后要跳回的面板（导入流程用）
  let openRow = null;           // 当前左滑打开的行

  // ==================== 存储 ====================
  function read(key, fb) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fb;
    } catch (e) {
      return fb;
    }
  }

  function write(key, v) {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch (e) {
      console.warn('[Music] 写入失败', key, e);
    }
  }

  function nameFromUrl(u) {
    try {
      const clean = String(u).split('?')[0].split('#')[0];
      const seg = clean.split('/').filter(Boolean).pop() || '未知音频';
      return decodeURIComponent(seg);
    } catch (e) {
      return '未知音频';
    }
  }

  function norm(list) {
    return (Array.isArray(list) ? list : [])
      .map((it) =>
        typeof it === 'string'
          ? { url: it, name: nameFromUrl(it) }
          : { url: it && it.url, name: (it && it.name) || nameFromUrl(it && it.url) }
      )
      .filter((x) => !!x.url);
  }

  function getHistory() {
    // 内置音乐不走 localStorage，从历史里排除避免重复
    return norm(read(K.history, [])).filter((x) => !isBuiltin(x.url));
  }
  function saveHistory(l) { write(K.history, l); }
  function getPlaylist() { return norm(read(K.playlist, [])); }
  function savePlaylist(l) { write(K.playlist, l); }

  // ==================== 内置音乐（builtin-music.js 里写死，不可删除） ====================
  function getBuiltin() {
    const list = (typeof window !== 'undefined' && Array.isArray(window.BUILTIN_MUSIC))
      ? window.BUILTIN_MUSIC
      : [];
    return list
      .filter((x) => x && x.url)
      .map((x) => ({ url: x.url, name: x.name || nameFromUrl(x.url), locked: true }));
  }

  function isBuiltin(url) {
    return getBuiltin().some((x) => x.url === url);
  }

  function getMode() {
    const o = read(K.mode, null);
    return (o && o.mode) || 'seq';
  }
  function setMode(m) {
    write(K.mode, { mode: m });
    AudioManager.setCustomLoop(m === 'loop');
    if (m !== 'loop') commitOnEnded();
    renderModes();
  }

  function rememberHistory(item) {
    if (isBuiltin(item.url)) return; // 内置音乐固定在列表顶部，不重复入库
    const h = getHistory();
    if (!h.some((x) => x.url === item.url)) {
      h.unshift(item);
      saveHistory(h);
    }
  }

  // ==================== 播放控制 ====================
  function onFail() {
    toast('音频加载失败，请检查链接是否可直连');
  }

  function commitOnEnded() {
    // 循环模式下靠 audio.loop；其它模式靠 onEnded 手动切歌
    const usingList = getPlaylist().length > 0;
    if (!usingList) return;
    AudioManager.playCustom(currentUrl, onFail, {
      loop: false,
      onEnded: () => nextTrack()
    });
  }

  function playItem(item) {
    if (!item || !item.url) return;
    AudioManager.init(Store.getSettings());
    currentUrl = item.url;
    rememberHistory(item);
    Store.setSettings({ customBgm: item.url });

    const loop = getMode() === 'loop';
    AudioManager.playCustom(item.url, onFail, {
      loop: loop,
      onEnded: loop ? null : () => nextTrack(),
      restart: true
    });
    warmCache();

    toast('正在播放：' + item.name);
    renderAll();
  }

  function nextTrack() {
    const list = getPlaylist();
    if (!list.length) {
      currentUrl = '';
      renderAll();
      return;
    }
    const mode = getMode();
    const cur = list.findIndex((x) => x.url === currentUrl);
    let idx;
    if (mode === 'shuf') {
      if (list.length === 1) idx = 0;
      else {
        let guard = 0;
        do { idx = Math.floor(Math.random() * list.length); guard++; }
        while (idx === cur && guard < 50);
      }
    } else {
      idx = cur < 0 ? 0 : (cur + 1) % list.length;
    }
    const it = list[idx];
    currentUrl = it.url;
    AudioManager.playCustom(it.url, onFail, { loop: false, onEnded: () => nextTrack() });
    renderAll();
  }

  function stopCustom() {
    AudioManager.stopCustom();
    currentUrl = '';
    renderAll();
  }

  // ==================== 通用渲染 ====================
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const SOURCES = {
    history: {
      listId: 'music-history-list',
      batchId: 'batch-action-bar',
      actions: [
        { act: 'rename', label: '重命名', cls: 'warn' },
        { act: 'add', label: '添加', cls: 'info' },
        { act: 'del', label: '删除', cls: 'danger' }
      ],
      empty: '暂无历史记录，去「导入音频」添加一条'
    },
    playlist: {
      listId: 'playlist-list',
      batchId: 'playlist-batch-bar',
      actions: [
        { act: 'rename', label: '重命名', cls: 'warn' },
        { act: 'del', label: '删除', cls: 'danger' }
      ],
      empty: '播放列表为空，去「音乐库」添加'
    },
    library: {
      listId: 'music-library-list',
      batchId: 'library-batch-action-bar',
      actions: [
        { act: 'rename', label: '重命名', cls: 'warn' },
        { act: 'add', label: '添加', cls: 'info' },
        { act: 'del', label: '删除', cls: 'danger' }
      ],
      empty: '音乐库为空，去「导入音频」添加一条'
    }
  };

  function itemsOf(source) {
    if (source === 'playlist') return getPlaylist();
    // 音乐库/历史导入：内置音乐 + 历史，按用户长按拖动保存的顺序排
    return applyOrder(getBuiltin().concat(getHistory()), read(K.order, null));
  }

  // 按保存的顺序排列；没在顺序表里的（新导入的）接在末尾
  function applyOrder(list, ord) {
    if (!Array.isArray(ord) || !ord.length) return list;
    const pos = {};
    ord.forEach((u, i) => { pos[u] = i; });
    return list
      .map((it, i) => ({ it: it, i: i }))
      .sort((a, b) => {
        const pa = pos[a.it.url] == null ? 1e9 : pos[a.it.url];
        const pb = pos[b.it.url] == null ? 1e9 : pos[b.it.url];
        return pa === pb ? a.i - b.i : pa - pb;
      })
      .map((x) => x.it);
  }

  // 拖动松手：把 DOM 里的新顺序存下来
  function commitOrder(source) {
    const cfg = SOURCES[source];
    const box = cfg && $(cfg.listId);
    if (!box) return;
    const urls = Array.prototype.map.call(box.querySelectorAll('.m-item'), (r) => r.dataset.url)
      .filter(Boolean);
    if (!urls.length) return;
    if (source === 'playlist') {
      const byUrl = {};
      getPlaylist().forEach((x) => { byUrl[x.url] = x; });
      const next = [];
      urls.forEach((u) => { if (byUrl[u]) { next.push(byUrl[u]); delete byUrl[u]; } });
      Object.keys(byUrl).forEach((u) => next.push(byUrl[u]));
      savePlaylist(next);
    } else {
      write(K.order, urls);
    }
    renderList('history');
    renderList('library');
    renderList('playlist');
  }

  function closeOpenRow() {
    if (!openRow) return;
    openRow.style.transition = 'transform .16s ease';
    openRow.style.transform = 'translateX(0px)';
    openRow.classList.remove('open');
    const r = openRow;
    openRow = null;
    setTimeout(() => { r.style.transition = ''; }, 180);
  }

  function renderList(source) {
    const cfg = SOURCES[source];
    if (!cfg) return;
    const box = $(cfg.listId);
    if (!box) return;

    const list = itemsOf(source);
    box.innerHTML = '';

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'm-empty';
      empty.textContent = cfg.empty;
      box.appendChild(empty);
      syncBatch(source);
      return;
    }

    list.forEach((item) => {
      const wrap = document.createElement('div');
      wrap.className = 'm-item-wrap';

      // 内置音乐：音乐库/历史里只保留「添加」；播放列表里保留「删除」（只是移出列表，不是删歌）
      const rowActs = item.locked
        ? cfg.actions.filter((a) => a.act === 'add' || (source === 'playlist' && a.act === 'del'))
        : cfg.actions;
      const rowActW = rowActs.length * ACTION_W;

      // 左滑操作区
      const acts = document.createElement('div');
      acts.className = 'm-actions';
      rowActs.forEach((a) => {
        const b = document.createElement('button');
        b.className = 'm-action ' + a.cls;
        b.textContent = a.label;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          closeOpenRow();
          handleAction(a.act, item, source);
        });
        acts.appendChild(b);
      });

      const row = document.createElement('div');
      row.className = 'm-item';
      row.dataset.url = item.url;
      if (item.url === currentUrl) row.classList.add('active');
      if (selected.has(item.url)) row.classList.add('selected');
      row.innerHTML =
        '<span class="m-name">🎵 ' + (item.locked ? '🔒 ' : '') + esc(item.name) + '</span>' +
        '<span class="m-tail">' + (item.url === currentUrl ? '▶ 播放中' : '') + '</span>';

      bindRowGesture(row, item, source, rowActW);

      wrap.appendChild(acts);
      wrap.appendChild(row);
      box.appendChild(wrap);
    });

    syncBatch(source);
  }

  function bindRowGesture(row, item, source, actW) {
    // 绑定时 row 还没插进列表，parentNode 是 null —— 必须等长按触发时再取
    let wrap = null;
    let sx = 0, sy = 0, base = 0, dx = 0, lastY = 0;
    let swiping = false, moved = false, lp = null, pid = null;
    let lifted = false, liftMoved = false, ghost = null, grabDy = 0, touching = false;

    // 长按 → 这一行「浮」起来，可以上下拖动换位置（同时不再触发左滑）
    function lift() {
      if (lifted) return;
      wrap = row.parentNode;
      if (!wrap) return;
      lifted = true;
      liftMoved = false;
      const r = row.getBoundingClientRect();
      grabDy = Math.max(4, Math.min(r.height - 4, lastY - r.top));

      ghost = wrap.cloneNode(true);
      ghost.className = 'm-item-wrap drag-ghost';
      ghost.style.left = r.left + 'px';
      ghost.style.top = r.top + 'px';
      ghost.style.width = r.width + 'px';
      ghost.style.height = r.height + 'px';
      document.body.appendChild(ghost);

      wrap.classList.add('lift-src');
      document.body.classList.add('m-dragging');
      if (openRow) closeOpenRow();
      if (AudioManager.vibrate) AudioManager.vibrate(15);
    }

    function moveGhost(y) {
      if (!ghost) return;
      ghost.style.top = (y - grabDy) + 'px';
      const box = wrap.parentNode;
      if (!box) return;
      // 越过谁的中线就插到谁前面 —— 拖动时实时换位
      const sibs = Array.prototype.filter.call(box.children,
        (c) => c !== wrap && c.classList && c.classList.contains('m-item-wrap'));
      for (let i = 0; i < sibs.length; i++) {
        const r = sibs[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          if (sibs[i] !== wrap.nextSibling) box.insertBefore(wrap, sibs[i]);
          return;
        }
      }
      if (box.lastElementChild !== wrap) box.appendChild(wrap);
    }

    function endLift() {
      if (!lifted) return;
      lifted = false;
      document.body.classList.remove('m-dragging');
      if (wrap) wrap.classList.remove('lift-src');
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      // 拖着换了位置 → 保存新顺序；长按没动就松手 → 还是原来的多选
      const didMove = liftMoved;
      liftMoved = false;
      if (didMove) commitOrder(source);
      else toggleSelect(item.url, row);
    }

    // 一套手势逻辑，鼠标走 Pointer Events、触摸走 Touch Events
    function begin(x, y) {
      sx = x; sy = y; lastY = y; dx = 0;
      swiping = false; moved = false;
      base = row.classList.contains('open') ? -actW : 0;
      // 已左滑打开的行不进入长按拖动，先让它收回去
      if (base === 0) {
        lp = setTimeout(() => {
          if (moved || swiping) return;
          lift();
        }, LONG_PRESS);
      }
    }

    // 返回 true = 这一下要吃掉（拖动中 / 横向滑动），别让页面跟着滚
    function move(x, y) {
      const mx = x - sx;
      const my = y - sy;
      lastY = y;

      if (lifted) {
        if (!liftMoved && Math.abs(my) > 3) liftMoved = true;
        moveGhost(y);
        return true;
      }

      if (!moved && Math.abs(mx) > MOVE_TOL && Math.abs(mx) > Math.abs(my)) {
        swiping = true;
        if (openRow && openRow !== row) closeOpenRow();
      }
      if (Math.abs(mx) > MOVE_TOL || Math.abs(my) > MOVE_TOL) {
        moved = true;
        if (lp) { clearTimeout(lp); lp = null; }
      }
      if (!swiping) return false;

      dx = Math.max(-actW, Math.min(0, base + mx));
      row.style.transform = 'translateX(' + dx + 'px)';
      return Math.abs(mx) > Math.abs(my);
    }

    function finish() {
      if (lp) { clearTimeout(lp); lp = null; }

      // 长按浮起：松手就落位（不再触发左滑/点击）
      if (lifted) { endLift(); return; }

      if (swiping) {
        const open = dx < -actW / 2;
        row.style.transition = 'transform .16s ease';
        row.style.transform = 'translateX(' + (open ? -actW : 0) + 'px)';
        row.classList.toggle('open', open);
        openRow = open ? row : null;
        const r = row;
        setTimeout(() => { r.style.transition = ''; }, 180);
        return;
      }
      if (moved) return;

      // 多选状态下点击 = 切换选中
      if (selected.size > 0) {
        toggleSelect(item.url, row);
        return;
      }
      if (row.classList.contains('open')) {
        closeOpenRow();
        return;
      }
      playItem(item);
    }

    // ---------- 触摸（安卓/iOS）：长按后自己接管，preventDefault 挡住列表滚动 ----------
    row.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 1) return;   // 双指缩放不参与
      touching = true;
      const t = e.touches && e.touches[0];
      if (!t) return;
      begin(t.clientX, t.clientY);
    }, { passive: true });

    row.addEventListener('touchmove', (e) => {
      if (!touching) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      if (move(t.clientX, t.clientY) && e.cancelable) e.preventDefault();
    }, { passive: false });

    const touchEnd = () => {
      if (!touching) return;
      touching = false;
      finish();
    };
    row.addEventListener('touchend', touchEnd);
    row.addEventListener('touchcancel', touchEnd);

    // ---------- 指针（鼠标）：触摸序列在安卓上很容易被判成滚动发 pointercancel ----------
    row.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      if (e.button != null && e.button !== 0) return;
      pid = e.pointerId;
      try { row.setPointerCapture(pid); } catch (err) {}
      begin(e.clientX, e.clientY);
    });

    row.addEventListener('pointermove', (e) => {
      if (pid !== e.pointerId) return;
      move(e.clientX, e.clientY);
    });

    row.addEventListener('pointerup', (e) => {
      if (pid !== e.pointerId) return;
      pid = null;
      finish();
    });
    // 长按别让系统弹出「复制/打开链接」之类的菜单，否则手势会被打断
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); });
    row.addEventListener('pointercancel', (e) => {
      if (pid !== e.pointerId) return;
      pid = null;
      if (lp) { clearTimeout(lp); lp = null; }
      if (lifted) endLift();
      moved = true;
    });
  }

  function toggleSelect(url, row) {
    if (selected.has(url)) selected.delete(url);
    else selected.add(url);
    if (row) row.classList.toggle('selected', selected.has(url));
    syncBatch('history');
    syncBatch('library');
    syncBatch('playlist');
    if (AudioManager.vibrate) AudioManager.vibrate(20);
  }

  function syncBatch(source) {
    const cfg = SOURCES[source];
    if (!cfg) return;
    const bar = $(cfg.batchId);
    if (!bar) return;
    const n = selected.size;
    bar.style.display = n > 0 ? 'flex' : 'none';
    const first = bar.querySelector('button');
    if (first && n > 0) {
      // 在按钮上标出数量，避免用户不知道选了几个
      const label = first.dataset.label || first.textContent.replace(/（\d+）$/, '');
      first.dataset.label = label;
      first.textContent = label + '（' + n + '）';
    }
  }

  // ==================== 操作 ====================
  function handleAction(act, item, source) {
    if (act === 'rename') {
      openRename(item);
      return;
    }
    if (act === 'add') {
      addToPlaylist([item]);
      return;
    }
    if (act === 'del') {
      if (item.locked) {
        toast('内置音乐不可删除');
        return;
      }
      if (source === 'playlist') removeFromPlaylist([item.url]);
      else deleteFromHistory([item.url]);
    }
  }

  function addToPlaylist(items) {
    const pl = getPlaylist();
    let added = 0;
    items.forEach((it) => {
      if (!pl.some((x) => x.url === it.url)) {
        pl.push({ url: it.url, name: it.name });
        added++;
      }
    });
    savePlaylist(pl);
    if (items.length === 1 && added === 0) toast('该音频已在播放列表中');
    else if (added > 0) toast('已添加 ' + added + ' 首到播放列表');
    if (added > 0 && getMode() === 'loop') AudioManager.setCustomLoop(true);
    clearSelection();
    renderAll();
  }

  function removeFromPlaylist(urls) {
    const set = new Set(urls);
    savePlaylist(getPlaylist().filter((x) => !set.has(x.url)));
    if (set.has(currentUrl)) {
      // 删掉正在播的那首 → 按当前模式切下一首，列表空了就停
      if (getPlaylist().length) nextTrack();
      else stopCustom();
    }
    clearSelection();
    toast('已从播放列表移除');
    renderAll();
  }

  function deleteFromHistory(urls) {
    // 内置音乐永远保留
    const del = urls.filter((u) => !isBuiltin(u));
    if (!del.length) {
      toast('内置音乐不可删除');
      clearSelection();
      return;
    }
    const set = new Set(del);
    saveHistory(getHistory().filter((x) => !set.has(x.url)));
    savePlaylist(getPlaylist().filter((x) => !set.has(x.url)));
    if (set.has(currentUrl)) stopCustom();
    clearSelection();
    toast('已删除 ' + del.length + ' 条记录' + (del.length < urls.length ? '（内置音乐不可删除）' : ''));
    renderAll();
  }

  function clearSelection() {
    selected.clear();
    Object.keys(SOURCES).forEach((s) => syncBatch(s));
  }

  // ==================== 重命名 ====================
  function openRename(item, backTo) {
    renameTarget = item;
    renameBackTo = backTo || '';
    const inp = $('input-rename');
    if (inp) inp.value = item.name;
    show('rename-menu');
    setTimeout(() => { if (inp) { inp.focus(); inp.select(); } }, 60);
  }

  function commitRename() {
    if (!renameTarget) return;
    const inp = $('input-rename');
    const name = ((inp && inp.value) || '').trim();
    if (!name) {
      toast('名称不能为空');
      return;
    }
    const url = renameTarget.url;
    const h = getHistory().map((x) => (x.url === url ? { url: x.url, name: name } : x));
    saveHistory(h);
    const pl = getPlaylist().map((x) => (x.url === url ? { url: x.url, name: name } : x));
    savePlaylist(pl);
    hide('rename-menu');
    renameTarget = null;
    toast('已重命名为「' + name + '」');
    renderAll();
    // 导入流程改名后，直接带到音乐库，让用户看到刚入库的歌
    const back = renameBackTo;
    renameBackTo = '';
    if (back) {
      hideSiblings();
      show(back);
    }
  }

  // ==================== 导入 ====================
  // 支持三种输入：
  //   1) 以 .mp3 / .m4a 结尾的音频直链（原样入库）
  //   2) 网易云音乐歌曲链接（song?id=数字）
  //   3) QQ 音乐歌曲链接（songDetail/歌曲mid）
  // 原理：歌曲页链接本身不是音频，交给公共解析接口换成 MP3 音频流地址（接口侧已转码成 mp3），
  //      再当作普通音频入库；网页本身没法转码（没有服务器、CDN 也不给跨域读流），
  //      但存的是 MP3 播放地址，播放体验和直链一致。
  const LINK_URL_APIS = {
    netease: [
      (id) => 'https://api.qijieya.cn/meting/?server=netease&type=url&id=' + id,
      (id) => 'https://api.injahow.cn/meting/?server=netease&type=url&id=' + id,
      (id) => 'https://music.163.com/song/media/outer/url?id=' + id + '.mp3'
    ],
    tencent: [
      (mid) => 'https://api.qijieya.cn/meting/?server=tencent&type=url&id=' + mid,
      (mid) => 'https://api.injahow.cn/meting/?server=tencent&type=url&id=' + mid
    ]
  };
  const LINK_NAME_APIS = {
    netease: (id) => 'https://api.qijieya.cn/meting/?server=netease&type=name&id=' + id,
    tencent: (mid) => 'https://api.qijieya.cn/meting/?server=tencent&type=name&id=' + mid
  };

  let importing = false;

  // 判断输入是什么：音频直链 / 网易云歌曲页 / QQ音乐歌曲页或分享短链 / 《歌名》文本
  // 从一段分享文字里捞第一个链接
  function extractUrl(text) {
    const m = /https?:\/\/[^\s"'<>，。、）)】]+/i.exec(String(text || ''));
    return m ? m[0] : '';
  }

  function parseMusicLink(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;

    // 分享文本里常带「歌手《歌名》」，单独抽出来做搜索兜底
    const tm = /《([^《》]{1,40})》/.exec(s);
    const title = tm ? tm[1].trim() : '';
    const artist = tm ? s.slice(0, tm.index).replace(/[\s@.·、，,—\-]+$/, '').trim() : '';

    // 网易云：music.163.com/song?id=123 / y.music.163.com/m/song?id=123 / #/song?id=123
    if (/music\.163\.com|163cn\.tv/i.test(s)) {
      let id = '';
      const q = /[?&#]id=(\d+)/i.exec(s);
      if (q) id = q[1];
      if (!id) {
        const p = /\/song\/(\d+)/i.exec(s);
        if (p) id = p[1];
      }
      return { source: 'netease', id: id, label: '网易云音乐', title: title, artist: artist };
    }

    // QQ音乐：y.qq.com/n/ryqq/songDetail/xxx / playsong.html?songmid=xxx
    // 分享短链：c6.y.qq.com/base/fcgi-bin/u?__=xxxx（拿不到歌曲 id，要靠《歌名》搜索）
    if (/y\.qq\.com|qq\.com\/n\/ryqq/i.test(s)) {
      let mid = '';
      const a = /songDetail\/([0-9A-Za-z]+)/i.exec(s);
      if (a) mid = a[1];
      if (!mid) {
        const b = /[?&#]songmid=([0-9A-Za-z]+)/i.exec(s);
        if (b) mid = b[1];
      }
      if (!mid) {
        const c = /[?&#]mid=([0-9A-Za-z]+)/i.exec(s);
        if (c) mid = c[1];
      }
      return { source: 'tencent', id: mid, label: 'QQ音乐', title: title, artist: artist };
    }

    // 没有链接、只有《歌名》（可能带歌手）→ 直接按歌名搜
    if (title) return { source: 'search', id: '', label: '歌曲', title: title, artist: artist };
    return null;
  }

  function fetchText(url, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (!done) { done = true; resolve(''); }
      }, timeoutMs || 8000);
      fetch(url)
        .then((r) => (r.ok ? r.text() : ''))
        .then((txt) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve((txt || '').trim());
        })
        .catch(() => {
          if (!done) { done = true; clearTimeout(timer); resolve(''); }
        });
    });
  }

  // 试着真正加载音频，能解出时长才算可用（302 到 404 的链接会触发 error）
  function probeAudio(url, timeoutMs) {
    return new Promise((resolve) => {
      const a = new Audio();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try { a.pause(); a.removeAttribute('src'); } catch (e) { /* ignore */ }
        resolve(ok);
      };
      a.preload = 'metadata';
      a.addEventListener('loadedmetadata', () => finish(isFinite(a.duration) && a.duration > 0));
      a.addEventListener('error', () => finish(false));
      a.src = url;
      setTimeout(() => finish(false), timeoutMs || 9000);
    });
  }

  async function resolveSongName(link) {
    const fn = LINK_NAME_APIS[link.source];
    if (!fn || !link.id) return '';
    const txt = await fetchText(fn(link.id), 6000);
    // 正常返回纯歌名；报错时是 JSON/HTML
    if (!txt || txt.length > 60 || /^[{<]/.test(txt)) return '';
    return txt;
  }

  async function resolveSongUrl(link) {
    const list = LINK_URL_APIS[link.source] || [];
    for (let i = 0; i < list.length; i++) {
      const url = list[i](link.id);
      // 逐个验证，能用就返回（多个接口互为备份）
      const ok = await probeAudio(url, 9000);
      if (ok) return url;
    }
    return '';
  }

  function fetchJson(url, timeoutMs) {
    return fetchText(url, timeoutMs).then((txt) => {
      try { return JSON.parse(txt); } catch (e) { return null; }
    });
  }

  // -------------------- QQ 音乐分享短链 (c6.y.qq.com/.../?__=xxx) --------------------
  // 浏览器读不到跨域 302 的 Location，只能借公共代理把跳转后的页面拿回来，
  // 从页面里挖 songmid / 歌名。代理不一定通，所以下面还有「按歌名搜索」兜底。
  const SHORT_PROXIES = [
    (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
    (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
    (u) => 'https://api.cors.lol/?url=' + encodeURIComponent(u),
    (u) => 'https://r.jina.ai/' + u
  ];

  // 并发去问几个代理，谁先回来用谁（整体最多等 9 秒）
  function fetchHtmlViaProxy(url, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (html) => {
        if (done) return;
        done = true;
        resolve(html || '');
      };
      const timer = setTimeout(() => finish(''), timeoutMs || 9000);
      SHORT_PROXIES.forEach((fn) => {
        fetchText(fn(url), 8000).then((html) => {
          if (done) return;
          if (html && html.length > 200 && /songmid|songDetail|__ssr|playsong/i.test(html)) {
            clearTimeout(timer);
            finish(html);
          }
        }).catch(() => {});
      });
    });
  }

  function qqMidFromHtml(html) {
    const h = String(html || '');
    const patterns = [
      /songmid=([0-9A-Za-z]{10,16})/i,
      /songDetail\/([0-9A-Za-z]{10,16})/i,
      /"songmid"\s*:\s*"([0-9A-Za-z]{10,16})"/i,
      /media_mid=([0-9A-Za-z]{10,16})/i
    ];
    for (let i = 0; i < patterns.length; i++) {
      const m = patterns[i].exec(h);
      if (m) return m[1];
    }
    return '';
  }

  // 从页面标题里拆「歌名 - 歌手」
  function titleFromHtml(html) {
    const h = String(html || '');
    const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(h) ||
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(h);
    const t = og ? og[1] : ((/<title>([^<]+)<\/title>/i.exec(h) || [])[1] || '');
    if (!t) return { title: '', artist: '' };
    const parts = t.split(/\s*[-–—|]\s*/).map((x) => x.trim()).filter(Boolean);
    const title = (parts[0] || '').replace(/^《|》$/g, '').trim();
    let artist = parts[1] || '';
    if (/音乐|QQ|歌单|专辑/.test(artist)) artist = '';
    return { title: title, artist: artist };
  }

  // 短链 → songmid（拿不到就返回空，交给歌名搜索）
  async function resolveQQShortLink(url) {
    const html = await fetchHtmlViaProxy(url, 9000);
    if (!html) return null;
    const mid = qqMidFromHtml(html);
    const info = titleFromHtml(html);
    if (!mid && !info.title) return null;
    return { mid: mid, title: info.title, artist: info.artist };
  }

  // 从搜索结果里挑最匹配的：歌名对上；歌手也对上的一票通过
  function pickMatch(list, link) {
    const t = (link.title || '').trim();
    let best = null;
    for (let i = 0; i < list.length; i++) {
      const it = list[i] || {};
      const name = String(it.name || '').trim();
      if (!name) continue;
      if (name.indexOf(t) < 0 && t.indexOf(name) < 0) continue;
      const artistStr = Array.isArray(it.artist) ? it.artist.join(' ') : String(it.artist || '');
      if (link.artist && artistStr.indexOf(link.artist) >= 0) return it;
      if (!best) best = it;
    }
    return best;
  }

  // 分享短链（拿不到歌曲 id）或只粘了《歌名》→ 先搜 QQ 音乐，搜不到再搜网易云
  async function searchSong(link) {
    const kw = (link.artist ? link.artist + ' ' : '') + link.title;

    // 1) QQ 音乐搜索（结果里的 url 带 songmid）
    const qq = await fetchJson('https://api.qijieya.cn/meting/?server=tencent&type=search&id=' + encodeURIComponent(kw), 8000);
    if (Array.isArray(qq)) {
      const hit = pickMatch(qq, link);
      const mid = hit && /id=([0-9A-Za-z]+)/.exec(hit.url || '');
      if (mid && mid[1]) {
        const url = 'https://api.qijieya.cn/meting/?server=tencent&type=url&id=' + mid[1];
        if (await probeAudio(url, 9000)) {
          return { url: url, name: (hit.name || link.title) + ' - ' + (hit.artist || link.artist || '') };
        }
      }
    }

    // 2) 网易云搜索兜底
    const ne = await fetchJson('https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=' +
      encodeURIComponent(link.title) + '&count=10', 8000);
    if (Array.isArray(ne)) {
      const hit = pickMatch(ne, link);
      if (hit && hit.id) {
        const url = 'https://api.qijieya.cn/meting/?server=netease&type=url&id=' + hit.id;
        if (await probeAudio(url, 9000)) {
          const artist = Array.isArray(hit.artist) ? hit.artist.join('/') : (hit.artist || link.artist || '');
          return { url: url, name: (hit.name || link.title) + (artist ? ' - ' + artist : '') };
        }
      }
    }
    return null;
  }

  function setImportBusy(on) {
    const btn = $('btn-save-bgm');
    if (!btn) return;
    if (on) {
      if (!btn.dataset.idleLabel) btn.dataset.idleLabel = btn.textContent;
      btn.textContent = '解析中…';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.idleLabel || '保存并播放';
      btn.disabled = false;
    }
  }

  // 入库（历史导入 + 音乐库共用同一份数据）→ 播放 → 需要时弹重命名
  function addAndPlay(item, askRename) {
    rememberHistory(item);
    const pl = getPlaylist();
    if (!pl.some((x) => x.url === item.url)) {
      pl.push(item);
      savePlaylist(pl);
    }
    playItem(item);
    renderAll();
    if (askRename) {
      hideSiblings();
      setTimeout(() => openRename(item, 'music-library-menu'), 200);
    }
  }

  // 按歌名搜索（QQ 优先，网易云兜底）
  async function startSearch(link, label) {
    if (importing) return;
    importing = true;
    setImportBusy(true);
    toast('正在搜索「' + (label || link.title) + '」…');
    try {
      const found = await searchSong(link);
      if (!found) {
        toast('没找到「' + (label || link.title) + '」的可用音源（可能是会员/版权受限歌曲）');
        return;
      }
      addAndPlay(found, true);
    } catch (e) {
      toast('搜索失败，请稍后重试');
    } finally {
      importing = false;
      setImportBusy(false);
    }
  }

  async function saveImport() {
    if (importing) return;
    const inp = $('input-custom-bgm');
    const raw = ((inp && inp.value) || '').trim();
    if (!raw) {
      toast('请粘贴音频直链 / 歌曲链接，或直接输入歌名');
      return;
    }

    const link = parseMusicLink(raw);

    // ① 不是链接：当成歌名搜；是普通音频直链：直接入库
    if (!link) {
      if (!/^https?:\/\//i.test(raw)) {
        const kw = raw.replace(/@.*$/, '').replace(/[《》]/g, '').trim();
        if (!kw) {
          toast('请粘贴链接或输入歌名');
          return;
        }
        await startSearch({ title: kw, artist: '' }, kw);
        return;
      }
      const direct = extractUrl(raw) || raw;
      addAndPlay({ url: direct, name: nameFromUrl(direct) }, false);
      return;
    }

    // ② QQ 音乐分享短链（链接里没有 songmid）：先还原短链
    if (link.source === 'tencent' && !link.id) {
      importing = true;
      setImportBusy(true);
      toast('正在解析 QQ 音乐分享链接…');
      let got = null;
      try {
        got = await resolveQQShortLink(extractUrl(raw) || raw);
      } catch (e) {
        got = null;
      }
      importing = false;
      setImportBusy(false);

      if (got && got.mid) {
        const directUrl = 'https://api.qijieya.cn/meting/?server=tencent&type=url&id=' + got.mid;
        importing = true;
        setImportBusy(true);
        const ok = await probeAudio(directUrl, 9000);
        importing = false;
        setImportBusy(false);
        if (ok) {
          const nm = (got.title || link.title || 'QQ音乐歌曲') +
            (got.artist ? ' - ' + got.artist : (link.artist ? ' - ' + link.artist : ''));
          addAndPlay({ url: directUrl, name: nm }, true);
          return;
        }
      }

      // 代理没通 → 有《歌名》就搜；连歌名都没有，就让用户补一个歌名
      const t = link.title || (got && got.title) || '';
      const a = link.artist || (got && got.artist) || '';
      if (t) {
        await startSearch({ title: t, artist: a }, t);
        return;
      }
      // 代理不通 / 分享链接里确实没有歌名 → 直接把输入框变成「歌名搜索」
      if (inp) {
        inp.value = '';
        inp.placeholder = '输入歌名即可导入，例如：褪黑素';
        try { inp.focus(); } catch (e) {}
      }
      toast('这条 QQ 短链需要歌名：直接输入歌名（如「褪黑素」）就能导入');
      return;
    }

    // ③ 完整歌曲链接
    importing = true;
    setImportBusy(true);
    toast('正在解析' + link.label + '链接…');
    try {
      const name = await resolveSongName(link);
      let url = await resolveSongUrl(link);
      // 直链解析失败但带了《歌名》→ 退回搜索（短链/会员歌常见）
      if (!url && link.title) {
        toast('链接解析失败，改用歌名搜索…');
        const found = await searchSong(link);
        if (found) {
          addAndPlay(found, true);
          return;
        }
      }
      if (!url) {
        toast('解析失败（可能是会员/版权受限歌曲），可改用 .mp3 直链');
        return;
      }
      const fallback = link.source === 'netease' ? '网易云音乐歌曲' : 'QQ音乐歌曲';
      addAndPlay({ url: url, name: name || fallback }, true);
    } catch (e) {
      toast('解析失败，请稍后重试或改用 .mp3 直链');
    } finally {
      importing = false;
      setImportBusy(false);
    }
  }

  // ==================== 面板切换 ====================
  function show(id) {
    const el = $(id);
    if (el) el.style.display = 'flex';
    // 音乐相关面板都叠在主页之上，容器保持“主页高度”
    document.body.dataset.view = 'menu';
  }
  function hide(id) {
    const el = $(id);
    if (el) el.style.display = 'none';
  }
  function hideSiblings() {
    ['settings-menu', 'volume-menu', 'custom-music-menu', 'music-history-menu', 'playlist-menu', 'music-library-menu']
      .forEach(hide);
  }

  function openPlaylist() {
    hideSiblings();
    clearSelection();
    renderAll();
    show('playlist-menu');
  }

  function openImport() {
    hideSiblings();
    const inp = $('input-custom-bgm');
    if (inp) inp.value = Store.getSettings().customBgm || currentUrl || '';
    syncClearBtn();
    show('custom-music-menu');
  }

  function openHistory() {
    hideSiblings();
    clearSelection();
    renderAll();
    show('music-history-menu');
  }

  function openLibrary() {
    hideSiblings();
    clearSelection();
    renderAll();
    show('music-library-menu');
  }

  function syncClearBtn() {
    const inp = $('input-custom-bgm');
    const btn = $('btn-clear-input');
    if (!inp || !btn) return;
    btn.style.display = inp.value.trim() ? 'block' : 'none';
  }

  // ==================== 播放模式按钮 ====================
  function renderModes() {
    const m = getMode();
    [['btn-mode-seq', 'seq'], ['btn-mode-shuf', 'shuf'], ['btn-mode-loop', 'loop']].forEach(([id, key]) => {
      const b = $(id);
      if (!b) return;
      b.classList.toggle('active', m === key);
    });
  }

  // ==================== Toast ====================
  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
  }

  // ==================== 渲染总入口 ====================
  function renderAll() {
    renderList('history');
    renderList('playlist');
    renderList('library');
    renderModes();
    // 播放中标记
    if (currentUrl) {
      const cab = $('input-custom-bgm');
      if (cab && !cab.value) cab.value = currentUrl;
    }
  }

  // ==================== 绑定 ====================
  function bind() {
    const on = (id, fn) => {
      const el = $(id);
      if (el) el.addEventListener('click', fn);
    };

    on('btn-goto-playlist', openPlaylist);
    on('btn-goto-import', openImport);
    on('btn-goto-history-music', openHistory);
    on('btn-goto-library', openLibrary);
    on('btn-back-import', () => { hideSiblings(); show('settings-menu'); });
    on('btn-back-history-music', () => { hideSiblings(); show('custom-music-menu'); });
    on('btn-back-playlist', () => { hideSiblings(); show('settings-menu'); });
    on('btn-back-library', openPlaylist);

    on('btn-save-bgm', saveImport);

    on('btn-save-rename', commitRename);
    on('btn-cancel-rename', () => { hide('rename-menu'); renameTarget = null; renameBackTo = ''; });

    on('btn-mode-seq', () => setMode('seq'));
    on('btn-mode-shuf', () => setMode('shuf'));
    on('btn-mode-loop', () => setMode('loop'));

    on('btn-reset-bgm', () => {
      storeResetBgm();
    });

    // 批量操作
    on('btn-batch-add', () => addToPlaylist(getHistory().filter((x) => selected.has(x.url))));
    on('btn-batch-del', () => deleteFromHistory(Array.from(selected)));
    on('btn-batch-cancel', clearSelection);

    on('btn-lib-batch-add', () => addToPlaylist(getHistory().filter((x) => selected.has(x.url))));
    on('btn-lib-batch-del', () => deleteFromHistory(Array.from(selected)));
    on('btn-lib-batch-cancel', clearSelection);

    on('btn-pl-batch-del', () => removeFromPlaylist(Array.from(selected)));
    on('btn-pl-batch-cancel', clearSelection);

    const inp = $('input-custom-bgm');
    if (inp) {
      inp.addEventListener('input', syncClearBtn);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveImport();
      });
    }
    on('btn-clear-input', () => {
      if (inp) inp.value = '';
      syncClearBtn();
    });

    const renameInput = $('input-rename');
    if (renameInput) {
      renameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commitRename();
        if (e.key === 'Escape') { hide('rename-menu'); renameTarget = null; renameBackTo = ''; }
      });
    }

    // 点击遮罩关闭（重命名/列表类）
    document.querySelectorAll('.overlay').forEach((ov) => {
      ov.addEventListener('click', (e) => {
        if (e.target !== ov) return;
        if (['main-menu', 'level-clear', 'game-over', 'game-complete'].indexOf(ov.id) >= 0) return;
        if (ov.id === 'rename-menu') { renameTarget = null; renameBackTo = ''; }
        ov.style.display = 'none';
      });
    });
  }

  function storeResetBgm() {
    AudioManager.stopCustom();
    Store.setSettings({ customBgm: '' });
    currentUrl = '';
    AudioManager.startBGM();
    renderAll();
    toast('已恢复默认音乐');
  }

  // 外部（game.js）在开场恢复上次的自定义音乐用
  function restore() {
    const url = (Store.getSettings().customBgm || '').trim();
    if (!url) return;
    currentUrl = url;
    const pl = getPlaylist();
    const idx = pl.findIndex((x) => x.url === url);
    if (idx < 0) {
      AudioManager.playCustom(url, null, { loop: true });
    } else if (getMode() === 'loop') {
      AudioManager.playCustom(url, null, { loop: true });
    } else {
      AudioManager.playCustom(url, null, { loop: false, onEnded: () => nextTrack() });
    }
  }

  // 预加载曲目：把播放列表 / 音乐库 / 内置曲目先灌进 <audio> 池，
  // 之后切歌不用等加载，直接出声（换歌、循环都不留空档）
  function warmCache() {
    if (!AudioManager.preloadCustom) return;
    const urls = getPlaylist().map((x) => x.url)
      .concat(getBuiltin().map((x) => x.url))
      .concat(getHistory().map((x) => x.url));
    AudioManager.preloadCustom(urls);
  }

  function init() {
    bind();
    // 兼容 v1 的 key（老用户数据不丢）
    const legacyH = read('nailong_music_history', null);
    if (legacyH && !read(K.history, null)) write(K.history, norm(legacyH));
    const legacyP = read('nailong_playlist', null);
    if (legacyP && !read(K.playlist, null)) write(K.playlist, norm(legacyP));
    renderAll();
    warmCache();
  }

  global.Music = {
    init, renderAll, restore, playItem, nextTrack, stopCustom, warmCache,
    getHistory, getPlaylist, getMode, setMode, openPlaylist
  };
})(window);
