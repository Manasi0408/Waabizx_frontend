// const API_BASE = (process.env.REACT_APP_API_URL || 'https://wabizx.techwhizzc.com').replace(/\/$/, '');
const API_BASE = (process.env.REACT_APP_API_URL || 'https://api.waabizx.com').replace(/\/$/, '');
const API_URL = `${API_BASE}/api`;

const getToken = () => localStorage.getItem('token');

const getSelectedProjectId = () => {
  try {
    const raw = localStorage.getItem('selectedProject');
    if (raw) {
      const parsed = JSON.parse(raw);
      const id = parsed?.id;
      if (id != null && String(id).trim() !== '') return String(id);
    }
    const userRaw = localStorage.getItem('user');
    if (userRaw) {
      const user = JSON.parse(userRaw);
      const uid = user?.projectId ?? user?.project_id;
      if (uid != null && String(uid).trim() !== '') return String(uid);
    }
  } catch (e) {
    console.warn('[contactService] getSelectedProjectId parse error', e);
  }
  return null;
};

const parseResponseJson = async (response) => {
  const text = await response.text();
  if (!text || !text.trim()) {
    return { _empty: true };
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('[contactService] Non-JSON response', {
      status: response.status,
      statusText: response.statusText,
      preview: text.slice(0, 300),
    });
    throw new Error(
      `Server returned invalid response (${response.status}). Check API URL and login.`
    );
  }
};

const buildHeaders = (token, jsonBody = true) => {
  const headers = jsonBody ? { 'Content-Type': 'application/json' } : {};
  headers['Authorization'] = `Bearer ${token}`;
  const projectId = getSelectedProjectId();
  if (projectId) headers['x-project-id'] = projectId;
  return headers;
};

// Create contact
export const createContact = async (contactData) => {
  const token = getToken();
  if (!token) {
    const err = new Error('No token found — please log in again');
    console.error('[contactService] createContact', err.message);
    throw err;
  }

  const projectId = getSelectedProjectId();
  if (!projectId) {
    const err = new Error('No project selected — pick a project in the header first');
    console.error('[contactService] createContact', err.message);
    throw err;
  }

  const payload = {
    ...contactData,
    projectId: Number(projectId) || projectId,
  };
  const url = `${API_URL}/contacts`;
  const headers = buildHeaders(token);

  console.log('[contactService] createContact → POST', {
    url,
    projectId,
    phone: payload.phone,
    name: payload.name,
    hasToken: !!token,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const data = await parseResponseJson(response);

    if (!response.ok) {
      console.error('[contactService] createContact failed', {
        status: response.status,
        statusText: response.statusText,
        code: data?.code,
        message: data?.message,
        error: data?.error,
        data,
      });
      const err = new Error(
        data?.message || data?.error || `Failed to create contact (HTTP ${response.status})`
      );
      err.response = { data };
      throw err;
    }

    if (data.success) {
      console.log('[contactService] createContact OK', {
        contactId: data.contact?.id,
        message: data.message,
      });
      return {
        contact: data.contact,
        message: data.message || '',
      };
    }

    console.error('[contactService] createContact unexpected body', data);
    throw new Error(data.message || 'Failed to create contact');
  } catch (error) {
    if (!error.message?.includes('createContact')) {
      console.error('[contactService] createContact exception', {
        message: error.message,
        stack: error.stack,
      });
    }
    throw error;
  }
};

// Upload CSV and save to contacts table (campaign flow Step 2)
export const uploadContactsCSV = async (file) => {
  const token = getToken();
  if (!token) throw new Error('No token found');
  const formData = new FormData();
  formData.append('csvFile', file);
  const response = await fetch(`${API_URL}/contacts/upload-csv`, {
    method: 'POST',
    headers: buildHeaders(token, false),
    body: formData
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.message || data.error || 'Failed to upload CSV');
    err.response = { data };
    throw err;
  }
  if (!data.success) throw new Error(data.message || 'Failed to upload CSV');
  return data;
};

// Get all contacts
export const getContacts = async (filters = {}) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const { status, type, search, tag, page = 1, limit = 20 } = filters;
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    if (search) params.append('search', search);
    if (tag) params.append('tag', tag);
    params.append('page', page);
    params.append('limit', limit);

    const response = await fetch(`${API_URL}/contacts?${params.toString()}`, {
      method: 'GET',
      headers: buildHeaders(token)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch contacts');
    }

    if (data.success) {
      return {
        contacts: data.contacts || [],
        pagination: data.pagination || {}
      };
    }

    throw new Error(data.message || 'Failed to fetch contacts');
  } catch (error) {
    throw error;
  }
};

// Get contact by ID
export const getContactById = async (contactId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}`, {
      method: 'GET',
      headers: buildHeaders(token)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch contact');
    }

    if (data.success) {
      return data.contact;
    }

    throw new Error(data.message || 'Failed to fetch contact');
  } catch (error) {
    throw error;
  }
};

// Update contact
export const updateContact = async (contactId, updates) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}`, {
      method: 'PUT',
      headers: buildHeaders(token),
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to update contact');
    }

    if (data.success) {
      return data.contact;
    }

    throw new Error(data.message || 'Failed to update contact');
  } catch (error) {
    throw error;
  }
};

// Opt-out contact
export const optOutContact = async (contactId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}/opt-out`, {
      method: 'PUT',
      headers: buildHeaders(token)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to opt-out contact');
    }

    if (data.success) {
      return data.contact;
    }

    throw new Error(data.message || 'Failed to opt-out contact');
  } catch (error) {
    throw error;
  }
};

// Opt-in contact
export const optInContact = async (contactId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}/opt-in`, {
      method: 'PUT',
      headers: buildHeaders(token)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to opt-in contact');
    }

    if (data.success) {
      return data.contact;
    }

    throw new Error(data.message || 'Failed to opt-in contact');
  } catch (error) {
    throw error;
  }
};

// Delete contact
export const deleteContact = async (contactId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/contacts/${contactId}`, {
      method: 'DELETE',
      headers: buildHeaders(token)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to delete contact');
    }

    return data.success;
  } catch (error) {
    throw error;
  }
};

