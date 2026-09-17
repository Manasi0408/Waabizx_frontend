import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from '../api/axios';
import {
  downloadProjectWccTransactions,
  fetchAdminPlans,
  fetchProjectWccTransactions,
} from '../services/planService';
import { formatPlanAmount, gstAmount, isInrCurrency, resolvePayableAmount } from '../utils/planPricing';
import SuperAdminPagination, { PrevNextPagination, useSuperAdminPagination } from './SuperAdminPagination';
import {
  SuperAdminAlert,
  SuperAdminHero,
  SuperAdminPage,
  SuperAdminPanel,
  SuperAdminStatGrid,
  SuperAdminStatTile,
} from './SuperAdminUi';

const formatDisplayDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

/** Same window as admin billing (AgentRightPanel): active plan ending within 7 days. */
const computePlanEndingSoon = (planActive, planRenewalDate) => {
  if (!planActive || !planRenewalDate) return null;
  const endDate = new Date(planRenewalDate);
  if (Number.isNaN(endDate.getTime())) return null;
  const msLeft = endDate.getTime() - Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  if (msLeft < 0 || msLeft > weekMs) return null;
  return {
    endDate: endDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    daysLeft: Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000))),
  };
};

const formatWcc = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-IN');
};

const formatMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0.00';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
};

const WCC_CATEGORY_LABELS = {
  marketing: 'Marketing',
  utility: 'Utility',
  authentication: 'Authentication',
  service: 'Service',
};

function DownloadWccReportModal({ open, onClose, onDownload, downloading }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFrom('');
    setTo('');
    setError('');
  }, [open]);

  if (!open) return null;

  const handleDownload = async () => {
    setError('');
    if (from && to && from > to) {
      setError('From date cannot be after To date.');
      return;
    }
    try {
      await onDownload({ from, to });
    } catch (e) {
      setError(e?.message || 'Failed to download report');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
      <div className="motion-pop w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-5">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-gray-900">Download Partner WCC Report</h3>
            <p className="mt-1 text-sm text-gray-500">Select the date range to download partner WCC report</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 px-5 py-4 sm:grid-cols-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15"
          />
        </div>
        {error ? <p className="px-5 pb-2 text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-4">
          <button
            type="button"
            onClick={() => {
              setFrom('');
              setTo('');
              setError('');
            }}
            disabled={downloading}
            className="rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-violet-700 disabled:opacity-60"
          >
            {downloading ? 'Downloading…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}

function resolvePlanValue(planCatalog, slug, cycle, currency = 'INR') {
  if (!slug) return null;
  const plan = planCatalog.find((p) => String(p.slug).toLowerCase() === String(slug).toLowerCase());
  if (!plan) return null;
  const isUsd = !isInrCurrency(currency);
  const key = String(cycle || 'monthly').toLowerCase();
  if (key === 'quarterly') {
    return Number(isUsd ? plan.price_quarterly_usd : plan.price_quarterly) || null;
  }
  if (key === 'yearly') {
    return Number(isUsd ? plan.price_yearly_usd : plan.price_yearly) || null;
  }
  return Number(isUsd ? plan.price_monthly_usd : plan.price_monthly) || null;
}


/** Plan value for display — prefer paid total (incl. GST for INR), else catalog + GST. */
function resolveRowPlanValueInclGst(row, planCatalog) {
  if (!row) return { value: null, fromPurchase: false };
  const currency = row.adminCurrency || 'INR';

  if (row.planAmount != null && Number.isFinite(Number(row.planAmount)) && Number(row.planAmount) > 0) {
    return { value: Number(row.planAmount), fromPurchase: true };
  }

  if (
    row.planRemainingAmount != null &&
    Number.isFinite(Number(row.planRemainingAmount)) &&
    Number(row.planRemainingAmount) > 0
  ) {
    return { value: Number(row.planRemainingAmount), fromPurchase: Boolean(row.planAmount) };
  }

  const base = resolvePlanValue(planCatalog, row.planSlug, row.planCycle, currency);
  if (base == null) return { value: null, fromPurchase: false };
  return { value: resolvePayableAmount(base, currency), fromPurchase: false };
}

function formatPlanValueInclGst(display) {
  const value = display?.value;
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const currency = display?.currency || 'INR';
  const isUsd = !isInrCurrency(currency);
  const total = Number(value);

  if (isUsd) {
    return formatPlanAmount(total, currency);
  }

  if (display?.fromPurchase) {
    return `${formatPlanAmount(total, currency)} (incl. GST)`;
  }

  const base = Math.round((total / 1.18) * 100) / 100;
  const gst = gstAmount(base);
  return `${formatPlanAmount(total, currency)} (incl. GST ${formatPlanAmount(gst, currency)})`;
}

function resolvePlanLabel(planCatalog, row) {
  const slug = String(row?.planSlug || '').trim();
  if (!slug) return '—';
  const plan = planCatalog.find((p) => String(p.slug).toLowerCase() === slug.toLowerCase());
  const label = String(plan?.name || plan?.title || slug).trim();
  const cycle = row?.planCycle ? ` · ${row.planCycle}` : '';
  return `${label}${cycle}`;
}

function SuperAdminModalPortal({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function AdjustPlanModal({ open, row, siblingProjects, planCatalog, onClose, onSaved, saving, setSaving }) {
  const [targetProjectId, setTargetProjectId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const planDisplay = useMemo(
    () => resolveRowPlanValueInclGst(row, planCatalog),
    [row, planCatalog]
  );
  const planValue = planDisplay.value;

  useEffect(() => {
    if (!open) return;
    setTargetProjectId('');
    setAmount(planValue != null ? String(planValue) : '');
    setNote('');
    setError('');
  }, [open, row?.projectId, planValue]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !row) return null;

  const targets = (Array.isArray(siblingProjects) ? siblingProjects : []).filter(
    (p) => Number(p.projectId) !== Number(row.projectId)
  );
  const planLabel = resolvePlanLabel(planCatalog, row);

  const handleSave = async () => {
    setError('');
    if (!targets.length) {
      setError('No other connected project is available for this admin.');
      return;
    }
    if (!targetProjectId) {
      setError('Select a target project.');
      return;
    }
    const parsedAmount = amount === '' ? null : Number(amount);
    if (parsedAmount != null && (!Number.isFinite(parsedAmount) || parsedAmount < 0)) {
      setError('Enter a valid plan amount.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        targetProjectId: Number(targetProjectId),
        note: note.trim() || undefined,
      };
      if (parsedAmount != null && parsedAmount > 0) payload.amount = parsedAmount;

      const res = await axios.patch(`/business-overview/${row.projectId}/plan/transfer`, payload);
      if (!res?.data?.success) {
        throw new Error(res?.data?.message || 'Failed to transfer plan');
      }
      await onSaved(res.data);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to transfer plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperAdminModalPortal>
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center overflow-y-auto bg-slate-900/55 p-0 backdrop-blur-sm sm:items-center sm:p-4 md:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-plan-title"
        onClick={(e) => {
          if (e.target === e.currentTarget && !saving) onClose();
        }}
      >
        <div className="motion-pop flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/5 sm:my-auto sm:rounded-2xl">
          <div className="shrink-0 border-b border-gray-100 bg-gradient-to-r from-emerald-50/80 via-white to-white px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 pr-2">
                <h3 id="adjust-plan-title" className="text-lg font-bold tracking-tight text-gray-900">
                  Adjust plan to project
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Move this plan from the source project to another connected project.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-60"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Source project</span>
                <input
                  readOnly
                  value={row.projectName}
                  className="mt-1 w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Plan</span>
                <input
                  readOnly
                  value={planLabel}
                  className="mt-1 w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Plan amount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  placeholder={planValue != null ? String(planValue) : 'Enter plan amount'}
                />
                {planValue != null ? (
                  <p className="mt-1 text-xs text-gray-500">
                    Current value:{' '}
                    {formatPlanValueInclGst({ ...planDisplay, currency: row.adminCurrency || 'INR' })}
                  </p>
                ) : null}
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Target project</span>
                {targets.length === 0 ? (
                  <p className="mt-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                    No other project is linked to this admin account.
                  </p>
                ) : (
                  <select
                    value={targetProjectId}
                    onChange={(e) => setTargetProjectId(e.target.value)}
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  >
                    <option value="">Select connected project</option>
                    {targets.map((p) => (
                      <option key={p.projectId} value={p.projectId}>
                        {p.projectName}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Note</span>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full resize-none rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 sm:resize-y"
                  placeholder="Optional adjustment note"
                />
              </label>
              {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || targets.length === 0}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save adjustment'}
            </button>
          </div>
        </div>
      </div>
    </SuperAdminModalPortal>
  );
}

function AdjustWccModal({ open, row, siblingProjects, onClose, onSaved, saving, setSaving }) {
  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('');
  const [targetProjectId, setTargetProjectId] = useState('');
  const [note, setNote] = useState('');
  const [carryForward, setCarryForward] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('add');
    setAmount('');
    setTargetProjectId(String(row?.projectId || ''));
    setNote('');
    setCarryForward(true);
    setError('');
  }, [open, row?.projectId]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !row) return null;

  const targets = Array.isArray(siblingProjects) ? siblingProjects : [];
  const isTransfer =
    targetProjectId &&
    Number(targetProjectId) !== Number(row.projectId);

  const handleSave = async () => {
    setError('');
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) {
      setError('Enter a valid amount.');
      return;
    }
    if (isTransfer) {
      if (parsedAmount <= 0) {
        setError('Transfer amount must be greater than zero.');
        return;
      }
    } else if (mode === 'add' && parsedAmount === 0) {
      setError('Amount cannot be zero.');
      return;
    } else if (mode === 'set' && parsedAmount < 0) {
      setError('Balance cannot be negative.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        mode: isTransfer ? 'transfer' : mode,
        amount: parsedAmount,
        note: note.trim() || (carryForward ? 'Carry forward from previous plan' : ''),
        carryForward,
      };
      if (targetProjectId) payload.targetProjectId = Number(targetProjectId);

      const res = await axios.patch(`/business-overview/${row.projectId}/wcc`, payload);
      if (!res?.data?.success) {
        throw new Error(res?.data?.message || 'Failed to adjust WCC');
      }
      await onSaved(res.data);
      onClose();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to adjust WCC');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SuperAdminModalPortal>
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center overflow-y-auto bg-slate-900/55 p-0 backdrop-blur-sm sm:items-center sm:p-4 md:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-wcc-title"
        onClick={(e) => {
          if (e.target === e.currentTarget && !saving) onClose();
        }}
      >
        <div className="motion-pop flex max-h-[min(92dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/5 sm:my-auto sm:rounded-2xl">
          <div className="shrink-0 border-b border-gray-100 bg-gradient-to-r from-sky-50/80 via-white to-white px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 pr-2">
                <h3 id="adjust-wcc-title" className="text-lg font-bold tracking-tight text-gray-900">
                  Adjust project WCC
                </h3>
                <p className="mt-1 break-words text-sm text-gray-500">
                  <span className="font-medium text-gray-700">{row.projectName}</span>
                  {' · '}
                  Current remaining: {formatWcc(row.wccRemainingCredits ?? row.wccCount)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-60"
                aria-label="Close"
              >
                ×
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Source project</span>
                <input
                  readOnly
                  value={row.projectName}
                  className="mt-1 w-full rounded-xl border-2 border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Target project</span>
                <select
                  value={targetProjectId}
                  onChange={(e) => setTargetProjectId(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
                >
                  {targets.map((p) => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.projectName}
                      {Number(p.projectId) === Number(row.projectId) ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {!isTransfer ? (
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Adjustment type</span>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
                  >
                    <option value="add">Add credits (carry forward / top-up)</option>
                    <option value="set">Set exact balance</option>
                  </select>
                </label>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                  Transfer mode: credits will move from the source project to the selected target project.
                </div>
              )}
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-600">
                  {isTransfer ? 'Amount to transfer' : mode === 'set' ? 'New balance' : 'Amount to add'}
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
                  placeholder={
                    isTransfer
                      ? 'Enter WCC credits to move to target project'
                      : mode === 'set'
                        ? 'Enter new WCC balance'
                        : 'Enter credits to add'
                  }
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Note</span>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full resize-none rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 sm:resize-y"
                  placeholder="e.g. Carry forward pending WCC from previous plan"
                />
              </label>
              {!isTransfer && mode === 'add' ? (
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-sky-100 bg-sky-50/50 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={carryForward}
                    onChange={(e) => setCarryForward(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm leading-snug text-gray-700">Carry forward pending amount to next plan</span>
                </label>
              ) : null}
              {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save adjustment'}
            </button>
          </div>
        </div>
      </div>
    </SuperAdminModalPortal>
  );
}

const WCC_WALLET_PAGE_SIZE = 10;

function WccWalletModal({ open, row, onClose }) {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!open) return;
    setPage(1);
  }, [open, row?.projectId]);

  useEffect(() => {
    if (!open || !row?.projectId) return undefined;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchProjectWccTransactions(row.projectId, {
          page,
          limit: WCC_WALLET_PAGE_SIZE,
        });
        if (cancelled) return;
        setBalance(Number(data.balance) || Number(row.wccExtraCredits) || 0);
        setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
        setTotal(Number(data.total) || 0);
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.message || e?.message || 'Failed to load WCC wallet');
          setBalance(Number(row.wccExtraCredits) || 0);
          setTransactions([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open, row?.projectId, row?.wccExtraCredits, page]);

  const totalPages = Math.max(1, Math.ceil(total / WCC_WALLET_PAGE_SIZE));

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleDownload = async () => {
    if (!row?.projectId) return;
    setDownloading(true);
    setError('');
    try {
      const safeName = String(row.projectName || row.projectId)
        .trim()
        .replace(/[^\w.-]+/g, '_')
        .slice(0, 60);
      await downloadProjectWccTransactions(row.projectId, {
        filename: `wcc-wallet_${safeName || row.projectId}.csv`,
      });
    } catch (e) {
      setError(e?.message || 'Failed to download WCC wallet report');
    } finally {
      setDownloading(false);
    }
  };

  if (!open || !row) return null;

  return (
    <SuperAdminModalPortal>
      <div
        className="fixed inset-0 z-[200] flex items-end justify-center overflow-y-auto bg-slate-900/55 p-0 backdrop-blur-sm sm:items-center sm:p-4 md:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wcc-wallet-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="motion-pop flex max-h-[min(92dvh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/5 sm:my-auto sm:rounded-2xl">
          <div className="shrink-0 border-b border-gray-100 bg-gradient-to-r from-emerald-50/80 via-white to-white px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 pr-2">
                <h3 id="wcc-wallet-title" className="text-lg font-bold tracking-tight text-gray-900">
                  WCC Wallet
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  {row.businessName} · {row.projectName}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading || loading}
                  className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloading ? 'Downloading…' : 'Download'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/70">Current balance</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{formatMoney(balance)}</p>
            </div>

            {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

            <div className="mt-5">
              <h4 className="text-sm font-bold text-gray-900">Transaction history</h4>
              {loading ? (
                <p className="mt-4 text-sm text-gray-500">Loading transactions…</p>
              ) : transactions.length === 0 ? (
                <p className="mt-4 text-sm text-gray-500">No WCC transactions yet.</p>
              ) : (
                <div className="mt-3 overflow-x-auto rounded-xl border border-gray-100">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-gray-50/80 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-2.5">Date</th>
                        <th className="whitespace-nowrap px-3 py-2.5">Category</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right">Deducted</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right">Actual cost</th>
                        <th className="whitespace-nowrap px-3 py-2.5 text-right">Extra</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {transactions.map((tx) => (
                        <tr key={tx.id || `${tx.messageId}-${tx.createdAt}`}>
                          <td className="whitespace-nowrap px-3 py-2.5 text-gray-700">
                            {formatDisplayDate(tx.createdAt)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-gray-800">
                            {WCC_CATEGORY_LABELS[tx.category] || tx.category || '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                            {formatMoney(tx.deducted ?? tx.customerCharge ?? tx.amount)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-gray-700">
                            {formatMoney(tx.originalAmount)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-emerald-700">
                            {formatMoney(tx.extraAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {total > WCC_WALLET_PAGE_SIZE ? (
                    <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3">
                      <PrevNextPagination
                        page={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        disabled={loading}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </SuperAdminModalPortal>
  );
}

function SuperAdminBusinessesPanel() {
  const [rows, setRows] = useState([]);
  const [planCatalog, setPlanCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [adjustRow, setAdjustRow] = useState(null);
  const [adjustPlanRow, setAdjustPlanRow] = useState(null);
  const [adjustPlanSaving, setAdjustPlanSaving] = useState(false);
  const [adjustWccSaving, setAdjustWccSaving] = useState(false);
  const [adjustSuccess, setAdjustSuccess] = useState('');
  const [wccWalletRow, setWccWalletRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [overviewRes, plansRes] = await Promise.all([
        axios.get('/business-overview'),
        fetchAdminPlans().catch(() => ({ plans: [] })),
      ]);
      setRows(Array.isArray(overviewRes?.data?.businesses) ? overviewRes.data.businesses : []);
      setPlanCatalog(Array.isArray(plansRes?.plans) ? plansRes.plans : []);
    } catch (e) {
      setRows([]);
      setError(e?.response?.data?.message || e?.message || 'Failed to load businesses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const purchasedRows = useMemo(
    () => rows.filter((r) => r.planActive && r.planSlug),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchasedRows;
    return purchasedRows.filter((r) => {
      const planDisplay = resolveRowPlanValueInclGst(r, planCatalog);
      const planValue = planDisplay.value;
      const hay = [
        r.businessName,
        r.adminEmail,
        r.projectName,
        r.planSlug,
        r.planCycle,
        planValue != null ? String(planValue) : '',
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [purchasedRows, search, planCatalog]);

  const { page, setPage, totalPages, paginatedItems, totalItems, pageSize } = useSuperAdminPagination(
    filtered,
    [search]
  );

  const uniqueAdmins = useMemo(
    () => new Set(purchasedRows.map((r) => r.adminId).filter(Boolean)).size,
    [purchasedRows]
  );
  const totalWcc = useMemo(
    () => purchasedRows.reduce((sum, r) => sum + (Number(r.wccCount) || 0), 0),
    [purchasedRows]
  );

  const projectsByAdmin = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const adminId = Number(row.adminId);
      if (!adminId) continue;
      if (!map.has(adminId)) map.set(adminId, []);
      map.get(adminId).push(row);
    }
    return map;
  }, [rows]);

  const getSiblingProjects = useCallback(
    (row) => {
      if (!row?.adminId) return [];
      const list = projectsByAdmin.get(Number(row.adminId)) || [];
      return list.slice().sort((a, b) => String(a.projectName).localeCompare(String(b.projectName)));
    },
    [projectsByAdmin]
  );

  const handleDownloadReport = async ({ from, to }) => {
    setDownloading(true);
    try {
      const res = await axios.get('/business-overview/report', {
        params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
        responseType: 'blob',
      });
      const contentType = String(res.headers?.['content-type'] || '');
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        let message = 'Failed to download report';
        try {
          message = JSON.parse(text)?.message || message;
        } catch (_) {
          /* ignore */
        }
        throw new Error(message);
      }
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `partner-wcc-report_${from || 'all'}_to_${to || 'all'}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setShowDownloadModal(false);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SuperAdminPage>
      <SuperAdminHero
        accent="indigo"
        badge="Subscriptions"
        title="Businesses with plans"
        description="Only businesses that purchased a plan are listed here, with plan name and value."
        actions={
          <>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="motion-hover-lift rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-800 transition hover:bg-indigo-50 disabled:opacity-60"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => setShowDownloadModal(true)}
              className="motion-hover-lift rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              Download Report
            </button>
          </>
        }
      />

      {error ? <SuperAdminAlert>{error}</SuperAdminAlert> : null}

      {adjustSuccess ? <SuperAdminAlert type="success">{adjustSuccess}</SuperAdminAlert> : null}

      <SuperAdminStatGrid className="sm:grid-cols-3">
        <SuperAdminStatTile label="Plan purchases" value={purchasedRows.length} />
        <SuperAdminStatTile label="Admins" value={uniqueAdmins} tone="sky" />
        <SuperAdminStatTile label="Total remaining WCC" value={formatWcc(totalWcc)} tone="emerald" />
      </SuperAdminStatGrid>

      <SuperAdminPanel accent="indigo" padding="p-0" interactive={false}>
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-gradient-to-r from-white via-sky-50/40 to-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
          <h3 className="text-sm font-bold text-gray-900">Purchased plans</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search business, email, project, plan…"
            className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 sm:w-80"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading businesses…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">No businesses with purchased plans yet.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50/80 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-3">Business name</th>
                    <th className="whitespace-nowrap px-3 py-3">Login email</th>
                    <th className="whitespace-nowrap px-3 py-3">Project name</th>
                    <th className="whitespace-nowrap px-3 py-3 text-right">Remaining WCC</th>
                    <th className="whitespace-nowrap px-3 py-3 text-right">Est. messages</th>
                    <th className="whitespace-nowrap px-3 py-3">Plan</th>
                    <th className="whitespace-nowrap px-3 py-3">Plan value</th>
                    <th className="whitespace-nowrap px-3 py-3">Plan start on</th>
                    <th className="whitespace-nowrap px-3 py-3">Plan renewal date</th>
                    <th className="whitespace-nowrap px-3 py-3">Adjust Plans</th>
                    <th className="whitespace-nowrap px-3 py-3">Actions</th>
                    <th className="whitespace-nowrap px-3 py-3">WCC Wallet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {paginatedItems.map((row) => {
                    const planDisplay = resolveRowPlanValueInclGst(row, planCatalog);
                    const planLabel = resolvePlanLabel(planCatalog, row);
                    const planEndingSoon = computePlanEndingSoon(row.planActive, row.planRenewalDate);
                    return (
                      <tr
                        key={`${row.adminId}-${row.projectId}`}
                        className="transition-all duration-200 hover:bg-indigo-50/40 hover:shadow-[inset_3px_0_0_0_rgb(99,102,241)]"
                      >
                        <td className="px-3 py-3">
                          {planEndingSoon ? (
                            <div className="mb-1.5 max-w-xs rounded-lg border border-amber-200/90 bg-gradient-to-br from-amber-50 to-orange-50/60 px-2 py-1.5 ring-1 ring-amber-100/80">
                              <p className="text-[10px] font-semibold leading-snug text-amber-900">
                                Plan ends soon — please recharge to continue
                              </p>
                              <p className="mt-0.5 text-[10px] text-amber-800/90">
                                Ends on <span className="font-bold">{planEndingSoon.endDate}</span>
                                {planEndingSoon.daysLeft === 1
                                  ? ' (tomorrow)'
                                  : ` (${planEndingSoon.daysLeft} days left)`}
                              </p>
                            </div>
                          ) : null}
                          <span className="whitespace-nowrap font-semibold text-gray-900">{row.businessName}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-gray-600">{row.adminEmail || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-gray-800">{row.projectName}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums text-gray-900">
                          {formatWcc(row.wccRemainingCredits ?? row.wccCount)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-gray-700">
                          {formatWcc(row.remainingEstimatedMessages ?? 0)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-200/90">
                            {planLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-semibold tabular-nums text-gray-900">
                          <span className="whitespace-nowrap">
                            {formatPlanValueInclGst({
                              ...planDisplay,
                              currency: row.adminCurrency || 'INR',
                            })}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDisplayDate(row.planStartOn)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDisplayDate(row.planRenewalDate)}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustSuccess('');
                              setAdjustPlanRow(row);
                            }}
                            className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            Adjust Plan
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              setAdjustSuccess('');
                              setAdjustRow(row);
                            }}
                            className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                          >
                            Adjust WCC
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <button
                            type="button"
                            onClick={() => setWccWalletRow(row)}
                            className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            WCC Wallet
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <SuperAdminPagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={totalItems}
              pageSize={pageSize}
            />
          </>
        )}
      </SuperAdminPanel>

      <DownloadWccReportModal
        open={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        onDownload={handleDownloadReport}
        downloading={downloading}
      />

      <AdjustPlanModal
        open={Boolean(adjustPlanRow)}
        row={adjustPlanRow}
        siblingProjects={adjustPlanRow ? getSiblingProjects(adjustPlanRow) : []}
        planCatalog={planCatalog}
        onClose={() => setAdjustPlanRow(null)}
        saving={adjustPlanSaving}
        setSaving={setAdjustPlanSaving}
        onSaved={async (data) => {
          setAdjustSuccess(data?.message || `Plan transferred to ${data?.targetProjectName || 'target project'}.`);
          await load();
          setTimeout(() => setAdjustSuccess(''), 5000);
        }}
      />

      <AdjustWccModal
        open={Boolean(adjustRow)}
        row={adjustRow}
        siblingProjects={adjustRow ? getSiblingProjects(adjustRow) : []}
        onClose={() => setAdjustRow(null)}
        saving={adjustWccSaving}
        setSaving={setAdjustWccSaving}
        onSaved={async (data) => {
          setAdjustSuccess(
            data?.message ||
              `WCC updated for ${data?.projectName || 'project'}. New balance: ${formatWcc(data?.balance ?? data?.targetBalance)}`
          );
          await load();
          setTimeout(() => setAdjustSuccess(''), 5000);
        }}
      />

      <WccWalletModal open={Boolean(wccWalletRow)} row={wccWalletRow} onClose={() => setWccWalletRow(null)} />
    </SuperAdminPage>
  );
}

export default SuperAdminBusinessesPanel;
