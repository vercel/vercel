/**
 * Validates that a string is a well-formed URL path suitable for use
 * as a microfrontends default route (e.g. `/docs`, `/app/settings`).
 *
 * Returns `true` if valid, or an error message string if invalid.
 * This signature is compatible with `client.input.text({ validate })`.
 */
export function validateRoutePath(path: string): true | string {
  if (!path || !path.startsWith('/')) {
    return 'Route must start with /';
  }
  if (/\s/.test(path)) {
    return 'Route must not contain spaces';
  }
  if (path.includes('?') || path.includes('#')) {
    return 'Route must not contain query strings or fragments';
  }
  try {
    new URL(path, 'http://n');
  } catch {
    return 'Route is not a valid URL path';
  }
  return true;
}

/**
 * Validates that a string looks like a valid routing path for microfrontends.json.
 * Routing paths support path-to-regexp syntax (e.g. `/docs`, `/docs/*`, `/app/:slug`).
 * Full validation happens at deploy time; this catches obvious mistakes early.
 * See https://vercel.com/docs/microfrontends/path-routing for supported syntax.
 */
export function validateRoutingPath(path: string): true | string {
  if (!path || !path.startsWith('/')) {
    return 'Path must start with /. See https://vercel.com/docs/microfrontends/path-routing for supported syntax.';
  }
  if (/\s/.test(path)) {
    return 'Path must not contain spaces. See https://vercel.com/docs/microfrontends/path-routing for supported syntax.';
  }
  return true;
}
