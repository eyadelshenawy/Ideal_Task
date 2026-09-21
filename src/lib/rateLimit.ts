// In-memory sliding-window rate limiter — best-effort, resets on deploy/restart.
// Fine for blunting casual abuse on public endpoints behind a trusted proxy.
const buckets = new Map<string, number[]>();

export function checkRateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(key, recent);
  return recent.length > max;
}

// Prefer x-real-ip (which a trusted reverse proxy — Render's edge, or an
// on-prem nginx — writes with the actual client IP) over x-forwarded-for,
// whose first hop is the client-supplied value and is trivially spoofable
// before it reaches a proxy. Falls back to XFF only when no real-ip is set.
export function ipFromRequest(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return "unknown";
  // When there is no trusted proxy setting x-real-ip, fall back to the LAST
  // entry in x-forwarded-for — that's what the closest proxy added and the
  // attacker can't overwrite. On a single-proxy deployment this collapses
  // to the same value as the first entry.
  const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}
