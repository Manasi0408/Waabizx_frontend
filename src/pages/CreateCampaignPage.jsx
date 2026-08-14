import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import BrandLogoMark from '../components/BrandLogoMark';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated, logout, readSessionUser } from '../services/authService';
import { getTemplates, getMetaTemplates, getMetaTemplateDetails, getTemplateById } from '../services/templateService';
import { getConversationQuota } from '../services/dashboardService';
import { sendTemplateMessage } from '../services/messageService';
import { startCampaign } from '../services/campaignService';
import { uploadBroadcastHeaderMedia } from '../services/broadcastService';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import PlanLimitModal from '../components/PlanLimitModal';
import { extractPlanLimitError, assertCanAddResource } from '../services/planLimitService';

const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const MSG_COST_RUPEES = 0.396;
const STEPS = [
  { id: 1, label: 'Campaign Name' },
  { id: 2, label: 'Upload CSV' },
  { id: 3, label: 'Create Message' },
  { id: 4, label: 'Test Campaign' },
  { id: 5, label: 'Preview & Send' },
];

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

function getTemplateComponentsList(template) {
  if (Array.isArray(template?.components) && template.components.length) {
    return template.components;
  }
  const meta = parseTemplateVariablesMeta(template?.variables);
  if (Array.isArray(meta.components) && meta.components.length) {
    return meta.components;
  }
  return [];
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

  const needsButtons = !getTemplatePreviewParts(resolved)?.buttons?.length;

  if (resolved.id && needsButtons) {
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

  if (getTemplatePreviewParts(resolved)?.buttons?.length) return resolved;

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

function normalizeTestPhone(countryCode, phone) {
  let digits = digitsOnly(`${countryCode || ''}${phone || ''}`);
  const cc = digitsOnly(countryCode);
  if (cc && digits.startsWith(cc) && digits.length > cc.length + 9) {
    /* already includes country code */
  } else if (digits.length === 10 && (cc === '91' || countryCode === '+91')) {
    digits = `91${digits}`;
  } else if (digits.length === 10) {
    digits = `${cc || '91'}${digits}`;
  }
  return digits;
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

function WhatsAppPreview({
  template,
  mediaPreviewUrl,
  templateVarMap = {},
  templateVarCustom = {},
  columnMapping = {},
  csvRows = [],
  previewFallback = {},
}) {
  const parts = getTemplatePreviewParts(template);
  const firstRow = csvRows[0] || {};
  const bodyText = applyPreviewSubstitutions(
    parts.body,
    templateVarMap,
    templateVarCustom,
    firstRow,
    columnMapping,
    previewFallback
  );
  const headerText = parts.headerText
    ? applyPreviewSubstitutions(
        parts.headerText,
        templateVarMap,
        templateVarCustom,
        firstRow,
        columnMapping,
        previewFallback
      )
    : '';
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-2xl border border-sky-100/80 bg-[#e5ddd5] shadow-xl shadow-sky-900/10 ring-1 ring-sky-100/50 overflow-hidden">
      <div className="bg-[#075e54] text-white text-xs px-3 py-2 flex items-center gap-2">
        <BrandLogoMark size="xs" tone="contrast" />
        <span className="font-medium">WhatsApp Preview</span>
      </div>
      <div className="p-3 max-h-[420px] overflow-y-auto">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden text-sm text-gray-900">
          {(parts.headerFormat === 'IMAGE' || parts.headerFormat === 'VIDEO' || mediaPreviewUrl) && (
            <div className="bg-gray-100 aspect-video flex items-center justify-center overflow-hidden">
              {mediaPreviewUrl ? (
                <img src={mediaPreviewUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs text-gray-400">Media header</span>
              )}
            </div>
          )}
          {headerText && !mediaPreviewUrl && parts.headerFormat === 'TEXT' && (
            <p className="px-3 pt-2 font-semibold text-gray-900">{headerText}</p>
          )}
          <div className="px-3 py-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
            {bodyText || 'Template body'}
          </div>
          {parts.footer && (
            <p className="px-3 pb-2 text-[11px] text-gray-500">{parts.footer}</p>
          )}
          {parts.buttons?.length > 0 && (
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
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState('');
  const [resolvingTemplate, setResolvingTemplate] = useState(false);

  const [testName, setTestName] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testCountry, setTestCountry] = useState('+91');

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [excludeOptedOut, setExcludeOptedOut] = useState(true);
  const [wccCredits, setWccCredits] = useState(null);
  const [planLimitModal, setPlanLimitModal] = useState(null);

  const handleSelectTemplate = async (t) => {
    setSelectedTemplate(t);
    setTemplateSearch(t.name);
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
      name: testName.trim() || (nameCol && firstRow[nameCol] != null ? String(firstRow[nameCol]) : 'Alex'),
      phone:
        normalizeTestPhone(testCountry, testPhone) ||
        (phoneCol && firstRow[phoneCol] != null ? digitsOnly(firstRow[phoneCol]) : '9876543210'),
    };
  }, [csvRows, columnMapping, testName, testPhone, testCountry]);

  const step3Validation = useMemo(
    () => validateTemplateVariables(selectedTemplate, templateVarMap, templateVarCustom, columnMapping, csvRows),
    [selectedTemplate, templateVarMap, templateVarCustom, columnMapping, csvRows]
  );

  const step3Valid = !!selectedTemplate && step3Validation.valid;

  const audienceCount = csvRows.length;
  const estimatedCost = useMemo(
    () => Math.round(audienceCount * MSG_COST_RUPEES * 100) / 100,
    [audienceCount]
  );
  const wccSufficient = wccCredits == null ? true : Number(wccCredits) >= estimatedCost;

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
          } catch (_) {
            setWccCredits(null);
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
        .then((q) => setWccCredits(Number(q.wccCredits ?? 0)))
        .catch(() => {});
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
    setMediaPreviewUrl('');
  }, [selectedTemplate, csvColumns, columnMapping]);

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

  const buildTestParams = () => {
    const phoneDigits = normalizeTestPhone(testCountry, testPhone);
    const firstRow = csvRows[0] || {};
    const fallback = {
      name: testName.trim() || previewFallback.name,
      phone: phoneDigits || previewFallback.phone,
    };
    return templateVariables.map((n) => {
      const key = String(n);
      const custom = String(templateVarCustom[key] ?? '').trim();
      if (custom) return custom;
      const field = templateVarMap[key];
      if (field === 'name') return fallback.name || 'Test User';
      if (field === 'phone') return fallback.phone || '9999999999';
      const fromRow = resolveVarFromField(field, firstRow, columnMapping, fallback);
      return fromRow || fallback.name || 'Sample';
    });
  };

  const handleTestSend = async () => {
    const phone = normalizeTestPhone(testCountry, testPhone);
    if (!testPhone.trim() || phone.length < 10) {
      setError('Enter a valid WhatsApp number for test');
      return;
    }
    if (!selectedTemplate) {
      setError('Select a template first');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await sendTemplateMessage(
        phone,
        selectedTemplate.name,
        templateLanguage,
        buildTestParams()
      );
      setSuccess('Test template sent successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message || 'Failed to send test message');
    } finally {
      setBusy(false);
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
      if (selectedTemplate && templateHasMedia(selectedTemplate) && !mediaFile && !mediaPreviewUrl) {
        setError('This template needs a header image or video. Upload media to continue.');
        return;
      }
      setStep(4);
      return;
    }
    if (step === 4) {
      setStep(5);
      return;
    }
  };

  const goPrev = () => {
    setError('');
    if (step > 1) setStep(step - 1);
  };

  const handleSendNow = async () => {
    if (!wccSufficient) {
      setError('Insufficient WCC please recharge');
      return;
    }
    const audience = buildAudienceRows(csvRows, columnMapping, templateVarMap, templateVarCustom);
    if (!audience.length) {
      setError('No valid audience rows');
      return;
    }
    if (selectedTemplate && templateHasMedia(selectedTemplate) && !mediaFile && !mediaPreviewUrl) {
      setError('This template needs a header image or video. Upload media before sending.');
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

      let headerMediaUrl = null;
      if (mediaFile) {
        const uploaded = await uploadBroadcastHeaderMedia(mediaFile);
        headerMediaUrl = uploaded.url;
      } else if (mediaPreviewUrl && !String(mediaPreviewUrl).startsWith('blob:')) {
        headerMediaUrl = mediaPreviewUrl;
      }

      const variable_mapping = buildVariableMapping(templateVarMap, templateVarCustom);
      const data = await createCampaignApi({
        name: campaignName.trim(),
        template_name: selectedTemplate.name,
        template_language: templateLanguage,
        schedule_time: scheduleEnabled ? new Date(Date.now() + 3600000).toISOString() : null,
        audience,
        variable_mapping,
        header_media_url: headerMediaUrl,
      });
      const campaignId = data.campaignId || data.campaign?.id;
      if (!campaignId) throw new Error('Campaign created but id missing');
      if (!scheduleEnabled) {
        await startCampaign(campaignId);
      }
      navigate('/campaigns', { state: { success: 'Campaign created and sending started' } });
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
                        <div className="mt-6">
                          <label className="block text-sm font-semibold text-gray-800 mb-2">
                            Upload header {String(getTemplatePreviewParts(selectedTemplate).headerFormat || 'media').toLowerCase()}
                          </label>
                          <p className="text-xs text-gray-500 mb-2">
                            Required for this template. Preview updates after you choose a file.
                          </p>
                          <input
                            type="file"
                            accept="image/*,video/*"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              setMediaFile(f || null);
                              if (f) {
                                setMediaPreviewUrl(URL.createObjectURL(f));
                              } else {
                                setMediaPreviewUrl('');
                              }
                            }}
                            className="block w-full text-sm"
                          />
                          {mediaPreviewUrl && (
                            <p className="mt-2 text-xs text-green-700 font-medium">Header media ready for preview</p>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      {selectedTemplate ? (
                        <WhatsAppPreview
                          template={selectedTemplate}
                          mediaPreviewUrl={mediaPreviewUrl}
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

                {/* Step 4 */}
                {step === 4 && (
                  <div className="max-w-xl">
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Test Campaign</h2>
                    <p className="text-sm text-gray-500 mb-6">
                      Optionally send a test to an opted-in WhatsApp number, or continue to preview without testing.
                    </p>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                        <input
                          type="text"
                          value={testName}
                          onChange={(e) => setTestName(e.target.value)}
                          placeholder="Username"
                          className="w-full px-4 py-3 border-2 border-gray-200/90 rounded-xl bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-400/20 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                        <div className="flex gap-2">
                          <select
                            value={testCountry}
                            onChange={(e) => setTestCountry(e.target.value)}
                            className="px-3 py-3 border-2 border-gray-200/90 rounded-xl bg-white text-sm focus:border-sky-400 outline-none"
                          >
                            <option value="+91">IN +91</option>
                            <option value="+1">US +1</option>
                          </select>
                          <input
                            type="text"
                            value={testPhone}
                            onChange={(e) => setTestPhone(e.target.value)}
                            placeholder="WhatsApp Number"
                            className="flex-1 px-4 py-3 border-2 border-gray-200/90 rounded-xl bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-400/20 outline-none"
                          />
                          <button
                            type="button"
                            disabled={busy || !testPhone.trim()}
                            onClick={handleTestSend}
                            className="shrink-0 px-4 py-3 border-2 border-sky-300 text-sky-800 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-sky-50 disabled:opacity-40 transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                            {busy ? 'Sending…' : 'Test'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 5 */}
                {step === 5 && (
                  <div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-800">Schedule Date and Time</p>
                            <p className="text-xs text-gray-500">Schedule campaign upto two month from today</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setScheduleEnabled((v) => !v)}
                            className={`w-12 h-6 rounded-full transition ${scheduleEnabled ? 'bg-sky-600' : 'bg-gray-300'}`}
                          >
                            <span
                              className={`block w-5 h-5 bg-white rounded-full shadow transform transition ${
                                scheduleEnabled ? 'translate-x-6' : 'translate-x-0.5'
                              }`}
                            />
                          </button>
                        </div>
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
                        <button
                          type="button"
                          disabled={busy || !wccSufficient}
                          onClick={handleSendNow}
                          className="w-full max-w-xs py-3 rounded-xl font-bold uppercase tracking-wide text-white bg-gradient-to-r from-sky-600 to-blue-700 shadow-lg shadow-sky-600/30 hover:from-sky-500 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {busy ? 'Sending…' : 'Send Now'}
                        </button>
                        {!wccSufficient && (
                          <p className="text-red-600 text-sm font-semibold">Insufficient WCC please recharge</p>
                        )}
                      </div>
                      <div>
                        {selectedTemplate && (
                          <WhatsAppPreview
                            template={selectedTemplate}
                            mediaPreviewUrl={mediaPreviewUrl}
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
                      <span className="font-semibold text-gray-800">Estimated Campaign Cost</span>
                      <div className="flex flex-wrap gap-4">
                        <div className="bg-white border border-sky-100 rounded-xl px-4 py-2 text-center min-w-[140px] shadow-sm ring-1 ring-sky-50">
                          <p className="text-xs text-gray-500">Estimated Cost</p>
                          <p className="font-bold text-gray-900">₹ {estimatedCost.toFixed(2)}</p>
                        </div>
                        <div className="bg-white border border-sky-100 rounded-xl px-4 py-2 text-center min-w-[140px] shadow-sm ring-1 ring-sky-50">
                          <p className="text-xs text-gray-500">Available WCC</p>
                          <p className={`font-bold ${wccSufficient ? 'text-gray-900' : 'text-red-600'}`}>
                            ₹ {wccCredits != null ? Number(wccCredits).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
                          </p>
                        </div>
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
