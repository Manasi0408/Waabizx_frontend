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

function SuperAdminDemoBookingsPanel() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/demo-bookings');
      setBookings(Array.isArray(res?.data?.bookings) ? res.data.bookings : []);
    } catch (e) {
      setBookings([]);
      setError(e?.response?.data?.message || e?.message || 'Failed to load demo bookings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((booking) => {
      const haystack = [
        booking.full_name,
        booking.email,
        booking.phone,
        booking.company_size,
        booking.country,
        booking.industry,
        booking.heard_about,
        booking.interest,
        booking.status,
      ]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return haystack.includes(q);
    });
  }, [bookings, search]);

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = bookings.filter((booking) => {
      const d = new Date(booking.createdAt);
      return !Number.isNaN(d.getTime()) && d >= today;
    }).length;
    const newCount = bookings.filter(
      (booking) => String(booking.status || 'new').toLowerCase() === 'new'
    ).length;
    return { total: bookings.length, today: todayCount, newCount };
  }, [bookings]);

  return (
    <div className="motion-enter space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-sky-100/90 bg-white/95 p-5 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 backdrop-blur-sm">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-600"
          aria-hidden
        />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-800 ring-1 ring-sky-200/70">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden />
              Book demo requests
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
              <span className="bg-gradient-to-r from-gray-900 via-sky-800 to-blue-900 bg-clip-text text-transparent">
                Demo bookings
              </span>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 md:text-base">
              Submissions from the{' '}
              <strong className="font-semibold text-gray-800">Schedule a Free Demo</strong> popup on{' '}
              <strong className="font-semibold text-gray-800">techwhizzc.com/waabizx</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={loadBookings}
            disabled={loading}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60 transition"
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
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total bookings</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 p-4 shadow-lg shadow-emerald-100/30 ring-1 ring-emerald-100/60 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/70">New requests</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-700">{stats.newCount}</p>
        </div>
        <div className="rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-500/10 via-white to-blue-500/10 p-4 shadow-lg shadow-sky-200/25 ring-1 ring-sky-100/60 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800/70">Submitted today</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-sky-800">{stats.today}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100/90 bg-gradient-to-r from-white via-sky-50/40 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">All demo bookings</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {filteredBookings.length} booking{filteredBookings.length === 1 ? '' : 's'}
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
                placeholder="Search name, email, country, industry…"
                className="w-full rounded-xl border-2 border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-sky-200 border-t-sky-600" />
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 ring-1 ring-sky-100">
              <svg className="h-7 w-7 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">
              {search.trim()
                ? 'No demo bookings match your filters'
                : 'No demo bookings yet'}
            </p>
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              {search.trim()
                ? 'Try a different search.'
                : 'When someone confirms a demo slot from the Book Demo popup, their details will appear here.'}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-left">
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Name</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Work email</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Phone</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Country</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Industry</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Heard about</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Interest</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Company size</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Status</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredBookings.map((booking) => (
                    <tr
                      key={booking.id}
                      className="hover:bg-sky-50/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedBooking(booking)}
                    >
                      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                        {booking.full_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {booking.email ? (
                          <a
                            href={`mailto:${booking.email}`}
                            className="text-sky-700 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {booking.email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatPhone(booking.phone)}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{booking.country || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[10rem]" title={booking.industry || ''}>
                        {truncate(booking.industry, 40)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[10rem]" title={booking.heard_about || ''}>
                        {truncate(booking.heard_about, 40)}
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-[10rem]" title={booking.interest || ''}>
                        {truncate(booking.interest, 40)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{booking.company_size || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ring-1 ${statusBadgeClass(booking.status)}`}
                        >
                          {statusLabel(booking.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {formatDate(booking.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden p-4 space-y-3 motion-stagger-children">
              {filteredBookings.map((booking) => {
                const initial = String(booking.full_name || '?').charAt(0).toUpperCase();
                return (
                  <article
                    key={booking.id}
                    className="rounded-2xl border border-gray-100/90 bg-white p-4 shadow-sm ring-1 ring-gray-100/80"
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 text-white flex items-center justify-center shadow-sm">
                        <span className="text-sm font-bold">{initial}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-gray-900">{booking.full_name || 'Unnamed'}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{formatDate(booking.createdAt)}</div>
                          </div>
                          <span
                            className={`shrink-0 inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ring-1 ${statusBadgeClass(booking.status)}`}
                          >
                            {statusLabel(booking.status)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {booking.country ? (
                            <span className="inline-flex text-[10px] font-bold uppercase tracking-wide text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded-full ring-1 ring-indigo-100">
                              {booking.country}
                            </span>
                          ) : null}
                          {booking.company_size ? (
                            <span className="inline-flex text-[10px] font-bold uppercase tracking-wide text-sky-800 bg-sky-50 px-2 py-0.5 rounded-full ring-1 ring-sky-100">
                              {booking.company_size}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs text-gray-600">
                      <div>
                        <span className="font-semibold text-gray-500">Work email:</span>{' '}
                        {booking.email ? (
                          <a href={`mailto:${booking.email}`} className="text-sky-700">
                            {booking.email}
                          </a>
                        ) : (
                          '—'
                        )}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-500">Phone:</span> {formatPhone(booking.phone)}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-500">Industry:</span> {booking.industry || '—'}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-500">Interest:</span> {booking.interest || '—'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedBooking(booking)}
                      className="mt-3 w-full px-3 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600"
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

      {selectedBooking ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-200/90 ring-1 ring-black/5 flex flex-col">
            <div className="shrink-0 px-5 py-4 border-b border-sky-100/90 bg-gradient-to-r from-sky-50 via-white to-blue-50 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-gray-900">Demo booking details</h4>
                <p className="text-xs text-gray-500 mt-0.5">{formatDate(selectedBooking.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="w-9 h-9 rounded-xl text-gray-500 hover:bg-white border border-transparent hover:border-gray-200 transition text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Full name</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{selectedBooking.full_name || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Work email</p>
                <p className="mt-1 text-sm text-gray-800">
                  {selectedBooking.email ? (
                    <a href={`mailto:${selectedBooking.email}`} className="text-sky-700 hover:underline">
                      {selectedBooking.email}
                    </a>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Phone number</p>
                <p className="mt-1 text-sm text-gray-800">{formatPhone(selectedBooking.phone)}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Country</p>
                <p className="mt-1 text-sm text-gray-800">{selectedBooking.country || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Industry</p>
                <p className="mt-1 text-sm text-gray-800">{selectedBooking.industry || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">How did you hear about us</p>
                <p className="mt-1 text-sm text-gray-800">{selectedBooking.heard_about || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">What would you like to Waabizx</p>
                <p className="mt-1 text-sm text-gray-800">{selectedBooking.interest || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Company size</p>
                <p className="mt-1 text-sm text-gray-800">{selectedBooking.company_size || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Status</p>
                <p className="mt-1">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ring-1 ${statusBadgeClass(selectedBooking.status)}`}
                  >
                    {statusLabel(selectedBooking.status)}
                  </span>
                </p>
              </div>
            </div>
            <div className="shrink-0 px-5 py-4 border-t border-gray-100 flex flex-wrap gap-2 justify-end">
              {selectedBooking.email ? (
                <a
                  href={`mailto:${selectedBooking.email}`}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600 shadow-sm"
                >
                  Reply by email
                </a>
              ) : null}
              {selectedBooking.phone ? (
                <a
                  href={`tel:${String(selectedBooking.phone).replace(/\D/g, '')}`}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Call
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
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

export default SuperAdminDemoBookingsPanel;
