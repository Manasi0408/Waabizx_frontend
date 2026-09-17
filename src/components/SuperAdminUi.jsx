import React from 'react';

const ACCENT = {
  sky: {
    border: 'border-sky-100/90',
    badge: 'bg-sky-50 text-sky-800 ring-sky-200/70',
    dot: 'bg-sky-500',
    gradient: 'from-sky-400 via-blue-500 to-indigo-600',
    blobA: 'bg-sky-400/25',
    blobB: 'bg-blue-400/20',
    title: 'from-gray-900 via-sky-800 to-blue-900',
  },
  violet: {
    border: 'border-violet-100/90',
    badge: 'bg-violet-50 text-violet-800 ring-violet-200/70',
    dot: 'bg-violet-500',
    gradient: 'from-violet-400 via-sky-500 to-blue-600',
    blobA: 'bg-violet-400/25',
    blobB: 'bg-fuchsia-400/15',
    title: 'from-gray-900 via-violet-800 to-blue-900',
  },
  emerald: {
    border: 'border-emerald-100/90',
    badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200/70',
    dot: 'bg-emerald-500',
    gradient: 'from-emerald-400 via-sky-500 to-blue-600',
    blobA: 'bg-emerald-400/20',
    blobB: 'bg-teal-400/15',
    title: 'from-gray-900 via-emerald-800 to-teal-900',
  },
  amber: {
    border: 'border-amber-100/90',
    badge: 'bg-amber-50 text-amber-800 ring-amber-200/70',
    dot: 'bg-amber-500',
    gradient: 'from-amber-400 via-orange-500 to-rose-500',
    blobA: 'bg-amber-400/25',
    blobB: 'bg-orange-400/15',
    title: 'from-gray-900 via-amber-800 to-orange-900',
  },
  indigo: {
    border: 'border-indigo-100/90',
    badge: 'bg-indigo-50 text-indigo-800 ring-indigo-200/70',
    dot: 'bg-indigo-500',
    gradient: 'from-indigo-400 via-violet-500 to-blue-600',
    blobA: 'bg-indigo-400/20',
    blobB: 'bg-violet-400/15',
    title: 'from-gray-900 via-indigo-800 to-violet-900',
  },
};

export function SuperAdminPage({ children, className = '' }) {
  return <div className={`motion-enter space-y-6 md:space-y-8 ${className}`}>{children}</div>;
}

export function SuperAdminCardShine() {
  return (
    <div className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
      <div className="motion-card-shine__beam" />
    </div>
  );
}

export function SuperAdminHeroBlobs({ accent = 'sky' }) {
  const tone = ACCENT[accent] || ACCENT.sky;
  return (
    <>
      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl motion-page-blob ${tone.blobA}`}
        aria-hidden
      />
      <div
        className={`pointer-events-none absolute -bottom-14 left-6 h-40 w-40 rounded-full blur-3xl motion-page-blob motion-page-blob--b ${tone.blobB}`}
        aria-hidden
      />
    </>
  );
}

export function SuperAdminHero({
  accent = 'sky',
  badge,
  title,
  description,
  actions,
  children,
  className = '',
}) {
  const tone = ACCENT[accent] || ACCENT.sky;
  return (
    <section
      className={`group relative overflow-hidden rounded-3xl border bg-white/95 p-5 shadow-xl shadow-gray-200/40 ring-1 ring-gray-100/80 backdrop-blur-md md:p-7 motion-card-rich motion-hover-lift ${tone.border} ${className}`}
    >
      <SuperAdminCardShine />
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone.gradient}`}
        aria-hidden
      />
      <SuperAdminHeroBlobs accent={accent} />
      <div className="relative z-[2] flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          {badge ? (
            <p
              className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] ring-1 ${tone.badge}`}
            >
              <span className={`h-1.5 w-1.5 animate-pulse rounded-full ${tone.dot}`} aria-hidden />
              {badge}
            </p>
          ) : null}
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl lg:text-[2rem]">
            <span className={`bg-gradient-to-r ${tone.title} bg-clip-text text-transparent`}>{title}</span>
          </h2>
          {description ? (
            <p className="mt-3 text-sm leading-relaxed text-gray-600 md:text-base">{description}</p>
          ) : null}
          {children}
        </div>
        {actions ? <div className="relative z-[2] flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}

export function SuperAdminPanel({
  children,
  className = '',
  accent = 'sky',
  interactive = true,
  padding = 'p-0',
}) {
  const tone = ACCENT[accent] || ACCENT.sky;
  return (
    <section
      className={`group relative overflow-hidden rounded-2xl border bg-white/95 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 backdrop-blur-sm ${interactive ? 'motion-card-rich motion-hover-lift' : ''} ${tone.border} ${className}`}
    >
      <SuperAdminCardShine />
      <div className={`relative z-[2] ${padding}`}>{children}</div>
    </section>
  );
}

export function SuperAdminStatGrid({ children, className = '' }) {
  return (
    <div className={`motion-stagger-children grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3 ${className}`}>
      {children}
    </div>
  );
}

export function SuperAdminStatTile({ label, value, hint, tone = 'default', className = '' }) {
  const tones = {
    default: 'border-gray-100/90 bg-white/90 ring-gray-100/80',
    emerald: 'border-emerald-100/90 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 ring-emerald-100/60',
    violet: 'border-violet-100/90 bg-gradient-to-br from-violet-500/10 via-white to-blue-500/10 ring-violet-100/60',
    sky: 'border-sky-100/90 bg-gradient-to-br from-sky-50/80 via-white to-blue-50/40 ring-sky-100/60',
    amber: 'border-amber-100/90 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/40 ring-amber-100/60',
    rose: 'border-rose-100/90 bg-gradient-to-br from-rose-50/80 via-white to-pink-50/40 ring-rose-100/60',
  };
  return (
    <div
      className={`group motion-card-rich motion-hover-lift relative overflow-hidden rounded-2xl border p-4 shadow-lg shadow-gray-200/30 ring-1 md:p-5 ${tones[tone] || tones.default} ${className}`}
    >
      <SuperAdminCardShine />
      <p className="relative z-[2] text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">{label}</p>
      <p className="relative z-[2] mt-2 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{value}</p>
      {hint ? <p className="relative z-[2] mt-2 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

export function SuperAdminListCard({ children, className = '', onClick, as = 'article' }) {
  const Tag = as;
  const interactive = typeof onClick === 'function';
  return (
    <Tag
      {...(interactive ? { onClick, type: 'button' } : {})}
      className={`group motion-card-rich motion-hover-lift relative w-full overflow-hidden rounded-2xl border border-gray-100/90 bg-white p-4 text-left shadow-md shadow-gray-200/25 ring-1 ring-gray-100/70 transition md:p-4 ${interactive ? 'cursor-pointer' : ''} ${className}`}
    >
      <SuperAdminCardShine />
      <div className="relative z-[2]">{children}</div>
    </Tag>
  );
}

export function SuperAdminTableShell({ header, children, className = '' }) {
  return (
    <SuperAdminPanel accent="sky" padding="p-0" className={className}>
      {header}
      {children}
    </SuperAdminPanel>
  );
}

export function SuperAdminAlert({ type = 'error', children }) {
  const styles =
    type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 motion-pop'
      : 'border-red-200 bg-red-50 text-red-700 motion-pop';
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}
