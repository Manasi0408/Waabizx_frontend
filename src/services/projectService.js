import { getApiUrl } from '../utils/apiBase';

const API_URL = getApiUrl();

const getToken = () => localStorage.getItem('token');

export const getQualityRating = async (projectId) => {
  const token = getToken();
  if (!token) {
    throw new Error('No token found');
  }
  if (projectId == null || String(projectId).trim() === '') {
    throw new Error('Project id is required');
  }

  const response = await fetch(`${API_URL}/projects/${projectId}/quality-rating`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-project-id': String(projectId),
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || data?.error?.message || 'Failed to fetch quality rating');
  }
  return data;
};
