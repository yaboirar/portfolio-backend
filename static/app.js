(() => {
  'use strict';

  const state = {
    videos: [],
    photos: [],
    poems: [],
    filter: 'all',
    adminToken: sessionStorage.getItem('admin_token') || '',
    viewerList: [],
    viewerIndex: -1,
  };

  // DOM Elements
  const el = {
    countAll: document.getElementById('count-all'),
    countVideos: document.getElementById('count-videos'),
    countPhotos: document.getElementById('count-photos'),
    countPoems: document.getElementById('count-poems'),
    metaVideos: document.getElementById('meta-videos'),
    metaPhotos: document.getElementById('meta-photos'),
    metaPoems: document.getElementById('meta-poems'),
    sectionVideos: document.getElementById('section-videos'),
    sectionPhotos: document.getElementById('section-photos'),
    sectionPoems: document.getElementById('section-poems'),
    gridVideos: document.getElementById('grid-videos'),
    gridPhotos: document.getElementById('grid-photos'),
    gridPoems: document.getElementById('grid-poems'),
    statusBanner: document.getElementById('status-banner'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    resetFilter: document.getElementById('reset-filter'),
    themeToggle: document.getElementById('theme-toggle'),
    adminToggle: document.getElementById('admin-toggle'),

    // Viewer Modal
    viewerModal: document.getElementById('viewer-modal'),
    viewerType: document.getElementById('viewer-type'),
    viewerStage: document.getElementById('viewer-stage'),
    viewerTitle: document.getElementById('viewer-title'),
    viewerDescription: document.getElementById('viewer-description'),
    viewerDate: document.getElementById('viewer-date'),
    viewerPrev: document.getElementById('viewer-prev'),
    viewerNext: document.getElementById('viewer-next'),
    viewerClose: document.getElementById('viewer-close'),
    viewerDelete: document.getElementById('viewer-delete'),

    // Admin Modal
    adminModal: document.getElementById('admin-modal'),
    adminClose: document.getElementById('admin-close'),
    adminTokenInput: document.getElementById('admin-token'),
    saveTokenBtn: document.getElementById('save-token-btn'),
    tokenStatus: document.getElementById('token-status'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    uploadForm: document.getElementById('upload-form'),
    uploadFile: document.getElementById('upload-file'),
    uploadTitle: document.getElementById('upload-title'),
    uploadDescription: document.getElementById('upload-description'),
    uploadProgressWrap: document.getElementById('upload-progress-wrap'),
    uploadStatusText: document.getElementById('upload-status-text'),
    uploadPercent: document.getElementById('upload-percent'),
    uploadProgressBar: document.getElementById('upload-progress-bar'),
    uploadMessage: document.getElementById('upload-message'),
    uploadSubmit: document.getElementById('upload-submit'),
    poemForm: document.getElementById('poem-form'),
    poemTitle: document.getElementById('poem-title'),
    poemContent: document.getElementById('poem-content'),
    poemMessage: document.getElementById('poem-message'),
    poemSubmit: document.getElementById('poem-submit'),
  };

  // Helpers
  function normalizeList(payload, keys) {
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
      for (const key of keys) {
        if (Array.isArray(payload[key])) return payload[key];
      }
    }
    return [];
  }

  function normalizeUrl(rawUrl) {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('/')) {
      return rawUrl;
    }
    return '/' + rawUrl;
  }

  function isVideoItem(item) {
    const typeField = String(item.media_type || item.type || item.file_type || item.mime_type || '').toLowerCase();
    if (typeField.includes('video')) return true;
    if (typeField.includes('image') || typeField.includes('photo')) return false;
    const url = String(item.relative_url || item.url || item.filename || '').toLowerCase();
    if (url.includes('/videos/')) return true;
    return /\.(mp4|webm|ogg|mov|m4v|mkv)(\?|$)/i.test(url);
  }

  function formatDate(raw) {
    if (!raw) return '';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return String(raw).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function setStatusBanner(msg) {
    if (!msg) {
      el.statusBanner.hidden = true;
      el.statusBanner.textContent = '';
      return;
    }
    el.statusBanner.textContent = msg;
    el.statusBanner.hidden = false;
  }

  function showFormMessage(target, text, isError = false) {
    target.textContent = text;
    target.className = 'form-message ' + (isError ? 'is-error' : 'is-success');
    target.hidden = false;
  }

  // Theme management
  function initTheme() {
    const saved = localStorage.getItem('portfolio_theme') || 'dark';
    applyTheme(saved);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('portfolio_theme', theme);
    el.themeToggle.textContent = theme === 'dark' ? 'Light' : 'Dark';
  }

  // Token management
  function updateTokenUI() {
    el.adminTokenInput.value = state.adminToken;
    if (state.adminToken) {
      el.tokenStatus.textContent = 'Token saved in session. Delete controls are active.';
    } else {
      el.tokenStatus.textContent = 'No token saved. Enter token to upload or delete items.';
    }
    renderAll();
  }

  // Data Fetching
  async function loadPortfolioData() {
    setStatusBanner('');
    try {
      const [mediaRes, poemsRes] = await Promise.all([
        fetch('/api/media', { headers: { Accept: 'application/json' } }),
        fetch('/api/poems', { headers: { Accept: 'application/json' } }),
      ]);

      if (!mediaRes.ok) throw new Error(`GET /api/media returned ${mediaRes.status}`);
      if (!poemsRes.ok) throw new Error(`GET /api/poems returned ${poemsRes.status}`);

      const mediaData = await mediaRes.json();
      const poemsData = await poemsRes.json();

      const allMedia = normalizeList(mediaData, ['media', 'items', 'data']);
      const allPoems = normalizeList(poemsData, ['poems', 'items', 'data']);

      state.videos = [];
      state.photos = [];

      allMedia.forEach((item) => {
        const normalized = {
          id: item.id,
          title: item.title || 'Untitled',
          description: item.description || '',
          url: normalizeUrl(item.relative_url || item.url || item.file_path),
          date: formatDate(item.created_at || item.uploaded_at || item.date),
          kind: isVideoItem(item) ? 'video' : 'photo',
        };
        if (normalized.kind === 'video') {
          state.videos.push(normalized);
        } else {
          state.photos.push(normalized);
        }
      });

      state.poems = allPoems.map((p) => ({
        id: p.id,
        title: p.title || 'Untitled',
        content: p.content || p.body || p.text || p.poem || '',
        date: formatDate(p.created_at || p.date),
        kind: 'poem',
      }));

      renderAll();
    } catch (err) {
      setStatusBanner(`Failed to load portfolio items: ${err.message}`);
    }
  }

  // Rendering
  function renderCounts() {
    const vCount = state.videos.length;
    const phCount = state.photos.length;
    const poCount = state.poems.length;
    const total = vCount + phCount + poCount;

    el.countAll.textContent = total;
    el.countVideos.textContent = vCount;
    el.countPhotos.textContent = phCount;
    el.countPoems.textContent = poCount;

    el.metaVideos.textContent = `${vCount} ${vCount === 1 ? 'item' : 'items'}`;
    el.metaPhotos.textContent = `${phCount} ${phCount === 1 ? 'item' : 'items'}`;
    el.metaPoems.textContent = `${poCount} ${poCount === 1 ? 'item' : 'items'}`;
  }

  function applyFilterVisibility() {
    const f = state.filter;
    el.sectionVideos.hidden = f !== 'all' && f !== 'videos';
    el.sectionPhotos.hidden = f !== 'all' && f !== 'photos';
    el.sectionPoems.hidden = f !== 'all' && f !== 'poems';

    el.filterBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.filter === f);
    });
  }

  function createEmptyNode(label) {
    const div = document.createElement('div');
    div.className = 'empty-state';
    div.textContent = `No ${label} published.`;
    return div;
  }

  function renderMediaGrid(container, items, kindLabel) {
    container.replaceChildren();
    if (items.length === 0) {
      container.appendChild(createEmptyNode(kindLabel));
      return;
    }

    items.forEach((item, idx) => {
      const card = document.createElement('article');
      card.className = 'media-card';

      const thumbBtn = document.createElement('button');
      thumbBtn.type = 'button';
      thumbBtn.className = 'media-thumb-btn';
      thumbBtn.addEventListener('click', () => openViewer(items, idx));

      if (item.kind === 'video') {
        const video = document.createElement('video');
        video.src = item.url;
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        thumbBtn.appendChild(video);

        const badge = document.createElement('span');
        badge.className = 'video-badge';
        badge.textContent = 'VIDEO';
        thumbBtn.appendChild(badge);
      } else {
        const img = document.createElement('img');
        img.src = item.url;
        img.alt = item.title;
        img.loading = 'lazy';
        thumbBtn.appendChild(img);
      }

      const body = document.createElement('div');
      body.className = 'media-body';

      const titleRow = document.createElement('div');
      titleRow.className = 'media-title-row';

      const title = document.createElement('h3');
      title.className = 'media-title';
      title.textContent = item.title;
      titleRow.appendChild(title);
      body.appendChild(titleRow);

      if (item.description) {
        const desc = document.createElement('p');
        desc.className = 'media-desc';
        desc.textContent = item.description;
        body.appendChild(desc);
      }

      const footer = document.createElement('div');
      footer.className = 'media-footer';

      const dateSpan = document.createElement('span');
      dateSpan.textContent = item.date || `#${item.id}`;
      footer.appendChild(dateSpan);

      if (state.adminToken && item.id !== undefined) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'inline-delete';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteItem('media', item.id);
        });
        footer.appendChild(delBtn);
      }

      body.appendChild(footer);
      card.appendChild(thumbBtn);
      card.appendChild(body);
      container.appendChild(card);
    });
  }

  function renderPoemsGrid(container, poems) {
    container.replaceChildren();
    if (poems.length === 0) {
      container.appendChild(createEmptyNode('poems'));
      return;
    }

    poems.forEach((poem, idx) => {
      const card = document.createElement('article');
      card.className = 'poem-card';

      const top = document.createElement('div');

      const header = document.createElement('div');
      header.className = 'poem-header';

      const title = document.createElement('h3');
      title.className = 'poem-title';
      title.textContent = poem.title;

      const date = document.createElement('span');
      date.className = 'poem-date';
      date.textContent = poem.date || `#${poem.id}`;

      header.appendChild(title);
      header.appendChild(date);

      const body = document.createElement('div');
      body.className = 'poem-body';
      body.textContent = poem.content;

      top.appendChild(header);
      top.appendChild(body);

      const footer = document.createElement('div');
      footer.className = 'poem-footer';

      const readBtn = document.createElement('button');
      readBtn.type = 'button';
      readBtn.className = 'read-btn';
      readBtn.textContent = 'Open';
      readBtn.addEventListener('click', () => openViewer(poems, idx));
      footer.appendChild(readBtn);

      if (state.adminToken && poem.id !== undefined) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'inline-delete';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => deleteItem('poems', poem.id));
        footer.appendChild(delBtn);
      }

      card.appendChild(top);
      card.appendChild(footer);
      container.appendChild(card);
    });
  }

  function renderAll() {
    renderCounts();
    applyFilterVisibility();
    renderMediaGrid(el.gridVideos, state.videos, 'videos');
    renderMediaGrid(el.gridPhotos, state.photos, 'photos');
    renderPoemsGrid(el.gridPoems, state.poems);
  }

  // Viewer Modal
  function openViewer(list, index) {
    state.viewerList = list;
    state.viewerIndex = index;
    updateViewerContent();
    el.viewerModal.hidden = false;
    el.viewerModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeViewer() {
    el.viewerStage.replaceChildren();
    el.viewerModal.hidden = true;
    el.viewerModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    state.viewerList = [];
    state.viewerIndex = -1;
  }

  function stepViewer(delta) {
    if (!state.viewerList.length) return;
    const len = state.viewerList.length;
    state.viewerIndex = (state.viewerIndex + delta + len) % len;
    updateViewerContent();
  }

  function updateViewerContent() {
    const item = state.viewerList[state.viewerIndex];
    if (!item) return;

    el.viewerStage.replaceChildren();
    el.viewerType.textContent = `${item.kind.toUpperCase()} (${state.viewerIndex + 1}/${state.viewerList.length})`;
    el.viewerTitle.textContent = item.title;
    el.viewerDescription.textContent = item.description || '';
    el.viewerDate.textContent = item.date || '';

    el.viewerPrev.disabled = state.viewerList.length <= 1;
    el.viewerNext.disabled = state.viewerList.length <= 1;

    if (state.adminToken && item.id !== undefined) {
      el.viewerDelete.hidden = false;
      el.viewerDelete.onclick = () => {
        const endpointType = item.kind === 'poem' ? 'poems' : 'media';
        deleteItem(endpointType, item.id, true);
      };
    } else {
      el.viewerDelete.hidden = true;
      el.viewerDelete.onclick = null;
    }

    if (item.kind === 'video') {
      const video = document.createElement('video');
      video.src = item.url;
      video.controls = true;
      video.autoplay = true;
      video.playsInline = true;
      el.viewerStage.appendChild(video);
    } else if (item.kind === 'photo') {
      const img = document.createElement('img');
      img.src = item.url;
      img.alt = item.title;
      el.viewerStage.appendChild(img);
    } else if (item.kind === 'poem') {
      const poemDiv = document.createElement('div');
      poemDiv.className = 'viewer-poem';
      poemDiv.textContent = item.content;
      el.viewerStage.appendChild(poemDiv);
    }
  }

  // Delete Handler
  async function deleteItem(endpointType, id, fromViewer = false) {
    if (!state.adminToken) {
      openAdminModal();
      return;
    }
    if (!window.confirm(`Delete item #${id}?`)) return;

    try {
      const res = await fetch(`/api/${endpointType}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'X-Admin-Token': state.adminToken,
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      if (fromViewer) closeViewer();
      await loadPortfolioData();
    } catch (err) {
      window.alert(`Delete failed: ${err.message}`);
    }
  }

  // Admin Modal
  function openAdminModal() {
    el.uploadMessage.hidden = true;
    el.poemMessage.hidden = true;
    el.adminModal.hidden = false;
    el.adminModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeAdminModal() {
    el.adminModal.hidden = true;
    el.adminModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Multipart Upload with XHR progress
  function handleMediaUpload(e) {
    e.preventDefault();
    el.uploadMessage.hidden = true;

    const token = el.adminTokenInput.value.trim() || state.adminToken;
    if (!token) {
      showFormMessage(el.uploadMessage, 'Admin token is required.', true);
      return;
    }

    const file = el.uploadFile.files[0];
    if (!file) {
      showFormMessage(el.uploadMessage, 'Select a file to upload.', true);
      return;
    }

    state.adminToken = token;
    sessionStorage.setItem('admin_token', token);
    updateTokenUI();

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', el.uploadTitle.value.trim());
    formData.append('description', el.uploadDescription.value.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    xhr.setRequestHeader('X-Admin-Token', token);

    el.uploadSubmit.disabled = true;
    el.uploadProgressWrap.hidden = false;
    el.uploadProgressBar.style.width = '0%';
    el.uploadPercent.textContent = '0%';
    el.uploadStatusText.textContent = 'Uploading...';

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const pct = Math.round((event.loaded / event.total) * 100);
        el.uploadProgressBar.style.width = `${pct}%`;
        el.uploadPercent.textContent = `${pct}%`;
      }
    };

    xhr.onload = async () => {
      el.uploadSubmit.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        el.uploadForm.reset();
        el.uploadStatusText.textContent = 'Complete';
        showFormMessage(el.uploadMessage, 'File uploaded.', false);
        await loadPortfolioData();
      } else {
        let errMsg = `Upload failed (${xhr.status})`;
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed.error || parsed.detail || parsed.message) {
            errMsg = parsed.error || parsed.detail || parsed.message;
          }
        } catch (_) {
          if (xhr.responseText) errMsg = xhr.responseText;
        }
        showFormMessage(el.uploadMessage, errMsg, true);
      }
    };

    xhr.onerror = () => {
      el.uploadSubmit.disabled = false;
      showFormMessage(el.uploadMessage, 'Network error during upload.', true);
    };

    xhr.send(formData);
  }

  // Poem Submission
  async function handlePoemSubmit(e) {
    e.preventDefault();
    el.poemMessage.hidden = true;

    const token = el.adminTokenInput.value.trim() || state.adminToken;
    if (!token) {
      showFormMessage(el.poemMessage, 'Admin token is required.', true);
      return;
    }

    state.adminToken = token;
    sessionStorage.setItem('admin_token', token);
    updateTokenUI();

    const title = el.poemTitle.value.trim();
    const content = el.poemContent.value.trim();

    el.poemSubmit.disabled = true;
    try {
      const res = await fetch('/api/poems', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': token,
        },
        body: JSON.stringify({ title, content }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `HTTP ${res.status}`);
      }

      el.poemForm.reset();
      showFormMessage(el.poemMessage, 'Poem published.', false);
      await loadPortfolioData();
    } catch (err) {
      showFormMessage(el.poemMessage, `Failed: ${err.message}`, true);
    } finally {
      el.poemSubmit.disabled = false;
    }
  }

  // Event Listeners
  function bindEvents() {
    el.filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.filter = btn.dataset.filter;
        applyFilterVisibility();
      });
    });

    el.resetFilter.addEventListener('click', (e) => {
      e.preventDefault();
      state.filter = 'all';
      applyFilterVisibility();
    });

    el.themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });

    el.adminToggle.addEventListener('click', openAdminModal);
    el.adminClose.addEventListener('click', closeAdminModal);

    el.saveTokenBtn.addEventListener('click', () => {
      state.adminToken = el.adminTokenInput.value.trim();
      if (state.adminToken) {
        sessionStorage.setItem('admin_token', state.adminToken);
      } else {
        sessionStorage.removeItem('admin_token');
      }
      updateTokenUI();
    });

    el.tabBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        el.tabBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        const isMedia = btn.dataset.tab === 'upload-media';
        el.uploadForm.hidden = !isMedia;
        el.poemForm.hidden = isMedia;
      });
    });

    el.uploadForm.addEventListener('submit', handleMediaUpload);
    el.poemForm.addEventListener('submit', handlePoemSubmit);

    // Viewer Controls
    el.viewerClose.addEventListener('click', closeViewer);
    el.viewerPrev.addEventListener('click', () => stepViewer(-1));
    el.viewerNext.addEventListener('click', () => stepViewer(1));

    // Backdrop click to close
    el.viewerModal.addEventListener('click', (e) => {
      if (e.target === el.viewerModal) closeViewer();
    });
    el.adminModal.addEventListener('click', (e) => {
      if (e.target === el.adminModal) closeAdminModal();
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (!el.viewerModal.hidden) {
        if (e.key === 'Escape') closeViewer();
        if (e.key === 'ArrowLeft') stepViewer(-1);
        if (e.key === 'ArrowRight') stepViewer(1);
      } else if (!el.adminModal.hidden && e.key === 'Escape') {
        closeAdminModal();
      }
    });
  }

  // Initialize
  initTheme();
  updateTokenUI();
  bindEvents();
  loadPortfolioData();
})();
