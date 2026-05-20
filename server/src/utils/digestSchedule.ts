/** Next weekly digest slot: Sunday 09:00 UTC (matches digest cron documentation). */

export function nextSundayDigestUtc(reference: Date = new Date()): Date {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const d = reference.getUTCDate();
  const dow = reference.getUTCDay();
  const thisSundayNine = new Date(Date.UTC(y, m, d + ((7 - dow) % 7), 9, 0, 0, 0));
  if (thisSundayNine <= reference) {
    return new Date(thisSundayNine.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return thisSundayNine;
}
