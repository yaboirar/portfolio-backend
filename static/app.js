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
    token: sessionStorage.getItem('admin_token') || '',
  };

  const dom = {
    themeSwitch: document.getElementById('theme-switch'),
    adminTrigger: document.getElementById('admin-trigger'),
    tokenDot: document.getElementById('token-dot'),

    navBtns: document.querySelectorAll('.kinetic-nav-btn'),
    countAll: document.getElementById('count-all'),
    countVideos: document.getElementById('count-videos'),
    countPhotos: document.getElementById('count-photos'),
    countPoems: document.getElementById('count-poems'),

    chapterVideos: document.getElementById('chapter-videos'),
    chapterPhotos: document.getElementById('chapter-photos'),
    chapterPoems: document.getElementById('chapter-poems'),
    reelVideos: document.getElementById('reel-videos'),
    galleryPhotos: document.getElementById('gallery-photos'),
    verseIndex: document.getElementById('verse-index'),
    verseReader: document.getElementById('verse-reader'),

    lightbox: document.getElementById('lightbox'),
    lbCounter: document.getElementById('lb-counter'),
    lbTitle: document.getElementById('lb-title'),
    lbDesc: document.getElementById('lb-desc'),
    lbCanvas: document.getElementById('lb-canvas'),
    lbPrev: document.getElementById('lb-prev'),
    lbNext: document.getElementById('lb-next'),
    lbClose: document.getElementById('lb-close'),

    studioModal: document.getElementById('studio-modal'),
    studioClose: document.getElementById('studio-close'),
    adminToken: document.getElementById('admin-token'),
    saveToken: document.getElementById('save-token'),
    authIndicator: document.getElementById('auth-indicator'),
    modeTabs: document.querySelectorAll('.mode-tab'),

    uploadForm: document.getElementById('upload-form'),
    dropzone: document.getElementById('dropzone'),
    uploadFile: document.getElementById('upload-file'),
    dropzonePreview: document.getElementById('dropzone-preview'),
    dropzonePrompt: document.getElementById('dropzone-prompt'),
    dropzoneFilename: document.getElementById('dropzone-filename'),
    dropzoneFilesize: document.getElementById('dropzone-filesize'),
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
  };

  /* ========================================================================
     TEXT-ROLL BUILDER (Direct Vanilla DOM port of TextRoll component)
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

  function hydrateStaticTextRolls() {
    document.querySelectorAll('.js-text-roll').forEach((el) => {
      const text = el.dataset.text || el.textContent.trim();
      const center = el.dataset.center === 'true';
      const extraClass = Array.from(el.classList)
        .filter((c) => c !== 'js-text-roll')
        .join(' ');
      const rollNode = createTextRollNode(text, center, extraClass);
      el.replaceWith(rollNode);
    });
  }

  /* ========================================================================
     DATA & API HELPERS
     ======================================================================== */
  function pad2(n) {
    return String(n).padStart(2, '0');
  }

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

  function detectVideo(item) {
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
        const normalized = {
          id: m.id,
          title: m.title || 'Untitled',
          description: m.description || '',
          url: resolvePath(m.relative_url || m.url || m.file_path),
        };
        if (detectVideo(m)) state.videos.push(normalized);
        else state.photos.push(normalized);
      });

      state.poems = poemItems.map((p) => ({
        id: p.id,
        title: p.title || 'Untitled',
        content: p.content || p.body || p.text || p.poem || '',
      }));

      if (state.activePoemIndex >= state.poems.length) {
        state.activePoemIndex = 0;
      }

      renderExhibition();
    } catch (err) {
      console.error('Portfolio fetch error:', err);
    }
  }

  /* ========================================================================
     RENDERING
     ======================================================================== */
  function buildPieceCaption(item, index, endpoint) {
    const bar = document.createElement('figcaption');
    bar.className = 'piece-bar';

    const info = document.createElement('div');
    info.className = 'piece-info';

    const idx = document.createElement('span');
    idx.className = 'piece-index';
    idx.textContent = pad2(index + 1);

    const title = document.createElement('span');
    title.className = 'piece-title';
    title.textContent = item.title;

    info.appendChild(idx);
    info.appendChild(title);

    if (item.description) {
      const desc = document.createElement('span');
      desc.className = 'piece-desc';
      desc.textContent = item.description;
      info.appendChild(desc);
    }

    bar.appendChild(info);

    if (state.token && item.id !== undefined) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'piece-delete';
      del.textContent = 'Delete';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteEntry(endpoint, item.id);
      });
      bar.appendChild(del);
    }

    return bar;
  }

  function renderEmptyState(container, label) {
    const div = document.createElement('div');
    div.className = 'empty-canvas';
    div.textContent = `00 — NO ${label} IN ARCHIVE`;
    container.appendChild(div);
  }

  function renderVerseReader() {
    dom.verseReader.replaceChildren();
    const poem = state.poems[state.activePoemIndex];
    if (!poem) return;

    const head = document.createElement('div');
    head.className = 'verse-reader-head';

    const title = document.createElement('h3');
    title.className = 'verse-reader-title';
    title.textContent = poem.title;
    head.appendChild(title);

    if (state.token && poem.id !== undefined) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'piece-delete';
      del.textContent = 'Delete';
      del.addEventListener('click', () => deleteEntry('poems', poem.id));
      head.appendChild(del);
    }

    const body = document.createElement('div');
    body.className = 'verse-reader-body';
    body.textContent = poem.content;

    dom.verseReader.appendChild(head);
    dom.verseReader.appendChild(body);
  }

  function renderExhibition() {
    const vLen = state.videos.length;
    const phLen = state.photos.length;
    const poLen = state.poems.length;

    dom.countAll.textContent = pad2(vLen + phLen + poLen);
    dom.countVideos.textContent = pad2(vLen);
    dom.countPhotos.textContent = pad2(phLen);
    dom.countPoems.textContent = pad2(poLen);

    const f = state.filter;
    dom.chapterVideos.hidden = f !== 'all' && f !== 'videos';
    dom.chapterPhotos.hidden = f !== 'all' && f !== 'photos';
    dom.chapterPoems.hidden = f !== 'all' && f !== 'poems';

    // 01 / Videos
    dom.reelVideos.replaceChildren();
    if (vLen === 0) {
      renderEmptyState(dom.reelVideos, 'MOTION');
    } else {
      state.videos.forEach((v, idx) => {
        const fig = document.createElement('figure');
        fig.className = 'motion-card';

        const stage = document.createElement('div');
        stage.className = 'motion-stage';

        const video = document.createElement('video');
        video.src = v.url;
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;

        stage.appendChild(video);
        fig.appendChild(stage);
        fig.appendChild(buildPieceCaption(v, idx, 'media'));
        dom.reelVideos.appendChild(fig);
      });
    }

    // 02 / Photos
    dom.galleryPhotos.replaceChildren();
    if (phLen === 0) {
      renderEmptyState(dom.galleryPhotos, 'STILLS');
    } else {
      state.photos.forEach((p, idx) => {
        const fig = document.createElement('figure');
        fig.className = 'still-item';

        const frame = document.createElement('div');
        frame.className = 'still-frame';
        frame.addEventListener('click', () => openLightbox(idx));

        const img = document.createElement('img');
        img.src = p.url;
        img.alt = p.title;
        img.loading = 'lazy';

        frame.appendChild(img);
        fig.appendChild(frame);
        fig.appendChild(buildPieceCaption(p, idx, 'media'));
        dom.galleryPhotos.appendChild(fig);
      });
    }

    // 03 / Poems (Interactive TextRoll Index + Reader Stage)
    dom.verseIndex.replaceChildren();
    dom.verseReader.replaceChildren();

    if (poLen === 0) {
      dom.verseReader.hidden = true;
      renderEmptyState(dom.verseIndex, 'VERSE');
    } else {
      dom.verseReader.hidden = false;
      state.poems.forEach((poem, idx) => {
        const li = document.createElement('li');
        li.className = 'verse-index-item';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'verse-index-btn' + (idx === state.activePoemIndex ? ' is-active' : '');

        const left = document.createElement('div');
        left.className = 'verse-index-left';

        const num = document.createElement('span');
        num.className = 'piece-index';
        num.textContent = pad2(idx + 1);

        const rollTitle = createTextRollNode(poem.title.toUpperCase(), false, 'verse-roll-title');

        left.appendChild(num);
        left.appendChild(rollTitle);
        btn.appendChild(left);

        btn.addEventListener('click', () => {
          state.activePoemIndex = idx;
          dom.verseIndex.querySelectorAll('.verse-index-btn').forEach((b, bIdx) => {
            b.classList.toggle('is-active', bIdx === idx);
          });
          renderVerseReader();
        });

        li.appendChild(btn);
        dom.verseIndex.appendChild(li);
      });

      renderVerseReader();
    }
  }

  /* ========================================================================
     LIGHTBOX
     ======================================================================== */
  function openLightbox(index) {
    state.lightboxIndex = index;
    updateLightboxStage();
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
    updateLightboxStage();
  }

  function updateLightboxStage() {
    const item = state.photos[state.lightboxIndex];
    if (!item) return;

    dom.lbCanvas.replaceChildren();
    dom.lbCounter.textContent = `${pad2(state.lightboxIndex + 1)} / ${pad2(state.photos.length)}`;
    dom.lbTitle.textContent = item.title;
    dom.lbDesc.textContent = item.description || '';

    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.title;
    dom.lbCanvas.appendChild(img);
  }

  /* ========================================================================
     STUDIO / ADMIN ACTIONS
     ======================================================================== */
  function syncTokenState() {
    dom.adminToken.value = state.token;
    const unlocked = Boolean(state.token);
    dom.authIndicator.textContent = unlocked ? 'Active' : 'Locked';
    dom.tokenDot.hidden = !unlocked;
  }

  async function deleteEntry(endpoint, id) {
    if (!state.token) return;
    if (!window.confirm('Remove this work permanently?')) return;

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

  function updateDropzonePreview() {
    const file = dom.uploadFile.files[0];
    dom.dropzonePreview.replaceChildren();

    if (!file) {
      dom.dropzonePreview.hidden = true;
      dom.dropzonePrompt.hidden = false;
      dom.dropzoneFilename.textContent = 'Drop video or image here';
      dom.dropzoneFilesize.textContent = 'or click to browse local files';
      return;
    }

    const mb = (file.size / (1024 * 1024)).toFixed(2);
    dom.dropzoneFilename.textContent = file.name;
    dom.dropzoneFilesize.textContent = `${mb} MB`;

    const blobUrl = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const vid = document.createElement('video');
      vid.src = blobUrl;
      vid.muted = true;
      vid.autoplay = true;
      vid.loop = true;
      vid.playsInline = true;
      dom.dropzonePreview.appendChild(vid);
      dom.dropzonePreview.hidden = false;
    } else if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = blobUrl;
      dom.dropzonePreview.appendChild(img);
      dom.dropzonePreview.hidden = false;
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
    syncTokenState();

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

    xhr.onload = () => {
      dom.uploadSubmit.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        dom.uploadForm.reset();
        updateDropzonePreview();
        dom.uploadFeedback.textContent = 'Published';
        setTimeout(() => {
          dom.uploadMeter.hidden = true;
        }, 700);
        fetchPortfolio();
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
    syncTokenState();

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
      fetchPortfolio();
    } catch (err) {
      dom.poemFeedback.textContent = `Error ${err.message}`;
    } finally {
      dom.poemSubmit.disabled = false;
    }
  }

  /* ========================================================================
     INITIALIZATION
     ======================================================================== */
  function init() {
    const savedTheme = localStorage.getItem('portfolio_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    hydrateStaticTextRolls();
    syncTokenState();

    dom.themeSwitch.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('portfolio_theme', next);
    });

    dom.navBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.dataset.filter;
        dom.navBtns.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-selected', String(active));
        });
        renderExhibition();
      });
    });

    dom.adminTrigger.addEventListener('click', () => {
      dom.studioModal.hidden = false;
      dom.studioModal.setAttribute('aria-hidden', 'false');
    });

    dom.studioClose.addEventListener('click', () => {
      dom.studioModal.hidden = true;
      dom.studioModal.setAttribute('aria-hidden', 'true');
    });

    dom.studioModal.addEventListener('click', (e) => {
      if (e.target === dom.studioModal) {
        dom.studioModal.hidden = true;
        dom.studioModal.setAttribute('aria-hidden', 'true');
      }
    });

    dom.saveToken.addEventListener('click', () => {
      state.token = dom.adminToken.value.trim();
      sessionStorage.setItem('admin_token', state.token);
      syncTokenState();
      renderExhibition();
    });

    dom.modeTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        dom.modeTabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        const isMedia = tab.dataset.tab === 'media';
        dom.uploadForm.hidden = !isMedia;
        dom.poemForm.hidden = isMedia;
      });
    });

    dom.uploadFile.addEventListener('change', updateDropzonePreview);
    dom.dropzone.addEventListener('dragover', () => dom.dropzone.classList.add('is-dragover'));
    dom.dropzone.addEventListener('dragleave', () => dom.dropzone.classList.remove('is-dragover'));
    dom.dropzone.addEventListener('drop', () => dom.dropzone.classList.remove('is-dragover'));

    dom.uploadForm.addEventListener('submit', handleMediaUpload);
    dom.poemForm.addEventListener('submit', handlePoemPublish);

    dom.lbClose.addEventListener('click', closeLightbox);
    dom.lbPrev.addEventListener('click', () => stepLightbox(-1));
    dom.lbNext.addEventListener('click', () => stepLightbox(1));
    dom.lightbox.addEventListener('click', (e) => {
      if (e.target === dom.lightbox || e.target === dom.lbCanvas) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          dom.studioModal.hidden = !dom.studioModal.hidden;
        }
      }
      if (!dom.lightbox.hidden) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') stepLightbox(-1);
        if (e.key === 'ArrowRight') stepLightbox(1);
      } else if (!dom.studioModal.hidden && e.key === 'Escape') {
        dom.studioModal.hidden = true;
      }
    });

    fetchPortfolio();
  }

  init();
})();
