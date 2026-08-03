import React from 'react';
import MessageBubble from './MessageBubble';
import { formatWhatsAppBody } from '../../utils/whatsappTemplatePreview';

export default function TextMessage({ message, align, formatTime, status, onButtonClick }) {
  const body = String(message?.content || '').trim();
  const buttons = Array.isArray(message?.buttons) ? message.buttons : [];
  const isOutgoing = message?.type === 'outgoing' || message?.sender === 'agent';
  if (!body && !buttons.length) return null;
  return (
    <MessageBubble message={message} align={align} formatTime={formatTime} status={status}>
      {body ? (
        <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words px-0.5 pb-0.5">
          {formatWhatsAppBody(body)}
        </p>
      ) : null}
      {buttons.length > 0 && !isOutgoing && typeof onButtonClick === 'function' && (
        <div className="mt-2 flex flex-col border-t border-black/5">
          {buttons.map((button, idx) => (
            <button
              key={button.id || idx}
              type="button"
              onClick={() => onButtonClick(button)}
              className="w-full py-2 text-center text-[13px] font-medium text-[#00a5f4] border-t border-black/5 first:border-t-0"
            >
              {button.text || button.label}
            </button>
          ))}
        </div>
      )}
    </MessageBubble>
  );
}
