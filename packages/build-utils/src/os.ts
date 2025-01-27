import { readFile } from 'fs-extra';
import { isErrnoException } from '@vercel/error-utils';

export async function getOsRelease() {
  try {
    const data = await readFile('/etc/os-release', 'utf8');
    return await parseOsRelease(data);
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function parseOsRelease(data: string) {
  const obj: Record<string, string> = {};
  // Example file contents:
  //   NAME="Amazon Linux"
  //   VERSION="2023"
  //   ID="amzn"
  //   ID_LIKE="fedora"
  for (const line of data.trim().split('\n')) {
    const m = /(?<key>.*)="(?<value>.*)"/.exec(line);
    if (!m?.groups) {
      continue;
    }
    obj[m.groups.key] = m.groups.value;
  }
  return obj;
}

export async function getProvidedRuntime() {
  const os = await getOsRelease();
  if (!os) {
    return 'provided.al2023';
  }

  return os.PRETTY_NAME === 'Amazon Linux 2'
    ? 'provided.al2'
    : 'provided.al2023';
}
