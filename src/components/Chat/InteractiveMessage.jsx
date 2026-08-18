import React from 'react';
import MessageBubble from './MessageBubble';
import { formatWhatsAppBody } from '../../utils/whatsappTemplatePreview';
import { resolvePublicMediaUrl } from '../../utils/mediaUrl';

function extractOutgoingButtons(message) {
  const interactive = message?.interactive || message?.payload?.interactive;
  if (!interactive || String(interactive.type || '').toLowerCase() !== 'button') return [];

  const buttons = interactive?.action?.buttons;
  if (!Array.isArray(buttons)) return [];

  return buttons
    .map((btn, idx) => {
      const title = String(btn?.reply?.title || btn?.text || '').trim();
      if (!title) return null;
      return { id: btn?.reply?.id || `btn_${idx}`, text: title };
    })
    .filter(Boolean);
}

/** Incoming button reply OR outgoing interactive button card */
export default function InteractiveMessage({ message, align, formatTime, status, apiBase }) {
  const isOutgoing = message?.type === 'outgoing' || message?.sender === 'agent';
  const outgoingButtons = isOutgoing ? extractOutgoingButtons(message) : [];
  const bodyText = String(
    message?.content ||
      message?.interactive?.body?.text ||
      message?.payload?.interactive?.body?.text ||
      ''
  ).trim();
  const headerType = String(
    message?.interactive?.header?.type ||
      message?.payload?.interactive?.header?.type ||
      'image'
  ).toLowerCase();
  const headerImageUrl =
    message?.mediaUrl ||
    message?.interactive?.header?.image?.link ||
    message?.payload?.interactive?.header?.image?.link ||
    message?.interactive?.header?.video?.link ||
    message?.payload?.interactive?.header?.video?.link ||
    null;
  const resolvedHeaderSrc = headerImageUrl
    ? resolvePublicMediaUrl(headerImageUrl, apiBase)
    : '';

  if (isOutgoing && outgoingButtons.length > 0) {
    return (
      <div className={`flex mb-3 ${align === 'right' || isOutgoing ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[min(100%,320px)] sm:max-w-sm w-full">
          <div className="overflow-hidden rounded-[7px] bg-white shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
            {resolvedHeaderSrc && (headerType === 'image' || headerType === 'video') ? (
              headerType === 'video' ? (
                <video
                  src={resolvedHeaderSrc}
                  className="w-full max-h-72 object-cover block bg-gray-100"
                  controls
                  muted
                  playsInline
                />
              ) : (
                <div className="w-full bg-gray-100">
                  <img
                    src={resolvedHeaderSrc}
                    alt=""
                    className="w-full max-h-72 object-cover block"
                    onClick={() => window.open(resolvedHeaderSrc, '_blank')}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
              )
            ) : null}
            {bodyText ? (
              <div className="px-3.5 py-2.5">
                <p className="text-[13px] leading-[1.45] text-gray-900 whitespace-pre-wrap break-words">
                  {formatWhatsAppBody(bodyText)}
                </p>
              </div>
            ) : null}
            <div className="border-t border-[#e9edef]">
              {outgoingButtons.map((button, idx) => (
                <div
                  key={button.id || `out_btn_${idx}`}
                  className="w-full py-[11px] text-center text-[14px] font-normal text-[#00a5f4] border-t border-[#e9edef] first:border-t-0"
                >
                  {button.text}
                </div>
              ))}
            </div>
          </div>
          {typeof formatTime === 'function' && (
            <div className="flex items-center gap-1 mt-1 px-0.5 justify-end text-gray-400">
              <span className="text-[10px]">{formatTime()}</span>
              {status ? (
                <span className="text-[10px] uppercase tracking-wide opacity-80">{status}</span>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  const selection = String(message?.selectedOption || message?.content || '').trim();

  return (
    <MessageBubble message={message} align={align} formatTime={formatTime} status={status}>
      {message?.replyTo?.content ? (
        <div className="border-l-4 border-[#00a5f4] pl-2 mb-2 opacity-80 text-xs">
          {message.replyTo.content}
        </div>
      ) : null}
      <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words px-0.5 pb-0.5">
        {formatWhatsAppBody(selection)}
      </p>
    </MessageBubble>
  );
}
