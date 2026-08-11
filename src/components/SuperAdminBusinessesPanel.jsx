import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from '../api/axios';
import { fetchAdminPlans } from '../services/planService';
import { formatInr } from '../utils/planPricing';
import SuperAdminPagination, { useSuperAdminPagination } from './SuperAdminPagination';

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

const formatWcc = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-IN');
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

function resolvePlanValue(planCatalog, slug, cycle) {
  if (!slug) return null;
  const plan = planCatalog.find((p) => String(p.slug).toLowerCase() === String(slug).toLowerCase());
  if (!plan) return null;
  const key = String(cycle || 'monthly').toLowerCase();
  if (key === 'quarterly') return Number(plan.price_quarterly) || null;
  if (key === 'yearly') return Number(plan.price_yearly) || null;
  return Number(plan.price_monthly) || null;
}

function AdjustWccModal({ open, row, onClose, onSaved, saving, setSaving }) {
  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [carryForward, setCarryForward] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setMode('add');
    setAmount('');
    setNote('');
    setCarryForward(true);
    setError('');
  }, [open, row?.projectId]);

  if (!open || !row) return null;

  const handleSave = async () => {
    setError('');
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) {
      setError('Enter a valid amount.');
      return;
    }
    if (mode === 'add' && parsedAmount === 0) {
      setError('Amount cannot be zero.');
      return;
    }
    if (mode === 'set' && parsedAmount < 0) {
      setError('Balance cannot be negative.');
      return;
    }

    setSaving(true);
    try {
      const res = await axios.patch(`/business-overview/${row.projectId}/wcc`, {
        mode,
        amount: parsedAmount,
        note: note.trim() || (carryForward ? 'Carry forward from previous plan' : ''),
        carryForward,
      });
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]">
      <div className="motion-pop w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold tracking-tight text-gray-900">Adjust project WCC</h3>
            <p className="mt-1 text-sm text-gray-500">
              {row.projectName} · Current remaining: {formatWcc(row.wccRemainingCredits ?? row.wccCount)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            ×
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Adjustment type</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
            >
              <option value="add">Add credits (carry forward / top-up)</option>
              <option value="set">Set exact balance</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-600">
              {mode === 'set' ? 'New balance' : 'Amount to add'}
            </span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
              placeholder={mode === 'set' ? 'Enter new WCC balance' : 'Enter credits to add'}
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Note</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 resize-y"
              placeholder="e.g. Carry forward pending WCC from previous plan"
            />
          </label>
          {mode === 'add' ? (
            <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-sky-100 bg-sky-50/50 px-3 py-2.5">
              <input
                type="checkbox"
                checked={carryForward}
                onChange={(e) => setCarryForward(e.target.checked)}
                className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="text-sm text-gray-700">Carry forward pending amount to next plan</span>
            </label>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-white disabled:opacity-60">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save adjustment'}
          </button>
        </div>
      </div>
    </div>
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
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [adjustSuccess, setAdjustSuccess] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [overviewRes, plans] = await Promise.all([
        axios.get('/business-overview'),
        fetchAdminPlans().catch(() => []),
      ]);
      setRows(Array.isArray(overviewRes?.data?.businesses) ? overviewRes.data.businesses : []);
      setPlanCatalog(Array.isArray(plans) ? plans : []);
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
      const planValue = resolvePlanValue(planCatalog, r.planSlug, r.planCycle);
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
    <div className="motion-enter space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-sky-100/90 bg-white/95 p-5 shadow-lg ring-1 ring-gray-100/80 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Businesses with plans</h2>
            <p className="mt-2 text-sm text-gray-600">
              Only businesses that purchased a plan are listed here, with plan name and value.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-60"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={() => setShowDownloadModal(true)}
              className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md"
            >
              Download Report
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {adjustSuccess ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{adjustSuccess}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white/90 p-4 shadow-lg ring-1 ring-gray-100/80">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Plan purchases</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{purchasedRows.length}</p>
        </div>
        <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50/80 to-white p-4 shadow-lg ring-1 ring-sky-100/60">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800/70">Admins</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{uniqueAdmins}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-white p-4 shadow-lg ring-1 ring-emerald-100/60">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/70">Total remaining WCC</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{formatWcc(totalWcc)}</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white/95 shadow-lg ring-1 ring-gray-100/80">
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
                    <th className="whitespace-nowrap px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {paginatedItems.map((row) => {
                    const planValue = resolvePlanValue(planCatalog, row.planSlug, row.planCycle);
                    return (
                      <tr key={`${row.adminId}-${row.projectId}`} className="transition hover:bg-sky-50/40">
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-gray-900">{row.businessName}</td>
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
                            {row.planSlug}
                            {row.planCycle ? ` · ${row.planCycle}` : ''}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold tabular-nums text-gray-900">
                          {planValue != null ? `₹ ${formatInr(planValue)}` : '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDisplayDate(row.planStartOn)}</td>
                        <td className="whitespace-nowrap px-3 py-3 text-gray-700">{formatDisplayDate(row.planRenewalDate)}</td>
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
      </section>

      <DownloadWccReportModal
        open={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        onDownload={handleDownloadReport}
        downloading={downloading}
      />

      <AdjustWccModal
        open={Boolean(adjustRow)}
        row={adjustRow}
        onClose={() => setAdjustRow(null)}
        saving={adjustSaving}
        setSaving={setAdjustSaving}
        onSaved={async (data) => {
          setAdjustSuccess(
            data?.message ||
              `WCC updated for ${data?.projectName || 'project'}. New balance: ${formatWcc(data?.balance)}`
          );
          await load();
          setTimeout(() => setAdjustSuccess(''), 5000);
        }}
      />
    </div>
  );
}

export default SuperAdminBusinessesPanel;
