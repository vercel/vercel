import isPortReachable from 'is-port-reachable';
import { dev } from './diagnostics';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getReachableHostOnPort(port: number): Promise<string | false> {
  const optsIpv4 = { host: '127.0.0.1' };
  const optsIpv6 = { host: '::1' };
  const results = await Promise.all([
    isPortReachable(port, optsIpv6).then(r => r && `[${optsIpv6.host}]`),
    isPortReachable(port, optsIpv4).then(r => r && optsIpv4.host),
  ]);
  return results.find(Boolean) || false;
}

export async function checkForPort(
  port: number,
  timeout: number
): Promise<string> {
  let host;
  const start = Date.now();
  while (!(host = await getReachableHostOnPort(port))) {
    if (Date.now() - start > timeout) {
      break;
    }
    await sleep(100);
  }
  if (!host) {
    throw dev.DEV_PORT_DETECTION_TIMED_OUT({ port, timeout });
  }
  return host;
}
