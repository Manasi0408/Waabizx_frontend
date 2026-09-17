import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from '../api/axios';
import SuperAdminPagination, { useSuperAdminPagination } from './SuperAdminPagination';
import {
  SuperAdminAlert,
  SuperAdminHero,
  SuperAdminPage,
  SuperAdminPanel,
  SuperAdminStatGrid,
  SuperAdminStatTile,
} from './SuperAdminUi';

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

function DetailField({ label, value }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900">{value || '—'}</p>
    </div>
  );
}

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

  const { page, setPage, totalPages, paginatedItems, totalItems, pageSize } = useSuperAdminPagination(
    filteredBookings,
    [search]
  );

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
    <SuperAdminPage>
      <SuperAdminHero
        accent="sky"
        badge="Book demo requests"
        title="Demo bookings"
        description={
          <>
            Submissions from the{' '}
            <strong className="font-semibold text-gray-800">Schedule a Free Demo</strong> popup on{' '}
            <strong className="font-semibold text-gray-800">techwhizzc.com/waabizx</strong>.
          </>
        }
        actions={
          <button
            type="button"
            onClick={loadBookings}
            disabled={loading}
            className="motion-hover-lift inline-flex items-center gap-2 self-start rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 disabled:opacity-60"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {error ? <SuperAdminAlert>{error}</SuperAdminAlert> : null}

      <SuperAdminStatGrid className="sm:grid-cols-3">
        <SuperAdminStatTile label="Total bookings" value={stats.total} />
        <SuperAdminStatTile label="New requests" value={stats.newCount} tone="emerald" />
        <SuperAdminStatTile label="Submitted today" value={stats.today} tone="sky" />
      </SuperAdminStatGrid>

      <SuperAdminPanel accent="sky" padding="p-0" interactive={false}>
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
                placeholder="Search name, email, phone…"
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
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Company size</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-gray-500">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedItems.map((booking) => (
                    <tr
                      key={booking.id}
                      className="cursor-pointer transition-all duration-200 hover:bg-sky-50/40 hover:shadow-[inset_3px_0_0_0_rgb(14,165,233)]"
                      onClick={() => setSelectedBooking(booking)}
                    >
                      <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                        {booking.full_name || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{booking.email || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatPhone(booking.phone)}</td>
                      <td className="px-4 py-3 text-gray-700">{booking.company_size || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {formatDate(booking.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden p-4 space-y-3 motion-stagger-children">
              {paginatedItems.map((booking) => {
                const initial = String(booking.full_name || '?').charAt(0).toUpperCase();
                return (
                  <article
                    key={booking.id}
                    className="group motion-card-rich motion-hover-lift rounded-2xl border border-gray-100/90 bg-white p-4 shadow-sm ring-1 ring-gray-100/80"
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
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
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
                        <span className="font-semibold text-gray-500">Work email:</span> {booking.email || '—'}
                      </div>
                      <div>
                        <span className="font-semibold text-gray-500">Phone:</span> {formatPhone(booking.phone)}
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

      {selectedBooking ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-sm">
          <div className="motion-pop flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xl ring-1 ring-black/5">
            <div className="shrink-0 px-5 py-4 border-b border-sky-100/90 bg-gradient-to-r from-sky-50 via-white to-blue-50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-base font-bold text-white">
                  {String(selectedBooking.full_name || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h4 className="truncate text-base font-bold text-gray-900">{selectedBooking.full_name || 'Demo booking'}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{formatDate(selectedBooking.createdAt)}</p>
                </div>
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
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailField label="Full name" value={selectedBooking.full_name} />
                <DetailField label="Work email" value={selectedBooking.email} />
                <DetailField label="Phone number" value={formatPhone(selectedBooking.phone)} />
                <DetailField label="Company size" value={selectedBooking.company_size} />
              </div>
            </div>
            <div className="shrink-0 px-5 py-4 border-t border-gray-100 flex justify-end bg-gray-50/60">
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </SuperAdminPage>
  );
}

export default SuperAdminDemoBookingsPanel;
