import { logout } from './authService';

const SESSION_EXPIRED_KEY = 'sessionExpired';
const SESSION_EXPIRED_EVENT = 'waabizx:session-expired';

let handling = false;

function requestUrl(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  return '';
}

function isAuthRequest(url) {
  const u = String(url || '').toLowerCase();
  return (
    u.includes('/auth/login') ||
    u.includes('/auth/register') ||
    u.includes('/auth/forgot-password') ||
    u.includes('/auth/register/request-otp') ||
    u.includes('/auth/register/verify-otp') ||
    u.includes('/auth/register/resend-otp')
  );
}

function isProtectedApiRequest(url) {
  const u = String(url || '').toLowerCase();
  if (!u) return false;
  if (isAuthRequest(u)) return false;
  return (
    u.includes('/api/') ||
    u.includes('api.waabizx.com') ||
    u.includes('wabizx.techwhizzc.com') ||
    u.includes('localhost:') ||
    u.includes('127.0.0.1:')
  );
}

function hadAuthToken(init) {
  try {
    if (localStorage.getItem('token')) return true;
  } catch (_) {
    /* ignore */
  }
  const headers = init?.headers;
  if (!headers) return false;
  if (headers instanceof Headers) {
    return headers.has('Authorization') || headers.has('authorization');
  }
  if (Array.isArray(headers)) {
    return headers.some(([k]) => String(k).toLowerCase() === 'authorization');
  }
  return Boolean(headers.Authorization || headers.authorization);
}

export function shouldHandleSessionExpired(url, hadAuth = true) {
  if (!hadAuth) return false;
  return isProtectedApiRequest(url);
}

export function handleSessionExpired() {
  if (handling || typeof window === 'undefined') return;
  handling = true;
  try {
    logout();
    sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
  } finally {
    window.setTimeout(() => {
      handling = false;
    }, 1500);
  }
}

export function consumeSessionExpiredFlag() {
  try {
    if (sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1') {
      sessionStorage.removeItem(SESSION_EXPIRED_KEY);
      return true;
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

export const SESSION_EXPIRED_EVENT_NAME = SESSION_EXPIRED_EVENT;

export function installSessionExpiryHandlers() {
  if (typeof window === 'undefined' || window.__waabizxSessionExpiryInstalled) return;
  window.__waabizxSessionExpiryInstalled = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = requestUrl(input);
    const hadAuth = hadAuthToken(init);
    const response = await nativeFetch(input, init);
    if (response.status === 401 && shouldHandleSessionExpired(url, hadAuth)) {
      handleSessionExpired();
    }
    return response;
  };

  if (!window.__waabizxXhrSessionExpiryInstalled) {
    window.__waabizxXhrSessionExpiryInstalled = true;
    const xhrMeta = new WeakMap();
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
      xhrMeta.set(this, { url: String(url || ''), hadAuth: Boolean(localStorage.getItem('token')) });
      return nativeOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function send(...args) {
      this.addEventListener('load', function onLoad() {
        const meta = xhrMeta.get(this) || {};
        if (this.status === 401 && shouldHandleSessionExpired(meta.url, meta.hadAuth)) {
          handleSessionExpired();
        }
      });
      return nativeSend.apply(this, args);
    };
  }
}
