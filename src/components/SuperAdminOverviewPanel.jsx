import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from '../api/axios';
import { SuperAdminAlert, SuperAdminCardShine, SuperAdminPage } from './SuperAdminUi';

const formatCount = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-IN');
};

const formatWccExtra = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0.00';
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function StatCard({ label, value, hint, tone, icon }) {
  const tones = {
    sky: 'from-sky-500/10 via-white to-white border-sky-100 ring-sky-100/80 text-sky-700',
    violet: 'from-violet-500/10 via-white to-white border-violet-100 ring-violet-100/80 text-violet-700',
    emerald: 'from-emerald-500/10 via-white to-white border-emerald-100 ring-emerald-100/80 text-emerald-700',
    amber: 'from-amber-500/10 via-white to-white border-amber-100 ring-amber-100/80 text-amber-700',
    rose: 'from-rose-500/10 via-white to-white border-rose-100 ring-rose-100/80 text-rose-700',
    indigo: 'from-indigo-500/10 via-white to-white border-indigo-100 ring-indigo-100/80 text-indigo-700',
    teal: 'from-teal-500/10 via-white to-white border-teal-100 ring-teal-100/80 text-teal-700',
  };
  const toneClass = tones[tone] || tones.sky;

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 text-left shadow-lg shadow-gray-200/30 ring-1 ${toneClass}`}
    >
      <SuperAdminCardShine />
      <div className="relative z-[2] flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{value}</p>
          {hint ? <p className="mt-2 text-xs text-gray-500">{hint}</p> : null}
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/90 shadow-sm ring-1 ring-black/5">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SuperAdminOverviewPanel({ userName = 'SuperAdmin' }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    totalAdmins: 0,
    activeProjectPlans: 0,
    totalLeads: 0,
    totalBookings: 0,
    totalBlogs: 0,
    planPurchases: 0,
    totalWccWalletExtra: 0,
  });

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [adminsRes, overviewRes, leadsRes, bookingsRes, blogsRes] = await Promise.all([
        axios.get('/admins'),
        axios.get('/business-overview'),
        axios.get('/website-leads'),
        axios.get('/demo-bookings'),
        axios.get('/blogs'),
      ]);

      const admins = Array.isArray(adminsRes?.data) ? adminsRes.data : [];
      const businesses = Array.isArray(overviewRes?.data?.businesses) ? overviewRes.data.businesses : [];
      const leads = Array.isArray(leadsRes?.data?.leads) ? leadsRes.data.leads : [];
      const bookings = Array.isArray(bookingsRes?.data?.bookings) ? bookingsRes.data.bookings : [];
      const blogs = Array.isArray(blogsRes?.data?.blogs) ? blogsRes.data.blogs : [];

      const activeProjectPlans = businesses.filter((row) => row.planActive && row.planSlug).length;
      const planPurchases = businesses.filter((row) => row.planSlug).length;
      const totalWccWalletExtra = businesses.reduce(
        (sum, row) => sum + (Number(row.wccExtraCredits) || 0),
        0
      );

      setStats({
        totalAdmins: admins.length,
        activeProjectPlans,
        totalLeads: leads.length,
        totalBookings: bookings.length,
        totalBlogs: blogs.length,
        planPurchases,
        totalWccWalletExtra,
      });
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const cards = useMemo(
    () => [
      {
        key: 'totalAdmins',
        label: 'Total admins',
        value: formatCount(stats.totalAdmins),
        hint: 'Registered admin accounts',
        tone: 'sky',
        icon: (
          <svg className="h-5 w-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      },
      {
        key: 'activeProjectPlans',
        label: 'Active project plans',
        value: formatCount(stats.activeProjectPlans),
        hint: 'Projects with live subscriptions',
        tone: 'emerald',
        icon: (
          <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
      {
        key: 'totalLeads',
        label: 'Total leads',
        value: formatCount(stats.totalLeads),
        hint: 'Website contact submissions',
        tone: 'violet',
        icon: (
          <svg className="h-5 w-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        key: 'totalBookings',
        label: 'Total bookings',
        value: formatCount(stats.totalBookings),
        hint: 'Demo booking requests',
        tone: 'amber',
        icon: (
          <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        key: 'totalBlogs',
        label: 'Total blogs',
        value: formatCount(stats.totalBlogs),
        hint: 'Published and draft posts',
        tone: 'indigo',
        icon: (
          <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
        ),
      },
      {
        key: 'planPurchases',
        label: 'Plan purchases',
        value: formatCount(stats.planPurchases),
        hint: 'All projects with a purchased plan',
        tone: 'rose',
        icon: (
          <svg className="h-5 w-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        ),
      },
      {
        key: 'totalWccWalletExtra',
        label: 'Total WCC wallet',
        value: formatWccExtra(stats.totalWccWalletExtra),
        hint: 'Combined platform extra wallet balance',
        tone: 'teal',
        icon: (
          <svg className="h-5 w-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        ),
      },
    ],
    [stats]
  );

  return (
    <SuperAdminPage>
      <section className="group relative overflow-hidden rounded-3xl border border-sky-400/30 bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-800 p-6 shadow-2xl shadow-sky-900/25 motion-card-rich md:p-8">
        <SuperAdminCardShine />
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl motion-page-blob" aria-hidden />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl motion-page-blob motion-page-blob--b" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300/80 via-white/40 to-sky-200/60" aria-hidden />
        <div className="relative z-[2] flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-100/90">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-200" aria-hidden />
              Super Admin
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white md:text-4xl">
              Welcome back, {userName}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-sky-100/90 md:text-base">
              Your command center for admins, plans, leads, bookings, blogs, and WCC wallet performance across the
              platform.
            </p>
          </div>
          <button
            type="button"
            onClick={loadStats}
            disabled={loading}
            className="motion-hover-lift inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 disabled:opacity-60"
          >
            {loading ? 'Refreshing…' : 'Refresh dashboard'}
          </button>
        </div>
      </section>

      {error ? <SuperAdminAlert>{error}</SuperAdminAlert> : null}

      {loading ? (
        <div className="motion-stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-2xl border border-gray-100 bg-white/80 shadow-lg ring-1 ring-gray-100/80"
            />
          ))}
        </div>
      ) : (
        <div className="motion-stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <StatCard
              key={card.key}
              label={card.label}
              value={card.value}
              hint={card.hint}
              tone={card.tone}
              icon={card.icon}
            />
          ))}
        </div>
      )}
    </SuperAdminPage>
  );
}

export default SuperAdminOverviewPanel;
