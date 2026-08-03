import React, { useRef } from 'react';
import RcsCard, { normalizeCardPayload } from './RcsCard';

/**
 * Horizontal RCS carousel — swipe/scroll like Google Messages.
 */
export default function RcsCarousel({ cards = [], onButtonClick }) {
  const scrollerRef = useRef(null);
  const list = Array.isArray(cards) ? cards : [];

  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 px-3 py-4 text-xs text-gray-500">
        Empty carousel
      </div>
    );
  }

  const scrollBy = (dir) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * 260, behavior: 'smooth' });
  };

  return (
    <div className="relative max-w-[320px]">
      <div className="mb-1 flex justify-end gap-1">
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          className="rounded-full bg-white/90 px-2 py-0.5 text-xs shadow border border-gray-200"
          aria-label="Previous"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          className="rounded-full bg-white/90 px-2 py-0.5 text-xs shadow border border-gray-200"
          aria-label="Next"
        >
          ›
        </button>
      </div>
      <div
        ref={scrollerRef}
        className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin"
        style={{ scrollbarWidth: 'thin' }}
      >
        {list.map((card, idx) => {
          const n = normalizeCardPayload(card);
          return (
            <div key={idx} className="snap-start shrink-0">
              <RcsCard
                image={n.image}
                title={n.title}
                description={n.description}
                buttons={n.buttons}
                onButtonClick={onButtonClick}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
