import { useEffect, useState } from 'react';

/**
 * Resolve image/video src — public /uploads URLs work directly;
 * /api/media/whatsapp/:id requires Authorization header → fetch as blob.
 */
export function useMediaSrc(mediaUrl, apiBase) {
  const [src, setSrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    async function load() {
      if (!mediaUrl) {
        setSrc('');
        return;
      }

      const isProtectedApi =
        /\/api\/media\/whatsapp\//i.test(mediaUrl) ||
        mediaUrl.includes('/api/media/whatsapp/');

      if (!isProtectedApi) {
        setSrc(mediaUrl);
        setFailed(false);
        return;
      }

      try {
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const projectRaw = localStorage.getItem('selectedProject');
        if (projectRaw) {
          try {
            const p = JSON.parse(projectRaw);
            if (p?.id != null) headers['x-project-id'] = String(p.id);
          } catch (_) {}
        }

        const res = await fetch(mediaUrl, { headers });
        if (!res.ok) throw new Error(`media ${res.status}`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setSrc(objectUrl);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setSrc('');
          setFailed(true);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaUrl, apiBase]);

  return { src, failed, setFailed };
}
