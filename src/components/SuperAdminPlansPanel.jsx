import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPlan,
  deletePlan,
  fetchAdminConversationMetrics,
  fetchAdminPlans,
  fetchAdminPlanDiscounts,
  updateAdminPlanDiscounts,
  updateConversationMetrics,
  updatePlan,
} from '../services/planService';
import PlanSubscriptionView from './PlanSubscriptionView';
import SuperAdminPagination, { useSuperAdminPagination } from './SuperAdminPagination';
import {
  CONVERSATION_METRICS,
  PLAN_HIGHLIGHTS,
  PLAN_MONTHLY_DEFAULT,
  buildConversationMetrics,
  buildCycleOptions,
  computeQuarterlyFromMonthly,
  computeYearlyFromMonthly,
  discountedMonthlyRate,
  formatConversationRateText,
  formatInr,
  formatUsd,
  formatPlanAmount,
  resolveDiscountConfig,
  withDerivedPricesFromMonthly,
} from '../utils/planPricing';

const PLAN_MONTHLY_USD_DEFAULT = 10;

const withDerivedPrices = (monthly, discounts = null) => {
  const derived = withDerivedPricesFromMonthly(monthly, discounts);
  return {
    price_monthly: derived.price_monthly,
    price_quarterly: String(derived.price_quarterly),
    price_yearly: String(derived.price_yearly),
  };
};

const withDerivedUsdPrices = (monthly, discounts = null) => {
  const derived = withDerivedPricesFromMonthly(monthly, discounts);
  return {
    price_monthly_usd: derived.price_monthly,
    price_quarterly_usd: String(derived.price_quarterly),
    price_yearly_usd: String(derived.price_yearly),
  };
};

const defaultFeaturesText = () => PLAN_HIGHLIGHTS.join('\n');

const slugifyPlanName = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const emptyForm = () => ({
  id: null,
  slug: 'standard',
  name: 'Standard Project Plan',
  ...withDerivedPrices(PLAN_MONTHLY_DEFAULT),
  ...withDerivedUsdPrices(PLAN_MONTHLY_USD_DEFAULT),
  autoDerivePrices: true,
  autoDeriveUsdPrices: true,
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

  const monthlyUsd = String(plan.price_monthly_usd ?? PLAN_MONTHLY_USD_DEFAULT);
  const derivedUsd = withDerivedUsdPrices(monthlyUsd);
  const storedQuarterlyUsd = Number(plan.price_quarterly_usd);
  const storedYearlyUsd = Number(plan.price_yearly_usd);
  const computedQuarterlyUsd = computeQuarterlyFromMonthly(monthlyUsd);
  const computedYearlyUsd = computeYearlyFromMonthly(monthlyUsd);
  const autoDeriveUsdPrices =
    (!storedQuarterlyUsd || storedQuarterlyUsd === computedQuarterlyUsd) &&
    (!storedYearlyUsd || storedYearlyUsd === computedYearlyUsd);

  return {
    id: plan.id,
    slug: plan.slug || 'standard',
    name: plan.name || 'Standard Project Plan',
    price_monthly: monthly,
    price_quarterly: String(storedQuarterly || derived.price_quarterly),
    price_yearly: String(storedYearly || derived.price_yearly),
    price_monthly_usd: monthlyUsd,
    price_quarterly_usd: String(storedQuarterlyUsd || derivedUsd.price_quarterly_usd),
    price_yearly_usd: String(storedYearlyUsd || derivedUsd.price_yearly_usd),
    autoDerivePrices,
    autoDeriveUsdPrices,
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

const emptyMetricsForm = () =>
  CONVERSATION_METRICS.reduce((acc, metric) => {
    acc[metric.key] = {
      label: metric.label,
      rate: String(metric.rate ?? ''),
      rate_usd: String(metric.rate_usd ?? ''),
      text: metric.key === 'service' ? metric.text : '',
    };
    return acc;
  }, {});

const metricsToForm = (metrics = []) => {
  const form = emptyMetricsForm();
  metrics.forEach((metric) => {
    if (!metric?.key || !form[metric.key]) return;
    form[metric.key] = {
      label: metric.label || form[metric.key].label,
      rate: String(metric.rate ?? form[metric.key].rate),
      rate_usd: String(metric.rate_usd ?? form[metric.key].rate_usd ?? ''),
      text: metric.key === 'service' ? (metric.text || form[metric.key].text) : '',
    };
  });
  return form;
};

const formToMetricsPreview = (form) =>
  CONVERSATION_METRICS.map((metric) => {
    const item = form[metric.key] || {};
    const rate = Math.max(0, Number(item.rate) || 0);
    const rateUsd = Math.max(0, Number(item.rate_usd) || 0);
    const text =
      metric.key === 'service'
        ? String(item.text || metric.text).trim() || metric.text
        : `${formatConversationRateText(rate, 'INR')} · ${formatConversationRateText(rateUsd, 'USD')}`;
    return {
      key: metric.key,
      label: item.label || metric.label,
      rate,
      rate_usd: rateUsd,
      text,
    };
  });

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
  const [metricsForm, setMetricsForm] = useState(emptyMetricsForm());
  const [metricsPreview, setMetricsPreview] = useState(CONVERSATION_METRICS);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsSaving, setMetricsSaving] = useState(false);
  const [metricsEditing, setMetricsEditing] = useState(false);
  const [metricsError, setMetricsError] = useState('');
  const [metricsSuccess, setMetricsSuccess] = useState('');
  const [planDiscounts, setPlanDiscounts] = useState({ quarterlyPercent: 10, yearlyPercent: 15 });
  const [discountSaving, setDiscountSaving] = useState(false);
  const [discountSuccess, setDiscountSuccess] = useState('');

  const loadConversationMetrics = useCallback(async () => {
    setMetricsError('');
    setMetricsLoading(true);
    try {
      const data = await fetchAdminConversationMetrics();
      const metrics = buildConversationMetrics(data.metrics, data.rates).map((metric) => {
        const cfg = data.config?.[metric.key];
        const rateUsd = Math.max(0, Number(cfg?.rate_usd) || 0);
        if (metric.key === 'service') return metric;
        return {
          ...metric,
          rate_usd: rateUsd,
          text: `${formatConversationRateText(metric.rate, 'INR')} · ${formatConversationRateText(rateUsd, 'USD')}`,
        };
      });
      setMetricsPreview(metrics);
      setMetricsForm(metricsToForm(metrics));
    } catch (e) {
      setMetricsError(e?.response?.data?.message || e?.message || 'Failed to load conversation metrics');
      setMetricsPreview(CONVERSATION_METRICS);
      setMetricsForm(emptyMetricsForm());
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const data = await fetchAdminPlans();
      const list = Array.isArray(data?.plans) ? data.plans : [];
      if (data?.discounts) setPlanDiscounts(data.discounts);
      const cleaned = list.filter((p) => {
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
    loadConversationMetrics();
  }, [loadPlans, loadConversationMetrics]);

  const primaryPlan = useMemo(() => {
    const active = plans.filter((p) => p.is_active);
    const sorted = (active.length ? active : plans).slice().sort(
      (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    );
    return sorted[0] || null;
  }, [plans]);

  const monthlyPrice = Number(primaryPlan?.price_monthly) || PLAN_MONTHLY_DEFAULT;
  const monthlyPriceUsd = Number(primaryPlan?.price_monthly_usd) || PLAN_MONTHLY_USD_DEFAULT;
  const cycleStats = useMemo(
    () => buildCycleOptions(monthlyPrice, primaryPlan, 'INR', planDiscounts),
    [monthlyPrice, primaryPlan, planDiscounts]
  );
  const cycleStatsUsd = useMemo(
    () => buildCycleOptions(monthlyPriceUsd, { ...primaryPlan, price_monthly: monthlyPriceUsd }, 'USD', planDiscounts),
    [monthlyPriceUsd, primaryPlan, planDiscounts]
  );

  const stats = useMemo(() => ({
    monthly: monthlyPrice,
    monthlyUsd: monthlyPriceUsd,
    quarterly: cycleStats.find((c) => c.cycle === 'quarterly')?.billingAmount || 0,
    yearly: cycleStats.find((c) => c.cycle === 'yearly')?.billingAmount || 0,
    quarterlyUsd: cycleStatsUsd.find((c) => c.cycle === 'quarterly')?.billingAmount || 0,
    yearlyUsd: cycleStatsUsd.find((c) => c.cycle === 'yearly')?.billingAmount || 0,
    total: plans.length,
    published: plans.filter((p) => p.is_active).length,
  }), [monthlyPrice, monthlyPriceUsd, cycleStats, cycleStatsUsd, plans]);

  const { page, setPage, totalPages, paginatedItems, totalItems, pageSize } = useSuperAdminPagination(plans);

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
        const derived = withDerivedPrices(value, planDiscounts);
        next.price_quarterly = derived.price_quarterly;
        next.price_yearly = derived.price_yearly;
      }
      return next;
    });
  };

  const updateMonthlyPriceUsd = (value) => {
    setForm((f) => {
      const next = { ...f, price_monthly_usd: value };
      if (f.autoDeriveUsdPrices) {
        const derived = withDerivedUsdPrices(value, planDiscounts);
        next.price_quarterly_usd = derived.price_quarterly_usd;
        next.price_yearly_usd = derived.price_yearly_usd;
      }
      return next;
    });
  };

  const savePlanDiscounts = async () => {
    setDiscountSaving(true);
    setDiscountSuccess('');
    setError('');
    try {
      const saved = await updateAdminPlanDiscounts(planDiscounts);
      setPlanDiscounts(saved);
      setDiscountSuccess('Billing cycle offers updated.');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save billing offers');
    } finally {
      setDiscountSaving(false);
    }
  };

  const discountCfg = useMemo(() => resolveDiscountConfig(planDiscounts), [planDiscounts]);

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    const monthly = Number(form.price_monthly) || 0;
    const quarterly = form.autoDerivePrices
      ? computeQuarterlyFromMonthly(monthly, planDiscounts)
      : Number(form.price_quarterly) || 0;
    const yearly = form.autoDerivePrices
      ? computeYearlyFromMonthly(monthly, planDiscounts)
      : Number(form.price_yearly) || 0;
    const monthlyUsd = Number(form.price_monthly_usd) || 0;
    const quarterlyUsd = form.autoDeriveUsdPrices
      ? computeQuarterlyFromMonthly(monthlyUsd, planDiscounts)
      : Number(form.price_quarterly_usd) || 0;
    const yearlyUsd = form.autoDeriveUsdPrices
      ? computeYearlyFromMonthly(monthlyUsd, planDiscounts)
      : Number(form.price_yearly_usd) || 0;

    const payload = {
      slug: form.id
        ? form.slug.trim() || 'standard'
        : slugifyPlanName(form.name) || 'standard',
      name: form.name.trim() || 'Standard Project Plan',
      price_monthly: monthly,
      price_quarterly: quarterly,
      price_yearly: yearly,
      price_monthly_usd: monthlyUsd,
      price_quarterly_usd: quarterlyUsd,
      price_yearly_usd: yearlyUsd,
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

  const updateMetricField = (key, field, value) => {
    setMetricsForm((current) => ({
      ...current,
      [key]: {
        ...(current[key] || {}),
        [field]: value,
      },
    }));
  };

  const startMetricsEdit = () => {
    setMetricsForm(metricsToForm(metricsPreview));
    setMetricsEditing(true);
    setMetricsSuccess('');
    setMetricsError('');
  };

  const cancelMetricsEdit = () => {
    setMetricsForm(metricsToForm(metricsPreview));
    setMetricsEditing(false);
    setMetricsError('');
  };

  const onSaveMetrics = async (e) => {
    e.preventDefault();
    setMetricsSaving(true);
    setMetricsError('');
    setMetricsSuccess('');
    try {
      const payload = {};
      CONVERSATION_METRICS.forEach((metric) => {
        const item = metricsForm[metric.key] || {};
        payload[metric.key] = {
          label: item.label || metric.label,
          rate: Math.max(0, Number(item.rate) || 0),
          rate_usd: Math.max(0, Number(item.rate_usd) || 0),
          ...(metric.key === 'service'
            ? { text: String(item.text || metric.text).trim() || metric.text }
            : {}),
        };
      });
      const data = await updateConversationMetrics(payload);
      const metrics = buildConversationMetrics(data.metrics, data.rates);
      setMetricsPreview(metrics);
      setMetricsForm(metricsToForm(metrics));
      setMetricsEditing(false);
      setMetricsSuccess('Conversation metrics updated successfully.');
    } catch (err) {
      setMetricsError(err?.response?.data?.message || err?.message || 'Failed to save conversation metrics');
    } finally {
      setMetricsSaving(false);
    }
  };

  const previewMetrics = metricsEditing ? formToMetricsPreview(metricsForm) : metricsPreview;

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

      <section className="rounded-2xl border border-amber-100/90 bg-white/95 p-5 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Billing cycle offers</h3>
            <p className="mt-1 text-xs text-gray-500">
              Dynamic quarterly &amp; yearly discounts shown on admin Get Plan and purchase screens.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 max-w-md">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Quarterly off (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={planDiscounts.quarterlyPercent ?? 10}
                onChange={(e) =>
                  setPlanDiscounts((prev) => ({
                    ...prev,
                    quarterlyPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
                className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Yearly off (%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={planDiscounts.yearlyPercent ?? 15}
                onChange={(e) =>
                  setPlanDiscounts((prev) => ({
                    ...prev,
                    yearlyPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                  }))
                }
                className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={savePlanDiscounts}
            disabled={discountSaving}
            className="shrink-0 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
          >
            {discountSaving ? 'Saving…' : 'Save offers'}
          </button>
        </div>
        {discountSuccess ? (
          <p className="mt-3 text-sm text-emerald-700">{discountSuccess}</p>
        ) : null}
        <p className="mt-3 text-xs text-gray-500">
          Current preview: Quarterly −{discountCfg.quarterlyPercent}%, Yearly −{discountCfg.yearlyPercent}%
        </p>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <div className="rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-500/10 via-white to-blue-500/10 p-4 shadow-lg shadow-sky-200/25 ring-1 ring-sky-100/60 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800/70">Monthly /mo</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-sky-800">₹ {formatInr(stats.monthly)}</p>
          <p className="mt-0.5 text-[10px] text-sky-600 font-semibold">/project · ${formatUsd(stats.monthlyUsd)} USD</p>
        </div>
        <div className="rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 p-4 shadow-lg shadow-emerald-100/30 ring-1 ring-emerald-100/60 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/70">Quarterly bill</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">₹ {formatInr(stats.quarterly)}</p>
          <p className="mt-0.5 text-[10px] text-emerald-600 font-semibold">${formatUsd(stats.quarterlyUsd)} USD</p>
        </div>
        <div className="rounded-2xl border border-rose-100/90 bg-gradient-to-br from-rose-50/80 via-white to-orange-50/40 p-4 shadow-lg shadow-rose-100/30 ring-1 ring-rose-100/60 motion-hover-lift">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800/70">Yearly bill</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rose-700">₹ {formatInr(stats.yearly)}</p>
          <p className="mt-0.5 text-[10px] text-rose-600 font-semibold">${formatUsd(stats.yearlyUsd)} USD</p>
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
      {metricsSuccess ? (
        <div className="p-4 bg-emerald-50 border border-emerald-200/90 rounded-2xl text-sm text-emerald-800 ring-1 ring-emerald-100/50">
          {metricsSuccess}
        </div>
      ) : null}
      {metricsError ? (
        <div className="p-4 bg-red-50 border border-red-200/90 rounded-2xl text-sm text-red-700 ring-1 ring-red-100/50">
          {metricsError}
        </div>
      ) : null}

      <section className="rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 overflow-hidden">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100/90 bg-gradient-to-r from-white via-violet-50/40 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Pay-per-use conversation metrics</h3>
            <p className="text-xs text-gray-500 mt-0.5">Edit message rates shown on Get Plan, Broadcast &amp; billing</p>
          </div>
          {!metricsEditing ? (
            <button
              type="button"
              onClick={startMetricsEdit}
              disabled={metricsLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-100 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit rates
            </button>
          ) : null}
        </div>

        <div className="p-4 md:p-5">
          {metricsLoading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
              <p className="text-sm text-gray-500">Loading conversation metrics…</p>
            </div>
          ) : metricsEditing ? (
            <form onSubmit={onSaveMetrics} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {CONVERSATION_METRICS.map((metric) => {
                  const item = metricsForm[metric.key] || {};
                  const previewText =
                    metric.key === 'service'
                      ? String(item.text || metric.text).trim() || metric.text
                      : formatConversationRateText(item.rate);
                  return (
                    <div key={metric.key} className="rounded-2xl border border-violet-100 bg-violet-50/30 p-4 ring-1 ring-violet-100/70">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700/80">{metric.label}</p>
                      {metric.key === 'service' ? (
                        <label className="block mt-3">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Display text</span>
                          <input
                            type="text"
                            value={item.text || ''}
                            onChange={(e) => updateMetricField(metric.key, 'text', e.target.value)}
                            className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 outline-none"
                          />
                        </label>
                      ) : (
                        <>
                          <label className="block mt-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Rate (₹ / msg)</span>
                            <input
                              type="number"
                              min={0}
                              step="0.001"
                              required
                              value={item.rate ?? ''}
                              onChange={(e) => updateMetricField(metric.key, 'rate', e.target.value)}
                              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 outline-none"
                            />
                          </label>
                          <label className="block mt-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Rate ($ / msg)</span>
                            <input
                              type="number"
                              min={0}
                              step="0.0001"
                              required
                              value={item.rate_usd ?? ''}
                              onChange={(e) => updateMetricField(metric.key, 'rate_usd', e.target.value)}
                              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 outline-none"
                            />
                          </label>
                        </>
                      )}
                      <p className="mt-3 text-xs font-semibold text-gray-700">Preview: {previewText}</p>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={cancelMetricsEdit}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={metricsSaving}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-purple-600 shadow-md disabled:opacity-50"
                >
                  {metricsSaving ? 'Saving…' : 'Save rates'}
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {metricsPreview.map((metric) => (
                <div
                  key={metric.key}
                  className="rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white px-3 py-3 text-center shadow-sm ring-1 ring-slate-100/80"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{metric.label}</p>
                  <p className="mt-1.5 text-sm font-bold text-slate-800">{metric.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

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
          <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 p-4 md:p-5">
            {paginatedItems.map((plan) => {
              const cycles = buildCycleOptions(plan.price_monthly, plan, 'INR');
              const cyclesUsd = buildCycleOptions(plan.price_monthly_usd || PLAN_MONTHLY_USD_DEFAULT, plan, 'USD');
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
                    {cycles.map((c) => {
                      const cUsd = cyclesUsd.find((item) => item.cycle === c.cycle);
                      return (
                      <div key={c.cycle} className="rounded-xl bg-slate-50 px-2.5 py-2.5 text-left ring-1 ring-slate-100">
                        <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{c.label}</p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-800">
                          ₹ {formatInr(c.discountedMonthly)} <span className="text-[10px] font-semibold text-slate-500">/project /mo</span>
                        </p>
                        <p className="mt-0.5 text-xs font-semibold tabular-nums text-sky-700">
                          ${formatUsd(cUsd?.discountedMonthly || 0)} <span className="text-[10px] font-semibold text-slate-500">USD /mo</span>
                        </p>
                        <p className="mt-1 text-[10px] leading-snug text-slate-500">{c.billingNote}</p>
                      </div>
                    );})}
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
          <SuperAdminPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={totalItems}
            pageSize={pageSize}
          />
          </>
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
              planDiscounts={planDiscounts}
              conversationMetrics={previewMetrics}
              showGst
              currency="INR"
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
                  {form.id ? (
                    <p className="mt-1 text-[10px] text-gray-500">Plan ID: {form.slug || 'standard'} (used internally for billing &amp; limits)</p>
                  ) : (
                    <p className="mt-1 text-[10px] text-gray-500">Plan ID is generated automatically from the plan name when you save.</p>
                  )}
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
                          const derived = withDerivedPrices(f.price_monthly, planDiscounts);
                          next.price_quarterly = derived.price_quarterly;
                          next.price_yearly = derived.price_yearly;
                        }
                        return next;
                      });
                    }}
                    className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                  <span className="text-sm text-gray-700">
                    Auto-calculate quarterly (−{discountCfg.quarterlyPercent}%) &amp; yearly (−{discountCfg.yearlyPercent}%) from monthly
                  </span>
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

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3 ring-1 ring-indigo-100/80">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">Billing prices (USD)</p>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Monthly ($)</span>
                  <input type="number" min={0} required value={form.price_monthly_usd} onChange={(e) => updateMonthlyPriceUsd(e.target.value)} className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none" />
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.autoDeriveUsdPrices}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((f) => {
                        const next = { ...f, autoDeriveUsdPrices: checked };
                        if (checked) {
                          const derived = withDerivedUsdPrices(f.price_monthly_usd, planDiscounts);
                          next.price_quarterly_usd = derived.price_quarterly_usd;
                          next.price_yearly_usd = derived.price_yearly_usd;
                        }
                        return next;
                      });
                    }}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Auto-calculate USD quarterly &amp; yearly from monthly</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Quarterly total ($)</span>
                    <input
                      type="number"
                      min={0}
                      required
                      disabled={form.autoDeriveUsdPrices}
                      value={form.price_quarterly_usd}
                      onChange={(e) => setForm((f) => ({ ...f, price_quarterly_usd: e.target.value }))}
                      className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-gray-600">Yearly total ($)</span>
                    <input
                      type="number"
                      min={0}
                      required
                      disabled={form.autoDeriveUsdPrices}
                      value={form.price_yearly_usd}
                      onChange={(e) => setForm((f) => ({ ...f, price_yearly_usd: e.target.value }))}
                      className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm bg-white disabled:bg-gray-50 disabled:text-gray-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Users limit</span>
                  <input type="number" min={0} value={form.users_limit} onChange={(e) => setForm((f) => ({ ...f, users_limit: e.target.value }))} className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none" />
                  <p className="mt-1 text-[10px] text-gray-500">0 = unlimited. Used only when plan features has lines and agents are not listed there.</p>
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
                <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                  Use one feature per line. Unlimited: <strong>Unlimited Agents</strong>. Limited:{' '}
                  <strong>1 Agent</strong>, <strong>can create 1 agent only</strong>,{' '}
                  <strong>2 Agents</strong>, <strong>3 Campaigns</strong>, <strong>5 Templates</strong>,{' '}
                  <strong>2 Flows</strong>, <strong>100 Contacts</strong>. Set <strong>Users limit</strong> only when
                  agents are not listed in features (leave at 0 if you use feature lines). Empty plan features = unlimited for all resources.
                  Limits apply from the active plan in Super Admin (or the plan assigned to the project).
                </p>
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
