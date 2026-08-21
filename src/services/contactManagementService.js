import { getApiUrl, getApiOrigin } from '../utils/apiBase';
// const API_URL = 'https://wabizx.techwhizzc.com/api';
const API_URL = getApiUrl();

const getToken = () => {
  return localStorage.getItem('token');
};

// Update contact
export const updateContact = async (contactId, updates) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/contact-management/${contactId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update contact');
    return data;
  } catch (error) {
    throw error;
  }
};

// Get contact history
export const getContactHistory = async (contactId, limit = 100) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/contact-management/${contactId}/history?limit=${limit}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch contact history');
    return data;
  } catch (error) {
    throw error;
  }
};

// Update typing status
export const updateTypingStatus = async (contactId, isTyping) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/contact-management/typing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ contactId, isTyping })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update typing status');
    return data;
  } catch (error) {
    throw error;
  }
};

// Update online status
export const updateOnlineStatus = async (contactId, isOnline) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/contact-management/online`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ contactId, isOnline })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update online status');
    return data;
  } catch (error) {
    throw error;
  }
};

