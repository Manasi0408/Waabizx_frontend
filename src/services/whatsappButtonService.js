import axios from '../api/axios';

export const fetchWhatsAppButtons = async () => {
  const res = await axios.get('/whatsapp-buttons');
  return {
    buttons: Array.isArray(res?.data?.buttons) ? res.data.buttons : [],
    used: Number(res?.data?.used) || 0,
  };
};

export const createWhatsAppButton = async (payload) => {
  const res = await axios.post('/whatsapp-buttons', payload);
  return res?.data?.button;
};

export const deleteWhatsAppButton = async (id) => {
  const res = await axios.delete(`/whatsapp-buttons/${id}`);
  return res?.data;
};
