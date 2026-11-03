// music.js — 音乐播放列表 / 历史导入 / 重命名 / 播放模式
// 恢复 v1 的音乐管理能力，接口统一走 AudioManager（§22），交互统一用 Pointer Events（§23）
// 暴露 window.Music

(function (global) {
  'use strict';

  const K = {
    history: 'nl2:musicHistory',
    playlist: 'nl2:playlist',
    mode: 'nl2:playMode'
  };

  const ACTION_W = 60;      // 每个滑动按钮宽度
  const LONG_PRESS = 480;   // 长按进入多选（ms）
  const MOVE_TOL = 6;       // 判定为滑动的位移阈值

  const $ = (id) => document.getElementById(id);

  let currentUrl = '';          // 当前播放的 url
  let selected = new Set();     // 多选集合（url）
  let renameTarget = null;      // { url }
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

  function getHistory() { return norm(read(K.history, [])); }
  function saveHistory(l) { write(K.history, l); }
  function getPlaylist() { return norm(read(K.playlist, [])); }
  function savePlaylist(l) { write(K.playlist, l); }

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
      onEnded: loop ? null : () => nextTrack()
    });

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
    return source === 'playlist' ? getPlaylist() : getHistory();
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

    const actW = cfg.actions.length * ACTION_W;

    list.forEach((item) => {
      const wrap = document.createElement('div');
      wrap.className = 'm-item-wrap';

      // 左滑操作区
      const acts = document.createElement('div');
      acts.className = 'm-actions';
      cfg.actions.forEach((a) => {
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
        '<span class="m-name">🎵 ' + esc(item.name) + '</span>' +
        '<span class="m-tail">' + (item.url === currentUrl ? '▶ 播放中' : '') + '</span>';

      bindRowGesture(row, item, source, actW);

      wrap.appendChild(acts);
      wrap.appendChild(row);
      box.appendChild(wrap);
    });

    syncBatch(source);
  }

  function bindRowGesture(row, item, source, actW) {
    let sx = 0, sy = 0, base = 0, dx = 0;
    let dragging = false, moved = false, lpFired = false, lp = null, pid = null;

    row.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      pid = e.pointerId;
      sx = e.clientX; sy = e.clientY; dx = 0;
      dragging = false; moved = false; lpFired = false;
      base = row.classList.contains('open') ? -actW : 0;
      try { row.setPointerCapture(pid); } catch (err) {}

      lp = setTimeout(() => {
        if (moved) return;
        lpFired = true;
        toggleSelect(item.url, row);
      }, LONG_PRESS);
    });

    row.addEventListener('pointermove', (e) => {
      if (pid !== e.pointerId) return;
      const mx = e.clientX - sx;
      const my = e.clientY - sy;

      if (!moved && Math.abs(mx) > MOVE_TOL && Math.abs(mx) > Math.abs(my)) {
        dragging = true;
        if (openRow && openRow !== row) closeOpenRow();
      }
      if (Math.abs(mx) > MOVE_TOL || Math.abs(my) > MOVE_TOL) {
        moved = true;
        if (lp) { clearTimeout(lp); lp = null; }
      }
      if (!dragging) return;

      dx = Math.max(-actW, Math.min(0, base + mx));
      row.style.transform = 'translateX(' + dx + 'px)';
    });

    const finish = (e) => {
      if (lp) { clearTimeout(lp); lp = null; }
      if (pid !== e.pointerId) return;
      pid = null;

      // 长按已经处理过选中，松手不再触发点击逻辑
      if (lpFired) {
        lpFired = false;
        return;
      }

      if (dragging) {
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
    };

    row.addEventListener('pointerup', finish);
    row.addEventListener('pointercancel', (e) => {
      if (lp) { clearTimeout(lp); lp = null; }
      pid = null;
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
    const set = new Set(urls);
    saveHistory(getHistory().filter((x) => !set.has(x.url)));
    savePlaylist(getPlaylist().filter((x) => !set.has(x.url)));
    if (set.has(currentUrl)) stopCustom();
    clearSelection();
    toast('已删除 ' + urls.length + ' 条记录');
    renderAll();
  }

  function clearSelection() {
    selected.clear();
    Object.keys(SOURCES).forEach((s) => syncBatch(s));
  }

  // ==================== 重命名 ====================
  function openRename(item) {
    renameTarget = item;
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
  }

  // ==================== 导入 ====================
  function saveImport() {
    const inp = $('input-custom-bgm');
    const url = ((inp && inp.value) || '').trim();
    if (!url) {
      toast('请填写音频直链');
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      toast('请填写以 http(s) 开头的链接');
      return;
    }
    const item = { url: url, name: nameFromUrl(url) };
    rememberHistory(item);
    const pl = getPlaylist();
    if (!pl.some((x) => x.url === url)) {
      pl.push(item);
      savePlaylist(pl);
    }
    playItem(item);
    renderAll();
  }

  // ==================== 面板切换 ====================
  function show(id) {
    const el = $(id);
    if (el) el.style.display = 'flex';
  }
  function hide(id) {
    const el = $(id);
    if (el) el.style.display = 'none';
  }
  function hideSiblings() {
    ['settings-menu', 'custom-music-menu', 'music-history-menu', 'playlist-menu', 'music-library-menu']
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
    on('btn-cancel-rename', () => { hide('rename-menu'); renameTarget = null; });

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
        if (e.key === 'Escape') { hide('rename-menu'); renameTarget = null; }
      });
    }

    // 点击遮罩关闭（重命名/列表类）
    document.querySelectorAll('.overlay').forEach((ov) => {
      ov.addEventListener('click', (e) => {
        if (e.target !== ov) return;
        if (['main-menu', 'level-clear', 'game-over', 'game-complete'].indexOf(ov.id) >= 0) return;
        if (ov.id === 'rename-menu') renameTarget = null;
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

  function init() {
    bind();
    // 兼容 v1 的 key（老用户数据不丢）
    const legacyH = read('nailong_music_history', null);
    if (legacyH && !read(K.history, null)) write(K.history, norm(legacyH));
    const legacyP = read('nailong_playlist', null);
    if (legacyP && !read(K.playlist, null)) write(K.playlist, norm(legacyP));
    renderAll();
  }

  global.Music = {
    init, renderAll, restore, playItem, nextTrack, stopCustom,
    getHistory, getPlaylist, getMode, setMode, openPlaylist
  };
})(window);
