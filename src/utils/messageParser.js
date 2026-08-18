/**
 * Normalize any message source (webhook, API, socket) into one renderer-ready object.
 * React UI should only consume normalized messages — never raw webhook JSON.
 */

import { resolvePublicMediaUrl, resolveWhatsAppMediaUrl } from './mediaUrl';

const MEDIA_TYPES = new Set([
  'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'contacts',
]);

function parsePayload(raw) {
  if (!raw) return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function isTemplateMarkerContent(text) {
  const value = String(text || '').trim();
  return /^Template:\s*\S+/i.test(value) || /^\[Template\]\s*\S+/i.test(value);
}

function extractTrailingImageFromText(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const lines = raw.split('\n');
  const lastLine = String(lines[lines.length - 1] || '').trim();
  const urlMatch = lastLine.match(/^https?:\/\/\S+$/i);
  if (!urlMatch) return null;

  const url = urlMatch[0];
  const isImage =
    /\.(jpe?g|png|webp|gif|bmp)(\?|#|$)/i.test(url) ||
    /\/(?:api\/)?uploads\//i.test(url);
  if (!isImage) return null;

  const caption = lines.slice(0, -1).join('\n').replace(/\n+$/, '').trim();
  return { url, caption };
}

function resolveDirection(raw) {
  const d = String(raw?.direction || raw?.type || raw?.sender || '').toLowerCase();
  if (d === 'incoming' || d === 'inbound' || d === 'customer') return 'incoming';
  if (d === 'outgoing' || d === 'outbound' || d === 'agent') return 'outgoing';
  if (d === 'system') return 'system';
  return raw?.type === 'outgoing' ? 'outgoing' : 'incoming';
}

function resolveMessageType(raw, payload) {
  if (raw?.isTemplate || raw?.isTemplateSend) return 'template';
  const payloadType = payload?.type ? String(payload.type).toLowerCase() : '';
  const storedType = String(
    raw?.messageType || raw?.mediaType || raw?.message_type || ''
  ).toLowerCase();

  // Prefer rich payload type when DB only stored enum 'text' but payload has image/video/etc.
  const baseType =
    storedType && storedType !== 'text'
      ? storedType
      : payloadType || storedType || 'text';

  if (baseType === 'button') return 'interactive';
  if (baseType === 'contacts') return 'contact';
  if (baseType === 'interactive') {
    const iType = String(payload?.interactive?.type || raw?.interactiveType || '').toLowerCase();
    if (iType === 'list_reply') return 'list';
    if (iType === 'nfm_reply') return 'flow';
    return 'interactive';
  }
  return baseType || 'text';
}

function extractContent(raw, payload, messageType) {
  const direct = String(raw?.content || raw?.message || raw?.message_text || raw?.text || '').trim();
  if (direct && !isTemplateMarkerContent(direct)) return direct;

  if (messageType === 'text' && payload?.text?.body) return payload.text.body;
  if (messageType === 'image') return payload?.image?.caption || '';
  if (messageType === 'video') return payload?.video?.caption || '';
  if (messageType === 'document') return payload?.document?.caption || '';
  if (messageType === 'interactive' || messageType === 'list') {
    const outboundBody =
      payload?.interactive?.body?.text ||
      payload?.text?.body ||
      '';
    return (
      raw?.selectedOption ||
      payload?.interactive?.button_reply?.title ||
      payload?.interactive?.list_reply?.title ||
      payload?.button?.text ||
      outboundBody ||
      direct
    );
  }
  if (messageType === 'location') {
    return payload?.location?.name || payload?.location?.address || direct || 'Location';
  }
  if (messageType === 'contact') {
    return payload?.contacts?.[0]?.name?.formatted_name || direct || 'Contact';
  }
  return direct;
}

/**
 * @param {object} raw - message from API, socket, or DB row
 * @param {string} [source] - inbox_message | live_chat | meta_message | socket | webhook
 */
export function normalizeMessage(raw, source = 'unknown') {
  if (!raw) return null;

  const payload = parsePayload(raw.payload) || parsePayload(raw.rawPayload) || raw.payload || null;
  const direction = resolveDirection(raw);
  let messageType = resolveMessageType(raw, payload);
  let content = extractContent(raw, payload, messageType);

  let templatePreview = raw.templatePreview || null;
  if (typeof templatePreview === 'string') {
    try {
      templatePreview = JSON.parse(templatePreview);
    } catch {
      templatePreview = null;
    }
  }

  // Flatten API template fields into preview when snapshot is partial
  if (raw.header || raw.buttons || raw.footer) {
    templatePreview = {
      ...(templatePreview || {}),
      header: raw.header || templatePreview?.header || null,
      footer: raw.footer ?? templatePreview?.footer ?? '',
      buttons: Array.isArray(raw.buttons) && raw.buttons.length
        ? raw.buttons
        : templatePreview?.buttons || [],
      headerImageUrl:
        templatePreview?.headerImageUrl ||
        raw.header?.url ||
        raw.mediaUrl ||
        null,
      body: templatePreview?.body || content,
      templateName: templatePreview?.templateName || raw.templateName || null,
    };
    if (templatePreview.header?.url && !templatePreview.headerImageUrl) {
      templatePreview.headerImageUrl = templatePreview.header.url;
    }
  }

  const timestamp =
    raw.sentAt || raw.createdAt || raw.created_at || raw.timestamp || raw.received_at || null;

  // const apiBase =
  //   process.env.REACT_APP_API_URL?.replace(/\/api\/?$/i, '') || 'https://wabizx.techwhizzc.com';
  const apiBase =
    process.env.REACT_APP_API_URL?.replace(/\/api\/?$/i, '') || 'https://api.waabizx.com';

  let resolvedMediaUrl = (() => {
    const direct = raw.mediaUrl || raw.url;
    if (direct) {
      const pub = resolvePublicMediaUrl(direct, apiBase);
      if (pub) return pub;
    }
    return resolveWhatsAppMediaUrl(
      {
        mediaUrl: raw.mediaUrl,
        mediaId: raw.mediaId,
        payload,
        image: raw.image,
        video: raw.video,
        audio: raw.audio,
        document: raw.document,
      },
      apiBase
    );
  })();

  if (messageType === 'text' && !resolvedMediaUrl) {
    const trailingImage = extractTrailingImageFromText(content);
    if (trailingImage) {
      resolvedMediaUrl =
        resolvePublicMediaUrl(trailingImage.url, apiBase) || trailingImage.url;
      content = trailingImage.caption;
      messageType = 'image';
    }
  }

  if (!resolvedMediaUrl && payload) {
    const payloadLink =
      payload?.image?.link ||
      payload?.video?.link ||
      payload?.interactive?.header?.image?.link ||
      payload?.interactive?.header?.video?.link ||
      null;
    if (payloadLink) {
      resolvedMediaUrl = resolvePublicMediaUrl(payloadLink, apiBase) || payloadLink;
      if (messageType === 'text' && payload?.type) {
        const payloadType = String(payload.type).toLowerCase();
        if (payloadType === 'image' || payloadType === 'video') {
          messageType = payloadType;
        }
      }
    }
  }

  return {
    id: raw.id != null ? raw.id : `msg_${Date.now()}`,
    messageId: raw.waMessageId || raw.messageId || payload?.id || null,
    source: raw.source || source,
    direction,
    type: direction === 'system' ? 'system' : direction,
    messageType,
    content,
    status: raw.status || 'delivered',
    sentAt: timestamp,
    createdAt: timestamp,
    phone: raw.phone || null,
    contactId: raw.contactId || null,
    conversationId: raw.conversation_id || raw.conversationId || null,
    isTemplate: Boolean(raw.isTemplate || raw.isTemplateSend || messageType === 'template'),
    isTemplateSend: Boolean(raw.isTemplateSend || raw.isTemplate),
    templateName: raw.templateName || raw.template_name || null,
    templatePreview,
    templateSnapshot: templatePreview,
    header: raw.header || templatePreview?.header || null,
    footer: raw.footer ?? templatePreview?.footer,
    buttons: raw.buttons || templatePreview?.buttons,
    mediaUrl: resolvedMediaUrl || null,
    mediaFilename: raw.mediaFilename || payload?.document?.filename || payload?.video?.filename || null,
    mediaId:
      raw.mediaId ||
      payload?.image?.id ||
      payload?.video?.id ||
      payload?.audio?.id ||
      payload?.document?.id ||
      payload?.sticker?.id ||
      null,
    mimeType: raw.mimeType || payload?.image?.mime_type || payload?.video?.mime_type || null,
    payload,
    image: raw.image || payload?.image || null,
    video: raw.video || payload?.video || null,
    audio: raw.audio || payload?.audio || null,
    document: raw.document || payload?.document || null,
    interactive: raw.interactive || payload?.interactive || null,
    button: raw.button || payload?.button || null,
    location: raw.location || payload?.location || null,
    latitude: raw.latitude ?? payload?.location?.latitude,
    longitude: raw.longitude ?? payload?.location?.longitude,
    locationName: raw.locationName || payload?.location?.name || null,
    locationAddress: raw.locationAddress || payload?.location?.address || null,
    contacts: raw.contacts || payload?.contacts || null,
    selectedOption: raw.selectedOption || null,
    interactiveType: raw.interactiveType || payload?.interactive?.type || null,
    buttons:
      Array.isArray(raw.buttons) && raw.buttons.length
        ? raw.buttons
        : Array.isArray(templatePreview?.buttons) && templatePreview.buttons.length
          ? templatePreview.buttons
          : undefined,
    sender: raw.sender || (direction === 'incoming' ? 'customer' : direction === 'outgoing' ? 'agent' : 'system'),
    replyTo: raw.replyTo || null,
  };
}

export function normalizeMessageList(rows, source = 'unknown') {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeMessage(row, source)).filter(Boolean);
}

/** Renderer switch key — maps normalized message to component case */
export function getMessageRenderType(message) {
  if (!message) return null;
  if (message.type === 'system' || message.direction === 'system') return 'system';
  if (message.isTemplate || message.isTemplateSend || message.messageType === 'template') {
    return 'template';
  }
  const mt = String(message.messageType || 'text').toLowerCase();
  switch (mt) {
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    case 'document':
      return 'document';
    case 'sticker':
      return 'sticker';
    case 'location':
      return 'location';
    case 'contact':
    case 'contacts':
      return 'contact';
    case 'interactive':
    case 'button':
      return 'interactive';
    case 'list':
      return 'list';
    case 'flow':
      return 'flow';
    default:
      return MEDIA_TYPES.has(mt) ? mt : 'text';
  }
}

export function isMediaMessage(message) {
  const t = getMessageRenderType(message);
  return ['image', 'video', 'audio', 'document', 'sticker'].includes(t);
}
