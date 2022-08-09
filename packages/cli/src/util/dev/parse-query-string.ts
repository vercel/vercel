/**
 * This function is necessary to account for the difference between
 * `?a=` and `?a` because native `url.parse(str, true)` can't tell.
 * @param querystring - The querystring to parse, also known as the "search" string.
 */
export function parseQueryString(
  querystring?: string
): Record<string, string[]> {
  const query: Record<string, string[]> = Object.create(null);
  if (!querystring || !querystring.startsWith('?') || querystring === '?') {
    return query;
  }
  const params = querystring.slice(1).split('&');
  for (let param of params) {
    let [key, value] = param.split('=');
    if (key !== undefined) {
      key = decodeURIComponent(key);
    }
    if (value !== undefined) {
      value = decodeURIComponent(value);
    }

    let existing = query[key];
    if (!existing) {
      existing = [];
      query[key] = existing;
    }

    existing.push(value);
  }
  return query;
}

/**
 * This function is necessary to account for the difference between
 * `?a=` and `?a` because native `url.format({ query })` can't tell.
 * @param query - The query object to stringify.
 */
export function formatQueryString(
  query: Record<string, string[]> | undefined
): string | undefined {
  if (!query) {
    return undefined;
  }
  let s = '';
  let prefix = '?';
  for (let [key, values] of Object.entries(query)) {
    for (let value of values) {
      s += prefix;
      s += encodeURIComponent(key);
      if (value !== undefined) {
        s += '=';
        s += encodeURIComponent(value);
      }
      prefix = '&';
    }
  }
  return s || undefined;
}
