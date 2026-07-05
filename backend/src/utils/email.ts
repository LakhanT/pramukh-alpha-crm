/** Normalize Pramukh Alpha company login emails (e.g. lakhan@pramukhalpha → lakhan@pramukhalpha.com) */
export function normalizeCompanyEmail(email: string): string {
  let e = email.trim().toLowerCase();
  if (!e) return e;
  if (!e.includes('@')) {
    return `${e}@pramukhalpha.com`;
  }
  if (e.endsWith('@pramukhalpha')) {
    return `${e}.com`;
  }
  return e;
}
