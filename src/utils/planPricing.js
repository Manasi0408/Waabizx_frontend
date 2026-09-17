export const PLAN_MONTHLY_DEFAULT = 750;
export const QUARTERLY_DISCOUNT = 0.1;
export const YEARLY_DISCOUNT = 0.15;

/** Resolve admin-configurable billing cycle discount percentages. */
export const resolveDiscountConfig = (discounts) => {
  const q = Number(discounts?.quarterlyPercent);
  const y = Number(discounts?.yearlyPercent);
  const quarterlyPercent = Number.isFinite(q) ? Math.min(100, Math.max(0, q)) : QUARTERLY_DISCOUNT * 100;
  const yearlyPercent = Number.isFinite(y) ? Math.min(100, Math.max(0, y)) : YEARLY_DISCOUNT * 100;
  return {
    quarterlyPercent,
    yearlyPercent,
    quarterlyRate: quarterlyPercent / 100,
    yearlyRate: yearlyPercent / 100,
  };
};

export const buildPlanDiscountLabels = (discounts) => {
  const cfg = resolveDiscountConfig(discounts);
  return {
    monthly: '',
    quarterly: cfg.quarterlyPercent > 0 ? `${cfg.quarterlyPercent}% Off` : '',
    yearly: cfg.yearlyPercent > 0 ? `${cfg.yearlyPercent}% Off` : '',
  };
};

export const PLAN_DISCOUNT_LABEL = buildPlanDiscountLabels();

export const PLAN_HIGHLIGHTS = [
  'Unlimited Agents',
  'Unlimited Campaigns',
  'Unlimited Templates',
  'Unlimited Flows',
  'Unlimited Contacts',
  'Multi Agent Live Chat',
  'FREE WhatsApp Business Platform Onboarding',
  'Pay-as-you-go conversation delivery',
  'Full Developer API access & dashboard management',
];

export const CONVERSATION_METRICS = [
  { label: 'Marketing', text: 'Rs. 0.95 /msg', key: 'marketing', rate: 0.95, rate_usd: 0.012 },
  { label: 'Utility', text: 'Rs. 0.150 /msg', key: 'utility', rate: 0.15, rate_usd: 0.002 },
  { label: 'Authentication', text: 'Rs. 0.129 /msg', key: 'authentication', rate: 0.129, rate_usd: 0.0016 },
  { label: 'Service', text: 'Free up to 10 agents', key: 'service', rate: 0, rate_usd: 0 },
];

export const MESSAGE_CATEGORY_RATES = {
  marketing: 0.95,
  utility: 0.15,
  authentication: 0.129,
  service: 0,
};

export const formatConversationRateText = (rate, currency = 'INR') => {
  const n = Math.max(0, Number(rate) || 0);
  const formatted = Number.isInteger(n)
    ? String(n)
    : parseFloat(n.toFixed(4)).toString();
  if (String(currency).toUpperCase() === 'USD') {
    return `$${formatted} /msg`;
  }
  return `Rs. ${formatted} /msg`;
};

export const buildAdminMetricsPreview = (config = {}) =>
  CONVERSATION_METRICS.map((metric) => {
    const cfg = config[metric.key] || {};
    const rate = Math.max(0, Number(cfg.rate ?? metric.rate) || 0);
    const rateUsd = Math.max(0, Number(cfg.rate_usd ?? metric.rate_usd) || 0);
    if (metric.key === 'service') {
      return {
        key: metric.key,
        label: cfg.label || metric.label,
        rate,
        rate_usd: rateUsd,
        text:
          rate > 0
            ? formatConversationRateText(rate, 'INR')
            : String(cfg.text || metric.text).trim() || metric.text,
      };
    }
    return {
      key: metric.key,
      label: cfg.label || metric.label,
      rate,
      rate_usd: rateUsd,
      text:
        rateUsd > 0
          ? `${formatConversationRateText(rate, 'INR')} · ${formatConversationRateText(rateUsd, 'USD')}`
          : formatConversationRateText(rate, 'INR'),
    };
  });

export const buildConversationMetrics = (metrics = null, rates = null) => {
  if (Array.isArray(metrics) && metrics.length) {
    return metrics.map((metric) => {
      const rate = Math.max(0, Number(metric.rate) || 0);
      const rateUsd = Math.max(0, Number(metric.rate_usd) || 0);
      if (metric.key === 'service') {
        return {
          key: metric.key,
          label: metric.label || 'Service',
          rate,
          rate_usd: rateUsd,
          text:
            rate > 0
              ? formatConversationRateText(rate, 'INR')
              : String(metric.text || '').trim() ||
                CONVERSATION_METRICS.find((m) => m.key === 'service')?.text ||
                'Free',
        };
      }
      return {
        key: metric.key,
        label: metric.label,
        rate,
        rate_usd: rateUsd,
        text:
          rateUsd > 0
            ? `${formatConversationRateText(rate, 'INR')} · ${formatConversationRateText(rateUsd, 'USD')}`
            : formatConversationRateText(rate, 'INR'),
      };
    });
  }
  if (rates && typeof rates === 'object') {
    return buildAdminMetricsPreview(
      CONVERSATION_METRICS.reduce((acc, metric) => {
        const rate = Number(rates[metric.key]);
        if (Number.isFinite(rate)) {
          acc[metric.key] = { rate, rate_usd: metric.rate_usd };
        }
        return acc;
      }, {})
    );
  }
  return buildAdminMetricsPreview({});
};

export const buildMessageCategoryRates = (rates = null) => ({
  ...MESSAGE_CATEGORY_RATES,
  ...(rates && typeof rates === 'object' ? rates : {}),
});

const GST_RATE = 0.18;

export const formatInr = (value) =>
  Number(value).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const formatUsd = (value) =>
  Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const formatPlanAmount = (value, currency = 'INR') =>
  String(currency).toUpperCase() === 'USD'
    ? `$${formatUsd(value)}`
    : `₹ ${formatInr(value)}`;

export const isInrCurrency = (currency = 'INR') => String(currency).toUpperCase() !== 'USD';

export function normalizeTemplateBillingCategory(raw) {
  const c = String(raw || '').trim().toLowerCase();
  if (!c) return null;
  if (c === 'marketing' || c === 'promotional' || c === 'welcome') return 'marketing';
  if (c === 'utility' || c === 'transactional' || c === 'notification') return 'utility';
  if (c === 'authentication' || c === 'auth') return 'authentication';
  if (c === 'service') return 'service';
  return null;
}

export function resolveTemplateBillingCategory(template) {
  if (!template) return 'marketing';

  const meta = String(template.metaCategory || '').trim().toUpperCase();
  if (meta === 'AUTHENTICATION') return 'authentication';
  if (meta === 'UTILITY') return 'utility';
  if (meta === 'MARKETING') return 'marketing';
  if (meta === 'SERVICE') return 'service';

  const candidates = [
    template.category,
    template.variables?.metaCategory,
    template.variables?.category,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeTemplateBillingCategory(candidate);
    if (normalized) return normalized;
  }
  return 'marketing';
}

export function getMessageRateForBillingCategory(category, rates = MESSAGE_CATEGORY_RATES) {
  const key = normalizeTemplateBillingCategory(category) || String(category || 'marketing').toLowerCase();
  const resolvedRates = rates && typeof rates === 'object' ? rates : MESSAGE_CATEGORY_RATES;
  return resolvedRates[key] ?? resolvedRates.marketing ?? MESSAGE_CATEGORY_RATES.marketing;
}

export function estimateCampaignMessageCost(recipientCount, templateOrCategory, rates = MESSAGE_CATEGORY_RATES) {
  const count = Math.max(0, Number(recipientCount) || 0);
  const category =
    typeof templateOrCategory === 'string'
      ? normalizeTemplateBillingCategory(templateOrCategory) || 'marketing'
      : resolveTemplateBillingCategory(templateOrCategory);
  const resolvedRates = rates && typeof rates === 'object' ? rates : MESSAGE_CATEGORY_RATES;
  const rate = getMessageRateForBillingCategory(category, resolvedRates);
  return Math.round(count * rate * 100) / 100;
}

export function getBillingCategoryLabel(category, metrics = CONVERSATION_METRICS) {
  const key = normalizeTemplateBillingCategory(category) || String(category || 'marketing').toLowerCase();
  const match = metrics.find((m) => m.key === key);
  return match?.label || 'Marketing';
}

export const discountedMonthlyRate = (monthly, cycle, discounts = null) => {
  const m = Math.max(0, Number(monthly) || 0);
  const cfg = resolveDiscountConfig(discounts);
  if (cycle === 'quarterly') return Math.round(m * (1 - cfg.quarterlyRate) * 100) / 100;
  if (cycle === 'yearly') return Math.round(m * (1 - cfg.yearlyRate) * 100) / 100;
  return m;
};

export const cycleBillingAmount = (monthly, cycle, discounts = null) => {
  const m = Math.max(0, Number(monthly) || 0);
  if (cycle === 'quarterly') return Math.round(discountedMonthlyRate(m, 'quarterly', discounts) * 3 * 100) / 100;
  if (cycle === 'yearly') return Math.round(discountedMonthlyRate(m, 'yearly', discounts) * 12 * 100) / 100;
  return m;
};

export const computeQuarterlyFromMonthly = (monthly, discounts = null) =>
  cycleBillingAmount(monthly, 'quarterly', discounts);
export const computeYearlyFromMonthly = (monthly, discounts = null) =>
  cycleBillingAmount(monthly, 'yearly', discounts);

export const withDerivedPricesFromMonthly = (monthly, discounts = null) => {
  const m = String(monthly ?? '');
  const monthlyNum = Number(m) || 0;
  return {
    price_monthly: m,
    price_quarterly: computeQuarterlyFromMonthly(monthlyNum, discounts),
    price_yearly: computeYearlyFromMonthly(monthlyNum, discounts),
  };
};

export const gstAmount = (base) =>
  Math.round(Math.max(0, Number(base) || 0) * GST_RATE * 100) / 100;

export const payableWithGst = (base) => {
  const b = Math.max(0, Number(base) || 0);
  return Math.round((b + gstAmount(b)) * 100) / 100;
};

/** INR includes 18% GST; USD is tax-exclusive (pay subtotal as-is). */
export const resolvePayableAmount = (base, currency = 'INR') => {
  const b = Math.max(0, Number(base) || 0);
  return isInrCurrency(currency) ? payableWithGst(b) : Math.round(b * 100) / 100;
};

/** Billing totals prefer stored cycle prices, else monthly + cycle discount (−10% / −15%). */
export const resolvePlanBillingAmount = (plan, cycle, currency = 'INR') => {
  const isUsd = !isInrCurrency(currency);
  if (cycle === 'quarterly') {
    const quarterly = Number(isUsd ? plan?.price_quarterly_usd : plan?.price_quarterly);
    if (Number.isFinite(quarterly) && quarterly > 0) return quarterly;
  }
  if (cycle === 'yearly') {
    const yearly = Number(isUsd ? plan?.price_yearly_usd : plan?.price_yearly);
    if (Number.isFinite(yearly) && yearly > 0) return yearly;
  }
  const monthly = Math.max(
    0,
    Number(isUsd ? plan?.price_monthly_usd : plan?.price_monthly) ||
      (isUsd ? 10 : PLAN_MONTHLY_DEFAULT)
  );
  return cycleBillingAmount(monthly, cycle);
};

export const buildCycleOptions = (monthly, plan = null, currency = 'INR', discounts = null) => {
  const isUsd = !isInrCurrency(currency);
  const fmt = (v) => (isUsd ? `$${formatUsd(v)}` : `Rs. ${formatInr(v)}`);
  const baseMonthly = Math.max(0, Number(monthly) || Number(plan?.price_monthly) || PLAN_MONTHLY_DEFAULT);
  const discountLabels = buildPlanDiscountLabels(discounts);
  const cfg = resolveDiscountConfig(discounts);
  return ['monthly', 'quarterly', 'yearly'].map((cycle) => {
    const months = cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3 : 12;
    const billingAmount = plan
      ? resolvePlanBillingAmount(plan, cycle, currency)
      : cycleBillingAmount(baseMonthly, cycle, discounts);
    const discountedMonthly = Math.round((billingAmount / months) * 100) / 100;
    const baseMonthlyForSavings = Math.max(
      0,
      Number(isUsd ? plan?.price_monthly_usd : plan?.price_monthly) || baseMonthly
    );
    const savings =
      cycle === 'monthly'
        ? 0
        : Math.round((baseMonthlyForSavings - discountedMonthly) * months * 100) / 100;

    let billingNote = 'Billed monthly recurring base subscription.';
    if (cycle === 'quarterly') {
      billingNote = `Billed ${fmt(billingAmount)} quarterly${cfg.quarterlyPercent > 0 ? ` (−${cfg.quarterlyPercent}% Applied)` : ''}`;
    } else if (cycle === 'yearly') {
      billingNote = `Billed ${fmt(billingAmount)} annually${cfg.yearlyPercent > 0 ? ` (−${cfg.yearlyPercent}% Applied)` : ''}`;
    }

    return {
      cycle,
      label: cycle.charAt(0).toUpperCase() + cycle.slice(1),
      billingAmount,
      discountedMonthly,
      savings,
      discountLabel: discountLabels[cycle],
      periodLabel: cycle === 'monthly' ? 'month' : cycle === 'quarterly' ? 'quarter' : 'year',
      months: cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3 : 12,
      perProjectLabel: `${fmt(discountedMonthly)} /project /mo`,
      billingNote,
      currency: isUsd ? 'USD' : 'INR',
    };
  });
};

export const buildPricingBreakdown = (monthly, cycle, plan = null, currency = 'INR', discounts = null) => {
  const isUsd = !isInrCurrency(currency);
  const fmt = (v) => (isUsd ? `$${formatUsd(v)}` : `Rs. ${formatInr(v)}`);
  const baseMonthly = Math.max(0, Number(monthly) || Number(plan?.price_monthly) || PLAN_MONTHLY_DEFAULT);
  const billingAmount = cycleBillingAmount(baseMonthly, cycle, discounts);
  const gst = isUsd ? 0 : gstAmount(billingAmount);
  const total = isUsd ? billingAmount : payableWithGst(billingAmount);
  const cfg = resolveDiscountConfig(discounts);

  if (cycle === 'monthly') {
    return {
      baseMonthly,
      billingAmount,
      gst,
      total,
      currency: isUsd ? 'USD' : 'INR',
      lines: [
        { label: 'Monthly plan price', value: baseMonthly },
        ...(isUsd ? [] : [{ label: 'GST (18%)', value: gst, muted: true }]),
      ],
      summary: 'Billed monthly recurring base subscription.',
    };
  }

  if (cycle === 'quarterly') {
    const discounted = discountedMonthlyRate(baseMonthly, 'quarterly', discounts);
    return {
      baseMonthly,
      discountedMonthly: discounted,
      billingAmount,
      gst,
      total,
      currency: isUsd ? 'USD' : 'INR',
      lines: [
        { label: 'Monthly base price', value: baseMonthly },
        { label: `After ${cfg.quarterlyPercent}% discount`, value: discounted, highlight: true },
        { label: 'Quarterly total (× 3 months)', value: billingAmount },
        ...(isUsd ? [] : [{ label: 'GST (18%)', value: gst, muted: true }]),
      ],
      summary: `Billed ${fmt(billingAmount)} quarterly${cfg.quarterlyPercent > 0 ? ` (−${cfg.quarterlyPercent}% Applied)` : ''}`,
    };
  }

  const discounted = discountedMonthlyRate(baseMonthly, 'yearly', discounts);
  return {
    baseMonthly,
    discountedMonthly: discounted,
    billingAmount,
    gst,
    total,
    currency: isUsd ? 'USD' : 'INR',
    lines: [
      { label: 'Monthly base price', value: baseMonthly },
      { label: `After ${cfg.yearlyPercent}% discount`, value: discounted, highlight: true },
      { label: 'Yearly total (× 12 months)', value: billingAmount },
      ...(isUsd ? [] : [{ label: 'GST (18%)', value: gst, muted: true }]),
    ],
    summary: `Billed ${fmt(billingAmount)} annually${cfg.yearlyPercent > 0 ? ` (−${cfg.yearlyPercent}% Applied)` : ''}`,
  };
};
