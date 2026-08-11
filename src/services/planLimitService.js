import axios from '../api/axios';

const RESOURCE_LABELS = {
  agents: 'agents',
  campaigns: 'campaigns',
  templates: 'templates',
  flows: 'flows',
  contacts: 'contacts',
};

export async function fetchPlanLimits() {
  const res = await axios.get('/projects/plan-limits');
  return res?.data || null;
}

function buildLimitMessage(snapshot, resource, usage) {
  const label = RESOURCE_LABELS[resource] || resource;
  const planName = snapshot?.planName || snapshot?.plan || 'current';
  return `You are on the ${planName} plan, which allows up to ${usage.limit} ${label} only. You currently have ${usage.current} ${label}. Upgrade your plan or remove existing ${label} to add more.`;
}

/** Returns false when blocked; runs onAllowed when allowed. Fail-open on API errors. */
export async function gatePlanLimit(resource, increment = 1, { onBlocked, onAllowed } = {}) {
  try {
    const precheck = await assertCanAddResource(resource, increment);
    if (!precheck.allowed) {
      if (typeof onBlocked === 'function') onBlocked(precheck);
      return false;
    }
    if (typeof onAllowed === 'function') onAllowed();
    return true;
  } catch (_) {
    if (typeof onAllowed === 'function') onAllowed();
    return true;
  }
}

export function extractPlanLimitError(error) {
  const data = error?.response?.data || error?.data || null;
  if (!data || data.code !== 'PLAN_LIMIT_EXCEEDED') return null;
  return {
    message: data.message || 'Plan limit reached.',
    resource: data.resource || '',
    limit: data.limit,
    current: data.current,
    planName: data.planName || data.planSlug || 'your plan',
  };
}

export function isPlanLimitError(error) {
  return Boolean(extractPlanLimitError(error));
}

export async function assertCanAddResource(resource, increment = 1) {
  try {
    const snapshot = await fetchPlanLimits();
    const usage = snapshot?.usage?.[resource];
    if (!usage || usage.unlimited || usage.limit == null) {
      return { allowed: true };
    }
    const next = Number(usage.current || 0) + Math.max(1, Number(increment) || 1);
    if (next > Number(usage.limit)) {
      return {
        allowed: false,
        message: buildLimitMessage(snapshot, resource, usage),
        resource,
        limit: usage.limit,
        current: usage.current,
        planName: snapshot?.planName || snapshot?.plan || 'your plan',
      };
    }
    return { allowed: true };
  } catch (_) {
    return { allowed: true };
  }
}
