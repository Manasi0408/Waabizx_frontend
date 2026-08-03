export const PLAN_MONTHLY_DEFAULT = 750;
export const QUARTERLY_DISCOUNT = 0.1;
export const YEARLY_DISCOUNT = 0.15;

export const PLAN_DISCOUNT_LABEL = {
  monthly: '',
  quarterly: '10% Off',
  yearly: '15% Off',
};

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
  { label: 'Marketing', text: 'Rs. 0.95 /msg', key: 'marketing' },
  { label: 'Utility', text: 'Rs. 0.150 /msg', key: 'utility' },
  { label: 'Authentication', text: 'Rs. 0.129 /msg', key: 'authentication' },
  { label: 'Service', text: 'Free up to 10 agents', key: 'service' },
];

export const MESSAGE_CATEGORY_RATES = {
  marketing: 0.95,
  utility: 0.15,
  authentication: 0.129,
  service: 0,
};

const GST_RATE = 0.18;

export const formatInr = (value) =>
  Number(value).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

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

export function getMessageRateForBillingCategory(category) {
  const key = normalizeTemplateBillingCategory(category) || String(category || 'marketing').toLowerCase();
  return MESSAGE_CATEGORY_RATES[key] ?? MESSAGE_CATEGORY_RATES.marketing;
}

export function estimateCampaignMessageCost(recipientCount, templateOrCategory) {
  const count = Math.max(0, Number(recipientCount) || 0);
  const category =
    typeof templateOrCategory === 'string'
      ? normalizeTemplateBillingCategory(templateOrCategory) || 'marketing'
      : resolveTemplateBillingCategory(templateOrCategory);
  const rate = getMessageRateForBillingCategory(category);
  return Math.round(count * rate * 100) / 100;
}

export function getBillingCategoryLabel(category) {
  const key = normalizeTemplateBillingCategory(category) || String(category || 'marketing').toLowerCase();
  const match = CONVERSATION_METRICS.find((m) => m.key === key);
  return match?.label || 'Marketing';
}

export const discountedMonthlyRate = (monthly, cycle) => {
  const m = Math.max(0, Number(monthly) || 0);
  if (cycle === 'quarterly') return Math.round(m * (1 - QUARTERLY_DISCOUNT) * 100) / 100;
  if (cycle === 'yearly') return Math.round(m * (1 - YEARLY_DISCOUNT) * 100) / 100;
  return m;
};

export const cycleBillingAmount = (monthly, cycle) => {
  const m = Math.max(0, Number(monthly) || 0);
  if (cycle === 'quarterly') return Math.round(discountedMonthlyRate(m, 'quarterly') * 3 * 100) / 100;
  if (cycle === 'yearly') return Math.round(discountedMonthlyRate(m, 'yearly') * 12 * 100) / 100;
  return m;
};

export const computeQuarterlyFromMonthly = (monthly) => cycleBillingAmount(monthly, 'quarterly');
export const computeYearlyFromMonthly = (monthly) => cycleBillingAmount(monthly, 'yearly');

export const withDerivedPricesFromMonthly = (monthly) => {
  const m = String(monthly ?? '');
  const monthlyNum = Number(m) || 0;
  return {
    price_monthly: m,
    price_quarterly: computeQuarterlyFromMonthly(monthlyNum),
    price_yearly: computeYearlyFromMonthly(monthlyNum),
  };
};

export const gstAmount = (base) =>
  Math.round(Math.max(0, Number(base) || 0) * GST_RATE * 100) / 100;

export const payableWithGst = (base) => {
  const b = Math.max(0, Number(base) || 0);
  return Math.round((b + gstAmount(b)) * 100) / 100;
};

/** Billing totals always follow monthly + cycle discount (−10% / −15%). */
export const resolvePlanBillingAmount = (plan, cycle) => {
  const monthly = Math.max(0, Number(plan?.price_monthly) || PLAN_MONTHLY_DEFAULT);
  return cycleBillingAmount(monthly, cycle);
};

export const buildCycleOptions = (monthly, plan = null) => {
  const baseMonthly = Math.max(0, Number(monthly) || Number(plan?.price_monthly) || PLAN_MONTHLY_DEFAULT);
  return ['monthly', 'quarterly', 'yearly'].map((cycle) => {
    const billingAmount = cycleBillingAmount(baseMonthly, cycle);
    const discountedMonthly = discountedMonthlyRate(baseMonthly, cycle);
    const savings =
      cycle === 'monthly'
        ? 0
        : Math.round((baseMonthly - discountedMonthly) * (cycle === 'quarterly' ? 3 : 12) * 100) / 100;

    let billingNote = 'Billed monthly recurring base subscription.';
    if (cycle === 'quarterly') {
      billingNote = `Billed Rs. ${formatInr(billingAmount)} quarterly (−10% Applied)`;
    } else if (cycle === 'yearly') {
      billingNote = `Billed Rs. ${formatInr(billingAmount)} annually (−15% Applied)`;
    }

    return {
      cycle,
      label: cycle.charAt(0).toUpperCase() + cycle.slice(1),
      billingAmount,
      discountedMonthly,
      savings,
      discountLabel: PLAN_DISCOUNT_LABEL[cycle],
      periodLabel: cycle === 'monthly' ? 'month' : cycle === 'quarterly' ? 'quarter' : 'year',
      months: cycle === 'monthly' ? 1 : cycle === 'quarterly' ? 3 : 12,
      perProjectLabel: `Rs. ${formatInr(discountedMonthly)} /project /mo`,
      billingNote,
    };
  });
};

export const buildPricingBreakdown = (monthly, cycle, plan = null) => {
  const baseMonthly = Math.max(0, Number(monthly) || Number(plan?.price_monthly) || PLAN_MONTHLY_DEFAULT);
  const billingAmount = cycleBillingAmount(baseMonthly, cycle);
  const gst = gstAmount(billingAmount);
  const total = payableWithGst(billingAmount);

  if (cycle === 'monthly') {
    return {
      baseMonthly,
      billingAmount,
      gst,
      total,
      lines: [
        { label: 'Monthly plan price', value: baseMonthly },
        { label: 'GST (18%)', value: gst, muted: true },
      ],
      summary: 'Billed monthly recurring base subscription.',
    };
  }

  if (cycle === 'quarterly') {
    const discounted = discountedMonthlyRate(baseMonthly, 'quarterly');
    return {
      baseMonthly,
      discountedMonthly: discounted,
      billingAmount,
      gst,
      total,
      lines: [
        { label: 'Monthly base price', value: baseMonthly },
        { label: 'After 10% discount', value: discounted, highlight: true },
        { label: 'Quarterly total (× 3 months)', value: billingAmount },
        { label: 'GST (18%)', value: gst, muted: true },
      ],
      summary: `Billed Rs. ${formatInr(billingAmount)} quarterly (−10% Applied)`,
    };
  }

  const discounted = discountedMonthlyRate(baseMonthly, 'yearly');
  return {
    baseMonthly,
    discountedMonthly: discounted,
    billingAmount,
    gst,
    total,
    lines: [
      { label: 'Monthly base price', value: baseMonthly },
      { label: 'After 15% discount', value: discounted, highlight: true },
      { label: 'Yearly total (× 12 months)', value: billingAmount },
      { label: 'GST (18%)', value: gst, muted: true },
    ],
    summary: `Billed Rs. ${formatInr(billingAmount)} annually (−15% Applied)`,
  };
};
