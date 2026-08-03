import React, { useEffect, useMemo, useState } from 'react';

const LANGUAGES = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'hi_IN', label: 'Hindi' },
  { value: 'mr_IN', label: 'Marathi' },
  { value: 'es_ES', label: 'Spanish' },
  { value: 'fr_FR', label: 'French' },
  { value: 'de_DE', label: 'German' },
];

const TEMPLATE_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
  { value: 'location', label: 'Location' },
  { value: 'carousel', label: 'Carousel' },
];

export const emptyLocalTemplateForm = () => ({
  name: '',
  category: 'marketing',
  language: 'en_US',
  templateType: 'text',
  content: '',
  footer: '',
  actionMode: 'none',
  callToActions: [{ id: 'cta-1', type: 'url', label: '', value: '' }],
  quickReplies: [
    { id: 'qr-1', label: '' },
    { id: 'qr-2', label: '' },
  ],
  /** Permanent /uploads/... path from an existing template (Copy flow) */
  headerMediaUrl: '',
});

function parseTemplateMeta(variables) {
  if (!variables) return {};
  if (typeof variables === 'string') {
    try {
      const parsed = JSON.parse(variables);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof variables === 'object' && !Array.isArray(variables)) return variables;
  return {};
}

function getTemplateComponentsList(template, meta = {}) {
  if (Array.isArray(template?.components) && template.components.length) return template.components;
  if (Array.isArray(meta.components) && meta.components.length) return meta.components;
  return [];
}

/** Map an existing template into Create Local form (for Copy). */
export function templateToLocalForm(template) {
  const base = emptyLocalTemplateForm();
  if (!template) return base;

  const meta = parseTemplateMeta(template.variables);
  const components = getTemplateComponentsList(template, meta);
  const findComp = (type) =>
    components.find((c) => String(c?.type || '').toUpperCase() === type);

  const body = findComp('BODY');
  const footerComp = findComp('FOOTER');
  const header = findComp('HEADER');
  const buttonsComp = findComp('BUTTONS');

  let category = String(template.category || meta.category || 'marketing').toLowerCase();
  if (category === 'marketing' || category === 'utility' || category === 'authentication') {
    /* keep */
  } else if (category === 'other') {
    category = 'marketing';
  } else {
    category = 'marketing';
  }

  let templateType = String(meta.templateType || 'text').toLowerCase();
  const headerFormat = String(header?.format || '').toUpperCase();
  if (headerFormat === 'IMAGE') templateType = 'image';
  else if (headerFormat === 'VIDEO') templateType = 'video';
  else if (headerFormat === 'DOCUMENT') templateType = 'document';

  let actionMode = String(meta.actionMode || 'none').toLowerCase();
  let callToActions = Array.isArray(meta.callToActions) && meta.callToActions.length
    ? meta.callToActions.map((a, i) => ({
        id: a.id || `cta-${i + 1}`,
        type: a.type || 'url',
        label: a.label || '',
        value: a.value || '',
      }))
    : base.callToActions;
  let quickReplies = Array.isArray(meta.quickReplies) && meta.quickReplies.length
    ? meta.quickReplies.map((a, i) => ({
        id: a.id || `qr-${i + 1}`,
        label: a.label || '',
      }))
    : base.quickReplies;

  const rawButtons = Array.isArray(buttonsComp?.buttons)
    ? buttonsComp.buttons
    : Array.isArray(meta.interactiveButtons)
      ? meta.interactiveButtons
      : [];

  if ((!meta.callToActions && !meta.quickReplies) && rawButtons.length) {
    const ctas = [];
    const qrs = [];
    rawButtons.forEach((btn, i) => {
      const type = String(btn.type || '').toUpperCase();
      if (type === 'URL') {
        ctas.push({
          id: `cta-${i + 1}`,
          type: 'url',
          label: btn.text || '',
          value: btn.url || '',
        });
      } else if (type === 'PHONE_NUMBER') {
        ctas.push({
          id: `cta-${i + 1}`,
          type: 'phone',
          label: btn.text || '',
          value: btn.phone_number || '',
        });
      } else if (type === 'QUICK_REPLY') {
        qrs.push({ id: `qr-${i + 1}`, label: btn.text || '' });
      }
    });
    if (ctas.length && qrs.length) actionMode = 'all';
    else if (ctas.length) actionMode = 'cta';
    else if (qrs.length) actionMode = 'quick_reply';
    if (ctas.length) callToActions = ctas;
    if (qrs.length) quickReplies = qrs;
  }

  const rawName = String(template.name || '').trim();
  const copyName = rawName
    ? `${rawName.replace(/_copy$/i, '')}_copy`.slice(0, 512)
    : '';

  const headerMediaUrl = String(
    meta.headerMediaUrl ||
      meta.header_media_url ||
      template.headerMediaUrl ||
      template.header_media_url ||
      ''
  ).trim();

  return {
    ...base,
    name: copyName,
    category,
    language: String(template.language || meta.language || 'en_US'),
    templateType: TEMPLATE_TYPES.some((t) => t.value === templateType) ? templateType : 'text',
    content: String(body?.text || template.content || ''),
    footer: String(footerComp?.text || meta.footer || ''),
    actionMode: ['none', 'cta', 'quick_reply', 'all'].includes(actionMode) ? actionMode : 'none',
    callToActions,
    quickReplies,
    headerMediaUrl,
  };
}

const mapCategoryForMeta = (category) => {
  const c = String(category || '').toLowerCase();
  if (c === 'authentication') return 'AUTHENTICATION';
  if (c === 'utility') return 'UTILITY';
  return 'MARKETING';
};

const normalizeMetaName = (name) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

function isFilledCtaAction(action) {
  if (!String(action?.label || '').trim()) return false;
  if (action.type === 'button') return true;
  return Boolean(String(action?.value || '').trim());
}

export function buildInteractiveButtonsFromForm(form) {
  const buttons = [];
  const showCta = form.actionMode === 'cta' || form.actionMode === 'all';
  const showQr = form.actionMode === 'quick_reply' || form.actionMode === 'all';

  if (showCta) {
    const ctas = (form.callToActions || []).filter(isFilledCtaAction);
    for (const cta of ctas) {
      if (cta.type === 'button') {
        buttons.push({ type: 'QUICK_REPLY', text: cta.label.trim() });
      } else if (cta.type === 'phone') {
        buttons.push({
          type: 'PHONE_NUMBER',
          text: cta.label.trim(),
          phone_number: cta.value.trim(),
        });
      } else {
        let url = cta.value.trim();
        if (!url.startsWith('https://')) {
          url = `https://${url.replace(/^https?:\/\//, '')}`;
        }
        buttons.push({ type: 'URL', text: cta.label.trim(), url, example: [] });
      }
    }
  }

  if (showQr) {
    const qrs = (form.quickReplies || []).filter((a) => String(a.label || '').trim());
    for (const qr of qrs) {
      buttons.push({ type: 'QUICK_REPLY', text: qr.label.trim() });
    }
  }

  return buttons;
}

function buildMetaButtons(form) {
  const all = buildInteractiveButtonsFromForm(form);
  const ctaButtons = all.filter((b) => b.type === 'URL' || b.type === 'PHONE_NUMBER');
  const qrButtons = all.filter((b) => b.type === 'QUICK_REPLY');

  // Meta allows either call-to-action (URL/phone) or quick-reply buttons, not both.
  if (ctaButtons.length > 0) {
    return ctaButtons.slice(0, 2);
  }
  return qrButtons.slice(0, 3);
}

export function buildMetaTemplatePayload(form, headerMedia = null) {
  const normalizedName = normalizeMetaName(form.name);
  if (!normalizedName) {
    throw new Error('Template name invalid. Use letters, numbers, and underscores only (Meta requirement).');
  }

  const category = mapCategoryForMeta(form.category);
  const isAuth = category === 'AUTHENTICATION';

  if (isAuth) {
    return {
      name: normalizedName,
      category: 'AUTHENTICATION',
      language: form.language,
      components: [
        { type: 'BODY', text: 'Your OTP is {{1}}. Do not share it with anyone.' },
        { type: 'FOOTER', text: 'Code expires in 5 minutes.' },
      ],
    };
  }

  const bodyText = String(form.content || '').trim();
  if (!bodyText) {
    throw new Error('Template body is required.');
  }

  const components = [{ type: 'BODY', text: bodyText }];

  const mediaFormat = { image: 'IMAGE', video: 'VIDEO', document: 'DOCUMENT' }[form.templateType];
  if (mediaFormat) {
    components.unshift({ type: 'HEADER', format: mediaFormat });
  }

  if (String(form.footer || '').trim()) {
    components.push({ type: 'FOOTER', text: form.footer.trim() });
  }

  const buttons = buildMetaButtons(form);
  if (buttons.length > 0) {
    components.push({ type: 'BUTTONS', buttons });
  }

  const existingHeaderMediaUrl = String(form.headerMediaUrl || '').trim() || null;

  return {
    name: normalizedName,
    category,
    language: form.language,
    templateMeta: {
      templateType: form.templateType || 'text',
      actionMode: form.actionMode,
      callToActions: form.callToActions,
      quickReplies: form.quickReplies,
      footer: String(form.footer || '').trim(),
      interactiveButtons: buildInteractiveButtonsFromForm(form),
    },
    components: components.map((c) => ({
      ...c,
      type: String(c.type || '').toUpperCase(),
    })),
    ...(headerMedia ? { headerMedia } : {}),
    ...(!headerMedia && existingHeaderMediaUrl ? { existingHeaderMediaUrl } : {}),
  };
}

function formatPreviewBody(text) {
  const raw = String(text || '');
  if (!raw.trim()) return <span className="text-gray-400 italic">Template body will appear here…</span>;
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

function TemplatePreview({ form }) {
  const interactiveButtons = buildInteractiveButtonsFromForm(form);

  const typeKey = String(form.templateType || 'text').toLowerCase();
  const mediaMeta = {
    image: { label: 'Image', icon: '🖼' },
    video: { label: 'Video', icon: '🎬' },
    document: { label: 'Document', icon: '📄' },
    location: { label: 'Location', icon: '📍' },
    carousel: { label: 'Carousel', icon: '🗂' },
  }[typeKey];

  return (
    <div>
      <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-white via-slate-50 to-emerald-50/30 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900">Live Preview</h4>
            <p className="text-[11px] text-slate-500 mt-0.5">WhatsApp message appearance</p>
          </div>
          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
            Real-time
          </span>
        </div>
        <div className="mx-auto max-w-[280px] rounded-[1.85rem] border-[7px] border-slate-900 bg-[#e5ddd5] p-3 shadow-2xl">
          <div className="rounded-2xl bg-white overflow-hidden shadow-sm">
            {mediaMeta ? (
              <div className="bg-gradient-to-b from-slate-100 to-slate-50 border-b border-slate-200 px-3 py-9 text-center">
                <div className="text-2xl text-slate-400 mb-2" aria-hidden>
                  {mediaMeta.icon}
                </div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {mediaMeta.label}
                </p>
              </div>
            ) : null}
            <div className="px-3.5 py-3.5 text-[13px] text-slate-800 leading-relaxed whitespace-pre-wrap break-words min-h-[80px]">
              {formatPreviewBody(
                String(form.category).toLowerCase() === 'authentication'
                  ? 'Your OTP is {{1}}. Do not share it with anyone.'
                  : form.content
              )}
            </div>
            {String(form.footer || '').trim() ? (
              <div className="px-3.5 pb-2.5 text-[11px] text-slate-500">{form.footer}</div>
            ) : null}
            {interactiveButtons.length > 0 ? (
              <div className="border-t border-slate-100">
                {interactiveButtons.map((btn, i) => {
                  const type = String(btn.type || '').toUpperCase();
                  const icon =
                    type === 'PHONE_NUMBER' ? '📞' : type === 'URL' ? '🔗' : null;
                  return (
                    <div
                      key={`${btn.text}-${i}`}
                      className="flex flex-col items-center justify-center gap-0.5 px-3 py-2.5 text-[12px] font-semibold text-[#008069] border-t border-slate-100 first:border-t-0"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        {icon ? <span aria-hidden>{icon}</span> : null}
                        {btn.text}
                      </div>
                      {type === 'URL' && btn.url ? (
                        <span className="text-[10px] font-normal text-slate-500 truncate max-w-full">{btn.url}</span>
                      ) : null}
                      {type === 'PHONE_NUMBER' && btn.phone_number ? (
                        <span className="text-[10px] font-normal text-slate-500">{btn.phone_number}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
          <p className="mt-2.5 text-[10px] text-center text-slate-600 font-medium">
            {form.name ? form.name : 'template_name'} · {form.language}
          </p>
        </div>
      </div>
    </div>
  );
}

const fieldClass =
  'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none';

const compactFieldClass =
  'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none';

const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2';

const ACTION_MODE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'cta', label: 'Call to Action' },
  { value: 'quick_reply', label: 'Quick Replies' },
  { value: 'all', label: 'All' },
];

export default function CreateLocalTemplateModal({ open, saving, onClose, onSubmit, initialForm = null }) {
  const [form, setForm] = useState(emptyLocalTemplateForm);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    const next = initialForm ? { ...emptyLocalTemplateForm(), ...initialForm } : emptyLocalTemplateForm();
    setForm(next);
    setFormError('');
  }, [open, initialForm]);

  const isAuth = String(form.category).toLowerCase() === 'authentication';

  const categoryLabel = useMemo(() => {
    const map = { marketing: 'Marketing', utility: 'Utility', authentication: 'Authentication' };
    return map[form.category] || form.category;
  }, [form.category]);

  if (!open) return null;

  const setField = (key, value) => {
    setFormError('');
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCta = (id, patch) => {
    setFormError('');
    setForm((prev) => ({
      ...prev,
      callToActions: prev.callToActions.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };

  const updateQr = (id, label) => {
    setFormError('');
    setForm((prev) => ({
      ...prev,
      quickReplies: prev.quickReplies.map((item) => (item.id === id ? { ...item, label } : item)),
    }));
  };

  const addCta = () => {
    setForm((prev) => ({
      ...prev,
      callToActions: [...prev.callToActions, { id: `cta-${Date.now()}`, type: 'url', label: '', value: '' }],
    }));
  };

  const removeCta = (id) => {
    setForm((prev) => ({
      ...prev,
      callToActions: prev.callToActions.filter((item) => item.id !== id),
    }));
  };

  const addQr = () => {
    setForm((prev) => ({
      ...prev,
      quickReplies: [...prev.quickReplies, { id: `qr-${Date.now()}`, label: '' }],
    }));
  };

  const removeQr = (id) => {
    setForm((prev) => ({
      ...prev,
      quickReplies: prev.quickReplies.filter((item) => item.id !== id),
    }));
  };

  const handleClose = () => {
    setForm(emptyLocalTemplateForm());
    setFormError('');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      // Header media is uploaded later from Inbox/LiveChat Insert preview — not at create time.
      // Meta IMAGE templates use a server-side sample handle when no media is sent.
      const payload = buildMetaTemplatePayload(form, null);
      await onSubmit(payload, () => {
        setForm(emptyLocalTemplateForm());
        setFormError('');
      });
    } catch (err) {
      setFormError(err.message || 'Please check the form and try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-0 sm:p-4 md:p-6">
      <div className="motion-pop flex h-[min(96dvh,900px)] w-full max-w-[min(72rem,100%)] sm:max-w-[min(72rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-white via-slate-50 to-emerald-50/40 px-5 py-4 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200/80">
                Meta submission
              </span>
              <h3 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight mt-2">New Template Message</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xl">
                Configure once — submitted to Meta for approval and synced automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row overflow-hidden">
            <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3 sm:p-4 md:p-5 space-y-4 bg-slate-50/40">
              <div className="lg:hidden">
                <TemplatePreview form={form} />
              </div>

              {formError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {formError}
                </div>
              ) : null}

              <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Basic details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Template Category *</label>
                    <select
                      value={form.category}
                      onChange={(e) => setField('category', e.target.value)}
                      className={fieldClass}
                    >
                      <option value="marketing">Marketing</option>
                      <option value="utility">Utility</option>
                      <option value="authentication">Authentication</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Template Language *</label>
                    <select
                      value={form.language}
                      onChange={(e) => setField('language', e.target.value)}
                      className={fieldClass}
                    >
                      {LANGUAGES.map((lang) => (
                        <option key={lang.value} value={lang.value}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Template Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setField('name', e.target.value)}
                      required
                      placeholder="e.g. loan_offer_update"
                      className={fieldClass}
                    />
                    <p className="mt-1.5 text-[11px] text-slate-500">Lowercase letters, numbers, and underscores only</p>
                  </div>
                  <div>
                    <label className={labelClass}>Template Type *</label>
                    <select
                      value={form.templateType}
                      onChange={(e) => setField('templateType', e.target.value)}
                      className={fieldClass}
                    >
                      {TEMPLATE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Message content</h4>

                {isAuth ? (
                  <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/40 p-4">
                    <label className={labelClass}>Template Format</label>
                    <div className="rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm font-mono text-slate-800">
                      Your OTP is {'{{1}}'}. Do not share it with anyone.
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Authentication templates use Meta&apos;s fixed OTP format for {categoryLabel} category.
                    </p>
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Template Format *</label>
                    <textarea
                      value={form.content}
                      onChange={(e) => setField('content', e.target.value)}
                      required
                      rows={5}
                      placeholder="Write your message. Use *bold*, _italic_, ~strikethrough~ and {{1}} variables."
                      className={`${fieldClass} font-mono resize-y min-h-[100px]`}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Formatting: <span className="font-semibold">*bold*</span> · <em>_italic_</em> ·{' '}
                      <s>~strikethrough~</s> · variables like {'{{1}}'}
                    </p>
                  </div>
                )}

                <div>
                  <label className={labelClass}>Template Footer (optional)</label>
                  <input
                    type="text"
                    value={form.footer}
                    onChange={(e) => setField('footer', e.target.value)}
                    maxLength={60}
                    placeholder="Short footer text (max 60 characters)"
                    className={fieldClass}
                  />
                </div>
              </section>

              <section className="rounded-xl border border-slate-200/80 bg-white p-3 sm:p-4 shadow-sm space-y-4 min-w-0 overflow-hidden">
                <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Interactive actions</h4>

                <div className="min-w-0">
                  <label className={labelClass}>Action type</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {ACTION_MODE_OPTIONS.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex min-w-0 cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-center text-xs font-semibold transition ${
                          form.actionMode === opt.value
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="actionMode"
                          value={opt.value}
                          checked={form.actionMode === opt.value}
                          onChange={(e) => setField('actionMode', e.target.value)}
                          className="sr-only"
                        />
                        <span className="leading-snug break-words">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div
                  className={`min-w-0 space-y-4 ${
                    form.actionMode === 'all' ? 'lg:grid lg:grid-cols-1 xl:grid-cols-2 lg:gap-4 lg:space-y-0' : ''
                  }`}
                >
                {(form.actionMode === 'cta' || form.actionMode === 'all') && (
                  <div className="min-w-0 space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-700">Call to Action buttons</p>
                      <button
                        type="button"
                        onClick={addCta}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 whitespace-nowrap"
                      >
                        + Add button
                      </button>
                    </div>
                    {form.callToActions.map((cta, idx) => (
                      <div
                        key={cta.id}
                        className="min-w-0 space-y-3 rounded-lg border border-slate-100 bg-white p-3 sm:p-4"
                      >
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="min-w-0">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Call to Action</label>
                            <select
                              value={cta.type}
                              onChange={(e) => updateCta(cta.id, { type: e.target.value })}
                              className={compactFieldClass}
                            >
                              <option value="url">URL</option>
                              <option value="phone">Phone Number</option>
                              <option value="button">Button</option>
                            </select>
                          </div>
                          <div className="min-w-0">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Button label</label>
                            <input
                              type="text"
                              value={cta.label}
                              onChange={(e) => updateCta(cta.id, { label: e.target.value })}
                              placeholder={`Label ${idx + 1}`}
                              className={compactFieldClass}
                            />
                          </div>
                        </div>
                        {cta.type === 'button' ? (
                          <p className="text-[11px] leading-relaxed text-slate-500">
                            Quick-reply button — label only (used for flow routing).
                          </p>
                        ) : (
                          <div className="min-w-0">
                            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                              {cta.type === 'phone' ? 'Phone number' : 'URL'}
                            </label>
                            <input
                              type="text"
                              value={cta.value}
                              onChange={(e) => updateCta(cta.id, { value: e.target.value })}
                              placeholder={cta.type === 'phone' ? '+91XXXXXXXXXX' : 'https://example.com'}
                              className={compactFieldClass}
                            />
                          </div>
                        )}
                        <div className="flex justify-stretch sm:justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => removeCta(cta.id)}
                            disabled={form.callToActions.length <= 1}
                            className="w-full sm:w-auto rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(form.actionMode === 'quick_reply' || form.actionMode === 'all') && (
                  <div className="min-w-0 space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-700">Quick reply buttons</p>
                      <button
                        type="button"
                        onClick={addQr}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 whitespace-nowrap"
                      >
                        + Add quick reply
                      </button>
                    </div>
                    {form.quickReplies.map((qr, idx) => (
                      <div
                        key={qr.id}
                        className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-100 bg-white p-3 sm:flex-row sm:items-center"
                      >
                        <input
                          type="text"
                          value={qr.label}
                          onChange={(e) => updateQr(qr.id, e.target.value)}
                          placeholder={`Quick reply ${idx + 1}`}
                          className={`${compactFieldClass} sm:flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => removeQr(qr.id)}
                          className="w-full shrink-0 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 sm:w-auto"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </section>
            </div>

            <div className="hidden lg:flex min-h-0 w-full lg:w-[min(100%,300px)] xl:w-[320px] shrink-0 overflow-y-auto border-t lg:border-t-0 lg:border-l border-slate-100 bg-white p-3 sm:p-4">
              <TemplatePreview form={form} />
            </div>
          </div>

          <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-slate-100 bg-white px-4 py-3 md:px-5">
            <p className="text-xs text-slate-500">
              Submitted templates are reviewed by Meta. Status updates after sync.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-xl border border-slate-200 px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/15 hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50"
              >
                {saving ? 'Submitting to Meta…' : 'Submit to Meta'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
