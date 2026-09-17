import api from '../api/axios';

export async function fetchApiTokenStatus(projectId) {
  const response = await api.get('/project-api-token/status', {
    params: projectId ? { projectId } : undefined,
  });
  return response.data;
}

export async function createApiToken({ projectId, allowedIp, allowedDomain, replaceExisting = false }) {
  const response = await api.post('/project-api-token/create', {
    projectId,
    allowedIp,
    allowedDomain,
    replaceExisting,
  });
  return response.data;
}

export async function updateApiToken({ projectId, allowedIp, allowedDomain, regenerateToken = true }) {
  const response = await api.post('/project-api-token/update', {
    projectId,
    allowedIp,
    allowedDomain,
    regenerateToken,
  });
  return response.data;
}

export async function setApiTokenTemplate({ projectId, templateId }) {
  const response = await api.post('/project-api-token/template', {
    projectId,
    templateId,
  });
  return response.data;
}

export async function revokeApiToken(projectId) {
  const response = await api.post('/project-api-token/revoke', {
    projectId,
  });
  return response.data;
}
