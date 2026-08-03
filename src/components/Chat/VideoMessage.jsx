import React from 'react';
import MessageBubble from './MessageBubble';
import { formatWhatsAppBody } from '../../utils/whatsappTemplatePreview';
import { resolvePublicMediaUrl } from '../../utils/mediaUrl';

export default function VideoMessage({ message, align, formatTime, status, apiBase }) {
  const src = message?.mediaUrl ? resolvePublicMediaUrl(message.mediaUrl, apiBase) : '';
  const caption = String(message?.content || '').trim();
  const filename = message?.mediaFilename || 'video.mp4';

  return (
    <MessageBubble message={message} align={align} formatTime={formatTime} status={status}>
      <div className="mb-1 -mx-0.5">
        {src ? (
          <video src={src} controls className="w-full max-h-72 rounded-md" />
        ) : (
          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md text-sm text-gray-600">
            <span className="text-lg">▶</span>
            <span>{filename}</span>
          </div>
        )}
      </div>
      {caption ? (
        <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words px-0.5 pb-0.5">
          {formatWhatsAppBody(caption)}
        </p>
      ) : null}
    </MessageBubble>
  );
}
