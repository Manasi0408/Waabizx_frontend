import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';
import { logout } from '../services/authService';
import HeaderRightActions from '../components/HeaderRightActions';
import BrandLogoMark from '../components/BrandLogoMark';

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

  const clearFilter = () => {
    setFrom('');
    setTo('');
    setError('');
  };

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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4">
      <div className="motion-pop w-full max-w-lg rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-2">
          <div>
            <h3 className="text-lg font-bold text-gray-900 tracking-tight">
              Download Partner WCC Report
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Select the date range to download partner WCC report
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <span className="text-sm font-semibold text-gray-700 shrink-0 w-12">Date</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-w-0">
              <label className="relative block">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </span>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  placeholder="From"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15"
                />
              </label>
              <label className="relative block">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-500">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </span>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="To"
                  className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15"
                />
              </label>
            </div>
          </div>
          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/60 px-5 py-4">
          <button
            type="button"
            onClick={clearFilter}
            disabled={downloading}
            className="rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60 transition"
          >
            Clear Filter
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-violet-600/25 hover:bg-violet-700 disabled:opacity-60 transition"
          >
            {downloading ? 'Downloading…' : 'Download'}
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

function SuperAdminBusinessesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const user = (() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  })();
  const userName = user?.name || 'SuperAdmin';
  const userInitial = String(userName || 'S').charAt(0).toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/business-overview');
      setRows(Array.isArray(res?.data?.businesses) ? res.data.businesses : []);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.businessName, r.adminEmail, r.projectName, r.planSlug, r.planCycle]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [rows, search]);

  const uniqueAdmins = useMemo(
    () => new Set(rows.map((r) => r.adminId).filter(Boolean)).size,
    [rows]
  );
  const totalWcc = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.wccCount) || 0), 0),
    [rows]
  );
  const activePlans = useMemo(() => rows.filter((r) => r.planActive).length, [rows]);

  const handleDownloadReport = async ({ from, to }) => {
    setDownloading(true);
    try {
      const res = await axios.get('/business-overview/report', {
        params: {
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
        },
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
      const fromLabel = from || 'all';
      const toLabel = to || 'all';
      a.href = url;
      a.download = `partner-wcc-report_${fromLabel}_to_${toLabel}.csv`;
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
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 shrink-0">
            <BrandLogoMark size="md" />
            <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">SuperAdmin</h2>
          </div>
          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <p className="text-xs md:text-sm text-gray-500 truncate">Business overview & WCC report</p>
        </div>

        <HeaderRightActions>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none"
            aria-label="Settings"
          >
            <span className="text-white font-semibold text-sm">{userInitial}</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-rose-700 flex items-center justify-center cursor-pointer shadow-md shadow-red-500/25 hover:shadow-lg hover:ring-2 ring-red-200/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none"
            aria-label="Logout"
            title="Logout"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m10 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h8a3 3 0 013 3v1" />
            </svg>
          </button>
        </HeaderRightActions>
      </header>

      <main className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
        <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden>
          <div className="absolute -top-24 -right-16 w-[18rem] h-[18rem] bg-sky-400/25 motion-page-blob" />
          <div className="absolute top-1/2 -left-20 w-[16rem] h-[16rem] bg-blue-400/20 motion-page-blob motion-page-blob--b" />
        </div>

        <div className="relative z-[1] min-h-full">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
            <section className="motion-enter relative mb-6 md:mb-8">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-600"
                aria-hidden
              />

              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-xl">
                  <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700 shadow-sm ring-1 ring-sky-100/80 backdrop-blur-sm">
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"
                      aria-hidden
                    />
                    SuperAdmin workspace
                  </p>

                  <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
                    <span className="bg-gradient-to-r from-gray-900 via-sky-800 to-blue-900 bg-clip-text text-transparent">
                      Business overview
                    </span>
                  </h1>

                  <p className="mt-3 text-base leading-relaxed text-gray-600 md:text-[17px]">
                    Admin login name, project, WCC balance, and current plan start / renewal dates.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-60 transition"
                  >
                    {loading ? 'Refreshing…' : 'Refresh'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDownloadModal(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-500/25 hover:shadow-lg transition"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download Report
                  </button>
                </div>
              </div>
            </section>

            <div className="mb-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/super-admin')}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Admins & contacts
              </button>
              <button
                type="button"
                onClick={() => navigate('/super-admin')}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Plans
              </button>
              <button
                type="button"
                onClick={() => navigate('/super-admin')}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Website leads
              </button>
              <button
                type="button"
                onClick={() => navigate('/super-admin')}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Demo bookings
              </button>
              <button
                type="button"
                onClick={() => navigate('/super-admin/blogs')}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-800"
              >
                Blogs
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-md"
              >
                Businesses
              </button>
            </div>

            <div className="motion-enter space-y-6">
              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100/50">
                  {error}
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <div className="rounded-2xl border border-gray-100/90 bg-white/90 p-4 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 backdrop-blur-sm motion-hover-lift">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Projects</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{rows.length}</p>
                </div>
                <div className="rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-50/80 via-white to-blue-50/40 p-4 shadow-lg shadow-sky-200/30 ring-1 ring-sky-100/60 backdrop-blur-sm motion-hover-lift">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800/70">Admins</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{uniqueAdmins}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 p-4 shadow-lg motion-hover-lift">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/70">Total WCC</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{formatWcc(totalWcc)}</p>
                </div>
                <div className="rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-500/10 via-white to-blue-500/10 p-4 shadow-lg shadow-sky-200/30 ring-1 ring-sky-100/60 backdrop-blur-sm motion-hover-lift">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800/70">Active plans</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{activePlans}</p>
                </div>
              </div>

              <section className="motion-hover-lift bg-white/95 backdrop-blur-sm border border-gray-100/90 rounded-2xl shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 p-4 md:p-5 overflow-hidden">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-sm font-bold text-gray-900">All businesses / projects</h3>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search business, email, project, plan…"
                    className="w-full sm:w-80 rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
                  />
                </div>

                {loading ? (
                  <div className="py-12 text-center text-sm text-gray-500">Loading businesses…</div>
                ) : filtered.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-500">No admin projects found yet.</div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-100/90">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-gradient-to-r from-white via-sky-50/40 to-white text-[11px] font-bold uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-3 py-3 whitespace-nowrap">Business name</th>
                          <th className="px-3 py-3 whitespace-nowrap">Login email</th>
                          <th className="px-3 py-3 whitespace-nowrap">Project name</th>
                          <th className="px-3 py-3 whitespace-nowrap text-right">WCC count</th>
                          <th className="px-3 py-3 whitespace-nowrap">Plan</th>
                          <th className="px-3 py-3 whitespace-nowrap">Plan start on</th>
                          <th className="px-3 py-3 whitespace-nowrap">Plan renewal date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {filtered.map((row) => (
                          <tr key={`${row.adminId}-${row.projectId}`} className="hover:bg-sky-50/40 transition">
                            <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">
                              {row.businessName}
                            </td>
                            <td className="px-3 py-3 text-gray-600 whitespace-nowrap">{row.adminEmail || '—'}</td>
                            <td className="px-3 py-3 text-gray-800 whitespace-nowrap">{row.projectName}</td>
                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-gray-900">
                              {formatWcc(row.wccCount)}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              {row.planSlug ? (
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${
                                    row.planActive
                                      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200/90'
                                      : 'bg-gray-100 text-gray-600 ring-gray-200/80'
                                  }`}
                                >
                                  {row.planSlug}
                                  {row.planCycle ? ` · ${row.planCycle}` : ''}
                                </span>
                              ) : (
                                <span className="text-gray-400">No plan</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                              {formatDisplayDate(row.planStartOn)}
                            </td>
                            <td className="px-3 py-3 text-gray-700 whitespace-nowrap">
                              {formatDisplayDate(row.planRenewalDate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>

      <DownloadWccReportModal
        open={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        onDownload={handleDownloadReport}
        downloading={downloading}
      />
    </div>
  );
}

export default SuperAdminBusinessesPage;
