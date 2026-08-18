/** True only for actual WhatsApp template sends — never plain chat or chatbot quick-replies. */
export function isActualTemplateSend(msg) {
  if (!msg) return false;
  if (msg.isTemplate || msg.isTemplateSend) return true;
  const content = String(msg.content || msg.message || '').trim();
  if (/^Template:\s*\S+/i.test(content)) return true;
  if (/^\[Template\]\s*\S+/i.test(content)) return true;
  const mt = String(msg.messageType || msg.mediaType || '').toLowerCase();
  return mt === 'template';
}

/** Merge two message records; keep WhatsApp template card fields from the richest source. */
export function mergeChatMessages(primary, secondary) {
  if (!primary) return secondary;
  if (!secondary) return primary;

  const a = primary;
  const b = secondary;
  const templateA = isActualTemplateSend(a) ? a : null;
  const templateB = isActualTemplateSend(b) ? b : null;
  const previewA = templateA?.templatePreview || templateA?.templateSnapshot || null;
  const previewB = templateB?.templatePreview || templateB?.templateSnapshot || null;
  const templateSource =
    [templateA, templateB].find((m) => m?.templatePreview || m?.templateSnapshot) ||
    templateA ||
    templateB;
  const mergedPreview = previewA && previewB
    ? {
        ...previewB,
        ...previewA,
        body: previewA.body || previewB.body || '',
        footer: previewA.footer || previewB.footer || '',
        headerImageUrl:
          previewA.headerImageUrl ||
          previewA.header?.url ||
          previewB.headerImageUrl ||
          previewB.header?.url ||
          a.mediaUrl ||
          b.mediaUrl ||
          null,
        header:
          previewA.header ||
          previewB.header ||
          (previewA.headerImageUrl ? { type: 'image', url: previewA.headerImageUrl } : null) ||
          (previewB.headerImageUrl ? { type: 'image', url: previewB.headerImageUrl } : null),
        buttons:
          (Array.isArray(previewA.buttons) && previewA.buttons.length ? previewA.buttons : null) ||
          previewB.buttons ||
          [],
        headerFormat: previewA.headerFormat || previewB.headerFormat || null,
        templateName: previewA.templateName || previewB.templateName || null,
      }
    : previewA || previewB || null;

  const headerImageUrl =
    mergedPreview?.headerImageUrl ||
    mergedPreview?.header?.url ||
    a.headerImageUrl ||
    b.headerImageUrl ||
    a.header?.url ||
    b.header?.url ||
    null;

  return {
    ...a,
    ...b,
    id: a.id || b.id,
    content: templateSource?.content || mergedPreview?.body || a.content || b.content,
    isTemplate: Boolean(templateA || templateB),
    isTemplateSend: Boolean(a.isTemplateSend || b.isTemplateSend),
    templateName: templateA?.templateName || templateB?.templateName || mergedPreview?.templateName || null,
    templatePreview: mergedPreview,
    templateSnapshot: mergedPreview,
    header: mergedPreview?.header || a.header || b.header || (headerImageUrl ? { type: 'image', url: headerImageUrl } : null),
    footer: mergedPreview?.footer || a.footer || b.footer,
    buttons: mergedPreview?.buttons || a.buttons || b.buttons,
    mediaUrl: a.mediaUrl || b.mediaUrl || headerImageUrl || null,
    payload: a.payload || b.payload,
    waMessageId: a.waMessageId || b.waMessageId || null,
    status: a.status || b.status,
    sentAt: a.sentAt || b.sentAt || a.createdAt || b.createdAt,
    createdAt: a.createdAt || b.createdAt,
    source: mergedPreview
      ? (previewA ? a.source : b.source)
      : a.source || b.source,
  };
}

export function messageHasTemplateCard(msg) {
  return isActualTemplateSend(msg) && Boolean(msg?.templatePreview || msg?.templateName);
}

function normalizeDedupeContent(text) {
  return String(text || '').trim().replace(/\s+/g, ' ');
}

function getTemplatePreviewBody(msg) {
  const preview = msg?.templatePreview || msg?.templateSnapshot;
  return normalizeDedupeContent(preview?.body || '');
}

/** Match plain live_chat rows with enriched inbox template rows (different content strings). */
export function messagesMatchForDedupe(a, b) {
  if (!a || !b) return false;
  const typeA = String(a.type || '');
  const typeB = String(b.type || '');
  if (typeA !== typeB) return false;

  const timeA = new Date(a.sentAt || a.createdAt || 0).getTime();
  const timeB = new Date(b.sentAt || b.createdAt || 0).getTime();
  const timeDiff = Math.abs(timeA - timeB);

  if (a.waMessageId && b.waMessageId && a.waMessageId === b.waMessageId) return true;

  const contentA = normalizeDedupeContent(a.content || a.message);
  const contentB = normalizeDedupeContent(b.content || b.message);

  if (contentA.length >= 2 && contentA === contentB && timeDiff <= 15000) return true;

  const templateA = isActualTemplateSend(a);
  const templateB = isActualTemplateSend(b);
  if (!templateA && !templateB) return false;

  const previewA = getTemplatePreviewBody(a);
  const previewB = getTemplatePreviewBody(b);
  const windowMs = 60000;
  if (timeDiff > windowMs) return false;

  if (previewA && contentB && previewA === contentB) return true;
  if (previewB && contentA && previewB === contentA) return true;
  if (previewA && previewB && previewA === previewB) return true;

  return false;
}

/** Dedupe message list — prefer inbox template cards over plain live_chat duplicates. */
export function dedupeChatMessages(messages) {
  const result = [];
  for (const msg of messages) {
    let duplicateIdx = -1;
    if (msg.waMessageId) {
      duplicateIdx = result.findIndex((existing) => existing.waMessageId === msg.waMessageId);
    }
    if (duplicateIdx === -1) {
      duplicateIdx = result.findIndex((existing) => messagesMatchForDedupe(existing, msg));
    }
    if (duplicateIdx === -1) {
      result.push(msg);
    } else {
      const existing = result[duplicateIdx];
      const prefer =
        messageHasTemplateCard(msg) && !messageHasTemplateCard(existing) ? msg : existing;
      const other = prefer === msg ? existing : msg;
      result[duplicateIdx] = mergeChatMessages(prefer, other);
    }
  }
  return result.sort((a, b) => {
    const dateA = new Date(a.sentAt || a.createdAt || 0);
    const dateB = new Date(b.sentAt || b.createdAt || 0);
    return dateA - dateB;
  });
}
