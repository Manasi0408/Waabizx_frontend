import axios from '../api/axios';

export const fetchTags = async () => {
  const res = await axios.get('/tags');
  return Array.isArray(res?.data?.tags) ? res.data.tags : [];
};

export const createTag = async ({ name, color }) => {
  const res = await axios.post('/tags', { name, color });
  return res?.data?.tag;
};

export const updateTag = async (id, { name, color }) => {
  const res = await axios.put(`/tags/${id}`, { name, color });
  return res?.data?.tag;
};

export const deleteTag = async (id) => {
  const res = await axios.delete(`/tags/${id}`);
  return res?.data;
};

export const fetchContactTags = async ({ contactId, phone }) => {
  const params = new URLSearchParams();
  if (phone) params.set('phone', phone);
  const idPart = contactId ? String(contactId) : '0';
  const qs = params.toString();
  const res = await axios.get(`/contact/${idPart}/tags${qs ? `?${qs}` : ''}`);
  return Array.isArray(res?.data?.tags) ? res.data.tags : [];
};

export const assignContactTag = async ({ contactId, tagId, phone }) => {
  const res = await axios.post('/contact-tags', { contactId, tagId, phone });
  return res?.data;
};

export const removeContactTag = async ({ contactId, tagId, phone }) => {
  const res = await axios.delete('/contact-tags', { data: { contactId, tagId, phone } });
  return res?.data;
};

export const addCampaignContactsByTags = async (campaignId, { tags, variable_mapping }) => {
  const res = await axios.post(`/campaigns/${campaignId}/contacts`, {
    tags,
    variable_mapping,
  });
  return res?.data;
};
