import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from '../api/axios';

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phone || '—';
};

const truncate = (text, max = 80) => {
  const s = String(text || '').trim();
  if (!s) return '—';
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'closed', label: 'Closed' },
];

const statusBadgeClass = (status) => {
  const key = String(status || 'new').toLowerCase();
  if (key === 'contacted') return 'bg-sky-50 text-sky-800 ring-sky-200/90';
  if (key === 'closed') return 'bg-gray-100 text-gray-600 ring-gray-200/80';
  return 'bg-emerald-50 text-emerald-800 ring-emerald-200/90';
};

const statusLabel = (status) => {
  const key = String(status || 'new').toLowerCase();
  return STATUS_OPTIONS.find((o) => o.value === key)?.label || 'New';
};

function SuperAdminLeadsPanel() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/website-leads');
      setLeads(Array.isArray(res?.data?.leads) ? res.data.leads : []);
    } catch (e) {
      setLeads([]);
      setError(e?.response?.data?.message || e?.message || 'Failed to load website leads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((lead) => {
      const haystack = [
        lead.full_name,
        lead.email,
        lead.phone,
        lead.subject,
        lead.message,
        lead.status,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return haystack.includes(q);
    });
  }, [leads, search]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = leads.filter((lead) => {
      const d = new Date(lead.createdAt);
      return !Number.isNaN(d.getTime()) && d >= today;
    }).length;
    const newCount = leads.filter((lead) => String(lead.status || 'new').toLowerCase() === 'new').length;
    return { total: leads.length, today: todayCount, newCount };
  }, [leads]);

  return (
    <div className="motion-enter space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-violet-100/90 bg-white/95 p-5 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 backdrop-blur-sm">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-violet-400 via-sky-500 to-blue-600"
          aria-hidden
        />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-800 ring-1 ring-violet-200/70">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" aria-hidden />
              Website inquiries
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
              <span className="bg-gradient-to-r from-gray-900 via-violet-800 to-blue-900 bg-clip-text text-transparent">
                Website leads
              </span>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 md:text-base">
              Contact form submissions from{' '}
              <strong className="font-semibold text-gray-800">techwhizzc.com/waabizx</strong> appear here for follow-up.
            </p>
          </div>
          <button
            type="button"
            onClick={loadLeads}
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-60 transition"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="rounded-2xl border border-gray-100/90 bg-white/90 p-4 shadow-lg shadow-gray-200/30 ring-1 ring-gray-100/80 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total leads</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 p-4 shadow-lg shadow-emerald-100/30 ring-1 ring-emerald-100/60 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/70">New leads</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">{stats.newCount}</p>
        </div>
        <div className="rounded-2xl border border-violet-100/90 bg-gradient-to-br from-violet-500/10 via-white to-blue-500/10 p-4 shadow-lg shadow-violet-200/25 ring-1 ring-violet-100/60 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-800/70">Submitted today</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-violet-800">{stats.today}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100/90 bg-gradient-to-r from-white via-violet-50/40 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">All website leads</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {filteredLeads.length} lead{filteredLeads.length === 1 ? '' : 's'}
              {search.trim() ? ' matching search' : ''}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:min-w-[20rem]">
            <div className="relative flex-1 sm:max-w-xs">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone…"
              className="w-full rounded-xl border-2 border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20"
            />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-violet-200 border-t-violet-600" />
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 ring-1 ring-violet-100">
              <svg className="h-7 w-7 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">
              {search.trim() ? 'No leads match your search' : 'No website leads yet'}
            </p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              {search.trim()
                ? 'Try a different name, email, or phone number.'
                : 'When someone submits the contact form on your marketing website, their details will show up in this list.'}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-left">
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Name</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Email</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Phone</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Subject</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Message</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredLeads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="hover:bg-violet-50/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedLead(lead)}
                    >
                      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                        {lead.full_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {lead.email ? (
                          <a
                            href={`mailto:${lead.email}`}
                            className="text-sky-700 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {lead.email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatPhone(lead.phone)}</td>
                      <td className="px-4 py-3 text-gray-700">{lead.subject || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[220px]">{truncate(lead.message)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ring-1 ${statusBadgeClass(lead.status)}`}
                        >
                          {statusLabel(lead.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{formatDate(lead.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden p-4 space-y-3 motion-stagger-children">
              {filteredLeads.map((lead) => {
                const initial = String(lead.full_name || '?').charAt(0).toUpperCase();
                return (
                  <article
                    key={lead.id}
                    className="rounded-2xl border border-gray-100/90 bg-white p-4 shadow-sm ring-1 ring-gray-100/80"
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 via-violet-600 to-blue-700 text-white flex items-center justify-center shadow-sm">
                        <span className="text-sm font-bold">{initial}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900">{lead.full_name || 'Unnamed'}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{formatDate(lead.createdAt)}</div>
                          </div>
                          <span
                            className={`shrink-0 inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ring-1 ${statusBadgeClass(lead.status)}`}
                          >
                            {statusLabel(lead.status)}
                          </span>
                        </div>
                        {lead.subject ? (
                          <span className="mt-2 inline-flex text-[10px] font-bold uppercase tracking-wide text-violet-800 bg-violet-50 px-2 py-0.5 rounded-full ring-1 ring-violet-100">
                            {lead.subject}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs text-gray-600">
                      <div>
                        <span className="font-semibold text-gray-500">Email:</span>{' '}
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} className="text-sky-700">
                            {lead.email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-500">Phone:</span> {formatPhone(lead.phone)}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-500">Message:</span> {truncate(lead.message, 120)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedLead(lead)}
                      className="mt-3 w-full px-3 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600"
                    >
                      View full details
                    </button>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      {selectedLead ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-200/90 ring-1 ring-black/5 flex flex-col">
            <div className="shrink-0 px-5 py-4 border-b border-violet-100/90 bg-gradient-to-r from-violet-50 via-white to-blue-50 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-gray-900">Lead details</h4>
                <p className="text-xs text-gray-500 mt-0.5">{formatDate(selectedLead.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="w-9 h-9 rounded-xl text-gray-500 hover:bg-white border border-transparent hover:border-gray-200 transition text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Full name</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{selectedLead.full_name || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Email</p>
                <p className="mt-1 text-sm text-gray-800">
                  {selectedLead.email ? (
                    <a href={`mailto:${selectedLead.email}`} className="text-sky-700 hover:underline">
                      {selectedLead.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Phone</p>
                <p className="mt-1 text-sm text-gray-800">{formatPhone(selectedLead.phone)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Subject</p>
                <p className="mt-1 text-sm text-gray-800">{selectedLead.subject || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Status</p>
                <p className="mt-1">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ring-1 ${statusBadgeClass(selectedLead.status)}`}
                  >
                    {statusLabel(selectedLead.status)}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Message</p>
                <p className="mt-1 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed rounded-xl bg-gray-50 p-3 ring-1 ring-gray-100">
                  {selectedLead.message || '—'}
                </p>
              </div>
            </div>
            <div className="shrink-0 px-5 py-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
              {selectedLead.email ? (
                <a
                  href={`mailto:${selectedLead.email}`}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600 shadow-sm"
                >
                  Reply by email
                </a>
              ) : null}
              {selectedLead.phone ? (
                <a
                  href={`tel:${String(selectedLead.phone).replace(/\D/g, '')}`}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Call
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SuperAdminLeadsPanel;
