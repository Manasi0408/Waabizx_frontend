import { getApiUrl, getApiOrigin } from '../utils/apiBase';
// const API_BASE = (process.env.REACT_APP_API_URL || 'https://wabizx.techwhizzc.com').replace(/\/$/, '');
const API_BASE = getApiOrigin();
const API_URL = `${API_BASE}/api`;

const getToken = () => {
  return localStorage.getItem('token');
};

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

const buildHeaders = (token) => {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
  const projectId = getSelectedProjectId();
  if (projectId) {
    headers['x-project-id'] = projectId;
  }
  return headers;
};

// Delete message
export const deleteMessage = async (messageId) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      headers: buildHeaders(token)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to delete message');
    return data;
  } catch (error) {
    throw error;
  }
};

// Forward message
export const forwardMessage = async (messageId, contactIds) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/messages/${encodeURIComponent(messageId)}/forward`, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ contactIds })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to forward message');
    return data;
  } catch (error) {
    throw error;
  }
};

// Add reaction
export const addReaction = async (messageId, emoji) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/messages/${encodeURIComponent(messageId)}/reaction`, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify({ emoji })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to add reaction');
    return data;
  } catch (error) {
    throw error;
  }
};

// Search messages
export const searchMessages = async (contactId, query, limit = 50, offset = 0) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/messages/search?contactId=${contactId}&query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: buildHeaders(token)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to search messages');
    return data;
  } catch (error) {
    throw error;
  }
};

// Get paginated messages
export const getPaginatedMessages = async (contactId, page = 1, limit = 50, phone = '') => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });
    if (contactId != null && String(contactId).trim() !== '') {
      params.set('contactId', String(contactId));
    }
    if (phone) {
      params.set('phone', String(phone));
    }

    const response = await fetch(`${API_URL}/messages/paginated?${params.toString()}`, {
      method: 'GET',
      headers: buildHeaders(token)
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch messages');
    return data;
  } catch (error) {
    throw error;
  }
};

// Send template message
export const sendTemplateMessage = async (
  phone,
  templateName,
  templateLanguage = 'en_US',
  templateParams = [],
  headerMediaUrl = null
) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const payload = {
      phone,
      templateName,
      templateLanguage,
      templateParams,
    };
    if (headerMediaUrl) {
      payload.headerMediaUrl = headerMediaUrl;
    }

    const response = await fetch(`${API_URL}/messages/send-template`, {
      method: 'POST',
      headers: buildHeaders(token),
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || data.success === false) {
      let errorMsg =
        data.msg ||
        data.message ||
        data.error ||
        (data.wabaUnverified
          ? 'WhatsApp Business Account is not verified yet. Complete Meta Business Verification and WhatsApp number setup, then retry.'
          : 'Failed to send template');
      if (typeof errorMsg !== 'string') {
        errorMsg = errorMsg?.message || JSON.stringify(errorMsg);
      }
      console.error('Template send error:', { status: response.status, data });
      throw new Error(errorMsg);
    }
    if (data.wccCredits != null && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('wcc-quota-updated', {
          detail: { wccCredits: Number(data.wccCredits) },
        })
      );
    }
    return data;
  } catch (error) {
    throw error;
  }
};

