/* Load once with defer, AFTER removing the old auth handlers and token code. */
(() => {
  'use strict';
  const modal = document.getElementById('admin-modal');
  const toggle = document.getElementById('admin-toggle');
  const form = document.getElementById('form-auth-login');
  if (!modal || !form) return;
  const username = document.getElementById('login-username');
  const password = document.getElementById('login-password');
  const submit = document.getElementById('btn-login-submit');
  const logout = document.getElementById('auth-logout-btn');
  const alert = document.getElementById('auth-alert');
  const logoutAlert = document.getElementById('auth-logout-alert');
  let account = {authenticated: false, username: null};
  let csrf = '';
  let submitting = false;
  let generation = 0;
  let returnFocus;
  let statusRequest;

  // Delete legacy credentials. Session cookies are never readable here.
  for (const storageName of ['sessionStorage', 'localStorage']) {
    try { window[storageName].removeItem('admin_token'); } catch { /* Storage may be disabled. */ }
  }

  function publish() {
    document.getElementById('auth-logged-in').hidden = !account.authenticated;
    document.getElementById('auth-logged-out').hidden = account.authenticated;
    document.getElementById('auth-current-user').textContent = account.username || '';
    document.getElementById('admin-modal-title').textContent = 'Sign in';
    modal.setAttribute('aria-labelledby', account.authenticated ? 'auth-account-title' : 'admin-modal-title');
    const indicator = document.getElementById('auth-indicator');
    if (indicator) indicator.hidden = !account.authenticated;
    document.dispatchEvent(new CustomEvent('admin-auth-change', {detail: {...account}}));
  }

  async function rawFetch(path, options = {}) {
    return fetch(path, {...options, credentials: 'same-origin', cache: 'no-store', signal: options.signal || AbortSignal.timeout(12000)});
  }

  async function checkStatus() {
    if (statusRequest) return statusRequest;
    const version = generation;
    statusRequest = (async () => {
      const res = await rawFetch('/api/auth/status');
      if (!res.ok) throw new Error('Unable to check your session. Try again.');
      const data = await res.json();
      if (version === generation) {
        account = {authenticated: Boolean(data.authenticated), username: data.username || null};
        csrf = data.csrf_token || '';
        publish();
      }
    })().finally(() => { statusRequest = undefined; });
    return statusRequest;
  }

  async function apiFetch(path, options = {}) {
    const url = new URL(path, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) throw new Error('Only same-origin API requests are allowed');
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      if (!csrf) await checkStatus();
      headers.set('X-Requested-With', 'portfolio-admin');
      if (csrf) headers.set('X-CSRF-Token', csrf);
    }
    const res = await rawFetch(url, {...options, headers});
    if (res.status === 401) {
      generation++;
      csrf = '';
      account = {authenticated: false, username: null};
      publish();
    }
    return res;
  }

  function clearAlerts() { alert.hidden = true; logoutAlert.hidden = true; }
  function showError(target, message) { target.textContent = message; target.hidden = false; }
  function close() { modal.close(); }
  function open() {
    if (modal.open) return;
    returnFocus = document.activeElement;
    clearAlerts();
    publish();
    modal.showModal();
    toggle?.setAttribute('aria-expanded', 'true');
    toggle?.classList.add('is-active');
    (account.authenticated ? logout : username).focus();
    void checkStatus().catch(() => showError(account.authenticated ? logoutAlert : alert, 'Unable to check your session. Try again.'));
  }
  toggle?.addEventListener('click', () => modal.open ? close() : open());
  toggle?.setAttribute('aria-label', 'Admin sign in');
  document.getElementById('admin-modal-close').addEventListener('click', close);
  modal.addEventListener('click', event => {
    const r = modal.getBoundingClientRect();
    if (event.target === modal && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) close();
  });
  modal.addEventListener('close', () => {
    password.value = '';
    clearAlerts();
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.classList.remove('is-active');
    if (returnFocus?.isConnected) returnFocus.focus();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    submitting = true;
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    clearAlerts();
    generation++;
    try {
      const res = await rawFetch('/api/auth/login', {
        method: 'POST', headers: {'Content-Type': 'application/json', 'X-Requested-With': 'portfolio-admin'},
        body: JSON.stringify({username: username.value.trim(), password: password.value})
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Unable to sign in. Try again.');
      csrf = data.csrf_token;
      account = {authenticated: true, username: data.username};
      generation++;
      publish();
      close();
    } catch (err) {
      showError(alert, err.name === 'TimeoutError' ? 'Request timed out. Try again.' : err.message || 'Unable to connect. Try again.');
    } finally {
      password.value = '';
      submitting = false;
      submit.disabled = false;
      submit.textContent = 'Sign in';
    }
  });
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    clearAlerts();
    try {
      const res = await apiFetch('/api/auth/logout', {method: 'POST'});
      if (!res.ok && res.status !== 401) throw new Error('Unable to sign out. Try again.');
      generation++;
      csrf = '';
      account = {authenticated: false, username: null};
      publish();
      username.focus();
    } catch (err) { showError(logoutAlert, err.message || 'Unable to connect. Try again.'); }
    finally { logout.disabled = false; }
  });
  window.adminAuth = Object.freeze({apiFetch, refresh: checkStatus, open, get authenticated() { return account.authenticated; }});
  publish();
  void checkStatus().catch(() => { /* Login remains available if the initial status request fails. */ });
})();
