import React from 'react';

function BlockPreview({ block }) {
  if (!block) return null;
  const { type, text, label, placeholder, options = [], imageUrl } = block;

  if (type === 'text_large_heading') {
    return <p className="text-[22px] font-bold text-white leading-tight">{text || 'Large Heading'}</p>;
  }
  if (type === 'text_small_heading') {
    return <p className="text-[17px] font-semibold text-white">{text || 'Small Heading'}</p>;
  }
  if (type === 'text_caption') {
    return <p className="text-[12px] text-gray-400">{text || 'Caption'}</p>;
  }
  if (type === 'text_body') {
    return <p className="text-[14px] text-gray-200 leading-relaxed whitespace-pre-wrap">{text || 'Body text'}</p>;
  }
  if (type === 'media_image') {
    return (
      <div className="rounded-lg overflow-hidden bg-gray-800 border border-gray-700">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-32 object-cover" />
        ) : (
          <div className="h-32 flex items-center justify-center text-gray-500 text-xs">Image preview</div>
        )}
      </div>
    );
  }
  if (type === 'media_photo_picker' || type === 'media_document_picker') {
    return (
      <div className="rounded-lg border border-dashed border-gray-600 bg-gray-800/80 px-4 py-6 text-center">
        <p className="text-sm text-gray-300">{label || (type === 'media_photo_picker' ? 'Photo' : 'Document')}</p>
        <p className="text-xs text-gray-500 mt-1">{text || 'Tap to upload'}</p>
      </div>
    );
  }
  if (type === 'text_answer_short' || type === 'text_answer_date' || type === 'text_answer_calendar') {
    return (
      <div>
        {label ? <p className="text-xs text-gray-400 mb-1">{label}</p> : null}
        <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-gray-500">
          {placeholder || 'Type your answer'}
        </div>
      </div>
    );
  }
  if (type === 'text_answer_paragraph') {
    return (
      <div>
        {label ? <p className="text-xs text-gray-400 mb-1">{label}</p> : null}
        <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-4 text-sm text-gray-500 min-h-[72px]">
          {placeholder || 'Type your answer'}
        </div>
      </div>
    );
  }
  if (type === 'selection_single') {
    return (
      <div className="space-y-2">
        {label ? <p className="text-sm text-gray-300 mb-2">{label}</p> : null}
        {options.map((opt, i) => (
          <label key={i} className="flex items-center gap-2 text-sm text-gray-200">
            <span className="w-4 h-4 rounded-full border-2 border-gray-500 shrink-0" />
            {opt}
          </label>
        ))}
      </div>
    );
  }
  if (type === 'selection_multi') {
    return (
      <div className="space-y-2">
        {label ? <p className="text-sm text-gray-300 mb-2">{label}</p> : null}
        {options.map((opt, i) => (
          <label key={i} className="flex items-center gap-2 text-sm text-gray-200">
            <span className="w-4 h-4 rounded border-2 border-gray-500 shrink-0" />
            {opt}
          </label>
        ))}
      </div>
    );
  }
  if (type === 'selection_opt_in') {
    return (
      <label className="flex items-center justify-between gap-3 text-sm text-gray-200">
        <span>{text || label || 'Opt in'}</span>
        <span className="w-10 h-6 rounded-full bg-gray-700 relative shrink-0">
          <span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white" />
        </span>
      </label>
    );
  }
  if (type === 'selection_dropdown') {
    return (
      <div>
        {label ? <p className="text-xs text-gray-400 mb-1">{label}</p> : null}
        <div className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-gray-400 flex justify-between items-center">
          <span>{options[0] || 'Select'}</span>
          <span className="text-gray-500">▾</span>
        </div>
      </div>
    );
  }
  return <p className="text-sm text-gray-400">{text || type}</p>;
}

export default function FormMobilePreview({ screenTitle, footerButton, content = [] }) {
  return (
    <div className="mx-auto w-[280px] shrink-0">
      <div className="rounded-[2rem] border-[10px] border-gray-900 bg-gray-900 shadow-2xl overflow-hidden">
        <div className="bg-gray-900 px-4 pt-2 pb-1 flex justify-between items-center text-[10px] text-white">
          <span>3:03 PM</span>
          <div className="flex gap-1">
            <span>📶</span>
            <span>🔋</span>
          </div>
        </div>
        <div className="bg-[#1a1a1a] min-h-[480px] flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-center text-sm font-medium text-white truncate">{screenTitle || 'Screen'}</p>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {content.length === 0 ? (
              <div className="h-full min-h-[200px] flex items-center justify-center text-gray-600 text-xs text-center px-4">
                Add content to preview your form here
              </div>
            ) : (
              content.map((block) => (
                <div key={block.id}>
                  <BlockPreview block={block} />
                </div>
              ))
            )}
          </div>
          <div className="p-4 border-t border-gray-800">
            <button
              type="button"
              className="w-full py-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold"
            >
              {footerButton || 'Submit'}
            </button>
            <p className="text-[9px] text-center text-gray-500 mt-2">Managed by the business. Learn more</p>
          </div>
        </div>
      </div>
    </div>
  );
}
