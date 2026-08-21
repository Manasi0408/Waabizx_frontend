import { getApiUrl, getApiOrigin } from '../utils/apiBase';
// const API_URL = 'https://wabizx.techwhizzc.com/api';
const API_URL = getApiUrl();

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

const authHeaders = (extra = {}) => {
  const headers = { ...extra };
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

// Upload and parse CSV file
export const uploadCSV = async (file) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const formData = new FormData();
    formData.append('csvFile', file);

    const response = await fetch(`${API_URL}/broadcast/upload-csv`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to upload CSV');
    }

    if (data.success) {
      return data;
    }

    throw new Error(data.message || 'Failed to upload CSV');
  } catch (error) {
    throw error;
  }
};

// Get contacts for selection
export const getBroadcastContacts = async (filters = {}) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const { page = 1, limit = 100, search = '', tags = '' } = filters;
    const params = new URLSearchParams();
    params.append('page', page);
    params.append('limit', limit);
    if (search) params.append('search', search);
    if (tags) params.append('tags', tags);

    const response = await fetch(`${API_URL}/broadcast/contacts?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch contacts');
    }

    if (data.success) {
      return data;
    }

    throw new Error(data.message || 'Failed to fetch contacts');
  } catch (error) {
    throw error;
  }
};

// Get segments (tag-based groups)
export const getSegments = async () => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/broadcast/segments`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch segments');
    }

    if (data.success) {
      return data.segments || [];
    }

    throw new Error(data.message || 'Failed to fetch segments');
  } catch (error) {
    throw error;
  }
};

// Get contacts by segment
export const getContactsBySegment = async (tag) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/broadcast/segments/${tag}/contacts`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch segment contacts');
    }

    if (data.success) {
      return data.contacts || [];
    }

    throw new Error(data.message || 'Failed to fetch segment contacts');
  } catch (error) {
    throw error;
  }
};

// Validate template variables
export const validateTemplate = async (templateName, templateLanguage, variableMapping) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/broadcast/validate-template`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        template_name: templateName,
        template_language: templateLanguage,
        variable_mapping: variableMapping
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to validate template');
    }

    if (data.success) {
      return data.template;
    }

    throw new Error(data.message || 'Failed to validate template');
  } catch (error) {
    throw error;
  }
};

// Upload header media for image/video/document templates
export const uploadBroadcastHeaderMedia = async (file) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }
    if (!file) {
      throw new Error('No file selected');
    }

    const formData = new FormData();
    formData.append('media', file);

    const headers = authHeaders();
    delete headers['Content-Type'];

    const response = await fetch(`${API_URL}/broadcast/upload-header-media`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to upload header media');
    }

    if (data.success && data.url) {
      return {
        ...data,
        storedPath: data.storedPath || null,
      };
    }

    throw new Error(data.message || 'Failed to upload header media');
  } catch (error) {
    throw error;
  }
};

// Create broadcast campaign
export const createBroadcast = async (broadcastData) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/broadcast/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(broadcastData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to create broadcast');
    }

    if (data.success) {
      return data.campaign;
    }

    throw new Error(data.message || 'Failed to create broadcast');
  } catch (error) {
    throw error;
  }
};

