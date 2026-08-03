import { RESOLVE_DISPOSITIONS } from '../constants/resolveDispositions';

/**
 * Must pick a disposition before the lead/chat can be closed.
 */
export default function ResolveDispositionModal({
  open,
  selected = null,
  onSelect,
  onConfirm,
  onCancel,
  confirming = false,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="resolve-disposition-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !confirming) onCancel?.();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl shadow-gray-900/20 ring-1 ring-black/5">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 id="resolve-disposition-title" className="text-lg font-bold text-gray-900">
            Select disposition
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Choose how this lead was resolved. The chat will not close until you select one.
          </p>
        </div>

        <div className="max-h-[min(60vh,420px)] space-y-2 overflow-y-auto px-5 py-4">
          {RESOLVE_DISPOSITIONS.map((opt) => {
            const isSelected = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={confirming}
                onClick={() => onSelect?.(opt.value)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-200'
                    : 'border-gray-200 bg-white hover:border-sky-300 hover:bg-sky-50/40'
                } disabled:opacity-60`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                    isSelected ? 'border-sky-600 bg-sky-600' : 'border-gray-300 bg-white'
                  }`}
                  aria-hidden
                >
                  {isSelected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900">{opt.label.split(' (')[0]}</span>
                  {opt.label.includes('(') ? (
                    <span className="mt-0.5 block text-xs text-gray-500">
                      {opt.label.slice(opt.label.indexOf('('))}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-3.5">
          <button
            type="button"
            disabled={confirming}
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || confirming}
            onClick={onConfirm}
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-600/25 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {confirming ? 'Resolving…' : 'Confirm & Resolve'}
          </button>
        </div>
      </div>
    </div>
  );
}
