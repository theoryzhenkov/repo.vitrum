const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$|ref_src$|twclid$)/;

/**
 * Normalize a URL so the same page always keys to the same string:
 * lowercase host, no fragment, no tracking params, no trailing slash,
 * stable param order.
 */
export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();

  const kept = [...url.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k));
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = '';
  for (const [k, v] of kept) url.searchParams.append(k, v);

  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}
