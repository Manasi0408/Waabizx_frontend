import React from 'react';

export default function SessionExpiredModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 via-white to-blue-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 text-lg font-bold">
              !
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Session expired</h3>
              <p className="mt-1 text-xs text-gray-500">Your login session is no longer valid</p>
            </div>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm leading-relaxed text-gray-700">
            Session is expired. Please login again to continue.
          </p>
        </div>
        <div className="flex justify-end border-t border-gray-100 bg-gray-50/70 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:from-sky-500 hover:to-blue-600"
          >
            Login again
          </button>
        </div>
      </div>
    </div>
  );
}
