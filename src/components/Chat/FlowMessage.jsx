import React from 'react';
import MessageBubble from './MessageBubble';

/** WhatsApp Flow (nfm_reply) response */
export default function FlowMessage({ message, align, formatTime, status }) {
  const title = String(message?.content || 'Flow response').trim();

  return (
    <MessageBubble message={message} align={align} formatTime={formatTime} status={status}>
      <div className="px-1 py-1">
        <p className="text-[11px] text-gray-500 mb-1">Flow completed</p>
        <p className="text-[14px] text-[#111b21]">{title}</p>
      </div>
    </MessageBubble>
  );
}
