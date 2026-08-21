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

// Get Dashboard Stats
export const getDashboardStats = async (days = 1) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const url = days && days !== 1 
      ? `${API_URL}/dashboard/stats?days=${days}`
      : `${API_URL}/dashboard/stats`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(token)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch dashboard stats');
    }

    if (data.success) {
      return {
        stats: data.stats || {},
        chartData: data.chartData || [],
        activities: data.activities || []
      };
    }

    throw new Error(data.message || 'Failed to fetch dashboard stats');
  } catch (error) {
    throw error;
  }
};

// WhatsApp conversation-based quota (24-hour rolling)
export const getConversationQuota = async (accountId) => {
  const token = getToken();
  if (!token) throw new Error('No token found');

  if (!accountId && accountId !== 0) {
    throw new Error('accountId is required');
  }

  const response = await fetch(`${API_URL}/dashboard/${accountId}`, {
    method: 'GET',
    headers: buildHeaders(token),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Failed to fetch conversation quota');
  }

  console.log('[Dashboard API][WCC] Browser received quota (drives WCC “X left” in panel)', {
    accountId,
    projectIdHeader: getSelectedProjectId(),
    projectId: data.projectId ?? null,
    wccCredits: data.wccCredits ?? 0,
    planInfo: data.planInfo ?? null,
    used24h: data.used,
    remainingDailyCap: data.remaining,
    limit: data.limit,
    accountName: data.accountName,
  });

  return {
    used: data.used ?? 0,
    remaining: data.remaining ?? 0,
    limit: data.limit ?? 0,
    messagesSentToday: data.messagesSentToday ?? 0,
    templatesSentToday: data.templatesSentToday ?? 0,
    accountName: data.accountName ?? null,
    projectId: data.projectId ?? null,
    projectName: data.projectName ?? null,
    wccCredits: data.wccCredits ?? 0,
    wccRemainingCredits: data.wccRemainingCredits ?? data.wccCredits ?? 0,
    remainingEstimatedMessages: data.remainingEstimatedMessages ?? 0,
    creditUnitCost: data.creditUnitCost ?? 1,
    planInfo: data.planInfo ?? null,
    wabaTier: data.wabaTier ?? null,
    wabaTierLabel: data.wabaTierLabel ?? null,
    messagingLimitDisplay: data.messagingLimitDisplay ?? null,
    wabaThroughputLevel: data.wabaThroughputLevel ?? null,
    wabaQualityRating: data.wabaQualityRating ?? null,
    tierDailyLimit: data.tierDailyLimit ?? data.limit ?? 0,
    tierRemaining: data.tierRemaining ?? data.remaining ?? 0,
    tierSource: data.tierSource ?? 'local',
    tierFetchedAt: data.tierFetchedAt ?? null,
  };
};

