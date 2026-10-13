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
    searchQuery: '',
    searchOpen: false,
    searchExpanded: false,
  };

  const dom = {
    navPill: document.getElementById('nav-pill'),
    navItems: document.querySelectorAll('.nav-item'),
    themeToggle: document.getElementById('theme-toggle'),
    uploadToggle: document.getElementById('upload-toggle'),
    authIndicator: document.getElementById('auth-indicator'),

    webSearch: document.getElementById('web-search'),
    searchTrigger: document.getElementById('web-search-trigger'),
    searchGlobeTile: document.getElementById('search-globe-tile'),
    searchRingFill: document.getElementById('search-ring-fill'),
    searchInput: document.getElementById('search-input'),
    searchBadgeStack: document.getElementById('search-badge-stack'),
    searchChevron: document.getElementById('search-chevron'),
    searchDropdown: document.getElementById('search-dropdown'),
    searchStatusText: document.getElementById('search-status-text'),
    searchGrid: document.getElementById('search-grid'),

    bentoStage: document.getElementById('bento-stage'),
    slotPrimary: document.getElementById('slot-primary'),
    slotStack: document.getElementById('slot-stack'),
    slotTop: document.getElementById('slot-top'),
    slotBottom: document.getElementById('slot-bottom'),

    gutterMainV: document.getElementById('gutter-main-v'),
    gutterStackH: document.getElementById('gutter-stack-h'),
    gutterUpload: document.getElementById('gutter-upload'),
    gutterDrop: document.getElementById('gutter-drop'),

    panels: document.querySelectorAll('.bento-stage .bento-panel'),
    expandBtns: document.querySelectorAll('[data-expand]'),

    bodyVideos: document.getElementById('body-videos'),
    bodyPhotos: document.getElementById('body-photos'),
    bodyPoems: document.getElementById('body-poems'),

    uploadDock: document.getElementById('upload-dock'),
    uploadClose: document.getElementById('upload-close'),
    uploadTabs: document.querySelectorAll('.upload-tab'),

    adminToken: document.getElementById('admin-token'),
    saveToken: document.getElementById('save-token'),

    uploadForm: document.getElementById('upload-form'),
    dropSurface: document.getElementById('drop-surface'),
    uploadFile: document.getElementById('upload-file'),
    dropPreview: document.getElementById('drop-preview'),
    dropEmpty: document.getElementById('drop-empty'),
    dropTitle: document.getElementById('drop-title'),
    dropHint: document.getElementById('drop-hint'),

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
     RESIZABLE GUTTERS & DRAG-TO-SWAP PANELS
     ======================================================================== */
  function initWorkspaceInteractions() {
    // 1. Main Vertical Gutter (Primary Slot <-> Right Stack)
    let vDrag = false;
    let vStartX = 0;
    let startLeftW = 0;
    let startRightW = 0;

    dom.gutterMainV.addEventListener('mousedown', (e) => {
      e.preventDefault();
      vDrag = true;
      vStartX = e.clientX;
      startLeftW = dom.slotPrimary.getBoundingClientRect().width;
      startRightW = dom.slotStack.getBoundingClientRect().width;
      dom.gutterMainV.classList.add('is-active');
      document.body.classList.add('is-resizing');
    });

    dom.gutterMainV.addEventListener('dblclick', () => {
      dom.slotPrimary.style.flexBasis = '54%';
      dom.slotStack.style.flexBasis = '46%';
    });

    // 2. Stack Horizontal Gutter (Top Slot <-> Bottom Slot)
    let hDrag = false;
    let hStartY = 0;
    let startTopH = 0;
    let startBotH = 0;

    dom.gutterStackH.addEventListener('mousedown', (e) => {
      e.preventDefault();
      hDrag = true;
      hStartY = e.clientY;
      startTopH = dom.slotTop.getBoundingClientRect().height;
      startBotH = dom.slotBottom.getBoundingClientRect().height;
      dom.gutterStackH.classList.add('is-active');
      document.body.classList.add('is-resizing');
    });

    dom.gutterStackH.addEventListener('dblclick', () => {
      dom.slotTop.style.flexBasis = '52%';
      dom.slotBottom.style.flexBasis = '48%';
    });

    // 3. Upload Dock Width Gutter
    let upDrag = false;
    dom.gutterUpload.addEventListener('mousedown', (e) => {
      e.preventDefault();
      upDrag = true;
      dom.gutterUpload.classList.add('is-active');
      document.body.classList.add('is-resizing');
    });

    // 4. File Dropzone Height Gutter
    let dropDrag = false;
    let dropStartY = 0;
    let dropStartH = 0;

    dom.gutterDrop.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dropDrag = true;
      dropStartY = e.clientY;
      dropStartH = dom.dropSurface.getBoundingClientRect().height;
      dom.gutterDrop.classList.add('is-active');
      document.body.classList.add('is-resizing');
    });

    window.addEventListener('mousemove', (e) => {
      if (vDrag) {
        const total = startLeftW + startRightW;
        const delta = e.clientX - vStartX;
        const minW = 240;
        const nextLeft = Math.min(Math.max(startLeftW + delta, minW), total - minW);
        const nextRight = total - nextLeft;
        dom.slotPrimary.style.flexBasis = `${(nextLeft / total) * 100}%`;
        dom.slotStack.style.flexBasis = `${(nextRight / total) * 100}%`;
      }

      if (hDrag) {
        const total = startTopH + startBotH;
        const delta = e.clientY - hStartY;
        const minH = 140;
        const nextTop = Math.min(Math.max(startTopH + delta, minH), total - minH);
        const nextBot = total - nextTop;
        dom.slotTop.style.flexBasis = `${(nextTop / total) * 100}%`;
        dom.slotBottom.style.flexBasis = `${(nextBot / total) * 100}%`;
      }

      if (upDrag) {
        const nextW = Math.min(Math.max(window.innerWidth - e.clientX - 14, 300), window.innerWidth * 0.62);
        document.documentElement.style.setProperty('--upload-w', `${nextW}px`);
      }

      if (dropDrag) {
        const nextH = Math.min(Math.max(dropStartH + (e.clientY - dropStartY), 110), window.innerHeight * 0.6);
        document.documentElement.style.setProperty('--drop-h', `${nextH}px`);
      }
    });

    window.addEventListener('mouseup', () => {
      if (vDrag || hDrag || upDrag || dropDrag) {
        vDrag = false;
        hDrag = false;
        upDrag = false;
        dropDrag = false;
        dom.gutterMainV.classList.remove('is-active');
        dom.gutterStackH.classList.remove('is-active');
        dom.gutterUpload.classList.remove('is-active');
        dom.gutterDrop.classList.remove('is-active');
        document.body.classList.remove('is-resizing');
      }
    });

    // 5. Drag-and-Drop Panel Swapping (Swap any two Bento slots)
    let draggedPanel = null;

    dom.panels.forEach((panel) => {
      panel.addEventListener('dragstart', (e) => {
        draggedPanel = panel;
        e.dataTransfer.effectAllowed = 'move';
      });

      panel.addEventListener('dragover', (e) => {
        if (!draggedPanel || draggedPanel === panel) return;
        e.preventDefault();
        panel.classList.add('is-drag-target');
      });

      panel.addEventListener('dragleave', () => {
        panel.classList.remove('is-drag-target');
      });

      panel.addEventListener('drop', (e) => {
        e.preventDefault();
        panel.classList.remove('is-drag-target');
        if (!draggedPanel || draggedPanel === panel) return;

        const slotA = draggedPanel.parentElement;
        const slotB = panel.parentElement;
        if (slotA && slotB) {
          slotA.appendChild(panel);
          slotB.appendChild(draggedPanel);
          applyFilter(state.filter);
        }
        draggedPanel = null;
      });
    });
  }

  /* ========================================================================
     FILTERING & UPLOAD DOCK TOGGLE
     ======================================================================== */
  function applyFilter(nextFilter) {
    state.filter = nextFilter;

    dom.navItems.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.filter === nextFilter);
    });

    dom.navPill.classList.toggle('is-pinned', nextFilter !== 'all');

    const isAll = nextFilter === 'all';
    const pPrimary = dom.slotPrimary.querySelector('.bento-panel');
    const pTop = dom.slotTop.querySelector('.bento-panel');
    const pBottom = dom.slotBottom.querySelector('.bento-panel');

    const showPrimary = isAll || (pPrimary && pPrimary.dataset.panel === nextFilter);
    const showTop = isAll || (pTop && pTop.dataset.panel === nextFilter);
    const showBottom = isAll || (pBottom && pBottom.dataset.panel === nextFilter);

    dom.slotPrimary.hidden = !showPrimary;
    dom.slotTop.hidden = !showTop;
    dom.slotBottom.hidden = !showBottom;
    dom.slotStack.hidden = !showTop && !showBottom;

    dom.gutterMainV.hidden = !(showPrimary && (showTop || showBottom));
    dom.gutterStackH.hidden = !(showTop && showBottom);
  }

  function openUploadWithMode(mode) {
    state.uploadOpen = true;
    dom.uploadDock.classList.add('is-open');
    dom.uploadDock.setAttribute('aria-hidden', 'false');
    dom.gutterUpload.hidden = false;
    dom.uploadToggle.setAttribute('aria-expanded', 'true');
    dom.uploadToggle.classList.add('is-active');

    if (mode) {
      dom.uploadTabs.forEach((t) => t.classList.toggle('is-active', t.dataset.mode === mode));
      const isMedia = mode === 'media';
      dom.uploadForm.hidden = !isMedia;
      dom.poemForm.hidden = isMedia;
    }
  }

  function toggleUploadDock(force) {
    const next = typeof force === 'boolean' ? force : !state.uploadOpen;
    if (next) {
      openUploadWithMode();
    } else {
      state.uploadOpen = false;
      dom.uploadDock.classList.remove('is-open');
      dom.uploadDock.setAttribute('aria-hidden', 'true');
      dom.gutterUpload.hidden = true;
      dom.uploadToggle.setAttribute('aria-expanded', 'false');
      dom.uploadToggle.classList.remove('is-active');
    }
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

  function createEmptyState(labelText, subText) {
    const box = document.createElement('div');
    box.className = 'empty-state';

    const label = document.createElement('span');
    label.className = 'empty-state-label';
    label.textContent = labelText;
    box.appendChild(label);

    if (subText) {
      const sub = document.createElement('span');
      sub.className = 'empty-state-sub';
      sub.textContent = subText;
      box.appendChild(sub);
    }

    return box;
  }

  function buildMediaInfo(item, endpoint) {
    const info = document.createElement('figcaption');
    info.className = 'media-info';

    const text = document.createElement('div');
    text.className = 'media-text';

    const title = document.createElement('span');
    title.className = 'media-title';
    title.textContent = item.title;
    text.appendChild(title);

    if (item.description) {
      const desc = document.createElement('span');
      desc.className = 'media-desc';
      desc.textContent = item.description;
      text.appendChild(desc);
    }

    info.appendChild(text);

    if (state.token && item.id !== undefined) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'delete-btn';
      del.textContent = 'Delete';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteEntry(endpoint, item.id);
      });
      info.appendChild(del);
    }

    return info;
  }

  /* ========================================================================
     WEB SEARCH ENGINE (21st.dev inspired with Progress Ring & Match Stack)
     ======================================================================== */
  const CIRCLE_CIRCUMFERENCE = 81.68; // 2 * PI * 13

  function setRingProgress(progress) {
    if (!dom.searchRingFill) return;
    const p = Math.max(0, Math.min(1, progress));
    const offset = CIRCLE_CIRCUMFERENCE * (1 - p);
    dom.searchRingFill.style.strokeDashoffset = `${offset.toFixed(2)}`;
  }

  function getMatchingItems(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      return {
        videos: state.videos,
        photos: state.photos,
        poems: state.poems,
        total: state.videos.length + state.photos.length + state.poems.length,
      };
    }

    const videos = state.videos.filter(v =>
      (v.title || '').toLowerCase().includes(q) || (v.description || '').toLowerCase().includes(q)
    );
    const photos = state.photos.filter(p =>
      (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
    );
    const poems = state.poems.filter(p =>
      (p.title || '').toLowerCase().includes(q) || (p.content || '').toLowerCase().includes(q)
    );

    return { videos, photos, poems, total: videos.length + photos.length + poems.length };
  }

  function updateSearchUI() {
    const q = state.searchQuery.trim();
    const hasQuery = q.length > 0;
    const totalAll = state.videos.length + state.photos.length + state.poems.length;
    const matches = getMatchingItems(q);

    // Update progress ring
    if (!hasQuery) {
      setRingProgress(0);
      dom.webSearch.classList.remove('is-searching');
    } else {
      dom.webSearch.classList.add('is-searching');
      const ratio = totalAll > 0 ? matches.total / totalAll : 0;
      const prog = Math.min(1, Math.max(0.25, ratio));
      setRingProgress(prog);
    }

    // Update Badge Stack (FaviconStack fanning out on hover)
    dom.searchBadgeStack.replaceChildren();
    if (hasQuery && matches.total > 0) {
      const badges = [];
      if (matches.videos.length > 0) badges.push({ type: 'video', label: 'V', count: matches.videos.length });
      if (matches.photos.length > 0) badges.push({ type: 'photo', label: 'P', count: matches.photos.length });
      if (matches.poems.length > 0) badges.push({ type: 'poem', label: 'W', count: matches.poems.length });

      badges.forEach((b) => {
        const span = document.createElement('span');
        span.className = `stack-badge stack-badge--${b.type}`;
        span.title = `${b.count} ${b.type}s`;
        span.textContent = b.label;
        dom.searchBadgeStack.appendChild(span);
      });
    }

    // Update Dropdown Grid
    if (state.searchOpen && hasQuery) {
      dom.searchDropdown.hidden = false;
      dom.searchDropdown.setAttribute('aria-hidden', 'false');
      dom.webSearch.classList.add('is-open');
      dom.searchTrigger.setAttribute('aria-expanded', 'true');

      dom.searchStatusText.textContent = `${matches.total} ${matches.total === 1 ? 'item' : 'items'} found`;

      dom.searchGrid.replaceChildren();

      if (matches.total === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.style.gridColumn = '1 / -1';
        emptyLi.appendChild(createEmptyState('NO MATCHES', `No items matching "${q}"`));
        dom.searchGrid.appendChild(emptyLi);
      } else {
        const allMatches = [
          ...matches.videos.map((v) => ({ ...v, type: 'video', label: 'Video', sub: v.description || 'Video track' })),
          ...matches.photos.map((p) => ({ ...p, type: 'photo', label: 'Photo', sub: p.description || 'Photo capture' })),
          ...matches.poems.map((pm) => ({ ...pm, type: 'poem', label: 'Poem', sub: pm.content ? pm.content.slice(0, 45) + '...' : 'Poem' })),
        ];

        const COLUMNS = 4;
        const limit = state.searchExpanded ? allMatches.length : COLUMNS;
        const shown = allMatches.slice(0, limit);
        const overflow = allMatches.length > COLUMNS && !state.searchExpanded;

        shown.forEach((item, idx) => {
          const li = document.createElement('li');
          const card = document.createElement('div');
          card.className = 'source-card';
          card.tabIndex = 0;

          const title = document.createElement('div');
          title.className = 'source-card-title';
          title.textContent = item.title;
          card.appendChild(title);

          const footer = document.createElement('div');
          footer.className = 'source-card-footer';

          const typePill = document.createElement('span');
          typePill.className = `source-type-pill stack-badge--${item.type}`;
          typePill.textContent = item.label;
          footer.appendChild(typePill);

          const sub = document.createElement('span');
          sub.className = 'source-card-sub';
          sub.textContent = item.sub;
          footer.appendChild(sub);

          const idxSpan = document.createElement('span');
          idxSpan.className = 'source-card-idx';
          idxSpan.textContent = `${idx + 1}`;
          footer.appendChild(idxSpan);

          card.appendChild(footer);

          // Card click navigation
          card.addEventListener('click', () => {
            selectSearchResult(item);
          });
          card.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') selectSearchResult(item);
          });

          li.appendChild(card);
          dom.searchGrid.appendChild(li);
        });

        if (overflow) {
          const moreLi = document.createElement('li');
          const moreBtn = document.createElement('button');
          moreBtn.type = 'button';
          moreBtn.className = 'more-card';
          moreBtn.innerHTML = `
            <span class="more-card-text">+${allMatches.length - COLUMNS} more items</span>
            <span class="source-card-sub">Click to expand all</span>
          `;
          moreBtn.addEventListener('click', () => {
            state.searchExpanded = true;
            updateSearchUI();
          });
          moreLi.appendChild(moreBtn);
          dom.searchGrid.appendChild(moreLi);
        } else if (state.searchExpanded && allMatches.length > COLUMNS) {
          const lessLi = document.createElement('li');
          lessLi.style.gridColumn = '1 / -1';
          const lessBtn = document.createElement('button');
          lessBtn.type = 'button';
          lessBtn.className = 'pill-btn';
          lessBtn.style.margin = '4px auto 0';
          lessBtn.textContent = 'Show less';
          lessBtn.addEventListener('click', () => {
            state.searchExpanded = false;
            updateSearchUI();
          });
          lessLi.appendChild(lessBtn);
          dom.searchGrid.appendChild(lessLi);
        }
      }
    } else {
      closeSearchDropdown();
    }

    renderPanels();
  }

  function selectSearchResult(item) {
    closeSearchDropdown();
    if (item.type === 'photo') {
      const idx = state.photos.findIndex(p => p.id === item.id);
      if (idx !== -1) openLightbox(idx);
    } else if (item.type === 'video') {
      applyFilter('all');
      const vCard = dom.bodyVideos.querySelector(`[data-id="${item.id}"]`) || dom.bodyVideos.firstElementChild;
      if (vCard) {
        vCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        vCard.style.outline = '2px solid var(--fg)';
        setTimeout(() => { vCard.style.outline = ''; }, 1800);
      }
    } else if (item.type === 'poem') {
      applyFilter('all');
      const pCard = dom.bodyPoems.querySelector(`[data-id="${item.id}"]`) || dom.bodyPoems.firstElementChild;
      if (pCard) {
        pCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pCard.style.outline = '2px solid var(--fg)';
        setTimeout(() => { pCard.style.outline = ''; }, 1800);
      }
    }
  }

  function closeSearchDropdown() {
    state.searchOpen = false;
    dom.searchDropdown.hidden = true;
    dom.searchDropdown.setAttribute('aria-hidden', 'true');
    dom.webSearch.classList.remove('is-open');
    dom.searchTrigger.setAttribute('aria-expanded', 'false');
  }

  function renderPanels() {
    const q = state.searchQuery.toLowerCase().trim();
    const hasQuery = q.length > 0;

    const vList = hasQuery
      ? state.videos.filter(v => (v.title || '').toLowerCase().includes(q) || (v.description || '').toLowerCase().includes(q))
      : state.videos;
    const pList = hasQuery
      ? state.photos.filter(p => (p.title || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q))
      : state.photos;
    const pmList = hasQuery
      ? state.poems.filter(pm => (pm.title || '').toLowerCase().includes(q) || (pm.content || '').toLowerCase().includes(q))
      : state.poems;

    // Videos
    dom.bodyVideos.replaceChildren();
    if (vList.length === 0) {
      dom.bodyVideos.appendChild(
        createEmptyState('NO MEDIA', hasQuery ? `No videos matching "${state.searchQuery}"` : 'No videos yet')
      );
    } else {
      vList.forEach((v) => {
        const fig = document.createElement('figure');
        fig.className = 'media-card';
        if (v.id !== undefined) fig.dataset.id = v.id;

        const visual = document.createElement('div');
        visual.className = 'media-visual';

        const video = document.createElement('video');
        video.src = v.url;
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;

        visual.appendChild(video);
        fig.appendChild(visual);
        fig.appendChild(buildMediaInfo(v, 'media'));
        dom.bodyVideos.appendChild(fig);
      });
    }

    // Photos
    dom.bodyPhotos.replaceChildren();
    if (pList.length === 0) {
      dom.bodyPhotos.appendChild(
        createEmptyState('NO MEDIA', hasQuery ? `No photos matching "${state.searchQuery}"` : 'No photos yet')
      );
    } else {
      pList.forEach((p) => {
        const fig = document.createElement('figure');
        fig.className = 'media-card';
        if (p.id !== undefined) fig.dataset.id = p.id;

        const visual = document.createElement('div');
        visual.className = 'media-visual';
        const originalIdx = state.photos.findIndex(item => item.id === p.id);
        visual.addEventListener('click', () => openLightbox(originalIdx !== -1 ? originalIdx : 0));

        const img = document.createElement('img');
        img.src = p.url;
        img.alt = p.title;
        img.loading = 'lazy';

        visual.appendChild(img);
        fig.appendChild(visual);
        fig.appendChild(buildMediaInfo(p, 'media'));
        dom.bodyPhotos.appendChild(fig);
      });
    }

    // Poems
    dom.bodyPoems.replaceChildren();
    if (pmList.length === 0) {
      dom.bodyPoems.appendChild(
        createEmptyState('NO POEMS', hasQuery ? `No poems matching "${state.searchQuery}"` : 'No poems yet')
      );
    } else {
      pmList.forEach((poem) => {
        const article = document.createElement('article');
        article.className = 'poem-card';
        if (poem.id !== undefined) article.dataset.id = poem.id;

        const head = document.createElement('div');
        head.className = 'poem-head';

        const title = document.createElement('h3');
        title.className = 'poem-title';
        title.textContent = poem.title;
        head.appendChild(title);

        if (state.token && poem.id !== undefined) {
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'delete-btn';
          del.textContent = 'Delete';
          del.addEventListener('click', () => deleteEntry('poems', poem.id));
          head.appendChild(del);
        }

        const body = document.createElement('div');
        body.className = 'poem-body';
        body.textContent = poem.content;

        article.appendChild(head);
        article.appendChild(body);
        dom.bodyPoems.appendChild(article);
      });
    }
  }

  /* ========================================================================
     UPLOAD, POEM & DELETE HANDLERS
     ======================================================================== */
  function syncTokenUI() {
    dom.adminToken.value = state.token;
    dom.authIndicator.hidden = !state.token;
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

  function updateDropPreview() {
    const file = dom.uploadFile.files[0];
    dom.dropPreview.replaceChildren();

    if (!file) {
      dom.dropPreview.hidden = true;
      dom.dropEmpty.hidden = false;
      dom.dropTitle.textContent = 'Drop or select a video or photo';
      dom.dropHint.textContent = 'Drag bottom handle below to resize';
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    dom.dropEmpty.hidden = true;
    dom.dropPreview.hidden = false;

    if (file.type.startsWith('video/')) {
      const vid = document.createElement('video');
      vid.src = blobUrl;
      vid.controls = true;
      vid.muted = true;
      vid.playsInline = true;
      dom.dropPreview.appendChild(vid);
    } else if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = blobUrl;
      dom.dropPreview.appendChild(img);
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
        updateDropPreview();
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
    initWorkspaceInteractions();

    dom.themeToggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('portfolio_theme', next);
    });

    dom.navItems.forEach((btn) => {
      btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
    });

    dom.expandBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.expand;
        applyFilter(state.filter === target ? 'all' : target);
      });
    });

    dom.uploadToggle.addEventListener('click', () => toggleUploadDock());
    dom.uploadClose.addEventListener('click', () => toggleUploadDock(false));

    dom.saveToken.addEventListener('click', () => {
      state.token = dom.adminToken.value.trim();
      sessionStorage.setItem('admin_token', state.token);
      syncTokenUI();
      renderPanels();
    });

    dom.uploadTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        dom.uploadTabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        const isMedia = tab.dataset.mode === 'media';
        dom.uploadForm.hidden = !isMedia;
        dom.poemForm.hidden = isMedia;
      });
    });

    dom.uploadFile.addEventListener('change', updateDropPreview);
    dom.dropSurface.addEventListener('dragover', () => dom.dropSurface.classList.add('is-dragover'));
    dom.dropSurface.addEventListener('dragleave', () => dom.dropSurface.classList.remove('is-dragover'));
    dom.dropSurface.addEventListener('drop', () => dom.dropSurface.classList.remove('is-dragover'));

    dom.uploadForm.addEventListener('submit', handleMediaUpload);
    dom.poemForm.addEventListener('submit', handlePoemUpload);

    dom.lbClose.addEventListener('click', closeLightbox);
    dom.lbPrev.addEventListener('click', () => stepLightbox(-1));
    dom.lbNext.addEventListener('click', () => stepLightbox(1));

    // WebSearch Events
    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        state.searchOpen = state.searchQuery.trim().length > 0;
        updateSearchUI();
      });

      dom.searchInput.addEventListener('focus', () => {
        if (state.searchQuery.trim().length > 0) {
          state.searchOpen = true;
          updateSearchUI();
        }
      });
    }

    if (dom.searchChevron) {
      dom.searchChevron.addEventListener('click', (e) => {
        e.stopPropagation();
        state.searchOpen = !state.searchOpen;
        updateSearchUI();
      });
    }

    document.addEventListener('click', (e) => {
      if (dom.webSearch && !dom.webSearch.contains(e.target)) {
        closeSearchDropdown();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!dom.lightbox.hidden) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') stepLightbox(-1);
        if (e.key === 'ArrowRight') stepLightbox(1);
      } else if (state.searchOpen && e.key === 'Escape') {
        closeSearchDropdown();
      } else if (document.activeElement === dom.searchInput && e.key === 'Escape') {
        dom.searchInput.value = '';
        state.searchQuery = '';
        closeSearchDropdown();
        updateSearchUI();
        dom.searchInput.blur();
      } else if (state.uploadOpen && e.key === 'Escape') {
        toggleUploadDock(false);
      } else if (
        e.key === '/' &&
        dom.searchInput &&
        document.activeElement !== dom.searchInput &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        dom.searchInput.focus();
        dom.searchInput.select();
      }
    });

    fetchPortfolio();
  }

  init();
})();

