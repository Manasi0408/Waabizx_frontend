import { useEffect, useState } from 'react';
import {
  getDispositionOptions,
  saveCustomDispositionLabel,
  splitDispositionLabel,
  joinDispositionLabel,
  RESOLVE_DISPOSITIONS,
  notifyDispositionLabelsChanged,
} from '../constants/resolveDispositions';

/**
 * Must pick a disposition before the lead/chat can be closed.
 * Each disposition label can be renamed via the edit icon (stored in localStorage).
 */
export default function ResolveDispositionModal({
  open,
  selected = null,
  onSelect,
  onConfirm,
  onCancel,
  confirming = false,
}) {
  const [options, setOptions] = useState(() => getDispositionOptions());
  const [editingValue, setEditingValue] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editHint, setEditHint] = useState('');

  const refreshOptions = () => setOptions(getDispositionOptions());

  useEffect(() => {
    if (!open) {
      setEditingValue(null);
      setEditTitle('');
      setEditHint('');
      return undefined;
    }
    refreshOptions();
    const onLabelsChanged = () => refreshOptions();
    window.addEventListener('waabizx-disposition-labels-changed', onLabelsChanged);
    window.addEventListener('storage', onLabelsChanged);
    return () => {
      window.removeEventListener('waabizx-disposition-labels-changed', onLabelsChanged);
      window.removeEventListener('storage', onLabelsChanged);
    };
  }, [open]);

  if (!open) return null;

  const startEdit = (opt) => {
    if (confirming) return;
    const { title, hint } = splitDispositionLabel(opt.label);
    setEditingValue(opt.value);
    setEditTitle(title);
    setEditHint(hint);
  };

  const cancelEdit = () => {
    setEditingValue(null);
    setEditTitle('');
    setEditHint('');
  };

  const saveEdit = (value) => {
    if (confirming) return;
    const title = String(editTitle || '').trim();
    if (!title) return;
    const nextLabel = joinDispositionLabel(title, editHint);
    saveCustomDispositionLabel(value, nextLabel);
    notifyDispositionLabelsChanged();
    refreshOptions();
    cancelEdit();
  };

  const resetToDefault = (value) => {
    if (confirming) return;
    const defaults = RESOLVE_DISPOSITIONS.find((d) => d.value === value);
    if (!defaults) return;
    saveCustomDispositionLabel(value, defaults.label);
    notifyDispositionLabelsChanged();
    refreshOptions();
    cancelEdit();
  };

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
          {options.map((opt) => {
            const isSelected = selected === opt.value;
            const isEditing = editingValue === opt.value;
            const { title, hint } = splitDispositionLabel(opt.label);

            return (
              <div
                key={opt.value}
                className={`w-full rounded-xl border px-3.5 py-3 transition ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50 ring-1 ring-sky-200'
                    : 'border-gray-200 bg-white hover:border-sky-300 hover:bg-sky-50/40'
                } ${confirming ? 'opacity-60' : ''}`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                          isSelected ? 'border-sky-600 bg-sky-600' : 'border-gray-300 bg-white'
                        }`}
                        aria-hidden
                      >
                        {isSelected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <input
                          type="text"
                          value={editTitle}
                          autoFocus
                          disabled={confirming}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              saveEdit(opt.value);
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelEdit();
                            }
                          }}
                          className="w-full rounded-lg border border-sky-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-sky-400/40"
                          placeholder="Disposition name"
                          aria-label="Rename disposition"
                        />
                        {editHint ? (
                          <p className="text-xs text-gray-500">{editHint}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pl-7">
                      <button
                        type="button"
                        onClick={() => saveEdit(opt.value)}
                        disabled={!String(editTitle || '').trim() || confirming}
                        className="rounded-md bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-45"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        disabled={confirming}
                        className="rounded-md px-2.5 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => resetToDefault(opt.value)}
                        disabled={confirming}
                        className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex w-full items-start gap-2">
                    <button
                      type="button"
                      disabled={confirming}
                      onClick={() => onSelect?.(opt.value)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
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
                        <span className="block text-sm font-semibold text-gray-900">{title}</span>
                        {hint ? (
                          <span className="mt-0.5 block text-xs text-gray-500">{hint}</span>
                        ) : null}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={confirming}
                      onClick={() => startEdit(opt)}
                      className="relative z-10 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-sky-100 hover:text-sky-700 disabled:opacity-50"
                      title="Rename disposition"
                      aria-label={`Rename ${title}`}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
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
            disabled={!selected || confirming || Boolean(editingValue)}
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
