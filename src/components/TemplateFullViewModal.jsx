import React from 'react';
import { resolvePublicMediaUrl } from '../utils/mediaUrl';

/**
 * Scrollable full-template viewer for Templates / Broadcast pages.
 * previewParts: { headerFormat, headerText, headerImageUrl, body, footer, buttons }
 */
export default function TemplateFullViewModal({ open, template, onClose, previewParts = null }) {
  if (!open || !template) return null;

  const body = String(previewParts?.body ?? template.content ?? '').trim() || 'No content';
  const footer = String(previewParts?.footer || '').trim();
  const headerText = String(previewParts?.headerText || '').trim();
  const headerFormat = String(previewParts?.headerFormat || '').toUpperCase();
  const buttons = Array.isArray(previewParts?.buttons) ? previewParts.buttons : [];
  const status = template.metaStatus || template.status || '';
  const category = template.category || '';
  const language =
    template.language ||
    (template.variables && typeof template.variables === 'object' && !Array.isArray(template.variables)
      ? template.variables.language
      : null) ||
    '';

  const vars =
    template.variables && typeof template.variables === 'object' && !Array.isArray(template.variables)
      ? template.variables
      : {};
  const headerImageUrl = resolvePublicMediaUrl(
    previewParts?.headerImageUrl ||
      previewParts?.header?.url ||
      vars.headerMediaUrl ||
      vars.header_media_url ||
      template.headerMediaUrl ||
      template.header_media_url ||
      ''
  );
  const isCarousel = Boolean(previewParts?.isCarousel);
  const carouselCards = Array.isArray(previewParts?.carouselCards) ? previewParts.carouselCards : [];
  const carouselMediaType = String(previewParts?.carouselMediaType || 'IMAGE').toUpperCase();
  const carouselMediaLabel = carouselMediaType === 'VIDEO' ? 'Video' : 'Image';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="motion-pop flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-100/90 bg-white shadow-2xl shadow-gray-900/15 ring-1 ring-black/5">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-sky-50/80 via-white to-blue-50/40 p-5 md:p-6">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold tracking-tight text-gray-900 md:text-xl">
              {template.name || 'Template'}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
              {status ? (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 font-semibold text-gray-800">
                  {String(status)}
                </span>
              ) : null}
              {category ? (
                <span className="rounded-full bg-sky-50 px-2.5 py-0.5 font-medium text-sky-800 ring-1 ring-sky-100">
                  {String(category)}
                </span>
              ) : null}
              {language ? (
                <span className="rounded-full bg-violet-50 px-2.5 py-0.5 font-medium text-violet-800 ring-1 ring-violet-100">
                  {String(language)}
                </span>
              ) : null}
              {isCarousel ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-medium text-amber-900 ring-1 ring-amber-100">
                  Carousel · {carouselMediaLabel}
                </span>
              ) : headerFormat ? (
                <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-medium text-amber-900 ring-1 ring-amber-100">
                  Header: {headerFormat}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-gray-400 transition hover:bg-white hover:text-gray-700 ring-1 ring-transparent hover:ring-gray-200/80"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-white to-sky-50/20 p-5 md:p-6">
          <div className="mx-auto max-w-[340px] rounded-[1.75rem] border-[6px] border-slate-900 bg-[#e5ddd5] p-3 shadow-lg">
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
              {!isCarousel && headerFormat === 'IMAGE' && headerImageUrl ? (
                <img
                  src={headerImageUrl}
                  alt=""
                  className="w-full max-h-56 object-cover block bg-gray-100"
                />
              ) : !isCarousel && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat) ? (
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-gray-100 text-gray-400">
                  <span className="text-2xl" aria-hidden>
                    {headerFormat === 'VIDEO' ? '🎬' : headerFormat === 'DOCUMENT' ? '📄' : '🖼'}
                  </span>
                  <span className="text-[11px] font-medium">{headerFormat} header</span>
                </div>
              ) : null}
              {headerText ? (
                <p className="px-3.5 pt-3 text-sm font-semibold text-gray-900 whitespace-pre-wrap break-words">
                  {headerText}
                </p>
              ) : null}
              <div className="px-3.5 py-3 text-[13px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words">
                {body}
              </div>
              {isCarousel && carouselCards.length > 0 ? (
                <div className="px-3.5 pb-3 border-t border-gray-100 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                    {carouselMediaLabel} cards
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {carouselCards.map((card, idx) => {
                      const cardUrl = resolvePublicMediaUrl(card?.headerImageUrl || '');
                      const cardButtons = Array.isArray(card.buttons) ? card.buttons : [];
                      return (
                        <div
                          key={card.index ?? idx}
                          className="shrink-0 w-[140px] rounded-lg border border-gray-200 bg-gray-50 overflow-hidden"
                        >
                          {cardUrl ? (
                            carouselMediaType === 'VIDEO' ? (
                              <video src={cardUrl} className="w-full h-20 object-cover bg-black/5" muted playsInline />
                            ) : (
                              <img src={cardUrl} alt="" className="w-full h-20 object-cover bg-gray-100" />
                            )
                          ) : (
                            <div className="w-full h-20 flex items-center justify-center text-[10px] font-semibold uppercase text-gray-400 bg-gray-100">
                              {carouselMediaLabel} {idx + 1}
                            </div>
                          )}
                          <div className="px-2 py-1.5 space-y-0.5">
                            {card.body ? (
                              <p className="text-[11px] text-gray-800 line-clamp-3 whitespace-pre-wrap break-words">
                                {card.body}
                              </p>
                            ) : null}
                            {cardButtons.slice(0, 2).map((btn, bi) => (
                              <p key={bi} className="text-[10px] font-semibold text-[#008069] truncate text-center">
                                {btn.text || btn.label || 'Button'}
                              </p>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {footer ? (
                <p className="px-3.5 pb-2 text-[11px] text-gray-500 whitespace-pre-wrap break-words">{footer}</p>
              ) : null}
              {buttons.length > 0 ? (
                <div className="border-t border-gray-100">
                  {buttons.map((btn, i) => {
                    const type = String(btn.type || '').toUpperCase();
                    const label = btn.text || btn.type || 'Button';
                    const sub =
                      type === 'URL' && btn.url
                        ? btn.url
                        : type === 'PHONE_NUMBER' && btn.phone_number
                          ? btn.phone_number
                          : null;
                    return (
                      <div
                        key={i}
                        className="flex flex-col items-center justify-center gap-0.5 border-t border-gray-100 px-3 py-2.5 text-[12px] font-semibold text-[#008069] first:border-t-0"
                      >
                        <span>{label}</span>
                        {sub ? (
                          <span className="max-w-full truncate px-2 text-[10px] font-normal text-gray-500">{sub}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end border-t border-gray-100 bg-white px-5 py-4 md:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border-2 border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 active:scale-[0.98]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
