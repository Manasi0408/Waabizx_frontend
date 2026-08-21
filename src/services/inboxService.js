import { getApiUrl, getApiOrigin } from '../utils/apiBase';
// const API_BASE = (process.env.REACT_APP_API_URL || 'https://wabizx.techwhizzc.com').replace(/\/$/, '');
const API_BASE = getApiOrigin();
const API_URL = `${API_BASE}/api`;

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Get currently selected project id from localStorage
const getSelectedProjectId = () => {
  try {
    const raw = localStorage.getItem('selectedProject');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const id = parsed?.id;
    return id != null && String(id).trim() !== '' ? String(id) : null;
  } catch (e) {
    return null;
  }
};

const buildHeaders = () => {
  const token = getToken();
  const projectId = getSelectedProjectId();
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  if (projectId) {
    headers['x-project-id'] = projectId;
  }
  return headers;
};

// Get inbox chat list
export const getInboxList = async () => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/inbox`, {
      method: 'GET',
      headers: buildHeaders()
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch inbox list');
    }

    if (data.success) {
      return data.inbox || [];
    }

    throw new Error(data.message || 'Failed to fetch inbox list');
  } catch (error) {
    throw error;
  }
};

// Get messages of a contact by phone
export const getContactMessages = async (phone) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    // Don't double-encode: Express will handle URL encoding automatically
    // Just replace + with %2B manually to avoid double encoding
    const safePhone = phone.replace(/\+/g, '%2B');
    const response = await fetch(`${API_URL}/inbox/${safePhone}/messages`, {
      method: 'GET',
      headers: buildHeaders()
    });

    const data = await response.json();

    if (!response.ok) {
      // 404 is expected if contact doesn't exist yet - don't log as error
      if (response.status === 404) {
        throw new Error('Contact not found');
      }
      console.error('getContactMessages API error:', {
        status: response.status,
        statusText: response.statusText,
        data: data
      });
      throw new Error(data.error || data.message || 'Failed to fetch messages');
    }

    if (data.success) {
      return {
        contact: data.contact,
        messages: data.messages || []
      };
    }

    throw new Error(data.message || 'Failed to fetch messages');
  } catch (error) {
    // Don't log 404 errors as they're expected when contact doesn't exist
    if (!error.message.includes('Contact not found')) {
      console.error('Error in getContactMessages:', error);
    }
    throw error;
  }
};

// Send message from inbox
export const sendMessage = async (phone, text) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/inbox/send`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({ phone, text })
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      const errText =
        (typeof data.message === 'string' && data.message) ||
        data.error ||
        data.messageRecord?.errorMessage ||
        `Failed to send message (${response.status})`;
      console.error('sendMessage (inbox) API error:', {
        status: response.status,
        statusText: response.statusText,
        data: data
      });
      throw new Error(errText);
    }

    const msg = data.message;
    if (msg && String(msg.status || '').toLowerCase() === 'failed') {
      throw new Error(msg.errorMessage || 'Failed to send message');
    }

    if (data.success) {
      return {
        ...data.message,
        sentViaTemplate: !!data.sentViaTemplate,
        templateName: data.templateName || data.message?.templateName,
      };
    }

    throw new Error(typeof data.message === 'string' ? data.message : 'Failed to send message');
  } catch (error) {
    console.error('Error in sendMessage (inbox):', error);
    throw error;
  }
};

// Mark messages as read for a contact
export const markAsRead = async (phone) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    // Don't double-encode: Express will handle URL encoding automatically
    // Just replace + with %2B manually to avoid double encoding
    const safePhone = phone.replace(/\+/g, '%2B');
    const response = await fetch(`${API_URL}/inbox/${safePhone}/read`, {
      method: 'PUT',
      headers: buildHeaders()
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to mark as read');
    }

    return data.success;
  } catch (error) {
    throw error;
  }
};

const safePhonePath = (phone) => String(phone || '').replace(/\+/g, '%2B');

export const getContactCampaigns = async (phone) => {
  const response = await fetch(`${API_URL}/inbox/${safePhonePath(phone)}/campaigns`, {
    method: 'GET',
    headers: buildHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Failed to fetch contact campaigns');
  }
  return Array.isArray(data.campaigns) ? data.campaigns : [];
};

export const getContactPayments = async (phone) => {
  const response = await fetch(`${API_URL}/inbox/${safePhonePath(phone)}/payments`, {
    method: 'GET',
    headers: buildHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || data.message || 'Failed to fetch contact payments');
  }
  return Array.isArray(data.payments) ? data.payments : [];
};

