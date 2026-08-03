import axios from '../api/axios';

export const CHANNELS = ['whatsapp', 'rcs', 'sms'];

export const getRcsChannels = async () => {
  const res = await axios.get('/rcs/channels');
  return res?.data;
};

export const getRcsSettings = async () => {
  const res = await axios.get('/rcs/settings');
  return res?.data?.settings;
};

export const updateRcsSettings = async (payload) => {
  const res = await axios.put('/rcs/settings', payload);
  return res?.data?.settings;
};

export const sendRcsMessage = async (payload) => {
  const res = await axios.post('/rcs/send', payload);
  return res?.data;
};

export const fetchRcsConversations = async () => {
  const res = await axios.get('/rcs/conversations');
  return Array.isArray(res?.data?.conversations) ? res.data.conversations : [];
};

export const fetchRcsMessages = async ({ phone, contactId } = {}) => {
  const params = new URLSearchParams();
  if (phone) params.set('phone', phone);
  if (contactId) params.set('contactId', String(contactId));
  const qs = params.toString();
  const res = await axios.get(`/rcs/messages${qs ? `?${qs}` : ''}`);
  return Array.isArray(res?.data?.messages) ? res.data.messages : [];
};

export const mockRcsWebhook = async ({ messageId, status }) => {
  const res = await axios.post('/rcs/mock-webhook', { messageId, status });
  return res?.data;
};

export const rcsButtonClick = async ({ messageId, buttonText, id }) => {
  const res = await axios.post('/rcs/button-click', { messageId, buttonText, id });
  return res?.data;
};

export const fetchRcsStats = async (channel = 'rcs') => {
  const res = await axios.get(`/rcs/stats?channel=${encodeURIComponent(channel)}`);
  return res?.data?.stats || { sent: 0, delivered: 0, read: 0, failed: 0, clicked: 0 };
};

export const seedRcsStats = async () => {
  const res = await axios.post('/rcs/stats/seed');
  return res?.data?.stats;
};

export const seedRcsInbox = async () => {
  const res = await axios.post('/rcs/inbox/seed');
  return res?.data?.conversations || [];
};

export const fetchRcsTemplates = async () => {
  const res = await axios.get('/rcs/templates');
  return Array.isArray(res?.data?.templates) ? res.data.templates : [];
};

export const createRcsTemplate = async (payload) => {
  const res = await axios.post('/rcs/templates', payload);
  return res?.data?.template;
};

export const fetchRcsCampaigns = async () => {
  const res = await axios.get('/rcs/campaigns');
  return Array.isArray(res?.data?.campaigns) ? res.data.campaigns : [];
};

export const createRcsCampaign = async (payload) => {
  const res = await axios.post('/rcs/campaigns', payload);
  return res?.data?.campaign;
};

export const sendRcsCampaign = async (id, payload = {}) => {
  const res = await axios.post(`/rcs/campaigns/${id}/send`, payload);
  return res?.data;
};
