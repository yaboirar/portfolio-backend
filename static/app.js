(() => {
  'use strict';

  const STORAGE_TOKEN_KEY = 'archive_admin_token';
  const STORAGE_THEME_KEY = 'archive_surface_theme';

  const state = {
    videos: [],
    photos: [],
    poems: [],
    filterView: 'all',
    searchQuery: '',
    adminToken: sessionStorage.getItem(STORAGE_TOKEN_KEY) || localStorage.getItem(STORAGE_TOKEN_KEY) || ''
  };

  // DOM Elements
  const els = {
    videoGrid: document.getElementById('video-grid'),
    photoGrid: document.getElementById('photo-grid'),
    poemGrid: document.getElementById('poem-grid'),
    countVideos: document.getElementById('count-videos'),
    countPhotos: document.getElementById('count-photos'),
    countPoems: document.getElementById('count-poems'),
    archiveStatus: document.getElementById('archive-status'),
    searchInput: document.getElementById('archive-search'),
    filterTabs: document.querySelectorAll('.filter-tab'),
    sections: document.querySelectorAll('.archive-section'),
    densityToggle: document.getElementById('density-toggle'),
    themeToggle: document.getElementById('theme-toggle'),
    themeLabel: document.getElementById('theme-label'),

    // Viewer Modal
    viewerModal: document.getElementById('viewer-modal'),
    viewerClose: document.getElementById('viewer-close'),
    viewerIndex: document.getElementById('viewer-index'),
    viewerTitle: document.getElementById('viewer-title'),
    viewerStage: document.getElementById('viewer-stage'),
    viewerDescription: document.getElementById('viewer-description'),
    viewerCaption: document.getElementById('viewer-caption'),

    // Admin Modal
    adminTrigger: document.getElementById('admin-trigger'),
    adminModal: document.getElementById('admin-modal'),
    adminClose: document.getElementById('admin-close'),
    adminDot: document.getElementById('admin-dot'),
    adminBtnLabel: document.getElementById('admin-btn-label'),
    adminTokenInput: document.getElementById('admin-token'),
    saveTokenBtn: document.getElementById('save-token-btn'),
    clearTokenBtn: document.getElementById('clear-token-btn'),
    tokenStatus: document.getElementById('token-status'),
    adminTabs: document.querySelectorAll('.admin-tab'),

    // Upload & Poem Forms
    uploadForm: document.getElementById('upload-form'),
    uploadFile: document.getElementById('upload-file'),
    dropzoneText: document.getElementById('dropzone-text'),
    uploadTitle: document.getElementById('upload-title'),
    uploadDesc: document.getElementById('upload-description'),
    progressWrap: document.getElementById('upload-progress-wrap'),
    progressBar: document.getElementById('upload-progress-bar'),
    progressPercent: document.getElementById('upload-percent'),
    uploadStatusText: document.getElementById('upload-status-text'),
    uploadFeedback: document.getElementById('upload-feedback'),
    uploadSubmitBtn: document.getElementById('upload-submit-btn'),

    poemForm: document.getElementById('poem-form'),
    poemTitle: document.getElementById('poem-title'),
    poemContent: document.getElementById('poem-content'),
    poemFeedback: document.getElementById('poem-feedback'),
    poemSubmitBtn: document.getElementById('poem-submit-btn')
  };

  /* ========================================================================
     HELPERS & NORMALIZATION
     ======================================================================== */

  function padIndex(num) {
    return String(num).padStart(2, '0');
  }

  function normalizeUrl(rawUrl) {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('/')) {
      return rawUrl;
    }
    return '/' + rawUrl;
  }

  function isVideoItem(item) {
    const type = String(item.media_type || item.type || item.file_type || item.mime_type || '').toLowerCase();
    const url = String(item.relative_url || item.url || item.filename || '').toLowerCase();
    if (type.includes('video')) return true;
    if (type.includes('image') || type.includes('photo')) return false;
    if (url.includes('/videos/') || /\.(mp4|webm|mov|m4v|ogg)$/i.test(url)) return true;
    return false;
  }

  function extractArray(payload, keys) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
      for (const k of keys) {
        if (Array.isArray(payload[k])) return payload[k];
      }
    }
    return [];
  }

  function matchesQuery(item, q) {
    if (!q) return true;
    const hay = [
      item.title || '',
      item.description || '',
      item.content || '',
      item.body || '',
      item.text || ''
    ].join(' ').toLowerCase();
    return hay.includes(q);
  }

  function createEl(tag, className, textContent) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent !== undefined && textContent !== null) {
      el.textContent = textContent;
    }
    return el;
  }

  /* ========================================================================
     DATA FETCHING
     ======================================================================== */

  async function loadArchive() {
    els.archiveStatus.textContent = 'SYNCHRONIZING ARCHIVE...';

    try {
      const [mediaRes, poemsRes] = await Promise.all([
        fetch('/api/media', { headers: { 'Accept': 'application/json' } }),
        fetch('/api/poems', { headers: { 'Accept': 'application/json' } })
      ]);

      const mediaJson = mediaRes.ok ? await mediaRes.json() : [];
      const poemsJson = poemsRes.ok ? await poemsRes.json() : [];

      const mediaItems = extractArray(mediaJson, ['media', 'items', 'data', 'results']);
      const poemItems = extractArray(poemsJson, ['poems', 'items', 'data', 'results']);

      state.videos = mediaItems.filter((item) => isVideoItem(item));
      state.photos = mediaItems.filter((item) => !isVideoItem(item));
      state.poems = poemItems;

      els.countVideos.textContent = padIndex(state.videos.length);
      els.countPhotos.textContent = padIndex(state.photos.length);
      els.countPoems.textContent = padIndex(state.poems.length);

      const total = state.videos.length + state.photos.length + state.poems.length;
      els.archiveStatus.textContent = `CATALOG ONLINE — ${padIndex(total)} WORKS INDEXED`;

      renderAll();
    } catch (err) {
      els.archiveStatus.textContent = 'OFFLINE OR UNREACHABLE API';
      console.error('Error loading archive:', err);
    }
  }

  /* ========================================================================
     RENDERING
     ======================================================================== */

  function renderAll() {
    const q = state.searchQuery.trim().toLowerCase();
    renderVideos(state.videos.filter((item) => matchesQuery(item, q)));
    renderPhotos(state.photos.filter((item) => matchesQuery(item, q)));
    renderPoems(state.poems.filter((item) => matchesQuery(item, q)));
    applySectionVisibility();
  }

  function renderVideos(items) {
    els.videoGrid.replaceChildren();
    if (!items.length) {
      els.videoGrid.appendChild(createEl('div', 'empty-cell', 'No motion reels cataloged.'));
      return;
    }

    items.forEach((item, idx) => {
      const src = normalizeUrl(item.relative_url || item.url);
      const code = `REEL 01.${padIndex(idx + 1)}`;
      const cell = createEl('article', 'media-cell video-cell');

      const frame = createEl('div', 'media-frame');
      const video = document.createElement('video');
      video.src = src;
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      // Quiet hover preview
      frame.addEventListener('mouseenter', () => {
        video.play().catch(() => {});
      });
      frame.addEventListener('mouseleave', () => {
        video.pause();
        video.currentTime = 0;
      });
      frame.addEventListener('click', () => {
        openViewer({
          type: 'video',
          code,
          title: item.title || 'Untitled Reel',
          description: item.description || '',
          src
        });
      });

      const badge = createEl('span', 'play-indicator', 'SCREEN REEL ↗');
      frame.append(video, badge);

      const caption = createEl('div', 'cell-caption');
      const headerRow = createEl('div', 'cell-header-row');
      headerRow.appendChild(createEl('span', 'cell-cat-num', code));

      if (state.adminToken && item.id !== undefined) {
        const delBtn = createEl('button', 'delete-btn', 'DELETE');
        delBtn.type = 'button';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteItem('media', item.id, item.title);
        });
        headerRow.appendChild(delBtn);
      }

      const title = createEl('h3', 'cell-title', item.title || 'Untitled Reel');
      caption.append(headerRow, title);

      if (item.description) {
        caption.appendChild(createEl('p', 'cell-desc', item.description));
      }

      cell.append(frame, caption);
      els.videoGrid.appendChild(cell);
    });
  }

  function renderPhotos(items) {
    els.photoGrid.replaceChildren();
    if (!items.length) {
      els.photoGrid.appendChild(createEl('div', 'empty-cell', 'No still plates cataloged.'));
      return;
    }

    items.forEach((item, idx) => {
      const src = normalizeUrl(item.relative_url || item.url);
      const code = `PLATE 02.${padIndex(idx + 1)}`;
      const cell = createEl('article', 'media-cell photo-cell');

      const frame = createEl('div', 'media-frame');
      const img = document.createElement('img');
      img.src = src;
      img.alt = item.title || 'Still Photograph';
      img.loading = 'lazy';

      frame.addEventListener('click', () => {
        openViewer({
          type: 'photo',
          code,
          title: item.title || 'Untitled Plate',
          description: item.description || '',
          src
        });
      });

      frame.appendChild(img);

      const caption = createEl('div', 'cell-caption');
      const headerRow = createEl('div', 'cell-header-row');
      headerRow.appendChild(createEl('span', 'cell-cat-num', code));

      if (state.adminToken && item.id !== undefined) {
        const delBtn = createEl('button', 'delete-btn', 'DELETE');
        delBtn.type = 'button';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteItem('media', item.id, item.title);
        });
        headerRow.appendChild(delBtn);
      }

      const title = createEl('h3', 'cell-title', item.title || 'Untitled Plate');
      caption.append(headerRow, title);

      if (item.description) {
        caption.appendChild(createEl('p', 'cell-desc', item.description));
      }

      cell.append(frame, caption);
      els.photoGrid.appendChild(cell);
    });
  }

  function renderPoems(items) {
    els.poemGrid.replaceChildren();
    if (!items.length) {
      els.poemGrid.appendChild(createEl('div', 'empty-cell', 'No verse entries cataloged.'));
      return;
    }

    items.forEach((item, idx) => {
      const code = `FOLIO 03.${padIndex(idx + 1)}`;
      const bodyText = item.content || item.body || item.poem || item.text || item.description || '';
      const cell = createEl('article', 'poem-cell');

      const header = createEl('div', 'poem-header');
      const titleWrap = createEl('div');
      titleWrap.appendChild(createEl('span', 'cell-cat-num', code));
      titleWrap.appendChild(createEl('h3', 'poem-title', item.title || 'Untitled Verse'));
      header.appendChild(titleWrap);

      if (state.adminToken && item.id !== undefined) {
        const delBtn = createEl('button', 'delete-btn', 'DELETE');
        delBtn.type = 'button';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteItem('poems', item.id, item.title);
        });
        header.appendChild(delBtn);
      }

      const excerpt = createEl('div', 'poem-excerpt', bodyText);

      const footer = createEl('div', 'poem-footer');
      const lineCount = bodyText ? bodyText.split(/\r?\n/).filter(Boolean).length : 0;
      footer.appendChild(createEl('span', 'mono-label', `${lineCount} LINES`));

      const readBtn = createEl('button', 'text-action', 'READ FOLIO →');
      readBtn.type = 'button';
      readBtn.addEventListener('click', () => {
        openViewer({
          type: 'poem',
          code,
          title: item.title || 'Untitled Verse',
          description: '',
          body: bodyText
        });
      });
      footer.appendChild(readBtn);

      cell.append(header, excerpt, footer);
      els.poemGrid.appendChild(cell);
    });
  }

  function applySectionVisibility() {
    els.sections.forEach((sec) => {
      const target = sec.getAttribute('data-section');
      sec.hidden = state.filterView !== 'all' && state.filterView !== target;
    });
  }

  /* ========================================================================
     VIEWER / LIGHTBOX MODAL
     ======================================================================== */

  function openViewer(item) {
    els.viewerStage.replaceChildren();
    els.viewerStage.classList.remove('poem-mode');

    els.viewerIndex.textContent = item.code || 'ARCHIVE';
    els.viewerTitle.textContent = item.title || 'Untitled';

    if (item.type === 'video') {
      const video = document.createElement('video');
      video.src = item.src;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      els.viewerStage.appendChild(video);
    } else if (item.type === 'photo') {
      const img = document.createElement('img');
      img.src = item.src;
      img.alt = item.title || '';
      els.viewerStage.appendChild(img);
    } else if (item.type === 'poem') {
      els.viewerStage.classList.add('poem-mode');
      const article = createEl('article', 'poem-reader');
      article.appendChild(createEl('h2', '', item.title));
      article.appendChild(createEl('div', 'poem-reader-body', item.body));
      els.viewerStage.appendChild(article);
    }

    if (item.description) {
      els.viewerDescription.textContent = item.description;
      els.viewerCaption.hidden = false;
    } else {
      els.viewerDescription.textContent = '';
      els.viewerCaption.hidden = true;
    }

    els.viewerModal.hidden = false;
    els.viewerModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeViewer() {
    // Stop any playing video
    const activeVideo = els.viewerStage.querySelector('video');
    if (activeVideo) {
      activeVideo.pause();
      activeVideo.removeAttribute('src');
    }
    els.viewerStage.replaceChildren();
    els.viewerModal.hidden = true;
    els.viewerModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  /* ========================================================================
     ADMINISTRATION: UPLOAD, POEM PUBLISH & DELETE
     ======================================================================== */

  function syncAdminStateUI() {
    const hasToken = Boolean(state.adminToken);
    els.adminDot.classList.toggle('unlocked', hasToken);
    els.adminBtnLabel.textContent = hasToken ? 'CURATOR [UNLOCKED]' : 'CURATOR';
    els.tokenStatus.textContent = hasToken
      ? 'Status: Unlocked (Upload & Delete enabled)'
      : 'Status: Locked (Read-only mode)';
    els.adminTokenInput.value = state.adminToken;
    renderAll();
  }

  function handleMediaUpload(e) {
    e.preventDefault();
    els.uploadFeedback.textContent = '';
    els.uploadFeedback.className = 'form-Feedback';

    if (!state.adminToken) {
      els.uploadFeedback.textContent = 'ERROR: Enter and save your X-Admin-Token first.';
      els.uploadFeedback.classList.add('error');
      return;
    }

    const file = els.uploadFile.files[0];
    if (!file) {
      els.uploadFeedback.textContent = 'ERROR: Select a file to upload.';
      els.uploadFeedback.classList.add('error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', els.uploadTitle.value.trim());
    formData.append('description', els.uploadDesc.value.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    xhr.setRequestHeader('X-Admin-Token', state.adminToken);

    els.progressWrap.hidden = false;
    els.progressBar.style.width = '0%';
    els.progressPercent.textContent = '0%';
    els.uploadStatusText.textContent = 'TRANSMITTING...';
    els.uploadSubmitBtn.disabled = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = Math.round((event.loaded / event.total) * 100);
        els.progressBar.style.width = `${pct}%`;
        els.progressPercent.textContent = `${pct}%`;
      }
    };

    xhr.onload = () => {
      els.uploadSubmitBtn.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        els.uploadStatusText.textContent = 'COMPLETE';
        els.uploadFeedback.textContent = 'Work committed to archive.';
        els.uploadFeedback.classList.add('success');
        els.uploadForm.reset();
        els.dropzoneText.textContent = 'Select or drag a file from disk';
        loadArchive();
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const errObj = JSON.parse(xhr.responseText);
          if (errObj.error || errObj.detail || errObj.message) {
            msg = errObj.error || errObj.detail || errObj.message;
          }
        } catch (_) {}
        els.uploadFeedback.textContent = `ERROR: ${msg}`;
        els.uploadFeedback.classList.add('error');
      }
    };

    xhr.onerror = () => {
      els.uploadSubmitBtn.disabled = false;
      els.uploadFeedback.textContent = 'ERROR: Network transmission interrupted.';
      els.uploadFeedback.classList.add('error');
    };

    xhr.send(formData);
  }

  async function handlePoemPublish(e) {
    e.preventDefault();
    els.poemFeedback.textContent = '';
    els.poemFeedback.className = 'form-Feedback';

    if (!state.adminToken) {
      els.poemFeedback.textContent = 'ERROR: Enter and save your X-Admin-Token first.';
      els.poemFeedback.classList.add('error');
      return;
    }

    const title = els.poemTitle.value.trim();
    const content = els.poemContent.value;

    els.poemSubmitBtn.disabled = true;

    try {
      // First attempt direct JSON POST to /api/poems
      let res = await fetch('/api/poems', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': state.adminToken
        },
        body: JSON.stringify({ title, content, body: content, description: content })
      });

      // Fallback: if poems are ingested via /api/upload as a .txt blob
      if (res.status === 404 || res.status === 405) {
        const fd = new FormData();
        const blob = new Blob([content], { type: 'text/plain' });
        fd.append('file', blob, `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'poem'}.txt`);
        fd.append('title', title);
        fd.append('description', content);

        res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'X-Admin-Token': state.adminToken },
          body: fd
        });
      }

      if (res.ok) {
        els.poemFeedback.textContent = 'Verse published to folio.';
        els.poemFeedback.classList.add('success');
        els.poemForm.reset();
        loadArchive();
      } else {
        const errData = await res.json().catch(() => ({}));
        els.poemFeedback.textContent = `ERROR: ${errData.error || errData.detail || res.statusText}`;
        els.poemFeedback.classList.add('error');
      }
    } catch (err) {
      els.poemFeedback.textContent = 'ERROR: Could not reach server.';
      els.poemFeedback.classList.add('error');
    } finally {
      els.poemSubmitBtn.disabled = false;
    }
  }

  async function deleteItem(endpointType, id, title) {
    if (!state.adminToken) return;
    const label = title ? `"${title}"` : `#${id}`;
    if (!window.confirm(`Permanently remove ${label} from the archive?`)) return;

    try {
      const res = await fetch(`/api/${endpointType}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Token': state.adminToken
        }
      });

      if (res.ok) {
        loadArchive();
      } else {
        const err = await res.json().catch(() => ({}));
        window.alert(`Delete failed: ${err.error || err.detail || res.statusText}`);
      }
    } catch (e) {
      window.alert('Network error while attempting deletion.');
    }
  }

  /* ========================================================================
     EVENT LISTENERS & INITIALIZATION
     ======================================================================== */

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_THEME_KEY) || 'carbon';
    document.documentElement.setAttribute('data-theme', saved);
    els.themeLabel.textContent = `SURFACE: ${saved.toUpperCase()}`;

    els.themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'carbon';
      const next = current === 'carbon' ? 'paper' : 'carbon';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_THEME_KEY, next);
      els.themeLabel.textContent = `SURFACE: ${next.toUpperCase()}`;
    });
  }

  function initControls() {
    // Filter tabs
    els.filterTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        els.filterTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        state.filterView = tab.getAttribute('data-view') || 'all';
        applySectionVisibility();
      });
    });

    // Live search
    els.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderAll();
    });

    // Photo grid density
    els.densityToggle.addEventListener('click', () => {
      const isCompact = els.photoGrid.classList.toggle('compact');
      els.densityToggle.textContent = isCompact ? 'GRID: COMPACT' : 'GRID: STANDARD';
    });

    // Viewer Modal events
    els.viewerClose.addEventListener('click', closeViewer);
    els.viewerModal.addEventListener('click', (e) => {
      if (e.target === els.viewerModal) closeViewer();
    });

    // Admin Modal events
    els.adminTrigger.addEventListener('click', () => {
      els.adminModal.hidden = false;
      els.adminModal.setAttribute('aria-hidden', 'false');
    });

    els.adminClose.addEventListener('click', () => {
      els.adminModal.hidden = true;
      els.adminModal.setAttribute('aria-hidden', 'true');
    });

    els.adminModal.addEventListener('click', (e) => {
      if (e.target === els.adminModal) {
        els.adminModal.hidden = true;
        els.adminModal.setAttribute('aria-hidden', 'true');
      }
    });

    // Escape key closes active modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!els.viewerModal.hidden) closeViewer();
        if (!els.adminModal.hidden) {
          els.adminModal.hidden = true;
          els.adminModal.setAttribute('aria-hidden', 'true');
        }
      }
    });

    // Admin Token Management
    els.saveTokenBtn.addEventListener('click', () => {
      state.adminToken = els.adminTokenInput.value.trim();
      if (state.adminToken) {
        sessionStorage.setItem(STORAGE_TOKEN_KEY, state.adminToken);
      }
      syncAdminStateUI();
    });

    els.clearTokenBtn.addEventListener('click', () => {
      state.adminToken = '';
      sessionStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      syncAdminStateUI();
    });

    // Admin Mode Switcher
    els.adminTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        els.adminTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const mode = tab.getAttribute('data-admin-mode');
        els.uploadForm.hidden = mode !== 'media';
        els.poemForm.hidden = mode !== 'poem';
      });
    });

    // File input label update
    els.uploadFile.addEventListener('change', () => {
      const file = els.uploadFile.files[0];
      els.dropzoneText.textContent = file
        ? `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`
        : 'Select or drag a file from disk';
    });

    els.uploadForm.addEventListener('submit', handleMediaUpload);
    els.poemForm.addEventListener('submit', handlePoemPublish);
  }

  // Boot
  initTheme();
  initControls();
  syncAdminStateUI();
  loadArchive();
})();
