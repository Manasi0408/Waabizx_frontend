import React from 'react';
import MessageBubble from './MessageBubble';

/** List menu reply from customer */
export default function ListMessage({ message, align, formatTime, status }) {
  const selection = String(message?.selectedOption || message?.content || 'Selected option').trim();

  return (
    <MessageBubble message={message} align={align} formatTime={formatTime} status={status}>
      <div className="px-1 py-1">
        <p className="text-[11px] text-gray-500 mb-1">You selected</p>
        <p className="text-[14px] font-medium text-[#111b21]">{selection}</p>
      </div>
    </MessageBubble>
  );
}
