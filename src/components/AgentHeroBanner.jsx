import React from "react";

const STEPS = [
  { label: "Get Your API Live", done: true },
  { label: "Get FBM Verified", done: true },
  { label: "Recharge WCC", done: true },
  { label: "Spend 500 WCC", done: true },
];

function AgentHeroBanner() {
  return (
    <div className="motion-enter motion-delay-2 group overflow-hidden rounded-3xl border border-emerald-200/40 shadow-xl shadow-emerald-900/15 ring-1 ring-emerald-100/50">
      <section className="agent-hero relative min-h-[240px] overflow-hidden sm:min-h-[280px] md:min-h-[300px]">
        <img
          src="/agent_dashboard_hero.png"
          alt="WhatsApp Business growth journey — complete milestones and earn rewards"
          className="absolute inset-0 h-full w-full object-cover object-center scale-105 transition-transform duration-[8000ms] ease-out group-hover:scale-110"
        />

        <div
          className="absolute inset-0 bg-gradient-to-br from-green-950/95 via-emerald-800/88 to-lime-900/55"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-emerald-600/25 via-transparent to-lime-400/20"
          aria-hidden
        />
        <div
          className="absolute -left-20 top-0 h-56 w-56 rounded-full bg-lime-400/25 blur-3xl agent-hero-glow-a"
          aria-hidden
        />
        <div
          className="absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-emerald-400/30 blur-3xl agent-hero-glow-b"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_20%,rgba(190,242,100,0.28),transparent_50%)]"
          aria-hidden
        />
        <div className="motion-hero-shimmer pointer-events-none absolute inset-0 opacity-30" aria-hidden>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-lime-200/10 to-transparent" />
        </div>

        <div className="relative z-10 flex flex-col gap-6 p-6 sm:p-8 md:p-10 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <div className="motion-enter motion-delay-3 max-w-xl space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-lime-300/50 bg-lime-400/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-lime-100 backdrop-blur-sm shadow-[0_0_20px_rgba(190,242,100,0.15)]">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-300 shadow-[0_0_10px_rgba(190,242,100,0.9)] animate-pulse" aria-hidden />
              Milestone rewards
            </span>
            <h2 className="agent-hero-title-gradient bg-gradient-to-r from-lime-200 via-emerald-200 to-teal-100 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent sm:text-4xl md:text-[2.35rem] md:leading-tight">
              Congratulations on going live
            </h2>
            <p className="text-sm leading-relaxed text-emerald-50/95 sm:text-base">
              Complete every step on your WhatsApp Business journey and unlock bonus conversation credits for your team.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <div className="h-2 flex-1 max-w-[12rem] overflow-hidden rounded-full bg-emerald-950/50 ring-1 ring-lime-400/30">
                <div className="h-full w-full rounded-full bg-gradient-to-r from-lime-400 via-emerald-400 to-teal-400 shadow-[0_0_12px_rgba(74,222,128,0.5)]" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-lime-200">Complete</span>
            </div>
          </div>

          <div className="motion-enter motion-delay-4 w-full lg:max-w-xl">
            <div className="rounded-2xl border border-lime-300/25 bg-gradient-to-br from-emerald-900/40 via-emerald-950/30 to-green-950/50 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-md sm:p-5 ring-1 ring-lime-400/20">
              <div className="mb-4 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-lime-100/90">
                  Your progress
                </p>
                <span className="rounded-full bg-lime-400/25 px-2.5 py-0.5 text-xs font-bold text-lime-100 ring-1 ring-lime-300/30">
                  4 / 4
                </span>
              </div>
              <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {STEPS.map((step, index) => (
                  <li
                    key={step.label}
                    className="agent-hero-step flex items-start gap-3 rounded-xl border border-lime-300/15 bg-emerald-950/35 px-3 py-2.5 transition-all duration-300 hover:border-lime-300/35 hover:bg-emerald-900/40 hover:shadow-[0_8px_24px_rgba(16,185,129,0.12)]"
                    style={{ animationDelay: `${0.2 + index * 0.08}s` }}
                  >
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lime-300 via-emerald-400 to-teal-500 text-xs font-bold text-emerald-950 shadow-lg shadow-emerald-900/50 ring-2 ring-lime-200/40"
                      aria-hidden
                    >
                      {step.done ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-lime-200/75">
                        Step {index + 1}
                      </p>
                      <p className="text-sm font-semibold leading-snug text-white">{step.label}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default AgentHeroBanner;
