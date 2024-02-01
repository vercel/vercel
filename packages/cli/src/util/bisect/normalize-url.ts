function hasScheme(url: string): Boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

export function normalizeURL(url: string): string {
  return hasScheme(url) ? url : `https://${url}`;
}
