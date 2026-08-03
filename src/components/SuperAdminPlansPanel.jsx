import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPlan,
  deletePlan,
  fetchAdminPlans,
  updatePlan,
} from '../services/planService';
import PlanSubscriptionView from './PlanSubscriptionView';
import {
  PLAN_HIGHLIGHTS,
  PLAN_MONTHLY_DEFAULT,
  buildCycleOptions,
  computeQuarterlyFromMonthly,
  computeYearlyFromMonthly,
  discountedMonthlyRate,
  formatInr,
  withDerivedPricesFromMonthly,
} from '../utils/planPricing';

const withDerivedPrices = (monthly) => {
  const derived = withDerivedPricesFromMonthly(monthly);
  return {
    price_monthly: derived.price_monthly,
    price_quarterly: String(derived.price_quarterly),
    price_yearly: String(derived.price_yearly),
  };
};

const defaultFeaturesText = () => PLAN_HIGHLIGHTS.join('\n');

const emptyForm = () => ({
  id: null,
  slug: 'standard',
  name: 'Standard Project Plan',
  ...withDerivedPrices(PLAN_MONTHLY_DEFAULT),
  autoDerivePrices: true,
  users_limit: '0',
  messages_limit: '0',
  featuresText: defaultFeaturesText(),
  trial_days: '0',
  is_active: true,
  sort_order: '1',
});

const planToForm = (plan) => {
  const monthly = String(plan.price_monthly ?? PLAN_MONTHLY_DEFAULT);
  const derived = withDerivedPrices(monthly);
  const storedQuarterly = Number(plan.price_quarterly);
  const storedYearly = Number(plan.price_yearly);
  const computedQuarterly = computeQuarterlyFromMonthly(monthly);
  const computedYearly = computeYearlyFromMonthly(monthly);
  const autoDerivePrices =
    (!storedQuarterly || storedQuarterly === computedQuarterly) &&
    (!storedYearly || storedYearly === computedYearly);

  return {
    id: plan.id,
    slug: plan.slug || 'standard',
    name: plan.name || 'Standard Project Plan',
    price_monthly: monthly,
    price_quarterly: String(storedQuarterly || derived.price_quarterly),
    price_yearly: String(storedYearly || derived.price_yearly),
    autoDerivePrices,
    users_limit: String(plan.users_limit ?? 0),
    messages_limit: String(plan.messages_limit ?? 0),
    featuresText: Array.isArray(plan.features) && plan.features.length
      ? plan.features.join('\n')
      : defaultFeaturesText(),
    trial_days: String(plan.trial_days ?? 0),
    is_active: Boolean(plan.is_active),
    sort_order: String(plan.sort_order ?? 1),
  };
};

function SuperAdminPlansPanel() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [previewCycle, setPreviewCycle] = useState('monthly');

  const loadPlans = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const list = await fetchAdminPlans();
      const cleaned = (Array.isArray(list) ? list : []).filter((p) => {
        const slug = String(p?.slug || '').toLowerCase();
        const name = String(p?.name || '').toLowerCase();
        if (slug === 'pro' || slug === 'enterprise' || slug.includes('enterprise')) return false;
        if (name === 'pro' || name === 'enterprise') return false;
        if (/\bpro\b/.test(name) && !/project/.test(name)) return false;
        if (/\benterprise\b/.test(name)) return false;
        return true;
      });
      setPlans(cleaned);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load plans');
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const primaryPlan = useMemo(() => {
    const active = plans.filter((p) => p.is_active);
    const sorted = (active.length ? active : plans).slice().sort(
      (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    );
    return sorted[0] || null;
  }, [plans]);

  const monthlyPrice = Number(primaryPlan?.price_monthly) || PLAN_MONTHLY_DEFAULT;
  const cycleStats = useMemo(
    () => buildCycleOptions(monthlyPrice, primaryPlan),
    [monthlyPrice, primaryPlan]
  );

  const stats = useMemo(() => ({
    monthly: monthlyPrice,
    quarterly: cycleStats.find((c) => c.cycle === 'quarterly')?.billingAmount || 0,
    yearly: cycleStats.find((c) => c.cycle === 'yearly')?.billingAmount || 0,
    total: plans.length,
    published: plans.filter((p) => p.is_active).length,
  }), [monthlyPrice, cycleStats, plans]);

  const openAdd = () => {
    setForm(emptyForm());
    setShowForm(true);
    setSuccess('');
    setError('');
  };

  const openEdit = (plan) => {
    setForm(plan ? planToForm(plan) : emptyForm());
    setShowForm(true);
    setSuccess('');
    setError('');
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(emptyForm());
  };

  const updateMonthlyPrice = (value) => {
    setForm((f) => {
      const next = { ...f, price_monthly: value };
      if (f.autoDerivePrices) {
        const derived = withDerivedPrices(value);
        next.price_quarterly = derived.price_quarterly;
        next.price_yearly = derived.price_yearly;
      }
      return next;
    });
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    const monthly = Number(form.price_monthly) || 0;
    const quarterly = form.autoDerivePrices
      ? computeQuarterlyFromMonthly(monthly)
      : Number(form.price_quarterly) || 0;
    const yearly = form.autoDerivePrices
      ? computeYearlyFromMonthly(monthly)
      : Number(form.price_yearly) || 0;

    const payload = {
      slug: form.slug.trim() || 'standard',
      name: form.name.trim() || 'Standard Project Plan',
      price_monthly: monthly,
      price_quarterly: quarterly,
      price_yearly: yearly,
      users_limit: Number(form.users_limit) || 0,
      messages_limit: Number(form.messages_limit) || 0,
      features: form.featuresText,
      trial_days: Number(form.trial_days) || 0,
      is_active: form.is_active,
      sort_order: Number(form.sort_order) || 1,
    };

    try {
      if (form.id) {
        await updatePlan(form.id, payload);
        setSuccess('Plan updated successfully.');
      } else {
        await createPlan(payload);
        setSuccess('Plan created successfully.');
      }
      closeForm();
      await loadPlans();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (plan) => {
    if (!plan?.id) return;
    const confirmed = window.confirm(`Delete plan "${plan.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(plan.id);
    setError('');
    setSuccess('');
    try {
      await deletePlan(plan.id);
      setSuccess('Plan deleted.');
      await loadPlans();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete plan');
    } finally {
      setDeletingId(null);
    }
  };

  const onToggleActive = async (plan) => {
    if (!plan?.id) return;
    try {
      await updatePlan(plan.id, { is_active: !plan.is_active });
      await loadPlans();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update plan');
    }
  };

  return (
    <div className="motion-enter space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-sky-100/90 bg-white/95 p-5 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 backdrop-blur-sm">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-600"
          aria-hidden
        />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-sky-800 ring-1 ring-sky-200/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Subscription pricing
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
              <span className="bg-gradient-to-r from-gray-900 via-sky-800 to-blue-900 bg-clip-text text-transparent">
                Manage plans
              </span>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 md:text-base">
              Configure monthly, quarterly &amp; yearly pricing with unlimited features. The lowest sort order among published plans appears on Get Plan.
            </p>
          </div>
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-600/25 hover:from-emerald-500 hover:to-teal-500 transition motion-hover-lift"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add plan
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <div className="rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-500/10 via-white to-blue-500/10 p-4 shadow-lg shadow-sky-200/25 ring-1 ring-sky-100/60 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800/70">Monthly /mo</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-sky-800">₹ {formatInr(stats.monthly)}</p>
          <p className="mt-0.5 text-[10px] text-sky-600 font-semibold">/project</p>
        </div>
        <div className="rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 p-4 shadow-lg shadow-emerald-100/30 ring-1 ring-emerald-100/60 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/70">Quarterly bill</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">₹ {formatInr(stats.quarterly)}</p>
          <p className="mt-0.5 text-[10px] text-emerald-600 font-semibold">₹ {formatInr(discountedMonthlyRate(stats.monthly, 'quarterly'))}/mo (−10%)</p>
        </div>
        <div className="rounded-2xl border border-rose-100/90 bg-gradient-to-br from-rose-50/80 via-white to-orange-50/40 p-4 shadow-lg shadow-rose-100/30 ring-1 ring-rose-100/60 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800/70">Yearly bill</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rose-700">₹ {formatInr(stats.yearly)}</p>
          <p className="mt-0.5 text-[10px] text-rose-600 font-semibold">₹ {formatInr(discountedMonthlyRate(stats.monthly, 'yearly'))}/mo (−15%)</p>
        </div>
        <div className="rounded-2xl border border-gray-100/90 bg-white p-4 shadow-lg shadow-gray-200/25 ring-1 ring-gray-100/60 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Total plans</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-violet-100/90 bg-gradient-to-br from-violet-50/80 via-white to-blue-50/40 p-4 shadow-lg shadow-violet-100/30 ring-1 ring-violet-100/60 motion-hover-lift sm:col-span-2 lg:col-span-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-violet-800/70">Published</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-violet-700">{stats.published}</p>
        </div>
      </div>

      {error ? (
        <div className="p-4 bg-red-50 border border-red-200/90 rounded-2xl text-sm text-red-700 ring-1 ring-red-100/50">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="p-4 bg-emerald-50 border border-emerald-200/90 rounded-2xl text-sm text-emerald-800 ring-1 ring-emerald-100/50">
          {success}
        </div>
      ) : null}

      <section className="rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100/90 bg-gradient-to-r from-white via-sky-50/40 to-white">
          <h3 className="text-sm font-bold text-gray-900">All plans</h3>
          <p className="text-xs text-gray-500 mt-0.5">Monthly, quarterly &amp; yearly pricing with full feature control</p>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
            <p className="text-sm text-gray-500">Loading plans…</p>
          </div>
        ) : plans.length === 0 ? (
          <div className="py-16 text-center px-4">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 ring-1 ring-sky-100">
              <svg className="h-7 w-7 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">No plans yet</p>
            <button type="button" onClick={openAdd} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600">
              Add first plan
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 p-4 md:p-5">
            {plans.map((plan) => {
              const cycles = buildCycleOptions(plan.price_monthly, plan);
              return (
                <article
                  key={plan.id}
                  className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-md shadow-gray-200/30 ring-1 ring-gray-100/80 hover:shadow-lg hover:border-sky-100 transition-all motion-hover-lift"
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-500" />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-base font-bold text-gray-900">{plan.name}</h4>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            plan.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {plan.is_active ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{plan.slug} · Order {plan.sort_order}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {cycles.map((c) => (
                      <div key={c.cycle} className="rounded-xl bg-slate-50 px-2.5 py-2.5 text-left ring-1 ring-slate-100">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{c.label}</p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-800">
                          Rs. {formatInr(c.discountedMonthly)} <span className="text-[10px] font-semibold text-slate-500">/project /mo</span>
                        </p>
                        <p className="mt-1 text-[10px] leading-snug text-slate-500">{c.billingNote}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(plan.features?.length ? plan.features : PLAN_HIGHLIGHTS).slice(0, 4).map((f) => (
                      <span key={f} className="inline-flex rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-100">
                        {f}
                      </span>
                    ))}
                    {(plan.features?.length || PLAN_HIGHLIGHTS.length) > 4 ? (
                      <span className="inline-flex rounded-lg bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-500">
                        +{(plan.features?.length || PLAN_HIGHLIGHTS.length) - 4} more
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-gray-100">
                    <button type="button" onClick={() => openEdit(plan)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-100">
                      Edit
                    </button>
                    <button type="button" onClick={() => onToggleActive(plan)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-200">
                      {plan.is_active ? 'Unpublish' : 'Publish'}
                    </button>
                    <button type="button" onClick={() => onDelete(plan)} disabled={deletingId === plan.id} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-100 disabled:opacity-50">
                      {deletingId === plan.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100/90 bg-gradient-to-r from-white via-sky-50/40 to-white">
          <h3 className="text-sm font-bold text-gray-900">Live dashboard preview</h3>
          <p className="text-xs text-gray-500 mt-0.5">Switch monthly, quarterly &amp; yearly — same unlimited features on every cycle</p>
        </div>
        <div className="p-4 md:p-6 bg-gradient-to-b from-white to-sky-50/20">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
              <p className="text-sm text-gray-500">Loading plan…</p>
            </div>
          ) : !primaryPlan ? (
            <div className="py-16 text-center">
              <p className="text-sm font-semibold text-gray-700">No published plan configured</p>
              <button type="button" onClick={openAdd} className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600">
                Add plan
              </button>
            </div>
          ) : (
            <PlanSubscriptionView
              monthly={monthlyPrice}
              billingCycle={previewCycle}
              onBillingCycleChange={setPreviewCycle}
              planName={primaryPlan.name}
              features={primaryPlan.features?.length ? primaryPlan.features : null}
              plan={primaryPlan}
              showGst
            />
          )}
        </div>
      </section>

      {showForm ? (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-200/90 ring-1 ring-black/5 flex flex-col">
            <div className="shrink-0 px-5 py-4 border-b border-sky-100/90 bg-gradient-to-r from-sky-50 via-white to-blue-50 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-base font-bold text-gray-900">{form.id ? 'Edit plan' : 'Add plan'}</h4>
                <p className="text-xs text-gray-500 mt-0.5">Set monthly, quarterly &amp; yearly pricing and unlimited features</p>
              </div>
              <button type="button" onClick={closeForm} className="w-9 h-9 rounded-xl text-gray-500 hover:bg-white border border-transparent hover:border-gray-200 transition" aria-label="Close">
                ×
              </button>
            </div>
            <form onSubmit={onSave} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block sm:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Plan name</span>
                  <input type="text" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Slug</span>
                  <input type="text" required value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Sort order</span>
                  <input type="number" min={0} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none" />
                </label>
              </div>

              <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4 space-y-3 ring-1 ring-sky-100/80">
                <p className="text-xs font-bold uppercase tracking-wide text-sky-800">Billing prices</p>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Monthly (₹)</span>
                  <input type="number" min={0} required value={form.price_monthly} onChange={(e) => updateMonthlyPrice(e.target.value)} className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none" />
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.autoDerivePrices}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((f) => {
                        const next = { ...f, autoDerivePrices: checked };
                        if (checked) {
                          const derived = withDerivedPrices(f.price_monthly);
                          next.price_quarterly = derived.price_quarterly;
                          next.price_yearly = derived.price_yearly;
                        }
                        return next;
                      });
                    }}
                    className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-gray-700">Auto-calculate quarterly (−10%) &amp; yearly (−15%) from monthly</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Quarterly total (₹)</span>
                    <input
                      type="number"
                      min={0}
                      required
                      disabled={form.autoDerivePrices}
                      value={form.price_quarterly}
                      onChange={(e) => setForm((f) => ({ ...f, price_quarterly: e.target.value }))}
                      className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Yearly total (₹)</span>
                    <input
                      type="number"
                      min={0}
                      required
                      disabled={form.autoDerivePrices}
                      value={form.price_yearly}
                      onChange={(e) => setForm((f) => ({ ...f, price_yearly: e.target.value }))}
                      className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-500 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Users limit</span>
                  <input type="number" min={0} value={form.users_limit} onChange={(e) => setForm((f) => ({ ...f, users_limit: e.target.value }))} className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none" />
                  <p className="mt-1 text-[10px] text-gray-500">0 = unlimited</p>
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Messages limit</span>
                  <input type="number" min={0} value={form.messages_limit} onChange={(e) => setForm((f) => ({ ...f, messages_limit: e.target.value }))} className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none" />
                  <p className="mt-1 text-[10px] text-gray-500">0 = unlimited</p>
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Trial days</span>
                  <input type="number" min={0} value={form.trial_days} onChange={(e) => setForm((f) => ({ ...f, trial_days: e.target.value }))} className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none" />
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Plan features</span>
                <p className="text-[10px] text-gray-500 mt-0.5 mb-1">One per line — shown on monthly, quarterly &amp; yearly</p>
                <textarea rows={8} value={form.featuresText} onChange={(e) => setForm((f) => ({ ...f, featuresText: e.target.value }))} className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none resize-y" />
              </label>

              <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-gray-800">Publish on admin Get Plan</span>
              </label>

              <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white pb-1">
                <button type="button" onClick={closeForm} className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-md disabled:opacity-50">
                  {saving ? 'Saving…' : form.id ? 'Update plan' : 'Create plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default SuperAdminPlansPanel;
