/** Production API host (Node/Express). UI stays on app.waabizx.com. */
export const DEFAULT_API_ROOT = 'https://api.waabizx.com';

/** API origin without /api suffix. */
export function getApiRoot() {
  const env = String(process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
  if (env) return env;

  if (process.env.NODE_ENV === 'production') {
    return DEFAULT_API_ROOT;
  }

  // Local dev: CRA proxy (package.json) forwards /api → localhost:5000
  if (typeof window !== 'undefined') {
    const envDev = String(process.env.REACT_APP_API_URL || '').trim();
    if (envDev) return envDev.replace(/\/$/, '');
    return 'http://localhost:5000';
  }

  return 'http://localhost:5000';
}

/** Full API base including /api path segment. */
export function getApiUrl() {
  return `${getApiRoot().replace(/\/$/, '')}/api`;
}

/** Socket.io / media / uploads origin (no /api suffix). */
export function getApiOrigin() {
  return getApiRoot().replace(/\/$/, '');
}

/** Public direct-api host (production). Used for API Token page docs. */
export function getPublicApiOrigin() {
  const publicUrl = String(process.env.REACT_APP_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
  if (publicUrl) return publicUrl;
  return DEFAULT_API_ROOT;
}
