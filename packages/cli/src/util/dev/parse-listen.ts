import { URLPattern } from 'urlpattern-polyfill';
import type { ListenSpec } from './types';

const TCP_PATTERN = new URLPattern({
  protocol: 'tcp',
  hostname: '*',
  port: '*',
});

export function parseListen(str: string, defaultPort = 3000): ListenSpec {
  const port = Number(str);

  if (!isNaN(port)) {
    return [port];
  }

  if (str.startsWith('pipe:')) {
    const cutStr = str.replace(/^pipe:/, '');

    if (cutStr.slice(0, 4) !== '\\\\.\\') {
      throw new Error(`Invalid Windows named pipe endpoint: ${str}`);
    }

    return [cutStr];
  }

  if (str.startsWith('unix:')) {
    const pathname = str.slice('unix:'.length);
    if (!pathname) {
      throw new Error(`Invalid UNIX domain socket endpoint: ${str}`);
    }

    return [pathname];
  }

  const tcpMatch = TCP_PATTERN.exec(str);
  if (tcpMatch) {
    return [
      parseInt(tcpMatch.port.input || String(defaultPort), 10),
      tcpMatch.hostname.input.replace(/^\[(.*)\]$/, '$1') || undefined,
    ];
  }

  const hostPort = str.match(/^([A-Za-z0-9.-]+):(\d+)$/);
  if (hostPort) {
    return [parseInt(hostPort[2], 10), hostPort[1]];
  }

  if (!str.includes('://')) {
    return [defaultPort, str];
  }

  const protocol = str.match(/^([A-Za-z][A-Za-z0-9+.-]*:)/)?.[1] ?? null;
  throw new Error(`Unknown \`--listen\` scheme (protocol): ${protocol}`);
}

export function replaceLocalhost(address: string): string {
  return address.replace('[::]', 'localhost').replace('0.0.0.0', 'localhost');
}
