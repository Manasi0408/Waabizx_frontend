import React, { useState } from 'react';
import { formatWhatsAppBody, resolveTemplateHeaderDisplayUrl } from '../utils/whatsappTemplatePreview';
import { useMediaSrc } from './Chat/useMediaSrc';
import { getApiOrigin } from '../utils/apiBase';

/**
 * WhatsApp-style template message card — matches Meta template layout:
 * image/text header → body → footer → stacked quick-reply buttons.
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
  const headerFormat = String(preview?.headerFormat || '').toUpperCase();
  const headerText = String(preview?.headerText || '').trim();
  const body = String(preview?.body || '').trim();
  const footer = String(preview?.footer || '').trim();
  const buttons = Array.isArray(preview?.buttons)
    ? preview.buttons.filter((b) => String(b?.text || b?.label || '').trim())
    : [];
  const headerCandidate = resolveTemplateHeaderDisplayUrl(message, preview, apiBase);
  const { src: mediaSrc, failed: mediaLoadFailed, setFailed: setMediaFailed } = useMediaSrc(
    headerCandidate,
    apiBase
  );
  const showImage =
    headerFormat === 'IMAGE' || Boolean(headerCandidate) || preview?.header?.type === 'image';
  const imageBroken = imageFailed || mediaLoadFailed;
  const showImagePlaceholder = showImage && (!mediaSrc || imageBroken);

  return (
    <div className={`flex mb-3 ${align === 'right' || isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[min(100%,320px)] sm:max-w-sm w-full">
        <div className="overflow-hidden rounded-[7px] bg-white shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
          {mediaSrc && !imageBroken ? (
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
          ) : showImagePlaceholder ? (
            <div className="w-full bg-gradient-to-b from-gray-100 to-gray-50 border-b border-gray-200 px-3 py-10 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Image</p>
            </div>
          ) : null}

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

          {buttons.length > 0 && (
            <div className="border-t border-[#e9edef]">
              {buttons.map((button, idx) => {
                const label = String(button.text || button.label || '').trim();
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
            {isOutgoing && status && (
              <span className="text-[10px] uppercase tracking-wide opacity-80">{status}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
