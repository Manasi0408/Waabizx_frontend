import { getApiUrl, getApiOrigin } from '../utils/apiBase';
// const API_URL = 'https://wabizx.techwhizzc.com/api';
const API_URL = getApiUrl();

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Get Overview Analytics
export const getOverview = async (timeRange = 'all') => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const url = timeRange && timeRange !== 'all' 
      ? `${API_URL}/analytics/overview?timeRange=${timeRange}`
      : `${API_URL}/analytics/overview`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch overview analytics');
    }

    if (data.success) {
      return data.data;
    }

    throw new Error(data.message || 'Failed to fetch overview analytics');
  } catch (error) {
    throw error;
  }
};

// Get Campaign Analytics
export const getCampaignAnalytics = async (timeRange = 'all') => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const url = timeRange && timeRange !== 'all' 
      ? `${API_URL}/analytics/campaigns?timeRange=${timeRange}`
      : `${API_URL}/analytics/campaigns`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch campaign analytics');
    }

    if (data.success) {
      return data.data;
    }

    throw new Error(data.message || 'Failed to fetch campaign analytics');
  } catch (error) {
    throw error;
  }
};

// Get Message Analytics
export const getMessageAnalytics = async (timeRange = 'all') => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const url = timeRange && timeRange !== 'all' 
      ? `${API_URL}/analytics/messages?timeRange=${timeRange}`
      : `${API_URL}/analytics/messages`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch message analytics');
    }

    if (data.success) {
      return data.data;
    }

    throw new Error(data.message || 'Failed to fetch message analytics');
  } catch (error) {
    throw error;
  }
};

// Get Contact Analytics
export const getContactAnalytics = async (timeRange = 'all') => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const url = timeRange && timeRange !== 'all' 
      ? `${API_URL}/analytics/contacts?timeRange=${timeRange}`
      : `${API_URL}/analytics/contacts`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch contact analytics');
    }

    if (data.success) {
      return data.data;
    }

    throw new Error(data.message || 'Failed to fetch contact analytics');
  } catch (error) {
    throw error;
  }
};

// Get Cost Analytics
export const getCostAnalytics = async (timeRange = 'all') => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const url = timeRange && timeRange !== 'all' 
      ? `${API_URL}/analytics/cost?timeRange=${timeRange}`
      : `${API_URL}/analytics/cost`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch cost analytics');
    }

    if (data.success) {
      return data.data;
    }

    throw new Error(data.message || 'Failed to fetch cost analytics');
  } catch (error) {
    throw error;
  }
};

