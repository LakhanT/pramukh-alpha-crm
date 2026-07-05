export const RECURRENCE_OPTIONS = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Every year' },
] as const;

export type RecurrenceRule = (typeof RECURRENCE_OPTIONS)[number]['value'];

export function recurrenceLabel(rule?: string | null): string {
  if (!rule) return 'Not set';
  const found = RECURRENCE_OPTIONS.find((o) => o.value === rule.toLowerCase());
  return found?.label ?? rule;
}

export function normalizeRecurrenceRule(rule?: string | null): RecurrenceRule {
  const lower = (rule || 'weekly').toLowerCase();
  if (RECURRENCE_OPTIONS.some((o) => o.value === lower)) return lower as RecurrenceRule;
  if (lower.includes('day')) return 'daily';
  if (lower.includes('month')) return 'monthly';
  return 'weekly';
}

export function computeNextDueDate(rule: string, from: Date = new Date()): Date {
  const base = new Date(from);
  base.setHours(23, 59, 59, 999);
  const next = new Date(base);

  switch (normalizeRecurrenceRule(rule)) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

export function formatDateForInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function recurrenceDueHint(rule: string, from: Date = new Date()): string {
  const due = computeNextDueDate(rule, from);
  return `Next due: ${due.toLocaleDateString()}`;
}
