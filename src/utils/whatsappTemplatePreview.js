import React from 'react';
import { getApiOrigin } from './apiBase';
import {
  resolveDisplayableHeaderMediaUrl,
  resolveHeaderImageFromComponents,
  resolvePublicMediaUrl,
  resolveWhatsAppMediaUrl,
} from './mediaUrl';

function templateTypeToHeaderFormat(templateType) {
  const t = String(templateType || '').toLowerCase();
  if (t === 'video') return 'VIDEO';
  if (t === 'document') return 'DOCUMENT';
  if (t === 'image') return 'IMAGE';
  return null;
}

function resolveButtonLabel(btn) {
  if (!btn || typeof btn !== 'object') return String(btn || '').trim();
  const raw = btn.text ?? btn.title ?? btn.label ?? '';
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    return String(raw.text || raw.body || raw.title || raw.label || '').trim();
  }
  return '';
}

function resolveHeaderMediaType(format, headerObj) {
  const fmt = String(format || '').toUpperCase();
  if (fmt === 'VIDEO' || headerObj?.type === 'video') return 'video';
  if (fmt === 'DOCUMENT' || headerObj?.type === 'document') return 'document';
  return 'image';
}

const MEDIA_HEADER_FORMATS = new Set(['IMAGE', 'VIDEO', 'DOCUMENT']);

export function normalizeTemplateKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function getTemplateVariablesObject(template) {
  const vars = template?.variables;
  if (vars && typeof vars === 'object' && !Array.isArray(vars)) return vars;
  return {};
}

function synthesizeCarouselComponentsFromVars(template) {
  const vars = getTemplateVariablesObject(template);
  const storedCards = Array.isArray(vars.carouselCards) ? vars.carouselCards : [];
  const isCarousel =
    String(vars.templateType || '').toLowerCase() === 'carousel' || storedCards.length > 0;
  if (!isCarousel || !storedCards.length) return null;

  const carouselMediaType = String(vars.carouselMediaType || 'IMAGE').toUpperCase();
  const headerFormat = carouselMediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE';
  const introBody = String(vars.carouselMainBody || template?.content || '').trim();
  const cards = storedCards.map((card) => ({
    components: [
      { type: 'HEADER', format: headerFormat },
      { type: 'BODY', text: String(card?.body || '').trim() },
      {
        type: 'BUTTONS',
        buttons: (Array.isArray(card?.buttons) ? card.buttons : [])
          .map((btn) => ({
            type: String(btn?.type || 'URL').toUpperCase(),
            text: String(btn?.label || btn?.text || '').trim(),
            url: btn?.url || btn?.value || undefined,
          }))
          .filter((b) => b.text),
      },
    ],
  }));

  const out = [];
  if (introBody) out.push({ type: 'BODY', text: introBody });
  out.push({ type: 'CAROUSEL', cards });
  return out;
}

function getCarouselCardsFromComponents(components) {
  const carousel = (components || []).find(
    (c) => String(c?.type || '').toUpperCase() === 'CAROUSEL'
  );
  return Array.isArray(carousel?.cards) ? carousel.cards : [];
}

export function getTemplateComponents(template) {
  if (!template) return [];
  if (Array.isArray(template.components) && template.components.length) {
    if (getCarouselCardsFromComponents(template.components).length) {
      return template.components;
    }
    const synth = synthesizeCarouselComponentsFromVars(template);
    if (synth?.length) return synth;
    return template.components;
  }
  const vars = getTemplateVariablesObject(template);
  if (Array.isArray(vars.components) && vars.components.length) {
    if (getCarouselCardsFromComponents(vars.components).length) return vars.components;
    const synth = synthesizeCarouselComponentsFromVars(template);
    if (synth?.length) return synth;
    return vars.components;
  }
  const synth = synthesizeCarouselComponentsFromVars(template);
  if (synth?.length) return synth;
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
  const vars =
    template?.variables && typeof template.variables === 'object' && !Array.isArray(template.variables)
      ? template.variables
      : {};
  const format =
    String(header?.format || message?.templatePreview?.headerFormat || '').toUpperCase() ||
    templateTypeToHeaderFormat(vars.templateType) ||
    '';
  if (format && !MEDIA_HEADER_FORMATS.has(format) && format !== 'TEXT') return null;

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

/** True when template is a WhatsApp media carousel (intro + swipeable cards). */
export function templateIsCarousel(template) {
  if (!template) return false;
  const vars =
    template.variables && typeof template.variables === 'object' && !Array.isArray(template.variables)
      ? template.variables
      : {};
  if (String(vars.templateType || '').toLowerCase() === 'carousel') return true;
  if (Array.isArray(vars.carouselCards) && vars.carouselCards.length) return true;
  return getTemplateComponents(template).some(
    (c) => String(c?.type || '').toUpperCase() === 'CAROUSEL'
  );
}

export function templateCarouselCardCount(template) {
  if (!template) return 0;
  const carousel = getTemplateComponents(template).find(
    (c) => String(c?.type || '').toUpperCase() === 'CAROUSEL'
  );
  if (Array.isArray(carousel?.cards) && carousel.cards.length) {
    return carousel.cards.length;
  }
  const vars =
    template.variables && typeof template.variables === 'object' && !Array.isArray(template.variables)
      ? template.variables
      : {};
  if (Array.isArray(vars.carouselCards)) return vars.carouselCards.length;
  return 0;
}

/** True when send requires per-card carousel media (image or video). */
export function templateNeedsCarouselMedia(template) {
  return templateIsCarousel(template) && templateCarouselCardCount(template) > 0;
}

/** True when send requires header media upload (image / video / document). */
export function templateNeedsHeaderMedia(template) {
  if (!template) return false;
  if (templateIsCarousel(template)) return false;
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

function buildCarouselPreviewCards(template, message = {}) {
  const components = getTemplateComponents(template);
  const carouselComp = components.find((c) => String(c?.type || '').toUpperCase() === 'CAROUSEL');
  const vars =
    template?.variables && typeof template.variables === 'object' && !Array.isArray(template.variables)
      ? template.variables
      : {};
  const cardMediaUrls = Array.isArray(message.carouselCardMediaUrls)
    ? message.carouselCardMediaUrls
    : [];
  let carouselMediaType = String(vars.carouselMediaType || 'IMAGE').toUpperCase();

  const mapCard = (cardDef, idx, fallbackBody) => {
    const cardHeader = (cardDef?.components || []).find(
      (c) => String(c?.type || '').toUpperCase() === 'HEADER'
    );
    if (cardHeader?.format) {
      carouselMediaType = String(cardHeader.format).toUpperCase();
    }
    const cardBody = (cardDef?.components || []).find(
      (c) => String(c?.type || '').toUpperCase() === 'BODY'
    );
    const cardButtonsComp = (cardDef?.components || []).find(
      (c) => String(c?.type || '').toUpperCase() === 'BUTTONS'
    );
    const rawUrl = cardMediaUrls[idx] || null;
    const headerImageUrl = rawUrl
      ? resolveDisplayableHeaderMediaUrl(rawUrl) || resolvePublicMediaUrl(rawUrl, message.apiBase)
      : null;
    const buttons = (cardButtonsComp?.buttons || []).map((btn, bi) => ({
      id: `card_${idx}_btn_${bi}`,
      type: String(btn?.type || 'URL').toUpperCase(),
      text: String(btn?.text || btn?.title || '').trim(),
      url: btn?.url || null,
    }));
    return {
      index: idx,
      body: String(cardBody?.text || fallbackBody || '').trim(),
      buttons: buttons.filter((b) => b.text),
      headerImageUrl,
    };
  };

  if (Array.isArray(carouselComp?.cards) && carouselComp.cards.length) {
    return {
      carouselMediaType,
      carouselCards: carouselComp.cards.map((card, idx) => mapCard(card, idx, '')),
    };
  }
  if (Array.isArray(vars.carouselCards) && vars.carouselCards.length) {
    return {
      carouselMediaType,
      carouselCards: vars.carouselCards.map((card, idx) =>
        mapCard(
          {
            components: [
              { type: 'HEADER', format: carouselMediaType },
              { type: 'BODY', text: card?.body || '' },
              {
                type: 'BUTTONS',
                buttons: (card?.buttons || []).map((b) => ({
                  type: 'URL',
                  text: b?.label || b?.text,
                  url: b?.url || b?.value,
                })),
              },
            ],
          },
          idx,
          card?.body
        )
      ),
    };
  }
  return { carouselMediaType, carouselCards: [] };
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

function extractCarouselPreviewFromPayload(payload, apiBase) {
  const components = payload?.template?.components;
  if (!Array.isArray(components)) return null;
  const carousel = components.find((c) => String(c?.type || '').toUpperCase() === 'CAROUSEL');
  if (!Array.isArray(carousel?.cards) || !carousel.cards.length) return null;

  let carouselMediaType = 'IMAGE';
  const carouselCards = carousel.cards.map((card, idx) => {
    const inner = Array.isArray(card?.components) ? card.components : [];
    const header = inner.find((c) => String(c?.type || '').toUpperCase() === 'HEADER');
    const body = inner.find((c) => String(c?.type || '').toUpperCase() === 'BODY');
    const buttonsComp = inner.find((c) => String(c?.type || '').toUpperCase() === 'BUTTONS');
    const param = header?.parameters?.[0];
    const ptype = String(param?.type || '').toLowerCase();
    let headerImageUrl = null;
    if (ptype === 'video') {
      carouselMediaType = 'VIDEO';
      const link = param?.video?.link;
      const id = param?.video?.id;
      if (link) headerImageUrl = resolvePublicMediaUrl(link, apiBase) || link;
      else if (id) {
        const base = String(apiBase || '').replace(/\/$/, '').replace(/\/api$/i, '');
        headerImageUrl = `${base}/api/media/whatsapp/${encodeURIComponent(String(id))}`;
      }
    } else if (ptype === 'image') {
      const link = param?.image?.link;
      const id = param?.image?.id;
      if (link) headerImageUrl = resolvePublicMediaUrl(link, apiBase) || link;
      else if (id) {
        const base = String(apiBase || '').replace(/\/$/, '').replace(/\/api$/i, '');
        headerImageUrl = `${base}/api/media/whatsapp/${encodeURIComponent(String(id))}`;
      }
    }
    const buttons = (buttonsComp?.buttons || []).map((btn, bi) => ({
      id: `card_${idx}_btn_${bi}`,
      type: String(btn?.type || 'URL').toUpperCase(),
      text: String(btn?.text || btn?.title || '').trim(),
      url: btn?.url || null,
    }));
    return {
      index: card.card_index != null ? card.card_index : idx,
      body: String(body?.text || body?.parameters?.[0]?.text || '').trim(),
      buttons: buttons.filter((b) => b.text),
      headerImageUrl,
    };
  });

  return { isCarousel: true, carouselMediaType, carouselCards };
}

function hydrateCarouselCardMediaForPreview(preview, snapshotSource) {
  if (!preview && !snapshotSource) return preview;
  const base = preview ? { ...preview } : {};
  const src = snapshotSource && typeof snapshotSource === 'object' ? snapshotSource : {};
  const previewCards = Array.isArray(base.carouselCards) ? base.carouselCards : [];
  const srcCards = Array.isArray(src.carouselCards) ? src.carouselCards : [];
  const isCarousel =
    Boolean(base.isCarousel || src.isCarousel) ||
    previewCards.length > 0 ||
    srcCards.length > 0;
  if (!isCarousel) return preview;

  const len = Math.max(previewCards.length, srcCards.length);
  const carouselCards = Array.from({ length: len }, (_, idx) => {
    const card = previewCards[idx] || {};
    const snap = srcCards[idx] || {};
    const raw = snap.headerImageUrl || snap.headerMediaPath || card.headerImageUrl || card.headerMediaPath;
    const displayUrl = raw ? resolvePublicMediaUrl(String(raw).trim()) || resolveDisplayableHeaderMediaUrl(raw) : null;
    return {
      ...card,
      ...snap,
      index: snap.index != null ? snap.index : card.index != null ? card.index : idx,
      body: String(snap.body || card.body || '').trim(),
      buttons: Array.isArray(snap.buttons) && snap.buttons.length ? snap.buttons : card.buttons || [],
      headerImageUrl: displayUrl || card.headerImageUrl || snap.headerImageUrl || null,
    };
  });

  return {
    ...base,
    isCarousel: true,
    carouselMediaType: base.carouselMediaType || src.carouselMediaType || 'IMAGE',
    header: null,
    headerImageUrl: null,
    headerFormat: null,
    carouselCards,
  };
}

function enrichPreviewHeaderOnly(preview, message, templateCatalog) {
  if (preview?.isCarousel || (Array.isArray(preview?.carouselCards) && preview.carouselCards.length)) {
    return hydrateCarouselCardMediaForPreview(preview, preview);
  }
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
        header: {
          type: resolveHeaderMediaType(preview.headerFormat, preview.header),
          url,
        },
        headerFormat: preview.headerFormat || templateTypeToHeaderFormat(hit?.variables?.templateType) || 'IMAGE',
      }
    : preview;
}

export function resolveTemplatePreviewButtons(template) {
  if (!template) return [];

  const components = getTemplateComponents(template);
  const buttonsBlock = components.find((c) => String(c.type || '').toUpperCase() === 'BUTTONS');
  const vars =
    template?.variables && typeof template.variables === 'object' && !Array.isArray(template.variables)
      ? template.variables
      : {};

  const fromComponents = (Array.isArray(buttonsBlock?.buttons) ? buttonsBlock.buttons : [])
    .map((btn) => ({
      type: String(btn.type || 'QUICK_REPLY').toUpperCase(),
      text: resolveButtonLabel(btn),
      url: btn.url,
      phone_number: btn.phone_number || btn.phoneNumber,
    }))
    .filter((b) => b.text);
  if (fromComponents.length) return fromComponents;

  if (Array.isArray(vars.interactiveButtons) && vars.interactiveButtons.length) {
    const fromInteractive = vars.interactiveButtons
      .map((btn) => ({
        type: String(btn.type || 'QUICK_REPLY').toUpperCase(),
        text: resolveButtonLabel(btn),
        url: btn.url,
        phone_number: btn.phone_number || btn.phoneNumber,
      }))
      .filter((b) => b.text);
    if (fromInteractive.length) return fromInteractive;
  }

  const buttons = [];
  const showCta = vars.actionMode === 'cta' || vars.actionMode === 'all';
  const showQr = vars.actionMode === 'quick_reply' || vars.actionMode === 'all';

  if (showCta && Array.isArray(vars.callToActions)) {
    vars.callToActions
      .filter((a) => {
        if (!String(a?.label || '').trim()) return false;
        if (a.type === 'button') return true;
        return Boolean(String(a?.value || '').trim());
      })
      .forEach((cta) => {
        if (cta.type === 'button') {
          buttons.push({ type: 'QUICK_REPLY', text: String(cta.label).trim() });
        } else if (cta.type === 'phone') {
          buttons.push({
            type: 'PHONE_NUMBER',
            text: String(cta.label).trim(),
            phone_number: String(cta.value || '').trim(),
          });
        } else {
          buttons.push({
            type: 'URL',
            text: String(cta.label).trim(),
            url: String(cta.value || '').trim(),
          });
        }
      });
  }

  if (showQr && Array.isArray(vars.quickReplies)) {
    vars.quickReplies
      .filter((a) => String(a?.label || '').trim())
      .forEach((qr) => buttons.push({ type: 'QUICK_REPLY', text: String(qr.label).trim() }));
  }

  return buttons;
}

export function buildTemplatePreview(template, message = {}) {
  if (!template) return null;

  const components = getTemplateComponents(template);
  const header = components.find((c) => String(c.type || '').toUpperCase() === 'HEADER');
  const body = components.find((c) => String(c.type || '').toUpperCase() === 'BODY');
  const footer = components.find((c) => String(c.type || '').toUpperCase() === 'FOOTER');

  const footerText = String(footer?.text || template?.variables?.footer || '').trim();

  const buttons = resolveTemplatePreviewButtons(template).map((btn, idx) => ({
    id: btn.id || `btn_${idx}`,
    text: btn.text,
    type: String(btn.type || 'QUICK_REPLY').toUpperCase(),
    value: btn.text || '',
    url: btn.url,
    phone_number: btn.phone_number,
  }));

  const varsTemplateType = template?.variables?.templateType;
  const headerFormat =
    String(header?.format || '').toUpperCase() ||
    templateTypeToHeaderFormat(varsTemplateType) ||
    null;
  const needsHeaderMedia =
    MEDIA_HEADER_FORMATS.has(headerFormat || '') ||
    ['image', 'video', 'document'].includes(String(varsTemplateType || '').toLowerCase()) ||
    Boolean(
      message.mediaUrl ||
        message.headerImageUrl ||
        template?.variables?.headerMediaUrl ||
        template?.variables?.header_media_url
    );
  const headerImageUrl = needsHeaderMedia
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
        header || (headerFormat ? { type: 'HEADER', format: headerFormat } : null),
        message
      )
    : null;
  const resolvedHeaderFormat = headerImageUrl ? headerFormat || templateTypeToHeaderFormat(varsTemplateType) || 'IMAGE' : headerFormat;
  const headerText =
    resolvedHeaderFormat === 'TEXT' && header?.text
      ? applyTemplateParamsToBody(header.text, message.templateParams)
      : null;

  const rawContent = message.content || message.message || '';
  const bodySource = isTemplateMarkerContent(rawContent) ? '' : rawContent;
  const isCarousel = templateIsCarousel(template);
  const introBodyText = isCarousel
    ? String(
        applyTemplateParamsToBody(body?.text, message.templateParams) ||
          body?.text ||
          template?.variables?.carouselMainBody ||
          template?.content ||
          ''
      ).trim()
    : '';

  const bodyText = isCarousel
    ? introBodyText
    : String(
        bodySource ||
          applyTemplateParamsToBody(body?.text, message.templateParams) ||
          body?.text ||
          template?.content ||
          ''
      ).trim();

  const carouselPreview = isCarousel ? buildCarouselPreviewCards(template, message) : null;

  return {
    headerFormat: isCarousel ? null : resolvedHeaderFormat,
    headerText: isCarousel ? null : headerText,
    headerImageUrl: isCarousel ? null : headerImageUrl,
    header: isCarousel
      ? null
      : headerImageUrl
        ? { type: resolveHeaderMediaType(resolvedHeaderFormat, null), url: headerImageUrl }
        : headerText
          ? { type: 'text', text: headerText }
          : resolvedHeaderFormat && MEDIA_HEADER_FORMATS.has(resolvedHeaderFormat)
            ? { type: resolveHeaderMediaType(resolvedHeaderFormat, null) }
            : null,
    body: bodyText,
    footer: isCarousel ? '' : footerText,
    buttons: isCarousel ? [] : buttons,
    templateName: template.name || message.templateName || null,
    isCarousel,
    carouselMediaType: carouselPreview?.carouselMediaType || null,
    carouselCards: carouselPreview?.carouselCards || undefined,
  };
}

function mergeSnapshotWithCatalog(snap, rebuilt) {
  if (!rebuilt) return snap;
  if (!snap) return rebuilt;
  const snapButtons = Array.isArray(snap.buttons) ? snap.buttons : [];
  const rebuiltButtons = Array.isArray(rebuilt.buttons) ? rebuilt.buttons : [];
  const snapCarousel = Array.isArray(snap.carouselCards) ? snap.carouselCards : [];
  const rebuiltCarousel = Array.isArray(rebuilt.carouselCards) ? rebuilt.carouselCards : [];
  const carouselCards =
    rebuiltCarousel.length > 0
      ? rebuiltCarousel.map((card, idx) => ({
          ...card,
          headerImageUrl: snapCarousel[idx]?.headerImageUrl || card.headerImageUrl || null,
        }))
      : snapCarousel;
  const headerImageUrl =
    snap.headerImageUrl || snap.header?.url || rebuilt.headerImageUrl || rebuilt.header?.url || null;
  return {
    ...rebuilt,
    ...snap,
    body: snap.body || rebuilt.body || '',
    headerText: snap.headerText || rebuilt.headerText || null,
    headerImageUrl,
    header: snap.header || rebuilt.header || (headerImageUrl ? { type: resolveHeaderMediaType(snap.headerFormat || rebuilt.headerFormat, snap.header || rebuilt.header), url: headerImageUrl } : null),
    headerFormat: snap.headerFormat || rebuilt.headerFormat || null,
    footer: snap.footer || rebuilt.footer || '',
    buttons: snapButtons.length ? snapButtons : rebuiltButtons,
    templateName: snap.templateName || rebuilt.templateName || null,
    isCarousel: Boolean(snap.isCarousel || rebuilt.isCarousel),
    carouselMediaType: snap.carouselMediaType || rebuilt.carouselMediaType || null,
    carouselCards,
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

    const fromPayload = extractCarouselPreviewFromPayload(message?.payload, getApiOrigin());
    if (fromPayload) {
      snap = hydrateCarouselCardMediaForPreview(
        { ...snap, ...fromPayload },
        typeof rawSnapshot === 'object' && rawSnapshot ? rawSnapshot : fromPayload
      );
    } else {
      snap = hydrateCarouselCardMediaForPreview(
        snap,
        typeof rawSnapshot === 'object' && rawSnapshot ? rawSnapshot : null
      );
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
  if (
    preview?.isCarousel ||
    (Array.isArray(preview?.carouselCards) && preview.carouselCards.length > 0)
  ) {
    return '';
  }
  const candidates = [
    message?.mediaUrl,
    message?.templatePreview?.headerImageUrl,
    message?.templateSnapshot?.headerImageUrl,
    message?.headerImageUrl,
    message?.header?.url,
    preview?.headerImageUrl,
    preview?.header?.url,
    message?.templatePreview?.header?.url,
    message?.templateSnapshot?.header?.url,
  ];

  for (const candidate of candidates) {
    const pub = resolveDisplayableHeaderMediaUrl(candidate);
    if (pub) return pub;
    const resolved = resolvePublicMediaUrl(candidate, apiBase);
    if (resolved) return resolved;
  }

  const payload = message?.payload;
  if (payload && typeof payload === 'object') {
    const templateComponents = payload?.template?.components;
    if (Array.isArray(templateComponents)) {
      for (const comp of templateComponents) {
        if (String(comp?.type || '').toLowerCase() !== 'header') continue;
        for (const param of comp.parameters || []) {
          const link = param?.image?.link || param?.video?.link || param?.document?.link;
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
    preview.isCarousel ||
      (Array.isArray(preview.carouselCards) && preview.carouselCards.length > 0) ||
      String(preview.headerText || '').trim() ||
      String(preview.body || '').trim() ||
      preview.headerImageUrl ||
      MEDIA_HEADER_FORMATS.has(String(preview.headerFormat || '').toUpperCase()) ||
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
