import { logout } from './authService';

const SESSION_EXPIRED_KEY = 'sessionExpired';
const SESSION_EXPIRED_REASON_KEY = 'sessionExpiredReason';
const SESSION_EXPIRED_EVENT = 'waabizx:session-expired';
const AUTH_GRACE_MS = 8000;

let handling = false;

function isWithinAuthGracePeriod() {
  try {
    const raw = sessionStorage.getItem('authIssuedAt');
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < AUTH_GRACE_MS;
  } catch (_) {
    return false;
  }
}

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

function normalizePayload(data) {
  if (data == null) return null;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return { message: trimmed };
    }
  }
  if (typeof data === 'object') return data;
  return null;
}

/**
 * Only true JWT/login session failures should trigger the session-expired modal.
 * Other 401s (WhatsApp Direct API token, permission checks, etc.) must be ignored.
 */
export function isActualSessionExpiryResponse(data, url = '') {
  const payload = normalizePayload(data);
  const u = String(url || '').toLowerCase();

  if (!payload) {
    return u.includes('/auth/profile') || u.includes('/auth/me');
  }

  const errorCode = String(payload.error || '').trim();
  const message = String(payload.message || payload.error || '').trim();
  const messageLower = message.toLowerCase();

  if (
    messageLower === 'invalid token!' ||
    messageLower.includes('invalid credentials') ||
    messageLower === 'unauthorized' ||
    messageLower === 'not authorized' ||
    messageLower.includes('authentication required') ||
    messageLower.includes('user not authenticated') ||
    messageLower.includes('access denied') ||
    messageLower.includes('forbidden')
  ) {
    return false;
  }

  if (
    errorCode === 'TokenExpiredError' ||
    errorCode === 'SessionInvalidated' ||
    errorCode === 'JsonWebTokenError'
  ) {
    return true;
  }

  if (
    messageLower.includes('token has expired') ||
    messageLower.includes('logged in elsewhere') ||
    (messageLower.includes('session expired') && errorCode === 'SessionInvalidated') ||
    (messageLower.includes('invalid token') && errorCode === 'JsonWebTokenError') ||
    (messageLower.includes('token verification failed') && errorCode === 'JsonWebTokenError') ||
    (messageLower.includes('user not found') && errorCode === 'UserNotFound') ||
    (messageLower.includes('no token provided') && errorCode === 'NoToken')
  ) {
    return true;
  }

  return false;
}

export function shouldHandleSessionExpired(url, hadAuth = true) {
  if (!hadAuth) return false;
  return isProtectedApiRequest(url);
}

export function maybeHandleUnauthorizedResponse(url, hadAuth, payload) {
  if (!shouldHandleSessionExpired(url, hadAuth)) return false;
  if (!isActualSessionExpiryResponse(payload, url)) return false;

  const normalized = normalizePayload(payload);
  const errorCode = String(normalized?.error || '').trim();
  const message = String(normalized?.message || '').toLowerCase();

  // Another login with the same account — show session modal immediately (no grace period).
  if (
    errorCode === 'SessionInvalidated' ||
    message.includes('logged in elsewhere')
  ) {
    handleSessionExpired('elsewhere');
    return true;
  }

  if (isWithinAuthGracePeriod()) return false;
  handleSessionExpired('expired');
  return true;
}

export function handleSessionExpired(reason = 'expired') {
  if (handling || typeof window === 'undefined') return;
  handling = true;
  try {
    logout();
    sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
    sessionStorage.setItem(SESSION_EXPIRED_REASON_KEY, reason);
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

export function consumeSessionExpiredReason() {
  try {
    const reason = sessionStorage.getItem(SESSION_EXPIRED_REASON_KEY) || 'expired';
    sessionStorage.removeItem(SESSION_EXPIRED_REASON_KEY);
    return reason;
  } catch (_) {
    return 'expired';
  }
}

export const SESSION_EXPIRED_EVENT_NAME = SESSION_EXPIRED_EVENT;

export function installSessionExpiryHandlers() {
  // Session expiry is handled only via the shared axios instance (api/axios.js).
  // Global fetch/XHR patching caused noisy console stacks and false logouts.
  if (typeof window === 'undefined' || window.__waabizxSessionExpiryInstalled) return;
  window.__waabizxSessionExpiryInstalled = true;
}
