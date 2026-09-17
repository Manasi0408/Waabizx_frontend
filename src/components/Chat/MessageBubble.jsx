import React from 'react';
import MessageMeta from './MessageMeta';

/** Green outgoing / white incoming bubble shell */
export default function MessageBubble({
  message,
  align,
  formatTime,
  status,
  children,
  className = '',
  maxWidth = 'min(100%,280px)',
}) {
  const isOutgoing =
    align === 'right' ||
    message?.type === 'outgoing' ||
    message?.sender === 'agent' ||
    message?.direction === 'outbound';

  return (
    <div className={`flex mb-1.5 ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[${maxWidth}] sm:max-w-[65%]`} style={{ maxWidth }}>
        <div
          className={`relative px-2 pt-1.5 pb-1 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${
            isOutgoing
              ? 'bg-[#d9fdd3] text-[#111b21] rounded-lg rounded-tr-none'
              : 'bg-white text-[#111b21] rounded-lg rounded-tl-none'
          } ${className}`}
        >
          {children}
          <MessageMeta
            formatTime={formatTime}
            status={status || message?.status}
            outgoing={isOutgoing}
            message={message}
          />
        </div>
      </div>
    </div>
  );
}
