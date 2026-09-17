import { useEffect, useState } from 'react';
import { getApiOrigin, getApiUrl } from '../utils/apiBase';
import { readSelectedProject, resolveActiveProjectId } from '../utils/activeProject';

function readProjectWhatsAppFlags(project) {
  return project?.whatsappApproved === true || project?.whatsappConnected === true;
}

/**
 * True when the active project has WhatsApp connected (WABA + phone + token).
 */
export function useProjectWhatsAppConnected() {
  const [connected, setConnected] = useState(() => readProjectWhatsAppFlags(readSelectedProject()));

  useEffect(() => {
    let cancelled = false;

    const checkViaProjectApiTokenStatus = async (projectId, token) => {
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      if (projectId) headers['x-project-id'] = projectId;

      const url = `${getApiUrl()}/project-api-token/status${
        projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
      }`;
      const res = await fetch(url, { headers });
      const data = await res.json().catch(() => ({}));

      if (res.status === 403 && /connect whatsapp/i.test(String(data?.message || ''))) {
        return false;
      }

      if (res.ok && data?.success === true) {
        return data?.whatsappConnected !== false;
      }

      return null;
    };

    const checkViaOnboardingStatus = async (projectId, token) => {
      try {
        const rawUser = localStorage.getItem('user');
        const user = rawUser ? JSON.parse(rawUser) : null;
        const clientId = Number(user?.id);
        if (!Number.isInteger(clientId) || clientId <= 0) return false;

        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (projectId) headers['x-project-id'] = projectId;

        let url = `${getApiOrigin()}/meta/onboarding-status?client_id=${clientId}`;
        if (projectId) {
          url += `&projectId=${encodeURIComponent(projectId)}`;
        }

        const res = await fetch(url, { headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return false;

        return Boolean(
          data?.whatsappConnected ||
            data?.onboardingCompleted ||
            data?.metaLinked ||
            data?.connected ||
            data?.cloudApiMessagingLikelyReady ||
            data?.readyToSendMessages
        );
      } catch {
        return false;
      }
    };

    const checkStatus = async () => {
      const projectId = resolveActiveProjectId();
      const project = readSelectedProject();

      if (readProjectWhatsAppFlags(project)) {
        if (!cancelled) setConnected(true);
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        if (!cancelled) setConnected(false);
        return;
      }

      try {
        const fromProjectStatus = await checkViaProjectApiTokenStatus(projectId, token);
        if (fromProjectStatus === true) {
          if (!cancelled) setConnected(true);
          return;
        }
        if (fromProjectStatus === false) {
          if (!cancelled) setConnected(false);
          return;
        }

        const fromOnboarding = await checkViaOnboardingStatus(projectId, token);
        if (!cancelled) setConnected(fromOnboarding);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };

    checkStatus();

    const onProjectChange = () => checkStatus();
    window.addEventListener('waabiz-project-changed', onProjectChange);
    const intervalId = setInterval(checkStatus, 15000);

    return () => {
      cancelled = true;
      window.removeEventListener('waabiz-project-changed', onProjectChange);
      clearInterval(intervalId);
    };
  }, []);

  return connected;
}
