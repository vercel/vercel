const ALLOWED_SPEC_HOSTS = ['vercel.sh', 'vercel.tools'];

export function assertAllowedSpecUrl(specUrl: string): URL {
  const parsedUrl = new URL(specUrl);

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('OpenAPI spec URL must use https');
  }

  if (!ALLOWED_SPEC_HOSTS.some(host => isHostOrSubdomain(parsedUrl, host))) {
    throw new Error('OpenAPI spec URL must be on an allowed origin.');
  }

  return parsedUrl;
}

function isHostOrSubdomain(url: URL, host: string): boolean {
  return url.hostname === host || url.hostname.endsWith(`.${host}`);
}
