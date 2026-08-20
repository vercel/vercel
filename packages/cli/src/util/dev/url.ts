const LOCAL_URL_ORIGIN = 'http://vercel.local';

export function parseUrl(url: string): URL {
  return new URL(
    url.startsWith('//') ? `${LOCAL_URL_ORIGIN}${url}` : url,
    LOCAL_URL_ORIGIN
  );
}

export function formatUrl(url: URL): string {
  if (url.origin === LOCAL_URL_ORIGIN) {
    return `${url.pathname}${url.search}`;
  }

  return url.href;
}
