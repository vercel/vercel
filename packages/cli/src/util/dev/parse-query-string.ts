export function parseQueryString(querystring?: string) {
  let map = new Map<string, string[]>();
  if (!querystring || !querystring.startsWith('?') || querystring === '?') {
    return map;
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

    let existing = map.get(key);
    if (!existing) {
      existing = [];
      map.set(key, existing);
    }

    existing.push(value);
  }
  return map;
}

export function formatQueryString(
  map: Map<string, string[]> | undefined
): string | undefined {
  if (!map) {
    return undefined;
  }
  let s = '';
  let prefix = '?';
  for (let [key, values] of map) {
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
