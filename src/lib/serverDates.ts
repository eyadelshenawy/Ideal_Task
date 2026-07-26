// Dates are stored as UTC midnight and travel over the wire as plain
// "YYYY-MM-DD" strings, matching how the prototype treats dates (no time
// component, no timezone drift).

export function dateStrToUTC(s: string | null | undefined): Date | null {
  if (!s) return null;
  return new Date(`${s}T00:00:00.000Z`);
}

export function utcToDateStr(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}
