import React from 'react';

/**
 * RCS suggested actions / replies — Google Messages style chips.
 */
export default function RcsButtons({ buttons = [], onClick, disabled = false }) {
  if (!Array.isArray(buttons) || buttons.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {buttons.map((btn, idx) => {
        const text = btn.text || btn.title || 'Action';
        const type = String(btn.type || 'reply').toLowerCase();
        const label =
          type === 'url' || type === 'open_url'
            ? text
            : type === 'call'
              ? `📞 ${text}`
              : type === 'location'
                ? `📍 ${text}`
                : text;

        return (
          <button
            key={`${text}-${idx}`}
            type="button"
            disabled={disabled}
            onClick={() => onClick?.(btn)}
            className="rounded-full border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 shadow-sm hover:bg-sky-50 disabled:opacity-50"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
