(() => {
  'use strict';

  const STAGGER = 0.035;
  const RING_CIRCUMFERENCE = 2 * Math.PI * 12.5; // ~78.54
  const NAV_ICONS = {
    all: `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    media: `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><polygon points="10 8 16 11 10 14 10 8"/><line x1="2" y1="21" x2="22" y2="21"/></svg>`,
    poems: `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="13" y2="13"/></svg>`,
  };

  const TRANSLATIONS = {
    en: {
      all: 'All',
      allHome: 'All (Home)',
      media: 'Media',
      videos: 'Videos',
      photos: 'Photos',
      poems: 'Poems',
      searchPlaceholder: 'Search...',
      searchPrompt: 'Search files, titles, poems...',
      searchAria: 'Search uploaded items',
      clearSearch: 'Clear search',
      toggleTheme: 'Toggle theme',
      uploadMediaPoems: 'Upload media & poems',
      closeUpload: 'Close upload panel',
      searchMedia: 'Search media',
      searchPoems: 'Search poems',
      filterMedia: 'Filter media',
      filterPoems: 'Filter poems',
      sortMedia: 'Sort media',
      sortPoems: 'Sort poems',
      expandMedia: 'Expand Media',
      expandPoems: 'Expand Poems',
      exitFullscreenMedia: 'Exit fullscreen Media',
      exitFullscreenPoems: 'Exit fullscreen Poems',
      filter: 'Filter',
      sortBy: 'Sort By',
      allMedia: 'All Media',
      videosOnly: 'Videos Only',
      photosOnly: 'Photos Only',
      allPoems: 'All Poems',
      recentUploads: 'Recent Uploads',
      withDescription: 'With Description',
      shortPoems: 'Short (< 6 lines)',
      longPoems: 'Long (6+ lines)',
      sortNewest: 'Newest First',
      sortOldest: 'Oldest First',
      sortAZ: 'Title (A–Z)',
      sortZA: 'Title (Z–A)',
      emptyState: 'theres nothing here',
      adminToken: 'Admin token',
      save: 'Save',
      saved: 'Saved',
      dropTitle: 'Drop or select a video or photo',
      dropHint: 'Drag bottom handle below to resize',
      title: 'Title',
      description: 'Description (optional)',
      writePoem: 'Write poem...',
      upload: 'Upload',
      uploading: 'Uploading...',
      uploaded: 'Uploaded',
      enterTokenAbove: 'Enter token above',
      selectFile: 'Select a file',
      networkError: 'Network error',
      delete: 'Delete',
      prev: 'Prev',
      next: 'Next',
      close: 'Close',
      signIn: 'Sign In',
      register: 'Register',
      logOut: 'Log Out',
      loginRequired: 'Please sign in as admin first',
      passwordsDoNotMatch: 'Passwords do not match',
      passwordTooShort: 'Password must be at least 6 characters',
      adminCreated: 'Admin account created successfully',
      loginSuccess: 'Signed in successfully',
      logoutSuccess: 'Signed out successfully',
    },
    id: {
      all: 'Semua',
      allHome: 'Semua (Beranda)',
      media: 'Media',
      videos: 'Video',
      photos: 'Foto',
      poems: 'Puisi',
      searchPlaceholder: 'Cari...',
      searchPrompt: 'Cari berkas, judul, puisi...',
      searchAria: 'Cari item yang diunggah',
      clearSearch: 'Hapus pencarian',
      toggleTheme: 'Ganti tema',
      uploadMediaPoems: 'Unggah media & puisi',
      closeUpload: 'Tutup panel unggah',
      searchMedia: 'Cari media',
      searchPoems: 'Cari puisi',
      filterMedia: 'Saring media',
      filterPoems: 'Saring puisi',
      sortMedia: 'Urutkan media',
      sortPoems: 'Urutkan puisi',
      expandMedia: 'Perbesar Media',
      expandPoems: 'Perbesar Puisi',
      exitFullscreenMedia: 'Keluar layar penuh Media',
      exitFullscreenPoems: 'Keluar layar penuh Puisi',
      filter: 'Saring',
      sortBy: 'Urutkan',
      allMedia: 'Semua Media',
      videosOnly: 'Hanya Video',
      photosOnly: 'Hanya Foto',
      allPoems: 'Semua Puisi',
      recentUploads: 'Unggahan Terbaru',
      withDescription: 'Dengan Deskripsi',
      shortPoems: 'Pendek (< 6 baris)',
      longPoems: 'Panjang (6+ baris)',
      sortNewest: 'Terbaru',
      sortOldest: 'Terlama',
      sortAZ: 'Judul (A–Z)',
      sortZA: 'Judul (Z–A)',
      emptyState: 'tidak ada apa-apa di sini',
      adminToken: 'Token admin',
      save: 'Simpan',
      saved: 'Tersimpan',
      dropTitle: 'Tarik atau pilih video atau foto',
      dropHint: 'Tarik pegangan di bawah untuk mengubah ukuran',
      title: 'Judul',
      description: 'Deskripsi (opsional)',
      writePoem: 'Tulis puisi...',
      upload: 'Unggah',
      uploading: 'Mengunggah...',
      uploaded: 'Terunggah',
      enterTokenAbove: 'Masukkan token di atas',
      selectFile: 'Pilih berkas',
      networkError: 'Kesalahan jaringan',
      delete: 'Hapus',
      prev: 'Sebelumnya',
      next: 'Selanjutnya',
      close: 'Tutup',
      signIn: 'Masuk',
      register: 'Daftar',
      logOut: 'Keluar',
      loginRequired: 'Silakan masuk sebagai admin terlebih dahulu',
      passwordsDoNotMatch: 'Kata sandi tidak cocok',
      passwordTooShort: 'Kata sandi minimal 6 karakter',
      adminCreated: 'Akun admin berhasil dibuat',
      loginSuccess: 'Berhasil masuk',
      logoutSuccess: 'Berhasil keluar',
    },
  };

  const CATEGORIES = [
    { key: 'all', label: 'All', title: 'All (Home)', icon: NAV_ICONS.all },
    { key: 'media', label: 'Media', title: 'Media', icon: NAV_ICONS.media },
    { key: 'poems', label: 'Poems', title: 'Poems', icon: NAV_ICONS.poems },
  ];

  const state = {
    media: [],
    poems: [],
    filter: 'all',
    searchQuery: '',
    uploadOpen: false,
    lightboxIndex: -1,
    token: sessionStorage.getItem('admin_token') || '',
    adminUser: null,
    hasAdmin: false,
    isAuthenticated: false,
    lang: localStorage.getItem('portfolio_lang') || 'en',
    split: {
      primaryPct: 50,
      secondaryPct: 50,
    },
  };

  function t(key) {
    const lang = state.lang || 'en';
    return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || (TRANSLATIONS.en && TRANSLATIONS.en[key]) || key;
  }

  const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

  const panelState = {
    media: { search: '', filter: 'all', sort: 'newest', searchOpen: false },
    poems: { search: '', filter: 'all', sort: 'newest', searchOpen: false },
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
    adminToggle: document.getElementById('admin-toggle'),
    authIndicator: document.getElementById('auth-indicator'),

    bentoStage: document.getElementById('bento-stage'),
    slotPrimary: document.getElementById('slot-primary'),
    slotSecondary: document.getElementById('slot-secondary'),

    gutterMainV: document.getElementById('gutter-main-v'),
    gutterUpload: document.getElementById('gutter-upload'),
    gutterDrop: document.getElementById('gutter-drop'),

    panels: document.querySelectorAll('.bento-stage .bento-panel'),
    expandBtns: document.querySelectorAll('[data-expand]'),

    bodyMedia: document.getElementById('body-media'),
    bodyPoems: document.getElementById('body-poems'),

    uploadDock: document.getElementById('upload-dock'),
    uploadClose: document.getElementById('upload-close'),
    uploadTabs: document.querySelectorAll('.upload-tab'),
    uploadAuthBanner: document.getElementById('upload-auth-banner'),
    btnBannerAuth: document.getElementById('btn-banner-auth'),

    adminModal: document.getElementById('admin-modal'),
    adminModalBackdrop: document.getElementById('admin-modal-backdrop'),
    adminModalClose: document.getElementById('admin-modal-close'),
    authCard: document.getElementById('auth-card'),
    authLoggedIn: document.getElementById('auth-logged-in'),
    authLoggedOut: document.getElementById('auth-logged-out'),
    authCurrentUser: document.getElementById('auth-current-user'),
    authLogoutBtn: document.getElementById('auth-logout-btn'),
    authAddBtn: document.getElementById('auth-add-btn'),
    authTabs: document.getElementById('auth-tabs'),
    tabAuthLogin: document.getElementById('tab-auth-login'),
    tabAuthRegister: document.getElementById('tab-auth-register'),
    tabRegisterText: document.getElementById('tab-register-text'),
    authAlert: document.getElementById('auth-alert'),
    formAuthLogin: document.getElementById('form-auth-login'),
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    btnLoginSubmit: document.getElementById('btn-login-submit'),
    formAuthRegister: document.getElementById('form-auth-register'),
    regUsername: document.getElementById('reg-username'),
    regPassword: document.getElementById('reg-password'),
    regConfirm: document.getElementById('reg-confirm'),
    regSetupKey: document.getElementById('reg-setup-key'),
    btnRegisterSubmit: document.getElementById('btn-register-submit'),
    btnRegisterText: document.getElementById('btn-register-text'),
    authRegisterNotice: document.getElementById('auth-register-notice'),
    authTokenToggle: document.getElementById('auth-token-toggle'),
    tokenPillContainer: document.getElementById('token-pill-container'),
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
    footerUploadHub: document.getElementById('footer-upload-hub'),
    footerProgressWidget: document.getElementById('footer-progress-widget'),
    footerProgressTitle: document.getElementById('footer-progress-title'),
    footerProgressPending: document.getElementById('footer-progress-pending'),
    footerProgressPercent: document.getElementById('footer-progress-percent'),
    footerProgressFill: document.getElementById('footer-progress-fill'),
    footerProgressScan: document.getElementById('footer-progress-scan'),
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

  function setTextRoll(containerIdOrElement, text, center = false) {
    const el = typeof containerIdOrElement === 'string'
      ? document.getElementById(containerIdOrElement)
      : containerIdOrElement;
    if (!el) return;
    const existingRoll = el.classList.contains('text-roll') ? el : el.querySelector('.text-roll');
    if (existingRoll) {
      const extraClass = Array.from(existingRoll.classList).filter((c) => c !== 'text-roll').join(' ');
      const newRoll = createTextRollNode(text, center, extraClass);
      existingRoll.replaceWith(newRoll);
    } else {
      const extraClass = Array.from(el.classList).filter((c) => c !== 'js-text-roll').join(' ');
      el.replaceWith(createTextRollNode(text, center, extraClass));
    }
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
    const pPrimary = dom.slotPrimary ? dom.slotPrimary.querySelector('.bento-panel') : null;
    const pSecondary = dom.slotSecondary ? dom.slotSecondary.querySelector('.bento-panel') : null;

    if (isAll) {
      if (dom.slotPrimary) {
        dom.slotPrimary.style.flex = `${state.split.primaryPct} 1 0px`;
        dom.slotPrimary.style.opacity = '1';
        dom.slotPrimary.style.visibility = 'visible';
        dom.slotPrimary.style.pointerEvents = 'auto';
      }

      if (dom.slotSecondary) {
        dom.slotSecondary.style.flex = `${state.split.secondaryPct} 1 0px`;
        dom.slotSecondary.style.opacity = '1';
        dom.slotSecondary.style.visibility = 'visible';
        dom.slotSecondary.style.pointerEvents = 'auto';
      }

      if (dom.gutterMainV) {
        dom.gutterMainV.style.opacity = '1';
        dom.gutterMainV.style.pointerEvents = 'auto';
        dom.gutterMainV.style.width = '';
      }
    } else {
      const showPrimary = pPrimary && pPrimary.dataset.panel === state.filter;
      const showSecondary = pSecondary && pSecondary.dataset.panel === state.filter;

      if (showPrimary) {
        if (dom.slotPrimary) {
          dom.slotPrimary.style.flex = '100 1 0px';
          dom.slotPrimary.style.opacity = '1';
          dom.slotPrimary.style.visibility = 'visible';
          dom.slotPrimary.style.pointerEvents = 'auto';
        }

        if (dom.slotSecondary) {
          dom.slotSecondary.style.flex = '0.0001 1 0px';
          dom.slotSecondary.style.opacity = '0';
          dom.slotSecondary.style.visibility = 'hidden';
          dom.slotSecondary.style.pointerEvents = 'none';
        }

        if (dom.gutterMainV) {
          dom.gutterMainV.style.opacity = '0';
          dom.gutterMainV.style.pointerEvents = 'none';
          dom.gutterMainV.style.width = '0px';
        }
      } else if (showSecondary) {
        if (dom.slotPrimary) {
          dom.slotPrimary.style.flex = '0.0001 1 0px';
          dom.slotPrimary.style.opacity = '0';
          dom.slotPrimary.style.visibility = 'hidden';
          dom.slotPrimary.style.pointerEvents = 'none';
        }

        if (dom.slotSecondary) {
          dom.slotSecondary.style.flex = '100 1 0px';
          dom.slotSecondary.style.opacity = '1';
          dom.slotSecondary.style.visibility = 'visible';
          dom.slotSecondary.style.pointerEvents = 'auto';
        }

        if (dom.gutterMainV) {
          dom.gutterMainV.style.opacity = '0';
          dom.gutterMainV.style.pointerEvents = 'none';
          dom.gutterMainV.style.width = '0px';
        }
      }
    }
  }

  function applyFilter(nextFilter, shrinkNav = false) {
    const prevFilter = state.filter;
    state.filter = nextFilter;
    renderNavPill(nextFilter, shrinkNav);

    const isFullscreenSwitch = prevFilter !== 'all' && nextFilter !== 'all' && prevFilter !== nextFilter;

    if (isFullscreenSwitch) {
      dom.bentoStage.classList.add('is-switching-fullscreen');
    }

    dom.expandBtns.forEach((btn) => {
      const isExpanded = nextFilter !== 'all' && btn.dataset.expand === nextFilter;
      btn.classList.toggle('is-expanded', isExpanded);
      const expandText = isExpanded
        ? (state.lang === 'id' ? `Keluar layar penuh ${t(btn.dataset.expand)}` : `Exit fullscreen ${btn.dataset.expand}`)
        : (state.lang === 'id' ? `Perbesar ${t(btn.dataset.expand)}` : `Expand ${btn.dataset.expand}`);
      btn.setAttribute('aria-label', expandText);
      if (btn.dataset.expand === nextFilter || btn.dataset.expand === prevFilter) {
        btn.classList.remove('is-animating');
        void btn.offsetWidth;
        btn.classList.add('is-animating');
        setTimeout(() => btn.classList.remove('is-animating'), 500);
      }
    });

    syncSlotFlexSizing();

    if (isFullscreenSwitch) {
      const targetPanel = document.getElementById(`panel-${nextFilter}`);
      if (targetPanel) {
        targetPanel.classList.remove('panel-crossfade');
        void targetPanel.offsetWidth;
        targetPanel.classList.add('panel-crossfade');
        setTimeout(() => targetPanel.classList.remove('panel-crossfade'), 360);
      }
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          dom.bentoStage.classList.remove('is-switching-fullscreen');
        });
      });
    }
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
    const media = state.media.filter((m) => matchesQuery(m, m.kind === 'video' ? 'video videos' : 'photo photos image', q));
    const poems = state.poems.filter((pm) => matchesQuery(pm, 'poem poems text', q));
    return { media, poems, q };
  }

  function updateSearchUI() {
    const { media, poems, q } = getFilteredItems();
    const hasQuery = q.length > 0;
    dom.searchHub.classList.toggle('has-query', hasQuery);
    dom.searchClear.hidden = !hasQuery;

    const allMatches = [
      ...media,
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
    // 1. Main Vertical Gutter (Primary Slot <-> Secondary Slot)
    let vDrag = false;
    let vStartX = 0;
    let startLeftW = 0;
    let startRightW = 0;

    if (dom.gutterMainV) {
      dom.gutterMainV.addEventListener('mousedown', (e) => {
        e.preventDefault();
        vDrag = true;
        vStartX = e.clientX;
        startLeftW = dom.slotPrimary.getBoundingClientRect().width;
        startRightW = dom.slotSecondary.getBoundingClientRect().width;
        dom.gutterMainV.classList.add('is-active');
        document.body.classList.add('is-resizing');
      });

      dom.gutterMainV.addEventListener('dblclick', () => {
        state.split.primaryPct = 50;
        state.split.secondaryPct = 50;
        syncSlotFlexSizing();
      });
    }

    // 2. Upload Dock Width Gutter
    let upDrag = false;
    if (dom.gutterUpload) {
      dom.gutterUpload.addEventListener('mousedown', (e) => {
        e.preventDefault();
        upDrag = true;
        dom.gutterUpload.classList.add('is-active');
        document.body.classList.add('is-resizing');
      });
    }

    // 3. File Dropzone Height Gutter
    let dropDrag = false;
    let dropStartY = 0;
    let dropStartH = 0;

    if (dom.gutterDrop) {
      dom.gutterDrop.addEventListener('mousedown', (e) => {
        e.preventDefault();
        dropDrag = true;
        dropStartY = e.clientY;
        dropStartH = dom.dropSurface.getBoundingClientRect().height;
        dom.gutterDrop.classList.add('is-active');
        document.body.classList.add('is-resizing');
      });
    }

    window.addEventListener('mousemove', (e) => {
      if (vDrag) {
        const total = startLeftW + startRightW;
        const delta = e.clientX - vStartX;
        const minW = Math.min(240 * uiScale(), total / 2);
        const nextLeft = Math.min(Math.max(startLeftW + delta, minW), total - minW);
        const nextRight = total - nextLeft;
        state.split.primaryPct = (nextLeft / total) * 100;
        state.split.secondaryPct = (nextRight / total) * 100;
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
      vDrag = upDrag = dropDrag = false;
      [dom.gutterMainV, dom.gutterUpload, dom.gutterDrop]
        .filter(Boolean)
        .forEach((gutter) => gutter.classList.remove('is-active'));
      document.body.classList.remove('is-resizing');
    }
    window.addEventListener('mouseup', stopWorkspaceResize);
    window.addEventListener('blur', stopWorkspaceResize);
    window.addEventListener('resize', stopWorkspaceResize);

    // 4. Drag-and-Drop Panel Swapping with Live Preview & Cancel Slide-Back
    let draggedPanel = null;
    let dragHoverTarget = null;

    const panels = document.querySelectorAll('.bento-stage .bento-panel');
    panels.forEach((panel) => {
      panel.addEventListener('dragstart', (e) => {
        if (e.target.closest('input, button, video, audio, .panel-body, .panel-toolbar, .panel-popover')) {
          e.preventDefault();
          return;
        }
        draggedPanel = panel;
        panel.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', panel.id);
      });

      panel.addEventListener('dragover', (e) => {
        if (!draggedPanel || draggedPanel === panel) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragHoverTarget !== panel) {
          if (dragHoverTarget) dragHoverTarget.classList.remove('is-swap-preview');
          dragHoverTarget = panel;
          panel.classList.add('is-swap-preview');
        }
      });

      panel.addEventListener('dragleave', (e) => {
        if (dragHoverTarget === panel && !panel.contains(e.relatedTarget)) {
          panel.classList.remove('is-swap-preview');
          dragHoverTarget = null;
        }
      });

      panel.addEventListener('dragend', () => {
        // Drag cancellation / termination: smoothly slides both panels back to home positions!
        if (draggedPanel) {
          draggedPanel.classList.remove('is-dragging');
        }
        if (dragHoverTarget) {
          dragHoverTarget.classList.remove('is-swap-preview');
          dragHoverTarget = null;
        }
        panels.forEach((p) => {
          p.classList.remove('is-swap-preview', 'is-dragging', 'is-drag-target');
        });
        draggedPanel = null;
      });

      panel.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedPanel || draggedPanel === panel) return;

        const panelA = draggedPanel;
        const panelB = panel;
        const slotA = panelA.parentElement;
        const slotB = panelB.parentElement;

        if (slotA && slotB && slotA !== slotB) {
          // Remove preview state classes prior to measuring
          panelA.classList.remove('is-dragging', 'is-swap-preview');
          panelB.classList.remove('is-dragging', 'is-swap-preview');

          // 1. First (Measure original positions)
          const rectA = panelA.getBoundingClientRect();
          const rectB = panelB.getBoundingClientRect();

          // 2. DOM Swap
          slotA.appendChild(panelB);
          slotB.appendChild(panelA);

          // 3. Last (Measure new swapped positions)
          const newRectA = panelA.getBoundingClientRect();
          const newRectB = panelB.getBoundingClientRect();

          // 4. Invert (Apply translate deltas without transition)
          const dxA = rectA.left - newRectA.left;
          const dyA = rectA.top - newRectA.top;
          const dxB = rectB.left - newRectB.left;
          const dyB = rectB.top - newRectB.top;

          panelA.style.transition = 'none';
          panelB.style.transition = 'none';
          panelA.style.transform = `translate(${dxA}px, ${dyA}px)`;
          panelB.style.transform = `translate(${dxB}px, ${dyB}px)`;

          // 5. Play (Force reflow then animate to (0,0) with physics curve)
          void panelA.offsetWidth;
          void panelB.offsetWidth;

          const slideTransition = 'transform 0.48s cubic-bezier(0.16, 1, 0.3, 1)';
          panelA.style.transition = slideTransition;
          panelB.style.transition = slideTransition;
          panelA.style.transform = 'translate(0px, 0px)';
          panelB.style.transform = 'translate(0px, 0px)';

          const cleanUp = () => {
            panelA.style.transition = '';
            panelA.style.transform = '';
            panelB.style.transition = '';
            panelB.style.transform = '';
            syncSlotFlexSizing();
          };
          setTimeout(cleanUp, 500);
        }

        draggedPanel = null;
        dragHoverTarget = null;
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
    return u.includes('/videos/') || /\.(mp4|webm|mov|m4v|ogg|m3u8)(\?|$)/i.test(u);
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

      state.media = mediaItems.map((m) => ({
        id: m.id,
        title: m.title || 'Untitled',
        description: m.description || '',
        url: resolvePath(m.relative_url || m.url || m.file_path),
        kind: isVideoItem(m) ? 'video' : 'photo',
      }));

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

  function createEmptyState(text) {
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
    label.textContent = text || t('emptyState');
    box.appendChild(label);

    return box;
  }

  function processCategory(rawItems, kind, key) {
    const globalQ = state.searchQuery.trim().toLowerCase();
    const p = panelState[key] || { search: '', filter: 'all', sort: 'newest' };
    const localQ = p.search.trim().toLowerCase();

    // 1. Filter by global search query
    let list = rawItems.filter((it) => matchesQuery(it, it.kind ? (it.kind === 'video' ? 'video videos' : 'photo photos image') : kind, globalQ));

    // 2. Filter by local search query
    if (localQ) {
      list = list.filter((it) => {
        const hay = [it.title || '', it.description || '', it.content || '', it.url || '', it.kind || ''].join(' ').toLowerCase();
        return hay.includes(localQ);
      });
    }

    // 3. Filter by category filter selection
    if (p.filter === 'videos') {
      list = list.filter((it) => it.kind === 'video');
    } else if (p.filter === 'photos') {
      list = list.filter((it) => it.kind === 'photo');
    } else if (p.filter === 'recent') {
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
      del.textContent = t('delete');
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteEntry(endpoint, item.id);
      });
      info.appendChild(del);
    }

    return info;
  }

  function renderPanels() {
    const mRes = processCategory(state.media, 'media video photo image', 'media');
    const pmRes = processCategory(state.poems, 'poem poems text', 'poems');

    // Media (Videos and Photos)
    if (dom.bodyMedia) {
      dom.bodyMedia.replaceChildren();
      if (mRes.list.length === 0) {
        dom.bodyMedia.appendChild(createEmptyState());
      } else {
        mRes.list.forEach((item) => {
          const fig = document.createElement('figure');
          const isHighlight = Boolean(mRes.globalQ || mRes.localQ);
          fig.className = `media-card ${isHighlight ? 'is-highlighted' : ''}`.trim();

          const visual = document.createElement('div');
          visual.className = 'media-visual';

          if (item.kind === 'video') {
            const video = document.createElement('video');
            video.controls = true;
            video.preload = 'metadata';
            video.playsInline = true;
            video.setAttribute('controlsList', 'nodownload');
            video.setAttribute('disablePictureInPicture', '');
            video.addEventListener('contextmenu', (e) => e.preventDefault());

            if (item.url && item.url.includes('.m3u8')) {
              if (window.Hls && Hls.isSupported()) {
                const hls = new Hls({
                  enableWorker: false,
                  capLevelToPlayerSize: true,
                });
                hls.loadSource(item.url);
                hls.attachMedia(video);
                hls.on(Hls.Events.ERROR, (event, data) => {
                  if (data.fatal) {
                    switch (data.type) {
                      case Hls.ErrorTypes.NETWORK_ERROR:
                        hls.startLoad();
                        break;
                      case Hls.ErrorTypes.MEDIA_ERROR:
                        hls.recoverMediaError();
                        break;
                      default:
                        hls.destroy();
                        video.src = item.url;
                        break;
                    }
                  }
                });
              } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = item.url;
              } else {
                video.src = item.url;
              }
            } else {
              video.src = item.url;
            }

            visual.appendChild(video);
          } else {
            // Photo
            visual.addEventListener('click', () => {
              const photoList = state.media.filter((m) => m.kind === 'photo');
              const idx = photoList.indexOf(item);
              openLightbox(idx !== -1 ? idx : 0);
            });

            const img = document.createElement('img');
            img.src = item.url;
            img.alt = item.title;
            img.loading = 'lazy';
            visual.appendChild(img);
          }

          fig.appendChild(visual);
          fig.appendChild(buildMediaInfo(item, 'media'));
          dom.bodyMedia.appendChild(fig);
        });
      }
    }

    // Poems
    if (dom.bodyPoems) {
      dom.bodyPoems.replaceChildren();
      if (pmRes.list.length === 0) {
        dom.bodyPoems.appendChild(createEmptyState());
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
            del.textContent = t('delete');
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
  }

  /* ========================================================================
     AUTHENTICATION & ADMIN SESSION MANAGEMENT
     ======================================================================== */
  function showAuthAlert(msg, type = 'error') {
    if (!dom.authAlert) return;
    dom.authAlert.textContent = msg;
    dom.authAlert.className = `auth-alert is-${type}`;
    dom.authAlert.hidden = false;
  }

  function hideAuthAlert() {
    if (!dom.authAlert) return;
    dom.authAlert.hidden = true;
    dom.authAlert.textContent = '';
  }

  function switchAuthTab(targetTab) {
    hideAuthAlert();
    const isLogin = targetTab === 'login';
    if (dom.tabAuthLogin) dom.tabAuthLogin.classList.toggle('is-active', isLogin);
    if (dom.tabAuthRegister) dom.tabAuthRegister.classList.toggle('is-active', !isLogin);
    if (dom.formAuthLogin) dom.formAuthLogin.hidden = !isLogin;
    if (dom.formAuthRegister) dom.formAuthRegister.hidden = isLogin;
  }

  async function checkAuthStatus() {
    try {
      const headers = {};
      if (state.token) {
        headers['X-Admin-Token'] = state.token;
      }
      const res = await fetch('/api/auth/status', { headers });
      if (res.ok) {
        const data = await res.json();
        state.hasAdmin = Boolean(data.has_admin);
        state.isAuthenticated = Boolean(data.authenticated);
        if (state.isAuthenticated && data.username) {
          state.adminUser = data.username;
        } else if (!state.isAuthenticated && !state.token) {
          state.adminUser = null;
        }
      }
    } catch {
      // Ignore network errors during auth check
    }
    syncAuthUI();
  }

  function syncAuthUI() {
    const isAuthed = Boolean(state.isAuthenticated || state.token);
    if (dom.authIndicator) {
      dom.authIndicator.hidden = !isAuthed;
    }
    if (dom.adminToken && state.token) {
      dom.adminToken.value = state.token;
    }
    if (dom.uploadAuthBanner) {
      dom.uploadAuthBanner.hidden = isAuthed;
    }

    if (isAuthed) {
      if (dom.authLoggedIn) dom.authLoggedIn.hidden = false;
      if (dom.authLoggedOut) dom.authLoggedOut.hidden = true;
      if (dom.authCurrentUser) {
        dom.authCurrentUser.textContent = state.adminUser || 'Admin';
      }
      hideAuthAlert();
    } else {
      if (dom.authLoggedIn) dom.authLoggedIn.hidden = true;
      if (dom.authLoggedOut) dom.authLoggedOut.hidden = false;

      if (!state.hasAdmin) {
        if (dom.tabAuthLogin) dom.tabAuthLogin.hidden = true;
        if (dom.tabRegisterText) dom.tabRegisterText.textContent = 'Create Admin';
        if (dom.authRegisterNotice) dom.authRegisterNotice.textContent = 'Enter username, password, and the server Master Key';
        if (dom.regSetupKey) {
          dom.regSetupKey.hidden = false;
          dom.regSetupKey.required = true;
        }
        switchAuthTab('register');
      } else {
        if (dom.tabAuthLogin) dom.tabAuthLogin.hidden = false;
        if (dom.tabRegisterText) dom.tabRegisterText.textContent = t('register');
        if (dom.authRegisterNotice) dom.authRegisterNotice.textContent = 'Register an additional admin (requires active admin)';
        if (dom.regSetupKey) {
          dom.regSetupKey.hidden = true;
          dom.regSetupKey.required = false;
        }
        switchAuthTab('login');
      }
    }
  }

  function openAdminModal() {
    if (!dom.adminModal) return;
    dom.adminModal.hidden = false;
    dom.adminModal.setAttribute('aria-hidden', 'false');
    if (dom.adminToggle) {
      dom.adminToggle.classList.add('is-active');
      dom.adminToggle.setAttribute('aria-expanded', 'true');
    }
    syncAuthUI();
    setTimeout(() => {
      if (dom.formAuthLogin && !dom.formAuthLogin.hidden && dom.loginUsername) {
        dom.loginUsername.focus();
      } else if (dom.formAuthRegister && !dom.formAuthRegister.hidden && dom.regUsername) {
        dom.regUsername.focus();
      }
    }, 60);
  }

  function closeAdminModal() {
    if (!dom.adminModal) return;
    dom.adminModal.hidden = true;
    dom.adminModal.setAttribute('aria-hidden', 'true');
    if (dom.adminToggle) {
      dom.adminToggle.classList.remove('is-active');
      dom.adminToggle.setAttribute('aria-expanded', 'false');
    }
    hideAuthAlert();
  }

  function toggleAdminModal() {
    if (!dom.adminModal) return;
    if (dom.adminModal.hidden) {
      openAdminModal();
    } else {
      closeAdminModal();
    }
  }

  function syncTokenUI() {
    syncAuthUI();
  }

  async function handleAuthLogin(e) {
    e.preventDefault();
    hideAuthAlert();
    const username = dom.loginUsername.value.trim();
    const password = dom.loginPassword.value;

    if (!username || !password) {
      showAuthAlert('Username and password are required', 'error');
      return;
    }

    dom.btnLoginSubmit.disabled = true;
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        state.token = data.token;
        state.isAuthenticated = true;
        state.adminUser = data.username;
        sessionStorage.setItem('admin_token', data.token);
        dom.formAuthLogin.reset();
        showAuthAlert(t('loginSuccess'), 'success');
        setTimeout(() => {
          syncAuthUI();
          renderPanels();
          closeAdminModal();
        }, 500);
      } else {
        showAuthAlert(data.message || 'Invalid username or password', 'error');
      }
    } catch {
      showAuthAlert(t('networkError'), 'error');
    } finally {
      dom.btnLoginSubmit.disabled = false;
    }
  }

  async function handleAuthRegister(e) {
    e.preventDefault();
    hideAuthAlert();
    const username = dom.regUsername.value.trim();
    const password = dom.regPassword.value;
    const confirm = dom.regConfirm.value;

    if (!username || !password) {
      showAuthAlert('All fields are required', 'error');
      return;
    }
    if (password.length < 6) {
      showAuthAlert(t('passwordTooShort'), 'error');
      return;
    }
    if (password !== confirm) {
      showAuthAlert(t('passwordsDoNotMatch'), 'error');
      return;
    }

    const payload = { username, password };
    if (!state.hasAdmin) {
      const setupKey = (dom.regSetupKey && dom.regSetupKey.value.trim()) || '';
      if (!setupKey) {
        showAuthAlert('Master Setup Key is required to verify ownership', 'error');
        return;
      }
      payload.setup_key = setupKey;
    }

    dom.btnRegisterSubmit.disabled = true;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (state.token) {
        headers['X-Admin-Token'] = state.token;
      }
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        state.token = data.token;
        state.isAuthenticated = true;
        state.adminUser = data.username;
        state.hasAdmin = true;
        sessionStorage.setItem('admin_token', data.token);
        dom.formAuthRegister.reset();
        showAuthAlert(t('adminCreated'), 'success');
        setTimeout(() => {
          syncAuthUI();
          renderPanels();
          closeAdminModal();
        }, 600);
      } else {
        showAuthAlert(data.message || 'Registration failed', 'error');
      }
    } catch {
      showAuthAlert(t('networkError'), 'error');
    } finally {
      dom.btnRegisterSubmit.disabled = false;
    }
  }

  async function handleAuthLogout() {
    try {
      const headers = {};
      if (state.token) {
        headers['X-Admin-Token'] = state.token;
      }
      await fetch('/api/auth/logout', { method: 'POST', headers });
    } catch {
      // Ignore network errors on logout
    }
    state.token = '';
    state.isAuthenticated = false;
    state.adminUser = null;
    sessionStorage.removeItem('admin_token');
    if (dom.adminToken) dom.adminToken.value = '';
    syncAuthUI();
    renderPanels();
  }

  /* ========================================================================
     UPLOAD, POEM & DELETE HANDLERS
     ======================================================================== */
  async function deleteEntry(endpoint, id) {
    const token = (dom.adminToken && dom.adminToken.value.trim()) || state.token;
    if (!token && !state.isAuthenticated) {
      showAuthAlert(t('loginRequired'), 'error');
      openAdminModal();
      return;
    }
    if (!window.confirm('Delete this item?')) return;

    const headers = {};
    if (token) {
      headers['X-Admin-Token'] = token;
    }

    const res = await fetch(`/api/${endpoint}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
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
      dom.dropTitle.textContent = t('dropTitle');
      dom.dropHint.textContent = t('dropHint');
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
      img.alt = '';
      dom.dropPreview.appendChild(img);
    }
  }

  function handleMediaUpload(e) {
    e.preventDefault();
    const token = (dom.adminToken && dom.adminToken.value.trim()) || state.token;
    const file = dom.uploadFile.files[0];

    if (!token && !state.isAuthenticated) {
      dom.uploadStatus.textContent = t('loginRequired');
      showAuthAlert(t('loginRequired'), 'error');
      openAdminModal();
      return;
    }
    if (!file) {
      dom.uploadStatus.textContent = t('selectFile');
      return;
    }

    if (token) {
      state.token = token;
      sessionStorage.setItem('admin_token', token);
    }
    syncAuthUI();

    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', dom.uploadTitle.value.trim());
    fd.append('description', dom.uploadDesc.value.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    if (token) {
      xhr.setRequestHeader('X-Admin-Token', token);
    }

    dom.uploadSubmit.disabled = true;
    dom.uploadMeter.hidden = false;
    dom.uploadMeterFill.style.width = '0%';
    dom.uploadStatus.textContent = '0%';

    // Pop up the footer loading bar for this upload!
    showFooterProgress(file, null, 'Sizing');

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.round((ev.loaded / ev.total) * 100);
        dom.uploadMeterFill.style.width = `${pct}%`;
        dom.uploadStatus.textContent = `${pct}%`;
        updateFooterProgress(pct, 'Working');
      }
    };

    xhr.onload = async () => {
      dom.uploadSubmit.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        dom.uploadForm.reset();
        updateDropPreview();
        dom.uploadStatus.textContent = t('uploaded');
        completeFooterProgress('Upload complete');
        setTimeout(() => {
          dom.uploadMeter.hidden = true;
        }, 600);
        await fetchPortfolio();
      } else {
        dom.uploadStatus.textContent = `Error ${xhr.status}`;
        completeFooterProgress(`Error ${xhr.status}`);
      }
    };

    xhr.onerror = () => {
      dom.uploadSubmit.disabled = false;
      dom.uploadStatus.textContent = t('networkError');
      completeFooterProgress(t('networkError'));
    };

    xhr.send(fd);
  }

  async function handlePoemUpload(e) {
    e.preventDefault();
    const token = (dom.adminToken && dom.adminToken.value.trim()) || state.token;
    if (!token && !state.isAuthenticated) {
      dom.poemStatus.textContent = t('loginRequired');
      showAuthAlert(t('loginRequired'), 'error');
      openAdminModal();
      return;
    }

    if (token) {
      state.token = token;
      sessionStorage.setItem('admin_token', token);
    }
    syncAuthUI();

    dom.poemSubmit.disabled = true;
    dom.poemStatus.textContent = t('uploading');

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers['X-Admin-Token'] = token;
      }
      const res = await fetch('/api/poems', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: dom.poemTitle.value.trim(),
          content: dom.poemContent.value.trim(),
        }),
      });

      if (!res.ok) throw new Error(res.status);
      dom.poemForm.reset();
      dom.poemStatus.textContent = t('uploaded');
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

  function getPhotosList() {
    return state.media.filter((m) => m.kind === 'photo');
  }

  function stepLightbox(delta) {
    const list = getPhotosList();
    const len = list.length;
    if (!len) return;
    state.lightboxIndex = (state.lightboxIndex + delta + len) % len;
    updateLightbox();
  }

  function updateLightbox() {
    const list = getPhotosList();
    const item = list[state.lightboxIndex];
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
    const hub = document.getElementById(`panel-search-hub-${panelKey}`);
    const filterBtn = document.querySelector(`.panel-filter-btn[data-panel="${panelKey}"]`);
    const sortBtn = document.querySelector(`.panel-sort-btn[data-panel="${panelKey}"]`);

    if (hub) hub.classList.toggle('has-query', Boolean(p.search));
    if (filterBtn) filterBtn.classList.toggle('has-active', p.filter !== 'all');
    if (sortBtn) sortBtn.classList.toggle('has-active', p.sort !== 'newest');
  }

  function clearPanelSearch(panelKey) {
    const p = panelState[panelKey];
    const hub = document.getElementById(`panel-search-hub-${panelKey}`);
    const input = document.getElementById(`search-input-${panelKey}`);
    const clearBtn = document.getElementById(`search-clear-${panelKey}`);

    p.search = '';
    if (input) {
      input.value = '';
      input.focus();
    }
    if (clearBtn) clearBtn.hidden = true;
    if (hub) hub.classList.remove('has-query');

    syncToolBadges(panelKey);
    renderPanels();
  }

  function initPanelTools() {
    // 1. Search buttons & inputs (Pop-up & scale-up search pill)
    document.querySelectorAll('.panel-search-icon-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllPanelPopovers();
        const panelKey = btn.dataset.panel;
        const hub = document.getElementById(`panel-search-hub-${panelKey}`);
        const input = document.getElementById(`search-input-${panelKey}`);
        const isFocused = hub && hub.classList.contains('is-focused');

        if (isFocused && document.activeElement === input) {
          if (!input.value.trim()) {
            hub.classList.remove('is-focused');
            input.blur();
          }
        } else {
          if (hub) hub.classList.add('is-focused');
          if (input) {
            input.focus();
            input.select();
          }
        }
      });
    });

    document.querySelectorAll('.panel-search-input').forEach((input) => {
      const panelKey = input.dataset.panel;
      const hub = document.getElementById(`panel-search-hub-${panelKey}`);
      const clearBtn = document.getElementById(`search-clear-${panelKey}`);

      input.addEventListener('focus', () => {
        closeAllPanelPopovers();
        if (hub) hub.classList.add('is-focused');
      });

      input.addEventListener('blur', () => {
        if (!input.value.trim() && hub) {
          hub.classList.remove('is-focused');
        }
      });

      input.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        panelState[panelKey].search = val;
        if (hub) hub.classList.toggle('has-query', Boolean(val));
        if (clearBtn) clearBtn.hidden = !val;
        syncToolBadges(panelKey);
        renderPanels();
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          clearPanelSearch(panelKey);
          if (hub) hub.classList.remove('is-focused');
          input.blur();
        }
      });
    });

    document.querySelectorAll('.panel-search-clear').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        clearPanelSearch(btn.dataset.panel);
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

    // 5. Global click outside popovers & unfocus panel search pills
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.panel-header-actions')) {
        closeAllPanelPopovers();
      }
      ['media', 'poems'].forEach((key) => {
        const hub = document.getElementById(`panel-search-hub-${key}`);
        if (hub && !hub.contains(e.target)) {
          hub.classList.remove('is-focused');
        }
      });
    });
  }

  function updatePopoversText() {
    document.querySelectorAll('.panel-popover').forEach((pop) => {
      const header = pop.querySelector('.popover-header');
      if (header) {
        header.textContent = pop.classList.contains('filter-popover') ? t('filter') : t('sortBy');
      }
    });

    document.querySelectorAll('.filter-popover .popover-item').forEach((item) => {
      const panelKey = item.dataset.panel;
      const val = item.dataset.val;
      const label = item.querySelector('span:not(.popover-check)');
      if (!label) return;

      if (val === 'all') {
        label.textContent = t(`all${capitalize(panelKey)}`);
      } else if (val === 'videos') {
        label.textContent = t('videosOnly');
      } else if (val === 'photos') {
        label.textContent = t('photosOnly');
      } else if (val === 'recent') {
        label.textContent = t('recentUploads');
      } else if (val === 'has_desc') {
        label.textContent = t('withDescription');
      } else if (val === 'short') {
        label.textContent = t('shortPoems');
      } else if (val === 'long') {
        label.textContent = t('longPoems');
      }
    });

    document.querySelectorAll('.sort-popover .popover-item').forEach((item) => {
      const val = item.dataset.val;
      const label = item.querySelector('span:not(.popover-check)');
      if (!label) return;

      if (val === 'newest') label.textContent = t('sortNewest');
      else if (val === 'oldest') label.textContent = t('sortOldest');
      else if (val === 'az') label.textContent = t('sortAZ');
      else if (val === 'za') label.textContent = t('sortZA');
    });
  }

  function applyLanguage(lang) {
    const activeLang = lang === 'id' ? 'id' : 'en';
    state.lang = activeLang;
    localStorage.setItem('portfolio_lang', activeLang);
    document.documentElement.setAttribute('lang', activeLang);

    // 1. Translatable text nodes
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.dataset.i18n;
      const translated = t(key);
      if (el.classList.contains('text-roll') || el.querySelector('.text-roll') || el.classList.contains('js-text-roll')) {
        setTextRoll(el, translated, el.dataset.center === 'true');
      } else {
        el.textContent = translated;
      }
    });

    // 2. Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.dataset.i18nPlaceholder);
    });

    // 3. Titles & Aria labels
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.dataset.i18nAria));
    });

    // 4. Update category drawer titles & re-render nav pill
    CATEGORIES.forEach((cat) => {
      cat.label = t(cat.key);
      cat.title = cat.key === 'all' ? t('allHome') : t(cat.key);
    });
    renderNavPill(state.filter, false);

    // 5. Update universal search placeholder
    if (dom.searchInput) {
      dom.searchInput.placeholder = dom.searchHub.classList.contains('is-focused')
        ? t('searchPrompt')
        : t('searchPlaceholder');
    }

    // 6. Update panel tools tooltips & aria labels
    ['media', 'poems'].forEach((key) => {
      const searchBtn = document.querySelector(`.panel-search-icon-btn[data-panel="${key}"]`);
      const searchInput = document.getElementById(`search-input-${key}`);
      const clearBtn = document.getElementById(`search-clear-${key}`);
      const filterBtn = document.querySelector(`.panel-filter-btn[data-panel="${key}"]`);
      const sortBtn = document.querySelector(`.panel-sort-btn[data-panel="${key}"]`);
      const expandBtn = document.querySelector(`.panel-expand-btn[data-expand="${key}"]`);

      if (searchBtn) {
        searchBtn.title = t(`search${capitalize(key)}`);
        searchBtn.setAttribute('aria-label', t(`search${capitalize(key)}`));
      }
      if (searchInput) {
        searchInput.placeholder = t('searchPlaceholder');
        searchInput.setAttribute('aria-label', t(`search${capitalize(key)}`));
      }
      if (clearBtn) {
        clearBtn.title = t('clearSearch');
        clearBtn.setAttribute('aria-label', t('clearSearch'));
      }
      if (filterBtn) {
        filterBtn.title = t(`filter${capitalize(key)}`);
        filterBtn.setAttribute('aria-label', t(`filter${capitalize(key)}`));
      }
      if (sortBtn) {
        sortBtn.title = t(`sort${capitalize(key)}`);
        sortBtn.setAttribute('aria-label', t(`sort${capitalize(key)}`));
      }
      if (expandBtn) {
        const isExp = expandBtn.classList.contains('is-expanded');
        expandBtn.setAttribute('aria-label', isExp ? (state.lang === 'id' ? `Keluar layar penuh ${t(key)}` : `Exit fullscreen ${key}`) : (state.lang === 'id' ? `Perbesar ${t(key)}` : `Expand ${key}`));
      }
    });

    // 7. Re-render popovers
    updatePopoversText();

    // 8. Re-render panels (updates empty states and delete buttons)
    renderPanels();
  }

  /* ========================================================================
     CORRELATED FOOTER POPUP PROGRESS BAR (ProgressBar component)
     ======================================================================== */
  let footerHideTimer = null;

  function showFooterProgress(file, initialVal = null, pendingLabel = 'Sizing') {
    if (!dom.footerProgressWidget) return;
    if (footerHideTimer) {
      clearTimeout(footerHideTimer);
      footerHideTimer = null;
    }

    const name = typeof file === 'string' ? file : (file ? file.name : 'Uploading file');
    if (dom.footerProgressTitle) {
      dom.footerProgressTitle.textContent = name;
    }

    // Pop up the loading bar!
    dom.footerProgressWidget.classList.add('is-visible');
    dom.footerProgressWidget.setAttribute('aria-hidden', 'false');

    updateFooterProgress(initialVal, pendingLabel);
  }

  function updateFooterProgress(value, pendingLabel = 'Working') {
    if (!dom.footerProgressWidget) return;

    const isIndeterminate = value === null || value === undefined;
    const fraction = isIndeterminate ? 0 : Math.min(1, Math.max(0, value / 100));
    const percent = Math.round(fraction * 100);

    if (isIndeterminate) {
      dom.footerProgressWidget.classList.remove('is-measured');
      if (dom.footerProgressPending) dom.footerProgressPending.textContent = pendingLabel;
      if (dom.footerProgressScan) dom.footerProgressScan.style.display = 'block';
      if (dom.footerProgressFill) dom.footerProgressFill.style.transform = 'scaleX(0)';
    } else {
      dom.footerProgressWidget.classList.add('is-measured');
      if (dom.footerProgressScan) dom.footerProgressScan.style.display = 'none';
      if (dom.footerProgressFill) dom.footerProgressFill.style.transform = `scaleX(${fraction})`;
      if (dom.footerProgressPercent) dom.footerProgressPercent.textContent = `${percent}%`;
    }

    dom.footerProgressWidget.setAttribute('aria-valuenow', isIndeterminate ? '' : String(percent));
    dom.footerProgressWidget.setAttribute('aria-valuetext', isIndeterminate ? pendingLabel : `${percent}%`);
  }

  function completeFooterProgress(completeLabel = 'Upload complete') {
    if (!dom.footerProgressWidget) return;

    dom.footerProgressWidget.classList.add('is-measured');
    if (dom.footerProgressScan) dom.footerProgressScan.style.display = 'none';
    if (dom.footerProgressFill) dom.footerProgressFill.style.transform = 'scaleX(1)';
    if (dom.footerProgressPercent) dom.footerProgressPercent.textContent = '100%';
    if (dom.footerProgressPending) dom.footerProgressPending.textContent = completeLabel;

    // After 1.8s, smoothly pop down / hide
    footerHideTimer = setTimeout(() => {
      dom.footerProgressWidget.classList.remove('is-visible');
      dom.footerProgressWidget.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        dom.footerProgressWidget.classList.remove('is-measured');
        if (dom.footerProgressFill) dom.footerProgressFill.style.transform = 'scaleX(0)';
      }, 400);
    }, 1800);
  }

  function dismissFooterProgress() {
    if (!dom.footerProgressWidget) return;
    dom.footerProgressWidget.classList.remove('is-visible');
    dom.footerProgressWidget.setAttribute('aria-hidden', 'true');
  }

  /* ========================================================================
     INIT
     ======================================================================== */
  async function init() {
    const savedTheme = localStorage.getItem('portfolio_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const savedLang = localStorage.getItem('portfolio_lang') || 'en';

    hydrateTextRolls();
    applyLanguage(savedLang);
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
      dom.searchInput.placeholder = t('searchPrompt');
    });

    dom.searchInput.addEventListener('blur', () => {
      if (!state.searchQuery.trim()) {
        dom.searchInput.placeholder = t('searchPlaceholder');
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

    // --- Admin Auth Event Listeners ---
    if (dom.tabAuthLogin) {
      dom.tabAuthLogin.addEventListener('click', () => switchAuthTab('login'));
    }
    if (dom.tabAuthRegister) {
      dom.tabAuthRegister.addEventListener('click', () => switchAuthTab('register'));
    }
    if (dom.formAuthLogin) {
      dom.formAuthLogin.addEventListener('submit', handleAuthLogin);
    }
    if (dom.formAuthRegister) {
      dom.formAuthRegister.addEventListener('submit', handleAuthRegister);
    }
    if (dom.authLogoutBtn) {
      dom.authLogoutBtn.addEventListener('click', handleAuthLogout);
    }
    if (dom.authAddBtn) {
      dom.authAddBtn.addEventListener('click', () => {
        if (dom.authLoggedIn) dom.authLoggedIn.hidden = true;
        if (dom.authLoggedOut) dom.authLoggedOut.hidden = false;
        if (dom.tabRegisterText) dom.tabRegisterText.textContent = '+ Add Admin';
        switchAuthTab('register');
      });
    }
    if (dom.authTokenToggle) {
      dom.authTokenToggle.addEventListener('click', () => {
        const isClosed = dom.tokenPillContainer.hidden;
        dom.tokenPillContainer.hidden = !isClosed;
        dom.authTokenToggle.classList.toggle('is-open', isClosed);
      });
    }

    if (dom.saveToken) {
      dom.saveToken.addEventListener('click', () => {
        state.token = dom.adminToken.value.trim();
        sessionStorage.setItem('admin_token', state.token);
        syncTokenUI();
        renderPanels();
        setTextRoll(dom.saveToken, t('saved'));
        setTimeout(() => {
          setTextRoll(dom.saveToken, t('save'));
        }, 1500);
      });
    }

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

    // --- Admin Modal Event Listeners ---
    if (dom.adminToggle) {
      dom.adminToggle.addEventListener('click', () => toggleAdminModal());
    }
    if (dom.adminModalClose) {
      dom.adminModalClose.addEventListener('click', () => closeAdminModal());
    }
    if (dom.adminModalBackdrop) {
      dom.adminModalBackdrop.addEventListener('click', () => closeAdminModal());
    }
    if (dom.btnBannerAuth) {
      dom.btnBannerAuth.addEventListener('click', () => {
        toggleUploadDock(false);
        openAdminModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (dom.adminModal && !dom.adminModal.hidden && e.key === 'Escape') {
        closeAdminModal();
        return;
      }
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

    await checkAuthStatus();
    await fetchPortfolio();
  }

  init();
})();

