import React from "react";

const widgets = [
  {
    title: "Waabizx Training Call",
    body: "Schedule your platform onboarding call.",
    tag: "Onboarding",
    border: "border-sky-200/80",
    ring: "ring-sky-200/60",
    shadow: "shadow-sky-100/60",
    labelClass: "text-sky-700",
    iconWrap: "bg-sky-100 text-sky-700 ring-sky-200/80",
    accent: "from-sky-500 to-blue-600",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: "Refer & Earn",
    body: "Invite your friends and earn ₹2000.",
    tag: "Rewards",
    border: "border-emerald-200/80",
    ring: "ring-emerald-200/60",
    shadow: "shadow-emerald-100/60",
    labelClass: "text-emerald-700",
    iconWrap: "bg-emerald-100 text-emerald-700 ring-emerald-200/80",
    accent: "from-teal-500 to-emerald-600",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Feedback Program",
    body: "Share feedback & earn WhatsApp credits.",
    tag: "Credits",
    border: "border-violet-200/80",
    ring: "ring-violet-200/60",
    shadow: "shadow-violet-100/50",
    labelClass: "text-violet-700",
    iconWrap: "bg-violet-100 text-violet-700 ring-violet-200/80",
    accent: "from-violet-500 to-purple-600",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
  },
  {
    title: "Affiliate Program",
    body: "Earn recurring commission.",
    tag: "Partner",
    border: "border-rose-200/80",
    ring: "ring-rose-200/60",
    shadow: "shadow-rose-100/50",
    labelClass: "text-rose-700",
    iconWrap: "bg-rose-100 text-rose-700 ring-rose-200/80",
    accent: "from-rose-500 to-pink-600",
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
];

const tips = [
  {
    title: "Live Chat",
    body: "Handle customer conversations from the inbox in real time.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    title: "Canned Messages",
    body: "Use saved replies from Manage to respond faster and stay consistent.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: "Daily limits",
    body: "Monitor tier caps and WCC balance so outbound sends are never interrupted.",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

function AgentWidgets() {
  return (
    <div className="space-y-8 md:space-y-10">
      <section className="motion-enter motion-delay-3 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600/90">Grow with Waabizx</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-900 md:text-2xl">
              Programs & rewards
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm text-gray-600">
              Explore partner programs, onboarding support, and credit opportunities for your team.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-gray-200/90 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 shadow-sm">
            4 programs
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 motion-stagger-children">
          {widgets.map((w) => (
            <div
              key={w.title}
              className={`group relative motion-card-rich motion-hover-lift flex min-h-[148px] flex-col overflow-hidden rounded-2xl border ${w.border} bg-white/95 backdrop-blur-sm p-5 ring-1 ${w.ring} shadow-md ${w.shadow} transition-all duration-300 hover:border-sky-200/70 hover:shadow-lg hover:shadow-sky-500/10 md:min-h-[156px] md:p-6`}
            >
              <span
                className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${w.accent}`}
                aria-hidden
              />
              <span className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
                <span className="motion-card-shine__beam absolute inset-0" />
              </span>
              <div className="relative flex flex-1 items-start gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1 ${w.iconWrap}`}
                  aria-hidden
                >
                  {w.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${w.labelClass}`}>
                      {w.tag}
                    </p>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                      Available
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-lg font-bold tracking-tight text-gray-900 md:text-xl">{w.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{w.body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="motion-enter motion-delay-4 space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600/90">Workspace guide</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-900 md:text-2xl">
            Agent best practices
          </h2>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 motion-enter motion-delay-2">
          <div className="border-b border-gray-100/90 bg-gradient-to-r from-sky-50/80 via-white to-blue-50/70 px-5 py-4 md:px-6">
            <p className="text-sm text-gray-600">
              Quick reminders to help you work efficiently inside the agent workspace.
            </p>
          </div>
          <div className="grid grid-cols-1 divide-y divide-gray-100/90 md:grid-cols-3 md:divide-x md:divide-y-0">
            {tips.map((tip) => (
              <div key={tip.title} className="flex gap-4 px-5 py-5 transition-colors hover:bg-gray-50/80 md:px-6 md:py-6">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200/80">
                  {tip.icon}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-gray-900">{tip.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{tip.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default AgentWidgets;
