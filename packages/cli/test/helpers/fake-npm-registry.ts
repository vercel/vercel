import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { join } from 'path';
import execa from 'execa';
import { ensureDir, outputJSON, readFile, writeFile } from 'fs-extra';

export interface FakePackage {
  name: string;
  version: string;
  /** Contents of `index.js`. Defaults to a minimal v3 Builder. */
  index?: string;
}

interface PackedVersion {
  version: string;
  filename: string;
  shasum: string;
  integrity: string;
}

export interface FakeNpmRegistry {
  url: string;
  /** Request paths received, in order. */
  requests: string[];
  tarballUrl(name: string, version: string): string;
  close(): Promise<void>;
}

/**
 * Packs `packages` with `npm pack` and serves them from a loopback HTTP server
 * that answers like the npm registry. Anything unknown gets the registry's 404.
 */
export async function startFakeNpmRegistry(
  packages: FakePackage[],
  workDir: string
): Promise<FakeNpmRegistry> {
  const srcDirs: string[] = [];
  for (const pkg of packages) {
    const dir = join(workDir, 'src', `${pkg.name}@${pkg.version}`);
    await outputJSON(join(dir, 'package.json'), {
      name: pkg.name,
      version: pkg.version,
      main: 'index.js',
    });
    await writeFile(
      join(dir, 'index.js'),
      pkg.index ?? 'module.exports = { version: 3, build() {} };\n'
    );
    srcDirs.push(dir);
  }
  const packDir = join(workDir, 'packed');
  await ensureDir(packDir);
  const { stdout } = await execa(
    'npm',
    ['pack', '--json', '--pack-destination', packDir, ...srcDirs],
    // A separate cache, so installs must download the tarballs from the server.
    { cwd: workDir, env: { npm_config_cache: join(workDir, 'pack-cache') } }
  );
  const packed: (PackedVersion & { name: string })[] = JSON.parse(stdout);

  const byName = new Map<string, PackedVersion[]>();
  const byTarball = new Map<string, Buffer>();
  for (const { name, ...version } of packed) {
    byTarball.set(
      version.filename,
      await readFile(join(packDir, version.filename))
    );
    byName.set(name, [...(byName.get(name) ?? []), version]);
  }

  const requests: string[] = [];
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    requests.push(path);
    const tarball = path.startsWith('/tarballs/')
      ? byTarball.get(path.slice('/tarballs/'.length))
      : undefined;
    const versions = byName.get(path.slice(1));
    if (req.method === 'GET' && tarball) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(tarball);
    } else if (req.method === 'GET' && versions) {
      const packument = {
        name: path.slice(1),
        'dist-tags': { latest: versions[versions.length - 1].version },
        versions: Object.fromEntries(
          versions.map(v => [
            v.version,
            {
              name: path.slice(1),
              version: v.version,
              main: 'index.js',
              dist: {
                tarball: `${url}/tarballs/${v.filename}`,
                shasum: v.shasum,
                integrity: v.integrity,
              },
            },
          ])
        ),
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(packument));
    } else {
      // Same body as registry.npmjs.org, which npm echoes as `- Not found`.
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url,
    requests,
    tarballUrl(name, version) {
      const packedVersion = byName.get(name)?.find(v => v.version === version);
      if (!packedVersion) throw new Error(`${name}@${version} is not packed`);
      return `${url}/tarballs/${packedVersion.filename}`;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
        // npm leaves keep-alive sockets open.
        server.closeAllConnections();
      }),
  };
}
