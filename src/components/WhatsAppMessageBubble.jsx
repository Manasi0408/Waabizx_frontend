import React, { useState } from 'react';
import { formatWhatsAppBody, resolveTemplateHeaderDisplayUrl } from '../utils/whatsappTemplatePreview';
import { useMediaSrc } from './Chat/useMediaSrc';
import { getApiOrigin } from '../utils/apiBase';
import { resolvePublicMediaUrl } from '../utils/mediaUrl';
import MessageFailureIndicator from './Chat/MessageFailureIndicator';
import { getDeliveryFailureInfo } from '../utils/messageDeliveryFailure';

function resolveButtonLabel(btn) {
  if (!btn || typeof btn !== 'object') return String(btn || '').trim();
  const raw = btn.text ?? btn.title ?? btn.label ?? '';
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object') {
    return String(raw.text || raw.body || raw.title || raw.label || '').trim();
  }
  return '';
}

function mediaFileName(url) {
  if (!url) return 'document.pdf';
  try {
    return decodeURIComponent(String(url).split('/').pop()?.split('?')[0] || 'document.pdf');
  } catch {
    return String(url).split('/').pop()?.split('?')[0] || 'document.pdf';
  }
}

/**
 * WhatsApp-style template message card — matches Meta template layout:
 * image/video/document/text header → body → footer → stacked quick-reply buttons.
 */
export default function WhatsAppMessageBubble({
  message,
  preview,
  align = 'left',
  formatTime,
  status,
  apiBase = `${getApiOrigin()}/`,
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const isOutgoing = message?.type === 'outgoing' || message?.sender === 'agent';
  const deliveryFailed = Boolean(isOutgoing && getDeliveryFailureInfo(message, status));
  const headerFormat = String(preview?.headerFormat || '').toUpperCase();
  const headerText = String(preview?.headerText || '').trim();
  const body = String(preview?.body || '').trim();
  const footer = String(preview?.footer || '').trim();
  const buttons = Array.isArray(preview?.buttons)
    ? preview.buttons
        .map((b) => ({ ...b, text: resolveButtonLabel(b) }))
        .filter((b) => b.text)
    : [];
  const headerCandidate = resolveTemplateHeaderDisplayUrl(message, preview, apiBase);
  const { src: mediaSrc, failed: mediaLoadFailed, setFailed: setMediaFailed } = useMediaSrc(
    headerCandidate,
    apiBase
  );
  const isVideo = headerFormat === 'VIDEO' || preview?.header?.type === 'video';
  const isDocument = headerFormat === 'DOCUMENT' || preview?.header?.type === 'document';
  const isImage =
    headerFormat === 'IMAGE' ||
    preview?.header?.type === 'image' ||
    (!isVideo && !isDocument && Boolean(headerCandidate));
  const needsMediaHeader = isImage || isVideo || isDocument;
  const mediaBroken = imageFailed || mediaLoadFailed;
  const placeholderLabel = isVideo ? 'Video' : isDocument ? mediaFileName(mediaSrc || headerCandidate) : 'Image';
  const carouselCards = Array.isArray(preview?.carouselCards) ? preview.carouselCards : [];
  const isCarousel = Boolean(preview?.isCarousel) || carouselCards.length > 0;
  const carouselMediaType = String(preview?.carouselMediaType || 'IMAGE').toUpperCase();
  const carouselMediaLabel = carouselMediaType === 'VIDEO' ? 'Video' : 'Image';

  const renderHeaderMedia = () => {
    if (mediaSrc && !mediaBroken) {
      if (isVideo) {
        return (
          <div className="w-full bg-black/5">
            <video
              src={mediaSrc}
              className="w-full max-h-72 object-cover block"
              controls
              muted
              playsInline
              onError={() => {
                setImageFailed(true);
                setMediaFailed(true);
              }}
            />
          </div>
        );
      }
      if (isDocument) {
        return (
          <div className="w-full bg-gradient-to-b from-gray-100 to-gray-50 border-b border-gray-200 px-3 py-8 text-center">
            <p className="text-2xl mb-1" aria-hidden>
              📄
            </p>
            <p className="text-xs font-semibold text-gray-700 break-all">{mediaFileName(mediaSrc)}</p>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mt-1">Document</p>
          </div>
        );
      }
      return (
        <div className="w-full bg-gray-100">
          <img
            src={mediaSrc}
            alt=""
            className="w-full max-h-72 object-cover block"
            onClick={() => window.open(mediaSrc, '_blank')}
            onError={() => {
              setImageFailed(true);
              setMediaFailed(true);
            }}
          />
        </div>
      );
    }
    if (needsMediaHeader) {
      return (
        <div className="w-full bg-gradient-to-b from-gray-100 to-gray-50 border-b border-gray-200 px-3 py-10 text-center">
          {isDocument ? (
            <>
              <p className="text-2xl mb-1" aria-hidden>
                📄
              </p>
              <p className="text-xs font-semibold text-gray-700 break-all">{placeholderLabel}</p>
            </>
          ) : null}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            {isDocument ? 'Document' : placeholderLabel}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`flex mb-3 ${align === 'right' || isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[min(100%,320px)] sm:max-w-sm w-full">
        <div className="overflow-hidden rounded-[7px] bg-white shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
          {!isCarousel ? renderHeaderMedia() : null}

          {(headerText || body || footer) && (
            <div className="px-3.5 py-2.5">
              {headerText ? (
                <p className="text-[15px] font-semibold leading-snug text-gray-900 mb-1.5 whitespace-pre-wrap break-words">
                  {formatWhatsAppBody(headerText)}
                </p>
              ) : null}
              {body ? (
                <p className="text-[13px] leading-[1.45] text-gray-900 whitespace-pre-wrap break-words">
                  {formatWhatsAppBody(body)}
                </p>
              ) : null}
              {footer ? (
                <p className="mt-2 text-[11px] leading-snug text-gray-500">{footer}</p>
              ) : null}
            </div>
          )}

          {isCarousel && carouselCards.length > 0 ? (
            <div className="px-3 py-2.5 border-t border-[#e9edef]">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {carouselCards.map((card, idx) => {
                  const cardUrl = resolvePublicMediaUrl(
                    card?.headerImageUrl || card?.headerMediaPath || '',
                    apiBase
                  );
                  const cardButtons = Array.isArray(card.buttons) ? card.buttons : [];
                  return (
                    <div
                      key={card.index ?? idx}
                      className="shrink-0 w-[148px] rounded-md border border-[#e9edef] bg-[#f0f2f5] overflow-hidden"
                    >
                      {cardUrl ? (
                        carouselMediaType === 'VIDEO' ? (
                          <video src={cardUrl} className="w-full h-[88px] object-cover bg-black/5" muted playsInline controls />
                        ) : (
                          <img src={cardUrl} alt="" className="w-full h-[88px] object-cover bg-gray-100" />
                        )
                      ) : (
                        <div className="w-full h-[88px] flex items-center justify-center text-[10px] font-semibold uppercase text-gray-500">
                          {carouselMediaLabel} {idx + 1}
                        </div>
                      )}
                      <div className="px-2 py-1.5 bg-white">
                        {card.body ? (
                          <p className="text-[11px] text-gray-900 line-clamp-3 whitespace-pre-wrap break-words">
                            {card.body}
                          </p>
                        ) : null}
                        {cardButtons.slice(0, 2).map((btn, bi) => (
                          <p key={bi} className="text-[10px] font-semibold text-[#00a5f4] truncate text-center mt-1">
                            {resolveButtonLabel(btn)}
                          </p>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!isCarousel && buttons.length > 0 && (
            <div className="border-t border-[#e9edef]">
              {buttons.map((button, idx) => {
                const label = resolveButtonLabel(button);
                if (!label) return null;
                return (
                  <div
                    key={button.id || `wa_btn_${idx}`}
                    role="presentation"
                    className="w-full py-[11px] text-center text-[14px] font-normal text-[#00a5f4] border-t border-[#e9edef] first:border-t-0 select-none cursor-default"
                  >
                    {label}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {typeof formatTime === 'function' && (
          <div
            className={`flex items-center gap-1 mt-1 px-0.5 ${
              isOutgoing ? 'justify-end text-gray-400' : 'justify-start text-gray-400'
            }`}
          >
            <span className="text-[10px]">{formatTime()}</span>
            {deliveryFailed ? (
              <MessageFailureIndicator message={message} status={status || message?.status} formatTime={formatTime} />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
