import React from 'react';
import {
  resolveDisplayableHeaderMediaUrl,
  resolveHeaderImageFromComponents,
  resolvePublicMediaUrl,
  resolveWhatsAppMediaUrl,
} from './mediaUrl';

const MEDIA_HEADER_FORMATS = new Set(['IMAGE', 'VIDEO', 'DOCUMENT']);

export function normalizeTemplateKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function getTemplateComponents(template) {
  if (!template) return [];
  if (Array.isArray(template.components) && template.components.length) {
    return template.components;
  }
  const vars = template.variables;
  if (vars && typeof vars === 'object' && !Array.isArray(vars) && Array.isArray(vars.components)) {
    return vars.components;
  }
  if (typeof template.content === 'string' && template.content.trim()) {
    return [{ type: 'BODY', text: template.content }];
  }
  return [];
}

function isTemplateMarkerContent(text) {
  const value = String(text || '').trim();
  return /^Template:\s*\S+/i.test(value) || /^\[Template\]\s*\S+/i.test(value);
}

function extractTemplateNameFromContent(content) {
  const text = String(content || '').trim();
  let m = text.match(/^Template:\s*(.+)$/i);
  if (m) return m[1].trim();
  m = text.match(/^\[Template\]\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

/** Only true for messages that are actually WhatsApp templates — never plain chat text. */
export function isTemplateMessage(message) {
  if (!message) return false;
  if (message.isTemplate || message.isTemplateSend) return true;
  const content = String(message.content || message.message || '').trim();
  if (/^Template:\s*\S+/i.test(content)) return true;
  if (/^\[Template\]\s*\S+/i.test(content)) return true;
  const mt = String(message.messageType || message.mediaType || '').toLowerCase();
  if (mt === 'template') return true;
  if (message.templateName && (message.isTemplate || message.isTemplateSend)) return true;
  return false;
}

function findTemplateInCatalog(templateCatalog, templateName) {
  if (!templateName || !(templateCatalog instanceof Map) || templateCatalog.size === 0) {
    return null;
  }
  const key = normalizeTemplateKey(templateName);
  return (
    templateCatalog.get(key) ||
    [...templateCatalog.values()].find((t) => normalizeTemplateKey(t.name) === key) ||
    null
  );
}

function resolveHeaderMediaUrl(template, header, message = {}) {
  const format =
    String(header?.format || message?.templatePreview?.headerFormat || '').toUpperCase() ||
    (template?.variables?.templateType === 'image' ? 'IMAGE' : '');
  if (format && !MEDIA_HEADER_FORMATS.has(format) && format !== 'IMAGE') return null;

  const components = getTemplateComponents(template);
  return resolveDisplayableHeaderMediaUrl(
    message.templatePreview?.headerImageUrl,
    message.headerImageUrl,
    message.mediaUrl,
    template?.variables?.headerMediaUrl,
    template?.variables?.header_media_url,
    template?.headerMediaUrl,
    template?.header_media_url,
    resolveHeaderImageFromComponents(components)
  );
}

/** Raw stored header media path/URL on a template (for send + preview). */
export function extractTemplateHeaderMediaUrl(template) {
  if (!template || typeof template !== 'object') return null;
  const vars =
    template.variables && typeof template.variables === 'object' && !Array.isArray(template.variables)
      ? template.variables
      : {};
  const raw =
    vars.headerMediaUrl ||
    vars.header_media_url ||
    template.headerMediaUrl ||
    template.header_media_url ||
    template.headerImageUrl ||
    resolveHeaderImageFromComponents(getTemplateComponents(template)) ||
    null;
  const value = String(raw || '').trim();
  return value || null;
}

/** True when template header is an image (or has stored header media). */
export function templateHasImageHeader(template) {
  if (!template) return false;
  if (extractTemplateHeaderMediaUrl(template)) return true;
  const vars =
    template.variables && typeof template.variables === 'object' && !Array.isArray(template.variables)
      ? template.variables
      : {};
  if (String(vars.templateType || '').toLowerCase() === 'image') return true;
  const header = getTemplateComponents(template).find(
    (c) => String(c?.type || '').toUpperCase() === 'HEADER'
  );
  return String(header?.format || '').toUpperCase() === 'IMAGE';
}

/** True when send requires header media upload (image / video / document). */
export function templateNeedsHeaderMedia(template) {
  if (!template) return false;
  const vars =
    template.variables && typeof template.variables === 'object' && !Array.isArray(template.variables)
      ? template.variables
      : {};
  const type = String(vars.templateType || '').toLowerCase();
  if (['image', 'video', 'document'].includes(type)) return true;
  const header = getTemplateComponents(template).find(
    (c) => String(c?.type || '').toUpperCase() === 'HEADER'
  );
  return ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(header?.format || '').toUpperCase());
}

function applyTemplateParamsToBody(bodyText, params = []) {
  let text = String(bodyText || '');
  (params || []).forEach((param, idx) => {
    const n = idx + 1;
    const value = param == null ? '' : String(param);
    text = text.replace(new RegExp(`\\{\\{\\s*${n}\\s*\\}\\}`, 'g'), value);
  });
  return text.trim();
}

function enrichPreviewHeaderOnly(preview, message, templateCatalog) {
  if (!preview || preview.headerImageUrl || preview.header?.url) {
    if (preview?.header?.url && !preview.headerImageUrl) {
      return { ...preview, headerImageUrl: preview.header.url };
    }
    return preview;
  }
  const name = preview.templateName || message?.templateName;
  if (!name) return preview;
  const hit = findTemplateInCatalog(templateCatalog, name);
  if (!hit) return preview;
  const components = getTemplateComponents(hit);
  const header = components.find((c) => String(c.type || '').toUpperCase() === 'HEADER');
  const url = resolveHeaderMediaUrl(hit, header, message);
  return url
    ? {
        ...preview,
        headerImageUrl: url,
        header: { type: 'image', url },
        headerFormat: preview.headerFormat || 'IMAGE',
      }
    : preview;
}

export function buildTemplatePreview(template, message = {}) {
  if (!template) return null;

  const components = getTemplateComponents(template);
  const header = components.find((c) => String(c.type || '').toUpperCase() === 'HEADER');
  const body = components.find((c) => String(c.type || '').toUpperCase() === 'BODY');
  const footer = components.find((c) => String(c.type || '').toUpperCase() === 'FOOTER');
  const buttonsBlock = components.find((c) => String(c.type || '').toUpperCase() === 'BUTTONS');

  const footerText = String(footer?.text || template?.variables?.footer || '').trim();

  let buttons = (buttonsBlock?.buttons || []).map((btn, idx) => ({
    id: btn.id || `btn_${idx}`,
    text: String(btn.text || btn.title || '').trim(),
    type: String(btn.type || 'QUICK_REPLY').toUpperCase(),
    value: btn.payload || btn.text || btn.title || '',
  })).filter((b) => b.text);

  if (!buttons.length && Array.isArray(template?.variables?.interactiveButtons)) {
    buttons = template.variables.interactiveButtons
      .map((btn, idx) => ({
        id: `btn_${idx}`,
        text: String(btn.text || btn.label || '').trim(),
        type: String(btn.type || 'QUICK_REPLY').toUpperCase(),
        value: btn.text || btn.label || '',
      }))
      .filter((b) => b.text);
  }

  if (!buttons.length && Array.isArray(template?.variables?.quickReplies)) {
    buttons = template.variables.quickReplies
      .map((qr, idx) => ({
        id: `btn_${idx}`,
        text: String(qr.label || qr.text || qr).trim(),
        type: 'QUICK_REPLY',
        value: String(qr.label || qr.text || qr).trim(),
      }))
      .filter((b) => b.text);
  }

  const headerFormat =
    String(header?.format || '').toUpperCase() ||
    (template?.variables?.templateType === 'image' ? 'IMAGE' : null);
  const needsImage =
    headerFormat === 'IMAGE' ||
    template?.variables?.templateType === 'image' ||
    Boolean(
      message.mediaUrl ||
        message.headerImageUrl ||
        template?.variables?.headerMediaUrl ||
        template?.variables?.header_media_url
    );
  const headerImageUrl = needsImage
    ? resolveHeaderMediaUrl(
        {
          ...template,
          variables: {
            ...(template?.variables && typeof template.variables === 'object' && !Array.isArray(template.variables)
              ? template.variables
              : {}),
            headerMediaUrl:
              template?.variables?.headerMediaUrl ||
              template?.variables?.header_media_url ||
              message.mediaUrl ||
              message.headerImageUrl ||
              null,
          },
        },
        header || { type: 'HEADER', format: 'IMAGE' },
        message
      )
    : null;
  const resolvedHeaderFormat = headerImageUrl ? headerFormat || 'IMAGE' : headerFormat;
  const headerText =
    resolvedHeaderFormat === 'TEXT' && header?.text
      ? applyTemplateParamsToBody(header.text, message.templateParams)
      : null;

  const rawContent = message.content || message.message || '';
  const bodySource = isTemplateMarkerContent(rawContent) ? '' : rawContent;
  const bodyText = String(
    bodySource ||
      applyTemplateParamsToBody(body?.text, message.templateParams) ||
      body?.text ||
      template?.content ||
      ''
  ).trim();

  return {
    headerFormat: resolvedHeaderFormat,
    headerText,
    headerImageUrl,
    header: headerImageUrl
      ? { type: 'image', url: headerImageUrl }
      : headerText
        ? { type: 'text', text: headerText }
        : null,
    body: bodyText,
    footer: footerText,
    buttons,
    templateName: template.name || message.templateName || null,
  };
}

function mergeSnapshotWithCatalog(snap, rebuilt) {
  if (!rebuilt) return snap;
  if (!snap) return rebuilt;
  const snapButtons = Array.isArray(snap.buttons) ? snap.buttons : [];
  const rebuiltButtons = Array.isArray(rebuilt.buttons) ? rebuilt.buttons : [];
  const headerImageUrl =
    snap.headerImageUrl || snap.header?.url || rebuilt.headerImageUrl || rebuilt.header?.url || null;
  return {
    ...rebuilt,
    ...snap,
    body: snap.body || rebuilt.body || '',
    headerText: snap.headerText || rebuilt.headerText || null,
    headerImageUrl,
    header: snap.header || rebuilt.header || (headerImageUrl ? { type: 'image', url: headerImageUrl } : null),
    headerFormat: snap.headerFormat || rebuilt.headerFormat || null,
    footer: snap.footer || rebuilt.footer || '',
    buttons: snapButtons.length ? snapButtons : rebuiltButtons,
    templateName: snap.templateName || rebuilt.templateName || null,
  };
}

export function resolveMessageTemplatePreview(message, templateCatalog) {
  if (!message || message.type === 'system' || message.source === 'system') return null;
  if (!isTemplateMessage(message)) return null;

  const templateName =
    message.templateName ||
    message.templatePreview?.templateName ||
    extractTemplateNameFromContent(message.content || message.message);
  const catalogHit = templateName ? findTemplateInCatalog(templateCatalog, templateName) : null;

  // 1. Server-stored snapshot (merge with catalog for missing header/buttons)
  const rawSnapshot =
    message.templateSnapshot ||
    (typeof message.templatePreview === 'object' ? message.templatePreview : null);

  if (rawSnapshot || message.templatePreview || message.header || message.buttons) {
    let snap = {
      ...(typeof rawSnapshot === 'object' ? rawSnapshot : {}),
      ...(message.templatePreview && typeof message.templatePreview === 'object'
        ? message.templatePreview
        : {}),
      body:
        (typeof rawSnapshot === 'object' ? rawSnapshot.body : null) ||
        message.templatePreview?.body ||
        message.content ||
        message.message ||
        '',
      header:
        message.header ||
        (typeof rawSnapshot === 'object' ? rawSnapshot.header : null) ||
        message.templatePreview?.header ||
        null,
      footer:
        message.footer ||
        (typeof rawSnapshot === 'object' ? rawSnapshot.footer : null) ||
        message.templatePreview?.footer ||
        '',
      buttons:
        message.buttons ||
        (typeof rawSnapshot === 'object' ? rawSnapshot.buttons : null) ||
        message.templatePreview?.buttons ||
        [],
      headerImageUrl:
        (typeof rawSnapshot === 'object' ? rawSnapshot.headerImageUrl : null) ||
        message.templatePreview?.headerImageUrl ||
        message.header?.url ||
        message.mediaUrl ||
        null,
    };

    if (isTemplateMarkerContent(snap.body) && catalogHit) {
      snap = mergeSnapshotWithCatalog(
        { ...snap, body: '' },
        buildTemplatePreview(catalogHit, { ...message, templateName, content: '' })
      );
    } else if (catalogHit) {
      snap = mergeSnapshotWithCatalog(
        snap,
        buildTemplatePreview(catalogHit, { ...message, templateName, content: snap.body })
      );
    } else if (isTemplateMarkerContent(snap.body)) {
      snap.body = '';
    }

    return enrichPreviewHeaderOnly(snap, message, templateCatalog);
  }

  // 2. Known template name → load from catalog
  if (templateName && catalogHit) {
    return buildTemplatePreview(catalogHit, { ...message, templateName });
  }

  // 3. Confirmed template but no catalog match — show body only
  const raw = message.content || message.message || '';
  return {
    body: isTemplateMarkerContent(raw) ? '' : String(raw).trim(),
    footer: message.footer || '',
    buttons: Array.isArray(message.buttons) ? message.buttons : [],
    header: message.header || null,
    headerImageUrl: resolveDisplayableHeaderMediaUrl(
      message.mediaUrl,
      message.headerImageUrl,
      message.header?.url
    ),
    templateName: templateName || null,
  };
}

/** Resolve template header image for display — public URL or authenticated media proxy. */
export function resolveTemplateHeaderDisplayUrl(message, preview, apiBase) {
  const candidates = [
    preview?.headerImageUrl,
    preview?.header?.url,
    message?.headerImageUrl,
    message?.header?.url,
    message?.mediaUrl,
    message?.templatePreview?.headerImageUrl,
    message?.templatePreview?.header?.url,
    message?.templateSnapshot?.headerImageUrl,
    message?.templateSnapshot?.header?.url,
  ];

  for (const candidate of candidates) {
    const pub = resolvePublicMediaUrl(candidate, apiBase);
    if (pub) return pub;
  }

  const payload = message?.payload;
  if (payload && typeof payload === 'object') {
    const templateComponents = payload?.template?.components;
    if (Array.isArray(templateComponents)) {
      for (const comp of templateComponents) {
        if (String(comp?.type || '').toLowerCase() !== 'header') continue;
        for (const param of comp.parameters || []) {
          const link = param?.image?.link || param?.video?.link;
          const pub = resolvePublicMediaUrl(link, apiBase);
          if (pub) return pub;
        }
      }
    }
    const imageId = payload?.image?.id || message?.image?.id;
    if (imageId) {
      const base = String(apiBase || '').replace(/\/$/, '').replace(/\/api$/i, '');
      return `${base}/api/media/whatsapp/${encodeURIComponent(imageId)}`;
    }
  }

  const proxy = resolveWhatsAppMediaUrl(message, apiBase);
  return proxy || '';
}

export function shouldRenderWhatsAppCard(message, preview) {
  if (!isTemplateMessage(message)) {
    const mediaType = String(message?.mediaType || message?.messageType || '').toLowerCase();
    return mediaType === 'image' && Boolean(message?.mediaUrl);
  }
  if (!preview) return false;
  return Boolean(
    String(preview.headerText || '').trim() ||
      String(preview.body || '').trim() ||
      preview.headerImageUrl ||
      preview.headerFormat === 'IMAGE' ||
      (Array.isArray(preview.buttons) && preview.buttons.length > 0) ||
      String(preview.footer || '').trim()
  );
}

export function formatWhatsAppBody(text) {
  const raw = String(text || '');
  if (!raw.trim()) return null;
  const parts = raw.split(/(\*[^*]+\*|_[^_]+_|~[^~]+~)/g);
  return parts.map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return <strong key={i}>{part.slice(1, -1)}</strong>;
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('~') && part.endsWith('~')) {
      return <s key={i}>{part.slice(1, -1)}</s>;
    }
    return <span key={i}>{part}</span>;
  });
}
