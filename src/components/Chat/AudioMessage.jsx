import React from 'react';
import MessageBubble from './MessageBubble';
import { resolvePublicMediaUrl } from '../../utils/mediaUrl';

export default function AudioMessage({ message, align, formatTime, status, apiBase }) {
  const src = message?.mediaUrl ? resolvePublicMediaUrl(message.mediaUrl, apiBase) : '';

  return (
    <MessageBubble message={message} align={align} formatTime={formatTime} status={status}>
      <div className="flex items-center gap-2 px-1 py-1 min-w-[200px]">
        <span className="text-[#00a5f4] text-lg">▶</span>
        {src ? (
          <audio src={src} controls className="w-full min-w-[180px] h-8" />
        ) : (
          <div className="flex-1 h-2 bg-gray-200 rounded-full" />
        )}
      </div>
    </MessageBubble>
  );
}
