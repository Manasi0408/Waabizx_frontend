import React from 'react';

export default function ImagePreviewModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal
    >
      <button
        type="button"
        className="absolute top-4 right-4 text-white text-2xl w-10 h-10 rounded-full bg-white/10 hover:bg-white/20"
        onClick={onClose}
        aria-label="Close"
      >
        ×
      </button>
      <img
        src={src}
        alt=""
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
