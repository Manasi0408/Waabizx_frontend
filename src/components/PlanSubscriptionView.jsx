import React from 'react';
import {
  PLAN_DISCOUNT_LABEL,
  PLAN_HIGHLIGHTS,
  CONVERSATION_METRICS,
  buildCycleOptions,
  buildPricingBreakdown,
  formatInr,
  gstAmount,
  payableWithGst,
} from '../utils/planPricing';

const CheckIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
  </svg>
);

export function PlanBillingToggle({ monthly, billingCycle, onChange, plan = null }) {
  const options = buildCycleOptions(monthly, plan);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {options.map((opt) => {
        const active = billingCycle === opt.cycle;
        const isPopular = opt.cycle === 'yearly';
        return (
          <button
            key={opt.cycle}
            type="button"
            onClick={() => onChange(opt.cycle)}
            className={`group relative text-left rounded-2xl border-2 p-4 transition-all duration-200 ${
              active
                ? 'border-sky-500 bg-gradient-to-br from-sky-50 via-white to-blue-50 shadow-lg shadow-sky-200/40 ring-2 ring-sky-400/30 scale-[1.02]'
                : 'border-slate-200/90 bg-white hover:border-sky-200 hover:shadow-md hover:shadow-slate-200/50'
            }`}
          >
            {isPopular ? (
              <span className="absolute -top-2.5 right-3 inline-flex items-center rounded-full bg-gradient-to-r from-rose-500 to-orange-500 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white shadow-sm">
                Best value
              </span>
            ) : null}
            {opt.discountLabel ? (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                  opt.cycle === 'quarterly'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {opt.discountLabel}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                Flexible
              </span>
            )}
            <p className={`mt-2 text-sm font-bold capitalize ${active ? 'text-sky-900' : 'text-slate-800'}`}>
              {opt.label}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-emerald-700 leading-snug">
              Rs. {formatInr(opt.discountedMonthly)}
              <span className="text-sm font-semibold text-slate-500"> /project /mo</span>
            </p>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">{opt.billingNote}</p>
            <div
              className={`mt-3 flex items-center gap-1.5 text-[10px] font-semibold ${
                active ? 'text-sky-700' : 'text-slate-400 group-hover:text-slate-600'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                  active ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300'
                }`}
              >
                {active ? <CheckIcon /> : null}
              </span>
              {opt.label} billing
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function PlanGstSummary({ subtotal, title = 'Payment summary' }) {
  const base = Math.max(0, Number(subtotal) || 0);
  const gst = gstAmount(base);
  const total = payableWithGst(base);
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm ring-1 ring-slate-100/80">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">{title}</p>
      <div className="space-y-2.5 text-sm">
        <div className="flex items-center justify-between gap-3 text-slate-700">
          <span>Subtotal</span>
          <span className="font-semibold tabular-nums">₹ {formatInr(base)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 text-slate-500">
          <span>GST (18%)</span>
          <span className="font-semibold tabular-nums">₹ {formatInr(gst)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200/80 text-slate-900">
          <span className="font-semibold">Total payable (incl. GST)</span>
          <span className="text-xl font-bold text-emerald-700 tabular-nums">₹ {formatInr(total)}</span>
        </div>
      </div>
    </div>
  );
}

export function PlanGstBreakdown({ monthly, billingCycle, subtotal, plan = null }) {
  const breakdown = buildPricingBreakdown(monthly, billingCycle, plan);
  const base = subtotal != null ? Math.max(0, Number(subtotal) || 0) : breakdown.billingAmount;
  const total = payableWithGst(base);
  const cycleLabel =
    billingCycle === 'monthly' ? 'month' : billingCycle === 'quarterly' ? 'quarter' : 'year';

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-sky-50/30 p-5 shadow-sm ring-1 ring-slate-100/80">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Price breakdown</p>
        <span className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-800">
          {cycleLabel}ly billing
        </span>
      </div>
      <div className="space-y-2.5">
        {breakdown.lines.map((line) => (
          <div
            key={line.label}
            className={`flex items-center justify-between gap-3 text-sm ${
              line.muted ? 'text-slate-500' : line.highlight ? 'text-emerald-800 font-medium' : 'text-slate-700'
            }`}
          >
            <span>{line.label}</span>
            <span className="font-semibold tabular-nums">₹ {formatInr(line.value)}</span>
          </div>
        ))}
        {base !== breakdown.billingAmount ? (
          <div className="flex items-center justify-between gap-3 text-sm text-slate-700 pt-1">
            <span>Add-ons</span>
            <span className="font-semibold tabular-nums">₹ {formatInr(base - breakdown.billingAmount)}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 pt-3 mt-1 border-t border-slate-200/80 text-slate-900">
          <span className="font-semibold">Total payable (incl. GST)</span>
          <span className="text-xl font-bold text-emerald-700 tabular-nums">₹ {formatInr(total)}</span>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">{breakdown.summary}</p>
      <p className="mt-1 text-[11px] text-slate-400">Payment is charged inclusive of 18% GST.</p>
    </div>
  );
}

export default function PlanSubscriptionView({
  monthly,
  billingCycle,
  onBillingCycleChange,
  loading = false,
  showGst = true,
  extraSubtotal = 0,
  planName = 'Standard Project Plan',
  features = null,
  plan = null,
  children,
}) {
  const breakdown = buildPricingBreakdown(monthly, billingCycle, plan);
  const cycleOptions = buildCycleOptions(monthly, plan);
  const activeOption = cycleOptions.find((o) => o.cycle === billingCycle) || cycleOptions[0];
  const featureList = Array.isArray(features) && features.length
    ? features.map((f) => String(f || '').trim()).filter(Boolean)
    : PLAN_HIGHLIGHTS;

  const unlimitedFeatures = featureList.filter((f) => /unlimited|multi agent/i.test(f));
  const otherFeatures = featureList.filter((f) => !/unlimited|multi agent/i.test(f));

  return (
    <div className="space-y-6">
      {onBillingCycleChange ? (
        <div className="space-y-3">
          <div className="text-center sm:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Choose billing cycle</p>
            <p className="mt-1 text-sm text-slate-600">
              Choose Monthly, Quarterly or Yearly — same plan, different billing cycle
            </p>
          </div>
          <PlanBillingToggle
            monthly={monthly}
            billingCycle={billingCycle}
            onChange={onBillingCycleChange}
            plan={plan}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
          <p className="text-sm text-slate-500">Loading plan details…</p>
        </div>
      ) : (
        <article className="relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-slate-200/50 ring-1 ring-slate-100">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 via-sky-500 to-blue-600" />
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-100/40 blur-3xl pointer-events-none" />
          <div className="absolute -left-12 bottom-0 h-40 w-40 rounded-full bg-emerald-100/30 blur-3xl pointer-events-none" />

          <div className="relative p-6 md:p-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-100">
                    All-in-one plan
                  </span>
                  {activeOption?.discountLabel ? (
                    <span className="inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-rose-100">
                      {activeOption.discountLabel} on {billingCycle}
                    </span>
                  ) : null}
                </div>
                <h4 className="mt-3 text-xl md:text-2xl font-bold text-slate-900 tracking-tight">{planName}</h4>
                <p className="mt-2 text-sm text-slate-500 max-w-lg leading-relaxed">
                  Full platform access with unlimited agents, campaigns, templates, flows, contacts &amp; multi-agent live chat.
                </p>
              </div>

              <div className="shrink-0 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/50 px-5 py-4 text-right shadow-sm ring-1 ring-emerald-100/80">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700/80">
                  {activeOption?.label}
                </p>
                <p className="mt-1 text-2xl md:text-3xl font-bold text-emerald-700 tabular-nums">
                  Rs. {formatInr(activeOption?.discountedMonthly ?? breakdown.baseMonthly)}
                </p>
                <p className="text-xs font-medium text-slate-500">/project /mo</p>
                <p className="mt-2 text-[11px] text-slate-500 leading-snug max-w-[220px] ml-auto">
                  {activeOption?.billingNote || breakdown.summary}
                </p>
                <p className="mt-2 text-[10px] text-slate-400">+ GST</p>
              </div>
            </div>

            {billingCycle !== 'monthly' ? (
              <div className="mt-5 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/90 via-white to-blue-50/50 px-4 py-3.5 ring-1 ring-sky-100/80">
                <p className="text-xs font-semibold text-sky-900 leading-relaxed">{breakdown.summary}</p>
              </div>
            ) : null}

            {unlimitedFeatures.length > 0 ? (
              <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Included on {billingCycle} plan
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {unlimitedFeatures.map((feature) => (
                    <div
                      key={feature}
                      className="flex items-center gap-2.5 rounded-xl border border-emerald-100/80 bg-emerald-50/40 px-3 py-2.5 ring-1 ring-emerald-100/60"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                        <CheckIcon />
                      </span>
                      <span className="text-sm font-semibold text-emerald-900">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {otherFeatures.length > 0 ? (
              <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {otherFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                      <CheckIcon />
                    </span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-8 pt-6 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Pay-per-use conversation metrics
                </p>
                <p className="text-[10px] text-slate-400">Same rates on monthly, quarterly &amp; yearly</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {CONVERSATION_METRICS.map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white px-3 py-3 text-center shadow-sm ring-1 ring-slate-100/80"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{m.label}</p>
                    <p className="mt-1.5 text-sm font-bold text-slate-800">{m.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>
      )}

      {showGst && !loading ? (
        <PlanGstBreakdown
          monthly={monthly}
          billingCycle={billingCycle}
          subtotal={breakdown.billingAmount + (Number(extraSubtotal) || 0)}
          plan={plan}
        />
      ) : null}

      {children}
    </div>
  );
}
