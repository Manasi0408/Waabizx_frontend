import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import BrandLogoMark from '../components/BrandLogoMark';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated, logout, readSessionUser } from '../services/authService';
import { getTemplates, getMetaTemplates, getMetaTemplateDetails, getTemplateById } from '../services/templateService';
import { getConversationQuota } from '../services/dashboardService';
import { startCampaign, calculateCampaignCost } from '../services/campaignService';
import { uploadBroadcastHeaderMedia } from '../services/broadcastService';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import FlowMediaAttachField from '../components/FlowMediaLibraryField';
import { resolvePublicMediaUrl, toPermanentUploadPath } from '../utils/mediaUrl';
import PlanLimitModal from '../components/PlanLimitModal';
import { extractPlanLimitError, assertCanAddResource } from '../services/planLimitService';

import { getApiOrigin } from '../utils/apiBase';

const API_BASE = getApiOrigin();

function resolveTemplateBillingCategory(template) {
  const meta = String(template?.metaCategory || template?.category || '').trim().toUpperCase();
  if (meta === 'AUTHENTICATION') return 'authentication';
  if (meta === 'UTILITY') return 'utility';
  if (meta === 'SERVICE') return 'service';
  return 'marketing';
}
const STEPS = [
  { id: 1, label: 'Campaign Name' },
  { id: 2, label: 'Upload CSV' },
  { id: 3, label: 'Create Message' },
  { id: 4, label: 'Schedule' },
  { id: 5, label: 'Preview & Send' },
];

const SEND_TEMPLATE_BLOCKED_MSG =
  'Not able to send template. Insufficient WCC credit or plan expired. Recharge to continue.';

const SCHEDULE_MAX_MONTHS = 2;

function maxScheduleDateTimeLocal() {
  const d = new Date();
  d.setMonth(d.getMonth() + SCHEDULE_MAX_MONTHS);
  return d.toISOString().slice(0, 16);
}

function minScheduleDateTimeLocal() {
  return new Date().toISOString().slice(0, 16);
}

async function prepareImageHeaderForUpload(file) {
  const mime = String(file.type || '').toLowerCase();
  const name = String(file.name || '');
  const isJpegOrPng =
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    mime === 'image/png' ||
    /\.(jpe?g|png)$/i.test(name);
  if (isJpegOrPng || typeof createImageBitmap !== 'function') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return file;
    const baseName = name.replace(/\.[^.]+$/, '') || 'header-image';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  }
}

function resolveStoredHeaderMediaUrl(...candidates) {
  for (const candidate of candidates) {
    const stored = toPermanentUploadPath(candidate);
    if (stored) return stored;
  }
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value && !value.startsWith('blob:') && value.startsWith('/uploads/')) return value;
  }
  return null;
}

async function resolveCampaignHeaderMediaForSend({ mediaFile, headerMediaUrl, mediaPreviewUrl, headerFormat }) {
  if (mediaFile) {
    const uploadFile =
      headerFormat !== 'VIDEO' && headerFormat !== 'DOCUMENT'
        ? await prepareImageHeaderForUpload(mediaFile)
        : mediaFile;
    const uploaded = await uploadBroadcastHeaderMedia(uploadFile);
    return (
      resolveStoredHeaderMediaUrl(uploaded.storedPath, uploaded.url) ||
      uploaded.url ||
      null
    );
  }
  return resolveStoredHeaderMediaUrl(headerMediaUrl, mediaPreviewUrl);
}

const MAP_ATTR_OPTIONS = [
  { value: '', label: '— Skip —' },
  { value: 'phone', label: 'phone number' },
  { value: 'name', label: 'user name' },
];

function getToken() {
  return localStorage.getItem('token');
}

function getProjectId() {
  try {
    const raw = localStorage.getItem('selectedProject');
    const p = raw ? JSON.parse(raw) : null;
    if (p?.id != null) return String(p.id);
  } catch (_) {
    /* ignore */
  }
  return null;
}

function buildAuthHeaders(json = true) {
  const headers = {};
  if (json) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const projectId = getProjectId();
  if (projectId) headers['x-project-id'] = projectId;
  return headers;
}

function extractTemplateVariables(template) {
  const body =
    template?.content ||
    (Array.isArray(template?.components)
      ? template.components.find((c) => c.type === 'BODY')?.text
      : '') ||
    '';
  const matches = String(body).match(/\{\{(\d+)\}\}/g) || [];
  const nums = [...new Set(matches.map((m) => parseInt(m.replace(/[{}]/g, ''), 10)))].sort((a, b) => a - b);
  return nums;
}

function parseTemplateVariablesMeta(variables) {
  if (!variables) return {};
  if (typeof variables === 'string') {
    try {
      return JSON.parse(variables);
    } catch {
      return {};
    }
  }
  return typeof variables === 'object' && !Array.isArray(variables) ? variables : {};
}

function templateHasMedia(template) {
  if (Array.isArray(template?.components)) {
    return template.components.some(
      (c) =>
        String(c.type || '').toUpperCase() === 'HEADER' &&
        ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(c.format || '').toUpperCase())
    );
  }
  const meta = parseTemplateVariablesMeta(template?.variables);
  const templateType = String(meta.templateType || '').toLowerCase();
  if (['image', 'video', 'document'].includes(templateType)) return true;
  return /\[image\]|\[video\]|\[document\]/i.test(String(template?.content || ''));
}

function templateNeedsCarouselMedia(template) {
  if (!templateIsCarousel(template)) return false;
  const cards = getTemplatePreviewParts(template)?.carouselCards;
  return Array.isArray(cards) && cards.length > 0;
}

function carouselCardMediaReady(template, carouselCardMediaUrls) {
  if (!templateNeedsCarouselMedia(template)) return true;
  const count = getTemplatePreviewParts(template)?.carouselCards?.length || 0;
  const urls = Array.isArray(carouselCardMediaUrls) ? carouselCardMediaUrls : [];
  for (let i = 0; i < count; i += 1) {
    if (!resolveStoredHeaderMediaUrl(urls[i])) return false;
  }
  return true;
}

function normalizeTemplateButtons(buttons) {
  return (buttons || [])
    .map((b) => {
      if (typeof b === 'string') return { type: 'QUICK_REPLY', text: b };
      const rawType = String(b?.type || 'QUICK_REPLY').toUpperCase();
      return {
        type: rawType === 'PHONE' ? 'PHONE_NUMBER' : rawType,
        text: b?.text || b?.title || b?.label || '',
        url: b?.url,
        phone_number: b?.phone_number || b?.phoneNumber,
      };
    })
    .filter((b) => String(b.text || '').trim());
}

function getCarouselCardsFromComponents(components) {
  const carousel = (components || []).find(
    (c) => String(c?.type || '').toUpperCase() === 'CAROUSEL'
  );
  return Array.isArray(carousel?.cards) ? carousel.cards : [];
}

function synthesizeCarouselComponentsFromVars(template) {
  const meta = parseTemplateVariablesMeta(template?.variables);
  const storedCards = Array.isArray(meta.carouselCards) ? meta.carouselCards : [];
  const isCarousel =
    String(meta.templateType || '').toLowerCase() === 'carousel' || storedCards.length > 0;
  if (!isCarousel || !storedCards.length) return null;

  const carouselMediaType = String(meta.carouselMediaType || 'IMAGE').toUpperCase();
  const headerFormat = carouselMediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE';
  const introBody = String(meta.carouselMainBody || template?.content || '').trim();
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

function getTemplateComponentsList(template) {
  if (Array.isArray(template?.components) && template.components.length) {
    if (getCarouselCardsFromComponents(template.components).length) {
      return template.components;
    }
    const synth = synthesizeCarouselComponentsFromVars(template);
    if (synth?.length) return synth;
    return template.components;
  }
  const meta = parseTemplateVariablesMeta(template?.variables);
  if (Array.isArray(meta.components) && meta.components.length) {
    if (getCarouselCardsFromComponents(meta.components).length) return meta.components;
    const synth = synthesizeCarouselComponentsFromVars(template);
    if (synth?.length) return synth;
    return meta.components;
  }
  const synth = synthesizeCarouselComponentsFromVars(template);
  return synth?.length ? synth : [];
}

function extractButtonsFromComponents(components) {
  const buttons = [];
  (components || []).forEach((comp) => {
    const type = String(comp?.type || '').toUpperCase();
    if (type === 'BUTTONS' && Array.isArray(comp.buttons)) {
      buttons.push(...comp.buttons);
    }
  });
  return normalizeTemplateButtons(buttons);
}

function buildInteractiveButtonsFromMeta(meta) {
  if (!meta || typeof meta !== 'object') return [];

  if (Array.isArray(meta.interactiveButtons) && meta.interactiveButtons.length) {
    return normalizeTemplateButtons(meta.interactiveButtons);
  }

  const buttons = [];
  const showCta = meta.actionMode === 'cta' || meta.actionMode === 'all';
  const showQr = meta.actionMode === 'quick_reply' || meta.actionMode === 'all';

  if (showCta && Array.isArray(meta.callToActions)) {
    meta.callToActions
      .filter((a) => {
        if (!String(a?.label || '').trim()) return false;
        if (a.type === 'button') return true;
        return Boolean(String(a?.value || '').trim());
      })
      .forEach((cta) => {
        if (cta.type === 'button') {
          buttons.push({ type: 'QUICK_REPLY', text: cta.label });
        } else {
          buttons.push({
            type: cta.type === 'phone' ? 'PHONE_NUMBER' : 'URL',
            text: cta.label,
            url: cta.type === 'url' ? cta.value : undefined,
            phone_number: cta.type === 'phone' ? cta.value : undefined,
          });
        }
      });
  }
  if (showQr && Array.isArray(meta.quickReplies)) {
    meta.quickReplies
      .filter((a) => String(a?.label || '').trim())
      .forEach((qr) => buttons.push({ type: 'QUICK_REPLY', text: qr.label }));
  }

  return normalizeTemplateButtons(buttons);
}

function mergeTemplateButtons(componentButtons, metaButtons) {
  const fromComponents = normalizeTemplateButtons(componentButtons);
  if (!metaButtons.length) return fromComponents;
  if (!fromComponents.length) return metaButtons;

  const merged = [...fromComponents];
  const seen = new Set(
    fromComponents.map((b) => `${String(b.type).toUpperCase()}::${String(b.text).toLowerCase()}`)
  );
  metaButtons.forEach((btn) => {
    const key = `${String(btn.type).toUpperCase()}::${String(btn.text).toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(btn);
    }
  });
  return merged;
}

async function resolveCampaignTemplate(template) {
  if (!template) return null;

  let resolved = { ...template };
  resolved.variables = parseTemplateVariablesMeta(resolved.variables);

  if (!Array.isArray(resolved.components) || !resolved.components.length) {
    const fromVars = resolved.variables?.components;
    if (Array.isArray(fromVars) && fromVars.length) {
      resolved.components = fromVars;
    }
  }

  const previewParts = getTemplatePreviewParts(resolved);
  const needsButtons = !previewParts?.buttons?.length;
  const needsCarousel =
    templateIsCarousel(resolved) &&
    !(Array.isArray(previewParts?.carouselCards) && previewParts.carouselCards.length);

  if (resolved.id && (needsButtons || needsCarousel)) {
    try {
      const full = await getTemplateById(resolved.id);
      if (full) {
        const fullVars = parseTemplateVariablesMeta(full.variables);
        resolved = {
          ...resolved,
          ...full,
          variables: { ...resolved.variables, ...fullVars },
          components: full.components || fullVars.components || resolved.components,
          metaTemplateId: full.metaTemplateId || resolved.metaTemplateId,
        };
      }
    } catch (_) {
      /* optional */
    }
  }

  const afterFetch = getTemplatePreviewParts(resolved);
  if (afterFetch?.buttons?.length) return resolved;
  if (
    templateIsCarousel(resolved) &&
    Array.isArray(afterFetch?.carouselCards) &&
    afterFetch.carouselCards.length
  ) {
    return resolved;
  }

  const metaId = resolved.metaTemplateId;
  if (!metaId) return resolved;

  try {
    const details = await getMetaTemplateDetails(metaId);
    if (!details?.components?.length) return resolved;
    const header = details.components.find((c) => String(c.type || '').toUpperCase() === 'HEADER');
    const format = String(header?.format || '').toUpperCase();
    const templateType =
      format === 'IMAGE' ? 'image' : format === 'VIDEO' ? 'video' : format === 'DOCUMENT' ? 'document' : 'text';
    return {
      ...resolved,
      language: details.language || resolved.language,
      components: details.components,
      content:
        details.components.find((c) => String(c.type || '').toUpperCase() === 'BODY')?.text ||
        resolved.content,
      variables: {
        ...parseTemplateVariablesMeta(resolved.variables),
        templateType,
        language: details.language || resolved.variables?.language,
        components: details.components,
      },
    };
  } catch (_) {
    return resolved;
  }
}

function buildCarouselPreviewCardsFromTemplate(template) {
  const meta = parseTemplateVariablesMeta(template?.variables);
  const components = getTemplateComponentsList(template);
  const carouselComp = components.find((c) => String(c?.type || '').toUpperCase() === 'CAROUSEL');
  let carouselMediaType = String(meta.carouselMediaType || 'IMAGE').toUpperCase();

  const mapCardDef = (cardDef, idx, fallbackBody) => {
    const inner = Array.isArray(cardDef?.components) ? cardDef.components : [];
    const cardHeader = inner.find((c) => String(c?.type || '').toUpperCase() === 'HEADER');
    const cardBody = inner.find((c) => String(c?.type || '').toUpperCase() === 'BODY');
    const cardButtonsComp = inner.find((c) => String(c?.type || '').toUpperCase() === 'BUTTONS');
    if (cardHeader?.format) {
      carouselMediaType = String(cardHeader.format).toUpperCase();
    }
    return {
      index: idx,
      body: String(cardBody?.text || fallbackBody || '').trim(),
      headerImageUrl: null,
      buttons: normalizeTemplateButtons(cardButtonsComp?.buttons || cardDef?.buttons || []),
    };
  };

  const metaCards = Array.isArray(carouselComp?.cards) ? carouselComp.cards : [];
  if (metaCards.length) {
    return {
      carouselMediaType,
      carouselCards: metaCards.map((card, idx) => mapCardDef(card, idx, '')),
    };
  }
  const stored = Array.isArray(meta.carouselCards) ? meta.carouselCards : [];
  if (stored.length) {
    return {
      carouselMediaType,
      carouselCards: stored.map((card, idx) =>
        mapCardDef(
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

function templateIsCarousel(template) {
  if (!template) return false;
  const meta = parseTemplateVariablesMeta(template.variables);
  if (String(meta.templateType || '').toLowerCase() === 'carousel') return true;
  if (Array.isArray(meta.carouselCards) && meta.carouselCards.length) return true;
  return getCarouselCardsFromComponents(getTemplateComponentsList(template)).length > 0;
}

function getTemplatePreviewParts(template) {
  if (!template) return null;

  const meta = parseTemplateVariablesMeta(template.variables);
  const components = getTemplateComponentsList(template);
  const metaButtons = buildInteractiveButtonsFromMeta(meta);
  const componentButtons = extractButtonsFromComponents(components);

  const findComp = (type) =>
    components.find((c) => String(c.type || '').toUpperCase() === type);
  const header = findComp('HEADER');
  const body = findComp('BODY');
  const footerComp = findComp('FOOTER');
  const isCarousel = templateIsCarousel(template);

  if (isCarousel) {
    const carouselPreview = buildCarouselPreviewCardsFromTemplate(template);
    const introBody = String(
      body?.text || meta.carouselMainBody || template?.content || ''
    ).trim();
    return {
      headerFormat: null,
      headerText: '',
      body: introBody,
      footer: '',
      buttons: [],
      isCarousel: true,
      carouselMediaType: carouselPreview.carouselMediaType || 'IMAGE',
      carouselCards: carouselPreview.carouselCards || [],
    };
  }

  const bodyText = body?.text || template?.content || '';
  const buttons = mergeTemplateButtons(componentButtons, metaButtons);
  const templateType = String(meta.templateType || 'text').toLowerCase();
  const headerFormat =
    (header?.format ? String(header.format).toUpperCase() : null) ||
    ({ image: 'IMAGE', video: 'VIDEO', document: 'DOCUMENT' }[templateType] || null);

  return {
    headerFormat,
    headerText: header?.text || '',
    body: bodyText,
    footer: footerComp?.text || meta.footer || '',
    buttons: normalizeTemplateButtons(buttons),
    isCarousel: false,
    carouselMediaType: null,
    carouselCards: [],
  };
}

function autoMapCsvColumns(columns) {
  const mapping = {};
  columns.forEach((col) => {
    const k = String(col).toLowerCase();
    if (/phone|mobile|msisdn|number/.test(k)) mapping[col] = 'phone';
    else if (/name|customer/.test(k)) mapping[col] = 'name';
    else mapping[col] = '';
  });
  return mapping;
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function looksLikePhoneValue(value) {
  return digitsOnly(value).length >= 10;
}

function inferVariableSlots(bodyText, variableNums) {
  const body = String(bodyText || '');
  const slots = {};
  variableNums.forEach((n) => {
    const idx = body.indexOf(`{{${n}}}`);
    const before = idx >= 0 ? body.slice(Math.max(0, idx - 30), idx).toLowerCase() : '';
    const after = idx >= 0 ? body.slice(idx + `{{${n}}}`.length, idx + `{{${n}}}`.length + 30).toLowerCase() : '';
    const window = `${before} ${after}`;
    if (/\b(hi|hello|dear|hey|namaste)\b/.test(before) || /\b(name|customer|user)\b/.test(window)) {
      slots[n] = 'name';
    } else if (/\b(phone|mobile|msisdn|contact)\b/.test(window)) {
      slots[n] = 'phone';
    } else {
      slots[n] = 'text';
    }
  });
  return slots;
}

function resolveVarFromField(field, row, columnMapping, fallback = {}) {
  if (!field) return '';
  if (field === 'name') {
    const nameCol = Object.keys(columnMapping || {}).find((k) => columnMapping[k] === 'name');
    if (nameCol && row?.[nameCol] != null) return String(row[nameCol]);
    return fallback.name || '';
  }
  if (field === 'phone') {
    const phoneCol = Object.keys(columnMapping || {}).find((k) => columnMapping[k] === 'phone');
    if (phoneCol && row?.[phoneCol] != null) return digitsOnly(row[phoneCol]);
    return fallback.phone || '';
  }
  if (row && row[field] != null) return String(row[field]);
  return '';
}

function applyPreviewSubstitutions(text, templateVarMap, templateVarCustom, row, columnMapping, fallback) {
  let out = String(text || '');
  const keys = new Set([
    ...Object.keys(templateVarMap || {}),
    ...Object.keys(templateVarCustom || {}),
  ]);
  keys.forEach((key) => {
    const custom = String(templateVarCustom?.[key] ?? '').trim();
    const field = templateVarMap?.[key];
    const value = custom || resolveVarFromField(field, row, columnMapping, fallback);
    if (value) {
      out = out.split(`{{${key}}}`).join(value);
    }
  });
  return out;
}

function buildVariableMapping(templateVarMap, templateVarCustom) {
  const out = {};
  Object.entries(templateVarMap || {}).forEach(([num, field]) => {
    const custom = String(templateVarCustom?.[num] ?? '').trim();
    if (custom) out[num] = { type: 'literal', value: custom };
    else if (field) out[num] = field;
  });
  return out;
}

function buildAudienceRows(csvRows, columnMapping, templateVarMap, templateVarCustom) {
  const phoneCol =
    Object.keys(columnMapping).find((k) => columnMapping[k] === 'phone') ||
    (csvRows[0]?.phone != null ? 'phone' : null);

  return csvRows
    .map((row) => {
      let phone = '';
      if (phoneCol && row[phoneCol] != null) phone = String(row[phoneCol]);
      else if (row.phone) phone = String(row.phone);
      phone = digitsOnly(phone);
      if (!phone || phone.length < 10) return null;

      const aud = { phone, var1: null, var2: null, var3: null, var4: null, var5: null };
      [1, 2, 3, 4, 5].forEach((n) => {
        const key = String(n);
        const custom = String(templateVarCustom?.[key] ?? '').trim();
        if (custom) {
          aud[`var${n}`] = custom;
          return;
        }
        const field = templateVarMap[key];
        if (!field) return;
        aud[`var${n}`] = resolveVarFromField(field, row, columnMapping, { phone });
      });
      return aud;
    })
    .filter(Boolean);
}

function validateTemplateVariables(template, templateVarMap, templateVarCustom, columnMapping, csvRows) {
  if (!template) return { valid: false, errors: {} };
  const vars = extractTemplateVariables(template);
  const parts = getTemplatePreviewParts(template);
  const slots = inferVariableSlots(parts.body, vars);
  const firstRow = csvRows[0] || {};
  const nameCol = Object.keys(columnMapping).find((k) => columnMapping[k] === 'name');
  const phoneCol = Object.keys(columnMapping).find((k) => columnMapping[k] === 'phone');
  const fallback = {
    name: nameCol && firstRow[nameCol] != null ? String(firstRow[nameCol]) : 'Alex',
    phone: phoneCol && firstRow[phoneCol] != null ? digitsOnly(firstRow[phoneCol]) : '9876543210',
  };
  const errors = {};
  vars.forEach((n) => {
    const key = String(n);
    const custom = String(templateVarCustom?.[key] ?? '').trim();
    const field = templateVarMap[key];
    if (!custom && !field) {
      errors[key] = 'Map a field or enter a sample value';
      return;
    }
    const value = custom || resolveVarFromField(field, firstRow, columnMapping, fallback);
    if (!String(value).trim()) {
      errors[key] = 'Enter a sample value for preview';
      return;
    }
    if (slots[n] === 'name' && looksLikePhoneValue(value)) {
      errors[key] = 'This placeholder expects a name, not a phone number';
    }
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

async function uploadBroadcastCsv(file) {
  const formData = new FormData();
  formData.append('csvFile', file);
  const res = await fetch(`${API_BASE}/api/broadcast/upload-csv`, {
    method: 'POST',
    headers: buildAuthHeaders(false),
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || data.error || 'Failed to upload CSV');
  if (!data.success) throw new Error(data.message || 'Failed to upload CSV');
  return data;
}

async function createCampaignApi(payload) {
  const res = await fetch(`${API_BASE}/api/campaigns`, {
    method: 'POST',
    headers: buildAuthHeaders(),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || data.error || 'Failed to create campaign');
    err.response = { data };
    throw err;
  }
  return data;
}

function Stepper({ step }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2 py-6 px-2">
      {STEPS.map((s, idx) => {
        const done = step > s.id;
        const active = step === s.id;
        return (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center min-w-[4.5rem] sm:min-w-[5.5rem]">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all duration-300 shadow-sm ${
                  done
                    ? 'bg-gradient-to-br from-sky-500 to-sky-700 border-sky-600 text-white shadow-sky-500/30'
                    : active
                      ? 'bg-gradient-to-br from-sky-600 to-blue-800 border-sky-700 text-white shadow-sky-600/40 ring-2 ring-sky-200/80'
                      : 'bg-white border-gray-200 text-gray-400'
                }`}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className={`w-2 h-2 rounded-full ${active ? 'bg-white' : 'bg-gray-300'}`} />
                )}
              </div>
              <span
                className={`mt-2 text-[10px] sm:text-xs font-medium text-center leading-tight ${
                  active || done ? 'text-sky-800' : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={`hidden sm:block w-8 md:w-14 h-0.5 mx-1 mb-6 rounded-full transition-colors ${
                  step > s.id ? 'bg-gradient-to-r from-sky-400 to-sky-600' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function templateHeaderMediaSlotActive(headerFormat, mediaPreviewUrl) {
  const format = String(headerFormat || '').toUpperCase();
  return ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format) || Boolean(mediaPreviewUrl);
}

function renderTemplateHeaderMediaPreview(headerFormat, mediaPreviewUrl) {
  const format = String(headerFormat || '').toUpperCase();
  if (mediaPreviewUrl) {
    if (format === 'VIDEO') {
      return (
        <video
          src={mediaPreviewUrl}
          className="w-full h-full object-cover"
          controls
          muted
          playsInline
        />
      );
    }
    if (format === 'DOCUMENT') {
      const name = decodeURIComponent(
        String(mediaPreviewUrl).split('/').pop()?.split('?')[0] || 'document.pdf'
      );
      return (
        <div className="flex flex-col items-center justify-center gap-1 px-3 text-center text-gray-600">
          <span className="text-2xl" aria-hidden>
            📄
          </span>
          <span className="text-xs font-medium break-all">{name}</span>
        </div>
      );
    }
    return <img src={mediaPreviewUrl} alt="" className="w-full h-full object-cover" />;
  }
  const label =
    format === 'VIDEO' ? 'Video header' : format === 'DOCUMENT' ? 'Document header' : 'Media header';
  const icon = format === 'VIDEO' ? '🎬' : format === 'DOCUMENT' ? '📄' : '🖼';
  return (
    <div className="flex flex-col items-center justify-center gap-1 text-gray-400">
      <span className="text-xl" aria-hidden>
        {icon}
      </span>
      <span className="text-xs">{label}</span>
    </div>
  );
}

function headerMediaHint(format) {
  const f = String(format || '').toUpperCase();
  if (f === 'VIDEO') return 'Choose from Media Library. Use MP4 (up to 1 GB).';
  if (f === 'DOCUMENT') return 'Choose from Media Library. Use PDF.';
  return 'Choose from Media Library. For images use JPEG or PNG under 5MB.';
}

function CampaignCarouselCardsPreview({ parts, compact = false }) {
  const carouselMediaType = String(parts?.carouselMediaType || 'IMAGE').toUpperCase();
  const carouselMediaLabel = carouselMediaType === 'VIDEO' ? 'Video' : 'Image';
  const carouselCards = Array.isArray(parts?.carouselCards) ? parts.carouselCards : [];
  if (!carouselCards.length) return null;

  const cardWidth = compact ? 'w-[96px]' : 'w-[118px]';
  const mediaHeight = compact ? 'h-14' : 'h-[4.5rem]';

  return (
    <div className={compact ? 'mt-2' : 'px-3 pb-3 border-t border-gray-100 pt-2'}>
      {!compact ? (
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
          {carouselMediaLabel} cards
        </p>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {carouselCards.map((card, idx) => {
          const cardUrl = resolvePublicMediaUrl(card?.headerImageUrl || '');
          const cardButtons = Array.isArray(card.buttons) ? card.buttons : [];
          return (
            <div
              key={card.index ?? idx}
              className={`shrink-0 ${cardWidth} rounded-lg border border-gray-200 bg-gray-50 overflow-hidden`}
            >
              {cardUrl ? (
                carouselMediaType === 'VIDEO' ? (
                  <video
                    src={cardUrl}
                    className={`w-full ${mediaHeight} object-cover bg-black/5`}
                    muted
                    playsInline
                  />
                ) : (
                  <img src={cardUrl} alt="" className={`w-full ${mediaHeight} object-cover bg-gray-100`} />
                )
              ) : (
                <div
                  className={`w-full ${mediaHeight} flex items-center justify-center text-[10px] font-semibold uppercase text-gray-400 bg-gray-100`}
                >
                  {carouselMediaLabel} {idx + 1}
                </div>
              )}
              <div className="px-2 py-1.5 space-y-0.5">
                {card.body ? (
                  <p className="text-[10px] text-gray-800 line-clamp-3 whitespace-pre-wrap break-words">
                    {card.body}
                  </p>
                ) : null}
                {cardButtons.slice(0, 2).map((btn, bi) => (
                  <p key={bi} className="text-[9px] font-semibold text-[#008069] truncate text-center">
                    {btn.text || btn.label || 'Button'}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WhatsAppPreview({
  template,
  mediaPreviewUrl,
  carouselCardMediaUrls,
  templateVarMap = {},
  templateVarCustom = {},
  columnMapping = {},
  csvRows = [],
  previewFallback = {},
}) {
  const parts = getTemplatePreviewParts(template);
  const isCarousel = Boolean(parts?.isCarousel);
  const cardUrls = Array.isArray(carouselCardMediaUrls) ? carouselCardMediaUrls : [];
  const firstRow = csvRows[0] || {};
  const applySub = (text) =>
    applyPreviewSubstitutions(
      text,
      templateVarMap,
      templateVarCustom,
      firstRow,
      columnMapping,
      previewFallback
    );
  const bodyText = applySub(parts.body);
  const headerText = parts.headerText ? applySub(parts.headerText) : '';
  const displayParts = isCarousel
    ? {
        ...parts,
        body: bodyText,
        carouselCards: (parts.carouselCards || []).map((card, idx) => ({
          ...card,
          body: applySub(card.body),
          headerImageUrl:
            resolvePublicMediaUrl(cardUrls[idx] || card.headerImageUrl || '') ||
            card.headerImageUrl ||
            '',
        })),
      }
    : parts;

  return (
    <div className="mx-auto w-full max-w-[280px] rounded-2xl border border-sky-100/80 bg-[#e5ddd5] shadow-xl shadow-sky-900/10 ring-1 ring-sky-100/50 overflow-hidden">
      <div className="bg-[#075e54] text-white text-xs px-3 py-2 flex items-center gap-2">
        <BrandLogoMark size="xs" tone="contrast" />
        <span className="font-medium">WhatsApp Preview</span>
      </div>
      <div className="p-3 max-h-[420px] overflow-y-auto">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden text-sm text-gray-900">
          {!isCarousel && templateHeaderMediaSlotActive(parts.headerFormat, mediaPreviewUrl) && (
            <div className="bg-gray-100 aspect-video flex items-center justify-center overflow-hidden">
              {renderTemplateHeaderMediaPreview(parts.headerFormat, mediaPreviewUrl)}
            </div>
          )}
          {headerText && !mediaPreviewUrl && parts.headerFormat === 'TEXT' && (
            <p className="px-3 pt-2 font-semibold text-gray-900">{headerText}</p>
          )}
          {bodyText || !isCarousel ? (
            <div className="px-3 py-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
              {bodyText || (isCarousel ? '' : 'Template body')}
            </div>
          ) : null}
          {isCarousel ? <CampaignCarouselCardsPreview parts={displayParts} /> : null}
          {parts.footer && (
            <p className="px-3 pb-2 text-[11px] text-gray-500">{parts.footer}</p>
          )}
          {!isCarousel && parts.buttons?.length > 0 && (
            <div className="border-t border-gray-100">
              {parts.buttons.map((btn, i) => (
                <div
                  key={i}
                  className="text-center text-sky-600 text-sm font-medium py-2 border-b border-gray-50 last:border-0"
                >
                  {btn.text || btn.type}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateCampaignPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const [campaignName, setCampaignName] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [csvRows, setCsvRows] = useState([]);
  const [csvColumns, setCsvColumns] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [uploadingCsv, setUploadingCsv] = useState(false);

  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateLanguage, setTemplateLanguage] = useState('en_US');
  const [templateVarMap, setTemplateVarMap] = useState({});
  const [templateVarCustom, setTemplateVarCustom] = useState({});
  const [mediaFile, setMediaFile] = useState(null);
  const [headerMediaUrl, setHeaderMediaUrl] = useState('');
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [carouselCardMediaUrls, setCarouselCardMediaUrls] = useState([]);
  const [resolvingTemplate, setResolvingTemplate] = useState(false);

  const [scheduleTime, setScheduleTime] = useState('');
  const [excludeOptedOut, setExcludeOptedOut] = useState(true);
  const [wccCredits, setWccCredits] = useState(null);
  const [planInfo, setPlanInfo] = useState(null);
  const [planInfoLoaded, setPlanInfoLoaded] = useState(false);
  const [planLimitModal, setPlanLimitModal] = useState(null);
  const [costEstimate, setCostEstimate] = useState(null);
  const [costBreakdown, setCostBreakdown] = useState([]);
  const [costCategory, setCostCategory] = useState('');
  const [remainingBalance, setRemainingBalance] = useState(null);
  const [costLoading, setCostLoading] = useState(false);

  const handleSelectTemplate = async (t) => {
    setSelectedTemplate(t);
    setTemplateSearch(t.name);
    setHeaderMediaUrl('');
    setMediaPreviewUrl('');
    setMediaFile(null);
    setCarouselCardMediaUrls([]);
    const lang =
      t.language ||
      parseTemplateVariablesMeta(t.variables)?.language;
    if (lang) setTemplateLanguage(String(lang));

    setResolvingTemplate(true);
    try {
      const resolved = await resolveCampaignTemplate(t);
      if (resolved) {
        setSelectedTemplate(resolved);
        const resolvedLang =
          resolved.language ||
          parseTemplateVariablesMeta(resolved.variables)?.language;
        if (resolvedLang) setTemplateLanguage(String(resolvedLang));
        const carouselParts = getTemplatePreviewParts(resolved);
        const cardCount = templateNeedsCarouselMedia(resolved)
          ? (carouselParts?.carouselCards?.length || 0)
          : 0;
        setCarouselCardMediaUrls(Array.from({ length: cardCount }, () => ''));
      }
    } catch (_) {
      /* keep basic template */
    } finally {
      setResolvingTemplate(false);
    }
  };

  const templateVariables = useMemo(
    () => (selectedTemplate ? extractTemplateVariables(selectedTemplate) : []),
    [selectedTemplate]
  );

  const previewFallback = useMemo(() => {
    const firstRow = csvRows[0] || {};
    const nameCol = Object.keys(columnMapping).find((k) => columnMapping[k] === 'name');
    const phoneCol = Object.keys(columnMapping).find((k) => columnMapping[k] === 'phone');
    return {
      name: nameCol && firstRow[nameCol] != null ? String(firstRow[nameCol]) : 'Alex',
      phone: phoneCol && firstRow[phoneCol] != null ? digitsOnly(firstRow[phoneCol]) : '9876543210',
    };
  }, [csvRows, columnMapping]);

  const step3Validation = useMemo(
    () => validateTemplateVariables(selectedTemplate, templateVarMap, templateVarCustom, columnMapping, csvRows),
    [selectedTemplate, templateVarMap, templateVarCustom, columnMapping, csvRows]
  );

  const step3Valid = !!selectedTemplate && step3Validation.valid;

  const audienceCount = csvRows.length;
  const estimatedCost = costEstimate != null ? Number(costEstimate) : 0;
  const wccInsufficient =
    (costEstimate != null && Number(wccCredits ?? 0) < estimatedCost) ||
    (wccCredits != null && Number(wccCredits) <= 0);
  const planExpired = planInfoLoaded && !planInfo?.active;
  const sendTemplateBlocked = planExpired || wccInsufficient;
  const wccSufficient = !wccInsufficient;
  const canSendTemplate = !sendTemplateBlocked;

  useEffect(() => {
    if (!csvRows.length || !selectedTemplate) {
      setCostEstimate(null);
      setCostBreakdown([]);
      setCostCategory('');
      setRemainingBalance(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setCostLoading(true);
      try {
        const audience = buildAudienceRows(csvRows, columnMapping, templateVarMap, templateVarCustom);
        const data = await calculateCampaignCost({
          contacts: audience,
          category: resolveTemplateBillingCategory(selectedTemplate),
          currency: 'INR',
        });
        if (!cancelled) {
          setCostEstimate(Number(data.totalAmount) || 0);
          setCostBreakdown(Array.isArray(data.countries) ? data.countries : []);
          setCostCategory(String(data.category || resolveTemplateBillingCategory(selectedTemplate) || ''));
          if (data.balance != null) setWccCredits(Number(data.balance));
          if (data.remainingBalance != null) setRemainingBalance(Number(data.remainingBalance));
        }
      } catch (_) {
        if (!cancelled) {
          setCostEstimate(null);
          setCostBreakdown([]);
          setCostCategory('');
          setRemainingBalance(null);
        }
      } finally {
        if (!cancelled) setCostLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [csvRows, columnMapping, templateVarMap, templateVarCustom, selectedTemplate]);

  const scheduledDate = scheduleTime ? new Date(scheduleTime) : null;
  const isFutureSchedule = Boolean(scheduledDate && scheduledDate.getTime() > Date.now());

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => String(t.name || '').toLowerCase().includes(q));
  }, [templates, templateSearch]);

  const csvAttrOptions = useMemo(() => {
    const extra = csvColumns
      .filter((c) => c && c !== 'phone')
      .map((c) => ({ value: c, label: c }));
    return [...MAP_ATTR_OPTIONS, ...extra];
  }, [csvColumns]);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const local = await getTemplates({ status: 'approved', limit: 200 });
      let list = local.templates || [];
      try {
        const meta = await getMetaTemplates();
        const approved = (meta || []).filter(
          (t) => String(t.status || t.metaStatus || '').toUpperCase() === 'APPROVED'
        );
        const names = new Set(list.map((t) => String(t.name).toLowerCase()));
        approved.forEach((t) => {
          if (!names.has(String(t.name).toLowerCase())) {
            list.push({
              name: t.name,
              content: t.components?.find((c) => c.type === 'BODY')?.text || '',
              components: t.components,
              language: t.language,
              status: 'approved',
            });
          }
        });
      } catch (_) {
        /* meta optional */
      }
      setTemplates(list);
    } catch (e) {
      setError(e.message || 'Failed to load templates');
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (!isAuthenticated()) {
        navigate('/login');
        return;
      }
      try {
        const u = await getProfile();
        setUser(u);
        if (u?.id) {
          try {
            const q = await getConversationQuota(u.id);
            setWccCredits(Number(q.wccCredits ?? 0));
            setPlanInfo(q?.planInfo ?? null);
            setPlanInfoLoaded(true);
          } catch (_) {
            setWccCredits(null);
            setPlanInfo(null);
            setPlanInfoLoaded(true);
          }
        }
      } catch (_) {
        logout();
        navigate('/login');
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  useEffect(() => {
    if (step === 3 && templates.length === 0) loadTemplates();
  }, [step, templates.length, loadTemplates]);

  useEffect(() => {
    if (step === 5 && user?.id) {
      getConversationQuota(user.id)
        .then((q) => {
          setWccCredits(Number(q.wccCredits ?? 0));
          setPlanInfo(q?.planInfo ?? null);
          setPlanInfoLoaded(true);
        })
        .catch(() => {
          setPlanInfo(null);
          setPlanInfoLoaded(true);
        });
    }
  }, [step, user?.id]);

  useEffect(() => {
    if (!selectedTemplate) return;
    const vars = extractTemplateVariables(selectedTemplate);
    const next = {};
    vars.forEach((n, i) => {
      if (n === 1) next['1'] = 'name';
      else if (n === 2) next['2'] = 'phone';
      else {
        const col = csvColumns.find((c) => columnMapping[c] && columnMapping[c] !== 'phone') || csvColumns[i];
        next[String(n)] = col || '';
      }
    });
    setTemplateVarMap(next);
    setTemplateVarCustom({});
    setTemplateLanguage(selectedTemplate.language || 'en_US');
    setMediaFile(null);
    setHeaderMediaUrl('');
    setMediaPreviewUrl('');
  }, [selectedTemplate, csvColumns, columnMapping]);

  const handleHeaderMediaLibraryChange = ({ mediaUrl: storedUrl }) => {
    const stored = toPermanentUploadPath(storedUrl) || storedUrl;
    const previewUrl = resolvePublicMediaUrl(stored) || storedUrl;
    setMediaFile(null);
    setHeaderMediaUrl(stored);
    setMediaPreviewUrl(previewUrl);
  };

  const selectedHeaderFormat = selectedTemplate
    ? getTemplatePreviewParts(selectedTemplate)?.headerFormat
    : null;

  const handleCsvUpload = async (file) => {
    if (!file) return;
    setUploadingCsv(true);
    setError('');
    try {
      const result = await uploadBroadcastCsv(file);
      const rows = result.data || [];
      const columns = result.columns?.length ? result.columns : rows[0] ? Object.keys(rows[0]) : [];
      setCsvRows(rows);
      setCsvColumns(columns);
      setColumnMapping(autoMapCsvColumns(columns));
      setCsvFileName(file.name);
      setSuccess(`${result.count ?? rows.length} contact(s) detected`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message || 'CSV upload failed');
    } finally {
      setUploadingCsv(false);
    }
  };

  const goNext = async () => {
    setError('');
    if (step === 1) {
      if (!campaignName.trim()) {
        setError('Enter a campaign name');
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!csvRows.length) {
        setError('Upload a CSV with at least one contact');
        return;
      }
      setStep(3);
      return;
    }
    if (step === 3) {
      if (!selectedTemplate) {
        setError('Select an approved template');
        return;
      }
      if (!step3Valid) {
        setError('Fix template variable mapping before continuing');
        return;
      }
      if (
        selectedTemplate &&
        templateHasMedia(selectedTemplate) &&
        !mediaFile &&
        !headerMediaUrl &&
        !(mediaPreviewUrl && resolveStoredHeaderMediaUrl(mediaPreviewUrl))
      ) {
        setError('This template needs header media (image, video, or document). Choose from the Media Library to continue.');
        return;
      }
      if (
        selectedTemplate &&
        templateNeedsCarouselMedia(selectedTemplate) &&
        !carouselCardMediaReady(selectedTemplate, carouselCardMediaUrls)
      ) {
        setError('This carousel template needs image or video for every card. Choose media from the Media Library.');
        return;
      }
      setStep(4);
      return;
    }
    if (step === 4) {
      if (scheduleTime) {
        const picked = new Date(scheduleTime);
        if (Number.isNaN(picked.getTime())) {
          setError('Enter a valid schedule date and time');
          return;
        }
        if (picked.getTime() <= Date.now()) {
          setError('Schedule time must be in the future');
          return;
        }
        const maxSchedule = new Date();
        maxSchedule.setMonth(maxSchedule.getMonth() + SCHEDULE_MAX_MONTHS);
        if (picked.getTime() > maxSchedule.getTime()) {
          setError(`Schedule campaign up to ${SCHEDULE_MAX_MONTHS} months from today`);
          return;
        }
      }
      setStep(5);
      return;
    }
  };

  const goPrev = () => {
    setError('');
    if (step > 1) setStep(step - 1);
  };

  const handleSendNow = async () => {
    if (!canSendTemplate) {
      setError(SEND_TEMPLATE_BLOCKED_MSG);
      return;
    }
    const audience = buildAudienceRows(csvRows, columnMapping, templateVarMap, templateVarCustom);
    if (!audience.length) {
      setError('No valid audience rows');
      return;
    }
    if (
      selectedTemplate &&
      templateHasMedia(selectedTemplate) &&
      !mediaFile &&
      !headerMediaUrl &&
      !(mediaPreviewUrl && resolveStoredHeaderMediaUrl(mediaPreviewUrl))
    ) {
      setError('This template needs header media (image, video, or document). Choose from the Media Library before sending.');
      return;
    }
    if (
      selectedTemplate &&
      templateNeedsCarouselMedia(selectedTemplate) &&
      !carouselCardMediaReady(selectedTemplate, carouselCardMediaUrls)
    ) {
      setError('This carousel template needs image or video for every card. Choose media from the Media Library before sending.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const precheck = await assertCanAddResource('campaigns');
      if (!precheck.allowed) {
        setPlanLimitModal(precheck);
        setError('');
        return;
      }

      let resolvedHeaderMediaUrl = null;
      if (selectedTemplate && templateHasMedia(selectedTemplate)) {
        resolvedHeaderMediaUrl = await resolveCampaignHeaderMediaForSend({
          mediaFile,
          headerMediaUrl,
          mediaPreviewUrl,
          headerFormat: selectedHeaderFormat,
        });
        if (!resolvedHeaderMediaUrl) {
          throw new Error('This template needs header media (image, video, or document). Choose media in step 3 before sending.');
        }
      }

      const storedCarouselUrls = templateNeedsCarouselMedia(selectedTemplate)
        ? (carouselCardMediaUrls || []).map(
            (u) => toPermanentUploadPath(u) || (String(u || '').trim() && !String(u).startsWith('blob:') ? String(u).trim() : null)
          )
        : null;

      const variable_mapping = buildVariableMapping(templateVarMap, templateVarCustom);
      const data = await createCampaignApi({
        name: campaignName.trim(),
        template_name: selectedTemplate.name,
        template_language: templateLanguage,
        schedule_time: isFutureSchedule ? scheduledDate.toISOString() : null,
        audience,
        variable_mapping,
        header_media_url: resolvedHeaderMediaUrl,
        ...(Array.isArray(storedCarouselUrls) && storedCarouselUrls.length
          ? { carousel_card_media_urls: storedCarouselUrls }
          : {}),
      });
      const campaignId = data.campaignId || data.campaign?.id;
      if (!campaignId) throw new Error('Campaign created but id missing');
      if (!isFutureSchedule) {
        await startCampaign(campaignId);
      }
      navigate('/campaigns', {
        state: {
          success: isFutureSchedule
            ? `Campaign scheduled for ${scheduledDate.toLocaleString()}`
            : 'Campaign created and sending started',
        },
      });
    } catch (e) {
      const limitPayload = extractPlanLimitError(e);
      if (limitPayload) {
        setPlanLimitModal(limitPayload);
        setError('');
      } else {
        setError(e.message || 'Failed to send campaign');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
        <div className="animate-spin h-10 w-10 border-2 border-sky-200 border-t-sky-600 rounded-full" />
      </div>
    );
  }

  const userName = user?.name || 'User';
  const userInitial = userName.charAt(0).toUpperCase();
  const headerAvatar = user?.avatar || readSessionUser()?.avatar || '';

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => navigate('/campaigns')}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 text-gray-600 active:scale-95 transition"
            aria-label="Back to campaigns"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <Link to="/dashboard" className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shrink-0 hidden sm:flex"><BrandLogoMark size="md" />
          </Link>
          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <h1 className="text-lg md:text-xl font-semibold text-sky-700 tracking-tight truncate">Create Campaign</h1>
          <AdminHeaderProjectSwitch />
        </div>
        <HeaderRightActions>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 overflow-hidden"
          >
            {headerAvatar ? (
              <img src={headerAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            )}
          </button>
        </HeaderRightActions>
      </header>

      <div className="flex flex-1 min-h-0">
        <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
        </AppShellSidebar>

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="relative isolate p-4 md:p-8 lg:p-10 max-w-5xl mx-auto">
            <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10" aria-hidden>
              <div className="absolute -top-28 -right-20 w-[22rem] h-[22rem] bg-sky-400/30 motion-page-blob" />
              <div className="absolute -bottom-36 -left-24 w-[20rem] h-[20rem] bg-blue-400/25 motion-page-blob motion-page-blob--b" />
            </div>
            <div className="relative z-0">
            {error && (
              <div className="motion-enter mb-6 p-4 bg-red-50 border border-red-200/90 rounded-xl shadow-sm ring-1 ring-red-100/50">
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}
            {success && (
              <div className="motion-enter mb-6 p-4 bg-green-50 border border-green-200/90 rounded-xl shadow-sm ring-1 ring-green-100/50">
                <p className="text-green-600 text-sm">{success}</p>
              </div>
            )}

            <div className="motion-enter mb-6 md:mb-8">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 tracking-tight">New Campaign</h2>
              <p className="text-gray-600 text-sm md:text-base">Build and send a WhatsApp template campaign to your audience</p>
            </div>

            <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-200/90 shadow-xl shadow-sky-900/5 ring-1 ring-sky-100/40 overflow-hidden">
              <Stepper step={step} />

              <div className="px-4 md:px-8 pb-8">
                <div className="flex justify-between mb-6 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={goPrev}
                    disabled={step === 1 || busy}
                    className="px-5 py-2.5 rounded-xl border-2 border-sky-200/90 bg-white text-sky-800 font-semibold hover:bg-sky-50/80 hover:border-sky-300 transition-all duration-300 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  {step < 5 ? (
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={
                        busy ||
                        (step === 1 && !campaignName.trim()) ||
                        (step === 2 && !csvRows.length) ||
                        (step === 3 && !step3Valid)
                      }
                      className="px-6 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-700 shadow-md shadow-sky-600/30 hover:from-sky-500 hover:to-blue-600 hover:shadow-lg transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  ) : null}
                </div>

                {/* Step 1 */}
                {step === 1 && (
                  <div className="max-w-2xl">
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Campaign Name</h2>
                    <p className="text-gray-500 text-sm mb-6">Pick something that describes your audience & goals.</p>
                    <input
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="Enter campaign name"
                      className="w-full px-4 py-3 border-2 border-gray-200/90 rounded-xl bg-white focus:ring-2 focus:ring-sky-400/30 focus:border-sky-500 outline-none transition-shadow shadow-sm"
                    />
                  </div>
                )}

                {/* Step 2 */}
                {step === 2 && (
                  <div>
                    {!csvFileName ? (
                      <div className="border-2 border-dashed border-sky-200/80 rounded-2xl p-12 text-center bg-sky-50/30">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => handleCsvUpload(e.target.files?.[0])}
                        />
                        <button
                          type="button"
                          disabled={uploadingCsv}
                          onClick={() => fileInputRef.current?.click()}
                          className="px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-700 shadow-md shadow-sky-600/25 hover:from-sky-500 hover:to-blue-600 transition-all disabled:opacity-50"
                        >
                          {uploadingCsv ? 'Uploading…' : 'Upload CSV file'}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-sky-50/80 border border-sky-200/70 rounded-xl mb-6 ring-1 ring-sky-100/50">
                          <div>
                            <p className="font-semibold text-gray-900">{csvFileName}</p>
                            <p className="text-sm text-gray-600">{audienceCount} contact(s) detected</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setCsvFileName('');
                              setCsvRows([]);
                              setCsvColumns([]);
                              setColumnMapping({});
                            }}
                            className="text-sm font-medium text-sky-700 hover:underline"
                          >
                            Change File
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-bold text-gray-500 uppercase mb-3">CSV Headers</p>
                            <div className="space-y-2">
                              {csvColumns.map((col) => (
                                <div key={col} className="px-3 py-2 bg-sky-50/50 border border-sky-100 rounded-xl text-sm font-medium text-gray-800">
                                  {col}
                                </div>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-gray-500 uppercase mb-3">Map to Attribute</p>
                            <div className="space-y-2">
                              {csvColumns.map((col) => (
                                <select
                                  key={col}
                                  value={columnMapping[col] || ''}
                                  onChange={(e) =>
                                    setColumnMapping((m) => ({ ...m, [col]: e.target.value }))
                                  }
                                  className="w-full px-3 py-2 border-2 border-gray-200/90 rounded-xl text-sm bg-white focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30 outline-none"
                                >
                                  {csvAttrOptions.map((opt) => (
                                    <option key={`${col}-${opt.value}`} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3 */}
                {step === 3 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 mb-1">Template Name</h2>
                      <p className="text-gray-500 text-sm mb-4">
                        Select one from your WhatsApp approved template messages
                      </p>
                      <div className="relative mb-4">
                        <input
                          type="text"
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                          placeholder="Search template"
                          className="w-full pl-4 pr-10 py-3 border-2 border-gray-200/90 rounded-xl bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-400/20 outline-none"
                        />
                        <svg className="absolute right-3 top-3.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      {loadingTemplates ? (
                        <p className="text-gray-500 text-sm">Loading templates…</p>
                      ) : (
                        <ul className="max-h-48 overflow-y-auto border border-gray-200/90 rounded-xl divide-y shadow-sm ring-1 ring-gray-100/80">
                          {filteredTemplates.length === 0 ? (
                            <li className="p-4 text-sm text-gray-500">No approved templates found</li>
                          ) : (
                            filteredTemplates.map((t) => (
                              <li key={t.name}>
                                <button
                                  type="button"
                                  onClick={() => handleSelectTemplate(t)}
                                  className={`w-full text-left px-4 py-3 text-sm hover:bg-sky-50 transition-colors ${
                                    selectedTemplate?.name === t.name ? 'bg-sky-50 font-semibold text-sky-900' : 'text-gray-800'
                                  }`}
                                >
                                  {t.name}
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                      {templateVariables.length > 0 && (
                        <div className="mt-6 space-y-4">
                          <p className="text-sm font-semibold text-gray-700">Map template variables</p>
                          <p className="text-xs text-gray-500">
                            Choose a CSV column or type a sample value — preview updates instantly.
                          </p>
                          {templateVariables.map((n) => {
                            const key = String(n);
                            const err = step3Validation.errors[key];
                            return (
                              <div key={n} className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm text-gray-500 w-12 shrink-0">{`{{${n}}}`}</span>
                                  <select
                                    value={templateVarMap[key] || ''}
                                    onChange={(e) =>
                                      setTemplateVarMap((m) => ({ ...m, [key]: e.target.value }))
                                    }
                                    className="flex-1 min-w-[8rem] border-2 border-gray-200/90 rounded-xl px-3 py-2 text-sm bg-white focus:border-sky-400 outline-none"
                                  >
                                    <option value="">— Map from CSV —</option>
                                    <option value="name">user name</option>
                                    <option value="phone">phone number</option>
                                    {csvColumns.map((c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="text"
                                    value={templateVarCustom[key] || ''}
                                    onChange={(e) =>
                                      setTemplateVarCustom((m) => ({ ...m, [key]: e.target.value }))
                                    }
                                    placeholder="Or type sample value"
                                    className={`flex-1 min-w-[10rem] border-2 rounded-xl px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/20 ${
                                      err ? 'border-red-400 bg-red-50' : 'border-gray-200/90 bg-white'
                                    }`}
                                  />
                                </div>
                                {err && <p className="text-xs text-red-600 pl-14">{err}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {selectedTemplate && templateHasMedia(selectedTemplate) && (
                        <div className="mt-6 rounded-xl border border-amber-200/90 bg-amber-50/40 p-4 space-y-3">
                          <label className="block text-sm font-semibold text-gray-800">
                            Header {String(selectedHeaderFormat || 'media').toLowerCase()} *
                          </label>
                          <p className="text-xs text-amber-900/80">
                            {headerMediaHint(selectedHeaderFormat)}
                          </p>
                          <FlowMediaAttachField
                            mediaType={
                              selectedHeaderFormat === 'VIDEO'
                                ? 'VIDEO'
                                : selectedHeaderFormat === 'DOCUMENT'
                                  ? 'DOCUMENT'
                                  : 'IMAGE'
                            }
                            label="Header media"
                            mediaUrl={toPermanentUploadPath(headerMediaUrl) || headerMediaUrl}
                            mediaFilename={headerMediaUrl ? String(headerMediaUrl).split('/').pop() : ''}
                            onChange={handleHeaderMediaLibraryChange}
                          />
                          {headerMediaUrl && (
                            <p className="text-xs text-green-700 font-medium">Header media ready for preview</p>
                          )}
                        </div>
                      )}
                      {selectedTemplate && templateNeedsCarouselMedia(selectedTemplate) && (() => {
                        const parts = getTemplatePreviewParts(selectedTemplate);
                        const carouselMediaType = String(parts?.carouselMediaType || 'IMAGE').toUpperCase();
                        const carouselMediaLabel = carouselMediaType === 'VIDEO' ? 'Video' : 'Image';
                        const cards = parts?.carouselCards || [];
                        return (
                          <div className="mt-6 rounded-xl border border-amber-200/90 bg-amber-50/40 p-4 space-y-3">
                            <label className="block text-sm font-semibold text-gray-800">
                              Carousel {carouselMediaLabel.toLowerCase()} (each card) *
                            </label>
                            <p className="text-xs text-amber-900/80">{headerMediaHint(carouselMediaType)}</p>
                            {cards.map((card, idx) => {
                              const stored =
                                toPermanentUploadPath(carouselCardMediaUrls[idx]) ||
                                carouselCardMediaUrls[idx] ||
                                '';
                              return (
                                <FlowMediaAttachField
                                  key={`campaign-carousel-${card.index ?? idx}`}
                                  mediaType={carouselMediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE'}
                                  label={`Card ${idx + 1} ${carouselMediaLabel.toLowerCase()}${!stored ? ' *' : ''}`}
                                  mediaUrl={stored}
                                  mediaFilename={stored ? String(stored).split('/').pop() : ''}
                                  onChange={({ mediaUrl: storedUrl }) => {
                                    const permanent = toPermanentUploadPath(storedUrl) || storedUrl || '';
                                    setCarouselCardMediaUrls((prev) =>
                                      Array.from({ length: cards.length }, (_, i) =>
                                        i === idx ? permanent : (prev[i] || '')
                                      )
                                    );
                                    setError('');
                                  }}
                                />
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      {selectedTemplate ? (
                        <WhatsAppPreview
                          template={selectedTemplate}
                          mediaPreviewUrl={mediaPreviewUrl}
                          carouselCardMediaUrls={carouselCardMediaUrls}
                          templateVarMap={templateVarMap}
                          templateVarCustom={templateVarCustom}
                          columnMapping={columnMapping}
                          csvRows={csvRows}
                          previewFallback={previewFallback}
                        />
                      ) : (
                        <div className="h-64 flex items-center justify-center border-2 border-dashed border-sky-200/80 rounded-2xl bg-sky-50/20 text-gray-500 text-sm">
                          Select a template to preview
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 4 — Schedule */}
                {step === 4 && (
                  <div className="max-w-xl">
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Schedule Date and Time</h2>
                    <p className="text-sm text-gray-500 mb-6">
                      Leave empty to send immediately, or pick a future date and time (up to {SCHEDULE_MAX_MONTHS} months from today).
                    </p>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Schedule (optional)</label>
                    <input
                      type="datetime-local"
                      value={scheduleTime}
                      min={minScheduleDateTimeLocal()}
                      max={maxScheduleDateTimeLocal()}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200/90 rounded-xl bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-400/20 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      {scheduleTime
                        ? `Campaign will send on ${new Date(scheduleTime).toLocaleString()}`
                        : 'No schedule selected — campaign will send immediately on the next step.'}
                    </p>
                  </div>
                )}

                {/* Step 5 — Preview & Send */}
                {step === 5 && (
                  <div>
                    {sendTemplateBlocked ? (
                      <div
                        className="mb-6 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
                        role="alert"
                      >
                        {SEND_TEMPLATE_BLOCKED_MSG}
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-800">Exclude Opted-out data</p>
                            <p className="text-xs text-gray-500">Skip users who have opted out from future campaign</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExcludeOptedOut((v) => !v)}
                            className={`w-12 h-6 rounded-full transition ${excludeOptedOut ? 'bg-sky-600' : 'bg-gray-300'}`}
                          >
                            <span
                              className={`block w-5 h-5 bg-white rounded-full shadow transform transition ${
                                excludeOptedOut ? 'translate-x-6' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Campaign Name</p>
                          <p className="text-lg font-semibold text-gray-900">{campaignName}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Audience Size</p>
                          <p className="text-lg font-semibold text-gray-900">{audienceCount}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Send Time</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {isFutureSchedule ? scheduledDate.toLocaleString() : 'Immediately'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy || !canSendTemplate}
                          onClick={handleSendNow}
                          className="w-full max-w-xs py-3 rounded-xl font-bold uppercase tracking-wide text-white bg-gradient-to-r from-sky-600 to-blue-700 shadow-lg shadow-sky-600/30 hover:from-sky-500 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {busy ? 'Processing…' : isFutureSchedule ? 'Schedule Campaign' : 'Send Now'}
                        </button>
                        {sendTemplateBlocked && (
                          <p className="text-red-600 text-sm font-semibold">{SEND_TEMPLATE_BLOCKED_MSG}</p>
                        )}
                      </div>
                      <div>
                        {selectedTemplate && (
                          <WhatsAppPreview
                            template={selectedTemplate}
                            mediaPreviewUrl={mediaPreviewUrl}
                            carouselCardMediaUrls={carouselCardMediaUrls}
                            templateVarMap={templateVarMap}
                            templateVarCustom={templateVarCustom}
                            columnMapping={columnMapping}
                            csvRows={csvRows}
                            previewFallback={previewFallback}
                          />
                        )}
                      </div>
                    </div>

                    <div className="border-t border-sky-100 pt-4 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-sky-50/80 to-slate-50/80 -mx-4 md:-mx-8 px-4 md:px-8 py-4 rounded-b-2xl">
                      <div>
                        <span className="font-semibold text-gray-800">Estimated Campaign Cost</span>
                        {costCategory ? (
                          <p className="text-xs text-gray-500 mt-0.5 capitalize">{costCategory} template</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-3 w-full lg:w-auto">
                        {costBreakdown.length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {costBreakdown.map((row) => (
                              <div
                                key={row.countryCode || row.country}
                                className="bg-white border border-sky-100 rounded-xl px-3 py-2 text-sm shadow-sm ring-1 ring-sky-50"
                              >
                                <p className="font-semibold text-gray-900">
                                  {row.country || row.countryCode}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {row.messages ?? row.count ?? 0} messages
                                </p>
                                <p className="text-xs text-gray-500">
                                  Rate: ${Number(row.rateUsd ?? row.originalPrice ?? 0).toFixed(4)} USD
                                </p>
                                {row.exchangeRate ? (
                                  <p className="text-xs text-gray-500">
                                    FX: 1 USD = ₹ {Number(row.exchangeRate).toFixed(2)}
                                  </p>
                                ) : null}
                                <p className="text-xs text-gray-500">
                                  ₹ {Number(row.rateLocal ?? row.pricePerMessage ?? 0).toFixed(4)}/msg
                                </p>
                                <p className="text-sm font-bold text-gray-900">
                                  ₹ {Number(row.totalLocal ?? row.total ?? 0).toFixed(2)}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-4">
                        <div className="bg-white border border-sky-100 rounded-xl px-4 py-2 text-center min-w-[140px] shadow-sm ring-1 ring-sky-50">
                          <p className="text-xs text-gray-500">Estimated Cost</p>
                          <p className="font-bold text-gray-900">
                            {costLoading ? '…' : `₹ ${estimatedCost.toFixed(2)}`}
                          </p>
                        </div>
                        <div className="bg-white border border-sky-100 rounded-xl px-4 py-2 text-center min-w-[140px] shadow-sm ring-1 ring-sky-50">
                          <p className="text-xs text-gray-500">Wallet Balance</p>
                          <p className={`font-bold ${wccSufficient ? 'text-gray-900' : 'text-red-600'}`}>
                            ₹ {wccCredits != null ? Number(wccCredits).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                          </p>
                        </div>
                        <div className="bg-white border border-sky-100 rounded-xl px-4 py-2 text-center min-w-[140px] shadow-sm ring-1 ring-sky-50">
                          <p className="text-xs text-gray-500">Remaining Balance</p>
                          <p className={`font-bold ${wccSufficient ? 'text-emerald-700' : 'text-red-600'}`}>
                            {costLoading || remainingBalance == null
                              ? '…'
                              : `₹ ${Number(remainingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                          </p>
                        </div>
                        </div>
                        {sendTemplateBlocked ? (
                          <div
                            className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
                            role="alert"
                          >
                            {SEND_TEMPLATE_BLOCKED_MSG}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-6">
                      <button
                        type="button"
                        onClick={goPrev}
                        disabled={busy}
                        className="px-5 py-2.5 rounded-xl border-2 border-sky-200/90 bg-white text-sky-800 font-semibold hover:bg-sky-50 transition-all"
                      >
                        Prev
                      </button>
                    </div>
                  </div>
                )}

                {step < 5 && (
                  <div className="flex justify-end mt-8 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={goNext}
                      disabled={
                        busy ||
                        (step === 1 && !campaignName.trim()) ||
                        (step === 2 && !csvRows.length) ||
                        (step === 3 && !step3Valid)
                      }
                      className="px-6 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-700 shadow-md shadow-sky-600/30 hover:from-sky-500 hover:to-blue-600 transition-all disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
            </div>
          </div>
        </main>
      </div>
      <PlanLimitModal open={Boolean(planLimitModal)} payload={planLimitModal} onClose={() => setPlanLimitModal(null)} />
    </div>
  );
}
