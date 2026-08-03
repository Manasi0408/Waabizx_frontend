import React, { useEffect, useRef, useState } from 'react';
import { CONTENT_MENU } from '../../utils/formContentTypes';

function MenuIcon({ kind }) {
  if (kind === 'T') {
    return (
      <span className="w-8 h-8 rounded border border-gray-300 flex items-center justify-center text-sm font-bold text-gray-700">
        T
      </span>
    );
  }
  if (kind === 'img') {
    return (
      <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  if (kind === 'input') {
    return (
      <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h10M4 14h16M4 18h8" />
      </svg>
    );
  }
  return (
    <svg className="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h8M4 18h16" />
    </svg>
  );
}

export default function AddContentMenu({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [hoverGroup, setHoverGroup] = useState('text');
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const activeGroup = CONTENT_MENU.find((g) => g.id === hoverGroup) || CONTENT_MENU[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-emerald-600 text-emerald-700 text-sm font-semibold hover:bg-emerald-50 transition"
      >
        + Add Content
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-2 z-50 flex shadow-xl rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="w-48 border-r border-gray-100 py-1">
            {CONTENT_MENU.map((group) => (
              <button
                key={group.id}
                type="button"
                onMouseEnter={() => setHoverGroup(group.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm ${
                  hoverGroup === group.id ? 'bg-emerald-50 text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <MenuIcon kind={group.icon} />
                <span className="flex-1 font-medium">{group.label}</span>
                <span className="text-gray-400">›</span>
              </button>
            ))}
          </div>
          <div className="w-52 py-1 bg-white">
            {activeGroup.options.map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => {
                  onSelect(opt.type);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-800 hover:bg-emerald-50 transition"
              >
                <MenuIcon kind={activeGroup.icon} />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
