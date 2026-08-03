import React from 'react';
import ChatMessageItem from './ChatMessageItem';

// export const INBOX_API_BASE = 'https://wabizx.techwhizzc.com/';
export const INBOX_API_BASE = 'https://api.waabizx.com/';

export function personalizeSystemText(text, userName) {
  const raw = String(userName || "").trim();
  if (!raw || !text) return text;
  let out = String(text);
  for (const name of [raw, raw.toUpperCase(), raw.toLowerCase()]) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`\\bby ${esc}\\b`, "i"), "by you");
    out = out.replace(new RegExp(`\\bto ${esc}\\b`, "i"), "to you");
    out = out.replace(new RegExp(`\\bfrom ${esc}\\b`, "i"), "from you");
  }
  return out;
}

export function getMessageTimestamp(msg) {
  if (!msg || typeof msg !== 'object') return null;
  return msg.sentAt || msg.createdAt || msg.timestamp || msg.received_at || msg.created_at || msg.updatedAt || null;
}

/**
 * Shared WhatsApp-style message list — same rendering as Admin Inbox → Intervened.
 */
export default function InboxMessageThread({
  messages,
  templateCatalog,
  apiBase = INBOX_API_BASE,
  formatMessageTime,
  userName = '',
  onButtonClick,
  messagesEndRef,
}) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  return (
    <>
      {messages.map((message, index) => {
        const messageKey =
          message.id ||
          `msg_${message.source || 'unknown'}_${index}_${getMessageTimestamp(message) || Date.now()}`;

        if (
          message.type === 'system' ||
          message.source === 'system' ||
          message.sender === 'system'
        ) {
          return (
            <div key={messageKey} className="flex justify-center mb-3">
              <span className="text-xs font-medium text-gray-600 px-4 py-2 rounded-lg bg-gray-100 border border-gray-200/90 text-center max-w-md shadow-sm">
                {personalizeSystemText(message.content || message.message, userName)}
              </span>
            </div>
          );
        }

        const showButtonHandler =
          typeof onButtonClick === 'function' &&
          message.buttons?.length > 0 &&
          message.type === 'incoming' &&
          !message.isTemplate &&
          !message.isTemplateSend;

        return (
          <ChatMessageItem
            key={messageKey}
            message={message}
            source={message.source || 'inbox'}
            templateCatalog={templateCatalog}
            apiBase={apiBase}
            formatTime={() => formatMessageTime(getMessageTimestamp(message))}
            status={message.status}
            onButtonClick={
              showButtonHandler ? (button) => onButtonClick(button, message) : undefined
            }
          />
        );
      })}
      {messagesEndRef ? <div ref={messagesEndRef} /> : null}
    </>
  );
}
