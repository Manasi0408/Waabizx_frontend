import React from 'react';
import MessageBubble from './MessageBubble';

export default function ContactMessage({ message, align, formatTime, status }) {
  const contact = Array.isArray(message?.contacts) ? message.contacts[0] : null;
  const name =
    contact?.name?.formatted_name ||
    contact?.name?.first_name ||
    message?.content ||
    'Contact';
  const phone =
    contact?.phones?.[0]?.phone ||
    contact?.phones?.[0]?.wa_id ||
    message?.phone ||
    '';

  return (
    <MessageBubble message={message} align={align} formatTime={formatTime} status={status}>
      <div className="flex items-center gap-3 px-1 py-2">
        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-lg shrink-0">
          👤
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-[#111b21] truncate">{name}</p>
          {phone ? <p className="text-[12px] text-gray-500">{phone}</p> : null}
        </div>
      </div>
      {phone && (
        <div className="border-t border-black/5 mt-1 pt-2 text-center">
          <a href={`tel:${phone}`} className="text-[13px] text-[#00a5f4]">
            Save Contact
          </a>
        </div>
      )}
    </MessageBubble>
  );
}
