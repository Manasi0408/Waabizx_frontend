import React, { useEffect, useMemo, useState } from 'react';

const LANGUAGES = [
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'hi', label: 'Hindi' },
  { value: 'mr', label: 'Marathi' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

const TEMPLATE_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
  { value: 'carousel', label: 'Carousel' },
];

const CAROUSEL_MIN_CARDS = 2;
const CAROUSEL_MAX_CARDS = 10;
const CAROUSEL_BODY_MAX = 160;
const CAROUSEL_MAIN_BODY_MAX = 1024;

function createCarouselButton() {
  return {
    id: `cbtn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'url',
    label: '',
    value: '',
  };
}

function createCarouselCard(seed = '') {
  return {
    id: `card-${Date.now()}-${seed}`,
    body: '',
    buttons: [createCarouselButton()],
  };
}

function isFilledCarouselButton(btn) {
  if (!String(btn?.label || '').trim()) return false;
  if (btn.type === 'button') return true;
  return Boolean(String(btn?.value || '').trim());
}

function normalizeCarouselHttpsUrl(raw) {
  let url = String(raw || '').trim();
  if (!url) return '';
  if (!url.startsWith('https://')) {
    url = `https://${url.replace(/^https?:\/\//, '')}`;
  }
  return url;
}

function carouselUrlExample(url) {
  if (/\{\{\d+\}\}/.test(url)) {
    return [url.replace(/\{\{\d+\}\}/g, 'sample')];
  }
  return [url];
}

function carouselButtonToMeta(btn) {
  const label = String(btn.label || '').trim();
  const url = normalizeCarouselHttpsUrl(btn.value);
  return { type: 'URL', text: label, url, example: carouselUrlExample(url) };
}

function buildCarouselMetaButtonsForCard(card) {
  return (card?.buttons || [])
    .filter(isFilledCarouselButton)
    .filter((b) => b.type === 'url')
    .map(carouselButtonToMeta)
    .slice(0, 2);
}

function carouselPreviewButtonLabel(btn, index) {
  const label = String(btn?.label || '').trim();
  if (label) return label;
  const value = String(btn?.value || '').trim();
  if (value) return value.replace(/^https?:\/\//, '').slice(0, 24) || 'Link';
  return `Button ${index + 1}`;
}

function formButtonFromMeta(btn, idx) {
  const type = String(btn?.type || '').toUpperCase();
  if (type === 'QUICK_REPLY') {
    return { id: `cbtn-${idx}`, type: 'button', label: btn.text || '', value: '' };
  }
  if (type === 'PHONE_NUMBER') {
    return {
      id: `cbtn-${idx}`,
      type: 'phone',
      label: btn.text || '',
      value: btn.phone_number || '',
    };
  }
  return { id: `cbtn-${idx}`, type: 'url', label: btn.text || '', value: btn.url || '' };
}

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
  carouselMediaType: 'IMAGE',
  carouselCards: [createCarouselCard(1), createCarouselCard(2)],
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

  const carouselComp = findComp('CAROUSEL');
  if (String(meta.templateType || '').toLowerCase() === 'carousel' || carouselComp) {
    templateType = 'carousel';
    category = 'marketing';
    let carouselCards = Array.isArray(meta.carouselCards) ? meta.carouselCards : [];
    if (!carouselCards.length && Array.isArray(carouselComp?.cards)) {
      carouselCards = carouselComp.cards.map((card, i) => {
        const comps = Array.isArray(card?.components) ? card.components : [];
        const cardBody = comps.find((c) => String(c?.type || '').toUpperCase() === 'BODY');
        const btnComp = comps.find((c) => String(c?.type || '').toUpperCase() === 'BUTTONS');
        const buttons = Array.isArray(btnComp?.buttons) && btnComp.buttons.length
          ? btnComp.buttons.map((b, idx) => formButtonFromMeta(b, idx))
          : [createCarouselButton()];
        return {
          id: `card-${i + 1}`,
          body: String(cardBody?.text || ''),
          buttons,
        };
      });
    }
    if (carouselCards.length < CAROUSEL_MIN_CARDS) {
      while (carouselCards.length < CAROUSEL_MIN_CARDS) {
        carouselCards.push(createCarouselCard(carouselCards.length + 1));
      }
    }
    const topBodyComp = findComp('BODY');
    const mainIntro =
      String(topBodyComp?.text || meta.carouselMainBody || meta.content || template.content || '').trim() ||
      String(carouselCards[0]?.body || '');
    return {
      ...base,
      name: copyName,
      category: 'marketing',
      language: String(template.language || meta.language || 'en_US'),
      templateType: 'carousel',
      content: mainIntro,
      footer: String(footerComp?.text || meta.footer || ''),
      carouselMediaType: String(meta.carouselMediaType || 'IMAGE').toUpperCase() === 'VIDEO' ? 'VIDEO' : 'IMAGE',
      carouselCards,
      headerMediaUrl,
    };
  }

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

function inferActionMode(form) {
  const mode = String(form?.actionMode || 'none').toLowerCase();
  if (mode !== 'none') return mode;
  const hasCta = (form.callToActions || []).some(isFilledCtaAction);
  const hasQr = (form.quickReplies || []).some((a) => String(a?.label || '').trim());
  if (hasCta && hasQr) return 'all';
  if (hasCta) return 'cta';
  if (hasQr) return 'quick_reply';
  return 'none';
}

function withEffectiveActionMode(form) {
  return { ...form, actionMode: inferActionMode(form) };
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
  const effectiveForm = withEffectiveActionMode(form);
  const normalizedName = normalizeMetaName(effectiveForm.name);
  if (!normalizedName) {
    throw new Error('Template name invalid. Use letters, numbers, and underscores only (Meta requirement).');
  }

  const category = mapCategoryForMeta(effectiveForm.category);
  const isAuth = category === 'AUTHENTICATION';

  if (isAuth) {
    return {
      name: normalizedName,
      category: 'AUTHENTICATION',
      language: effectiveForm.language,
      components: [
        { type: 'BODY', text: 'Your OTP is {{1}}. Do not share it with anyone.' },
        { type: 'FOOTER', text: 'Code expires in 5 minutes.' },
      ],
    };
  }

  const isCarousel = String(effectiveForm.templateType || '').toLowerCase() === 'carousel';
  if (isCarousel) {
    if (mapCategoryForMeta(effectiveForm.category) !== 'MARKETING') {
      throw new Error('Carousel templates must use the Marketing category.');
    }
    const cards = Array.isArray(effectiveForm.carouselCards) ? effectiveForm.carouselCards : [];
    if (cards.length < CAROUSEL_MIN_CARDS || cards.length > CAROUSEL_MAX_CARDS) {
      throw new Error(`Carousel must have ${CAROUSEL_MIN_CARDS} to ${CAROUSEL_MAX_CARDS} cards.`);
    }
    const bodies = cards.map((c) => String(c?.body || '').trim());
    const anyBody = bodies.some(Boolean);
    const allBodies = bodies.every(Boolean);
    if (anyBody && !allBodies) {
      throw new Error('Either all carousel cards must have body text, or none.');
    }
    if (!allBodies) {
      throw new Error('Each carousel card must have body text (up to 160 characters).');
    }
    const buttonLayouts = cards.map((card) => buildCarouselMetaButtonsForCard(card));
    cards.forEach((card, idx) => {
      if (String(card.body || '').length > CAROUSEL_BODY_MAX) {
        throw new Error(`Card ${idx + 1} body exceeds ${CAROUSEL_BODY_MAX} characters.`);
      }
      const metaButtons = buttonLayouts[idx];
      if (metaButtons.length < 1) {
        throw new Error(`Card ${idx + 1} must have at least one URL button.`);
      }
    });
    const expectedBtnCount = buttonLayouts[0]?.length || 0;
    if (buttonLayouts.some((layout) => layout.length !== expectedBtnCount)) {
      throw new Error('All carousel cards must have the same number of URL buttons (Meta requirement).');
    }

    const mainBodyText = String(effectiveForm.content || '').trim();
    if (!mainBodyText) {
      throw new Error(
        'Carousel templates need an intro message (main body text shown above the cards). Meta requires this.'
      );
    }
    if (mainBodyText.length > CAROUSEL_MAIN_BODY_MAX) {
      throw new Error(`Intro message must be at most ${CAROUSEL_MAIN_BODY_MAX} characters.`);
    }

    const mediaFormat = effectiveForm.carouselMediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE';
    const metaCards = cards.map((card, cardIdx) => {
      const metaButtons = buttonLayouts[cardIdx];
      return {
        components: [
          { type: 'HEADER', format: mediaFormat },
          { type: 'BODY', text: String(card.body).trim() },
          { type: 'BUTTONS', buttons: metaButtons },
        ],
      };
    });

    const carouselComponents = [
      { type: 'BODY', text: mainBodyText },
      { type: 'CAROUSEL', cards: metaCards },
    ];
    if (String(effectiveForm.footer || '').trim()) {
      carouselComponents.push({ type: 'FOOTER', text: effectiveForm.footer.trim() });
    }

    return {
      name: normalizedName,
      category: 'MARKETING',
      language: effectiveForm.language,
      templateMeta: {
        templateType: 'carousel',
        carouselMediaType: mediaFormat,
        carouselCards: effectiveForm.carouselCards,
        carouselMainBody: mainBodyText,
        footer: String(effectiveForm.footer || '').trim(),
      },
      components: carouselComponents.map((c) => ({
        ...c,
        type: String(c.type || '').toUpperCase(),
      })),
    };
  }

  const bodyText = String(effectiveForm.content || '').trim();
  if (!bodyText) {
    throw new Error('Template body is required.');
  }

  const components = [{ type: 'BODY', text: bodyText }];

  const mediaFormat = { image: 'IMAGE', video: 'VIDEO', document: 'DOCUMENT' }[effectiveForm.templateType];
  if (mediaFormat) {
    components.unshift({ type: 'HEADER', format: mediaFormat });
  }

  if (String(effectiveForm.footer || '').trim()) {
    components.push({ type: 'FOOTER', text: effectiveForm.footer.trim() });
  }

  const buttons = buildMetaButtons(effectiveForm);
  if (buttons.length > 0) {
    components.push({ type: 'BUTTONS', buttons });
  }

  const existingHeaderMediaUrl = String(effectiveForm.headerMediaUrl || '').trim() || null;

  return {
    name: normalizedName,
    category,
    language: effectiveForm.language,
    templateMeta: {
      templateType: effectiveForm.templateType || 'text',
      actionMode: effectiveForm.actionMode,
      callToActions: effectiveForm.callToActions,
      quickReplies: effectiveForm.quickReplies,
      footer: String(effectiveForm.footer || '').trim(),
      interactiveButtons: buildInteractiveButtonsFromForm(effectiveForm),
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
  if (!raw.trim()) {
    return (
      <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>
        Template body will appear here…
      </span>
    );
  }
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

function CarouselCardNavigator({
  cards,
  activeIndex,
  onActiveIndexChange,
  mediaLabel,
  onAddCard,
  onRemoveActive,
  canRemove,
  maxCards,
}) {
  const count = cards.length;
  const safeIndex = count ? Math.min(Math.max(0, activeIndex), count - 1) : 0;
  const activeCard = cards[safeIndex];

  const goPrev = () => onActiveIndexChange(Math.max(0, safeIndex - 1));
  const goNext = () => onActiveIndexChange(Math.min(count - 1, safeIndex + 1));

  return (
    <div className="space-y-3">
      <div className="relative flex items-center justify-center gap-2 min-h-[140px]">
        {count > 1 ? (
          <button
            type="button"
            onClick={goPrev}
            disabled={safeIndex <= 0}
            aria-label="Previous card"
            className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700/90 text-white shadow-md hover:bg-slate-800 disabled:opacity-30"
          >
            ‹
          </button>
        ) : (
          <div className="w-9 shrink-0" />
        )}
        <div className="relative w-full max-w-[240px]">
          {count > 1 && safeIndex > 0 ? (
            <div
              aria-hidden
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[18px] h-[100px] rounded-l-lg bg-white border border-slate-200 shadow-sm opacity-60"
            />
          ) : null}
          {count > 1 && safeIndex < count - 1 ? (
            <div
              aria-hidden
              className="absolute right-0 top-1/2 -translate-y-1/2 w-[18px] h-[100px] rounded-r-lg bg-white border border-slate-200 shadow-sm opacity-60"
            />
          ) : null}
          <div className="relative mx-auto w-full rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {canRemove ? (
              <button
                type="button"
                onClick={() => activeCard && onRemoveActive(activeCard.id)}
                className="absolute right-2 top-2 z-10 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                aria-label="Remove card"
              >
                🗑
              </button>
            ) : null}
            <div className="h-28 flex flex-col items-center justify-center bg-gradient-to-b from-slate-100 to-slate-50 text-slate-400">
              <span className="text-2xl mb-1" aria-hidden>
                {mediaLabel === 'Video' ? '🎬' : '🖼'}
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide">
                {mediaLabel} · Card {safeIndex + 1}
              </span>
            </div>
          </div>
        </div>
        {count > 1 ? (
          <button
            type="button"
            onClick={goNext}
            disabled={safeIndex >= count - 1}
            aria-label="Next card"
            className="z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700/90 text-white shadow-md hover:bg-slate-800 disabled:opacity-30"
          >
            ›
          </button>
        ) : (
          <div className="w-9 shrink-0" />
        )}
      </div>
      {count > 1 ? (
        <div className="flex justify-center gap-1.5">
          {cards.map((card, i) => (
            <button
              key={card.id || i}
              type="button"
              onClick={() => onActiveIndexChange(i)}
              aria-label={`Go to card ${i + 1}`}
              className={`h-2 w-2 rounded-full transition ${
                i === safeIndex ? 'bg-slate-600' : 'bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      ) : null}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onAddCard}
          disabled={count >= maxCards}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
        >
          + Add Card
        </button>
      </div>
    </div>
  );
}

function TemplatePreview({ form, carouselActiveIndex = 0, onCarouselActiveIndex }) {
  const interactiveButtons = buildInteractiveButtonsFromForm(withEffectiveActionMode(form));

  const typeKey = String(form.templateType || 'text').toLowerCase();
  const isCarousel = typeKey === 'carousel';
  const carouselMedia = form.carouselMediaType === 'VIDEO' ? 'Video' : 'Image';
  const mediaMeta = {
    image: { label: 'Image', icon: '🖼' },
    video: { label: 'Video', icon: '🎬' },
    document: { label: 'Document', icon: '📄' },
    location: { label: 'Location', icon: '📍' },
    carousel: { label: 'Carousel', icon: '🗂' },
  }[typeKey];

  return (
    <div>
      <div className="rounded-2xl border border-slate-200/90 dark:border-slate-600/90 bg-gradient-to-br from-white via-slate-50 to-emerald-50/30 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900/95 p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Live Preview</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">WhatsApp message appearance</p>
          </div>
          <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200/80 dark:ring-emerald-700/50">
            Real-time
          </span>
        </div>
        <div className="mx-auto max-w-[280px] rounded-[1.85rem] border-[7px] border-slate-900 dark:border-slate-700 bg-[#e5ddd5] dark:bg-[#0b141a] p-3 shadow-2xl">
          <div
            className="rounded-2xl overflow-hidden shadow-sm"
            style={{ backgroundColor: '#ffffff', color: '#111b21' }}
          >
            {mediaMeta && !isCarousel ? (
              <div
                className="border-b border-slate-200 px-3 py-9 text-center"
                style={{ background: 'linear-gradient(to bottom, #f1f5f9, #f8fafc)', color: '#64748b' }}
              >
                <div className="text-2xl mb-2" aria-hidden>
                  {mediaMeta.icon}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest">
                  {mediaMeta.label}
                </p>
              </div>
            ) : null}
            {isCarousel ? (
              <div className="px-2 py-3 border-b border-slate-100">
                <p className="px-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                  {carouselMedia} carousel
                </p>
                {(() => {
                  const cards = form.carouselCards || [];
                  const idx = cards.length
                    ? Math.min(Math.max(0, carouselActiveIndex), cards.length - 1)
                    : 0;
                  const card = cards[idx];
                  const cardButtons = Array.isArray(card?.buttons) ? card.buttons : [];
                  const setIdx =
                    typeof onCarouselActiveIndex === 'function' ? onCarouselActiveIndex : () => {};
                  return (
                    <div className="space-y-2">
                      {cards.length > 1 ? (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setIdx(Math.max(0, idx - 1))}
                            disabled={idx <= 0}
                            className="text-slate-500 text-lg disabled:opacity-30"
                            aria-label="Previous card preview"
                          >
                            ‹
                          </button>
                          <span className="text-[10px] text-slate-500">
                            {idx + 1} / {cards.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => setIdx(Math.min(cards.length - 1, idx + 1))}
                            disabled={idx >= cards.length - 1}
                            className="text-slate-500 text-lg disabled:opacity-30"
                            aria-label="Next card preview"
                          >
                            ›
                          </button>
                        </div>
                      ) : null}
                      {card ? (
                        <div className="mx-auto max-w-[210px] rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
                          <div className="h-24 flex items-center justify-center bg-gradient-to-b from-slate-100 to-slate-50 text-slate-400 text-xs font-semibold">
                            {carouselMedia} {idx + 1}
                          </div>
                          <div className="px-2.5 py-2 text-[12px] leading-snug text-[#111b21] min-h-[52px] whitespace-pre-wrap break-words">
                            {String(card.body || '').trim() ? card.body : 'Card body…'}
                          </div>
                          {cardButtons.length > 0 ? (
                            <div className="border-t border-slate-200">
                              {cardButtons.map((btn, bi) => (
                                <div
                                  key={btn.id || `${card.id}-btn-${bi}`}
                                  className="px-2 py-2 text-[11px] font-semibold text-[#008069] text-center border-t border-slate-100 first:border-t-0"
                                >
                                  {carouselPreviewButtonLabel(btn, bi)}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div
                className="px-3.5 py-3.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words min-h-[80px]"
                style={{ color: '#111b21' }}
              >
                {formatPreviewBody(
                  String(form.category).toLowerCase() === 'authentication'
                    ? 'Your OTP is {{1}}. Do not share it with anyone.'
                    : form.content
                )}
              </div>
            )}
            {String(form.footer || '').trim() ? (
              <div className="px-3.5 pb-2.5 text-[11px]" style={{ color: '#667781' }}>
                {form.footer}
              </div>
            ) : null}
            {!isCarousel && interactiveButtons.length > 0 ? (
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
          <p className="mt-2.5 text-[10px] text-center text-slate-600 dark:text-slate-400 font-medium">
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
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    const next = initialForm ? { ...emptyLocalTemplateForm(), ...initialForm } : emptyLocalTemplateForm();
    setForm(next);
    setFormError('');
    setActiveCarouselIndex(0);
  }, [open, initialForm]);

  useEffect(() => {
    const len = (form.carouselCards || []).length;
    if (len && activeCarouselIndex >= len) {
      setActiveCarouselIndex(Math.max(0, len - 1));
    }
  }, [form.carouselCards, activeCarouselIndex]);

  const isAuth = String(form.category).toLowerCase() === 'authentication';
  const isCarousel = String(form.templateType || '').toLowerCase() === 'carousel';

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

  const updateCarouselCard = (cardId, patch) => {
    setFormError('');
    setForm((prev) => ({
      ...prev,
      carouselCards: (prev.carouselCards || []).map((card) =>
        card.id === cardId ? { ...card, ...patch } : card
      ),
    }));
  };

  const updateCarouselButton = (cardId, buttonId, patch) => {
    setFormError('');
    setForm((prev) => ({
      ...prev,
      carouselCards: (prev.carouselCards || []).map((card) => {
        if (card.id !== cardId) return card;
        return {
          ...card,
          buttons: (card.buttons || []).map((btn) =>
            btn.id === buttonId ? { ...btn, ...patch } : btn
          ),
        };
      }),
    }));
  };

  const addCarouselCard = () => {
    setForm((prev) => {
      const cards = Array.isArray(prev.carouselCards) ? [...prev.carouselCards] : [];
      if (cards.length >= CAROUSEL_MAX_CARDS) return prev;
      const templateCard = cards[0];
      const templateButtons = (templateCard?.buttons || []).map((btn, i) => ({
        ...createCarouselButton(),
        type: 'url',
        label: '',
        value: '',
        id: `cbtn-new-${Date.now()}-${i}`,
      }));
      const newCard = {
        ...createCarouselCard(cards.length + 1),
        buttons: templateButtons.length ? templateButtons : [createCarouselButton()],
      };
      const nextCards = [...cards, newCard];
      setActiveCarouselIndex(nextCards.length - 1);
      return { ...prev, carouselCards: nextCards };
    });
  };

  const removeCarouselCard = (cardId) => {
    setForm((prev) => {
      const cards = (prev.carouselCards || []).filter((c) => c.id !== cardId);
      if (cards.length < CAROUSEL_MIN_CARDS) return prev;
      const removedIdx = (prev.carouselCards || []).findIndex((c) => c.id === cardId);
      setActiveCarouselIndex((i) => {
        if (removedIdx < 0) return i;
        if (i > removedIdx) return i - 1;
        if (i >= cards.length) return Math.max(0, cards.length - 1);
        return i;
      });
      return { ...prev, carouselCards: cards };
    });
  };

  const addCarouselButton = (cardId) => {
    setForm((prev) => ({
      ...prev,
      carouselCards: (prev.carouselCards || []).map((card) => {
        const buttons = Array.isArray(card.buttons) ? card.buttons : [];
        if (buttons.length >= 2) return card;
        return { ...card, buttons: [...buttons, createCarouselButton()] };
      }),
    }));
  };

  const removeCarouselButton = (cardId, buttonId) => {
    setForm((prev) => {
      const cards = prev.carouselCards || [];
      const target = cards.find((c) => c.id === cardId);
      const btnIdx = (target?.buttons || []).findIndex((b) => b.id === buttonId);
      if (btnIdx < 0) return prev;
      return {
        ...prev,
        carouselCards: cards.map((card) => {
          const buttons = [...(card.buttons || [])];
          if (buttons.length <= 1) return card;
          buttons.splice(btnIdx, 1);
          return { ...card, buttons };
        }),
      };
    });
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
                <TemplatePreview
                  form={form}
                  carouselActiveIndex={activeCarouselIndex}
                  onCarouselActiveIndex={setActiveCarouselIndex}
                />
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
                      value={isCarousel ? 'marketing' : form.category}
                      onChange={(e) => setField('category', e.target.value)}
                      disabled={isCarousel}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormError('');
                        setForm((prev) => {
                          const next = { ...prev, templateType: value };
                          if (value === 'carousel') {
                            next.category = 'marketing';
                            if (
                              !Array.isArray(next.carouselCards) ||
                              next.carouselCards.length < CAROUSEL_MIN_CARDS
                            ) {
                              next.carouselCards = [createCarouselCard(1), createCarouselCard(2)];
                            }
                          }
                          return next;
                        });
                      }}
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
                ) : isCarousel ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 text-xs text-amber-900">
                      Carousel templates are <strong>Marketing</strong> only. Meta requires an{' '}
                      <strong>intro message</strong> above the cards, plus per-card media, body (max{' '}
                      {CAROUSEL_BODY_MAX} chars), and 1–2 <strong>URL</strong> buttons (same count on
                      every card).
                    </div>
                    <div>
                      <label className={labelClass}>Intro message (above carousel) *</label>
                      <p className="text-[11px] text-slate-500 mb-2">
                        Shown above the swipeable cards. Required by Meta (max {CAROUSEL_MAIN_BODY_MAX}{' '}
                        characters).
                      </p>
                      <textarea
                        value={form.content}
                        onChange={(e) => setField('content', e.target.value)}
                        maxLength={CAROUSEL_MAIN_BODY_MAX}
                        rows={3}
                        placeholder="e.g. Check out our latest offers below!"
                        className={`${fieldClass} resize-y min-h-[72px]`}
                      />
                      <p className="mt-1 text-[11px] text-slate-400 text-right">
                        {String(form.content || '').length}/{CAROUSEL_MAIN_BODY_MAX}
                      </p>
                    </div>
                    <div>
                      <label className={labelClass}>Carousel Media Type</label>
                      <select
                        value={form.carouselMediaType || 'IMAGE'}
                        onChange={(e) => setField('carouselMediaType', e.target.value)}
                        className={fieldClass}
                      >
                        <option value="IMAGE">IMAGE</option>
                        <option value="VIDEO">VIDEO</option>
                      </select>
                    </div>
                    <CarouselCardNavigator
                      cards={form.carouselCards || []}
                      activeIndex={activeCarouselIndex}
                      onActiveIndexChange={setActiveCarouselIndex}
                      mediaLabel={form.carouselMediaType === 'VIDEO' ? 'Video' : 'Image'}
                      onAddCard={addCarouselCard}
                      onRemoveActive={removeCarouselCard}
                      canRemove={(form.carouselCards || []).length > CAROUSEL_MIN_CARDS}
                      maxCards={CAROUSEL_MAX_CARDS}
                    />
                    {(() => {
                      const cards = form.carouselCards || [];
                      const cardIdx = cards.length
                        ? Math.min(Math.max(0, activeCarouselIndex), cards.length - 1)
                        : 0;
                      const card = cards[cardIdx];
                      if (!card) return null;
                      return (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
                          <p className="text-sm font-bold text-slate-800 border-b border-slate-200/80 pb-2">
                            Edit card {cardIdx + 1}
                          </p>
                          <div>
                            <label className={labelClass}>Body *</label>
                            <textarea
                              value={card.body || ''}
                              onChange={(e) => updateCarouselCard(card.id, { body: e.target.value })}
                              maxLength={CAROUSEL_BODY_MAX}
                              rows={3}
                              placeholder="Card message body"
                              className={`${fieldClass} resize-y min-h-[72px]`}
                            />
                            <p className="mt-1 text-[11px] text-slate-400 text-right">
                              {String(card.body || '').length}/{CAROUSEL_BODY_MAX}
                            </p>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                URL buttons (min 1) *
                              </label>
                              <button
                                type="button"
                                onClick={() => addCarouselButton(card.id)}
                                disabled={(card.buttons || []).length >= 2}
                                className="text-xs font-semibold text-emerald-700 hover:underline disabled:opacity-40"
                              >
                                + Add button
                              </button>
                            </div>
                            {(card.buttons || []).map((btn, btnIdx) => (
                              <div
                                key={btn.id}
                                className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3"
                              >
                                <div className="sm:col-span-2">
                                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    Button label *
                                  </label>
                                  <input
                                    type="text"
                                    value={btn.label}
                                    onChange={(e) =>
                                      updateCarouselButton(card.id, btn.id, {
                                        label: e.target.value,
                                        type: 'url',
                                      })
                                    }
                                    className={compactFieldClass}
                                    placeholder={`Button ${btnIdx + 1}`}
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                    HTTPS URL *
                                  </label>
                                  <input
                                    type="text"
                                    value={btn.value}
                                    onChange={(e) =>
                                      updateCarouselButton(card.id, btn.id, {
                                        value: e.target.value,
                                        type: 'url',
                                      })
                                    }
                                    className={compactFieldClass}
                                    placeholder="https://example.com"
                                  />
                                </div>
                                <div className="sm:col-span-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => removeCarouselButton(card.id, btn.id)}
                                    disabled={(card.buttons || []).length <= 1}
                                    className="text-xs text-rose-600 hover:underline disabled:opacity-40"
                                  >
                                    Remove button
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div>
                    <label className={labelClass}>Template Format *</label>
                    <textarea
                      value={form.content}
                      onChange={(e) => setField('content', e.target.value)}
                      required={!isCarousel}
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

              {!isCarousel ? (
              <section className="rounded-xl border border-slate-200/80 bg-white p-3 sm:p-4 shadow-sm space-y-4 min-w-0">
                <div className="border-b border-slate-100 pb-2">
                  <h4 className="text-sm font-bold text-slate-900">Interactive actions</h4>
                  <p className="mt-1 text-xs text-slate-500">Add buttons recipients can tap in the WhatsApp message.</p>
                </div>

                <div className="min-w-0">
                  <label className={labelClass}>Action type</label>
                  <div
                    className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                    role="radiogroup"
                    aria-label="Action type"
                  >
                    {ACTION_MODE_OPTIONS.map((opt) => {
                      const selected = form.actionMode === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={`relative flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border px-2 py-2.5 text-center transition ${
                            selected
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm ring-2 ring-emerald-500/25'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="actionMode"
                            value={opt.value}
                            checked={selected}
                            onChange={(e) => setField('actionMode', e.target.value)}
                            className="sr-only"
                          />
                          <span className="text-xs sm:text-sm font-semibold leading-tight">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {form.actionMode === 'none' ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-slate-600">No interactive buttons</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Choose Call to Action, Quick Replies, or All to configure buttons.
                    </p>
                  </div>
                ) : (
                  <div className="min-w-0 space-y-4">
                    {(form.actionMode === 'cta' || form.actionMode === 'all') && (
                      <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                          <div>
                            <p className="text-sm font-bold text-slate-800">Call to Action buttons</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">URL, phone, or label-only buttons</p>
                          </div>
                          <button
                            type="button"
                            onClick={addCta}
                            className="shrink-0 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 whitespace-nowrap"
                          >
                            + Add button
                          </button>
                        </div>
                        <div className="space-y-3">
                          {form.callToActions.map((cta, idx) => (
                            <div
                              key={cta.id}
                              className="min-w-0 space-y-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-sm"
                            >
                              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                Button {idx + 1}
                              </p>
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
                      </div>
                    )}

                    {(form.actionMode === 'quick_reply' || form.actionMode === 'all') && (
                      <div className="min-w-0 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
                          <div>
                            <p className="text-sm font-bold text-slate-800">Quick reply buttons</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">Preset replies shown under the message</p>
                          </div>
                          <button
                            type="button"
                            onClick={addQr}
                            className="shrink-0 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 whitespace-nowrap"
                          >
                            + Add quick reply
                          </button>
                        </div>
                        <div className="space-y-3">
                          {form.quickReplies.map((qr, idx) => (
                            <div
                              key={qr.id}
                              className="flex min-w-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-end"
                            >
                              <div className="min-w-0 flex-1">
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5 sm:sr-only">
                                  Quick reply {idx + 1}
                                </label>
                                <input
                                  type="text"
                                  value={qr.label}
                                  onChange={(e) => updateQr(qr.id, e.target.value)}
                                  placeholder={`Quick reply ${idx + 1}`}
                                  className={compactFieldClass}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => removeQr(qr.id)}
                                className="w-full shrink-0 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 sm:w-auto sm:min-w-[88px]"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
              ) : null}
            </div>

            <div className="hidden lg:flex min-h-0 w-full lg:w-[min(100%,300px)] xl:w-[320px] shrink-0 overflow-y-auto border-t lg:border-t-0 lg:border-l border-slate-100 bg-white p-3 sm:p-4">
              <TemplatePreview
                form={form}
                carouselActiveIndex={activeCarouselIndex}
                onCarouselActiveIndex={setActiveCarouselIndex}
              />
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
