(() => {
  'use strict';

  const STAGGER = 0.035;

  const state = {
    videos: [],
    photos: [],
    poems: [],
    filter: 'all',
    uploadOpen: false,
    lightboxIndex: -1,
    token: sessionStorage.getItem('admin_token') || '',
  };

  const dom = {
    navWell: document.getElementById('nav-well'),
    navKeys: document.querySelectorAll('.nav-key'),
    layoutFlipBtn: document.getElementById('layout-flip-btn'),
    themeSwitch: document.getElementById('theme-switch'),
    uploadToggle: document.getElementById('upload-toggle'),
    authLed: document.getElementById('auth-led'),

    dockMatrix: document.getElementById('dock-matrix'),
    upperBay: document.getElementById('upper-bay'),
    panelVideos: document.getElementById('panel-videos'),
    panelPhotos: document.getElementById('panel-photos'),
    panelPoems: document.getElementById('panel-poems'),
    splitVP: document.getElementById('split-vp'),
    splitMainH: document.getElementById('split-main-h'),
    maximizeBtns: document.querySelectorAll('[data-maximize]'),

    viewportVideos: document.getElementById('viewport-videos'),
    viewportPhotos: document.getElementById('viewport-photos'),
    viewportPoems: document.getElementById('viewport-poems'),

    splitUpload: document.getElementById('split-upload'),
    uploadBay: document.getElementById('upload-bay'),
    uploadClose: document.getElementById('upload-close'),
    modePills: document.querySelectorAll('.mode-pill'),

    adminToken: document.getElementById('admin-token'),
    saveToken: document.getElementById('save-token'),
    tokenState: document.getElementById('token-state'),

    uploadForm: document.getElementById('upload-form'),
    monitorWell: document.getElementById('monitor-well'),
    uploadFile: document.getElementById('upload-file'),
    monitorPreview: document.getElementById('monitor-preview'),
    monitorEmpty: document.getElementById('monitor-empty'),
    fileLabel: document.getElementById('file-label'),
    fileSub: document.getElementById('file-sub'),
    splitMonitor: document.getElementById('split-monitor'),

    uploadTitle: document.getElementById('upload-title'),
    uploadDesc: document.getElementById('upload-desc'),
    uploadMeter: document.getElementById('upload-meter'),
    uploadMeterFill: document.getElementById('upload-meter-fill'),
    uploadStatus: document.getElementById('upload-status'),
    uploadSubmit: document.getElementById('upload-submit'),

    poemForm: document.getElementById('poem-form'),
    poemTitle: document.getElementById('poem-title'),
    poemContent: document.getElementById('poem-content'),
    poemStatus: document.getElementById('poem-status'),
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
     TEXT-ROLL ENGINE (0.035s Stagger)
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
     2D AFTER EFFECTS SPLITTER ENGINE (Vertical + Horizontal + Monitor)
     ======================================================================== */
  function initSplitters() {
    // 1. Videos <-> Photos Vertical Splitter
    let vpDrag = false;
    let vpStartX = 0;
    let startVidW = 0;
    let startPhoW = 0;

    dom.splitVP.addEventListener('mousedown', (e) => {
      e.preventDefault();
      vpDrag = true;
      vpStartX = e.clientX;
      startVidW = dom.panelVideos.getBoundingClientRect().width;
      startPhoW = dom.panelPhotos.getBoundingClientRect().width;
      dom.splitVP.classList.add('is-active');
      document.body.classList.add('is-dragging');
    });

    // 2. Upper Media Bay <-> Lower Poems Bay Splitter
    let mainHDrag = false;
    let mainStartPos = 0;
    let startUpperSize = 0;
    let startPoemsSize = 0;

    dom.splitMainH.addEventListener('mousedown', (e) => {
      e.preventDefault();
      mainHDrag = true;
      const isCols = dom.dockMatrix.classList.contains('is-columns');
      mainStartPos = isCols ? e.clientX : e.clientY;
      const upperRect = dom.upperBay.getBoundingClientRect();
      const poemsRect = dom.panelPoems.getBoundingClientRect();
      startUpperSize = isCols ? upperRect.width : upperRect.height;
      startPoemsSize = isCols ? poemsRect.width : poemsRect.height;
      dom.splitMainH.classList.add('is-active');
      document.body.classList.add('is-dragging');
    });

    // 3. Main Workspace <-> Right Upload Bay Splitter
    let uploadDrag = false;
    dom.splitUpload.addEventListener('mousedown', (e) => {
      e.preventDefault();
      uploadDrag = true;
      dom.splitUpload.classList.add('is-active');
      document.body.classList.add('is-dragging');
    });

    // 4. File Monitor Height Splitter inside Upload Bay
    let monDrag = false;
    let monStartY = 0;
    let monStartH = 0;

    dom.splitMonitor.addEventListener('mousedown', (e) => {
      e.preventDefault();
      monDrag = true;
      monStartY = e.clientY;
      monStartH = dom.monitorWell.getBoundingClientRect().height;
      dom.splitMonitor.classList.add('is-active');
      document.body.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (vpDrag) {
        const total = startVidW + startPhoW;
        const delta = e.clientX - vpStartX;
        const minW = 180;
        const nextVid = Math.min(Math.max(startVidW + delta, minW), total - minW);
        const nextPho = total - nextVid;
        dom.panelVideos.style.flexBasis = `${(nextVid / total) * 100}%`;
        dom.panelPhotos.style.flexBasis = `${(nextPho / total) * 100}%`;
      }

      if (mainHDrag) {
        const isCols = dom.dockMatrix.classList.contains('is-columns');
        const currentPos = isCols ? e.clientX : e.clientY;
        const delta = currentPos - mainStartPos;
        const total = startUpperSize + startPoemsSize;
        const minS = 140;
        const nextUpper = Math.min(Math.max(startUpperSize + delta, minS), total - minS);
        const nextPoems = total - nextUpper;
        dom.upperBay.style.flexBasis = `${(nextUpper / total) * 100}%`;
        dom.panelPoems.style.flexBasis = `${(nextPoems / total) * 100}%`;
      }

      if (uploadDrag) {
        const nextW = Math.min(Math.max(window.innerWidth - e.clientX, 300), window.innerWidth * 0.65);
        document.documentElement.style.setProperty('--upload-w', `${nextW}px`);
      }

      if (monDrag) {
        const nextH = Math.min(Math.max(monStartH + (e.clientY - monStartY), 110), window.innerHeight * 0.6);
        document.documentElement.style.setProperty('--monitor-h', `${nextH}px`);
      }
    });

    window.addEventListener('mouseup', () => {
      if (vpDrag || mainHDrag || uploadDrag || monDrag) {
        vpDrag = false;
        mainHDrag = false;
        uploadDrag = false;
        monDrag = false;
        dom.splitVP.classList.remove('is-active');
        dom.splitMainH.classList.remove('is-active');
        dom.splitUpload.classList.remove('is-active');
        dom.splitMonitor.classList.remove('is-active');
        document.body.classList.remove('is-dragging');
      }
    });
  }

  /* ========================================================================
     WORKSPACE FILTER & DOCK CONTROLS
     ======================================================================== */
  function applyFilter(nextFilter) {
    state.filter = nextFilter;

    dom.navKeys.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.filter === nextFilter);
    });

    dom.navWell.classList.toggle('is-pinned', nextFilter !== 'all');

    const isAll = nextFilter === 'all';
    const showVideos = isAll || nextFilter === 'videos';
    const showPhotos = isAll || nextFilter === 'photos';
    const showPoems = isAll || nextFilter === 'poems';

    dom.upperBay.hidden = !showVideos && !showPhotos;
    dom.panelVideos.hidden = !showVideos;
    dom.panelPhotos.hidden = !showPhotos;
    dom.splitVP.hidden = !(showVideos && showPhotos);

    dom.panelPoems.hidden = !showPoems;
    dom.splitMainH.hidden = !(dom.upperBay.hidden === false && showPoems);

    dom.maximizeBtns.forEach((btn) => {
      const label = isAll ? 'MAXIMIZE' : 'RESTORE';
      btn.replaceChildren(createTextRollNode(label, false));
    });
  }

  function toggleUploadBay(force) {
    state.uploadOpen = typeof force === 'boolean' ? force : !state.uploadOpen;
    dom.uploadBay.classList.toggle('is-open', state.uploadOpen);
    dom.uploadBay.setAttribute('aria-hidden', String(!state.uploadOpen));
    dom.splitUpload.hidden = !state.uploadOpen;
    dom.uploadToggle.setAttribute('aria-expanded', String(state.uploadOpen));
  }

  /* ========================================================================
     API FETCH & VIEWPORT RENDERING
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

      renderViewports();
    } catch (err) {
      console.error('Error loading portfolio:', err);
    }
  }

  function buildCassettePlate(item, endpoint) {
    const plate = document.createElement('figcaption');
    plate.className = 'cassette-plate';

    const meta = document.createElement('div');
    meta.className = 'cassette-meta';

    const title = document.createElement('span');
    title.className = 'cassette-title';
    title.textContent = item.title;
    meta.appendChild(title);

    if (item.description) {
      const desc = document.createElement('span');
      desc.className = 'cassette-desc';
      desc.textContent = item.description;
      meta.appendChild(desc);
    }

    plate.appendChild(meta);

    if (state.token && item.id !== undefined) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'delete-key';
      del.textContent = 'Delete';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteEntry(endpoint, item.id);
      });
      plate.appendChild(del);
    }

    return plate;
  }

  function makeStandbyNode(label) {
    const div = document.createElement('div');
    div.className = 'viewport-standby';
    div.textContent = `No ${label} loaded`;
    return div;
  }

  function renderViewports() {
    // Videos Viewport
    dom.viewportVideos.replaceChildren();
    if (state.videos.length === 0) {
      dom.viewportVideos.appendChild(makeStandbyNode('videos'));
    } else {
      state.videos.forEach((v) => {
        const fig = document.createElement('figure');
        fig.className = 'media-cassette';

        const screen = document.createElement('div');
        screen.className = 'cassette-screen';

        const video = document.createElement('video');
        video.src = v.url;
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;

        screen.appendChild(video);
        fig.appendChild(screen);
        fig.appendChild(buildCassettePlate(v, 'media'));
        dom.viewportVideos.appendChild(fig);
      });
    }

    // Photos Viewport
    dom.viewportPhotos.replaceChildren();
    if (state.photos.length === 0) {
      dom.viewportPhotos.appendChild(makeStandbyNode('photos'));
    } else {
      state.photos.forEach((p, idx) => {
        const fig = document.createElement('figure');
        fig.className = 'media-cassette';

        const screen = document.createElement('div');
        screen.className = 'cassette-screen';
        screen.addEventListener('click', () => openLightbox(idx));

        const img = document.createElement('img');
        img.src = p.url;
        img.alt = p.title;
        img.loading = 'lazy';

        screen.appendChild(img);
        fig.appendChild(screen);
        fig.appendChild(buildCassettePlate(p, 'media'));
        dom.viewportPhotos.appendChild(fig);
      });
    }

    // Poems Viewport
    dom.viewportPoems.replaceChildren();
    if (state.poems.length === 0) {
      dom.viewportPoems.appendChild(makeStandbyNode('poems'));
    } else {
      state.poems.forEach((poem) => {
        const article = document.createElement('article');
        article.className = 'poem-plate';

        const head = document.createElement('div');
        head.className = 'poem-plate-head';

        const title = document.createElement('h3');
        title.className = 'poem-plate-title';
        title.textContent = poem.title;
        head.appendChild(title);

        if (state.token && poem.id !== undefined) {
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'delete-key';
          del.textContent = 'Delete';
          del.addEventListener('click', () => deleteEntry('poems', poem.id));
          head.appendChild(del);
        }

        const body = document.createElement('div');
        body.className = 'poem-plate-body';
        body.textContent = poem.content;

        article.appendChild(head);
        article.appendChild(body);
        dom.viewportPoems.appendChild(article);
      });
    }
  }

  /* ========================================================================
     UPLOAD, POEM PUBLISH & DELETE
     ======================================================================== */
  function syncTokenUI() {
    dom.adminToken.value = state.token;
    const unlocked = Boolean(state.token);
    dom.authLed.classList.toggle('is-unlocked', unlocked);
    dom.tokenState.textContent = unlocked ? 'Ready' : 'No token';
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

  function updateMonitorPreview() {
    const file = dom.uploadFile.files[0];
    dom.monitorPreview.replaceChildren();

    if (!file) {
      dom.monitorPreview.hidden = true;
      dom.monitorEmpty.hidden = false;
      dom.fileLabel.textContent = 'Click or drag video / photo into monitor';
      dom.fileSub.textContent = 'Drag the knurled bar below to resize monitor';
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    dom.monitorEmpty.hidden = true;
    dom.monitorPreview.hidden = false;

    if (file.type.startsWith('video/')) {
      const vid = document.createElement('video');
      vid.src = blobUrl;
      vid.controls = true;
      vid.muted = true;
      vid.playsInline = true;
      dom.monitorPreview.appendChild(vid);
    } else if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = blobUrl;
      dom.monitorPreview.appendChild(img);
    }
  }

  function handleMediaUpload(e) {
    e.preventDefault();
    const token = dom.adminToken.value.trim() || state.token;
    const file = dom.uploadFile.files[0];

    if (!token) {
      dom.uploadStatus.textContent = 'Enter token above';
      return;
    }
    if (!file) {
      dom.uploadStatus.textContent = 'Select a file';
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
    dom.uploadStatus.textContent = '0%';

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        dom.uploadMeterFill.style.width = `${pct}%`;
        dom.uploadStatus.textContent = `${pct}%`;
      }
    };

    xhr.onload = async () => {
      dom.uploadSubmit.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        dom.uploadForm.reset();
        updateMonitorPreview();
        dom.uploadStatus.textContent = 'Uploaded';
        setTimeout(() => {
          dom.uploadMeter.hidden = true;
        }, 600);
        await fetchPortfolio();
      } else {
        dom.uploadStatus.textContent = `Error ${xhr.status}`;
      }
    };

    xhr.onerror = () => {
      dom.uploadSubmit.disabled = false;
      dom.uploadStatus.textContent = 'Network error';
    };

    xhr.send(fd);
  }

  async function handlePoemUpload(e) {
    e.preventDefault();
    const token = dom.adminToken.value.trim() || state.token;
    if (!token) {
      dom.poemStatus.textContent = 'Enter token above';
      return;
    }

    state.token = token;
    sessionStorage.setItem('admin_token', token);
    syncTokenUI();

    dom.poemSubmit.disabled = true;
    dom.poemStatus.textContent = 'Uploading...';

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
      dom.poemStatus.textContent = 'Uploaded';
      await fetchPortfolio();
    } catch (err) {
      dom.poemStatus.textContent = `Error ${err.message}`;
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
    initSplitters();

    dom.themeSwitch.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('portfolio_theme', next);
    });

    dom.layoutFlipBtn.addEventListener('click', () => {
      dom.dockMatrix.classList.toggle('is-columns');
      const isCols = dom.dockMatrix.classList.contains('is-columns');
      dom.splitMainH.className = isCols ? 'splitter-v' : 'splitter-h';
    });

    dom.navKeys.forEach((btn) => {
      btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
    });

    dom.maximizeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.maximize;
        applyFilter(state.filter === target ? 'all' : target);
      });
    });

    dom.uploadToggle.addEventListener('click', () => toggleUploadBay());
    dom.uploadClose.addEventListener('click', () => toggleUploadBay(false));

    dom.saveToken.addEventListener('click', () => {
      state.token = dom.adminToken.value.trim();
      sessionStorage.setItem('admin_token', state.token);
      syncTokenUI();
      renderViewports();
    });

    dom.modePills.forEach((pill) => {
      pill.addEventListener('click', () => {
        dom.modePills.forEach((p) => p.classList.toggle('is-active', p === pill));
        const isMedia = pill.dataset.mode === 'media';
        dom.uploadForm.hidden = !isMedia;
        dom.poemForm.hidden = isMedia;
      });
    });

    dom.uploadFile.addEventListener('change', updateMonitorPreview);
    dom.monitorWell.addEventListener('dragover', () => dom.monitorWell.classList.add('is-dragover'));
    dom.monitorWell.addEventListener('dragleave', () => dom.monitorWell.classList.remove('is-dragover'));
    dom.monitorWell.addEventListener('drop', () => dom.monitorWell.classList.remove('is-dragover'));

    dom.uploadForm.addEventListener('submit', handleMediaUpload);
    dom.poemForm.addEventListener('submit', handlePoemUpload);

    dom.lbClose.addEventListener('click', closeLightbox);
    dom.lbPrev.addEventListener('click', () => stepLightbox(-1));
    dom.lbNext.addEventListener('click', () => stepLightbox(1));

    document.addEventListener('keydown', (e) => {
      if (!dom.lightbox.hidden) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') stepLightbox(-1);
        if (e.key === 'ArrowRight') stepLightbox(1);
      } else if (state.uploadOpen && e.key === 'Escape') {
        toggleUploadBay(false);
      }
    });

    fetchPortfolio();
  }

  init();
})();
