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

export function getDispositionLabel(value) {
  const hit = RESOLVE_DISPOSITIONS.find((d) => d.value === value);
  return hit?.label || String(value || '').trim() || 'Resolved';
}
