/* Modern SPA Auth Controller (Routes /login and /register) */
(() => {
  'use strict';

  const authPage = document.getElementById('auth-page');
  const authBackdrop = document.getElementById('auth-backdrop');
  const authCloseBtn = document.getElementById('auth-close-btn');
  const toggle = document.getElementById('admin-toggle');

  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-auth-login');
  const formRegister = document.getElementById('form-auth-register');

  const loginUsername = document.getElementById('login-username');
  const loginPassword = document.getElementById('login-password');
  const loginSubmit = document.getElementById('btn-login-submit');
  const loginAlert = document.getElementById('auth-alert');

  const regUsername = document.getElementById('reg-username');
  const regPassword = document.getElementById('reg-password');
  const regConfirm = document.getElementById('reg-confirm');
  const regSubmit = document.getElementById('btn-reg-submit');
  const regAlert = document.getElementById('reg-alert');

  const loggedOutSection = document.getElementById('auth-logged-out');
  const loggedInSection = document.getElementById('auth-logged-in');
  const currentUserEl = document.getElementById('auth-current-user');
  const logoutBtn = document.getElementById('auth-logout-btn');
  const returnBtn = document.getElementById('auth-return-btn');
  const logoutAlert = document.getElementById('auth-logout-alert');

  const authCardTitle = document.getElementById('auth-card-title');
  const authCardDesc = document.getElementById('auth-card-desc');

  const linkToRegister = document.getElementById('link-to-register');
  const linkToLogin = document.getElementById('link-to-login');

  if (!authPage || !formLogin) return;

  let account = { authenticated: false, username: null };
  let csrf = '';
  let submitting = false;
  let generation = 0;
  let statusRequest;

  // Clear legacy tokens from previous implementations
  for (const storage of ['sessionStorage', 'localStorage']) {
    try { window[storage].removeItem('admin_token'); } catch {}
  }

  /* -------------------------------------------------------------
     SPA Routing Helpers
  ------------------------------------------------------------- */
  function navigate(path, replace = false) {
    if (window.location.pathname !== path) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
    }
    syncViewWithRoute();
  }

  function setMode(mode) {
    clearAlerts();
    if (mode === 'register') {
      tabLogin.classList.remove('is-active');
      tabLogin.setAttribute('aria-selected', 'false');
      tabRegister.classList.add('is-active');
      tabRegister.setAttribute('aria-selected', 'true');
      formLogin.hidden = true;
      formRegister.hidden = false;
      authCardTitle.textContent = 'Create Account';
      authCardDesc.textContent = 'Register administrator account for portfolio';
      setTimeout(() => regUsername.focus(), 50);
    } else {
      tabRegister.classList.remove('is-active');
      tabRegister.setAttribute('aria-selected', 'false');
      tabLogin.classList.add('is-active');
      tabLogin.setAttribute('aria-selected', 'true');
      formRegister.hidden = true;
      formLogin.hidden = false;
      authCardTitle.textContent = 'Sign in';
      authCardDesc.textContent = 'Manage your creative portfolio';
      setTimeout(() => (loginUsername.value ? loginPassword : loginUsername).focus(), 50);
    }
  }

  function openView(mode) {
    clearAlerts();
    publish();
    authPage.hidden = false;
    authPage.setAttribute('aria-hidden', 'false');
    toggle?.setAttribute('aria-expanded', 'true');
    toggle?.classList.add('is-active');
    setMode(mode);
  }

  function closeView() {
    clearAlerts();
    authPage.hidden = true;
    authPage.setAttribute('aria-hidden', 'true');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.classList.remove('is-active');
  }

  function syncViewWithRoute() {
    const path = window.location.pathname.toLowerCase();
    if (path === '/login') {
      openView('login');
    } else if (path === '/register') {
      openView('register');
    } else {
      closeView();
    }
  }

  window.addEventListener('popstate', syncViewWithRoute);

  // Tab & Switch Navigation
  tabLogin?.addEventListener('click', () => navigate('/login'));
  tabRegister?.addEventListener('click', () => navigate('/register'));
  linkToRegister?.addEventListener('click', () => navigate('/register'));
  linkToLogin?.addEventListener('click', () => navigate('/login'));

  // Close Navigation
  authCloseBtn?.addEventListener('click', () => navigate('/'));
  authBackdrop?.addEventListener('click', () => navigate('/'));
  returnBtn?.addEventListener('click', () => navigate('/'));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !authPage.hidden) {
      navigate('/');
    }
  });

  // Top header toggle button
  toggle?.addEventListener('click', () => {
    if (!authPage.hidden) {
      navigate('/');
    } else {
      navigate(account.authenticated ? '/login' : '/login');
    }
  });

  /* -------------------------------------------------------------
     Auth API & State
  ------------------------------------------------------------- */
  function clearAlerts() {
    if (loginAlert) loginAlert.hidden = true;
    if (regAlert) regAlert.hidden = true;
    if (logoutAlert) logoutAlert.hidden = true;
  }

  function showError(target, message) {
    if (!target) return;
    target.textContent = message;
    target.hidden = false;
  }

  function publish() {
    const isAuthed = Boolean(account.authenticated);
    if (loggedInSection) loggedInSection.hidden = !isAuthed;
    if (loggedOutSection) loggedOutSection.hidden = isAuthed;
    if (currentUserEl) currentUserEl.textContent = account.username || '';

    const indicator = document.getElementById('auth-indicator');
    if (indicator) indicator.hidden = !isAuthed;

    document.dispatchEvent(new CustomEvent('admin-auth-change', { detail: { ...account } }));
  }

  async function rawFetch(path, options = {}) {
    const isUpload = options.body instanceof FormData || String(path).includes('/api/upload');
    const timeoutMs = options.timeout !== undefined ? options.timeout : (isUpload ? 0 : 15000);
    const signal = options.signal || (timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined);
    return fetch(path, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
  }

  function uploadWithProgress(path, formData, onProgress) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!csrf) await checkStatus();
      } catch (err) {}

      const xhr = new XMLHttpRequest();
      xhr.open('POST', path, true);
      xhr.withCredentials = true;
      xhr.setRequestHeader('X-Requested-With', 'portfolio-admin');
      if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
      xhr.timeout = 15 * 60 * 1000; // 15-minute timeout for large media files

      if (xhr.upload && typeof onProgress === 'function') {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            onProgress(pct, e.loaded, e.total);
          }
        });
      }

      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true, status: xhr.status, data });
        } else {
          resolve({
            ok: false,
            status: xhr.status,
            data,
            error: data.error || data.message || `HTTP ${xhr.status}`,
          });
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during upload'));
      };

      xhr.ontimeout = () => {
        reject(new Error('Upload timed out after 15 minutes. Check connection speed.'));
      };

      xhr.send(formData);
    });
  }

  async function checkStatus() {
    if (statusRequest) return statusRequest;
    const version = generation;
    statusRequest = (async () => {
      try {
        const res = await rawFetch('/api/auth/status');
        if (!res.ok) throw new Error('Failed to verify session');
        const data = await res.json();
        if (version === generation) {
          account = { authenticated: Boolean(data.authenticated), username: data.username || null };
          csrf = data.csrf_token || '';
          publish();
        }
      } catch (err) {
        // If session status check fails, remain unauthenticated gracefully
      }
    })().finally(() => {
      statusRequest = undefined;
    });
    return statusRequest;
  }

  async function apiFetch(path, options = {}) {
    const url = new URL(path, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) {
      throw new Error('Only same-origin API requests are allowed');
    }
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!csrf) await checkStatus();
      headers.set('X-Requested-With', 'portfolio-admin');
      if (csrf) headers.set('X-CSRF-Token', csrf);
    }
    const res = await rawFetch(url, { ...options, headers });
    if (res.status === 401) {
      generation++;
      csrf = '';
      account = { authenticated: false, username: null };
      publish();
    }
    return res;
  }

  /* -------------------------------------------------------------
     Sign In Form Submission
  ------------------------------------------------------------- */
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting || !formLogin.reportValidity()) return;

    submitting = true;
    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Signing in…';
    clearAlerts();
    generation++;

    try {
      const res = await rawFetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'portfolio-admin',
        },
        body: JSON.stringify({
          username: loginUsername.value.trim(),
          password: loginPassword.value,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Unable to sign in. Check your credentials.');
      }

      csrf = data.csrf_token;
      account = { authenticated: true, username: data.username };
      generation++;
      publish();
      loginPassword.value = '';
      navigate('/');
    } catch (err) {
      showError(loginAlert, err.name === 'TimeoutError' ? 'Connection timed out. Try again.' : err.message);
    } finally {
      submitting = false;
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'Sign in';
    }
  });

  /* -------------------------------------------------------------
     Register Form Submission
  ------------------------------------------------------------- */
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting || !formRegister.reportValidity()) return;

    const u = regUsername.value.trim();
    const p = regPassword.value;
    const c = regConfirm.value;

    if (p !== c) {
      showError(regAlert, 'Passwords do not match.');
      regConfirm.focus();
      return;
    }

    if (p.length < 15) {
      showError(regAlert, 'Password must be at least 15 characters.');
      regPassword.focus();
      return;
    }

    submitting = true;
    regSubmit.disabled = true;
    regSubmit.textContent = 'Creating account…';
    clearAlerts();
    generation++;

    try {
      const res = await rawFetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'portfolio-admin',
        },
        body: JSON.stringify({
          username: u,
          password: p,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Registration failed.');
      }

      csrf = data.csrf_token;
      account = { authenticated: true, username: data.username };
      generation++;
      publish();
      regPassword.value = '';
      regConfirm.value = '';
      navigate('/');
    } catch (err) {
      showError(regAlert, err.name === 'TimeoutError' ? 'Connection timed out. Try again.' : err.message);
    } finally {
      submitting = false;
      regSubmit.disabled = false;
      regSubmit.textContent = 'Register Account';
    }
  });

  /* -------------------------------------------------------------
     Sign Out
  ------------------------------------------------------------- */
  logoutBtn?.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    clearAlerts();
    try {
      const res = await apiFetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok && res.status !== 401) throw new Error('Unable to sign out.');
      generation++;
      csrf = '';
      account = { authenticated: false, username: null };
      publish();
      setMode('login');
    } catch (err) {
      showError(logoutAlert, err.message || 'Logout failed.');
    } finally {
      logoutBtn.disabled = false;
    }
  });

  /* -------------------------------------------------------------
     Activity Audit Trail (7 Days Rolling)
  ------------------------------------------------------------- */
  const toggleLogsBtn = document.getElementById('auth-toggle-logs-btn');
  const logsSection = document.getElementById('auth-logs-section');
  const logsList = document.getElementById('auth-logs-list');
  const refreshLogsBtn = document.getElementById('auth-refresh-logs-btn');
  const logsCounter = document.getElementById('auth-logs-counter');
  const authContainer = document.querySelector('.auth-page__container');

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function loadActivityLogs() {
    if (!logsList) return;
    logsList.innerHTML = '<div class="auth-logs-empty">Fetching recent activity…</div>';
    try {
      const res = await apiFetch('/api/admin/logs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const logs = data.logs || [];

      if (logsCounter) {
        logsCounter.textContent = `${logs.length} logged events (7-day window)`;
      }

      if (!logs.length) {
        logsList.innerHTML = '<div class="auth-logs-empty">No activity recorded yet in the last 7 days.</div>';
        return;
      }

      logsList.innerHTML = '';
      logs.forEach((log) => {
        const item = document.createElement('div');
        const isErr = log.status_code >= 400;
        item.className = `auth-log-item${isErr ? ' is-error' : ''}`;

        let detailText = '';
        if (log.input_data) detailText += `In: ${log.input_data}\n`;
        if (log.error_message) detailText += `Error: ${log.error_message}\n`;
        else if (log.output_data) detailText += `Out: ${log.output_data}\n`;

        item.innerHTML = `
          <div class="auth-log-head">
            <div class="auth-log-badge-group">
              <span class="auth-log-badge ${isErr ? 'badge-error' : 'badge-success'}">${log.status_code}</span>
              <span class="auth-log-action">${escapeHtml(log.action)}</span>
            </div>
            <span class="auth-log-time">${escapeHtml(log.timestamp)}</span>
          </div>
          <div class="auth-log-route">${escapeHtml(log.method)} ${escapeHtml(log.endpoint)} &bull; ${escapeHtml(log.ip || 'local')}</div>
          ${detailText ? `<div class="auth-log-detail">${escapeHtml(detailText.trim())}</div>` : ''}
        `;
        logsList.appendChild(item);
      });
    } catch (err) {
      logsList.innerHTML = `<div class="auth-logs-empty auth-log-err">Failed to load logs: ${escapeHtml(err.message)}</div>`;
    }
  }

  toggleLogsBtn?.addEventListener('click', () => {
    if (logsSection.hidden) {
      logsSection.hidden = false;
      authContainer?.classList.add('has-logs');
      toggleLogsBtn.textContent = 'Hide Activity Logs';
      loadActivityLogs();
    } else {
      logsSection.hidden = true;
      authContainer?.classList.remove('has-logs');
      toggleLogsBtn.textContent = 'Activity Logs (7 Days)';
    }
  });

  refreshLogsBtn?.addEventListener('click', loadActivityLogs);

  window.adminAuth = Object.freeze({
    apiFetch,
    uploadWithProgress,
    loadLogs: loadActivityLogs,
    refresh: checkStatus,
    open: (mode = 'login') => navigate(mode === 'register' ? '/register' : '/login'),
    navigate,
    get authenticated() {
      return account.authenticated;
    },
  });

  // Initial setup: check auth state and sync view to URL
  checkStatus().then(publish);
  syncViewWithRoute();
})();
