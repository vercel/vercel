import type { ListenSpec } from './types';

type UrlPatternMatch = {
  hostname: { input: string };
  port: { input: string };
};

type UrlPattern = {
  exec(input: string): UrlPatternMatch | null;
};

type UrlPatternConstructor = new (init: {
  protocol: string;
  hostname: string;
  port: string;
}) => UrlPattern;

const NativeURLPattern = (globalThis as { URLPattern?: UrlPatternConstructor })
  .URLPattern;
const TCP_PATTERN = NativeURLPattern
  ? new NativeURLPattern({
      protocol: 'tcp',
      hostname: '*',
      port: '*',
    })
  : null;

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

  const tcpMatch = TCP_PATTERN?.exec(str);
  if (tcpMatch) {
    return [
      parseInt(tcpMatch.port.input || String(defaultPort), 10),
      tcpMatch.hostname.input.replace(/^\[(.*)\]$/, '$1') || undefined,
    ];
  }

  if (str.startsWith('tcp:')) {
    const url = new URL(str);
    return [
      parseInt(url.port || String(defaultPort), 10),
      url.hostname.replace(/^\[(.*)\]$/, '$1') || undefined,
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
