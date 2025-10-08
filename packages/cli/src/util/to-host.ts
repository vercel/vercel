/**
 * Converts a valid deployment lookup parameter to a hostname.
 * `http://google.com` => google.com
 * google.com => google.com
 */
export default function toHost(url: string): string {
  return url.replace(/^(?:.*?\/\/)?([^/]+).*/, '$1');
}
