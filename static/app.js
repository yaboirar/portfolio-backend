(() => {
  'use strict';

  const STAGGER = 0.035;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 12.5; // ~78.54
  const NAV_ICONS = {
    all: `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    videos: `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="15" height="16" rx="2"/><polygon points="22 8 17 12 22 16 22 8"/></svg>`,
    photos: `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
    poems: `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>`,
  };

  const CATEGORIES = [
    { key: 'all', label: 'All', title: 'All (Home)', icon: NAV_ICONS.all },
    { key: 'videos', label: 'Videos', title: 'Videos', icon: NAV_ICONS.videos },
    { key: 'photos', label: 'Photos', title: 'Photos', icon: NAV_ICONS.photos },
    { key: 'poems', label: 'Poems', title: 'Poems', icon: NAV_ICONS.poems },
  ];

  const state = {
    videos: [],
    photos: [],
    poems: [],
    filter: 'all',
    searchQuery: '',
    uploadOpen: false,
    lightboxIndex: -1,
    token: sessionStorage.getItem('admin_token') || '',
    // Saved split ratios for 'all' view so single-category view can go 100% fullscreen cleanly
    split: {
      primaryPct: 54,
      stackPct: 46,
      topPct: 52,
      bottomPct: 48,
    },
  };

  const panelState = {
    videos: { search: '', filter: 'all', sort: 'newest', searchOpen: false },
    photos: { search: '', filter: 'all', sort: 'newest', searchOpen: false },
    poems:  { search: '', filter: 'all', sort: 'newest', searchOpen: false },
  };

  const dom = {
    navPill: document.getElementById('nav-pill'),
    navCurrent: document.getElementById('nav-current'),
    navDrawerList: document.getElementById('nav-drawer-list'),

    searchHub: document.getElementById('search-hub'),
    searchPill: document.getElementById('search-pill'),
    searchInput: document.getElementById('search-input'),
    searchRingFill: document.getElementById('search-ring-fill'),
    searchStack: document.getElementById('search-stack'),
    searchCount: document.getElementById('search-count'),
    searchClear: document.getElementById('search-clear'),

    themeToggle: document.getElementById('theme-toggle'),
    uploadToggle: document.getElementById('upload-toggle'),
    authIndicator: document.getElementById('auth-indicator'),

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
     TOP-LEFT NAVIGATION: SHRINK TO ACTIVE CATEGORY & SLIDE OUT OTHERS ON HOVER
     ======================================================================== */
  function uiScale() {
    return Math.min(1, Math.max(0.5, window.innerWidth / 1440));
  }

  let navReady = false;
  let navHovered = false;
  let navLocked = false;
  let navKeyboardOpen = false;
  let navPainted = false;
  const navAnimations = new WeakMap();

  function animateNavElement(element, target, delay = 0) {
    const current = getComputedStyle(element);
    const from = {};
    Object.keys(target).forEach((key) => { from[key] = current[key]; });
    const previous = navAnimations.get(element);
    if (previous) previous.cancel();
    Object.assign(element.style, target);
    if (!navPainted || typeof element.animate !== 'function') return;
    if (Object.keys(target).every((key) => from[key] === target[key])) return;
    const animation = element.animate([from, target], {
      duration: 460, delay, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both'
    });
    navAnimations.set(element, animation);
    animation.onfinish = () => {
      if (navAnimations.get(element) === animation) {
        navAnimations.delete(element);
        animation.cancel();
      }
    };
  }

  function createNavIconSlot(key, className = '') {
    const span = document.createElement('span');
    span.className = `nav-icon-slot ${className}`.trim();
    span.dataset.key = key;
    span.innerHTML = NAV_ICONS[key] || NAV_ICONS.all;
    return span;
  }

  function setNavIcon(slot, key) {
    if (slot.dataset.key === key) return;
    slot.dataset.key = key;
    slot.innerHTML = NAV_ICONS[key] || NAV_ICONS.all;
  }

  function animateNavIcon(slot, visible, exitDirection) {
    animateNavElement(slot, {
      transform: visible ? 'scale(1) translateY(0%)' : `scale(0.7) translateY(${exitDirection * 40}%)`,
      opacity: visible ? '1' : '0'
    }, 0);
  }

  function syncNavPresentation() {
    const expanded = !navLocked && (navHovered || navKeyboardOpen);
    const cat = CATEGORIES.find((c) => c.key === state.filter) || CATEGORIES[0];
    const selected = dom.navCurrent.querySelector('.nav-selected-icon');
    if (selected) setNavIcon(selected, cat.key);

    dom.navPill.classList.toggle('is-expanded', expanded);
    dom.navPill.classList.remove('is-collapsing');
    dom.navCurrent.dataset.filter = expanded ? 'all' : cat.key;
    dom.navCurrent.title = expanded ? 'All (Home)' : cat.title;
    dom.navCurrent.setAttribute('aria-label', expanded ? 'Show all categories' : `${cat.title}: show all categories`);
    dom.navCurrent.setAttribute('aria-expanded', String(expanded));
    dom.navCurrent.classList.toggle('is-active', !expanded || state.filter === 'all');

    const drawer = document.getElementById('nav-drawer');
    drawer.inert = !expanded;
    drawer.setAttribute('aria-hidden', String(!expanded));

    dom.navDrawerList.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.filter === state.filter);
      btn.setAttribute('aria-pressed', String(btn.dataset.filter === state.filter));
    });

    const itemSize = 38 * uiScale();
    animateNavElement(dom.navCurrent, { width: `${itemSize}px`, height: `${itemSize}px` });

    const drawerWidth = Math.ceil(dom.navDrawerList.scrollWidth) + 18 * uiScale();
    animateNavElement(drawer, {
      width: expanded ? `${drawerWidth}px` : '0px',
      paddingLeft: expanded ? `${10 * uiScale()}px` : '0px',
      opacity: expanded ? '1' : '0',
      transform: expanded ? 'translateX(0px)' : `translateX(${-6 * uiScale()}px)`
    });

    if (selected) animateNavIcon(selected, !expanded, -1);
    const allIcon = dom.navCurrent.querySelector('.nav-all-icon');
    if (allIcon) animateNavIcon(allIcon, expanded, 1);
    navPainted = true;
  }

  function renderNavPill(activeKey, shrinkImmediately = false) {
    if (!navReady) {
      navReady = true;
      const iconsContainer = document.createElement('span');
      iconsContainer.className = 'nav-current-icons';
      iconsContainer.setAttribute('aria-hidden', 'true');

      const selectedSlot = createNavIconSlot('all', 'nav-selected-icon');
      const allSlot = createNavIconSlot('all', 'nav-all-icon');
      allSlot.style.opacity = '0';
      allSlot.style.transform = 'scale(0.7) translateY(40%)';

      iconsContainer.appendChild(selectedSlot);
      iconsContainer.appendChild(allSlot);

      dom.navCurrent.replaceChildren(iconsContainer);
      dom.navCurrent.setAttribute('aria-controls', 'nav-drawer');

      dom.navDrawerList.replaceChildren();
      CATEGORIES.filter((cat) => cat.key !== 'all').forEach((cat) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item';
        btn.dataset.filter = cat.key;
        btn.title = cat.title;
        btn.setAttribute('aria-label', cat.title);
        btn.innerHTML = cat.icon;
        btn.addEventListener('click', () => applyFilter(cat.key, true));
        dom.navDrawerList.appendChild(btn);
      });
      dom.navPill.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        navHovered = true;
        syncNavPresentation();
      });
      dom.navPill.addEventListener('pointerleave', () => {
        navHovered = false;
        navLocked = false;
        syncNavPresentation();
      });
      dom.navPill.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          navKeyboardOpen = false;
          navLocked = navHovered;
          dom.navCurrent.focus();
          syncNavPresentation();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          navLocked = false;
          navKeyboardOpen = true;
          syncNavPresentation();
          dom.navDrawerList.querySelector('button').focus();
        } else if (e.key === 'Tab' && !e.shiftKey && e.target === dom.navCurrent) {
          navLocked = false;
          navKeyboardOpen = true;
          syncNavPresentation();
        }
      });
      dom.navPill.addEventListener('focusout', (e) => {
        if (!dom.navPill.contains(e.relatedTarget)) {
          navKeyboardOpen = false;
          syncNavPresentation();
        }
      });
      window.addEventListener('resize', syncNavPresentation);
      if (document.fonts) document.fonts.ready.then(syncNavPresentation);
    }
    if (shrinkImmediately) {
      navLocked = navHovered;
      navKeyboardOpen = false;
      if (dom.navPill.contains(document.activeElement)) dom.navCurrent.focus({ preventScroll: true });
    }
    syncNavPresentation();
  }

  /* ========================================================================
     FILTERING & TRUE 100% FULLSCREEN SINGLE-CATEGORY VIEW
     ======================================================================== */
  function syncSlotFlexSizing() {
    const isAll = state.filter === 'all';
    const pPrimary = dom.slotPrimary.querySelector('.bento-panel');
    const pTop = dom.slotTop.querySelector('.bento-panel');
    const pBottom = dom.slotBottom.querySelector('.bento-panel');

    if (isAll) {
      dom.slotPrimary.style.flex = `${state.split.primaryPct} 1 0px`;
      dom.slotPrimary.style.opacity = '1';
      dom.slotPrimary.style.visibility = 'visible';
      dom.slotPrimary.style.pointerEvents = 'auto';

      dom.slotStack.style.flex = `${state.split.stackPct} 1 0px`;
      dom.slotStack.style.opacity = '1';
      dom.slotStack.style.visibility = 'visible';
      dom.slotStack.style.pointerEvents = 'auto';

      dom.slotTop.style.flex = `${state.split.topPct} 1 0px`;
      dom.slotTop.style.opacity = '1';
      dom.slotTop.style.visibility = 'visible';
      dom.slotTop.style.pointerEvents = 'auto';

      dom.slotBottom.style.flex = `${state.split.bottomPct} 1 0px`;
      dom.slotBottom.style.opacity = '1';
      dom.slotBottom.style.visibility = 'visible';
      dom.slotBottom.style.pointerEvents = 'auto';

      dom.gutterMainV.style.opacity = '1';
      dom.gutterMainV.style.pointerEvents = 'auto';
      dom.gutterMainV.style.width = '';

      dom.gutterStackH.style.opacity = '1';
      dom.gutterStackH.style.pointerEvents = 'auto';
      dom.gutterStackH.style.height = '';
    } else {
      const showPrimary = pPrimary && pPrimary.dataset.panel === state.filter;
      const showTop = pTop && pTop.dataset.panel === state.filter;
      const showBottom = pBottom && pBottom.dataset.panel === state.filter;

      if (showPrimary) {
        dom.slotPrimary.style.flex = '100 1 0px';
        dom.slotPrimary.style.opacity = '1';
        dom.slotPrimary.style.visibility = 'visible';
        dom.slotPrimary.style.pointerEvents = 'auto';

        dom.slotStack.style.flex = '0.0001 1 0px';
        dom.slotStack.style.opacity = '0';
        dom.slotStack.style.visibility = 'hidden';
        dom.slotStack.style.pointerEvents = 'none';

        dom.gutterMainV.style.opacity = '0';
        dom.gutterMainV.style.pointerEvents = 'none';
        dom.gutterMainV.style.width = '0px';

        dom.gutterStackH.style.opacity = '0';
        dom.gutterStackH.style.pointerEvents = 'none';
        dom.gutterStackH.style.height = '0px';
      } else if (showTop) {
        dom.slotPrimary.style.flex = '0.0001 1 0px';
        dom.slotPrimary.style.opacity = '0';
        dom.slotPrimary.style.visibility = 'hidden';
        dom.slotPrimary.style.pointerEvents = 'none';

        dom.slotStack.style.flex = '100 1 0px';
        dom.slotStack.style.opacity = '1';
        dom.slotStack.style.visibility = 'visible';
        dom.slotStack.style.pointerEvents = 'auto';

        dom.slotTop.style.flex = '100 1 0px';
        dom.slotTop.style.opacity = '1';
        dom.slotTop.style.visibility = 'visible';
        dom.slotTop.style.pointerEvents = 'auto';

        dom.slotBottom.style.flex = '0.0001 1 0px';
        dom.slotBottom.style.opacity = '0';
        dom.slotBottom.style.visibility = 'hidden';
        dom.slotBottom.style.pointerEvents = 'none';

        dom.gutterMainV.style.opacity = '0';
        dom.gutterMainV.style.pointerEvents = 'none';
        dom.gutterMainV.style.width = '0px';

        dom.gutterStackH.style.opacity = '0';
        dom.gutterStackH.style.pointerEvents = 'none';
        dom.gutterStackH.style.height = '0px';
      } else if (showBottom) {
        dom.slotPrimary.style.flex = '0.0001 1 0px';
        dom.slotPrimary.style.opacity = '0';
        dom.slotPrimary.style.visibility = 'hidden';
        dom.slotPrimary.style.pointerEvents = 'none';

        dom.slotStack.style.flex = '100 1 0px';
        dom.slotStack.style.opacity = '1';
        dom.slotStack.style.visibility = 'visible';
        dom.slotStack.style.pointerEvents = 'auto';

        dom.slotTop.style.flex = '0.0001 1 0px';
        dom.slotTop.style.opacity = '0';
        dom.slotTop.style.visibility = 'hidden';
        dom.slotTop.style.pointerEvents = 'none';

        dom.slotBottom.style.flex = '100 1 0px';
        dom.slotBottom.style.opacity = '1';
        dom.slotBottom.style.visibility = 'visible';
        dom.slotBottom.style.pointerEvents = 'auto';

        dom.gutterMainV.style.opacity = '0';
        dom.gutterMainV.style.pointerEvents = 'none';
        dom.gutterMainV.style.width = '0px';

        dom.gutterStackH.style.opacity = '0';
        dom.gutterStackH.style.pointerEvents = 'none';
        dom.gutterStackH.style.height = '0px';
      }
    }
  }

  function applyFilter(nextFilter, shrinkNav = false) {
    const prevFilter = state.filter;
    state.filter = nextFilter;
    renderNavPill(nextFilter, shrinkNav);

    dom.expandBtns.forEach((btn) => {
      const isExpanded = nextFilter !== 'all' && btn.dataset.expand === nextFilter;
      btn.classList.toggle('is-expanded', isExpanded);
      btn.setAttribute(
        'aria-label',
        isExpanded ? `Exit fullscreen ${btn.dataset.expand}` : `Expand ${btn.dataset.expand}`
      );
      if (btn.dataset.expand === nextFilter || btn.dataset.expand === prevFilter) {
        btn.classList.remove('is-animating');
        void btn.offsetWidth;
        btn.classList.add('is-animating');
        setTimeout(() => btn.classList.remove('is-animating'), 500);
      }
    });

    syncSlotFlexSizing();
  }

  /* ========================================================================
     CENTER GLASSMORPHIC SEARCH ENGINE (Live Filtering + Ring + Badges)
     ======================================================================== */
  function hashText(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return h >>> 0;
  }

  function matchesQuery(item, kind, q) {
    if (!q) return true;
    const hay = [
      item.title || '',
      item.description || '',
      item.content || '',
      item.url || '',
      kind,
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  }

  function getFilteredItems() {
    const q = state.searchQuery.trim().toLowerCase();
    const videos = state.videos.filter((v) => matchesQuery(v, 'video videos', q));
    const photos = state.photos.filter((p) => matchesQuery(p, 'photo photos image', q));
    const poems = state.poems.filter((pm) => matchesQuery(pm, 'poem poems text', q));
    return { videos, photos, poems, q };
  }

  function updateSearchUI() {
    const { videos, photos, poems, q } = getFilteredItems();
    const hasQuery = q.length > 0;
    dom.searchHub.classList.toggle('has-query', hasQuery);
    dom.searchClear.hidden = !hasQuery;

    const allMatches = [
      ...videos.map((v) => ({ ...v, kind: 'video' })),
      ...photos.map((p) => ({ ...p, kind: 'photo' })),
      ...poems.map((pm) => ({ ...pm, kind: 'poem' })),
    ];

    const count = allMatches.length;

    // Animated ring progress around the search icon
    const progress = !hasQuery
      ? 0
      : count === 0
        ? 0.08
        : Math.min(1, 1 - Math.pow(1 - 0.3, count));
    const offset = RING_CIRCUMFERENCE * (1 - progress);
    dom.searchRingFill.style.strokeDashoffset = `${offset.toFixed(2)}`;

    dom.searchCount.hidden = !hasQuery;
    dom.searchCount.textContent = `${count}`;

    // Stacked Badges inside the pill
    dom.searchStack.replaceChildren();
    if (hasQuery && count > 0) {
      dom.searchStack.hidden = false;
      allMatches.slice(0, 4).forEach((item, i) => {
        const wrap = document.createElement('span');
        wrap.className = 'search-badge';
        wrap.style.zIndex = String(10 - i);

        const inner = document.createElement('span');
        inner.className = 'search-badge-inner';
        const hue = hashText(item.title || item.kind) % 360;
        inner.style.background = `linear-gradient(135deg, oklch(0.72 0.15 ${hue}), oklch(0.58 0.17 ${(hue + 30) % 360}))`;

        if (item.kind === 'photo' && item.url) {
          const img = document.createElement('img');
          img.src = item.url;
          img.alt = '';
          inner.appendChild(img);
        } else {
          inner.textContent = (item.title || item.kind).charAt(0);
        }

        wrap.appendChild(inner);
        dom.searchStack.appendChild(wrap);
      });
    } else {
      dom.searchStack.hidden = true;
    }

    renderPanels();
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
      state.split.primaryPct = 54;
      state.split.stackPct = 46;
      syncSlotFlexSizing();
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
      state.split.topPct = 52;
      state.split.bottomPct = 48;
      syncSlotFlexSizing();
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
        const minW = Math.min(240 * uiScale(), total / 2);
        const nextLeft = Math.min(Math.max(startLeftW + delta, minW), total - minW);
        const nextRight = total - nextLeft;
        state.split.primaryPct = (nextLeft / total) * 100;
        state.split.stackPct = (nextRight / total) * 100;
        syncSlotFlexSizing();
      }

      if (hDrag) {
        const total = startTopH + startBotH;
        const delta = e.clientY - hStartY;
        const minH = Math.min(140 * uiScale(), total / 2);
        const nextTop = Math.min(Math.max(startTopH + delta, minH), total - minH);
        const nextBot = total - nextTop;
        state.split.topPct = (nextTop / total) * 100;
        state.split.bottomPct = (nextBot / total) * 100;
        syncSlotFlexSizing();
      }

      if (upDrag) {
        const box = document.getElementById('bento-workspace').getBoundingClientRect();
        const maxW = box.width * 0.55;
        const minW = Math.min(300 * uiScale(), maxW);
        const nextW = Math.min(Math.max(box.right - e.clientX, minW), maxW);
        document.documentElement.style.setProperty('--upload-ratio', `${nextW / box.width * 100}%`);
      }

      if (dropDrag) {
        const nextH = Math.min(Math.max(dropStartH + (e.clientY - dropStartY), 110 * uiScale()), window.innerHeight * 0.6);
        document.documentElement.style.setProperty('--drop-h', `calc(${nextH / uiScale()} * var(--ui-unit))`);
      }
    });

    function stopWorkspaceResize() {
      vDrag = hDrag = upDrag = dropDrag = false;
      [dom.gutterMainV, dom.gutterStackH, dom.gutterUpload, dom.gutterDrop]
        .forEach((gutter) => gutter.classList.remove('is-active'));
      document.body.classList.remove('is-resizing');
    }
    window.addEventListener('mouseup', stopWorkspaceResize);
    window.addEventListener('blur', stopWorkspaceResize);
    window.addEventListener('resize', stopWorkspaceResize);

    // 5. Drag-and-Drop Panel Swapping
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
          applyFilter(state.filter, false);
        }
        draggedPanel = null;
      });
    });
  }

  /* ========================================================================
     UPLOAD DOCK TOGGLE
     ======================================================================== */
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

      updateSearchUI();
    } catch (err) {
      console.error('Failed to load portfolio:', err);
    }
  }

  function createEmptyState(text = "theres nothing here") {
    const box = document.createElement('div');
    box.className = 'empty-state';

    const icon = document.createElement('div');
    icon.className = 'empty-state-icon';
    icon.innerHTML = `<svg class="empty-state-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 9v1a3 3 0 0 0 3 3h1"></path>
      <path d="M18 8v1a3 3 0 0 1-3 3h-1"></path>
      <path d="M10 21V5a2 2 0 1 1 4 0v16"></path>
      <path d="M3 21c3.5-1 7.5-1 11 0c2.5.7 4.5.7 7 0"></path>
    </svg>`;
    box.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'empty-state-label';
    label.textContent = text;
    box.appendChild(label);

    return box;
  }

  function processCategory(rawItems, kind, key) {
    const globalQ = state.searchQuery.trim().toLowerCase();
    const p = panelState[key];
    const localQ = p.search.trim().toLowerCase();

    // 1. Filter by global search query
    let list = rawItems.filter((it) => matchesQuery(it, kind, globalQ));

    // 2. Filter by local search query
    if (localQ) {
      list = list.filter((it) => {
        const hay = [it.title || '', it.description || '', it.content || '', it.url || ''].join(' ').toLowerCase();
        return hay.includes(localQ);
      });
    }

    // 3. Filter by category filter selection
    if (p.filter === 'recent') {
      list = [...list].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 5);
    } else if (p.filter === 'has_desc') {
      list = list.filter((it) => Boolean(it.description && it.description.trim()));
    } else if (p.filter === 'short') {
      list = list.filter((it) => (it.content || '').trim().split('\n').filter(Boolean).length < 6);
    } else if (p.filter === 'long') {
      list = list.filter((it) => (it.content || '').trim().split('\n').filter(Boolean).length >= 6);
    }

    // 4. Sort
    list = [...list].sort((a, b) => {
      if (p.sort === 'newest') {
        return (b.id || 0) - (a.id || 0);
      }
      if (p.sort === 'oldest') {
        return (a.id || 0) - (b.id || 0);
      }
      if (p.sort === 'az') {
        return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base', numeric: true });
      }
      if (p.sort === 'za') {
        return (b.title || '').localeCompare(a.title || '', undefined, { sensitivity: 'base', numeric: true });
      }
      return 0;
    });

    return { list, localQ, globalQ, filterVal: p.filter, sortVal: p.sort };
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

  function renderPanels() {
    const vRes = processCategory(state.videos, 'video videos', 'videos');
    const pRes = processCategory(state.photos, 'photo photos image', 'photos');
    const pmRes = processCategory(state.poems, 'poem poems text', 'poems');

    // Videos
    dom.bodyVideos.replaceChildren();
    if (vRes.list.length === 0) {
      dom.bodyVideos.appendChild(createEmptyState("theres nothing here"));
    } else {
      vRes.list.forEach((v) => {
        const fig = document.createElement('figure');
        const isHighlight = Boolean(vRes.globalQ || vRes.localQ);
        fig.className = `media-card ${isHighlight ? 'is-highlighted' : ''}`.trim();

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
    if (pRes.list.length === 0) {
      dom.bodyPhotos.appendChild(createEmptyState("theres nothing here"));
    } else {
      pRes.list.forEach((p) => {
        const fullIdx = state.photos.indexOf(p);
        const fig = document.createElement('figure');
        const isHighlight = Boolean(pRes.globalQ || pRes.localQ);
        fig.className = `media-card ${isHighlight ? 'is-highlighted' : ''}`.trim();

        const visual = document.createElement('div');
        visual.className = 'media-visual';
        visual.addEventListener('click', () => openLightbox(fullIdx !== -1 ? fullIdx : 0));

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
    if (pmRes.list.length === 0) {
      dom.bodyPoems.appendChild(createEmptyState("theres nothing here"));
    } else {
      pmRes.list.forEach((poem) => {
        const article = document.createElement('article');
        const isHighlight = Boolean(pmRes.globalQ || pmRes.localQ);
        article.className = `poem-card ${isHighlight ? 'is-highlighted' : ''}`.trim();

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
     CATEGORY PANEL TOOLS: SEARCH, FILTER & SORT
     ======================================================================== */
  function closeAllPanelPopovers() {
    document.querySelectorAll('.panel-popover').forEach((p) => {
      p.hidden = true;
    });
    document.querySelectorAll('.panel-filter-btn, .panel-sort-btn').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  function syncToolBadges(panelKey) {
    const p = panelState[panelKey];
    const searchBtn = document.querySelector(`.panel-search-btn[data-panel="${panelKey}"]`);
    const filterBtn = document.querySelector(`.panel-filter-btn[data-panel="${panelKey}"]`);
    const sortBtn = document.querySelector(`.panel-sort-btn[data-panel="${panelKey}"]`);

    if (searchBtn) searchBtn.classList.toggle('has-active', Boolean(p.search));
    if (filterBtn) filterBtn.classList.toggle('has-active', p.filter !== 'all');
    if (sortBtn) sortBtn.classList.toggle('has-active', p.sort !== 'newest');
  }

  function togglePanelSearch(panelKey, force) {
    const p = panelState[panelKey];
    const searchBar = document.getElementById(`search-bar-${panelKey}`);
    const searchInput = document.getElementById(`search-input-${panelKey}`);
    const searchBtn = document.querySelector(`.panel-search-btn[data-panel="${panelKey}"]`);

    const next = typeof force === 'boolean' ? force : !p.searchOpen;
    p.searchOpen = next;
    if (searchBar) searchBar.hidden = !next;
    if (searchBtn) searchBtn.classList.toggle('is-open', next);

    if (next) {
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    } else {
      if (p.search) {
        p.search = '';
        if (searchInput) searchInput.value = '';
        syncToolBadges(panelKey);
        renderPanels();
      }
    }
  }

  function initPanelTools() {
    // 1. Search buttons & inputs
    document.querySelectorAll('.panel-search-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllPanelPopovers();
        togglePanelSearch(btn.dataset.panel);
      });
    });

    document.querySelectorAll('.panel-search-input').forEach((input) => {
      const panelKey = input.dataset.panel;
      input.addEventListener('input', (e) => {
        panelState[panelKey].search = e.target.value.trim();
        syncToolBadges(panelKey);
        renderPanels();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          togglePanelSearch(panelKey, false);
        }
      });
    });

    document.querySelectorAll('.panel-search-clear').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePanelSearch(btn.dataset.panel, false);
      });
    });

    // 2. Filter buttons
    document.querySelectorAll('.panel-filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panelKey = btn.dataset.panel;
        const popover = document.getElementById(`filter-popover-${panelKey}`);
        const wasHidden = popover ? popover.hidden : true;
        closeAllPanelPopovers();
        if (popover && wasHidden) {
          popover.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    // 3. Sort buttons
    document.querySelectorAll('.panel-sort-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const panelKey = btn.dataset.panel;
        const popover = document.getElementById(`sort-popover-${panelKey}`);
        const wasHidden = popover ? popover.hidden : true;
        closeAllPanelPopovers();
        if (popover && wasHidden) {
          popover.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    // 4. Popover menu items (Filter & Sort)
    document.querySelectorAll('.popover-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const panelKey = item.dataset.panel;
        const type = item.dataset.type;
        const val = item.dataset.val;

        if (type === 'filter') {
          panelState[panelKey].filter = val;
          const popover = document.getElementById(`filter-popover-${panelKey}`);
          if (popover) {
            popover.querySelectorAll('.popover-item').forEach((el) => {
              el.classList.toggle('is-active', el.dataset.val === val);
            });
          }
        } else if (type === 'sort') {
          panelState[panelKey].sort = val;
          const popover = document.getElementById(`sort-popover-${panelKey}`);
          if (popover) {
            popover.querySelectorAll('.popover-item').forEach((el) => {
              el.classList.toggle('is-active', el.dataset.val === val);
            });
          }
        }

        syncToolBadges(panelKey);
        closeAllPanelPopovers();
        renderPanels();
      });
    });

    // 5. Global click outside popovers
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.panel-header-actions')) {
        closeAllPanelPopovers();
      }
    });
  }

  /* ========================================================================
     INIT
     ======================================================================== */
  function init() {
    const savedTheme = localStorage.getItem('portfolio_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    hydrateTextRolls();
    applyFilter('all', false);
    syncTokenUI();
    initWorkspaceInteractions();
    initPanelTools();

    dom.navCurrent.addEventListener('click', (e) => {
      if (e.detail !== 0 && !navHovered && e.pointerType === 'touch') {
        navLocked = false;
        navKeyboardOpen = !navKeyboardOpen;
        syncNavPresentation();
        return;
      }
      applyFilter('all', true);
    });

    // Search Pill Pop & Resize on Click/Focus
    dom.searchPill.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      dom.searchHub.classList.add('is-focused');
      dom.searchInput.focus();
    });

    dom.searchInput.addEventListener('focus', () => {
      dom.searchHub.classList.add('is-focused');
      dom.searchInput.placeholder = 'Search files, titles, poems...';
    });

    dom.searchInput.addEventListener('blur', () => {
      if (!state.searchQuery.trim()) {
        dom.searchInput.placeholder = 'Search...';
      }
    });

    dom.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      updateSearchUI();
    });

    dom.searchClear.addEventListener('click', (e) => {
      e.stopPropagation();
      state.searchQuery = '';
      dom.searchInput.value = '';
      updateSearchUI();
      dom.searchInput.focus();
    });

    // Clicking anywhere outside un-pops the search bar without blocking the click
    document.addEventListener('pointerdown', (e) => {
      if (!dom.searchHub.contains(e.target)) {
        dom.searchHub.classList.remove('is-focused');
      }
    });

    dom.themeToggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('portfolio_theme', next);
    });

    dom.expandBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.expand;
        applyFilter(state.filter === target ? 'all' : target, true);
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

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllPanelPopovers();
      if (!dom.lightbox.hidden) {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') stepLightbox(-1);
        if (e.key === 'ArrowRight') stepLightbox(1);
      } else if (dom.searchHub.classList.contains('is-focused') && e.key === 'Escape') {
        dom.searchHub.classList.remove('is-focused');
        dom.searchInput.blur();
      } else if (state.uploadOpen && e.key === 'Escape') {
        toggleUploadDock(false);
      }
    });

    fetchPortfolio();
  }

  init();
})();

