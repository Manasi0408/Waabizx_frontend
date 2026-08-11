import React from 'react';

export default function PlanLimitModal({ open, payload, onClose }) {
  if (!open || !payload) return null;

  const resource = String(payload.resource || 'items').replace(/_/g, ' ');

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              !
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Plan limit reached</h3>
              <p className="mt-1 text-xs text-gray-500">{payload.planName || 'Current plan'}</p>
            </div>
          </div>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm leading-relaxed text-gray-700">{payload.message}</p>
          {payload.limit != null ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-900">
              Allowed {resource}: <strong>{payload.limit}</strong>
              {payload.current != null ? (
                <>
                  {' '}
                  · Current: <strong>{payload.current}</strong>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex justify-end border-t border-gray-100 bg-gray-50/70 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
