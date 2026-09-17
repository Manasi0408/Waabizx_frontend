import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createPlan,
  deletePlan,
  fetchAdminConversationMetrics,
  fetchAdminPlans,
  fetchAdminPlanDiscounts,
  fetchAdminWhatsappPricing,
  fetchAdminWccSettings,
  updateAdminPlanDiscounts,
  updateAdminWhatsappPricing,
  updateAdminWccSettings,
  updateConversationMetrics,
  updatePlan,
} from '../services/planService';
import PlanSubscriptionView from './PlanSubscriptionView';
import SuperAdminPagination, { useSuperAdminPagination } from './SuperAdminPagination';
import { SuperAdminHero, SuperAdminPage, SuperAdminPanel } from './SuperAdminUi';
import {
  CONVERSATION_METRICS,
  PLAN_HIGHLIGHTS,
  PLAN_MONTHLY_DEFAULT,
  buildAdminMetricsPreview,
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

const PLAN_BILLING_CYCLES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

function cycleMonths(cycle) {
  if (cycle === 'quarterly') return 3;
  if (cycle === 'yearly') return 12;
  return 1;
}

function getPerProjectMonthlyFromForm(form, cycle, currency = 'INR') {
  const isUsd = currency === 'USD';
  if (cycle === 'quarterly') {
    return (Number(isUsd ? form.price_quarterly_usd : form.price_quarterly) || 0) / 3;
  }
  if (cycle === 'yearly') {
    return (Number(isUsd ? form.price_yearly_usd : form.price_yearly) || 0) / 12;
  }
  return Number(isUsd ? form.price_monthly_usd : form.price_monthly) || 0;
}

function getBillingTotalFromForm(form, cycle, currency = 'INR') {
  const isUsd = currency === 'USD';
  if (cycle === 'quarterly') return Number(isUsd ? form.price_quarterly_usd : form.price_quarterly) || 0;
  if (cycle === 'yearly') return Number(isUsd ? form.price_yearly_usd : form.price_yearly) || 0;
  return Number(isUsd ? form.price_monthly_usd : form.price_monthly) || 0;
}

function applyPerProjectMonthlyToForm(form, cycle, rawValue, currency = 'INR', discounts = null) {
  const value = Math.max(0, Number(rawValue) || 0);
  const total = Math.round(value * cycleMonths(cycle) * 100) / 100;
  const isUsd = currency === 'USD';

  if (isUsd) {
    const next = { ...form };
    if (cycle === 'monthly') {
      next.price_monthly_usd = String(value);
      if (form.autoDeriveUsdPrices) {
        const derived = withDerivedUsdPrices(value, discounts);
        next.price_quarterly_usd = derived.price_quarterly_usd;
        next.price_yearly_usd = derived.price_yearly_usd;
      }
    } else {
      next.autoDeriveUsdPrices = false;
      if (cycle === 'quarterly') next.price_quarterly_usd = String(total);
      else next.price_yearly_usd = String(total);
    }
    return next;
  }

  const next = { ...form };
  if (cycle === 'monthly') {
    next.price_monthly = String(value);
    if (form.autoDerivePrices) {
      const derived = withDerivedPrices(value, discounts);
      next.price_quarterly = derived.price_quarterly;
      next.price_yearly = derived.price_yearly;
    }
  } else {
    next.autoDerivePrices = false;
    if (cycle === 'quarterly') next.price_quarterly = String(total);
    else next.price_yearly = String(total);
  }
  return next;
}

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

const emptyForm = (discounts = null) => ({
  id: null,
  slug: 'standard',
  name: 'Standard Project Plan',
  ...withDerivedPrices(PLAN_MONTHLY_DEFAULT, discounts),
  ...withDerivedUsdPrices(PLAN_MONTHLY_USD_DEFAULT, discounts),
  autoDerivePrices: true,
  autoDeriveUsdPrices: true,
  users_limit: '0',
  messages_limit: '0',
  featuresText: defaultFeaturesText(),
  trial_days: '0',
  is_active: true,
  sort_order: '1',
});

const planToForm = (plan, discounts = null) => {
  const monthly = String(plan.price_monthly ?? PLAN_MONTHLY_DEFAULT);
  const derived = withDerivedPrices(monthly, discounts);
  const storedQuarterly = Number(plan.price_quarterly);
  const storedYearly = Number(plan.price_yearly);
  const computedQuarterly = computeQuarterlyFromMonthly(monthly, discounts);
  const computedYearly = computeYearlyFromMonthly(monthly, discounts);
  const autoDerivePrices =
    (!storedQuarterly || storedQuarterly === computedQuarterly) &&
    (!storedYearly || storedYearly === computedYearly);

  const monthlyUsd = String(plan.price_monthly_usd ?? PLAN_MONTHLY_USD_DEFAULT);
  const derivedUsd = withDerivedUsdPrices(monthlyUsd, discounts);
  const storedQuarterlyUsd = Number(plan.price_quarterly_usd);
  const storedYearlyUsd = Number(plan.price_yearly_usd);
  const computedQuarterlyUsd = computeQuarterlyFromMonthly(monthlyUsd, discounts);
  const computedYearlyUsd = computeYearlyFromMonthly(monthlyUsd, discounts);
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

const parseMetricRateInput = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '.' || raw === '-') return null;
  const num = Number(raw);
  return Number.isFinite(num) ? Math.max(0, num) : null;
};

const formToMetricsPreview = (form) => {
  const config = {};
  CONVERSATION_METRICS.forEach((metric) => {
    const item = form[metric.key] || {};
    config[metric.key] = {
      label: item.label || metric.label,
      rate: parseMetricRateInput(item.rate) ?? 0,
      rate_usd: parseMetricRateInput(item.rate_usd) ?? 0,
      ...(metric.key === 'service'
        ? { text: String(item.text || metric.text).trim() || metric.text }
        : {}),
    };
  });
  return buildAdminMetricsPreview(config);
};

const payloadToMetricsConfig = (payload = {}) => {
  const config = {};
  CONVERSATION_METRICS.forEach((metric) => {
    const item = payload[metric.key] || {};
    config[metric.key] = {
      label: item.label || metric.label,
      rate: Math.max(0, Number(item.rate) || 0),
      rate_usd: Math.max(0, Number(item.rate_usd) || 0),
      ...(metric.key === 'service'
        ? { text: String(item.text || metric.text).trim() || metric.text }
        : {}),
    };
  });
  return config;
};

const WCC_COUNTRY_LABELS = {
  IN: 'India',
  US: 'United States',
  AU: 'Australia',
  GB: 'United Kingdom',
  AE: 'UAE',
  SG: 'Singapore',
};

const WCC_CATEGORY_LABELS = {
  marketing: 'Marketing',
  utility: 'Utility',
  authentication: 'Authentication',
  service: 'Service',
};

const WCC_SETTINGS_CATEGORIES = ['marketing', 'utility', 'authentication', 'service'];

const cloneWccSettingsForm = (settings = []) => {
  const byCategory = {};
  for (const item of settings) {
    if (item?.category) byCategory[item.category] = item;
  }
  return WCC_SETTINGS_CATEGORIES.map((category) => ({
    category,
    originalAmount: String(byCategory[category]?.originalAmount ?? '0'),
    extraAmount: String(byCategory[category]?.extraAmount ?? '0'),
  }));
};

const convertInrToCurrency = (amountInr, currency, fxRates = {}) => {
  const inr = Number(amountInr) || 0;
  const cur = String(currency || 'INR').toUpperCase();
  if (cur === 'INR') return inr;
  const fx = Number(fxRates[cur]) || 0;
  if (fx <= 0) return inr;
  return inr / fx;
};

const formatWccCountryAmount = (amount, currency) => {
  const cur = String(currency || 'INR').toUpperCase();
  const n = Number(amount) || 0;
  if (cur === 'INR') return `₹ ${formatInr(n)}`;
  return `${cur} ${n}`;
};

const buildConversationMetricsFromWccPricing = (pricingForm = [], fxRates = {}, existingConfig = {}) => {
  const india = pricingForm.find((c) => c.countryCode === 'IN');
  const us = pricingForm.find((c) => c.countryCode === 'US');
  const payload = {};

  CONVERSATION_METRICS.forEach((metric) => {
    const existing = existingConfig[metric.key] || {};
    const inRate = Math.max(0, Number(india?.rates?.[metric.key]?.rate) || 0);
    let usRate = Math.max(0, Number(us?.rates?.[metric.key]?.rate) || 0);
    if (!us && metric.key !== 'service') {
      const fx = Number(fxRates.USD) || 0;
      usRate =
        fx > 0
          ? Math.round((inRate / fx) * 10000) / 10000
          : Math.max(0, Number(existing.rate_usd) || 0);
    }

    payload[metric.key] = {
      label: existing.label || metric.label,
      rate: inRate,
      rate_usd: metric.key === 'service' ? 0 : usRate,
      ...(metric.key === 'service'
        ? { text: String(existing.text || metric.text).trim() || metric.text }
        : {}),
    };
  });

  return payload;
};

const buildCountryCategoryBreakdown = (country, category, wccSettingsSource, fxRates = {}) => {
  const rate = Math.max(0, Number(country?.rates?.[category]?.rate) || 0);
  const setting = (wccSettingsSource || []).find((s) => s.category === category) || {};
  const extraInr = Math.max(0, Number(setting.extraAmount) || 0);
  const currency = String(country?.currency || 'INR').toUpperCase();
  const extraAmount = convertInrToCurrency(extraInr, currency, fxRates);
  const customerCharge = rate;
  const originalAmount = Math.max(0, customerCharge - extraAmount);
  return { originalAmount, extraAmount, extraInr, customerCharge, currency };
};

const emptyWccCountryRates = () =>
  CONVERSATION_METRICS.reduce((acc, metric) => {
    acc[metric.key] = {
      rate: String(metric.rate ?? '0'),
      active: metric.key !== 'service',
    };
    return acc;
  }, {});

const cloneWccCountriesForm = (countries = [], settings = [], fxRates = {}) =>
  (Array.isArray(countries) ? countries : []).map((country) => ({
    countryCode: String(country.countryCode || '').toUpperCase(),
    currency: String(country.currency || 'INR').toUpperCase(),
    rates: CONVERSATION_METRICS.reduce((acc, metric) => {
      const item = country.rates?.[metric.key] || {};
      const breakdown = buildCountryCategoryBreakdown(
        {
          ...country,
          rates: {
            ...country.rates,
            [metric.key]: {
              rate: String(item.rate ?? '0'),
              active: item.active !== false,
            },
          },
        },
        metric.key,
        settings,
        fxRates
      );
      acc[metric.key] = {
        rate: String(item.rate ?? '0'),
        originalAmount: String(breakdown.originalAmount ?? '0'),
        active: item.active !== false,
      };
      return acc;
    }, {}),
  }));

const DEFAULT_FX_CURRENCIES = ['USD', 'AUD', 'GBP', 'EUR'];

const exchangeRatesToForm = (exchangeRates = [], fxRates = {}) => {
  const form = {};
  for (const row of exchangeRates) {
    const base = String(row.baseCurrency || row.base_currency || '').toUpperCase();
    const target = String(row.targetCurrency || row.target_currency || 'INR').toUpperCase();
    if (base && target === 'INR' && row.rate != null) {
      form[base] = String(row.rate);
    }
  }
  for (const cur of DEFAULT_FX_CURRENCIES) {
    if (form[cur] == null && fxRates[cur] != null) {
      form[cur] = String(fxRates[cur]);
    }
  }
  return form;
};

const formToExchangeRates = (form = {}) =>
  Object.entries(form)
    .map(([baseCurrency, rate]) => ({
      baseCurrency: String(baseCurrency).toUpperCase(),
      targetCurrency: 'INR',
      rate: Number(rate),
    }))
    .filter((row) => row.baseCurrency && row.baseCurrency !== 'INR' && Number.isFinite(row.rate) && row.rate > 0);

const cloneExchangeRatesForm = (exchangeRates = [], fxRates = {}) => ({ ...exchangeRatesToForm(exchangeRates, fxRates) });

const countryLabel = (code) => WCC_COUNTRY_LABELS[String(code || '').toUpperCase()] || String(code || '').toUpperCase();

function planWithDerivedCyclePrices(plan, discounts = null) {
  if (!plan) return null;
  const monthly = Math.max(0, Number(plan.price_monthly) || PLAN_MONTHLY_DEFAULT);
  const monthlyUsd = Math.max(0, Number(plan.price_monthly_usd) || PLAN_MONTHLY_USD_DEFAULT);
  return {
    ...plan,
    price_quarterly: computeQuarterlyFromMonthly(monthly, discounts),
    price_yearly: computeYearlyFromMonthly(monthly, discounts),
    price_quarterly_usd: computeQuarterlyFromMonthly(monthlyUsd, discounts),
    price_yearly_usd: computeYearlyFromMonthly(monthlyUsd, discounts),
  };
}

function SuperAdminPlansPanel() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [planPriceCycleInr, setPlanPriceCycleInr] = useState('monthly');
  const [planPriceCycleUsd, setPlanPriceCycleUsd] = useState('monthly');
  const [previewCycle, setPreviewCycle] = useState('monthly');
  const [metricsForm, setMetricsForm] = useState(emptyMetricsForm());
  const [metricsConfig, setMetricsConfig] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsSaving, setMetricsSaving] = useState(false);
  const [metricsEditing, setMetricsEditing] = useState(false);
  const [metricsError, setMetricsError] = useState('');
  const [metricsSuccess, setMetricsSuccess] = useState('');
  const [planDiscounts, setPlanDiscounts] = useState({ quarterlyPercent: 10, yearlyPercent: 15 });
  const [offerMonthlyInr, setOfferMonthlyInr] = useState(String(PLAN_MONTHLY_DEFAULT));
  const [discountSaving, setDiscountSaving] = useState(false);
  const [discountSuccess, setDiscountSuccess] = useState('');
  const [wccPricingCountries, setWccPricingCountries] = useState([]);
  const [wccPricingForm, setWccPricingForm] = useState([]);
  const [wccPricingFxRates, setWccPricingFxRates] = useState({});
  const [wccExchangeRates, setWccExchangeRates] = useState([]);
  const [wccExchangeRatesForm, setWccExchangeRatesForm] = useState({});
  const [wccPricingLoading, setWccPricingLoading] = useState(true);
  const [wccPricingSaving, setWccPricingSaving] = useState(false);
  const [wccPricingError, setWccPricingError] = useState('');
  const [wccPricingSuccess, setWccPricingSuccess] = useState('');
  const [wccSettings, setWccSettings] = useState([]);
  const [wccSettingsForm, setWccSettingsForm] = useState([]);
  const [wccSettingsLoading, setWccSettingsLoading] = useState(true);
  const [wccSettingsError, setWccSettingsError] = useState('');
  const [wccSettingsSuccess, setWccSettingsSuccess] = useState('');
  const [selectedWccCountry, setSelectedWccCountry] = useState('IN');
  const [newWccCountryCode, setNewWccCountryCode] = useState('');
  const [newWccCountryCurrency, setNewWccCountryCurrency] = useState('USD');
  const planFormScrollRef = useRef(null);
  const wccPricingFormRef = useRef([]);
  const wccSettingsFormRef = useRef([]);

  useEffect(() => {
    wccPricingFormRef.current = wccPricingForm;
  }, [wccPricingForm]);

  useEffect(() => {
    wccSettingsFormRef.current = wccSettingsForm;
  }, [wccSettingsForm]);

  const loadConversationMetrics = useCallback(async () => {
    setMetricsError('');
    setMetricsLoading(true);
    try {
      const data = await fetchAdminConversationMetrics();
      const config = data.config && typeof data.config === 'object' ? data.config : {};
      const metrics = buildAdminMetricsPreview(config);
      setMetricsConfig(config);
      setMetricsForm(metricsToForm(metrics));
    } catch (e) {
      setMetricsError(e?.response?.data?.message || e?.message || 'Failed to load conversation metrics');
      setMetricsConfig({});
      setMetricsForm(emptyMetricsForm());
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadWccSettings = useCallback(async () => {
    setWccSettingsError('');
    setWccSettingsLoading(true);
    try {
      const data = await fetchAdminWccSettings();
      const settings = Array.isArray(data.settings) ? data.settings : [];
      const nextSettingsForm = cloneWccSettingsForm(settings);
      wccSettingsFormRef.current = nextSettingsForm;
      setWccSettings(settings);
      setWccSettingsForm(nextSettingsForm);
      return nextSettingsForm;
    } catch (e) {
      setWccSettingsError(e?.response?.data?.message || e?.message || 'Failed to load WCC settings');
      const emptySettingsForm = cloneWccSettingsForm([]);
      wccSettingsFormRef.current = emptySettingsForm;
      setWccSettings([]);
      setWccSettingsForm(emptySettingsForm);
      return emptySettingsForm;
    } finally {
      setWccSettingsLoading(false);
    }
  }, []);

  const loadWccCountryPricing = useCallback(async (settingsFormOverride) => {
    setWccPricingError('');
    setWccPricingLoading(true);
    try {
      const data = await fetchAdminWhatsappPricing();
      const countries = Array.isArray(data.countries) ? data.countries : [];
      const fxRates = data.fxRates || {};
      const settingsForm = settingsFormOverride || wccSettingsFormRef.current;
      const nextPricingForm = cloneWccCountriesForm(countries, settingsForm, fxRates);
      wccPricingFormRef.current = nextPricingForm;
      setWccPricingCountries(countries);
      setWccPricingForm(nextPricingForm);
      setWccPricingFxRates(fxRates);
      setWccExchangeRates(Array.isArray(data.exchangeRates) ? data.exchangeRates : []);
      setWccExchangeRatesForm(cloneExchangeRatesForm(data.exchangeRates, fxRates));
      setSelectedWccCountry((prev) => {
        if (countries.length && !countries.some((c) => c.countryCode === prev)) {
          return countries[0].countryCode;
        }
        return prev || (countries[0]?.countryCode ?? 'IN');
      });
    } catch (e) {
      setWccPricingError(e?.response?.data?.message || e?.message || 'Failed to load country WCC pricing');
      wccPricingFormRef.current = [];
      setWccPricingCountries([]);
      setWccPricingForm([]);
    } finally {
      setWccPricingLoading(false);
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
    const loadWccData = async () => {
      const settingsForm = await loadWccSettings();
      await loadWccCountryPricing(settingsForm);
    };
    loadWccData();
  }, [loadPlans, loadConversationMetrics, loadWccCountryPricing, loadWccSettings]);

  const metricsPreview = useMemo(
    () => buildAdminMetricsPreview(metricsConfig || {}),
    [metricsConfig]
  );

  const primaryPlan = useMemo(() => {
    const active = plans.filter((p) => p.is_active);
    const sorted = (active.length ? active : plans).slice().sort(
      (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    );
    return sorted[0] || null;
  }, [plans]);

  const derivedPrimaryPlan = useMemo(
    () => planWithDerivedCyclePrices(primaryPlan, planDiscounts),
    [primaryPlan, planDiscounts]
  );

  useEffect(() => {
    setOfferMonthlyInr(String(Number(primaryPlan?.price_monthly) || PLAN_MONTHLY_DEFAULT));
  }, [primaryPlan?.id, primaryPlan?.price_monthly]);

  const monthlyPrice = Number(offerMonthlyInr) || Number(primaryPlan?.price_monthly) || PLAN_MONTHLY_DEFAULT;
  const monthlyPriceUsd = Number(primaryPlan?.price_monthly_usd) || PLAN_MONTHLY_USD_DEFAULT;
  const cycleStats = useMemo(
    () => buildCycleOptions(monthlyPrice, derivedPrimaryPlan, 'INR', planDiscounts),
    [monthlyPrice, derivedPrimaryPlan, planDiscounts]
  );
  const cycleStatsUsd = useMemo(
    () =>
      buildCycleOptions(
        monthlyPriceUsd,
        derivedPrimaryPlan ? { ...derivedPrimaryPlan, price_monthly: monthlyPriceUsd } : null,
        'USD',
        planDiscounts
      ),
    [monthlyPriceUsd, derivedPrimaryPlan, planDiscounts]
  );

  const offerDerivedInr = useMemo(() => {
    const monthly = Math.max(0, Number(offerMonthlyInr) || 0);
    return {
      quarterlyPerMo: discountedMonthlyRate(monthly, 'quarterly', planDiscounts),
      yearlyPerMo: discountedMonthlyRate(monthly, 'yearly', planDiscounts),
      quarterlyTotal: computeQuarterlyFromMonthly(monthly, planDiscounts),
      yearlyTotal: computeYearlyFromMonthly(monthly, planDiscounts),
    };
  }, [offerMonthlyInr, planDiscounts]);

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
    setForm(emptyForm(planDiscounts));
    setPlanPriceCycleInr('monthly');
    setPlanPriceCycleUsd('monthly');
    setShowForm(true);
    setSuccess('');
    setError('');
  };

  const openEdit = (plan) => {
    setForm(plan ? planToForm(plan, planDiscounts) : emptyForm(planDiscounts));
    setPlanPriceCycleInr('monthly');
    setPlanPriceCycleUsd('monthly');
    setShowForm(true);
    setSuccess('');
    setError('');
  };

  const closeForm = () => {
    setShowForm(false);
    setForm(emptyForm(planDiscounts));
    setPlanPriceCycleInr('monthly');
    setPlanPriceCycleUsd('monthly');
  };

  useEffect(() => {
    if (!showForm) return;
    setForm((current) => {
      let next = current;
      if (current.autoDerivePrices) {
        const derived = withDerivedPrices(current.price_monthly, planDiscounts);
        next = { ...next, price_quarterly: derived.price_quarterly, price_yearly: derived.price_yearly };
      }
      if (current.autoDeriveUsdPrices) {
        const derived = withDerivedUsdPrices(current.price_monthly_usd, planDiscounts);
        next = {
          ...next,
          price_quarterly_usd: derived.price_quarterly_usd,
          price_yearly_usd: derived.price_yearly_usd,
        };
      }
      return next;
    });
  }, [planDiscounts, showForm]);

  useEffect(() => {
    if (!showForm) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const resetScroll = () => {
      if (planFormScrollRef.current) planFormScrollRef.current.scrollTop = 0;
    };
    resetScroll();
    requestAnimationFrame(resetScroll);
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showForm, form.id]);

  const savePlanDiscounts = async () => {
    setDiscountSaving(true);
    setDiscountSuccess('');
    setError('');
    try {
      const saved = await updateAdminPlanDiscounts(planDiscounts);
      setPlanDiscounts(saved);
      const monthly = Math.max(0, Number(offerMonthlyInr) || PLAN_MONTHLY_DEFAULT);
      if (primaryPlan?.id) {
        const monthlyUsd = Math.max(0, Number(primaryPlan.price_monthly_usd) || PLAN_MONTHLY_USD_DEFAULT);
        await updatePlan(primaryPlan.id, {
          slug: primaryPlan.slug || 'standard',
          name: primaryPlan.name || 'Standard Project Plan',
          price_monthly: monthly,
          price_quarterly: computeQuarterlyFromMonthly(monthly, saved),
          price_yearly: computeYearlyFromMonthly(monthly, saved),
          price_monthly_usd: monthlyUsd,
          price_quarterly_usd: computeQuarterlyFromMonthly(monthlyUsd, saved),
          price_yearly_usd: computeYearlyFromMonthly(monthlyUsd, saved),
          users_limit: Number(primaryPlan.users_limit) || 0,
          messages_limit: Number(primaryPlan.messages_limit) || 0,
          features: Array.isArray(primaryPlan.features) ? primaryPlan.features.join('\n') : '',
          trial_days: Number(primaryPlan.trial_days) || 0,
          is_active: Boolean(primaryPlan.is_active),
          sort_order: Number(primaryPlan.sort_order) || 1,
        });
        await loadPlans();
      }
      setDiscountSuccess('Monthly pricing and billing cycle offers updated.');
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
      const savedConfig = data.config || payloadToMetricsConfig(payload);
      const metrics = buildAdminMetricsPreview(savedConfig);
      setMetricsConfig(savedConfig);
      setMetricsForm(metricsToForm(metrics));
      setMetricsEditing(false);
      setMetricsSuccess('Message category costs updated. Customers will see the new rates.');
    } catch (err) {
      setMetricsError(err?.response?.data?.message || err?.message || 'Failed to save conversation metrics');
    } finally {
      setMetricsSaving(false);
    }
  };

  const previewMetrics = useMemo(() => {
    const source = metricsEditing ? formToMetricsPreview(metricsForm) : metricsPreview;
    return buildConversationMetrics(source);
  }, [metricsEditing, metricsForm, metricsPreview]);

  const activeWccCountryForm = useMemo(
    () => wccPricingForm.find((c) => c.countryCode === selectedWccCountry) || wccPricingForm[0] || null,
    [wccPricingForm, selectedWccCountry]
  );

  const activeCountryBreakdown = useMemo(() => {
    const country = activeWccCountryForm;
    if (!country) return [];
    return CONVERSATION_METRICS.map((metric) => {
      const item = country.rates?.[metric.key] || {};
      const breakdown = buildCountryCategoryBreakdown(country, metric.key, wccSettingsForm, wccPricingFxRates);
      const storedOriginal = item.originalAmount;
      const originalAmount =
        storedOriginal != null && storedOriginal !== ''
          ? Math.max(0, Number(storedOriginal) || 0)
          : breakdown.originalAmount;
      const extraInr = Math.max(0, Number(wccSettingsForm.find((s) => s.category === metric.key)?.extraAmount) || 0);
      const extraAmount = convertInrToCurrency(extraInr, breakdown.currency, wccPricingFxRates);
      const storedRate = Math.max(0, Number(item.rate) || 0);
      const customerCharge = storedRate > 0 ? storedRate : Math.max(0, originalAmount + extraAmount);
      return {
        category: metric.key,
        label: WCC_CATEGORY_LABELS[metric.key] || metric.label,
        active: item.active !== false,
        originalAmount,
        extraAmount,
        extraInr,
        customerCharge,
        currency: breakdown.currency,
      };
    });
  }, [activeWccCountryForm, wccSettingsForm, wccPricingFxRates]);

  const applyWccCountryFieldUpdate = (prevSettings, prevPricing, countryCode, category, field, rawValue, fxRates) => {
    const nextSettings =
      field === 'extraAmount'
        ? prevSettings.map((item) =>
            item.category === category ? { ...item, extraAmount: String(rawValue) } : item
          )
        : field === 'originalAmount' && countryCode === 'IN'
          ? prevSettings.map((item) =>
              item.category === category ? { ...item, originalAmount: String(rawValue) } : item
            )
          : prevSettings;

    const nextPricing = prevPricing.map((country) => {
      if (country.countryCode !== countryCode) return country;
      const item = country.rates?.[category] || { rate: '0', active: true, originalAmount: '0' };
      const prevExtraInr = Math.max(0, Number(prevSettings.find((s) => s.category === category)?.extraAmount) || 0);
      const nextExtraInr = Math.max(0, Number(nextSettings.find((s) => s.category === category)?.extraAmount) || 0);
      const currency = String(country.currency || 'INR').toUpperCase();

      let original = Math.max(0, Number(item.originalAmount ?? item.rate) || 0);
      if (field === 'originalAmount') {
        original = Math.max(0, Number(rawValue) || 0);
      } else if (field === 'extraAmount') {
        const prevExtra = convertInrToCurrency(prevExtraInr, currency, fxRates);
        original = Math.max(0, (Number(item.rate) || 0) - prevExtra);
      }

      const extra = convertInrToCurrency(nextExtraInr, currency, fxRates);
      const rate = Math.max(0, original + extra);

      return {
        ...country,
        rates: {
          ...country.rates,
          [category]: {
            ...item,
            originalAmount: String(original),
            rate: String(rate),
          },
        },
      };
    });

    return { nextSettings, nextPricing };
  };

  const updateWccCountryBreakdownField = (countryCode, category, field, value) => {
    const { nextSettings, nextPricing } = applyWccCountryFieldUpdate(
      wccSettingsFormRef.current,
      wccPricingFormRef.current,
      countryCode,
      category,
      field,
      value,
      wccPricingFxRates
    );
    wccSettingsFormRef.current = nextSettings;
    wccPricingFormRef.current = nextPricing;
    setWccSettingsForm(nextSettings);
    setWccPricingForm(nextPricing);
  };

  const resetWccPricingForm = () => {
    const nextSettingsForm = cloneWccSettingsForm(wccSettings);
    const nextPricingForm = cloneWccCountriesForm(wccPricingCountries, nextSettingsForm, wccPricingFxRates);
    wccSettingsFormRef.current = nextSettingsForm;
    wccPricingFormRef.current = nextPricingForm;
    setWccPricingForm(nextPricingForm);
    setWccSettingsForm(nextSettingsForm);
    setWccExchangeRatesForm(cloneExchangeRatesForm(wccExchangeRates, wccPricingFxRates));
    setWccPricingError('');
  };

  const updateWccRateField = (countryCode, category, field, value) => {
    const nextPricing = wccPricingFormRef.current.map((country) => {
      if (country.countryCode !== countryCode) return country;
      return {
        ...country,
        rates: {
          ...country.rates,
          [category]: {
            ...(country.rates?.[category] || {}),
            [field]: value,
          },
        },
      };
    });
    wccPricingFormRef.current = nextPricing;
    setWccPricingForm(nextPricing);
  };

  const addWccCountry = () => {
    const code = String(newWccCountryCode || '').trim().toUpperCase();
    const currency = String(newWccCountryCurrency || 'USD').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      setWccPricingError('Country code must be 2 letters (e.g. US, AU, GB).');
      return;
    }
    if (wccPricingForm.some((c) => c.countryCode === code)) {
      setWccPricingError(`Country ${code} is already in the list.`);
      return;
    }
    const nextPricing = [
      ...wccPricingFormRef.current,
      {
        countryCode: code,
        currency,
        rates: emptyWccCountryRates(),
      },
    ];
    wccPricingFormRef.current = nextPricing;
    setWccPricingForm(nextPricing);
    setSelectedWccCountry(code);
    setNewWccCountryCode('');
    setWccPricingError('');
  };

  const onSaveWccPricing = async (e) => {
    e.preventDefault();
    setWccPricingSaving(true);
    setWccPricingError('');
    setWccPricingSuccess('');
    try {
      const pricingForm = wccPricingFormRef.current;
      const settingsForm = wccSettingsFormRef.current;
      const payload = {
        countries: pricingForm.map((country) => ({
          countryCode: country.countryCode,
          currency: country.currency,
          rates: CONVERSATION_METRICS.reduce((acc, metric) => {
            const item = country.rates?.[metric.key] || {};
            acc[metric.key] = {
              rate: Math.max(0, Number(item.rate) || 0),
              active: item.active !== false,
            };
            return acc;
          }, {}),
        })),
      };
      const data = await updateAdminWhatsappPricing(payload);
      const india = pricingForm.find((c) => c.countryCode === 'IN');
      const fxRates = data.fxRates || wccPricingFxRates;
      const settingsPayload = {
        settings: settingsForm.map((item) => {
          const extraAmount = Math.max(0, Number(item.extraAmount) || 0);
          if (!india) {
            return {
              category: item.category,
              originalAmount: Math.max(0, Number(item.originalAmount) || 0),
              extraAmount,
            };
          }
          const breakdown = buildCountryCategoryBreakdown(india, item.category, settingsForm, fxRates);
          return {
            category: item.category,
            originalAmount: breakdown.originalAmount,
            extraAmount,
          };
        }),
      };
      const settingsData = await updateAdminWccSettings(settingsPayload);
      const settings = settingsData.settings || [];
      const nextSettingsForm = cloneWccSettingsForm(settings);
      const nextCountries = data.countries || [];
      const nextPricingForm = cloneWccCountriesForm(nextCountries, nextSettingsForm, fxRates);
      wccSettingsFormRef.current = nextSettingsForm;
      wccPricingFormRef.current = nextPricingForm;
      setWccSettings(settings);
      setWccSettingsForm(nextSettingsForm);
      setWccPricingCountries(nextCountries);
      setWccPricingForm(nextPricingForm);
      setWccPricingFxRates(fxRates);
      setWccExchangeRates(Array.isArray(data.exchangeRates) ? data.exchangeRates : []);
      setWccExchangeRatesForm(cloneExchangeRatesForm(data.exchangeRates, fxRates));

      setWccPricingSuccess('Country WCC pricing updated successfully.');
      try {
        const metricsPayload = buildConversationMetricsFromWccPricing(
          nextPricingForm,
          fxRates,
          metricsConfig || {}
        );
        const metricsData = await updateConversationMetrics(metricsPayload);
        const savedConfig = metricsData.config || payloadToMetricsConfig(metricsPayload);
        const syncedMetrics = buildAdminMetricsPreview(savedConfig);
        setMetricsConfig(savedConfig);
        if (!metricsEditing) {
          setMetricsForm(metricsToForm(syncedMetrics));
        }
        setMetricsSuccess('Message category costs synced from country WCC rates.');
      } catch (syncErr) {
        setMetricsError(
          syncErr?.response?.data?.message ||
            syncErr?.message ||
            'Country rates saved, but message category costs could not be synced.'
        );
      }
    } catch (err) {
      setWccPricingError(err?.response?.data?.message || err?.message || 'Failed to save country WCC pricing');
    } finally {
      setWccPricingSaving(false);
    }
  };

  return (
    <SuperAdminPage>
      <SuperAdminHero
        accent="emerald"
        badge="Subscription pricing"
        title="Manage plans"
        description="Configure monthly, quarterly & yearly pricing with unlimited features. The lowest sort order among published plans appears on Get Plan."
        actions={
          <button
            type="button"
            onClick={openAdd}
            className="motion-hover-lift inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:from-emerald-500 hover:to-teal-500"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add plan
          </button>
        }
      />

      <SuperAdminPanel accent="amber" padding="p-5">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Monthly base &amp; billing cycle offers</h3>
            <p className="mt-1 text-xs text-gray-500">
              Set monthly price per project. Quarterly and yearly totals update automatically from the offer percentages below.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wide text-gray-600">Monthly (₹ /project /mo)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={offerMonthlyInr}
                onChange={(e) => setOfferMonthlyInr(e.target.value)}
                className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 outline-none"
              />
            </label>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800/80">Quarterly (auto)</p>
              <p className="mt-1 text-sm font-bold text-gray-900">
                ₹ {formatInr(offerDerivedInr.quarterlyPerMo)} <span className="text-xs font-semibold text-gray-500">/project /mo</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                Total billed: ₹ {formatInr(offerDerivedInr.quarterlyTotal)} /quarter
                {discountCfg.quarterlyPercent > 0 ? ` (−${discountCfg.quarterlyPercent}%)` : ''}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800/80">Yearly (auto)</p>
              <p className="mt-1 text-sm font-bold text-gray-900">
                ₹ {formatInr(offerDerivedInr.yearlyPerMo)} <span className="text-xs font-semibold text-gray-500">/project /mo</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                Total billed: ₹ {formatInr(offerDerivedInr.yearlyTotal)} /year
                {discountCfg.yearlyPercent > 0 ? ` (−${discountCfg.yearlyPercent}%)` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">
              Example: ₹ {formatInr(Number(offerMonthlyInr) || PLAN_MONTHLY_DEFAULT)}/mo → Quarterly −
              {discountCfg.quarterlyPercent}%, Yearly −{discountCfg.yearlyPercent}%
            </p>
            <button
              type="button"
              onClick={savePlanDiscounts}
              disabled={discountSaving}
              className="shrink-0 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
            >
              {discountSaving ? 'Saving…' : 'Save pricing & offers'}
            </button>
          </div>
        </div>
        {discountSuccess ? (
          <p className="mt-3 text-sm text-emerald-700">{discountSuccess}</p>
        ) : null}
      </SuperAdminPanel>

      <div className="motion-stagger-children grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 md:gap-4">
        <div className="group motion-card-rich motion-hover-lift rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-500/10 via-white to-blue-500/10 p-4 shadow-lg shadow-sky-200/25 ring-1 ring-sky-100/60">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800/70">Monthly /mo</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-sky-800">₹ {formatInr(stats.monthly)}</p>
          <p className="mt-0.5 text-[10px] text-sky-600 font-semibold">/project · ${formatUsd(stats.monthlyUsd)} USD</p>
        </div>
        <div className="group motion-card-rich motion-hover-lift rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 p-4 shadow-lg shadow-emerald-100/30 ring-1 ring-emerald-100/60">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/70">Quarterly bill</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">₹ {formatInr(stats.quarterly)}</p>
          <p className="mt-0.5 text-[10px] text-emerald-600 font-semibold">${formatUsd(stats.quarterlyUsd)} USD</p>
        </div>
        <div className="group motion-card-rich motion-hover-lift rounded-2xl border border-rose-100/90 bg-gradient-to-br from-rose-50/80 via-white to-orange-50/40 p-4 shadow-lg shadow-rose-100/30 ring-1 ring-rose-100/60">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-800/70">Yearly bill</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-rose-700">₹ {formatInr(stats.yearly)}</p>
          <p className="mt-0.5 text-[10px] text-rose-600 font-semibold">${formatUsd(stats.yearlyUsd)} USD</p>
        </div>
        <div className="group motion-card-rich motion-hover-lift rounded-2xl border border-gray-100/90 bg-white p-4 shadow-lg shadow-gray-200/25 ring-1 ring-gray-100/60">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Total plans</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{stats.total}</p>
        </div>
        <div className="group motion-card-rich motion-hover-lift rounded-2xl border border-violet-100/90 bg-gradient-to-br from-violet-50/80 via-white to-blue-50/40 p-4 shadow-lg shadow-violet-100/30 ring-1 ring-violet-100/60 sm:col-span-2 lg:col-span-1">
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
      {wccPricingSuccess ? (
        <div className="p-4 bg-emerald-50 border border-emerald-200/90 rounded-2xl text-sm text-emerald-800 ring-1 ring-emerald-100/50">
          {wccPricingSuccess}
        </div>
      ) : null}
      {wccPricingError ? (
        <div className="p-4 bg-red-50 border border-red-200/90 rounded-2xl text-sm text-red-700 ring-1 ring-red-100/50">
          {wccPricingError}
        </div>
      ) : null}
      {wccSettingsSuccess ? (
        <div className="p-4 bg-emerald-50 border border-emerald-200/90 rounded-2xl text-sm text-emerald-800 ring-1 ring-emerald-100/50">
          {wccSettingsSuccess}
        </div>
      ) : null}
      {wccSettingsError ? (
        <div className="p-4 bg-red-50 border border-red-200/90 rounded-2xl text-sm text-red-700 ring-1 ring-red-100/50">
          {wccSettingsError}
        </div>
      ) : null}
      <section className="group motion-card-rich motion-hover-lift relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 backdrop-blur-sm">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100/90 bg-gradient-to-r from-white via-violet-50/40 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Message category costs</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Set Marketing, Utility, Authentication &amp; Service per-message cost (₹ or $). Saved values display to customers on Get Plan, WCC &amp; billing.
            </p>
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
              Edit costs
            </button>
          ) : null}
        </div>

        <div className="p-4 md:p-5">
          {metricsLoading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-200 border-t-violet-600" />
              <p className="text-sm text-gray-500">Loading message category costs…</p>
            </div>
          ) : metricsEditing ? (
            <form onSubmit={onSaveMetrics} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {formToMetricsPreview(metricsForm).map((previewItem) => {
                  const metric = CONVERSATION_METRICS.find((m) => m.key === previewItem.key) || {};
                  const item = metricsForm[previewItem.key] || {};
                  const previewText = previewItem.text || metric.text;
                  return (
                    <div key={previewItem.key} className="rounded-2xl border border-violet-100 bg-violet-50/30 p-4 ring-1 ring-violet-100/70">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700/80">{previewItem.label || metric.label}</p>
                      {previewItem.key === 'service' ? (
                        <>
                          <label className="block mt-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Cost per message (₹)</span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              value={item.rate ?? ''}
                              placeholder="0 for free"
                              onChange={(e) => updateMetricField(previewItem.key, 'rate', e.target.value)}
                              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 outline-none"
                            />
                          </label>
                          <label className="block mt-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Customer display text</span>
                            <input
                              type="text"
                              value={item.text || ''}
                              placeholder="e.g. Free up to 10 agents"
                              onChange={(e) => updateMetricField(previewItem.key, 'text', e.target.value)}
                              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 outline-none"
                            />
                            <p className="mt-1 text-[10px] text-gray-500">Used when cost is 0 or for custom wording.</p>
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="block mt-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Cost per message (₹)</span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              required
                              placeholder="e.g. 2 or 0.95"
                              value={item.rate ?? ''}
                              onChange={(e) => updateMetricField(previewItem.key, 'rate', e.target.value)}
                              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 outline-none"
                            />
                          </label>
                          <label className="block mt-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Cost per message ($)</span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              required
                              placeholder="e.g. 0.0016"
                              value={item.rate_usd ?? ''}
                              onChange={(e) => updateMetricField(previewItem.key, 'rate_usd', e.target.value)}
                              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 outline-none"
                            />
                          </label>
                        </>
                      )}
                      <p className="mt-3 text-xs font-semibold text-emerald-800">Customer will see: {previewText}</p>
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
                  {metricsSaving ? 'Saving…' : 'Save message costs'}
                </button>
              </div>
            </form>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {buildConversationMetrics(metricsPreview).map((metric) => (
                <div
                  key={metric.key}
                  className="rounded-xl border border-slate-100 bg-gradient-to-b from-slate-50 to-white px-3 py-3 text-center shadow-sm ring-1 ring-slate-100/80"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{metric.label}</p>
                  {metric.key !== 'service' || metric.rate > 0 ? (
                    <p className="mt-1 text-lg font-bold tabular-nums text-violet-700">
                      ₹ {formatInr(metric.rate)}
                    </p>
                  ) : null}
                  <p className="mt-1 text-sm font-semibold text-slate-800">{metric.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="group motion-card-rich motion-hover-lift relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 backdrop-blur-sm">
        <div className="px-4 md:px-5 py-4 border-b border-gray-100/90 bg-gradient-to-r from-white via-emerald-50/40 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Country WCC message rates</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Select a country to view original Meta WCC cost, platform extra, and customer deduction per category.
            </p>
          </div>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          {wccPricingLoading || wccSettingsLoading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
              <p className="text-sm text-gray-500">Loading country WCC pricing…</p>
            </div>
          ) : (
            <form onSubmit={onSaveWccPricing} className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(wccPricingForm || []).map((country) => (
                  <button
                    key={country.countryCode}
                    type="button"
                    onClick={() => setSelectedWccCountry(country.countryCode)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                      selectedWccCountry === country.countryCode
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-200'
                    }`}
                  >
                    {countryLabel(country.countryCode)} ({country.countryCode})
                  </button>
                ))}
              </div>

              {activeWccCountryForm ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/20 p-4 ring-1 ring-emerald-100/70 space-y-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/80">Country</p>
                      <p className="mt-1 text-sm font-bold text-gray-900">
                        {countryLabel(activeWccCountryForm.countryCode)} ({activeWccCountryForm.countryCode})
                      </p>
                    </div>
                    <label className="block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Currency</span>
                      <input
                        type="text"
                        value={activeWccCountryForm.currency || ''}
                        onChange={(e) => {
                          const nextPricing = wccPricingFormRef.current.map((country) =>
                            country.countryCode === activeWccCountryForm.countryCode
                              ? { ...country, currency: e.target.value.toUpperCase() }
                              : country
                          );
                          wccPricingFormRef.current = nextPricing;
                          setWccPricingForm(nextPricing);
                        }}
                        className="mt-1 w-24 rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white focus:border-emerald-400 outline-none"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {activeCountryBreakdown.map((item) => {
                      const extraSetting = wccSettingsForm.find((s) => s.category === item.category) || {};
                      const rateItem = activeWccCountryForm.rates?.[item.category] || {};
                      return (
                        <div key={item.category} className="rounded-2xl border border-emerald-100 bg-white p-4 ring-1 ring-emerald-100/70">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700/80">
                            {item.label}
                          </p>
                          <label className="block mt-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                              Original WCC amount ({item.currency})
                            </span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              value={rateItem.originalAmount ?? item.originalAmount ?? ''}
                              onChange={(e) =>
                                updateWccCountryBreakdownField(
                                  activeWccCountryForm.countryCode,
                                  item.category,
                                  'originalAmount',
                                  e.target.value
                                )
                              }
                              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white focus:border-emerald-400 outline-none"
                            />
                          </label>
                          <label className="block mt-3">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                              Extra amount (₹)
                            </span>
                            <input
                              type="number"
                              min={0}
                              step="any"
                              inputMode="decimal"
                              value={extraSetting.extraAmount ?? '0'}
                              onChange={(e) =>
                                updateWccCountryBreakdownField(
                                  activeWccCountryForm.countryCode,
                                  item.category,
                                  'extraAmount',
                                  e.target.value
                                )
                              }
                              className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white focus:border-emerald-400 outline-none"
                            />
                          </label>
                          <div className="mt-3 rounded-xl border border-emerald-200/80 bg-emerald-50/30 px-3 py-2">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                              Customer deduction
                            </p>
                            <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700">
                              {formatWccCountryAmount(item.customerCharge, item.currency)}
                            </p>
                          </div>
                          <label className="mt-3 flex items-center gap-2 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={item.active !== false}
                              onChange={(e) =>
                                updateWccRateField(
                                  activeWccCountryForm.countryCode,
                                  item.category,
                                  'active',
                                  e.target.checked
                                )
                              }
                            />
                            Active
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-4 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Add country code</span>
                  <input
                    type="text"
                    maxLength={2}
                    value={newWccCountryCode}
                    onChange={(e) => setNewWccCountryCode(e.target.value.toUpperCase())}
                    placeholder="US"
                    className="mt-1 w-24 rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white uppercase focus:border-emerald-400 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Currency</span>
                  <input
                    type="text"
                    maxLength={5}
                    value={newWccCountryCurrency}
                    onChange={(e) => setNewWccCountryCurrency(e.target.value.toUpperCase())}
                    placeholder="USD"
                    className="mt-1 w-24 rounded-xl border-2 border-gray-200 px-3 py-2 text-sm bg-white uppercase focus:border-emerald-400 outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={addWccCountry}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100"
                >
                  Add country
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetWccPricingForm}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={wccPricingSaving}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-md disabled:opacity-50"
                >
                  {wccPricingSaving ? 'Saving…' : 'Save country rates'}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      <section className="group motion-card-rich motion-hover-lift relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 backdrop-blur-sm">
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
              const derivedPlan = planWithDerivedCyclePrices(plan, planDiscounts);
              const cycles = buildCycleOptions(derivedPlan.price_monthly, derivedPlan, 'INR', planDiscounts);
              const cyclesUsd = buildCycleOptions(
                derivedPlan.price_monthly_usd || PLAN_MONTHLY_USD_DEFAULT,
                derivedPlan,
                'USD',
                planDiscounts
              );
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

      <section className="group motion-card-rich motion-hover-lift relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 backdrop-blur-sm">
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
              plan={derivedPrimaryPlan}
              planDiscounts={planDiscounts}
              conversationMetrics={previewMetrics}
              showGst
              currency="INR"
            />
          )}
        </div>
      </section>

      {showForm
        ? createPortal(
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="plan-form-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
                aria-label="Close plan form"
                onClick={closeForm}
              />
              <div className="relative z-[1] flex w-full max-w-3xl max-h-[min(88vh,900px)] flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xl ring-1 ring-black/5">
                <div className="shrink-0 px-4 py-4 sm:px-5 border-b border-sky-100/90 bg-gradient-to-r from-sky-50 via-white to-blue-50 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 id="plan-form-title" className="text-base sm:text-lg font-bold text-gray-900">
                      {form.id ? 'Edit plan' : 'Add plan'}
                    </h4>
                    <p className="text-xs text-gray-500 mt-0.5">Set monthly, quarterly &amp; yearly pricing and unlimited features</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeForm}
                    className="shrink-0 rounded-xl p-2 text-gray-500 hover:bg-white border border-transparent hover:border-gray-200 transition"
                    aria-label="Close"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <form onSubmit={onSave} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div
                    ref={planFormScrollRef}
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5 space-y-4"
                  >
              <section className="rounded-xl border border-gray-200/80 bg-white p-4 space-y-3 shadow-sm">
                <h5 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Basic details</h5>
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
              </section>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4 space-y-3 ring-1 ring-sky-100/80 min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-sky-800">Billing prices (INR)</p>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Monthly base (₹ /project /mo)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={form.price_monthly}
                    onChange={(e) =>
                      setForm((current) =>
                        applyPerProjectMonthlyToForm(current, 'monthly', e.target.value, 'INR', planDiscounts)
                      )
                    }
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-sky-100 bg-white/80 p-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700/80">Quarterly (auto)</p>
                    <p className="mt-1 text-sm font-bold text-gray-900">
                      ₹ {formatInr(discountedMonthlyRate(Number(form.price_monthly) || 0, 'quarterly', planDiscounts))}
                      <span className="text-xs font-semibold text-gray-500"> /project /mo</span>
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      Total: ₹ {formatInr(computeQuarterlyFromMonthly(Number(form.price_monthly) || 0, planDiscounts))} /quarter
                      {discountCfg.quarterlyPercent > 0 ? ` (−${discountCfg.quarterlyPercent}%)` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700/80">Yearly (auto)</p>
                    <p className="mt-1 text-sm font-bold text-gray-900">
                      ₹ {formatInr(discountedMonthlyRate(Number(form.price_monthly) || 0, 'yearly', planDiscounts))}
                      <span className="text-xs font-semibold text-gray-500"> /project /mo</span>
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      Total: ₹ {formatInr(computeYearlyFromMonthly(Number(form.price_monthly) || 0, planDiscounts))} /year
                      {discountCfg.yearlyPercent > 0 ? ` (−${discountCfg.yearlyPercent}%)` : ''}
                    </p>
                  </div>
                </div>

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
                    Auto-calculate quarterly &amp; yearly from monthly using offer percentages
                  </span>
                </label>

                {!form.autoDerivePrices ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-600">Manual quarterly total (₹)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.price_quarterly}
                        onChange={(e) => setForm((f) => ({ ...f, price_quarterly: e.target.value }))}
                        className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm bg-white focus:border-sky-400 outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-gray-600">Manual yearly total (₹)</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.price_yearly}
                        onChange={(e) => setForm((f) => ({ ...f, price_yearly: e.target.value }))}
                        className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm bg-white focus:border-sky-400 outline-none"
                      />
                    </label>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3 ring-1 ring-indigo-100/80 min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">Billing prices (USD)</p>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Billing cycle</span>
                  <select
                    value={planPriceCycleUsd}
                    onChange={(e) => setPlanPriceCycleUsd(e.target.value)}
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none"
                  >
                    {PLAN_BILLING_CYCLES.map((cycle) => (
                      <option key={cycle.value} value={cycle.value}>
                        {cycle.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Price per project / month ($)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={getPerProjectMonthlyFromForm(form, planPriceCycleUsd, 'USD')}
                    onChange={(e) =>
                      setForm((current) =>
                        applyPerProjectMonthlyToForm(
                          current,
                          planPriceCycleUsd,
                          e.target.value,
                          'USD',
                          planDiscounts
                        )
                      )
                    }
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none"
                  />
                </label>
                <p className="text-[11px] text-gray-500">
                  Total billed per project: ${formatUsd(getBillingTotalFromForm(form, planPriceCycleUsd, 'USD'))}
                  {planPriceCycleUsd === 'monthly'
                    ? ' / month'
                    : planPriceCycleUsd === 'quarterly'
                      ? ' / quarter'
                      : ' / year'}
                </p>

                {planPriceCycleUsd === 'monthly' ? (
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
                ) : null}
              </div>
              </div>

              <section className="rounded-xl border border-gray-200/80 bg-white p-4 space-y-3 shadow-sm">
                <h5 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Limits &amp; trial</h5>
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
              </section>

              <section className="rounded-xl border border-gray-200/80 bg-white p-4 space-y-3 shadow-sm">
                <div>
                  <h5 className="text-sm font-bold text-gray-900">Plan features</h5>
                  <p className="text-[10px] text-gray-500 mt-0.5">One per line — shown on monthly, quarterly &amp; yearly</p>
                </div>
              <label className="block">
                <span className="sr-only">Plan features</span>
                <textarea rows={6} value={form.featuresText} onChange={(e) => setForm((f) => ({ ...f, featuresText: e.target.value }))} className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 outline-none resize-y min-h-[120px]" />
                <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2 text-[11px] leading-relaxed text-gray-500">
                  Use one feature per line. Unlimited: <strong>Unlimited Agents</strong>. Limited:{' '}
                  <strong>1 Agent</strong>, <strong>can create 1 agent only</strong>,{' '}
                  <strong>2 Agents</strong>, <strong>3 Campaigns</strong>, <strong>5 Templates</strong>,{' '}
                  <strong>2 Flows</strong>, <strong>100 Contacts</strong>. Set <strong>Users limit</strong> only when
                  agents are not listed in features (leave at 0 if you use feature lines). Empty plan features = unlimited for all resources.
                  Limits apply from the active plan in Super Admin (or the plan assigned to the project).
                </div>
              </label>
              </section>

              <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-gray-800">Publish on admin Get Plan</span>
              </label>
              </div>

              <div className="shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-gray-100 bg-white px-4 py-3 sm:px-5">
                <button type="button" onClick={closeForm} className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-md disabled:opacity-50">
                  {saving ? 'Saving…' : form.id ? 'Update plan' : 'Create plan'}
                </button>
              </div>
            </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </SuperAdminPage>
  );
}

export default SuperAdminPlansPanel;
