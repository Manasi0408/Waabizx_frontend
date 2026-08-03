import React from 'react';
import RcsButtons from './RcsButtons';

/**
 * Google Messages–style RCS rich card.
 */
export default function RcsCard({
  image,
  header,
  title,
  description,
  buttons = [],
  onButtonClick,
}) {
  const img = image || header?.image || null;

  return (
    <div className="w-full max-w-[280px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md">
      {img ? (
        <img src={img} alt={title || 'RCS card'} className="h-36 w-full object-cover" />
      ) : (
        <div className="flex h-28 w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-xs text-slate-500">
          No image
        </div>
      )}
      <div className="p-3">
        {title ? <h4 className="text-sm font-bold text-gray-900 leading-snug">{title}</h4> : null}
        {description ? (
          <p className="mt-1 text-xs text-gray-600 leading-relaxed">{description}</p>
        ) : null}
        <RcsButtons buttons={buttons} onClick={onButtonClick} />
      </div>
    </div>
  );
}

/** Normalize card payload from DB / composer */
export function normalizeCardPayload(content = {}) {
  const c = content && typeof content === 'object' ? content : {};
  return {
    image: c.image || c.header?.image || c.mediaUrl || '',
    title: c.title || c.productName || c.name || 'Card',
    description: c.description || c.body || '',
    buttons: Array.isArray(c.buttons) ? c.buttons : [],
  };
}
