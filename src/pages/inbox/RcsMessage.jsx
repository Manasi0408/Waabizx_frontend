import React from 'react';
import RcsCard, { normalizeCardPayload } from '../../components/rcs/RcsCard';
import RcsCarousel from '../../components/rcs/RcsCarousel';
import RcsButtons from '../../components/rcs/RcsButtons';

function parseContent(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

/**
 * Renders one RCS inbox message (text, media, card, carousel, buttons).
 */
export default function RcsMessage({ message, onButtonClick, onSimulateStatus }) {
  if (!message) return null;

  const outgoing = String(message.direction || 'outgoing') === 'outgoing';
  const content = parseContent(message.content);
  const type = String(message.messageType || content?.type || 'text').toLowerCase();
  const status = message.status || 'sent';

  let body = null;

  if (type === 'card') {
    const n = normalizeCardPayload(content || {});
    body = (
      <RcsCard
        image={n.image}
        title={n.title}
        description={n.description}
        buttons={n.buttons}
        onButtonClick={(btn) => onButtonClick?.(message, btn)}
      />
    );
  } else if (type === 'carousel') {
    body = (
      <RcsCarousel
        cards={content?.cards || []}
        onButtonClick={(btn) => onButtonClick?.(message, btn)}
      />
    );
  } else if (type === 'image') {
    const url = content?.url || content?.image || content?.header?.image;
    body = (
      <div className="space-y-1">
        {url ? (
          <img src={url} alt="" className="max-h-48 rounded-xl object-cover" />
        ) : null}
        {message.message ? <p className="text-sm whitespace-pre-wrap">{message.message}</p> : null}
      </div>
    );
  } else if (type === 'video') {
    const url = content?.url || content?.video;
    body = (
      <div className="space-y-1">
        {url ? (
          <video src={url} controls className="max-h-48 rounded-xl w-full bg-black" />
        ) : (
          <p className="text-sm">Video message</p>
        )}
        {message.message ? <p className="text-sm whitespace-pre-wrap">{message.message}</p> : null}
      </div>
    );
  } else if (type === 'pdf' || type === 'document') {
    const url = content?.url || content?.file;
    body = (
      <a
        href={url || '#'}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-sky-700"
      >
        📄 {message.message || content?.name || 'Document.pdf'}
      </a>
    );
  } else if (type === 'buttons') {
    body = (
      <div>
        {message.message ? <p className="text-sm mb-1 whitespace-pre-wrap">{message.message}</p> : null}
        <RcsButtons
          buttons={content?.buttons || []}
          onClick={(btn) => onButtonClick?.(message, btn)}
        />
      </div>
    );
  } else {
    body = <p className="text-sm whitespace-pre-wrap">{message.message || ''}</p>;
  }

  return (
    <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-sm ${
          outgoing
            ? 'bg-[#dcf8c6] text-gray-900 rounded-br-md'
            : 'bg-white text-gray-900 border border-gray-100 rounded-bl-md'
        }`}
      >
        {body}
        <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[10px] text-gray-500">
          <span className="uppercase tracking-wide">{type}</span>
          <span>·</span>
          <span>{status}</span>
          {message.providerMessageId ? (
            <>
              <span>·</span>
              <span className="font-mono truncate max-w-[100px]" title={message.providerMessageId}>
                {message.providerMessageId}
              </span>
            </>
          ) : null}
          {outgoing && onSimulateStatus && message.providerMessageId ? (
            <span className="flex gap-1 ml-1">
              <button
                type="button"
                className="underline text-sky-700"
                onClick={() => onSimulateStatus(message, 'delivered')}
              >
                → delivered
              </button>
              <button
                type="button"
                className="underline text-sky-700"
                onClick={() => onSimulateStatus(message, 'read')}
              >
                → read
              </button>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
