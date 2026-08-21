import { getApiUrl, getApiOrigin } from '../utils/apiBase';
// const API_URL = 'https://wabizx.techwhizzc.com/api';
const API_URL = getApiUrl();

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

const authHeaders = (extra = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    ...extra,
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const raw = localStorage.getItem('selectedProject');
    const selected = raw ? JSON.parse(raw) : null;
    if (selected?.id != null && String(selected.id).trim() !== '') {
      headers['x-project-id'] = String(selected.id);
    }
  } catch (_) {
    /* ignore */
  }
  return headers;
};

const appendProjectScope = (params = new URLSearchParams()) => {
  try {
    const raw = localStorage.getItem('selectedProject');
    const selected = raw ? JSON.parse(raw) : null;
    if (selected?.id != null && String(selected.id).trim() !== '') {
      params.set('projectId', String(selected.id));
    }
  } catch (_) {
    /* ignore */
  }
  return params;
};

const normalizeErrorMessage = (data, fallback) => {
  if (!data) return fallback;
  if (typeof data === 'string') return data;
  // common backend shapes
  if (typeof data.message === 'string' && data.message.trim()) return data.message;
  if (typeof data.error === 'string' && data.error.trim()) return data.error;
  if (data.error && typeof data.error === 'object') {
    if (typeof data.error.message === 'string' && data.error.message.trim()) return data.error.message;
    try {
      return JSON.stringify(data.error);
    } catch (e) {
      return fallback;
    }
  }
  try {
    return JSON.stringify(data);
  } catch (e) {
    return fallback;
  }
};

// Create template
export const createTemplate = async (templateData) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/templates`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(templateData)
    });

    const data = await response.json();

    if (!response.ok) {
      const err = new Error(data.error || data.message || 'Failed to create template');
      err.response = { data };
      throw err;
    }

    if (data.success) {
      return data.template;
    }

    throw new Error(data.message || 'Failed to create template');
  } catch (error) {
    throw error;
  }
};

// Get all templates
export const getTemplates = async (filters = {}) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const { category, status, page = 1, limit = 20 } = filters;
    const params = appendProjectScope(new URLSearchParams());
    if (category) params.append('category', category);
    if (status) params.append('status', status);
    params.append('page', page);
    params.append('limit', limit);

    const response = await fetch(`${API_URL}/templates?${params.toString()}`, {
      method: 'GET',
      headers: authHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch templates');
    }

    if (data.success) {
      return {
        templates: data.templates || [],
        pagination: data.pagination || {}
      };
    }

    throw new Error(data.message || 'Failed to fetch templates');
  } catch (error) {
    throw error;
  }
};

// Get template by ID
export const getTemplateById = async (templateId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/templates/${templateId}`, {
      method: 'GET',
      headers: authHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch template');
    }

    if (data.success) {
      return data.template;
    }

    throw new Error(data.message || 'Failed to fetch template');
  } catch (error) {
    throw error;
  }
};

// Update template
export const updateTemplate = async (templateId, updates) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/templates/${templateId}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to update template');
    }

    if (data.success) {
      return data.template;
    }

    throw new Error(data.message || 'Failed to update template');
  } catch (error) {
    throw error;
  }
};

// Delete template
export const deleteTemplate = async (templateId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/templates/${templateId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to delete template');
    }

    return data.success;
  } catch (error) {
    throw error;
  }
};

// Create template and submit to Meta API
export const createMetaTemplate = async (templateData) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/templates/create`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(templateData)
    });

    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      const err = new Error(normalizeErrorMessage(data, 'Failed to submit template to Meta'));
      err.response = { data };
      throw err;
    }

    if (data.success) {
      return data;
    }

    throw new Error(normalizeErrorMessage(data, 'Failed to submit template to Meta'));
  } catch (error) {
    throw error;
  }
};

// Get one template from Meta API (includes components / header format)
export const getMetaTemplateDetails = async (templateId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }
    if (!templateId) {
      throw new Error('Template ID is required');
    }

    const params = appendProjectScope(new URLSearchParams());
    const response = await fetch(
      `${API_URL}/templates/meta/${encodeURIComponent(templateId)}?${params.toString()}`,
      {
      method: 'GET',
      headers: authHeaders(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(normalizeErrorMessage(data, 'Failed to fetch template details from Meta'));
    }

    if (data.success) {
      return data.template;
    }

    throw new Error(data.message || 'Failed to fetch template details from Meta');
  } catch (error) {
    throw error;
  }
};

// Get templates from Meta API
export const getMetaTemplates = async () => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const params = appendProjectScope(new URLSearchParams());
    const response = await fetch(`${API_URL}/templates/meta?${params.toString()}`, {
      method: 'GET',
      headers: authHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = typeof data.error === 'string' ? data.error
        : (data.error?.error?.message || data.error?.message || data.message || 'Failed to fetch templates from Meta');
      throw new Error(errMsg);
    }

    if (data.success) {
      return Array.isArray(data.templates) ? data.templates : [];
    }

    throw new Error(data.message || 'Failed to fetch templates from Meta');
  } catch (error) {
    throw error;
  }
};

