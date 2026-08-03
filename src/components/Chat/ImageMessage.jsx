import React, { useState } from 'react';
import MessageBubble from './MessageBubble';
import ImagePreviewModal from './ImagePreviewModal';
import { formatWhatsAppBody } from '../../utils/whatsappTemplatePreview';
import { resolvePublicMediaUrl } from '../../utils/mediaUrl';
import { useMediaSrc } from './useMediaSrc';

export default function ImageMessage({ message, align, formatTime, status, apiBase }) {
  const [preview, setPreview] = useState(null);
  const rawSrc = message?.mediaUrl ? resolvePublicMediaUrl(message.mediaUrl, apiBase) : '';
  const { src, failed, setFailed } = useMediaSrc(rawSrc, apiBase);
  const caption = String(message?.content || '').trim();

  return (
    <>
      <MessageBubble message={message} align={align} formatTime={formatTime} status={status}>
        <div className="mb-1 -mx-0.5">
          {src && !failed ? (
            <img
              src={src}
              alt=""
              className="w-full max-h-72 rounded-md object-cover cursor-pointer"
              onClick={() => setPreview(src)}
              onError={() => setFailed(true)}
            />
          ) : (
            <div className="w-full bg-gray-100 rounded-md py-12 text-center text-xs text-gray-500 uppercase tracking-widest">
              Image
            </div>
          )}
        </div>
        {caption ? (
          <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words px-0.5 pb-0.5">
            {formatWhatsAppBody(caption)}
          </p>
        ) : null}
      </MessageBubble>
      {preview && <ImagePreviewModal src={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
