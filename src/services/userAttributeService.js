import axios from '../api/axios';

export const fetchUserAttributes = async () => {
  const res = await axios.get('/user-attributes');
  return Array.isArray(res?.data?.attributes) ? res.data.attributes : [];
};

export const saveUserAttributes = async (attributes) => {
  const res = await axios.post('/user-attributes/save', { attributes });
  return Array.isArray(res?.data?.attributes) ? res.data.attributes : [];
};
