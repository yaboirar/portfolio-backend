(() => {
  'use strict';

  const STAGGER = 0.035;
  const MIN_PANEL = 180;
  const DEFAULT_BASIS = { videos: '38%', photos: '34%', poems: '28%' };

  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    videos: [], photos: [], poems: [],
    filter: 'all',
    dockOpen: false,
    lightboxIndex: -1,
    previewUrl: null,
    token: sessionStorage.getItem('admin_token') || '',
  };

  const dom = {
    hoverNav: $('hover-nav'),
    navBtns: $$('[data-filter]'),
    focusBtns: $$('[data-focus]'),
    themeSwitch: $('theme-switch'),
    dockToggle: $('dock-toggle'),
    authDot: $('auth-dot'),
    stageDock: $('stage-dock'),
    panels: { videos: $('panel-videos'), photos: $('panel-photos'), poems: $('panel-poems') },
    lists: { videos: $('list-videos'), photos: $('list-photos'), poems: $('list-poems') },
    counts: { videos: $('count-videos'), photos: $('count-photos'), poems: $('count-poems') },
    splitterVP: $('splitter-vp'),
    splitterPP: $('splitter-pp'),
    dockSplitter: $('dock-splitter'),
    slotSplitter: $('slot-splitter'),
    sideDock: $('side-dock'),
    dockClose: $('dock-close'),
    dockModeBtns: $$('.dock-mode-btn'),
    adminToken: $('admin-token'),
    saveToken: $('save-token'),
    uploadForm: $('upload-form'),
    mediaSlot: $('media-slot'),
    uploadFile: $('upload-file'),
    mediaSlotPreview: $('media-slot-preview'),
    mediaSlotEmpty: $('media-slot-empty'),
    uploadTitle: $('upload-title'),
    uploadDesc: $('upload-desc'),
    uploadMeter: $('upload-meter'),
    uploadMeterFill: $('upload-meter-fill'),
    uploadFeedback: $('upload-feedback'),
    uploadSubmit: $('upload-submit'),
    poemForm: $('poem-form'),
    poemTitle: $('poem-title'),
    poemContent: $('poem-content'),
    poemFeedback: $('poem-feedback'),
    poemSubmit: $('poem-submit'),
    lightbox: $('lightbox'),
    lbTitle: $('lb-title'),
    lbDesc: $('lb-desc'),
    lbCanvas: $('lb-canvas'),
    lbPrev: $('lb-prev'),
    lbNext: $('lb-next'),
    lbClose: $('lb-close'),
  };

  /* ---- Text roll (navigation only) ---- */
  function createTextRollNode(text, center, extraClass) {
    const root = document.createElement('span');
    root.className = `text-roll ${extraClass || ''}`.trim();
    const chars = String(text).split('');
    const len = chars.length;

    const buildLayer = (cls, hidden) => {
      const layer = document.createElement('span');
      layer.className = `text-roll-layer ${cls}`;
      if (hidden) layer.setAttribute('aria-hidden', 'true');
      chars.forEach((ch, i) => {
        const s = document.createElement('span');
        s.className = 'text-roll-char';
        const delay = center ? STAGGER * Math.abs(i - (len - 1) / 2) : STAGGER * i;
        s.style.setProperty('--char-delay', `${delay.toFixed(4)}s`);
        s.textContent = ch === ' ' ? '\u00A0' : ch;
        layer.appendChild(s);
      });
      return layer;
    };

    root.append(buildLayer('text-roll-layer--top', false), buildLayer('text-roll-layer--bottom', true));
    return root;
  }

  function hydrateTextRolls() {
    $$('.js-text-roll').forEach((node) => {
      const text = node.dataset.text || node.textContent.trim();
      const extra = Array.from(node.classList).filter((c) => c !== 'js-text-roll').join(' ');
      node.replaceWith(createTextRollNode(text, node.dataset.center === 'true', extra));
    });
  }

  /* ---- Drag helper shared by every splitter ---- */
  function makeDraggable(handle, { onStart, onMove, onKey }) {
    let active = false;

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (onStart && onStart(e) === false) return;
      active = true;
      handle.setPointerCapture(e.pointerId);
      handle.classList.add('is-active');
      document.body.classList.add('is-resizing');
    });

    handle.addEventListener('pointermove', (e) => {
      if (active) onMove(e);
    });

    const end = () => {
      if (!active) return;
      active = false;
      handle.classList.remove('is-active');
      document.body.classList.remove('is-resizing');
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);

    if (onKey) {
      handle.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); onKey(-step); }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); onKey(step); }
      });
    }
  }

  function initWorkspaceSplitters() {
    // Panel <-> panel
    [dom.splitterVP, dom.splitterPP].forEach((splitter) => {
      const left = $(splitter.dataset.left);
      const right = $(splitter.dataset.right);
      let startX = 0, startL = 0, startR = 0;

      const apply = (newL, combined) => {
        const total = dom.stageDock.getBoundingClientRect().width;
        const l = Math.min(Math.max(newL, MIN_PANEL), combined - MIN_PANEL);
        left.style.flexBasis = `${(l / total) * 100}%`;
        right.style.flexBasis = `${((combined - l) / total) * 100}%`;
      };

      makeDraggable(splitter, {
        onStart: (e) => {
          if (left.hidden || right.hidden) return false;
          startX = e.clientX;
          startL = left.getBoundingClientRect().width;
          startR = right.getBoundingClientRect().width;
        },
        onMove: (e) => apply(startL + (e.clientX - startX), startL + startR),
        onKey: (d) => {
          const l = left.getBoundingClientRect().width;
          const r = right.getBoundingClientRect().width;
          apply(l + d, l + r);
        },
      });

      splitter.addEventListener('dblclick', () => {
        Object.entries(DEFAULT_BASIS).forEach(([k, v]) => { dom.panels[k].style.flexBasis = v; });
      });
    });

    // Upload dock width
    const setDockW = (w) => {
      const clamped = Math.min(Math.max(w, 280), window.innerWidth * 0.65);
      document.documentElement.style.setProperty('--side-dock-w', `${clamped}px`);
    };
    makeDraggable(dom.dockSplitter, {
      onMove: (e) => setDockW(window.innerWidth - e.clientX),
      onKey: (d) => setDockW(dom.sideDock.getBoundingClientRect().width - d),
    });

    // Dropzone height
    let startY = 0, startH = 0;
    const setSlotH = (h) => {
      const clamped = Math.min(Math.max(h, 90), window.innerHeight * 0.65);
      document.documentElement.style.setProperty('--slot-h', `${clamped}px`);
    };
    makeDraggable(dom.slotSplitter, {
      onStart: (e) => {
        startY = e.clientY;
        startH = dom.mediaSlot.getBoundingClientRect().height;
      },
      onMove: (e) => setSlotH(startH + (e.clientY - startY)),
      onKey: (d) => setSlotH(dom.mediaSlot.getBoundingClientRect().height + d),
    });
  }

  /* ---- View filter and dock ---- */
  function setFilter(next) {
    state.filter = next;
    const isAll = next === 'all';

    dom.navBtns.forEach((btn) => {
      const on = btn.dataset.filter === next;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });

    dom.hoverNav.classList.toggle('has-subfilter', !isAll);
    dom.stageDock.classList.toggle('is-single', !isAll);

    Object.entries(dom.panels).forEach(([key, panel]) => {
      panel.hidden = !isAll && next !== key;
    });
    dom.splitterVP.hidden = !isAll;
    dom.splitterPP.hidden = !isAll;

    dom.focusBtns.forEach((btn) => { btn.textContent = isAll ? 'Expand' : 'Show all'; });
  }

  function toggleSideDock(force) {
    state.dockOpen = typeof force === 'boolean' ? force : !state.dockOpen;
    dom.sideDock.classList.toggle('is-open', state.dockOpen);
    dom.sideDock.setAttribute('aria-hidden', String(!state.dockOpen));
    dom.dockSplitter.hidden = !state.dockOpen;
    dom.dockToggle.setAttribute('aria-expanded', String(state.dockOpen));
  }

  /* ---- Data ---- */
  function unwrapArray(payload, keys) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
      for (const k of keys) if (Array.isArray(payload[k])) return payload[k];
    }
    return [];
  }

  function resolvePath(u) {
    if (!u) return '';
    return u.startsWith('/') || u.startsWith('http') ? u : '/' + u;
  }

  function isVideoItem(item) {
    const t = String(item.media_type || item.type || item.file_type || item.mime_type || '').toLowerCase();
    if (t.includes('video')) return true;
    if (t.includes('image') || t.includes('photo')) return false;
    const u = String(item.relative_url || item.url || item.filename || '').toLowerCase();
    return u.includes('/videos/') || /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(u);
  }

  async function fetchPortfolio() {
    try {
      const [mRes, pRes] = await Promise.all([fetch('/api/media'), fetch('/api/poems')]);
      const mJson = mRes.ok ? await mRes.json() : [];
      const pJson = pRes.ok ? await pRes.json() : [];

      state.videos = [];
      state.photos = [];
      unwrapArray(mJson, ['media', 'items', 'data']).forEach((m) => {
        const entry = {
          id: m.id,
          title: m.title || 'Untitled',
          description: m.description || '',
          url: resolvePath(m.relative_url || m.url || m.file_path),
        };
        (isVideoItem(m) ? state.videos : state.photos).push(entry);
      });

      state.poems = unwrapArray(pJson, ['poems', 'items', 'data']).map((p) => ({
        id: p.id,
        title: p.title || 'Untitled',
        content: p.content || p.body || p.text || p.poem || '',
      }));

      renderPanels();
    } catch (err) {
      console.error('Failed to load portfolio:', err);
      Object.values(dom.lists).forEach((list) => {
        list.replaceChildren(makeMessage('Could not load the portfolio. Reload the page to try again.'));
      });
    }
  }

  function makeMessage(text) {
    const div = document.createElement('p');
    div.className = 'empty-pane';
    div.textContent = text;
    return div;
  }

  function buildDeleteButton(onClick) {
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'work-delete';
    del.textContent = 'Delete';
    del.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return del;
  }

  function buildCaption(item, endpoint) {
    const cap = document.createElement('figcaption');
    cap.className = 'work-caption';

    const left = document.createElement('div');
    left.className = 'work-caption-left';
    const title = document.createElement('span');
    title.className = 'work-title';
    title.textContent = item.title;
    left.appendChild(title);
    if (item.description) {
      const desc = document.createElement('span');
      desc.className = 'work-desc';
      desc.textContent = item.description;
      left.appendChild(desc);
    }
    cap.appendChild(left);

    if (state.token && item.id !== undefined) {
      cap.appendChild(buildDeleteButton(() => deleteEntry(endpoint, item.id, item.title)));
    }
    return cap;
  }

  function renderPanels() {
    dom.counts.videos.textContent = state.videos.length || '';
    dom.counts.photos.textContent = state.photos.length || '';
    dom.counts.poems.textContent = state.poems.length || '';

    // Videos
    dom.lists.videos.replaceChildren();
    if (!state.videos.length) dom.lists.videos.appendChild(makeMessage('No videos yet.'));
    state.videos.forEach((v) => {
      const fig = document.createElement('figure');
      fig.className = 'work-item';
      const wrap = document.createElement('div');
      wrap.className = 'work-media-wrap';
      const video = document.createElement('video');
      video.src = v.url;
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      wrap.appendChild(video);
      fig.append(wrap, buildCaption(v, 'media'));
      dom.lists.videos.appendChild(fig);
    });

    // Photos
    dom.lists.photos.replaceChildren();
    if (!state.photos.length) dom.lists.photos.appendChild(makeMessage('No photos yet.'));
    state.photos.forEach((p, idx) => {
      const fig = document.createElement('figure');
      fig.className = 'work-item';
      const wrap = document.createElement('div');
      wrap.className = 'work-media-wrap';
      wrap.addEventListener('click', () => openLightbox(idx));
      const img = document.createElement('img');
      img.src = p.url;
      img.alt = p.title;
      img.loading = 'lazy';
      wrap.appendChild(img);
      fig.append(wrap, buildCaption(p, 'media'));
      dom.lists.photos.appendChild(fig);
    });

    // Poems
    dom.lists.poems.replaceChildren();
    if (!state.poems.length) dom.lists.poems.appendChild(makeMessage('No poems yet.'));
    state.poems.forEach((poem) => {
      const article = document.createElement('article');
      article.className = 'poem-card';
      const head = document.createElement('div');
      head.className = 'poem-card-head';
      const title = document.createElement('h3');
      title.className = 'poem-card-title';
      title.textContent = poem.title;
      head.appendChild(title);
      if (state.token && poem.id !== undefined) {
        head.appendChild(buildDeleteButton(() => deleteEntry('poems', poem.id, poem.title)));
      }
      const body = document.createElement('div');
      body.className = 'poem-card-body';
      body.textContent = poem.content;
      article.append(head, body);
      dom.lists.poems.appendChild(article);
    });
  }

  /* ---- Upload, publish, delete ---- */
  function syncTokenUI() {
    dom.adminToken.value = state.token;
    dom.authDot.hidden = !state.token;
  }

  function storeToken(token) {
    state.token = token;
    sessionStorage.setItem('admin_token', token);
    syncTokenUI();
  }

  async function deleteEntry(endpoint, id, label) {
    if (!state.token) return;
    if (!window.confirm(`Delete "${label}"? This can't be undone.`)) return;
    const res = await fetch(`/api/${endpoint}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Token': state.token },
    });
    if (res.ok) fetchPortfolio();
    else window.alert(res.status === 401 || res.status === 403
      ? 'Delete failed: the admin token was rejected.'
      : `Delete failed (error ${res.status}).`);
  }

  function updateSlotPreview() {
    if (state.previewUrl) { URL.revokeObjectURL(state.previewUrl); state.previewUrl = null; }
    dom.mediaSlotPreview.replaceChildren();

    const file = dom.uploadFile.files[0];
    dom.mediaSlotPreview.hidden = !file;
    dom.mediaSlotEmpty.hidden = !!file;
    if (!file) return;

    state.previewUrl = URL.createObjectURL(file);
    if (!dom.uploadTitle.value.trim()) {
      dom.uploadTitle.value = file.name.replace(/\.[^.]+$/, '');
    }

    let el = null;
    if (file.type.startsWith('video/')) {
      el = document.createElement('video');
      el.controls = true;
      el.muted = true;
      el.playsInline = true;
    } else if (file.type.startsWith('image/')) {
      el = document.createElement('img');
      el.alt = file.name;
    }
    if (el) {
      el.src = state.previewUrl;
      dom.mediaSlotPreview.appendChild(el);
    }
  }

  function handleMediaUpload(e) {
    e.preventDefault();
    const token = dom.adminToken.value.trim() || state.token;
    const file = dom.uploadFile.files[0];

    if (!token) { dom.uploadFeedback.textContent = 'Enter your admin token first.'; return; }
    if (!file) { dom.uploadFeedback.textContent = 'Choose a video or photo.'; return; }

    storeToken(token);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', dom.uploadTitle.value.trim());
    fd.append('description', dom.uploadDesc.value.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    xhr.setRequestHeader('X-Admin-Token', token);

    dom.uploadSubmit.disabled = true;
    dom.uploadMeter.hidden = false;
    dom.uploadMeterFill.style.width = '0%';
    dom.uploadFeedback.textContent = 'Uploading 0%';

    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      const pct = Math.round((ev.loaded / ev.total) * 100);
      dom.uploadMeterFill.style.width = `${pct}%`;
      dom.uploadFeedback.textContent = `Uploading ${pct}%`;
    };

    xhr.onload = async () => {
      dom.uploadSubmit.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        dom.uploadForm.reset();
        updateSlotPreview();
        dom.uploadFeedback.textContent = 'Uploaded';
        setTimeout(() => { dom.uploadMeter.hidden = true; }, 600);
        await fetchPortfolio();
      } else {
        dom.uploadFeedback.textContent = xhr.status === 401 || xhr.status === 403
          ? 'Upload failed: the admin token was rejected.'
          : `Upload failed (error ${xhr.status}).`;
      }
    };

    xhr.onerror = () => {
      dom.uploadSubmit.disabled = false;
      dom.uploadFeedback.textContent = 'Upload failed: could not reach the server.';
    };

    xhr.send(fd);
  }

  async function handlePoemPublish(e) {
    e.preventDefault();
    const token = dom.adminToken.value.trim() || state.token;
    if (!token) { dom.poemFeedback.textContent = 'Enter your admin token first.'; return; }

    storeToken(token);
    dom.poemSubmit.disabled = true;
    dom.poemFeedback.textContent = 'Publishing';

    try {
      const res = await fetch('/api/poems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
        body: JSON.stringify({
          title: dom.poemTitle.value.trim(),
          content: dom.poemContent.value.trim(),
        }),
      });
      if (!res.ok) {
        dom.poemFeedback.textContent = res.status === 401 || res.status === 403
          ? 'Publish failed: the admin token was rejected.'
          : `Publish failed (error ${res.status}).`;
        return;
      }
      dom.poemForm.reset();
      dom.poemFeedback.textContent = 'Published';
      await fetchPortfolio();
    } catch {
      dom.poemFeedback.textContent = 'Publish failed: could not reach the server.';
    } finally {
      dom.poemSubmit.disabled = false;
    }
  }

  /* ---- Lightbox ---- */
  function openLightbox(index) {
    state.lightboxIndex = index;
    updateLightbox();
    dom.lightbox.hidden = false;
    dom.lightbox.setAttribute('aria-hidden', 'false');
    dom.lbClose.focus();
  }

  function closeLightbox() {
    dom.lbCanvas.replaceChildren();
    dom.lightbox.hidden = true;
    dom.lightbox.setAttribute('aria-hidden', 'true');
  }

  function stepLightbox(delta) {
    const len = state.photos.length;
    if (!len) return;
    state.lightboxIndex = (state.lightboxIndex + delta + len) % len;
    updateLightbox();
  }

  function updateLightbox() {
    const item = state.photos[state.lightboxIndex];
    if (!item) return;
    dom.lbTitle.textContent = item.title;
    dom.lbDesc.textContent = item.description || '';
    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.title;
    dom.lbCanvas.replaceChildren(img);
  }

  /* ---- Init ---- */
  function init() {
    let savedTheme = 'dark';
    try { savedTheme = localStorage.getItem('portfolio_theme') || 'dark'; } catch {}
    document.documentElement.setAttribute('data-theme', savedTheme);

    hydrateTextRolls();
    syncTokenUI();
    initWorkspaceSplitters();

    dom.themeSwitch.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('portfolio_theme', next); } catch {}
    });

    dom.navBtns.forEach((btn) => btn.addEventListener('click', () => setFilter(btn.dataset.filter)));
    dom.focusBtns.forEach((btn) => btn.addEventListener('click', () => {
      setFilter(state.filter === btn.dataset.focus ? 'all' : btn.dataset.focus);
    }));

    dom.dockToggle.addEventListener('click', () => toggleSideDock());
    dom.dockClose.addEventListener('click', () => toggleSideDock(false));

    dom.saveToken.addEventListener('click', () => {
      storeToken(dom.adminToken.value.trim());
      renderPanels();
    });

    dom.dockModeBtns.forEach((btn) => btn.addEventListener('click', () => {
      const isMedia = btn.dataset.mode === 'media';
      dom.dockModeBtns.forEach((b) => {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-selected', String(b === btn));
      });
      dom.uploadForm.hidden = !isMedia;
      dom.poemForm.hidden = isMedia;
    }));

    dom.uploadFile.addEventListener('change', updateSlotPreview);
    dom.uploadForm.addEventListener('submit', handleMediaUpload);
    dom.poemForm.addEventListener('submit', handlePoemPublish);

    dom.lbClose.addEventListener('click', closeLightbox);
    dom.lbPrev.addEventListener('click', () => stepLightbox(-1));
    dom.lbNext.addEventListener('click', () => stepLightbox(1));

    document.addEventListener('keydown', (e) => {
      if (!dom.lightbox.hidden) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') stepLightbox(-1);
        if (e.key === 'ArrowRight') stepLightbox(1);
      } else if (state.dockOpen && e.key === 'Escape') {
        toggleSideDock(false);
      }
    });

    fetchPortfolio();
  }

  init();
})();
