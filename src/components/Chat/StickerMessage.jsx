import React, { useState } from 'react';
import MessageBubble from './MessageBubble';
import ImagePreviewModal from './ImagePreviewModal';
import { resolvePublicMediaUrl } from '../../utils/mediaUrl';

export default function StickerMessage({ message, align, formatTime, status, apiBase }) {
  const [preview, setPreview] = useState(null);
  const src = message?.mediaUrl ? resolvePublicMediaUrl(message.mediaUrl, apiBase) : '';

  return (
    <>
      <MessageBubble message={message} align={align} formatTime={formatTime} status={status} maxWidth="160px">
        {src ? (
          <img
            src={src}
            alt="sticker"
            className="w-32 h-32 object-contain cursor-pointer"
            onClick={() => setPreview(src)}
          />
        ) : (
          <span className="text-4xl px-2 py-2 block">😀</span>
        )}
      </MessageBubble>
      {preview && <ImagePreviewModal src={preview} onClose={() => setPreview(null)} />}
    </>
  );
}
