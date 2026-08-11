/** Disposition options shown when resolving an intervened lead/chat. */
export const RESOLVE_DISPOSITIONS = [
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
  { value: 'closed_won', label: 'Closed Won (Lead converted successfully)' },
  { value: 'closed_lost', label: 'Closed Lost (Lead not converted)' },
  { value: 'completed', label: 'Completed' },
  { value: 'issue_resolved', label: 'Issue Resolved' },
  { value: 'order_completed', label: 'Order Completed' },
  { value: 'service_completed', label: 'Service Completed' },
];

export const RESOLVE_DISPOSITION_VALUES = new Set(
  RESOLVE_DISPOSITIONS.map((d) => d.value)
);

const CUSTOM_LABELS_KEY = 'waabizx_disposition_labels';

export function readCustomDispositionLabels() {
  try {
    const raw = localStorage.getItem(CUSTOM_LABELS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveCustomDispositionLabel(value, label) {
  const key = String(value || '').trim();
  if (!key || !RESOLVE_DISPOSITION_VALUES.has(key)) return readCustomDispositionLabels();
  const map = { ...readCustomDispositionLabels() };
  const trimmed = String(label || '').trim();
  const defaults = RESOLVE_DISPOSITIONS.find((d) => d.value === key);
  if (!trimmed || trimmed === defaults?.label) {
    delete map[key];
  } else {
    map[key] = trimmed;
  }
  try {
    localStorage.setItem(CUSTOM_LABELS_KEY, JSON.stringify(map));
  } catch (_) {
    /* ignore quota */
  }
  return map;
}

export function notifyDispositionLabelsChanged() {
  try {
    window.dispatchEvent(new Event('waabizx-disposition-labels-changed'));
  } catch (_) {
    /* ignore */
  }
}

/** Current label list (defaults + any renamed labels). */
export function getDispositionOptions() {
  const custom = readCustomDispositionLabels();
  return RESOLVE_DISPOSITIONS.map((d) => ({
    ...d,
    label: custom[d.value] || d.label,
  }));
}

export function getDispositionLabel(value) {
  const key = String(value || '').trim();
  const custom = readCustomDispositionLabels();
  if (custom[key]) return custom[key];
  const hit = RESOLVE_DISPOSITIONS.find((d) => d.value === key);
  return hit?.label || key || 'Resolved';
}

export function splitDispositionLabel(label) {
  const raw = String(label || '');
  const idx = raw.indexOf('(');
  if (idx === -1) return { title: raw.trim(), hint: '' };
  return {
    title: raw.slice(0, idx).trim(),
    hint: raw.slice(idx).trim(),
  };
}

export function joinDispositionLabel(title, hint) {
  const t = String(title || '').trim();
  const h = String(hint || '').trim();
  if (!h) return t;
  return `${t} ${h}`.trim();
}
