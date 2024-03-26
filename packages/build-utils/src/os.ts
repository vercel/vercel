import { readFile } from 'fs-extra';

// We don't expect this file to change, so just
// run this logic once and cache afterwards
let cache: Record<string, string> | undefined;

export async function getOsRelease(): Promise<Record<string, string>> {
  if (!cache) {
    cache = {};
    // Example file contents:
    //   NAME="Amazon Linux"
    //   VERSION="2023"
    //   ID="amzn"
    //   ID_LIKE="fedora"
    const data = await readFile('/etc/os-release', 'utf8').catch(err => {
      if (err.code !== 'ENOENT') throw err;
    });
    if (!data) return cache;
    for (const line of data.trim().split('\n')) {
      const m = /(?<key>.*)="(?<value>.*)"/.exec(line);
      if (!m?.groups)
        throw new Error(
          `Failed to parse "/etc/os-release" file on line: "${line}"`
        );
      cache[m.groups.key] = m.groups.value;
    }
  }
  return cache;
}
