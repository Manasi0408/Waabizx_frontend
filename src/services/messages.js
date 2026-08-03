import { normalizeMessage, normalizeMessageList } from '../utils/messageParser';
import { getContactMessages } from './inboxService';
import { getMessages as getLiveChatMessages } from '../api/chatApi';

export { normalizeMessage, normalizeMessageList };

export async function fetchInboxMessages(phone) {
  const data = await getContactMessages(phone);
  return normalizeMessageList(data?.messages || [], 'inbox_message');
}

export async function fetchLiveChatMessages(conversationId) {
  const rows = await getLiveChatMessages(conversationId);
  return normalizeMessageList(Array.isArray(rows) ? rows : rows?.messages || [], 'live_chat');
}

/** Merge socket payload into message list with dedupe by id / waMessageId */
export function appendSocketMessage(prev, incoming, source = 'socket') {
  const normalized = normalizeMessage(incoming, source);
  if (!normalized) return prev;

  const exists = prev.some(
    (m) =>
      (m.id && m.id === normalized.id) ||
      (m.waMessageId && normalized.messageId && m.waMessageId === normalized.messageId)
  );
  if (exists) return prev;

  return [...prev, { ...incoming, ...normalized, source }].sort((a, b) => {
    const ta = new Date(a.sentAt || a.createdAt || 0).getTime();
    const tb = new Date(b.sentAt || b.createdAt || 0).getTime();
    return ta - tb;
  });
}
