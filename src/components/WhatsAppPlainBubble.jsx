import React from 'react';
import { formatWhatsAppBody } from '../utils/whatsappTemplatePreview';
import { resolvePublicMediaUrl } from '../utils/mediaUrl';

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

function StatusTicks({ status }) {
  const s = String(status || '').toLowerCase();
  if (s === 'read') {
    return (
      <svg className="w-[15px] h-[15px] text-[#53bdeb]" viewBox="0 0 16 15" fill="currentColor" aria-hidden>
        <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.514.064l-.39.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512z" />
      </svg>
    );
  }
  if (s === 'delivered') {
    return (
      <svg className="w-[15px] h-[15px] text-[#667781]" viewBox="0 0 16 15" fill="currentColor" aria-hidden>
        <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.514.064l-.39.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512z" />
      </svg>
    );
  }
  return (
    <svg className="w-[15px] h-[15px] text-[#667781]" viewBox="0 0 12 11" fill="currentColor" aria-hidden>
      <path d="M11.154 0.5H0.846C0.378 0.5 0 0.878 0 1.346v8.308c0 0.468 0.378 0.846 0.846 0.846h10.308c0.468 0 0.846-0.378 0.846-0.846V1.346C12 0.878 11.622 0.5 11.154 0.5z" opacity="0" />
      <path d="M11 0.5L4.5 7 1.5 4" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

/** Standard WhatsApp text/media bubble (green outgoing, white incoming). */
export default function WhatsAppPlainBubble({
  message,
  align = 'left',
  formatTime,
  status,
  // apiBase = 'https://wabizx.techwhizzc.com/',
  apiBase = 'https://api.waabizx.com/',
  onButtonClick,
}) {
  const isOutgoing = message?.type === 'outgoing' || message?.sender === 'agent';
  const body = String(message?.content || message?.message || '').trim();
  const mediaType = String(message?.mediaType || message?.messageType || '').toLowerCase();
  const isMedia = MEDIA_TYPES.has(mediaType) && mediaType !== 'text';
  const mediaSrc = message?.mediaUrl ? resolvePublicMediaUrl(message.mediaUrl, apiBase) : '';
  const buttons = Array.isArray(message?.buttons) ? message.buttons : [];

  return (
    <div className={`flex mb-1.5 ${align === 'right' || isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[min(100%,280px)] sm:max-w-[65%]">
        <div
          className={`relative px-2 pt-1.5 pb-1 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${
            isOutgoing
              ? 'bg-[#d9fdd3] text-[#111b21] rounded-lg rounded-tr-none'
              : 'bg-white text-[#111b21] rounded-lg rounded-tl-none'
          }`}
        >
          {isMedia && (
            <div className="mb-1 -mx-0.5">
              {mediaType === 'image' && mediaSrc ? (
                <img
                  src={mediaSrc}
                  alt=""
                  className="w-full max-h-72 rounded-md object-cover cursor-pointer"
                  onClick={() => window.open(mediaSrc, '_blank')}
                />
              ) : mediaType === 'video' && mediaSrc ? (
                <video src={mediaSrc} controls className="w-full max-h-72 rounded-md" />
              ) : mediaType === 'audio' && mediaSrc ? (
                <audio src={mediaSrc} controls className="w-full min-w-[200px]" />
              ) : mediaType === 'document' && mediaSrc ? (
                <a href={mediaSrc} download className="flex items-center gap-2 p-2 text-sm text-[#027eb5]">
                  📄 {message.mediaFilename || 'Document'}
                </a>
              ) : null}
            </div>
          )}

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

          {typeof formatTime === 'function' && (
            <div className={`flex items-center justify-end gap-0.5 -mt-0.5 pb-0.5 px-0.5 ${isOutgoing ? 'text-[#667781]' : 'text-[#667781]'}`}>
              <span className="text-[11px] leading-none">{formatTime()}</span>
              {isOutgoing && <StatusTicks status={status || message?.status} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
