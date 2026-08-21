import axios from '../api/axios';

export const fetchActivePlans = async () => {
  const res = await axios.get('/plans');
  const data = res?.data || {};
  const plans = Array.isArray(data?.plans) ? data.plans : Array.isArray(data) ? data : [];
  return {
    plans,
    country: data.country || 'IN',
    currency: data.currency || 'INR',
    discounts: data.discounts || null,
  };
};

export const fetchAdminPlans = async () => {
  const res = await axios.get('/admin/plans');
  return {
    plans: Array.isArray(res?.data?.plans) ? res.data.plans : [],
    discounts: res?.data?.discounts || null,
  };
};

export const fetchAdminPlanDiscounts = async () => {
  const res = await axios.get('/admin/plan-discounts');
  return res?.data?.discounts || { quarterlyPercent: 10, yearlyPercent: 15 };
};

export const updateAdminPlanDiscounts = async (payload) => {
  const res = await axios.put('/admin/plan-discounts', payload);
  return res?.data?.discounts || payload;
};

export const createPlan = async (payload) => {
  const res = await axios.post('/admin/plans', payload);
  return res?.data;
};

export const updatePlan = async (id, payload) => {
  const res = await axios.put(`/admin/plans/${id}`, payload);
  return res?.data;
};

export const deletePlan = async (id) => {
  const res = await axios.delete(`/admin/plans/${id}`);
  return res?.data;
};

export const fetchConversationMetrics = async () => {
  const res = await axios.get('/conversation-metrics');
  return {
    metrics: Array.isArray(res?.data?.metrics) ? res.data.metrics : [],
    rates: res?.data?.rates && typeof res.data.rates === 'object' ? res.data.rates : {},
    country: res?.data?.country || 'IN',
    currency: res?.data?.currency || 'INR',
  };
};

export const fetchAdminConversationMetrics = async () => {
  const res = await axios.get('/admin/conversation-metrics');
  return {
    metrics: Array.isArray(res?.data?.metrics) ? res.data.metrics : [],
    rates: res?.data?.rates && typeof res.data.rates === 'object' ? res.data.rates : {},
    config: res?.data?.config && typeof res.data.config === 'object' ? res.data.config : {},
  };
};

export const updateConversationMetrics = async (payload) => {
  const res = await axios.put('/admin/conversation-metrics', payload);
  return {
    metrics: Array.isArray(res?.data?.metrics) ? res.data.metrics : [],
    rates: res?.data?.rates && typeof res.data.rates === 'object' ? res.data.rates : {},
  };
};

export const fetchAdminWhatsappPricing = async () => {
  const res = await axios.get('/admin/whatsapp-pricing');
  return {
    countries: Array.isArray(res?.data?.countries) ? res.data.countries : [],
    categories: Array.isArray(res?.data?.categories) ? res.data.categories : [],
    fxRates: res?.data?.fxRates && typeof res.data.fxRates === 'object' ? res.data.fxRates : {},
    exchangeRates: Array.isArray(res?.data?.exchangeRates) ? res.data.exchangeRates : [],
  };
};

export const updateAdminWhatsappPricing = async (payload) => {
  const res = await axios.put('/admin/whatsapp-pricing', payload);
  return {
    countries: Array.isArray(res?.data?.countries) ? res.data.countries : [],
    categories: Array.isArray(res?.data?.categories) ? res.data.categories : [],
    fxRates: res?.data?.fxRates && typeof res.data.fxRates === 'object' ? res.data.fxRates : {},
    exchangeRates: Array.isArray(res?.data?.exchangeRates) ? res.data.exchangeRates : [],
  };
};

export const testWccPrice = async ({ countryCode, category = 'UTILITY', walletCurrency = 'INR' }) => {
  const res = await axios.post('/wcc/test-price', { countryCode, category, walletCurrency });
  return res.data;
};
