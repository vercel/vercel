export function parseQueryString(querystring?: string) {
  let map = new Map<string, string[]>();
  if (!querystring) {
    return map;
  }
  const params = querystring.slice(1).split('&');
  for (let param of params) {
    const [key, value] = param.split('=');

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
      s += key;
      if (value !== undefined) {
        s += '=';
        s += value;
      }
      prefix = '&';
    }
  }
  return s;
}
