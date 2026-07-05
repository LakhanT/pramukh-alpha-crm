export const RECURRENCE_RULES = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];

export function normalizeRecurrenceRule(rule?: string | null): RecurrenceRule {
  const lower = (rule || 'weekly').toLowerCase();
  if (RECURRENCE_RULES.includes(lower as RecurrenceRule)) return lower as RecurrenceRule;
  if (lower.includes('day')) return 'daily';
  if (lower.includes('month')) return 'monthly';
  return 'weekly';
}

/** Next due date from a base date (defaults to today). */
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

/** Advance due date forward until it is on or after `now`. */
export function advanceDueDateIfPast(rule: string, dueDate: Date, now: Date = new Date()): Date {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  let next = new Date(dueDate);
  next.setHours(23, 59, 59, 999);
  let guard = 0;
  while (next < today && guard < 100) {
    next = computeNextDueDate(rule, next);
    guard++;
  }
  return next;
}

export function resolveRecurringDueDate(
  rule: string,
  opts: { startDate?: Date | null; existingDueDate?: Date | null; baseDate?: Date }
): Date {
  const base = opts.startDate ?? opts.existingDueDate ?? opts.baseDate ?? new Date();
  return computeNextDueDate(rule, base);
}
