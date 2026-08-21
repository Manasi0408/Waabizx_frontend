import { getApiOrigin } from './apiBase';

function normalizeApiBase(apiBase) {
  let base = String(apiBase || '')
    .trim()
    .replace(/\/$/, '')
    .replace(/\/api$/i, '');
  // SPA host does not serve /uploads — Express API does
  if (!base || /^https?:\/\/app\.waabizx\.com$/i.test(base)) {
    base = getApiOrigin();
  }
  return base;
}

const DEFAULT_API_BASE = normalizeApiBase(getApiOrigin());

/** Canonical disk path `/uploads/...` from any upload URL. */
export function toPermanentUploadPath(url) {
  const value = String(url || '').trim();
  if (!value || value.startsWith('blob:')) return null;
  const match = value.match(/\/(?:api\/)?uploads\/[^\s?#]+/i);
  if (match) {
    let p = match[0].split('?')[0];
    if (/^\/api\/uploads\//i.test(p)) {
      p = p.replace(/^\/api\/uploads\//i, '/uploads/');
    }
    return p;
  }
  if (value.startsWith('uploads/')) return `/${value.split('?')[0]}`;
  return null;
}

/** Proxy-safe public path `/api/uploads/...` (production only forwards `/api/*`). */
export function toPublicUploadPath(url) {
  const permanent = toPermanentUploadPath(url);
  if (!permanent) return null;
  return permanent.replace(/^\/uploads\//i, '/api/uploads/');
}

export function isMetaMediaHandle(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (/^\d+::/.test(value)) return true;
  if (toPermanentUploadPath(value)) return false;
  if (
    !/^https?:\/\//i.test(value) &&
    !value.startsWith('/uploads/') &&
    !value.startsWith('/api/uploads/')
  ) {
    return true;
  }
  return false;
}

export function resolvePublicMediaUrl(mediaUrl, apiBase = DEFAULT_API_BASE) {
  if (!mediaUrl) return '';
  const raw = String(mediaUrl).trim();
  if (!raw || raw.startsWith('blob:') || isMetaMediaHandle(raw)) return '';
  const base = normalizeApiBase(apiBase || DEFAULT_API_BASE);

  const publicPath = toPublicUploadPath(raw);
  if (publicPath) {
    return `${base}${publicPath}`;
  }

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/api/')) return `${base}${raw}`;
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}

/** Build display URL for WhatsApp media — uses cached upload path or authenticated proxy */
export function resolveWhatsAppMediaUrl(message, apiBase = DEFAULT_API_BASE) {
  if (!message) return '';
  const direct = message.mediaUrl || message.url;
  if (direct) {
    const resolved = resolvePublicMediaUrl(direct, apiBase);
    if (resolved) return resolved;
  }
  const mediaId =
    message.mediaId ||
    message.payload?.image?.id ||
    message.payload?.video?.id ||
    message.payload?.audio?.id ||
    message.payload?.document?.id ||
    message.payload?.sticker?.id;
  if (!mediaId) return '';
  const base = normalizeApiBase(apiBase || DEFAULT_API_BASE);
  return `${base}/api/media/whatsapp/${encodeURIComponent(mediaId)}`;
}

export function resolveDisplayableHeaderMediaUrl(...candidates) {
  for (const candidate of candidates) {
    const resolved = resolvePublicMediaUrl(candidate);
    if (resolved && !isMetaMediaHandle(resolved)) return resolved;
  }
  return null;
}

/** Meta template HEADER example URLs (when no upload path is stored locally). */
export function resolveHeaderImageFromComponents(components) {
  const header = (components || []).find((c) => String(c.type || '').toUpperCase() === 'HEADER');
  const format = String(header?.format || '').toUpperCase();
  if (format !== 'IMAGE') return null;
  const handles = header?.example?.header_handle;
  if (Array.isArray(handles) && handles[0] && /^https?:\/\//i.test(String(handles[0]))) {
    return String(handles[0]).trim();
  }
  return null;
}
