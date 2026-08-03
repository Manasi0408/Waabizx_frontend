import React from 'react';
import MessageBubble from './MessageBubble';
import { formatWhatsAppBody } from '../../utils/whatsappTemplatePreview';
import { resolvePublicMediaUrl } from '../../utils/mediaUrl';

function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentMessage({ message, align, formatTime, status, apiBase }) {
  const src = message?.mediaUrl ? resolvePublicMediaUrl(message.mediaUrl, apiBase) : '';
  const filename = message?.mediaFilename || message?.content || 'Document.pdf';
  const sizeLabel = formatFileSize(message?.mediaSize);

  return (
    <MessageBubble message={message} align={align} formatTime={formatTime} status={status}>
      <a
        href={src || '#'}
        download={filename}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-start gap-3 p-2 rounded-md ${src ? 'hover:bg-black/5' : 'pointer-events-none'}`}
        onClick={(e) => !src && e.preventDefault()}
      >
        <span className="text-2xl leading-none">📄</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-[#027eb5] truncate">{filename}</p>
          {sizeLabel && <p className="text-[11px] text-gray-500">{sizeLabel}</p>}
          {src && <p className="text-[11px] text-[#00a5f4] mt-0.5">Download</p>}
        </div>
      </a>
      {message?.content && message.content !== filename ? (
        <p className="text-[13px] px-1 pb-0.5 text-gray-700">{formatWhatsAppBody(message.content)}</p>
      ) : null}
    </MessageBubble>
  );
}
