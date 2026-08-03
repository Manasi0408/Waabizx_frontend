/**
 * Browser-side Embedded Signup logger.
 * Writes REQUEST / PAYLOAD / RESPONSE to console and posts to backend
 * → backend/logs/embedded-signup.log
 *
 * Uses API host root (/meta/...) — not /api axios baseURL.
 */
import { resolveApiBase } from './metaWhatsAppConnect';

function mask(value) {
  const raw = String(value || '');
  if (!raw) return '';
  if (raw.length <= 8) return '***';
  return `${raw.slice(0, 4)}…${raw.slice(-4)} (len=${raw.length})`;
}

function sanitize(value, keyHint = '') {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, keyHint));
  if (typeof value !== 'object') {
    const lower = String(keyHint).toLowerCase();
    if (
      lower.includes('token') ||
      lower.includes('secret') ||
      lower === 'code' ||
      lower === 'authorization' ||
      lower === 'password'
    ) {
      return mask(value);
    }
    return value;
  }
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = sanitize(v, k);
  }
  return out;
}

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = localStorage.getItem('token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch (_) {
    /* ignore */
  }
  return headers;
}

/**
 * @param {string} operation
 * @param {object|null} request
 * @param {object|null} payload
 * @param {object|null} response
 */
export function logEmbeddedSignupClient(operation, request, payload, response) {
  const op = String(operation || 'ES_CLIENT').trim();
  const safeRequest = sanitize(request);
  const safePayload = sanitize(payload);
  const safeResponse = sanitize(response);

  // eslint-disable-next-line no-console
  console.log(`[${op}] REQUEST:`, safeRequest);
  // eslint-disable-next-line no-console
  console.log(`[${op}] PAYLOAD:`, safePayload);
  // eslint-disable-next-line no-console
  console.log(`[${op}] RESPONSE:`, safeResponse);

  const base = String(resolveApiBase() || '').replace(/\/$/, '');
  if (!base) return;

  fetch(`${base}/meta/embedded-signup-client-log`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      operation: op,
      request: safeRequest,
      payload: safePayload,
      response: safeResponse,
    }),
  }).catch(() => {});
}

export default logEmbeddedSignupClient;
