import { getApiUrl, getApiOrigin } from '../utils/apiBase';
// const API_URL = 'https://wabizx.techwhizzc.com/api';
const API_URL = getApiUrl();

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

const getSelectedProjectId = () => {
  try {
    const raw = localStorage.getItem('selectedProject');
    if (raw) {
      const parsed = JSON.parse(raw);
      const id = parsed?.id;
      if (id != null && String(id).trim() !== '') return String(id);
    }
  } catch (_) {
    /* ignore */
  }
  return null;
};

const buildAuthHeaders = () => {
  const headers = {
    'Content-Type': 'application/json',
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const projectId = getSelectedProjectId();
  if (projectId) headers['x-project-id'] = projectId;
  return headers;
};

// Create campaign
export const createCampaign = async (campaignData) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify(campaignData)
    });

    const data = await response.json();

    if (!response.ok) {
      const err = new Error(data.error || data.message || 'Failed to create campaign');
      err.response = { data };
      throw err;
    }

    if (data.success) {
      return data.campaign;
    }

    throw new Error(data.message || 'Failed to create campaign');
  } catch (error) {
    throw error;
  }
};

// Get all campaigns
export const getCampaigns = async (filters = {}) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const { status, type, page = 1, limit = 10 } = filters;
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (type) params.append('type', type);
    params.append('page', page);
    params.append('limit', limit);

    const response = await fetch(`${API_URL}/campaigns?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch campaigns');
    }

    if (data.success) {
      return {
        campaigns: data.campaigns || [],
        pagination: data.pagination || {}
      };
    }

    throw new Error(data.message || 'Failed to fetch campaigns');
  } catch (error) {
    throw error;
  }
};

// Get campaign by ID
export const getCampaignById = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch campaign');
    }

    if (data.success) {
      // Backend returns { success: true, id, name, status, stats }
      // Also check if it's wrapped in campaign object
      const campaignData = data.campaign || data;
      return {
        id: campaignData.id,
        name: campaignData.name,
        status: campaignData.status,
        template_name: campaignData.template_name,
        template_language: campaignData.template_language,
        createdAt: campaignData.createdAt,
        updatedAt: campaignData.updatedAt,
        stats: campaignData.stats || {},
        total: campaignData.stats?.total || campaignData.total || 0,
        sent: campaignData.stats?.sent || campaignData.sent || 0,
        delivered: campaignData.stats?.delivered || campaignData.delivered || 0,
        read: campaignData.stats?.read || campaignData.read || 0,
        failed: campaignData.stats?.failed || campaignData.failed || 0,
        audience: campaignData.audience ?? campaignData.totalRecipients ?? campaignData.stats?.total ?? 0,
        totalCreditUsage: campaignData.totalCreditUsage ?? 0
      };
    }

    throw new Error(data.message || 'Failed to fetch campaign');
  } catch (error) {
    throw error;
  }
};

// Update campaign
export const updateCampaign = async (campaignId, updates) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to update campaign');
    }

    if (data.success) {
      return data.campaign;
    }

    throw new Error(data.message || 'Failed to update campaign');
  } catch (error) {
    throw error;
  }
};

// Delete campaign
export const deleteCampaign = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to delete campaign');
    }

    return data.success;
  } catch (error) {
    throw error;
  }
};

// Start campaign
export const startCampaign = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to start campaign');
    }

    if (data.success) {
      return data.campaign;
    }

    throw new Error(data.message || 'Failed to start campaign');
  } catch (error) {
    throw error;
  }
};

// Pause campaign
export const pauseCampaign = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}/pause`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to pause campaign');
    }

    if (data.success) {
      return data;
    }

    throw new Error(data.message || 'Failed to pause campaign');
  } catch (error) {
    throw error;
  }
};

// Resume campaign
export const resumeCampaign = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}/resume`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to resume campaign');
    }

    if (data.success) {
      return data;
    }

    throw new Error(data.message || 'Failed to resume campaign');
  } catch (error) {
    throw error;
  }
};

// Add contacts to campaign with variable mapping
export const addContactsToCampaign = async (campaignId, { contactIds, variable_mapping }) => {
  const token = getToken();
  if (!token) throw new Error('No token found');
  const response = await fetch(`${API_URL}/campaigns/${campaignId}/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ contactIds, variable_mapping })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || data.error || 'Failed to add contacts');
  if (!data.success) throw new Error(data.message || 'Failed to add contacts');
  return data;
};

// Get campaign audience logs
export const getCampaignAudience = async (campaignId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/campaigns/${campaignId}/audience`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch campaign audience');
    }

    if (data.success) {
      return data.audience || [];
    }

    throw new Error(data.message || 'Failed to fetch campaign audience');
  } catch (error) {
    throw error;
  }
};

// Audience data for rebroadcasting campaign recipients by status (failed, sent, delivered, read)
export const getCampaignRetryPrefill = async (campaignId, status = 'failed') => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const params = new URLSearchParams();
    if (status) params.set('status', status);

    const response = await fetch(`${API_URL}/campaigns/${campaignId}/retry-prefill?${params.toString()}`, {
      method: 'GET',
      headers: buildAuthHeaders(),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to load retry data');
    }

    if (data.success) {
      return data;
    }

    throw new Error(data.message || 'Failed to load retry data');
  } catch (error) {
    throw error;
  }
};

export const estimateCampaignCost = async ({ phones = [], audience = [], category = 'marketing', campaignId = null } = {}) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/campaigns/estimate-cost`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        phones,
        audience,
        category,
        campaignId,
      }),
    });

    const data = await response.json();
    if (!response.ok || data.success === false) {
      throw new Error(data.message || data.error || 'Failed to estimate campaign cost');
    }
    return data;
  } catch (error) {
    throw error;
  }
};

export const calculateCampaignCost = async ({
  contacts = [],
  audience = [],
  phones = [],
  category = 'marketing',
  currency = 'INR',
} = {}) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const contactList = contacts.length
      ? contacts
      : audience.length
        ? audience
        : phones.map((phone) => ({ phone }));

    const response = await fetch(`${API_URL}/campaigns/calculate-cost`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({
        contacts: contactList,
        category,
        currency,
      }),
    });

    const data = await response.json();
    if (!response.ok || data.success === false) {
      throw new Error(data.message || data.error || 'Failed to calculate campaign cost');
    }
    return data;
  } catch (error) {
    throw error;
  }
};
