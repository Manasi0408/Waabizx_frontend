import React, { useEffect, useRef } from 'react';
import MessageRenderer from './MessageRenderer';
import { normalizeMessage } from '../../utils/messageParser';

/**
 * Chat window shell — message list + auto-scroll (AiSensy Live Chat pattern).
 */
export default function ChatWindow({
  messages = [],
  templateCatalog,
  apiBase,
  formatMessageTime,
  getMessageKey,
  onButtonClick,
  personalizeSystemText,
  currentUserName,
  messageSource = 'inbox',
  className = '',
  background = '#e5ddd5',
}) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className={`flex flex-col h-full ${className}`} style={{ background }}>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.map((raw, index) => {
          const normalized = normalizeMessage(raw, messageSource);
          const key = getMessageKey
            ? getMessageKey(raw, index)
            : normalized?.id || `msg_${index}`;

          if (normalized?.type === 'system' || normalized?.direction === 'system') {
            return (
              <div key={key} className="flex justify-center mb-3">
                <span className="text-xs font-medium text-gray-600 px-4 py-2 rounded-lg bg-gray-100 border border-gray-200/90 text-center max-w-md shadow-sm">
                  {typeof personalizeSystemText === 'function'
                    ? personalizeSystemText(normalized.content, currentUserName)
                    : normalized.content}
                </span>
              </div>
            );
          }

          return (
            <MessageRenderer
              key={key}
              message={raw}
              source={messageSource}
              templateCatalog={templateCatalog}
              apiBase={apiBase}
              formatTime={() =>
                typeof formatMessageTime === 'function'
                  ? formatMessageTime(normalized)
                  : ''
              }
              status={normalized?.status}
              onButtonClick={onButtonClick ? (btn) => onButtonClick(btn, raw) : undefined}
            />
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
