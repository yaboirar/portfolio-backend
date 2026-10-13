(() => {
  'use strict';

  const STAGGER = 0.035;

  const state = {
    videos: [],
    photos: [],
    poems: [],
    filter: 'all',
    dockOpen: false,
    lightboxIndex: -1,
    token: sessionStorage.getItem('admin_token') || '',
  };

  const dom = {
    hoverNav: document.getElementById('hover-nav'),
    navBtns: document.querySelectorAll('[data-filter]'),
    themeSwitch: document.getElementById('theme-switch'),
    dockToggle: document.getElementById('dock-toggle'),
    authDot: document.getElementById('auth-dot'),

    stageDock: document.getElementById('stage-dock'),
    panelVideos: document.getElementById('panel-videos'),
    panelPhotos: document.getElementById('panel-photos'),
    panelPoems: document.getElementById('panel-poems'),
    splitterVP: document.getElementById('splitter-vp'),
    splitterPP: document.getElementById('splitter-pp'),
    focusBtns: document.querySelectorAll('[data-focus]'),

    listVideos: document.getElementById('list-videos'),
    listPhotos: document.getElementById('list-photos'),
    listPoems: document.getElementById('list-poems'),

    dockSplitter: document.getElementById('dock-splitter'),
    sideDock: document.getElementById('side-dock'),
    dockClose: document.getElementById('dock-close'),
    dockModeBtns: document.querySelectorAll('.dock-mode-btn'),

    adminToken: document.getElementById('admin-token'),
    saveToken: document.getElementById('save-token'),

    uploadForm: document.getElementById('upload-form'),
    mediaSlot: document.getElementById('media-slot'),
    uploadFile: document.getElementById('upload-file'),
    mediaSlotPreview: document.getElementById('media-slot-preview'),
    mediaSlotEmpty: document.getElementById('media-slot-empty'),
    slotFilename: document.getElementById('slot-filename'),
    slotFilesize: document.getElementById('slot-filesize'),
    slotSplitter: document.getElementById('slot-splitter'),

    uploadTitle: document.getElementById('upload-title'),
    uploadDesc: document.getElementById('upload-desc'),
    uploadMeter: document.getElementById('upload-meter'),
    uploadMeterFill: document.getElementById('upload-meter-fill'),
    uploadFeedback: document.getElementById('upload-feedback'),
    uploadSubmit: document.getElementById('upload-submit'),

    poemForm: document.getElementById('poem-form'),
    poemTitle: document.getElementById('poem-title'),
    poemContent: document.getElementById('poem-content'),
    poemFeedback: document.getElementById('poem-feedback'),
    poemSubmit: document.getElementById('poem-submit'),

    lightbox: document.getElementById('lightbox'),
    lbTitle: document.getElementById('lb-title'),
    lbDesc: document.getElementById('lb-desc'),
    lbCanvas: document.getElementById('lb-canvas'),
    lbPrev: document.getElementById('lb-prev'),
    lbNext: document.getElementById('lb-next'),
    lbClose: document.getElementById('lb-close'),
  };

  /* ========================================================================
     TEXT-ROLL ENGINE
     ======================================================================== */
  function createTextRollNode(text, center = false, extraClass = '') {
    const root = document.createElement('span');
    root.className = `text-roll ${extraClass}`.trim();

    const chars = String(text || '').split('');
    const len = chars.length;

    const buildLayer = (layerClass, isBottom) => {
      const layer = document.createElement('span');
      layer.className = `text-roll-layer ${layerClass}`;
      if (isBottom) layer.setAttribute('aria-hidden', 'true');

      chars.forEach((ch, i) => {
        const span = document.createElement('span');
        span.className = 'text-roll-char';
        const delay = center
          ? STAGGER * Math.abs(i - (len - 1) / 2)
          : STAGGER * i;
        span.style.setProperty('--char-delay', `${delay.toFixed(4)}s`);
        span.textContent = ch === ' ' ? '\u00A0' : ch;
        layer.appendChild(span);
      });
      return layer;
    };

    root.appendChild(buildLayer('text-roll-layer--top', false));
    root.appendChild(buildLayer('text-roll-layer--bottom', true));
    return root;
  }

  function hydrateTextRolls() {
    document.querySelectorAll('.js-text-roll').forEach((node) => {
      const text = node.dataset.text || node.textContent.trim();
      const center = node.dataset.center === 'true';
      const extraClass = Array.from(node.classList)
        .filter((c) => c !== 'js-text-roll')
        .join(' ');
      node.replaceWith(createTextRollNode(text, center, extraClass));
    });
  }

  /* ========================================================================
     AFTER EFFECTS STYLE PANEL SPLITTERS
     ======================================================================== */
  function initWorkspaceSplitters() {
    // 1. Splitters between Videos <-> Photos and Photos <-> Poems
    [dom.splitterVP, dom.splitterPP].forEach((splitter) => {
      let active = false;
      let leftPanel = null;
      let rightPanel = null;
      let startX = 0;
      let startLeftW = 0;
      let startRightW = 0;

      splitter.addEventListener('mousedown', (e) => {
        e.preventDefault();
        leftPanel = document.getElementById(splitter.dataset.left);
        rightPanel = document.getElementById(splitter.dataset.right);
        if (!leftPanel || !rightPanel || leftPanel.hidden || rightPanel.hidden) return;

        active = true;
        startX = e.clientX;
        startLeftW = leftPanel.getBoundingClientRect().width;
        startRightW = rightPanel.getBoundingClientRect().width;

        splitter.classList.add('is-active');
        document.body.classList.add('is-resizing');
      });

      window.addEventListener('mousemove', (e) => {
        if (!active) return;
        const totalStageW = dom.stageDock.getBoundingClientRect().width;
        const delta = e.clientX - startX;
        const combined = startLeftW + startRightW;

        const minW = 180;
        const newLeftW = Math.min(Math.max(startLeftW + delta, minW), combined - minW);
        const newRightW = combined - newLeftW;

        leftPanel.style.flexBasis = `${(newLeftW / totalStageW) * 100}%`;
        rightPanel.style.flexBasis = `${(newRightW / totalStageW) * 100}%`;
      });

      window.addEventListener('mouseup', () => {
        if (!active) return;
        active = false;
        splitter.classList.remove('is-active');
        document.body.classList.remove('is-resizing');
      });

      splitter.addEventListener('dblclick', () => {
        dom.panelVideos.style.flexBasis = '38%';
        dom.panelPhotos.style.flexBasis = '34%';
        dom.panelPoems.style.flexBasis = '28%';
      });
    });

    // 2. Splitter for the Right Upload Dock (pushes/shrinks main workspace)
    let dockDrag = false;
    dom.dockSplitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dockDrag = true;
      dom.dockSplitter.classList.add('is-active');
      document.body.classList.add('is-resizing');
    });

    window.addEventListener('mousemove', (e) => {
      if (!dockDrag) return;
      const newW = Math.min(Math.max(window.innerWidth - e.clientX, 280), window.innerWidth * 0.65);
      document.documentElement.style.setProperty('--side-dock-w', `${newW}px`);
    });

    window.addEventListener('mouseup', () => {
      if (!dockDrag) return;
      dockDrag = false;
      dom.dockSplitter.classList.remove('is-active');
      document.body.classList.remove('is-resizing');
    });

    // 3. Horizontal Splitter inside Upload Dock to resize the File Dropzone height
    let slotDrag = false;
    let slotStartY = 0;
    let slotStartH = 0;

    dom.slotSplitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      slotDrag = true;
      slotStartY = e.clientY;
      slotStartH = dom.mediaSlot.getBoundingClientRect().height;
      dom.slotSplitter.classList.add('is-active');
      document.body.classList.add('is-resizing');
    });

    window.addEventListener('mousemove', (e) => {
      if (!slotDrag) return;
      const nextH = Math.min(Math.max(slotStartH + (e.clientY - slotStartY), 90), window.innerHeight * 0.65);
      document.documentElement.style.setProperty('--slot-h', `${nextH}px`);
    });

    window.addEventListener('mouseup', () => {
      if (!slotDrag) return;
      slotDrag = false;
      dom.slotSplitter.classList.remove('is-active');
      document.body.classList.remove('is-resizing');
    });
  }

  /* ========================================================================
     VIEW FILTERING & DOCK TOGGLE
     ======================================================================== */
  function setFilter(nextFilter) {
    state.filter = nextFilter;

    dom.navBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.filter === nextFilter);
    });

    // Keep the hover tray visible whenever a specific sub-category is active
    dom.hoverNav.classList.toggle('has-subfilter', nextFilter !== 'all');
    dom.stageDock.classList.toggle('is-single', nextFilter !== 'all');

    const isAll = nextFilter === 'all';
    dom.panelVideos.hidden = !isAll && nextFilter !== 'videos';
    dom.panelPhotos.hidden = !isAll && nextFilter !== 'photos';
    dom.panelPoems.hidden = !isAll && nextFilter !== 'poems';

    dom.splitterVP.hidden = !isAll;
    dom.splitterPP.hidden = !isAll;

    dom.focusBtns.forEach((btn) => {
      const label = isAll ? 'EXPAND' : 'SPLIT';
      btn.replaceChildren(createTextRollNode(label, false));
    });
  }

  function toggleSideDock(forceState) {
    state.dockOpen = typeof forceState === 'boolean' ? forceState : !state.dockOpen;
    dom.sideDock.classList.toggle('is-open', state.dockOpen);
    dom.sideDock.setAttribute('aria-hidden', String(!state.dockOpen));
    dom.dockSplitter.hidden = !state.dockOpen;
    dom.dockToggle.setAttribute('aria-expanded', String(state.dockOpen));
  }

  /* ========================================================================
     DATA FETCHING & RENDERING
     ======================================================================== */
  function unwrapArray(payload, keys) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
      for (const k of keys) {
        if (Array.isArray(payload[k])) return payload[k];
      }
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
      const [mRes, pRes] = await Promise.all([
        fetch('/api/media'),
        fetch('/api/poems'),
      ]);

      const mJson = mRes.ok ? await mRes.json() : [];
      const pJson = pRes.ok ? await pRes.json() : [];

      const mediaItems = unwrapArray(mJson, ['media', 'items', 'data']);
      const poemItems = unwrapArray(pJson, ['poems', 'items', 'data']);

      state.videos = [];
      state.photos = [];

      mediaItems.forEach((m) => {
        const entry = {
          id: m.id,
          title: m.title || 'Untitled',
          description: m.description || '',
          url: resolvePath(m.relative_url || m.url || m.file_path),
        };
        if (isVideoItem(m)) state.videos.push(entry);
        else state.photos.push(entry);
      });

      state.poems = poemItems.map((p) => ({
        id: p.id,
        title: p.title || 'Untitled',
        content: p.content || p.body || p.text || p.poem || '',
      }));

      renderPanels();
    } catch (err) {
      console.error('Failed to load portfolio:', err);
    }
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
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'work-delete';
      del.textContent = 'Delete';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteEntry(endpoint, item.id);
      });
      cap.appendChild(del);
    }

    return cap;
  }

  function makeEmpty(label) {
    const div = document.createElement('div');
    div.className = 'empty-pane';
    div.textContent = `No ${label} yet.`;
    return div;
  }

  function renderPanels() {
    // Videos Panel
    dom.listVideos.replaceChildren();
    if (state.videos.length === 0) {
      dom.listVideos.appendChild(makeEmpty('videos'));
    } else {
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
        fig.appendChild(wrap);
        fig.appendChild(buildCaption(v, 'media'));
        dom.listVideos.appendChild(fig);
      });
    }

    // Photos Panel
    dom.listPhotos.replaceChildren();
    if (state.photos.length === 0) {
      dom.listPhotos.appendChild(makeEmpty('photos'));
    } else {
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
        fig.appendChild(wrap);
        fig.appendChild(buildCaption(p, 'media'));
        dom.listPhotos.appendChild(fig);
      });
    }

    // Poems Panel
    dom.listPoems.replaceChildren();
    if (state.poems.length === 0) {
      dom.listPoems.appendChild(makeEmpty('poems'));
    } else {
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
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'work-delete';
          del.textContent = 'Delete';
          del.addEventListener('click', () => deleteEntry('poems', poem.id));
          head.appendChild(del);
        }

        const body = document.createElement('div');
        body.className = 'poem-card-body';
        body.textContent = poem.content;

        article.appendChild(head);
        article.appendChild(body);
        dom.listPoems.appendChild(article);
      });
    }
  }

  /* ========================================================================
     UPLOAD, POEM PUBLISH & DELETE
     ======================================================================== */
  function syncTokenUI() {
    dom.adminToken.value = state.token;
    dom.authDot.hidden = !state.token;
  }

  async function deleteEntry(endpoint, id) {
    if (!state.token) return;
    if (!window.confirm('Delete this item?')) return;

    const res = await fetch(`/api/${endpoint}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Token': state.token },
    });

    if (res.ok) {
      fetchPortfolio();
    } else {
      window.alert(`Delete failed (${res.status})`);
    }
  }

  function updateSlotPreview() {
    const file = dom.uploadFile.files[0];
    dom.mediaSlotPreview.replaceChildren();

    if (!file) {
      dom.mediaSlotPreview.hidden = true;
      dom.mediaSlotEmpty.hidden = false;
      dom.slotFilename.textContent = 'Select or drag video / photo';
      dom.slotFilesize.textContent = 'Drag bottom edge below to resize this area';
      return;
    }

    const url = URL.createObjectURL(file);
    dom.mediaSlotEmpty.hidden = true;
    dom.mediaSlotPreview.hidden = false;

    if (file.type.startsWith('video/')) {
      const vid = document.createElement('video');
      vid.src = url;
      vid.controls = true;
      vid.muted = true;
      vid.playsInline = true;
      dom.mediaSlotPreview.appendChild(vid);
    } else if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = url;
      dom.mediaSlotPreview.appendChild(img);
    }
  }

  function handleMediaUpload(e) {
    e.preventDefault();
    const token = dom.adminToken.value.trim() || state.token;
    const file = dom.uploadFile.files[0];

    if (!token) {
      dom.uploadFeedback.textContent = 'Token required';
      return;
    }
    if (!file) {
      dom.uploadFeedback.textContent = 'Select a file';
      return;
    }

    state.token = token;
    sessionStorage.setItem('admin_token', token);
    syncTokenUI();

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
    dom.uploadFeedback.textContent = '0%';

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        dom.uploadMeterFill.style.width = `${pct}%`;
        dom.uploadFeedback.textContent = `${pct}%`;
      }
    };

    xhr.onload = async () => {
      dom.uploadSubmit.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        dom.uploadForm.reset();
        updateSlotPreview();
        dom.uploadFeedback.textContent = 'Uploaded';
        setTimeout(() => {
          dom.uploadMeter.hidden = true;
        }, 600);
        await fetchPortfolio();
      } else {
        dom.uploadFeedback.textContent = `Error ${xhr.status}`;
      }
    };

    xhr.onerror = () => {
      dom.uploadSubmit.disabled = false;
      dom.uploadFeedback.textContent = 'Network error';
    };

    xhr.send(fd);
  }

  async function handlePoemPublish(e) {
    e.preventDefault();
    const token = dom.adminToken.value.trim() || state.token;
    if (!token) {
      dom.poemFeedback.textContent = 'Token required';
      return;
    }

    state.token = token;
    sessionStorage.setItem('admin_token', token);
    syncTokenUI();

    dom.poemSubmit.disabled = true;
    dom.poemFeedback.textContent = 'Publishing...';

    try {
      const res = await fetch('/api/poems', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
        },
        body: JSON.stringify({
          title: dom.poemTitle.value.trim(),
          content: dom.poemContent.value.trim(),
        }),
      });

      if (!res.ok) throw new Error(res.status);
      dom.poemForm.reset();
      dom.poemFeedback.textContent = 'Published';
      await fetchPortfolio();
    } catch (err) {
      dom.poemFeedback.textContent = `Error ${err.message}`;
    } finally {
      dom.poemSubmit.disabled = false;
    }
  }

  /* ========================================================================
     LIGHTBOX
     ======================================================================== */
  function openLightbox(index) {
    state.lightboxIndex = index;
    updateLightbox();
    dom.lightbox.hidden = false;
    dom.lightbox.setAttribute('aria-hidden', 'false');
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

    dom.lbCanvas.replaceChildren();
    dom.lbTitle.textContent = item.title;
    dom.lbDesc.textContent = item.description || '';

    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.title;
    dom.lbCanvas.appendChild(img);
  }

  /* ========================================================================
     INIT
     ======================================================================== */
  function init() {
    const savedTheme = localStorage.getItem('portfolio_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    hydrateTextRolls();
    syncTokenUI();
    initWorkspaceSplitters();

    dom.themeSwitch.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('portfolio_theme', next);
    });

    dom.navBtns.forEach((btn) => {
      btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });

    dom.focusBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.focus;
        setFilter(state.filter === target ? 'all' : target);
      });
    });

    dom.dockToggle.addEventListener('click', () => toggleSideDock());
    dom.dockClose.addEventListener('click', () => toggleSideDock(false));

    dom.saveToken.addEventListener('click', () => {
      state.token = dom.adminToken.value.trim();
      sessionStorage.setItem('admin_token', state.token);
      syncTokenUI();
      renderPanels();
    });

    dom.dockModeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        dom.dockModeBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
        const isMedia = btn.dataset.mode === 'media';
        dom.uploadForm.hidden = !isMedia;
        dom.poemForm.hidden = isMedia;
      });
    });

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
