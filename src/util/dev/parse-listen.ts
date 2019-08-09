import { parse } from 'url';
import { ListenSpec } from './types';

export default function parseListen(str: string): ListenSpec {
  const port = Number(str);

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
        throw new Error(`Invalid Windows named pipe endpoint: ${str}`);
      }

      return [cutStr];
    }
    case 'unix:':
      if (!url.pathname) {
        throw new Error(`Invalid UNIX domain socket endpoint: ${str}`);
      }

      return [url.pathname];
    case 'tcp:':
      url.port = url.port || '5000';
      return [parseInt(url.port, 10), url.hostname];
    default:
      throw new Error(
        `Unknown --listen endpoint scheme (protocol): ${url.protocol}`
      );
  }
}
