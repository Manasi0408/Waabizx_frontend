// const API_URL = 'https://wabizx.techwhizzc.com';
const API_URL = 'https://api.waabizx.com';

// Get token from localStorage
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

// Get inbound messages
export const getInboundMessages = async (limit = 10, phone = null, since = null) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    let url = `${API_URL}/messages/inbound?limit=${limit}`;
    if (phone) {
      url += `&phone=${encodeURIComponent(phone)}`;
    }
    if (since) {
      url += `&since=${encodeURIComponent(since)}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders()
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch inbound messages');
    }

    if (data.success) {
      return data.messages || [];
    }

    throw new Error(data.message || 'Failed to fetch inbound messages');
  } catch (error) {
    throw error;
  }
};

// Send message via metaMessage API
export const sendMetaMessage = async (phone, text, type = 'text', template = null) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const payload = { phone, text };
    if (type === 'template' && template) {
      payload.type = 'template';
      payload.template = template;
    }

    const response = await fetch(`${API_URL}/messages/send`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('sendMetaMessage API error:', {
        status: response.status,
        statusText: response.statusText,
        data: data
      });
      throw new Error(data.error || data.message || `Failed to send message (${response.status})`);
    }

    if (data.success) {
      return data.data;
    }

    throw new Error(data.message || 'Failed to send message');
  } catch (error) {
    console.error('Error in sendMetaMessage:', error);
    throw error;
  }
};

// Get message status by ID
export const getMessageStatus = async (id) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/messages/status/${id}`, {
      method: 'GET',
      headers: buildHeaders()
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to get message status');
    }

    if (data.success) {
      return data.message;
    }

    throw new Error(data.message || 'Failed to get message status');
  } catch (error) {
    throw error;
  }
};

// Get all meta messages (inbound + outbound) by phone
export const getAllMetaMessages = async (phone, limit = 100, since = null) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    // URL encode phone number to handle special characters
    const encodedPhone = encodeURIComponent(phone);
    let url = `${API_URL}/messages/all?phone=${encodedPhone}&limit=${limit}`;
    if (since) {
      url += `&since=${encodeURIComponent(since)}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders()
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('getAllMetaMessages API error:', {
        status: response.status,
        statusText: response.statusText,
        data: data
      });
      throw new Error(data.error || data.message || 'Failed to fetch meta messages');
    }

    if (data.success) {
      console.log('getAllMetaMessages success:', data.count, 'messages');
      return data.messages || [];
    }

    throw new Error(data.message || 'Failed to fetch meta messages');
  } catch (error) {
    console.error('Error in getAllMetaMessages:', error);
    throw error;
  }
};

// Get webhook logs
export const getWebhookLogs = async (limit = 50, event_type = null, phone = null) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    let url = `${API_URL}/webhook/logs?limit=${limit}`;
    if (event_type) {
      url += `&event_type=${encodeURIComponent(event_type)}`;
    }
    if (phone) {
      url += `&phone=${encodeURIComponent(phone)}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders()
    });

    const data = await response.json();

    if (!response.ok) {
      // 404 is expected if webhook logs endpoint doesn't exist - return empty array
      if (response.status === 404) {
        console.log('Webhook logs endpoint not found, returning empty array');
        return [];
      }
      console.error('getWebhookLogs API error:', {
        status: response.status,
        statusText: response.statusText,
        data: data
      });
      throw new Error(data.error || data.message || 'Failed to fetch webhook logs');
    }

    if (data.success) {
      console.log('getWebhookLogs success:', data.count, 'logs');
      let logs = data.logs || [];
      
      // Filter by phone if provided (check payload.from)
      // Normalize phone number for comparison (remove + and spaces)
      const normalizePhone = (phoneNum) => {
        if (!phoneNum) return '';
        return String(phoneNum).replace(/[\s\+\-\(\)]/g, '');
      };
      
      if (phone && logs.length > 0) {
        const beforeFilter = logs.length;
        const normalizedSearchPhone = normalizePhone(phone);
        logs = logs.filter(log => {
          try {
            const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
            const fromPhone = normalizePhone(payload.from);
            const toPhone = normalizePhone(payload.to);
            return fromPhone === normalizedSearchPhone || toPhone === normalizedSearchPhone;
          } catch (e) {
            return false;
          }
        });
        console.log(`Filtered webhook logs: ${beforeFilter} -> ${logs.length} for phone ${phone} (normalized: ${normalizedSearchPhone})`);
      }
      
      return logs;
    }

    throw new Error(data.message || 'Failed to fetch webhook logs');
  } catch (error) {
    // If it's a 404, return empty array instead of throwing
    if (error.message && error.message.includes('Route not found')) {
      console.log('Webhook logs route not found, returning empty array');
      return [];
    }
    console.error('Error in getWebhookLogs:', error);
    throw error;
  }
};

