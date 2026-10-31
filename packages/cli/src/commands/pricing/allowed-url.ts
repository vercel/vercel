const ALLOWED_PRICING_HOSTS = new Set(['vercel.com', 'www.vercel.com']);

export function isAllowedPricingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      ALLOWED_PRICING_HOSTS.has(parsed.hostname) &&
      parsed.pathname === '/pricing.md' &&
      parsed.username === '' &&
      parsed.password === ''
    );
  } catch {
    return false;
  }
}
