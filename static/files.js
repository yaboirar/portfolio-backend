(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  function applyTheme(value) {
    const theme = value === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    $('appearance-label').textContent = theme === 'dark' ? 'Dark' : 'Light';
    $('appearance-toggle').checked = theme === 'dark';
    try { localStorage.setItem('files-theme', theme); } catch {}
  }
  let savedTheme = 'dark';
  try { savedTheme = localStorage.getItem('files-theme') || 'dark'; } catch {}
  applyTheme(savedTheme);
  $('appearance-toggle').addEventListener('change', event => applyTheme(event.target.checked ? 'dark' : 'light'));
  function applyMotion(value) {
    const motion = value === 'reduced' ? 'reduced' : 'full';
    document.documentElement.dataset.motion = motion;
    $('motion-label').textContent = motion === 'full' ? 'On' : 'Off';
    $('motion-toggle').checked = motion === 'full';
    try { localStorage.setItem('files-motion', motion); } catch {}
  }
  let savedMotion = 'full';
  try { savedMotion = localStorage.getItem('files-motion') || 'full'; } catch {}
  applyMotion(savedMotion);
  $('motion-toggle').addEventListener('change', event => applyMotion(event.target.checked ? 'full' : 'reduced'));
  let listAnimation;
  const state = { items: [], folders: [], currentFolderId: null, filter: 'all', query: '', sort: 'newest', selected: null, uploading: false, autoTitle: '', selection: new Set(), visible: [], anchor: null, view: 'list', density: 'normal', filters: {type:'all',date:'all',size:'all'} };
  const labels = { all: 'All files', folder: 'Folders', video: 'Videos', image: 'Images', poem: 'Poems' };
  const typeNames = { folder: 'Folder', video: 'Video', image: 'Image', poem: 'Poem' };
  const kind = item => item.media_type || 'poem';
  const bytes = item => item.original_size ?? item.file_size ?? 0;
  const size = value => !value ? '—' : value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KB` : value < 1024 ** 3 ? `${(value / 1024 ** 2).toFixed(1)} MB` : `${(value / 1024 ** 3).toFixed(2)} GB`;
  const node = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const date = value => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };

  function mediaURL(item) {
    if (kind(item) === 'folder') return '';
    const value = item.original_url || item.relative_url;
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin || !url.pathname.startsWith('/uploads/') || url.pathname.endsWith('.m3u8')) throw new Error('Original file unavailable.');
    return url.href;
  }

  async function api(path, options) {
    const response = await window.adminAuth.apiFetch(path, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || `Request failed (${response.status}).`);
    return result;
  }

  async function load() {
    $('load-error').hidden = true;
    $('retry-load').hidden = true;
    try {
      const [media, poems, folders] = await Promise.all([api('/api/media'), api('/api/poems'), api('/api/folders')]);
      state.folders = folders.folders || [];
      if(state.currentFolderId!==null&&!state.folders.some(folder=>folder.id===state.currentFolderId))state.currentFolderId=null;
      renderFolderShortcuts();
      const folderItems = state.folders.map(f => ({
        ...f,
        id: f.id,
        name: f.name,
        title: f.name,
        media_type: 'folder',
        item_count: f.item_count || 0,
        created_at: f.created_at,
        folder_id: null
      }));
      state.items = [
        ...folderItems,
        ...media.media,
        ...poems.poems.map(item => ({ ...item, media_type: 'poem' }))
      ];
      render();
      loadStorage();
    } catch (error) {
      $('file-summary').textContent = 'Unable to load files';
      $('load-error').textContent = error.message;
      $('load-error').hidden = false;
      $('retry-load').hidden = false;
    }
  }

  const key = item => `${kind(item)}:${item.id}`;
  const iconPaths = {
    folder:'<path d="M4 4h6l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
    filter:'<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    dots:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    details:'<path d="M4 6h16M4 12h12M4 18h9"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    video:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m10 8 6 4-6 4z"/>',
    poem:'<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h5"/>'
  };
  function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`; }
  function updateSelection() {
    document.querySelectorAll('[data-item-key]').forEach(el => {
      const selected = state.selection.has(el.dataset.itemKey);
      el.classList.toggle('selected', selected);
      el.querySelector('input[type="checkbox"]').checked = selected;
    });
    const count = state.selection.size;
    $('selection-count').textContent = count ? `${count} selected` : 'Select files';
    $('clear-selection').hidden = !count;
    $('bulk-delete').hidden = !count;
    if ($('bulk-move')) $('bulk-move').hidden = !state.items.some(item=>kind(item)!=='folder'&&state.selection.has(key(item)));
    const visibleCount = state.visible.filter(item => state.selection.has(key(item))).length;
    $('select-all').checked = state.visible.length > 0 && visibleCount === state.visible.length;
    $('select-all').indeterminate = visibleCount > 0 && visibleCount < state.visible.length;
  }
  function selectItem(item, event = {}) {
    const id = key(item), index = state.visible.findIndex(value => key(value) === id);
    if (event.shiftKey && state.anchor !== null) {
      const anchor = state.visible.findIndex(value => key(value) === state.anchor);
      if (!event.ctrlKey && !event.metaKey) state.selection.clear();
      state.visible.slice(Math.min(anchor < 0 ? index : anchor,index),Math.max(anchor < 0 ? index : anchor,index)+1).forEach(value => state.selection.add(key(value)));
    } else if (event.ctrlKey || event.metaKey || event.toggle) {
      if (state.selection.has(id)) state.selection.delete(id); else state.selection.add(id);
      state.anchor = id;
    } else { state.selection.clear(); state.selection.add(id); state.anchor = id; }
    updateSelection();
  }
  function itemElement(item, grid) {
    const row = node(grid ? 'article' : 'tr', grid ? 'file-card' : 'file-row');
    row.dataset.itemKey = key(item); row.tabIndex = 0;
    connectFileDrag(row,item);
    row.setAttribute('aria-label', item.title || item.original_filename || 'Untitled');
    if(kind(item)==='folder'){row.classList.add('folder-entry');row.style.setProperty('--folder-color',folderColor(item.color));if(item.description)row.title=item.description;}
    const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.setAttribute('aria-label','Select ' + item.title);
    checkbox.addEventListener('click',event => { event.stopPropagation(); selectItem(item,{...event,ctrlKey:true,shiftKey:event.shiftKey}); });
    const selection = node(grid ? 'div' : 'td','item-select'); selection.append(checkbox);
    const name = node(grid ? 'div' : 'td','item-name');
    const symbol = node('span','file-symbol'); symbol.innerHTML = icon(kind(item));
    if(!grid&&kind(item)==='video'){symbol.classList.add('video-symbol');addThumbnail(item,symbol);}
    const text = node('span','name-text'); text.append(node('strong','',item.title || item.original_filename || 'Untitled'));
    if(kind(item)==='folder'&&item.tag)text.append(node('span','folder-tag',item.tag));
    name.append(symbol,text);
    const actions = node(grid ? 'div' : 'td','item-actions');
    const more = node('button','icon-button more-button'); more.type = 'button'; more.innerHTML = icon('dots'); more.setAttribute('aria-label','Actions for ' + item.title); more.setAttribute('aria-haspopup','menu');
    more.addEventListener('click',event => {event.stopPropagation();openFileMenu(item,more);}); actions.append(more);
    if (grid) {
      const top = node('div','card-top'); top.append(selection,actions);
      const art = node('button','card-art'); art.type='button'; art.setAttribute('aria-label','Select ' + item.title + '; double-click to preview'); art.innerHTML = icon(kind(item));
      if(kind(item)==='image'||kind(item)==='video')addThumbnail(item,art);
      if(kind(item)==='video'){const badge=node('span','video-play-badge');badge.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m9 6 9 6-9 6z"/></svg>';art.append(badge);}
      art.addEventListener('click',event=>{ if(event.ctrlKey||event.metaKey||event.shiftKey){selectItem(item,event);event.stopPropagation();} });
      art.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();preview(item);}});
      const meta = node('p','card-meta',kind(item)==='folder'?`Folder · ${item.item_count||0} ${item.item_count===1?'item':'items'}`:`${typeNames[kind(item)]||'File'} · ${size(bytes(item))}`);
      if(kind(item)==='video'){const duration=node('span','video-duration',durationText(item.duration_seconds));art.append(duration);meta.append(node('span','duration-meta',' · '+durationText(item.duration_seconds)));}
      row.append(top,art,name,meta);
    } else row.append(selection,name,node('td','type-cell',typeNames[kind(item)]||'File'),node('td','size-cell',kind(item)==='folder'?`${item.item_count||0} ${item.item_count===1?'item':'items'}`:size(bytes(item))),node('td','date-cell',date(item.created_at)),actions);
    if(kind(item)==='video'){if(!grid)row.querySelector('.type-cell').append(node('small','duration-meta',' · '+durationText(item.duration_seconds)));if(!item.duration_seconds)refreshTechnical(item);}
    row.addEventListener('click',event=>selectItem(item,event));
    row.addEventListener('dblclick',event=>{ if(!event.target.closest('.more-button,input')) preview(item); });
    row.addEventListener('keydown',event=>{ if(event.target!==row)return; if(event.key==='Enter'){event.preventDefault();preview(item);} if(event.key===' '){event.preventDefault();selectItem(item,{...event,toggle:true,shiftKey:event.shiftKey});} });
    row.addEventListener('contextmenu',event=>{event.preventDefault();openFileMenu(item,more);});
    return row;
  }

  function render() {
    const filters = state.filters;
    clearDragHighlights();
    let items = state.items;

    if (state.currentFolderId !== null) {
      items = items.filter(item => item.media_type !== 'folder' && item.folder_id === state.currentFolderId);
    } else {
      if (state.filter === 'folder' || filters.type === 'folder') {
        items = items.filter(item => item.media_type === 'folder');
      } else if (state.filter !== 'all') {
        items = items.filter(item => kind(item) === state.filter);
      } else {
        items = items.filter(item => item.media_type === 'folder' || item.folder_id === null);
      }
    }

    items = items.filter(item =>
      (filters.type === 'all' || kind(item) === filters.type) &&
      (filters.date === 'all' || Date.now() - new Date(item.created_at).getTime() <= Number(filters.date)*86400000) &&
      (filters.size === 'all' || kind(item) === 'folder' || (filters.size === 'small' && bytes(item) < 1024**2) || (filters.size === 'medium' && bytes(item) >= 1024**2 && bytes(item) <= 25*1024**2) || (filters.size === 'large' && bytes(item) > 25*1024**2)) &&
      [item.title, item.original_filename, item.description, item.tag, item.tags, item.content].filter(Boolean).join(' ').toLowerCase().includes(state.query)
    );

    items.sort(state.sort === 'name'
      ? (a, b) => (a.title || '').localeCompare(b.title || '')
      : state.sort === 'size'
        ? (a, b) => (kind(b) === 'folder' ? (b.item_count || 0) : bytes(b)) - (kind(a) === 'folder' ? (a.item_count || 0) : bytes(a))
        : (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    state.visible = items;
    state.selection = new Set([...state.selection].filter(id => items.some(item => key(item) === id)));

    const activeFolder=state.folders.find(folder=>folder.id===state.currentFolderId);
    $('folder-back').hidden=!activeFolder;
    $('list-title').textContent=activeFolder?activeFolder.name:labels[state.filter]||'All files';
    document.querySelector('.list-heading').classList.toggle('inside-folder',!!activeFolder);
    const folder=state.folders.find(value=>value.id===state.currentFolderId);
    $('folder-about').hidden=!folder||(!folder.tag&&!folder.description);
    $('folder-about').textContent=folder?[folder.tag,folder.description].filter(Boolean).join(' · '):'';
    const fileCount = items.filter(item => item.media_type !== 'folder').length;
    const folderCount = items.filter(item => item.media_type === 'folder').length;
    const totalBytes = items.reduce((sum, item) => sum + bytes(item), 0);

    let summaryText = '';
    if (state.currentFolderId !== null) {
      summaryText = `${items.length} ${items.length === 1 ? 'item' : 'items'}${totalBytes ? ' · ' + size(totalBytes) : ''}`;
    } else if (state.filter === 'folder') {
      summaryText = `${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`;
    } else if (state.filter === 'all') {
      const parts = [];
      if (folderCount) parts.push(`${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`);
      if (fileCount) parts.push(`${fileCount} ${fileCount === 1 ? 'file' : 'files'}`);
      summaryText = parts.length ? parts.join(', ') + (totalBytes ? ' · ' + size(totalBytes) : '') : '0 items';
    } else {
      summaryText = `${items.length} ${items.length === 1 ? 'item' : 'items'}${totalBytes ? ' · ' + size(totalBytes) : ''}`;
    }
    $('file-summary').textContent = summaryText;

    $('list-view').hidden = state.view !== 'list';
    $('grid-view').hidden = state.view !== 'grid';
    $('file-list').replaceChildren(...(state.view === 'list' ? items.map(item => itemElement(item, false)) : []));
    $('grid-view').replaceChildren(...(state.view === 'grid' ? items.map(item => itemElement(item, true)) : []));
    $('empty-state').hidden = items.length !== 0;

    const filtered = state.query || Object.values(filters).some(value => value !== 'all');
    $('empty-state').querySelector('h2').textContent = filtered
      ? 'No matching items'
      : state.currentFolderId !== null
        ? 'This folder is empty'
        : { all: 'No files yet', folder: 'No folders yet', video: 'No videos yet', image: 'No images yet', poem: 'No poems yet' }[state.filter] || 'No items yet';
    $('empty-state').querySelector('p').textContent = filtered
      ? 'Try another search or clear your filters.'
      : state.currentFolderId !== null
        ? 'Upload files or move items into this folder.'
        : state.filter === 'folder'
          ? 'Click “＋ New folder” to create a folder.'
          : 'Upload files or create a poem to get started.';

    const filterCount = Object.values(filters).filter(value => value !== 'all').length;
    $('filter-toggle').setAttribute('aria-label', filterCount ? `Filter files (${filterCount} active)` : 'Filter files');
    $('filter-toggle').title = filterCount ? `Filter files (${filterCount} active)` : 'Filter files';
    updateSelection();
    listAnimation?.cancel();
    if (document.documentElement.dataset.motion === 'full') {
      listAnimation = (items.length ? $(state.view === 'list' ? 'file-list' : 'grid-view') : $('empty-state')).animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 240, easing: 'ease-out' }
      );
    }
  }

  function stopPreview() {
    disposeVideoPlayer();disposeVideoPlayer=()=>{};
    $('preview-content').querySelectorAll('video').forEach(video => { video.pause(); video.removeAttribute('src'); video.load(); });
    $('preview-content').replaceChildren();
    state.selected = null;
  }

  function preview(item) {
    if (kind(item) === 'folder') {
      openFolder(item.id);
      return;
    }
    const metadataOpen=$('preview-dialog').open&&!$('metadata-panel').hidden;
    stopPreview();
    state.selected = item;
    resetZoom(); $('zoom-tools').hidden = kind(item) !== 'image';
    $('metadata-panel').hidden=!metadataOpen; $('metadata-toggle').setAttribute('aria-expanded',String(metadataOpen)); $('preview-dialog').classList.toggle('with-metadata',metadataOpen);
    $('preview-title').textContent = item.title;
    $('preview-error').hidden = true;
    const content = $('preview-content');
    $('preview-share').hidden=kind(item)==='folder';
    $('download-file').hidden = kind(item) === 'poem';
    if (kind(item) === 'poem') content.append(node('pre', '', item.content || ''));
    else {
      try {
        const url = mediaURL(item);
        const media = node(kind(item) === 'video' ? 'video' : 'img');
        if (kind(item) === 'video') { media.controls = false; media.removeAttribute('controls'); media.preload = 'metadata'; media.playsInline = true; }
        else { media.alt = item.title; media.draggable = false; media.addEventListener('dblclick',()=>setZoom(zoom.scale>1?1:2)); }
        media.addEventListener('error', () => {
          $('preview-error').textContent = media.error?.code === 2 ? 'The connection was interrupted. Reopen the preview to retry, or download the file.' : media.error?.code === 3 || media.error?.code === 4 ? 'This browser cannot play this format. Download the original to open it in another app.' : 'The preview could not load. Reopen it to retry, or download the original.';
          $('preview-error').hidden = false;
        });
        if(kind(item)==='image')media.addEventListener('load',paintZoom,{once:true});
        media.src = url;
        if(kind(item)==='video'){const player=createVideoPlayer(media);disposeVideoPlayer=player.destroy;content.append(player.element);}else content.append(media);
        media.addEventListener(kind(item)==='video'?'loadedmetadata':'load',()=>{
          if(state.selected!==item)return;
          const width=media.videoWidth||media.naturalWidth,height=media.videoHeight||media.naturalHeight;
          if(width&&height)$('preview-details').append(node('dt','','Dimensions'),node('dd','',`${width} × ${height}`));
          if(Number.isFinite(media.duration))$('preview-details').append(node('dt','','Duration'),node('dd','',`${media.duration.toFixed(2)} seconds`));
        },{once:true});
        $('download-file').href = url;
        $('download-file').download = item.original_filename || item.filename || item.title;
      } catch (error) { content.append(node('p', '', error.message)); $('download-file').hidden = true; }
    }
    const details = $('preview-details');
    details.replaceChildren();
    const fields = [['Title', item.title], ['Original filename', item.original_filename || item.filename], ['Type', item.mime_type || 'Poem'], ['Duration', item.duration_seconds?durationText(item.duration_seconds):null], ['Size', bytes(item) ? `${size(bytes(item))} (${bytes(item).toLocaleString()} bytes)` : null], ['Added', new Date(item.created_at).toLocaleString()], ['Description', item.description], ['Mood', item.mood], ['Tags', item.tags], ['File ID', String(item.id)]];
    fields.forEach(([label, value]) => { if (value) details.append(node('dt', '', label), node('dd', '', value)); });
    updatePreviewNavigation();
    if(!$('preview-dialog').open)$('preview-dialog').showModal();
  }

  $('close-preview').addEventListener('click', () => $('preview-dialog').close());
  $('preview-dialog').addEventListener('close', stopPreview);
  $('delete-file').addEventListener('click', () => requestDelete(state.selected ? [state.selected] : []));

  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    $('category-label').textContent='All files';
    state.currentFolderId = null;
    renderFolderShortcuts();
    document.querySelectorAll('[data-filter]').forEach(el => { if (el === button) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
    render();
  }));
  let searchTimer;
  $('file-search').addEventListener('input', event => { clearTimeout(searchTimer); const value = event.target.value.toLowerCase().trim(); searchTimer = setTimeout(() => { state.query = value; render(); }, 120); });
  const sortOptions = Array.from(document.querySelectorAll('[data-sort]'));
  function closeSort(restoreFocus = false) {
    $('sort-menu').hidden = true;
    $('sort-toggle').setAttribute('aria-expanded', 'false');
    if (restoreFocus) $('sort-toggle').focus();
  }
  function openSort(focus = false) {
    $('sort-menu').hidden = false;
    $('sort-toggle').setAttribute('aria-expanded', 'true');
    if (focus) sortOptions.find(option => option.dataset.sort === state.sort)?.focus();
  }
  $('sort-toggle').addEventListener('click', event => {
    if ($('sort-menu').hidden) openSort(event.detail === 0);
    else closeSort();
  });
  $('sort-toggle').addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); openSort(true); }
    if (event.key === 'Escape') closeSort(true);
  });
  sortOptions.forEach(option => option.addEventListener('click', () => {
    state.sort = option.dataset.sort;
    const sortLabel = {newest:'Newest first',name:'Name',size:'Largest first'}[state.sort];
    $('sort-current').textContent = sortLabel;
    $('sort-toggle').title = `Sort files (${sortLabel})`;
    $('sort-toggle').setAttribute('aria-label', `Sort files (${sortLabel})`);
    sortOptions.forEach(el => el.setAttribute('aria-selected', String(el === option)));
    closeSort(true);
    render();
  }));
  $('sort-menu').addEventListener('keydown', event => {
    const index = sortOptions.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSort(true); }
    else if (event.key === 'Tab') closeSort();
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? sortOptions.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + sortOptions.length) % sortOptions.length;
      sortOptions[next].focus();
    }
  });
  document.addEventListener('pointerdown', event => { if (!$('sort-control').contains(event.target)) closeSort(); });
  $('retry-load').addEventListener('click', load);
  $('open-upload').addEventListener('click', () => { if(!state.uploading) $('upload-dialog').showModal(); });
  $('close-upload').addEventListener('click', () => { if (!state.uploading) $('upload-dialog').close(); });
  $('upload-dialog').addEventListener('cancel', event => { if (state.uploading) event.preventDefault(); });
  [$('preview-dialog'), $('upload-dialog')].forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog || (dialog === $('upload-dialog') && state.uploading)) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }));
  function mode(poem) {
    if (state.uploading) return;
    $('file-upload-form').hidden = poem;
    $('poem-upload-form').hidden = !poem;
    $('mode-file').setAttribute('aria-pressed', String(!poem));
    $('mode-poem').setAttribute('aria-pressed', String(poem));
  }
  $('mode-file').addEventListener('click', () => mode(false));
  $('mode-poem').addEventListener('click', () => mode(true));
  function selection() {
    const files = $('upload-file').files;
    $('file-selection').textContent = files.length ? files.length === 1 ? files[0].name : `${files.length} files selected` : 'Choose files or drop them here';
    $('upload-title').disabled = files.length > 1;
    $('upload-title').placeholder = files.length > 1 ? 'Uses individual filenames' : 'Use filename';
    if (files.length > 1) { $('upload-title').value = ''; state.autoTitle = ''; }
    $('title-hint').hidden = files.length <= 1;
    if (files.length === 1) {
      if (!$('upload-title').value || $('upload-title').value === state.autoTitle) $('upload-title').value = files[0].name;
      state.autoTitle = files[0].name;
    } else if (!files.length) state.autoTitle = '';
  }
  $('upload-file').addEventListener('change', selection);
  $('file-drop').addEventListener('dragover', event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect='copy'; $('file-drop').classList.add('dragging'); });
  $('file-drop').addEventListener('dragleave', () => $('file-drop').classList.remove('dragging'));
  $('file-drop').addEventListener('drop', event => { event.preventDefault(); $('file-drop').classList.remove('dragging'); if (state.uploading) return; event.stopPropagation(); $('upload-file').files = event.dataTransfer.files; selection(); });
  function busy(value) {
    state.uploading = value;
    ['upload-submit', 'poem-submit', 'mode-file', 'mode-poem', 'upload-file', 'upload-description', 'poem-title', 'poem-content', 'poem-mood', 'poem-tags'].forEach(id => $(id).disabled = value);
    $('upload-title').disabled = value || $('upload-file').files.length > 1;
    $('upload-progress').hidden = false;
    $('open-upload').disabled = value;
    if(value) { clearTimeout(transferAutoCloseTimer); $('upload-status').dataset.state = ''; setTransferProgress(0); $('transfer-title').textContent='Uploading'; $('transfer-toast').hidden=false; $('dismiss-transfer').hidden=true; $('upload-dialog').close(); }
    else { $('dismiss-transfer').hidden=false; const failed=$('upload-status').dataset.state==='error'; $('transfer-title').textContent=failed?'Upload needs attention':'Upload complete'; recordNotification($('transfer-title').textContent,$('upload-status').textContent,failed?'error':'success'); transferAutoCloseTimer=setTimeout(()=>{if(!state.uploading)$('transfer-toast').hidden=true;},failed?8000:3500); }
  }
  $('file-upload-form').addEventListener('submit', event => {
    event.preventDefault();
    uploadFiles(Array.from($('upload-file').files), {folderId:state.currentFolderId,title:$('upload-title').value.trim(),description:$('upload-description').value});
  });
  $('poem-upload-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (state.uploading) return;
    busy(true);
    try {
      await api('/api/poems', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: $('poem-title').value, content: $('poem-content').value, mood: $('poem-mood').value || 'reflective', tags: $('poem-tags').value, ...(state.currentFolderId !== null ? { folder_id: state.currentFolderId } : {}) }) });
      $('poem-upload-form').reset();
      $('upload-status').textContent = 'Poem saved.'; setTransferProgress(100);
      await load();
    } catch (error) { $('upload-status').dataset.state = 'error'; $('upload-status').textContent = error.message; }
    finally { busy(false); }
  });

  
  let editingFolder = null;
  let deletingFolder = null;
  let movingItems = [];

  function openFolderDialog(folder = null) {
    editingFolder = folder;
    $('folder-dialog-title').textContent = folder ? 'Edit folder' : 'New folder';
    $('folder-name-input').value = folder ? folder.name : '';
    $('folder-tag-input').value=folder?.tag||''; $('folder-description-input').value=folder?.description||'';
    setFolderColor(folder?.color); updateFolderPreview();
    $('folder-error').hidden = true;
    $('folder-dialog').showModal();
    $('folder-name-input').focus();
  }

  function openDeleteFolderDialog(folder) {
    deletingFolder = folder;
    $('delete-folder-message').textContent = `Are you sure you want to delete folder “${folder.name}”?`;
    $('delete-folder-error').hidden = true;
    $('delete-folder-dialog').showModal();
  }

  function openMoveDialog(itemKeys) {
    movingItems = movePayload(itemKeys);
    if (!movingItems.length) return;
    const options = $('move-folder-options');
    options.replaceChildren();

    const rootLabel = node('label', 'move-option');
    const rootRadio = node('input');
    rootRadio.type = 'radio';
    rootRadio.name = 'destination-folder';
    rootRadio.value = '';
    rootRadio.checked = state.currentFolderId === null;
    rootLabel.append(rootRadio, node('span', '', 'Main library (No folder)'));
    options.append(rootLabel);

    state.folders.forEach(f => {
      const label = node('label', 'move-option');
      const radio = node('input');
      radio.type = 'radio';
      radio.name = 'destination-folder';
      radio.value = String(f.id);
      if (state.currentFolderId === f.id) radio.checked = true;
      label.append(radio, node('span', '', `${f.name} (${f.item_count || 0})`));
      options.append(label);
    });

    $('move-error').hidden = true;
    $('move-dialog-desc').textContent = `Move ${movingItems.length} selected ${movingItems.length === 1 ? 'item' : 'items'} to:`;
    $('move-dialog').showModal();
  }

  let menuItem = null, editItem = null, deleting = [];
  const zoom = {scale:1,x:0,y:0,drag:null};
  function resetZoom(){zoom.scale=1;zoom.x=0;zoom.y=0;zoom.drag=null;paintZoom();}
  function paintZoom(){
    const canvas=$('preview-content'),image=canvas.querySelector('img');
    if(image){
      const padding=getComputedStyle(canvas);
      if(image.naturalWidth&&image.naturalHeight){const fit=Math.min((canvas.clientWidth-parseFloat(padding.paddingLeft)-parseFloat(padding.paddingRight))/image.naturalWidth,(canvas.clientHeight-parseFloat(padding.paddingTop)-parseFloat(padding.paddingBottom))/image.naturalHeight);if(fit>0){image.style.width=Math.round(image.naturalWidth*fit)+'px';image.style.height=Math.round(image.naturalHeight*fit)+'px';}}
      const maxX=Math.max(0,(image.clientWidth*zoom.scale-canvas.clientWidth+parseFloat(padding.paddingLeft)+parseFloat(padding.paddingRight))/2);
      const maxY=Math.max(0,(image.clientHeight*zoom.scale-canvas.clientHeight+parseFloat(padding.paddingTop)+parseFloat(padding.paddingBottom))/2);
      zoom.x=Math.max(-maxX,Math.min(maxX,zoom.x));zoom.y=Math.max(-maxY,Math.min(maxY,zoom.y));
      image.style.transform=`translate(${zoom.x}px,${zoom.y}px) scale(${zoom.scale})`;
    }
    canvas.scrollTop=0;canvas.scrollLeft=0;
    canvas.classList.toggle('zoomed',zoom.scale>1);
    $('zoom-reset').textContent=zoom.scale===1?'Fit':Math.round(zoom.scale*100)+'%';
    $('zoom-out').disabled=zoom.scale<=1;$('zoom-in').disabled=zoom.scale>=8;
  }
  function setZoom(value){const previous=zoom.scale;zoom.scale=Math.max(1,Math.min(8,value));zoom.x*=zoom.scale/previous;zoom.y*=zoom.scale/previous;if(zoom.scale===1){zoom.x=0;zoom.y=0;}paintZoom();}
  function openFileMenu(item,button) {
    menuItem=item;
    const isFolder = kind(item) === 'folder';
    const menu=$('file-menu'),rect=button.getBoundingClientRect();
    const moveBtn = menu.querySelector('[data-action="move"]');
    if (moveBtn) moveBtn.hidden = isFolder;
    menu.querySelector('[data-action="share"]').hidden=kind(item)==='folder';
    const editBtn = menu.querySelector('[data-action="edit"]');
    if (editBtn) editBtn.textContent = 'Edit';
    menu.hidden=false;
    menu.style.left=Math.max(8,Math.min(innerWidth-184,rect.right-176))+'px';
    menu.style.top=Math.max(8,Math.min(innerHeight-menu.offsetHeight-8,rect.bottom+5))+'px';
    menu.querySelector('button').focus();
  }
  function requestDelete(items) {
    if(!items.length)return;
    deleting=items;
    $('delete-message').textContent=items.length===1?`Delete “${items[0].title}”?`:`Delete ${items.length} selected items?`;
    $('delete-dialog').querySelector('.muted').textContent=items.some(item=>kind(item)==='folder')?'Selected files are permanently deleted. Removing a folder keeps its remaining files in All files.':'This permanently removes the selected files and their metadata.';
    $('delete-error').hidden=true; $('delete-dialog').showModal();
    $('delete-dialog').querySelector('[data-close]').focus();
  }
  function openEdit(item) {
    if(kind(item)==='folder'){openFolderDialog(state.folders.find(folder=>folder.id===item.id));return;}
    editItem=item;
    $('edit-title').value=item.title||''; $('edit-description').value=item.description||'';
    $('edit-content').value=item.content||''; $('edit-mood').value=item.mood||''; $('edit-tags').value=item.tags||'';
    $('edit-poem-fields').hidden=kind(item)!=='poem'; $('edit-content').required=kind(item)==='poem';
    $('edit-description-label').hidden=kind(item)==='poem'; $('edit-error').hidden=true;
    $('edit-dialog').showModal();
  }
  function applyView(view,density) {
    state.view=view==='grid'?'grid':'list'; state.density=density==='compact'?'compact':'normal';
    document.body.dataset.view=state.view; document.body.dataset.density=state.density;
    $('view-list').setAttribute('aria-pressed',String(state.view==='list')); $('view-grid').setAttribute('aria-pressed',String(state.view==='grid'));
    $('default-density').checked=state.density==='compact';
    try { localStorage.setItem('files-view',state.view);localStorage.setItem('files-density',state.density); }catch{}
    render();
  }
  async function loadEaster() {
    $('easter-status').textContent='Connecting…'; $('easter-status').hidden=false; $('easter-account').hidden=true; $('retry-easter').disabled=true;
    try {
      const account=await api('/api/admin/easter-egg/profile');
      if(account.status!=='connected') throw new Error({invalid_key:'The service rejected the API key.',rate_limited:'Please wait before trying again.',not_configured:'No API key configured.'}[account.status]||'The service is unavailable. Try again shortly.');
      $('easter-name').textContent=account.username; $('easter-id').textContent=account.user_id;
      $('easter-count').textContent=account.favorite_count===null?'Unavailable':Number(account.favorite_count).toLocaleString();
      $('easter-account').querySelector('.profile-monogram').textContent=(account.username||'?').slice(0,1).toUpperCase();
      $('easter-account').hidden=false; $('easter-status').hidden=true;
    }catch(error){$('easter-status').textContent=error.message;}
    finally{$('retry-easter').disabled=false;}
  }
  function openEaster(push=true) {
    if(!$('auth-page').hidden)$('admin-toggle').click();
    if(push&&location.pathname!=='/MILV67/easter-egg')history.pushState({},'','/MILV67/easter-egg');
    if(!$('easter-dialog').open)$('easter-dialog').showModal(); loadEaster();
  }
  function initializeManager() {
    $('bulk-delete').innerHTML=icon('trash'); $('delete-file').innerHTML=icon('trash'); $('download-file').innerHTML=icon('download')+'<span>Download original</span>'; $('metadata-toggle').innerHTML=icon('details'); $('view-list').innerHTML=icon('list'); $('view-grid').innerHTML=icon('grid');
    $('open-preferences').innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--popup)"/><circle cx="15" cy="17" r="3" fill="var(--popup)"/></svg><span>Settings</span>';
    let savedView='list',savedDensity='normal'; try{savedView=localStorage.getItem('files-view');savedDensity=localStorage.getItem('files-density');}catch{}
    applyView(savedView,savedDensity);
    $('view-list').addEventListener('click',()=>applyView('list',state.density)); $('view-grid').addEventListener('click',()=>applyView('grid',state.density));
    $('default-density').addEventListener('change',event=>applyView(state.view,event.target.checked?'compact':'normal'));
    $('filter-toggle').addEventListener('click',()=>{const open=$('filter-panel').hidden;$('filter-panel').hidden=!open;$('filter-toggle').setAttribute('aria-expanded',String(open));});
    ['type','date','size'].forEach(name=>$('filter-'+name).addEventListener('change',event=>{state.filters[name]=event.target.value;render();}));
    $('clear-filters').addEventListener('click',()=>{['type','date','size'].forEach(name=>{state.filters[name]='all';$('filter-'+name).value='all';});render();});
    $('select-all').addEventListener('change',event=>{state.selection.clear();if(event.target.checked)state.visible.forEach(item=>state.selection.add(key(item)));updateSelection();});
    $('clear-selection').addEventListener('click',()=>{state.selection.clear();updateSelection();});
    if ($('create-folder-btn')) $('create-folder-btn').addEventListener('click', () => openFolderDialog());
    if ($('folder-form')) $('folder-form').addEventListener('submit', async event => {
      event.preventDefault();
      const name = $('folder-name-input').value.trim();
      if (!name) return;
      const button = $('folder-submit-btn');
      button.disabled = true;
      try {
        if (editingFolder) {
          await api(`/api/folders/${editingFolder.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({name,tag:$('folder-tag-input').value,description:$('folder-description-input').value,color:$('folder-color-input').value})
          });
        } else {
          await api('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({name,tag:$('folder-tag-input').value,description:$('folder-description-input').value,color:$('folder-color-input').value})
          });
        }
        recordNotification(editingFolder?'Folder updated':'Folder created',name);
        $('folder-dialog').close();
        await load();
      } catch (err) {
        $('folder-error').textContent = err.message;
        $('folder-error').hidden = false;
      } finally {
        button.disabled = false;
      }
    });

    if ($('delete-folder-form')) $('delete-folder-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!deletingFolder) return;
      const button = $('confirm-delete-folder');
      button.disabled = true;
      try {
        await api(`/api/folders/${deletingFolder.id}`, { method: 'DELETE' });
        if (state.currentFolderId === deletingFolder.id) {
          state.currentFolderId = null;
        }
        recordNotification('Folder removed',deletingFolder.name+' · Files kept in All files.');
        $('delete-folder-dialog').close();
        await load();
      } catch (err) {
        $('delete-folder-error').textContent = err.message;
        $('delete-folder-error').hidden = false;
      } finally {
        button.disabled = false;
      }
    });

    if ($('bulk-move')) $('bulk-move').addEventListener('click', () => {
      openMoveDialog(Array.from(state.selection));
    });

    if ($('move-form')) $('move-form').addEventListener('submit', async event => {
      event.preventDefault();
      const selectedRadio = $('move-form').querySelector('input[name="destination-folder"]:checked');
      const targetFolderId = selectedRadio && selectedRadio.value ? parseInt(selectedRadio.value, 10) : null;
      const button = $('confirm-move');
      button.disabled = true;
      try {
        await moveItems(movingItems,targetFolderId);
        recordNotification('Files moved',`${movingItems.length} ${movingItems.length===1?'file':'files'} moved to ${targetFolderId===null?'All files':state.folders.find(folder=>folder.id===targetFolderId)?.name||'folder'}.`);
        $('move-dialog').close();
        state.selection.clear();
        await load();
      } catch (err) {
        $('move-error').textContent = err.message;
        $('move-error').hidden = false;
      } finally {
        button.disabled = false;
      }
    });

    $('bulk-delete').addEventListener('click',()=>requestDelete(state.items.filter(item=>state.selection.has(key(item)))));
    document.addEventListener('keydown',event=>{
      if(event.target.closest('input:not([type="checkbox"]),textarea,select,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){event.preventDefault();state.selection=new Set(state.visible.map(key));updateSelection();}
      if(event.key==='Escape'){state.selection.clear();updateSelection();$('file-menu').hidden=true;}
      if(event.key==='Delete'&&state.selection.size){event.preventDefault();requestDelete(state.items.filter(item=>state.selection.has(key(item))));}
    });
    $('file-menu').addEventListener('click',event=>{
      const button=event.target.closest('[data-action]');if(!button||!menuItem)return;
      $('file-menu').hidden=true;
      ({open:()=>preview(menuItem),edit:()=>openEdit(menuItem),move:()=>openMoveDialog([key(menuItem)]),details:()=>openDetails(menuItem),share:()=>openSharing(menuItem),select:()=>selectItem(menuItem,{toggle:true}),delete:()=>kind(menuItem)==='folder'?openDeleteFolderDialog(state.folders.find(folder=>folder.id===menuItem.id)):requestDelete([menuItem])})[button.dataset.action]();
    });
    $('file-menu').addEventListener('keydown',event=>{
      const buttons=Array.from($('file-menu').querySelectorAll('button')).filter(button=>!button.hidden),index=buttons.indexOf(document.activeElement);
      if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
      if(event.key==='Escape'||event.key==='Tab')$('file-menu').hidden=true;
    });
    document.addEventListener('pointerdown',event=>{if(!$('file-menu').contains(event.target)&&!event.target.closest('.more-button'))$('file-menu').hidden=true;});
    document.addEventListener('scroll',()=>$('file-menu').hidden=true,true);
    document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>$ (button.dataset.close).close()));
    $('delete-form').addEventListener('submit',async event=>{
      event.preventDefault();const controls=Array.from($('delete-form').querySelectorAll('button'));controls.forEach(button=>button.disabled=true);
      const deletionCount=deleting.length;
      $('delete-dialog').dataset.busy='true';
      try {
        while(deleting.length){const item=deleting[0];if(kind(item)==='folder'){await api(`/api/folders/${item.id}`,{method:'DELETE'});}else{await api(`/api/${kind(item)==='poem'?'poems':'media'}/${item.id}`,{method:'DELETE'});}state.selection.delete(key(item));deleting.shift();if(state.selected&&key(state.selected)===key(item))$('preview-dialog').close();}
        $('delete-dialog').close();recordNotification('Items removed',`${deletionCount} ${deletionCount===1?'item':'items'} removed.`);
      }catch(error){$('delete-error').textContent=`${error.message} ${deleting.length} item(s) remain.`;$('delete-error').hidden=false;}
      finally{controls.forEach(button=>button.disabled=false);$('delete-dialog').dataset.busy='false';await load();}
    });
    $('delete-dialog').addEventListener('cancel',event=>{if($('delete-dialog').dataset.busy==='true')event.preventDefault();});
    $('edit-form').addEventListener('submit',async event=>{
      event.preventDefault(); const item=editItem, button=$('edit-form').querySelector('[type="submit"]'); button.disabled=true;
      try {
        const poem=kind(item)==='poem';
        const body=poem?{title:$('edit-title').value,content:$('edit-content').value,mood:$('edit-mood').value,tags:$('edit-tags').value}:{title:$('edit-title').value,description:$('edit-description').value};
        await api(`/api/${poem?'poems':'media'}/${item.id}`,{method:poem?'PUT':'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        $('edit-dialog').close();recordNotification('Details updated',body.title);await load();
      }catch(error){$('edit-error').textContent=error.message;$('edit-error').hidden=false;}finally{button.disabled=false;}
    });
    $('metadata-toggle').addEventListener('click',()=>{const open=$('metadata-panel').hidden;$('metadata-panel').hidden=!open;$('metadata-toggle').setAttribute('aria-expanded',String(open));$('preview-dialog').classList.toggle('with-metadata',open);});
    $('zoom-in').addEventListener('click',()=>setZoom(zoom.scale*1.5)); $('zoom-out').addEventListener('click',()=>setZoom(zoom.scale/1.5)); $('zoom-reset').addEventListener('click',resetZoom);
    $('preview-dialog').querySelector('.preview-stage').addEventListener('wheel',event=>{
      if(!$('preview-content').querySelector('img'))return;
      event.preventDefault();event.stopPropagation();
      if(!event.deltaY)return;
      const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?400:1);
      setZoom(zoom.scale*Math.exp(-Math.max(-200,Math.min(200,pixels))*.002));
    },{passive:false,capture:true});
    $('preview-content').addEventListener('pointerdown',event=>{if(zoom.scale<=1||event.button!==0)return;event.preventDefault();zoom.drag={id:event.pointerId,x:event.clientX,y:event.clientY,ox:zoom.x,oy:zoom.y};$('preview-content').setPointerCapture(event.pointerId);});
    $('preview-content').addEventListener('pointermove',event=>{if(!zoom.drag||event.pointerId!==zoom.drag.id)return;zoom.x=zoom.drag.ox+event.clientX-zoom.drag.x;zoom.y=zoom.drag.oy+event.clientY-zoom.drag.y;paintZoom();});
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>$('preview-content').addEventListener(name,()=>zoom.drag=null));
    new ResizeObserver(()=>{if($('preview-dialog').open)paintZoom();}).observe($('preview-content'));
    $('folder-name-input').addEventListener('input',updateFolderPreview);
    $('folder-color-input').addEventListener('input',event=>setFolderColor(event.target.value));
    document.querySelectorAll('[data-folder-color]').forEach(button=>button.addEventListener('click',()=>setFolderColor(button.dataset.folderColor)));
    $('dismiss-transfer').addEventListener('click',()=>$('transfer-toast').hidden=true);
    $('open-preferences').addEventListener('click',()=>{$('admin-toggle').click();$('preferences-dialog').showModal();});
    $('easter-egg-btn').addEventListener('click',()=>openEaster()); $('retry-easter').addEventListener('click',loadEaster);
    $('close-easter').addEventListener('click',()=>$('easter-dialog').close());
    $('easter-dialog').addEventListener('close',()=>{if(location.pathname==='/MILV67/easter-egg')history.replaceState({},'','/MILV67');});
    window.addEventListener('popstate',()=>{if(location.pathname==='/MILV67/easter-egg')openEaster(false);else if($('easter-dialog').open)$('easter-dialog').close();});
    if(location.pathname==='/MILV67/easter-egg')openEaster(false);
    const widths={}; try{Object.assign(widths,JSON.parse(localStorage.getItem('files-columns')||'{}'));}catch{}
    const saveWidths=()=>{try{localStorage.setItem('files-columns',JSON.stringify(widths));}catch{}};
    document.querySelectorAll('.column-resizer').forEach(handle=>{
      const name=handle.dataset.column,col=$('col-'+name);
      handle.setAttribute('aria-valuemin',name==='name'?'180':'80'); handle.setAttribute('aria-valuemax','1000');
      if(Number.isFinite(widths[name]))col.style.width=Math.max(name==='name'?180:80,Math.min(1000,widths[name]))+'px';
      const resize=width=>{widths[name]=Math.max(name==='name'?180:80,Math.min(1000,width));col.style.width=widths[name]+'px';handle.setAttribute('aria-valuenow',String(widths[name]));};
      handle.addEventListener('pointerdown',event=>{
        event.preventDefault();const start=event.clientX,width=handle.parentElement.getBoundingClientRect().width;handle.setPointerCapture(event.pointerId);
        const move=event=>resize(width+event.clientX-start);const stop=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',stop);saveWidths();};
        handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop,{once:true});
      });
      handle.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();resize(handle.parentElement.getBoundingClientRect().width+(event.key==='ArrowRight'?16:-16));saveWidths();}});
    });
    $('reset-columns').addEventListener('click',()=>{for(const name of ['name','type','size','added']){delete widths[name];$('col-'+name).style.width={name:'',type:'110px',size:'100px',added:'135px'}[name];}saveWidths();});
  }

  // One canonical payload for context-menu moves, bulk moves, and drag-and-drop.
  function movePayload(keys) {
    const selected=new Set(keys);
    return state.items.filter(item=>kind(item)!=='folder'&&selected.has(key(item))).map(item=>({kind:kind(item)==='poem'?'poem':'media',id:item.id}));
  }
  async function moveItems(items,folderId) {
    if(!items.length)throw new Error('Select files to move. Folders cannot be nested.');
    return api('/api/folders/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder_id:folderId,items})});
  }
  function setTransferProgress(percent) {
    const value=Math.max(0,Math.min(100,Math.round(percent)));
    $('upload-progress').value=value;
    $('transfer-percent').textContent=value+'%';
  }
  async function uploadFiles(files,options={}) {
    if(state.uploading||!files.length)return;
    const folderId=options.folderId??null;
    busy(true);
    let completed=0,uploadedBytes=0;
    const totalBytes=files.reduce((sum,file)=>sum+file.size,0)||1;
    try {
      if(files.length>1000)throw new Error('Upload up to 1000 files at a time.');
      for(const file of files){
        const extension=file.name.split('.').pop().toLowerCase(),video=['mp4','mov','webm'].includes(extension);
        if(!video&&!['jpg','jpeg','png','webp'].includes(extension))throw new Error('Unsupported file type: '+file.name);
        if(file.size>(video?500:25)*1024*1024)throw new Error(file.name+' exceeds the upload size limit.');
      }
      for(const [index,file] of files.entries()){
        const body=new FormData();body.append('file',file);body.append('title',files.length===1&&options.title?options.title:file.name);body.append('description',options.description||'');
        if(folderId!==null)body.append('folder_id',String(folderId));
        $('upload-status').textContent=`${index+1} of ${files.length} · ${file.name}`;
        const result=await window.adminAuth.uploadWithProgress('/api/upload',body,percent=>{
          setTransferProgress(Math.min(99,(uploadedBytes+file.size*percent/100)/totalBytes*100));
          if(percent===100)$('upload-status').textContent='Finishing '+file.name+'…';
        });
        if(!result.ok)throw new Error(typeof result.error==='string'?result.error:result.data?.message||'Upload failed.');
        completed++;uploadedBytes+=file.size;
      }
      setTransferProgress(100);
      $('upload-status').textContent=`${completed} ${completed===1?'file':'files'} uploaded${folderId!==null?' to '+(state.folders.find(folder=>folder.id===folderId)?.name||'folder'):''}.`;
      $('file-upload-form').reset();selection();
    }catch(error){$('upload-status').dataset.state='error';$('upload-status').textContent=`${completed?completed+' uploaded. ':''}${error.message}`;}
    finally{busy(false);await load();}
  }
  let dragSession=null,dragGhost=null,moveBusy=false,moveToastTimer;
  const internalType='application/x-milv67-files';
  function externalDrag(event){return Array.from(event.dataTransfer?.types||[]).includes('Files');}
  function activeDrag(event){return externalDrag(event)||(dragSession&&Array.from(event.dataTransfer?.types||[]).includes(internalType));}
  function clearDragHighlights(){document.querySelectorAll('.drop-target-active').forEach(el=>el.classList.remove('drop-target-active'));}
  function finishDrag(){
    document.body.classList.remove('dragging-library','dragging-external');clearDragHighlights();
    document.querySelectorAll('.is-dragging').forEach(el=>el.classList.remove('is-dragging'));dragSession=null;
    if(dragGhost){dragGhost.remove();dragGhost=null;}
  }
  function moveNotice(message,error=false){
    recordNotification(error?'Move needs attention':'Files moved',message,error?'error':'success');
    clearTimeout(moveToastTimer);$('move-toast').textContent=message;$('move-toast').dataset.state=error?'error':'success';$('move-toast').hidden=false;
    moveToastTimer=setTimeout(()=>$('move-toast').hidden=true,4500);
  }
  async function performDropMove(items,folderId,target){
    if(moveBusy)return;
    const changes=items.filter(entry=>state.items.some(item=>item.id===entry.id&&(kind(item)==='poem'?'poem':'media')===entry.kind&&item.folder_id!==folderId));
    if(!changes.length){moveNotice('Already in this location.');return;}
    moveBusy=true;target.classList.add('drop-working');
    try{
      await moveItems(changes,folderId);
      if(document.documentElement.dataset.motion==='full')target.animate([{boxShadow:'inset 0 0 0 2px #ffffffaa'},{boxShadow:'inset 0 0 0 2px #ffffff00'}],{duration:650,easing:'ease-out'});
      moveNotice(`${changes.length} ${changes.length===1?'file':'files'} moved to ${folderId===null?'All files':state.folders.find(folder=>folder.id===folderId)?.name||'folder'}.`);
      state.selection.clear();await load();
      if(document.documentElement.dataset.motion==='full')document.querySelectorAll(`[data-drop-folder="${folderId===null?'root':folderId}"]`).forEach(el=>el.animate([{boxShadow:'inset 0 0 0 2px #ffffffaa'},{boxShadow:'inset 0 0 0 2px #ffffff00'}],{duration:650,easing:'ease-out'}));
    }catch(error){moveNotice(error.message,true);}finally{moveBusy=false;target.classList.remove('drop-working');}
  }
  function connectDropTarget(target,folderId){
    target.dataset.dropFolder=folderId===null?'root':String(folderId);
    target.addEventListener('dragover',event=>{
      if(!activeDrag(event))return;
      if(externalDrag(event)&&!target.closest('.file-area')){event.preventDefault();event.dataTransfer.dropEffect='none';clearDragHighlights();document.body.classList.remove('dragging-external');return;}
      event.preventDefault();event.stopPropagation();
      event.dataTransfer.dropEffect=moveBusy||state.uploading?'none':externalDrag(event)?'copy':'move';
      clearDragHighlights();if(!moveBusy&&!state.uploading)target.classList.add('drop-target-active');
      document.body.classList.remove('dragging-external');
    });
    target.addEventListener('dragleave',event=>{if(!target.contains(event.relatedTarget))target.classList.remove('drop-target-active');});
    target.addEventListener('drop',event=>{
      if(!activeDrag(event))return;
      if(externalDrag(event)&&!target.closest('.file-area')){event.preventDefault();event.dataTransfer.dropEffect='none';clearDragHighlights();document.body.classList.remove('dragging-external');return;}
      event.preventDefault();event.stopPropagation();
      const files=Array.from(event.dataTransfer.files||[]),items=dragSession?.items||[];
      const outside=files.length&&!target.closest('.file-area');
      finishDrag();
      if(outside)return;
      if(state.uploading||moveBusy)return;
      if(files.length)uploadFiles(files,{folderId});else performDropMove(items,folderId,target);
    });
  }
  function connectFileDrag(row,item){
    if(kind(item)==='folder'){connectDropTarget(row,item.id);return;}
    row.draggable=true;
    row.addEventListener('dragstart',event=>{
      if(event.target.closest('input,.more-button')||state.uploading||moveBusy){event.preventDefault();return;}
      if(!state.selection.has(key(item)))selectItem(item);
      const items=movePayload(state.selection);if(!items.length){event.preventDefault();return;}
      dragSession={items};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData(internalType,'selected-files');
      document.body.classList.add('dragging-library');
      document.querySelectorAll('[data-item-key]').forEach(el=>{if(!el.dataset.itemKey.startsWith('folder:')&&state.selection.has(el.dataset.itemKey))el.classList.add('is-dragging');});
      dragGhost=node('div','file-drag-ghost',items.length===1?item.title:`${items.length} files`);document.body.append(dragGhost);event.dataTransfer.setDragImage(dragGhost,18,18);
    });
    row.addEventListener('dragend',finishDrag);
  }
  function renderFolderShortcuts(){
    const container=$('folder-shortcut-list');container.replaceChildren();$('folder-shortcuts').hidden=!state.folders.length;
    state.folders.forEach(folder=>{
      const button=node('button','folder-shortcut');button.type='button';button.title=folder.name;button.style.setProperty('--folder-color',folderColor(folder.color));button.innerHTML=icon('folder');button.append(node('span','',folder.name),node('small','',String(folder.item_count||0)));
      if(folder.id===state.currentFolderId)button.setAttribute('aria-current','page');
      button.addEventListener('contextmenu',event=>{event.preventDefault();openFileMenu({...folder,title:folder.name,media_type:'folder'},button);});
      button.addEventListener('click',()=>openFolder(folder.id));connectDropTarget(button,folder.id);container.append(button);
    });
  }
  function openFolder(folderId){
    state.currentFolderId=folderId;state.filter='all';state.selection.clear();state.query='';$('file-search').value='';
    state.filters={type:'all',date:'all',size:'all'};['type','date','size'].forEach(name=>$('filter-'+name).value='all');
    document.querySelectorAll('[data-filter]').forEach(button=>button.removeAttribute('aria-current'));
    renderFolderShortcuts();render();
  }
  function initializeDragDrop(){
    document.querySelectorAll('#category-toggle,.wordmark,#folder-back').forEach(target=>connectDropTarget(target,null));
    document.addEventListener('dragover',event=>{
      if(!activeDrag(event))return;
      event.preventDefault();
      const main=event.target.closest('.file-area');
      if(document.querySelector('dialog[open]')||!main){event.dataTransfer.dropEffect='none';document.body.classList.remove('dragging-external');clearDragHighlights();return;}
      if(event.target.closest('[data-drop-folder]'))return;
      const external=externalDrag(event);event.dataTransfer.dropEffect=state.uploading||moveBusy?'none':external?'copy':state.currentFolderId===null?'move':'none';
      clearDragHighlights();
      if(external&&!state.uploading&&!moveBusy){
        const rect=main.getBoundingClientRect(),left=Math.max(8,rect.left+8),top=Math.max(8,rect.top+8),right=Math.min(innerWidth-8,rect.right-8),bottom=Math.min(innerHeight-8,rect.bottom-8);
        Object.assign($('page-drop-hint').style,{left:left+'px',top:top+'px',width:Math.max(0,right-left)+'px',height:Math.max(0,bottom-top)+'px'});
        $('page-drop-label').textContent='Drop to upload'+(state.currentFolderId===null?'':` to ${state.folders.find(folder=>folder.id===state.currentFolderId)?.name||'folder'}`);
        document.body.classList.add('dragging-external');
      }
    });
    document.addEventListener('drop',event=>{
      if(!activeDrag(event))return;
      event.preventDefault();
      const files=Array.from(event.dataTransfer.files||[]),items=dragSession?.items||[],folderId=state.currentFolderId;
      const blocked=document.querySelector('dialog[open]')||!event.target.closest('.file-area');finishDrag();
      if(blocked||state.uploading||moveBusy)return;
      if(files.length)uploadFiles(files,{folderId});else if(folderId===null)performDropMove(items,null,document.querySelector('.file-area'));
    });
    document.addEventListener('dragleave',event=>{if(!event.relatedTarget)document.body.classList.remove('dragging-external');});
    document.addEventListener('dragend',finishDrag);window.addEventListener('blur',finishDrag);
  }

  function addThumbnail(item,container){
    if(!['image','video'].includes(kind(item)))return;
    const image=node('img');image.alt='';image.loading='lazy';image.decoding='async';image.draggable=false;
    const video=kind(item)==='video',url=video?`/api/media/${item.id}/thumbnail`:mediaURL(item);let attempts=0;
    image.addEventListener('load',()=>container.classList.add('thumbnail-loaded'));
    image.addEventListener('error',()=>{if(video&&attempts<6){const retry=++attempts;setTimeout(()=>{if(image.isConnected)image.src=url+'?retry='+retry;},Math.min(12000,1500*retry));}else image.remove();});
    image.src=url;container.append(image);
  }
  function folderColor(value){return /^#[0-9a-f]{6}$/i.test(value||'')?value:'#9ca3af';}
  function updateFolderPreview(){$('folder-preview-name').textContent=$('folder-name-input').value.trim()||'New folder';}
  function setFolderColor(value){const color=folderColor(value);$('folder-color-input').value=color;$('folder-dialog').style.setProperty('--folder-color',color);document.querySelectorAll('[data-folder-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.folderColor===color)));}
  let transferAutoCloseTimer,notificationVersion=0,notificationItems=[];
  function renderNotifications(result){
    notificationItems=result.notifications||[];
    const count=result.unread_count||0,badge=$('notifications-badge');
    badge.hidden=!count;badge.textContent=count>99?'99+':String(count);
    $('notifications-toggle').setAttribute('aria-label',count?`Notifications, ${count} unread`:'Notifications');
    $('notifications-read-all').disabled=!count;
    const list=$('notifications-list');list.replaceChildren();
    if(!notificationItems.length){list.append(node('p','notifications-empty','No notifications yet.'));return;}
    notificationItems.forEach(item=>{
      const entry=node('article','notification-item'+(!item.is_read?' unread':''));entry.dataset.level=item.level;entry.tabIndex=0;entry.setAttribute('role','button');entry.setAttribute('aria-label',item.title+(item.is_read?'':', mark as read'));entry.addEventListener('click',()=>markNotificationRead(item.id));entry.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();markNotificationRead(item.id);}});
      const heading=node('div','notification-item-heading');heading.append(node('strong','',item.title));
      if(!item.is_read){const dot=node('span','notification-unread-dot');dot.setAttribute('aria-label','Unread');heading.append(dot);}
      entry.append(heading,node('p','',item.message));const time=node('time','',new Date(item.created_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}));time.dateTime=item.created_at;entry.append(time);list.append(entry);
    });
  }
  async function loadNotifications(markRead=false){
    const version=++notificationVersion;
    try{let result=await api('/api/notifications');if(markRead||!$('notifications-panel').hidden){const throughId=(result.notifications||[]).reduce((max,item)=>Math.max(max,item.id),0);if(result.unread_count)result=await api('/api/notifications/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({through_id:throughId})});}if(version===notificationVersion)renderNotifications(result);}catch{}
  }
  async function markNotificationRead(id){try{const result=await api('/api/notifications/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});notificationVersion++;renderNotifications(result);}catch{}}
  async function recordNotification(title,message,level='success'){
    try{await api('/api/notifications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title.slice(0,80),message:message.slice(0,500),level})});await loadNotifications();}catch{}
  }
  function closeNotifications(focus=false){$('notifications-panel').hidden=true;$('notifications-toggle').setAttribute('aria-expanded','false');if(focus)$('notifications-toggle').focus();}
  function initializeNotifications(){
    $('notifications-toggle').addEventListener('click',()=>{
      if(!$('notifications-panel').hidden){closeNotifications();return;}
      if(!$('auth-page').hidden)$('admin-toggle').click();
      $('notifications-panel').hidden=false;$('notifications-toggle').setAttribute('aria-expanded','true');loadNotifications(true);
    });
    document.addEventListener('pointerdown',event=>{if(!$('notifications-panel').contains(event.target)&&!$('notifications-toggle').contains(event.target))closeNotifications();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('notifications-panel').hidden){event.preventDefault();closeNotifications(true);}});
    $('notifications-read-all').addEventListener('click',async()=>{
      const throughId=notificationItems.reduce((max,item)=>Math.max(max,item.id),0);$('notifications-read-all').disabled=true;
      try{const result=await api('/api/notifications/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({through_id:throughId})});notificationVersion++;renderNotifications(result);}catch{$('notifications-read-all').disabled=false;}
    });
    setInterval(()=>{if(document.visibilityState==='visible'&&window.adminAuth.authenticated)loadNotifications();},30000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&window.adminAuth.authenticated)loadNotifications();});
  }

  function updatePreviewNavigation(){
    const items=state.visible.filter(item=>kind(item)!=='folder'),index=state.selected?items.findIndex(item=>key(item)===key(state.selected)):-1;
    $('preview-previous').hidden=items.length<2;$('preview-next').hidden=items.length<2;
    $('preview-previous').disabled=index<=0;$('preview-next').disabled=index<0||index>=items.length-1;
  }
  function stepPreview(direction){
    const items=state.visible.filter(item=>kind(item)!=='folder'),index=state.selected?items.findIndex(item=>key(item)===key(state.selected)):-1;
    if(index<0||!items[index+direction])return;
    preview(items[index+direction]);
  }
  function initializePreviewNavigation(){
    $('preview-previous').addEventListener('click',()=>stepPreview(-1));$('preview-next').addEventListener('click',()=>stepPreview(1));
    $('preview-dialog').addEventListener('keydown',event=>{if(event.target.closest('input,textarea,select,video,.video-player'))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();stepPreview(event.key==='ArrowLeft'?-1:1);}});
    $('folder-back').addEventListener('click',()=>{state.currentFolderId=null;state.filter='all';state.selection.clear();document.querySelectorAll('[data-filter]').forEach(button=>{if(button.dataset.filter==='all')button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});renderFolderShortcuts();render();});
  }
  let disposeVideoPlayer=()=>{};
  function createVideoPlayer(video){
    const element=node('div','video-player');element.tabIndex=0;element.setAttribute('role','region');element.setAttribute('aria-label','Video player');
    const lifetime=new AbortController(),signal=lifetime.signal;
    const listen=(target,event,fn)=>target.addEventListener(event,fn,{signal});
    let hideTimer,manualSeek=false,clickTimer;
    video.controls=false;video.removeAttribute('controls');video.playsInline=true;video.setAttribute('playsinline','');video.setAttribute('controlslist','nodownload');video.tabIndex=-1;
    const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m8 5 11 7-11 7z"/></svg>';
    const pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
    const speakerIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3zM16 8a6 6 0 0 1 0 8M19 5a10 10 0 0 1 0 14"/></svg>';
    const mutedIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3zM17 9l5 6M22 9l-5 6"/></svg>';
    const button=(label,html,className='player-button')=>{const el=node('button',className);el.type='button';el.innerHTML=html;el.setAttribute('aria-label',label);el.title=label;return el;};
    const largePlay=button('Play video',playIcon,'player-large-play');
    const spinner=node('span','player-spinner');spinner.setAttribute('aria-label','Buffering');spinner.setAttribute('role','status');
    const controls=node('div','player-controls');controls.setAttribute('aria-label','Playback controls');
    const seekWrap=node('div','player-seek');const buffered=node('span','player-buffered');const played=node('span','player-played');
    const seek=node('input','player-seek-input');seek.type='range';seek.min='0';seek.max='100';seek.step='.01';seek.value='0';seek.disabled=true;seek.setAttribute('aria-label','Seek video');
    seekWrap.append(buffered,played,seek);
    const row=node('div','player-controls-row');const play=button('Play',playIcon),mute=button('Mute',speakerIcon);
    const volume=node('input','player-volume');volume.type='range';volume.min='0';volume.max='1';volume.step='.01';volume.value='1';volume.setAttribute('aria-label','Volume');
    const clock=node('span','player-time','0:00 / 0:00');clock.setAttribute('aria-live','off');
    const rate=node('select','player-rate');rate.setAttribute('aria-label','Playback speed');[.5,1,1.25,1.5,2].forEach(value=>{const option=node('option','',value+'×');option.value=value;if(value===1)option.selected=true;rate.append(option);});
    const fullscreen=button('Enter fullscreen','<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>');
    row.append(play,mute,volume,clock,rate,fullscreen);controls.append(seekWrap,row);element.append(video,largePlay,spinner,controls);
    const format=value=>{value=Math.max(0,Number.isFinite(value)?Math.floor(value):0);const h=Math.floor(value/3600),m=Math.floor(value%3600/60),s=String(value%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`;};
    const showControls=()=>{clearTimeout(hideTimer);element.classList.remove('controls-hidden');if(!video.paused)hideTimer=setTimeout(()=>{if(!element.contains(document.activeElement)&&!manualSeek)element.classList.add('controls-hidden');},2500);};
    const sync=()=>{
      const duration=Number.isFinite(video.duration)?video.duration:0,current=manualSeek?Number(seek.value):video.currentTime||0;
      play.innerHTML=video.paused?playIcon:pauseIcon;play.setAttribute('aria-label',video.paused?'Play':'Pause');play.title=video.paused?'Play':'Pause';
      largePlay.hidden=!video.paused;largePlay.setAttribute('aria-label',video.ended?'Replay video':'Play video');
      seek.disabled=!duration;seek.max=String(duration||100);if(!manualSeek)seek.value=String(current);
      seek.setAttribute('aria-valuetext',`${format(current)} of ${format(duration)}`);clock.textContent=`${format(current)} / ${format(duration)}`;
      played.style.width=(duration?current/duration*100:0)+'%';
      let end=0;for(let i=0;i<video.buffered.length;i++){if(video.buffered.start(i)<=current+.2)end=Math.max(end,video.buffered.end(i));}
      buffered.style.width=(duration?Math.min(100,end/duration*100):0)+'%';
      mute.innerHTML=video.muted||video.volume===0?mutedIcon:speakerIcon;mute.setAttribute('aria-label',video.muted?'Unmute':'Mute');mute.title=video.muted?'Unmute':'Mute';volume.value=String(video.muted?0:video.volume);
      element.classList.toggle('is-paused',video.paused);
    };
    const togglePlay=async()=>{try{if(video.paused){if(video.ended)video.currentTime=0;await video.play();}else video.pause();showControls();}catch(error){if(error.name!=='AbortError'){$('preview-error').textContent='Playback could not start. Try again or download the original.';$('preview-error').hidden=false;}}};
    const toggleFullscreen=async()=>{try{if(document.fullscreenElement===element)await document.exitFullscreen();else await element.requestFullscreen();}catch{fullscreen.title='Fullscreen unavailable in this browser';}};
    listen(play,'click',togglePlay);listen(largePlay,'click',togglePlay);listen(video,'click',()=>{clearTimeout(clickTimer);clickTimer=setTimeout(togglePlay,180);});listen(video,'dblclick',()=>{clearTimeout(clickTimer);toggleFullscreen();});
    listen(mute,'click',()=>{video.muted=!video.muted;sync();});listen(volume,'input',()=>{video.volume=Number(volume.value);video.muted=video.volume===0;sync();});
    listen(rate,'change',()=>video.playbackRate=Number(rate.value));listen(fullscreen,'click',toggleFullscreen);
    listen(seek,'input',()=>{manualSeek=true;showControls();sync();});listen(seek,'change',()=>{if(Number.isFinite(video.duration))video.currentTime=Number(seek.value);manualSeek=false;sync();});listen(seek,'pointercancel',()=>{manualSeek=false;sync();});
    ['loadedmetadata','durationchange','timeupdate','progress','volumechange','ratechange','pause','ended'].forEach(event=>listen(video,event,sync));
    listen(video,'play',()=>{sync();showControls();});listen(video,'pause',()=>{element.classList.remove('is-buffering');showControls();});
    ['waiting','seeking'].forEach(event=>listen(video,event,()=>element.classList.add('is-buffering')));
    ['playing','seeked','canplay','error','ended'].forEach(event=>listen(video,event,()=>element.classList.remove('is-buffering')));
    listen(video,'contextmenu',event=>event.preventDefault());
    listen(element,'pointermove',showControls);listen(element,'focusin',showControls);listen(element,'pointerleave',()=>{if(!video.paused&&!element.contains(document.activeElement))element.classList.add('controls-hidden');});
    listen(element,'keydown',event=>{
      if(event.target.closest('input,select,button')){if(event.key.startsWith('Arrow'))event.stopPropagation();return;}
      if(event.key===' '||event.key.toLowerCase()==='k'){event.preventDefault();event.stopPropagation();togglePlay();}
      else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();if(Number.isFinite(video.duration))video.currentTime=Math.max(0,Math.min(video.duration,video.currentTime+(event.key==='ArrowRight'?5:-5)));showControls();}
      else if(event.key.toLowerCase()==='m'){event.preventDefault();video.muted=!video.muted;}
      else if(event.key.toLowerCase()==='f'){event.preventDefault();toggleFullscreen();}
    });
    listen(document,'fullscreenchange',()=>{const active=document.fullscreenElement===element;fullscreen.setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');fullscreen.title=active?'Exit fullscreen':'Enter fullscreen';showControls();});
    sync();
    return {element,destroy(){clearTimeout(hideTimer);clearTimeout(clickTimer);lifetime.abort();if(document.fullscreenElement===element)document.exitFullscreen().catch(()=>{});}};
  }

  const technicalRequests=new Map();let detailItem=null,shareItem=null;
  function durationText(value){if(!Number.isFinite(Number(value))||Number(value)<=0)return '—';const seconds=Math.floor(Number(value)),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=String(seconds%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${s}`:`${m}:${s}`;}
  function refreshTechnical(item){
    const previous=technicalRequests.get(item.id)||{attempt:0,pending:false};if(previous.pending||previous.attempt>=8)return;
    previous.pending=true;previous.attempt++;technicalRequests.set(item.id,previous);
    setTimeout(async()=>{try{const latest=await api('/api/media/'+item.id);Object.assign(item,latest);const stored=state.items.find(value=>kind(value)===kind(item)&&value.id===item.id);if(stored)Object.assign(stored,latest);document.querySelectorAll(`[data-item-key="${key(item)}"]`).forEach(row=>{row.querySelectorAll('.video-duration').forEach(el=>el.textContent=durationText(latest.duration_seconds));row.querySelectorAll('.duration-meta').forEach(el=>el.textContent=' · '+durationText(latest.duration_seconds));});if(detailItem&&key(detailItem)===key(item))renderDetails(item);}catch{}finally{previous.pending=false;if(!item.duration_seconds&&state.items.some(value=>key(value)===key(item)))refreshTechnical(item);}},previous.attempt===1?700:2500);
  }
  async function loadStorage(){try{const usage=await api('/api/storage'),gb=value=>(value/1e9).toFixed(1)+' GB';$('storage-percent').textContent=usage.used_percent+'%';$('storage-fill').style.width=usage.used_percent+'%';$('storage-meter').querySelector('[role="progressbar"]').setAttribute('aria-valuenow',String(usage.used_percent));$('storage-summary').textContent=gb(usage.used_bytes)+' of '+gb(usage.capacity_bytes)+' used';$('storage-reserve').textContent=(usage.reserved_bytes/1024**3).toFixed(0)+' GiB reserved for the service';$('storage-reserve').textContent+='; the meter includes the operating system and other VPS files. Uploads stop before this reserve is consumed.';$('storage-meter').classList.toggle('storage-low',usage.used_percent>=90);}catch{$('storage-summary').textContent='Storage temporarily unavailable';}}
  function detailsEntries(item){
    const folder=kind(item)==='folder';return [['Name',item.title||item.name],['Type',typeNames[kind(item)]||item.mime_type],['Original filename',folder?null:item.original_filename],['Size',folder?null:bytes(item)?size(bytes(item))+' ('+bytes(item).toLocaleString()+' bytes)':null],['Duration',kind(item)==='video'?durationText(item.duration_seconds):null],['Dimensions',item.width&&item.height?item.width+' × '+item.height:null],['Items',folder?String(item.item_count||0):null],['Tag',item.tag||item.tags],['Description',item.description],['Color',folder?folderColor(item.color):null],['Added',item.created_at?new Date(item.created_at).toLocaleString():null],['Updated',item.updated_at?new Date(item.updated_at).toLocaleString():null],['Folder',!folder&&item.folder_id?state.folders.find(value=>value.id===item.folder_id)?.name:null],['Characters',kind(item)==='poem'?String((item.content||'').length):null]];
  }
  function renderDetails(item){$('details-title').textContent=item.title||item.name||'Details';$('details-fields').replaceChildren();detailsEntries(item).forEach(([label,value])=>{if(value!==undefined&&value!==null&&value!=='')$('details-fields').append(node('dt','',label),node('dd','',String(value)));});}
  async function openDetails(item){detailItem=item;renderDetails(item);$('details-status').textContent='';$('details-dialog').showModal();try{let latest;if(kind(item)==='folder'){const result=await api('/api/folders');latest=result.folders.find(value=>value.id===item.id);if(latest)latest={...latest,title:latest.name,media_type:'folder'};}else latest=await api(`/api/${kind(item)==='poem'?'poems':'media'}/${item.id}`);if(latest&&detailItem===item){Object.assign(item,latest);renderDetails(item);if(kind(item)==='video'&&!item.duration_seconds)refreshTechnical(item);}}catch(error){$('details-status').textContent=error.message;}}
  function setCategories(open){const menu=$('category-menu');menu.inert=!open;menu.setAttribute('aria-hidden',String(!open));menu.closest('.category-control').classList.toggle('expanded',open);$('category-toggle').setAttribute('aria-expanded',String(open));}
  function closeCategories(){setCategories(false);}
  const shareEndpoint=item=>`/api/${kind(item)==='poem'?'poems':'media'}/${item.id}/share`;
  let sharingActive=false;
  async function openSharing(item){
    shareItem=item;sharingActive=false;$('share-title').textContent=item.title;$('share-link-row').hidden=true;$('share-link').value='';$('share-error').hidden=true;$('share-enabled').checked=false;$('share-details').checked=false;$('share-clean').checked=false;$('share-clean-row').hidden=true;$('share-expiry').value='604800';$('share-create').textContent='Create link';$('share-create').disabled=true;$('share-enabled').disabled=true;$('share-status').textContent='Loading sharing settings…';$('share-dialog').showModal();
    try{const result=await api(shareEndpoint(item));if(shareItem!==item)return;sharingActive=result.shared;$('share-enabled').checked=result.shared;$('share-details').checked=!!result.share?.allow_details;$('share-clean').checked=!!result.share?.strip_metadata;$('share-clean-row').hidden=!$('share-details').checked;$('share-create').textContent=result.shared?'Create new link':'Create link';$('share-create').disabled=!result.shared;$('share-status').textContent=result.shared?'Shared view is enabled. Creating a new link replaces the previous one.':'Turn on Shared view, choose your options, then create a link.';}
    catch(error){$('share-status').textContent=error.message;}
    finally{if(shareItem===item)$('share-enabled').disabled=false;}
  }
  async function createShareLink(){
    if(!shareItem||!$('share-enabled').checked)return;const item=shareItem;$('share-create').disabled=true;$('share-enabled').disabled=true;$('share-error').hidden=true;
    try{const result=await api(shareEndpoint(item),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expires_in:Number($('share-expiry').value),allow_details:$('share-details').checked,strip_metadata:$('share-details').checked&&$('share-clean').checked})});if(shareItem!==item)return;sharingActive=true;$('share-create').textContent='Create new link';$('share-link').value=new URL(result.path,location.origin).href;$('share-link-row').hidden=false;$('share-status').textContent=result.expires_at?'Anyone with the link can view until '+new Date(result.expires_at*1000).toLocaleString()+'.':'Anyone with the link can view. Revoke access whenever you want.';}
    catch(error){if(shareItem===item){$('share-error').textContent=error.message;$('share-error').hidden=false;}}
    finally{if(shareItem===item){$('share-create').disabled=!$('share-enabled').checked;$('share-enabled').disabled=false;}}
  }
  async function loadSharedLinks(){
    const list=$('shared-links-list');list.replaceChildren(node('p','muted','Loading…'));
    try{const result=await api('/api/shares');list.replaceChildren();for(const share of result.shares){const row=node('div','shared-link-entry'),info=node('div','shared-link-info');info.append(node('strong','',share.title));const expired=share.expires_at&&share.expires_at*1000<Date.now();info.append(node('small','muted',expired?'Expired':share.expires_at?'Expires '+new Date(share.expires_at*1000).toLocaleDateString():'No expiry'));const revoke=node('button','icon-button danger');revoke.type='button';revoke.setAttribute('aria-label','Revoke link for '+share.title);revoke.title='Revoke link';revoke.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>';revoke.addEventListener('click',async()=>{revoke.disabled=true;try{await api(`/api/${share.item_kind==='poem'?'poems':'media'}/${share.media_id}/share`,{method:'DELETE'});row.remove();if(!list.children.length)list.append(node('p','muted','No shared links.'));}catch(error){revoke.disabled=false;const message=node('p','error-text',error.message);row.append(message);}});row.append(info,revoke);list.append(row);}if(!result.shares.length)list.append(node('p','muted','No shared links.'));}
    catch(error){list.replaceChildren(node('p','error-text',error.message));}
  }
  function initializeStorageFeatures(){
    $('category-toggle').addEventListener('click',()=>setCategories($('category-toggle').getAttribute('aria-expanded')!=='true'));
    $('category-menu').addEventListener('keydown',event=>{if(event.key==='Escape'){closeCategories();$('category-toggle').focus();}});
    $('preview-share').addEventListener('click',()=>{if(state.selected&&kind(state.selected)!=='folder')openSharing(state.selected);});
    $('details-dialog').addEventListener('close',()=>detailItem=null);$('share-dialog').addEventListener('close',()=>shareItem=null);
    $('manage-shares').addEventListener('click',()=>{$('shared-links-dialog').showModal();loadSharedLinks();});
    $('share-create').addEventListener('click',createShareLink);
    $('share-enabled').addEventListener('change',async event=>{
      const item=shareItem;if(!item)return;$('share-error').hidden=true;
      if(event.target.checked){$('share-create').disabled=false;$('share-status').textContent='Ready. Click Create link to enable shared access.';return;}
      $('share-create').disabled=true;
      if(!sharingActive){$('share-status').textContent='Only you can access this video.';return;}
      event.target.disabled=true;try{await api(shareEndpoint(item),{method:'DELETE'});if(shareItem!==item)return;sharingActive=false;$('share-link-row').hidden=true;$('share-link').value='';$('share-create').textContent='Create link';$('share-status').textContent='Access revoked. Previous links no longer work.';}
      catch(error){if(shareItem===item){$('share-enabled').checked=true;$('share-create').disabled=false;$('share-error').textContent=error.message;$('share-error').hidden=false;}}
      finally{if(shareItem===item)$('share-enabled').disabled=false;}
    });
    $('share-details').addEventListener('change',()=>{$('share-clean-row').hidden=!$('share-details').checked;if(!$('share-details').checked)$('share-clean').checked=false;});
    ['share-expiry','share-details','share-clean'].forEach(id=>$(id).addEventListener('change',()=>{if(sharingActive)$('share-status').textContent='Create a new link to apply these options and replace the previous link.';}));
    $('share-copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('share-link').value);$('share-copy').textContent='Copied';setTimeout(()=>$('share-copy').textContent='Copy link',1600);}catch{$('share-link').select();}});
    setInterval(()=>{if(document.visibilityState==='visible'&&window.adminAuth.authenticated)loadStorage();},60000);
  }

  initializeManager();
  initializeDragDrop();
  initializeNotifications();
  initializePreviewNavigation();
  initializeStorageFeatures();
  window.adminAuth.refresh().then(()=>{load();loadNotifications();});
})();
