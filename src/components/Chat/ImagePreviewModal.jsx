import React from 'react';

export default function ImagePreviewModal({ src, onClose, onDownload }) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {typeof onDownload === 'function' ? (
          <button
            type="button"
            className="text-white text-sm font-semibold px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              onDownload(e);
            }}
          >
            Download
          </button>
        ) : null}
        <button
          type="button"
          className="text-white text-2xl w-10 h-10 rounded-full bg-white/10 hover:bg-white/20"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
