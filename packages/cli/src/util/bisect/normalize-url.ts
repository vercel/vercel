function hasScheme(url: string): Boolean {
  return url.toLowerCase().startsWith('http://') || url.toLowerCase().startsWith('https://');
}

export function normalizeURL(url: string): string {
  return hasScheme(url) ? url : `https://${url}`;
}
