import { parse } from 'url';
import type { ListenSpec } from './types';
import { dev } from './diagnostics';

export function parseListen(str: string, defaultPort = 3000): ListenSpec {
  let port = Number(str);

  if (!isNaN(port)) {
    return [port];
  }

  // We cannot use `new URL` here, otherwise it will not
  // parse the host properly and it would drop support for IPv6.
  const url = parse(str);

  switch (url.protocol) {
    case 'pipe:': {
      // some special handling
      const cutStr = str.replace(/^pipe:/, '');

      if (cutStr.slice(0, 4) !== '\\\\.\\') {
        throw dev.DEV_INVALID_WINDOWS_PIPE({ endpoint: str });
      }

      return [cutStr];
    }
    case 'unix:':
      if (!url.pathname) {
        throw dev.DEV_INVALID_UNIX_SOCKET({ endpoint: str });
      }

      return [url.pathname];
    case 'tcp:':
      url.port = url.port || String(defaultPort);
      return [parseInt(url.port, 10), url.hostname ?? undefined];
    default:
      if (!url.slashes) {
        if (url.protocol === null) {
          return [defaultPort, url.pathname ?? undefined];
        }
        port = Number(url.hostname);
        if (url.protocol && !isNaN(port)) {
          return [port, url.protocol.substring(0, url.protocol.length - 1)];
        }
      }
      throw dev.DEV_INVALID_LISTEN_SCHEME({ protocol: url.protocol });
  }
}

export function replaceLocalhost(address: string): string {
  return address.replace('[::]', 'localhost').replace('0.0.0.0', 'localhost');
}

/**
 * Whether the listen address is bound to all network interfaces (`0.0.0.0` or
 * `::`). Must be checked before `replaceLocalhost()` rewrites the host.
 */
export function isWildcardAddress(address: string): boolean {
  try {
    const hostname = new URL(address).hostname.toLowerCase();
    return hostname === '0.0.0.0' || hostname === '[::]' || hostname === '::';
  } catch {
    return address.includes('0.0.0.0') || address.includes('[::]');
  }
}
