(() => {
  'use strict';

  const state = {
    videos: [],
    photos: [],
    poems: [],
    view: 'all',
    token: sessionStorage.getItem('admin_token') || '',
    lightboxItems: [],
    lightboxIndex: -1,
  };

  const dom = {
    navLinks: document.querySelectorAll('[data-view]'),
    themeToggle: document.getElementById('theme-toggle'),
    adminToggle: document.getElementById('admin-toggle'),
    adminPanel: document.getElementById('admin-panel'),
    adminToken: document.getElementById('admin-token'),
    saveToken: document.getElementById('save-token'),
    closeAdmin: document.getElementById('close-admin'),

    viewVideos: document.getElementById('view-videos'),
    viewPhotos: document.getElementById('view-photos'),
    viewPoems: document.getElementById('view-poems'),
    listVideos: document.getElementById('list-videos'),
    listPhotos: document.getElementById('list-photos'),
    listPoems: document.getElementById('list-poems'),

    uploadForm: document.getElementById('upload-form'),
    uploadFile: document.getElementById('upload-file'),
    uploadTitle: document.getElementById('upload-title'),
    uploadDesc: document.getElementById('upload-description'),
    uploadStatus: document.getElementById('upload-status'),
    uploadSubmit: document.getElementById('upload-submit'),

    poemForm: document.getElementById('poem-form'),
    poemTitle: document.getElementById('poem-title'),
    poemContent: document.getElementById('poem-content'),
    poemStatus: document.getElementById('poem-status'),
    poemSubmit: document.getElementById('poem-submit'),

    lightbox: document.getElementById('lightbox'),
    lightboxStage: document.getElementById('lightbox-stage'),
    lightboxCaption: document.getElementById('lightbox-caption'),
    lightboxPrev: document.getElementById('lightbox-prev'),
    lightboxNext: document.getElementById('lightbox-next'),
    lightboxClose: document.getElementById('lightbox-close'),
  };

  function extractArray(data, keys) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      for (const k of keys) {
        if (Array.isArray(data[k])) return data[k];
      }
    }
    return [];
  }

  function resolveUrl(u) {
    if (!u) return '';
    return u.startsWith('/') || u.startsWith('http') ? u : '/' + u;
  }

  function isVideo(item) {
    const t = String(item.media_type || item.type || item.file_type || item.mime_type || '').toLowerCase();
    if (t.includes('video')) return true;
    if (t.includes('image') || t.includes('photo')) return false;
    const u = String(item.relative_url || item.url || item.filename || '').toLowerCase();
    return u.includes('/videos/') || /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(u);
  }

  async function fetchAll() {
    try {
      const [mRes, pRes] = await Promise.all([
        fetch('/api/media'),
        fetch('/api/poems'),
      ]);

      const mJson = mRes.ok ? await mRes.json() : [];
      const pJson = pRes.ok ? await pRes.json() : [];

      const media = extractArray(mJson, ['media', 'items', 'data']);
      const poems = extractArray(pJson, ['poems', 'items', 'data']);

      state.videos = [];
      state.photos = [];

      media.forEach((m) => {
        const entry = {
          id: m.id,
          title: m.title || '',
          description: m.description || '',
          url: resolveUrl(m.relative_url || m.url || m.file_path),
          kind: isVideo(m) ? 'video' : 'photo',
        };
        if (entry.kind === 'video') state.videos.push(entry);
        else state.photos.push(entry);
      });

      state.poems = poems.map((p) => ({
        id: p.id,
        title: p.title || '',
        content: p.content || p.body || p.text || p.poem || '',
      }));

      render();
    } catch (err) {
      console.error(err);
    }
  }

  function buildCaption(item, endpoint) {
    const cap = document.createElement('figcaption');
    cap.className = 'caption';

    const left = document.createElement('div');
    const title = document.createElement('span');
    title.className = 'caption-text';
    title.textContent = item.title;
    left.appendChild(title);

    if (item.description) {
      const desc = document.createElement('span');
      desc.className = 'caption-desc';
      desc.textContent = item.description;
      left.appendChild(desc);
    }
    cap.appendChild(left);

    if (state.token && item.id !== undefined) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'delete-btn';
      del.textContent = 'delete';
      del.addEventListener('click', () => removeItem(endpoint, item.id));
      cap.appendChild(del);
    }

    return cap;
  }

  function render() {
    const v = state.view;
    dom.viewVideos.hidden = (v !== 'all' && v !== 'videos') || state.videos.length === 0;
    dom.viewPhotos.hidden = (v !== 'all' && v !== 'photos') || state.photos.length === 0;
    dom.viewPoems.hidden = (v !== 'all' && v !== 'poems') || state.poems.length === 0;

    // Videos
    dom.listVideos.replaceChildren();
    state.videos.forEach((item, idx) => {
      const fig = document.createElement('figure');
      fig.className = 'figure';

      const vid = document.createElement('video');
      vid.className = 'figure-media';
      vid.src = item.url;
      vid.controls = true;
      vid.preload = 'metadata';
      vid.playsInline = true;

      fig.appendChild(vid);
      fig.appendChild(buildCaption(item, 'media'));
      dom.listVideos.appendChild(fig);
    });

    // Photos
    dom.listPhotos.replaceChildren();
    state.photos.forEach((item, idx) => {
      const fig = document.createElement('figure');
      fig.className = 'figure';

      const img = document.createElement('img');
      img.className = 'figure-media';
      img.src = item.url;
      img.alt = item.title;
      img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(state.photos, idx));

      fig.appendChild(img);
      fig.appendChild(buildCaption(item, 'media'));
      dom.listPhotos.appendChild(fig);
    });

    // Poems
    dom.listPoems.replaceChildren();
    state.poems.forEach((poem) => {
      const article = document.createElement('article');
      article.className = 'poem-entry';

      const head = document.createElement('div');
      head.className = 'poem-head';

      const title = document.createElement('h2');
      title.className = 'poem-title';
      title.textContent = poem.title;
      head.appendChild(title);

      if (state.token && poem.id !== undefined) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'delete-btn';
        del.textContent = 'delete';
        del.addEventListener('click', () => removeItem('poems', poem.id));
        head.appendChild(del);
      }

      const body = document.createElement('div');
      body.className = 'poem-text';
      body.textContent = poem.content;

      article.appendChild(head);
      article.appendChild(body);
      dom.listPoems.appendChild(article);
    });
  }

  // Lightbox
  function openLightbox(items, index) {
    state.lightboxItems = items;
    state.lightboxIndex = index;
    renderLightbox();
    dom.lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    dom.lightboxStage.replaceChildren();
    dom.lightbox.hidden = true;
    document.body.style.overflow = '';
  }

  function stepLightbox(dir) {
    const len = state.lightboxItems.length;
    if (!len) return;
    state.lightboxIndex = (state.lightboxIndex + dir + len) % len;
    renderLightbox();
  }

  function renderLightbox() {
    const item = state.lightboxItems[state.lightboxIndex];
    if (!item) return;

    dom.lightboxStage.replaceChildren();
    dom.lightboxCaption.textContent = [item.title, item.description].filter(Boolean).join(' — ');

    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.title;
    dom.lightboxStage.appendChild(img);
  }

  // Delete
  async function removeItem(endpoint, id) {
    if (!state.token) return;
    if (!window.confirm('Delete this item?')) return;

    const res = await fetch(`/api/${endpoint}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Token': state.token },
    });

    if (res.ok) {
      fetchAll();
    } else {
      alert(`Delete failed (${res.status})`);
    }
  }

  // Upload Media
  function handleUpload(e) {
    e.preventDefault();
    const token = dom.adminToken.value.trim() || state.token;
    const file = dom.uploadFile.files[0];
    if (!token || !file) {
      dom.uploadStatus.textContent = 'token and file required';
      return;
    }

    state.token = token;
    sessionStorage.setItem('admin_token', token);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', dom.uploadTitle.value.trim());
    fd.append('description', dom.uploadDesc.value.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);
    xhr.setRequestHeader('X-Admin-Token', token);

    dom.uploadSubmit.disabled = true;
    dom.uploadStatus.textContent = '0%';

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        dom.uploadStatus.textContent = `${Math.round((ev.loaded / ev.total) * 100)}%`;
      }
    };

    xhr.onload = () => {
      dom.uploadSubmit.disabled = false;
      if (xhr.status >= 200 && xhr.status < 300) {
        dom.uploadForm.reset();
        dom.uploadStatus.textContent = 'uploaded';
        fetchAll();
      } else {
        dom.uploadStatus.textContent = `error ${xhr.status}`;
      }
    };

    xhr.onerror = () => {
      dom.uploadSubmit.disabled = false;
      dom.uploadStatus.textContent = 'network error';
    };

    xhr.send(fd);
  }

  // Publish Poem
  async function handlePoem(e) {
    e.preventDefault();
    const token = dom.adminToken.value.trim() || state.token;
    if (!token) {
      dom.poemStatus.textContent = 'token required';
      return;
    }

    state.token = token;
    sessionStorage.setItem('admin_token', token);
    dom.poemSubmit.disabled = true;
    dom.poemStatus.textContent = 'saving...';

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
      dom.poemStatus.textContent = 'published';
      fetchAll();
    } catch (err) {
      dom.poemStatus.textContent = `error ${err.message}`;
    } finally {
      dom.poemSubmit.disabled = false;
    }
  }

  // Init
  function init() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    dom.themeToggle.textContent = savedTheme === 'dark' ? 'light' : 'dark';
    dom.adminToken.value = state.token;

    dom.navLinks.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.view = btn.dataset.view;
        dom.navLinks.forEach((b) => b.classList.toggle('is-active', b === btn));
        render();
      });
    });

    dom.themeToggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      dom.themeToggle.textContent = next === 'dark' ? 'light' : 'dark';
    });

    dom.adminToggle.addEventListener('click', () => {
      dom.adminPanel.hidden = !dom.adminPanel.hidden;
    });

    dom.closeAdmin.addEventListener('click', () => {
      dom.adminPanel.hidden = true;
    });

    dom.saveToken.addEventListener('click', () => {
      state.token = dom.adminToken.value.trim();
      sessionStorage.setItem('admin_token', state.token);
      render();
    });

    dom.uploadForm.addEventListener('submit', handleUpload);
    dom.poemForm.addEventListener('submit', handlePoem);

    dom.lightboxClose.addEventListener('click', closeLightbox);
    dom.lightboxPrev.addEventListener('click', () => stepLightbox(-1));
    dom.lightboxNext.addEventListener('click', () => stepLightbox(1));
    dom.lightboxStage.addEventListener('click', (e) => {
      if (e.target === dom.lightboxStage) closeLightbox();
    });

    document.addEventListener('keydown', (e) => {
      if (dom.lightbox.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
    });

    fetchAll();
  }

  init();
})();
