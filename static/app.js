(() => {
  'use strict';

  const STAGGER = 0.035;

  const state = {
    videos: [],
    photos: [],
    poems: [],
    filter: 'all',
    activePoemIndex: 0,
    lightboxIndex: -1,
    selectedSpan: 6,
    spans: JSON.parse(localStorage.getItem('portfolio_spans') || '{}'),
    token: sessionStorage.getItem('admin_token') || '',
  };

  const dom = {
    themeSwitch: document.getElementById('theme-switch'),
    uploadTrigger: document.getElementById('upload-trigger'),
    authDot: document.getElementById('auth-dot'),
    navBtns: document.querySelectorAll('.nav-roll-btn'),

    blockVideos: document.getElementById('block-videos'),
    blockPhotos: document.getElementById('block-photos'),
    blockPoems: document.getElementById('block-poems'),
    gridVideos: document.getElementById('grid-videos'),
    gridPhotos: document.getElementById('grid-photos'),
    poemsNav: document.getElementById('poems-nav'),
    poemStage: document.getElementById('poem-stage'),

    drawerBackdrop: document.getElementById('drawer-backdrop'),
    uploadDrawer: document.getElementById('upload-drawer'),
    drawerResizer: document.getElementById('drawer-resizer'),
    drawerClose: document.getElementById('drawer-close'),
    drawerTabs: document.querySelectorAll('.drawer-tab'),

    adminToken: document.getElementById('admin-token'),
    saveToken: document.getElementById('save-token'),

    uploadForm: document.getElementById('upload-form'),
    filePicker: document.getElementById('file-picker'),
    uploadFile: document.getElementById('upload-file'),
    fileName: document.getElementById('file-name'),
    fileMeta: document.getElementById('file-meta'),
    filePreviewWrap: document.getElementById('file-preview-wrap'),
    filePreviewStage: document.getElementById('file-preview-stage'),
    previewHeightSlider: document.getElementById('preview-height-slider'),

    spaceBtns: document.querySelectorAll('.space-btn'),
    spaceValue: document.getElementById('space-value'),

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
     DATA HELPERS
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

  function getSpanForItem(id) {
    return state.spans[String(id)] || 6;
  }

  function setSpanForItem(id, span) {
    state.spans[String(id)] = Number(span);
    localStorage.setItem('portfolio_spans', JSON.stringify(state.spans));
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

      if (state.activePoemIndex >= state.poems.length) {
        state.activePoemIndex = 0;
      }

      renderCanvas();
    } catch (err) {
      console.error('Failed to load portfolio:', err);
    }
  }

  /* ========================================================================
     RENDERING
     ======================================================================== */
  function buildMediaBar(item, figureEl) {
    const bar = document.createElement('figcaption');
    bar.className = 'media-bar';

    const meta = document.createElement('div');
    meta.className = 'media-meta';

    const title = document.createElement('span');
    title.className = 'media-title';
    title.textContent = item.title;
    meta.appendChild(title);

    if (item.description) {
      const desc = document.createElement('span');
      desc.className = 'media-desc';
      desc.textContent = item.description;
      meta.appendChild(desc);
    }

    bar.appendChild(meta);

    if (state.token && item.id !== undefined) {
      const controls = document.createElement('div');
      controls.className = 'media-controls';

      const currentSpan = getSpanForItem(item.id);
      const sizes = [
        { span: 3, label: '25%' },
        { span: 6, label: '50%' },
        { span: 9, label: '75%' },
        { span: 12, label: '100%' },
      ];

      sizes.forEach(({ span, label }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'span-pill' + (currentSpan === span ? ' is-active' : '');
        btn.textContent = label;
        btn.title = `Set width to ${label}`;
        btn.addEventListener('click', () => {
          setSpanForItem(item.id, span);
          figureEl.dataset.span = String(span);
          controls.querySelectorAll('.span-pill').forEach((p) => p.classList.remove('is-active'));
          btn.classList.add('is-active');
        });
        controls.appendChild(btn);
      });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'delete-link';
      del.textContent = 'Delete';
      del.addEventListener('click', () => deleteEntry('media', item.id));
      controls.appendChild(del);

      bar.appendChild(controls);
    }

    return bar;
  }

  function makeEmptyNotice(text) {
    const div = document.createElement('div');
    div.className = 'empty-notice';
    div.textContent = text;
    return div;
  }

  function renderPoemReader() {
    dom.poemStage.replaceChildren();
    const poem = state.poems[state.activePoemIndex];
    if (!poem) {
      dom.poemStage.hidden = true;
      return;
    }

    dom.poemStage.hidden = false;

    const head = document.createElement('div');
    head.className = 'poem-stage-head';

    const title = document.createElement('h3');
    title.className = 'poem-stage-title';
    title.textContent = poem.title;
    head.appendChild(title);

    if (state.token && poem.id !== undefined) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'delete-link';
      del.textContent = 'Delete';
      del.addEventListener('click', () => deleteEntry('poems', poem.id));
      head.appendChild(del);
    }

    const body = document.createElement('div');
    body.className = 'poem-stage-body';
    body.textContent = poem.content;

    dom.poemStage.appendChild(head);
    dom.poemStage.appendChild(body);
  }

  function renderCanvas() {
    const f = state.filter;
    dom.blockVideos.hidden = f !== 'all' && f !== 'videos';
    dom.blockPhotos.hidden = f !== 'all' && f !== 'photos';
    dom.blockPoems.hidden = f !== 'all' && f !== 'poems';

    // Videos
    dom.gridVideos.replaceChildren();
    if (state.videos.length === 0) {
      dom.gridVideos.appendChild(makeEmptyNotice('No videos uploaded yet.'));
    } else {
      state.videos.forEach((v) => {
        const fig = document.createElement('figure');
        fig.className = 'media-item';
        fig.dataset.span = String(getSpanForItem(v.id));

        const stage = document.createElement('div');
        stage.className = 'media-stage';

        const video = document.createElement('video');
        video.src = v.url;
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;

        stage.appendChild(video);
        fig.appendChild(stage);
        fig.appendChild(buildMediaBar(v, fig));
        dom.gridVideos.appendChild(fig);
      });
    }

    // Photos
    dom.gridPhotos.replaceChildren();
    if (state.photos.length === 0) {
      dom.gridPhotos.appendChild(makeEmptyNotice('No photos uploaded yet.'));
    } else {
      state.photos.forEach((p, idx) => {
        const fig = document.createElement('figure');
        fig.className = 'media-item';
        fig.dataset.span = String(getSpanForItem(p.id));

        const stage = document.createElement('div');
        stage.className = 'media-stage';
        stage.addEventListener('click', () => openLightbox(idx));

        const img = document.createElement('img');
        img.src = p.url;
        img.alt = p.title;
        img.loading = 'lazy';

        stage.appendChild(img);
        fig.appendChild(stage);
        fig.appendChild(buildMediaBar(p, fig));
        dom.gridPhotos.appendChild(fig);
      });
    }

    // Poems
    dom.poemsNav.replaceChildren();
    dom.poemStage.replaceChildren();

    if (state.poems.length === 0) {
      dom.poemStage.hidden = true;
      dom.poemsNav.appendChild(makeEmptyNotice('No poems published yet.'));
    } else {
      state.poems.forEach((poem, idx) => {
        const li = document.createElement('li');
        li.className = 'poem-nav-item';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'poem-nav-btn' + (idx === state.activePoemIndex ? ' is-active' : '');

        const rollTitle = createTextRollNode(poem.title.toUpperCase(), false, 'poem-roll-title');
        btn.appendChild(rollTitle);

        btn.addEventListener('click', () => {
          state.activePoemIndex = idx;
          dom.poemsNav.querySelectorAll('.poem-nav-btn').forEach((b, bIdx) => {
            b.classList.toggle('is-active', bIdx === idx);
          });
          renderPoemReader();
        });

        li.appendChild(btn);
        dom.poemsNav.appendChild(li);
      });

      renderPoemReader();
    }
  }

  /* ========================================================================
     SLIDE-LEFT DRAWER & RESIZER
     ======================================================================== */
  function openDrawer() {
    dom.drawerBackdrop.hidden = false;
    requestAnimationFrame(() => {
      dom.drawerBackdrop.classList.add('is-open');
      dom.uploadDrawer.classList.add('is-open');
      dom.uploadDrawer.setAttribute('aria-hidden', 'false');
    });
  }

  function closeDrawer() {
    dom.drawerBackdrop.classList.remove('is-open');
    dom.uploadDrawer.classList.remove('is-open');
    dom.uploadDrawer.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      if (!dom.uploadDrawer.classList.contains('is-open')) {
        dom.drawerBackdrop.hidden = true;
      }
    }, 450);
  }

  function initDrawerResize() {
    let dragging = false;

    dom.drawerResizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      dom.drawerResizer.classList.add('is-dragging');
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 340), 780);
      document.documentElement.style.setProperty('--drawer-width', `${newWidth}px`);
    });

    window.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      dom.drawerResizer.classList.remove('is-dragging');
      document.body.style.userSelect = '';
    });
  }

  /* ========================================================================
     UPLOAD & DELETE HANDLERS
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

  function updateFilePreview() {
    const file = dom.uploadFile.files[0];
    dom.filePreviewStage.replaceChildren();

    if (!file) {
      dom.filePreviewWrap.hidden = true;
      dom.fileName.textContent = 'Select video or photo';
      dom.fileMeta.textContent = 'MP4, WebM, MOV, JPG, PNG, WebP';
      return;
    }

    const mb = (file.size / (1024 * 1024)).toFixed(2);
    dom.fileName.textContent = file.name;
    dom.fileMeta.textContent = `${mb} MB`;

    const blobUrl = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const vid = document.createElement('video');
      vid.src = blobUrl;
      vid.controls = true;
      vid.muted = true;
      vid.playsInline = true;
      dom.filePreviewStage.appendChild(vid);
      dom.filePreviewWrap.hidden = false;
    } else if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = blobUrl;
      dom.filePreviewStage.appendChild(img);
      dom.filePreviewWrap.hidden = false;
    }
  }

  function handleMediaUpload(e) {
    e.preventDefault();
    const token = dom.adminToken.value.trim() || state.token;
    const file = dom.uploadFile.files[0];

    if (!token) {
      dom.uploadFeedback.textContent = 'Enter admin token first';
      return;
    }
    if (!file) {
      dom.uploadFeedback.textContent = 'Select a file first';
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
        try {
          const created = JSON.parse(xhr.responseText);
          const newId = created.id || (created.media && created.media.id);
          if (newId !== undefined) {
            setSpanForItem(newId, state.selectedSpan);
          }
        } catch (_) {}

        dom.uploadForm.reset();
        updateFilePreview();
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
      dom.poemFeedback.textContent = 'Enter admin token first';
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
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    dom.lbCanvas.replaceChildren();
    dom.lightbox.hidden = true;
    dom.lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
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
    initDrawerResize();

    dom.themeSwitch.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('portfolio_theme', next);
    });

    dom.navBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.dataset.filter;
        dom.navBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
        renderCanvas();
      });
    });

    dom.uploadTrigger.addEventListener('click', openDrawer);
    dom.drawerClose.addEventListener('click', closeDrawer);
    dom.drawerBackdrop.addEventListener('click', closeDrawer);

    dom.saveToken.addEventListener('click', () => {
      state.token = dom.adminToken.value.trim();
      sessionStorage.setItem('admin_token', state.token);
      syncTokenUI();
      renderCanvas();
    });

    dom.drawerTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        dom.drawerTabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        const isMedia = tab.dataset.tab === 'media';
        dom.uploadForm.hidden = !isMedia;
        dom.poemForm.hidden = isMedia;
      });
    });

    dom.uploadFile.addEventListener('change', updateFilePreview);
    dom.previewHeightSlider.addEventListener('input', (e) => {
      dom.filePreviewStage.style.height = `${e.target.value}px`;
    });

    const spanLabels = { 3: '25% width', 6: '50% width', 9: '75% width', 12: '100% width' };
    dom.spaceBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedSpan = Number(btn.dataset.span);
        dom.spaceBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
        dom.spaceValue.textContent = spanLabels[state.selectedSpan];
      });
    });

    dom.uploadForm.addEventListener('submit', handleMediaUpload);
    dom.poemForm.addEventListener('submit', handlePoemPublish);

    dom.lbClose.addEventListener('click', closeLightbox);
    dom.lbPrev.addEventListener('click', () => stepLightbox(-1));
    dom.lbNext.addEventListener('click', () => stepLightbox(1));
    dom.lightbox.addEventListener('click', (e) => {
      if (e.target === dom.lightbox || e.target === dom.lbCanvas) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (!dom.lightbox.hidden) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') stepLightbox(-1);
        if (e.key === 'ArrowRight') stepLightbox(1);
      } else if (dom.uploadDrawer.classList.contains('is-open') && e.key === 'Escape') {
        closeDrawer();
      }
    });

    fetchPortfolio();
  }

  init();
})();
