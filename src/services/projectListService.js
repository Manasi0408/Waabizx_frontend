import axios from '../api/axios';

const CACHE_KEY_PREFIX = 'aisensy.projectsList.v1';

function storageCacheKey() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || 'null');
    const id = u?.id ?? 'anon';
    const role = String(u?.role || '').toLowerCase();
    return `${CACHE_KEY_PREFIX}:${id}:${role}`;
  } catch {
    return `${CACHE_KEY_PREFIX}:anon`;
  }
}

/** Last good list for this browser session (survives brief API timeouts during broadcasts). */
export function getCachedProjectList() {
  try {
    const raw = sessionStorage.getItem(storageCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.projects) ? parsed.projects : null;
  } catch {
    return null;
  }
}

function writeProjectListCache(projects) {
  try {
    sessionStorage.setItem(
      storageCacheKey(),
      JSON.stringify({ projects, savedAt: Date.now() })
    );
  } catch {
    /* ignore quota */
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Load projects for the current user. Retries once, then falls back to session cache.
 * @returns {Promise<{ projects: object[], fromCache: boolean, stale: boolean }>}
 */
export async function fetchProjectList(options = {}) {
  const retries = Number.isInteger(options.retries) ? options.retries : 1;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await axios.get('/projects/list', { timeout: 45000 });
      if (res.data?.success === false) {
        throw new Error(res.data?.message || 'Could not load projects');
      }
      const projects = Array.isArray(res.data?.projects) ? res.data.projects : [];
      writeProjectListCache(projects);
      return {
        projects,
        fromCache: false,
        stale: Boolean(res.data?.stale),
      };
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(900);
    }
  }

  const cached = getCachedProjectList();
  if (cached && cached.length > 0) {
    return { projects: cached, fromCache: true, stale: true };
  }

  throw lastError;
}
