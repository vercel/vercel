import { basename, join } from 'path';
import fetch from 'node-fetch';
import { extract } from 'tar';
import pipe from 'promisepipe';
import { createWriteStream, readFile, writeFile, chmod } from 'fs-extra';
import { unzip, zipFromFile } from './unzip';

export async function install(
  dest: string,
  version: string,
  platform: string,
  arch: string
): Promise<void> {
  const tarballUrl = getUrl(version, platform, arch);
  console.log('Downloading from ' + tarballUrl);
  console.log('Downloading to ' + dest);
  const res = await fetch(tarballUrl);
  if (!res.ok) {
    throw new Error(`HTTP request failed: ${res.status}`);
  }
  let pathToManifest: string;
  if (platform === 'win32') {
    // Put it in the `bin` dir for consistency with the tarballs
    const finalDest = join(dest, 'bin');
    const zipName = basename(tarballUrl);
    const zipPath = join(dest, zipName);

    await pipe(
      res.body,
      createWriteStream(zipPath)
    );

    const zipFile = await zipFromFile(zipPath);
    await unzip(zipFile, finalDest, { strip: 1 });
    pathToManifest = join(dest, 'bin', 'node_modules', 'npm', 'package.json');
  } else {
    const extractStream = extract({ strip: 1, C: dest });
    if (!extractStream.destroy) {
      // If there is an error in promisepipe,
      // it expects a destroy method
      extractStream.destroy = () => {};
    }
    await pipe(
      res.body,
      extractStream
    );
    pathToManifest = join(dest, 'lib', 'node_modules', 'npm', 'package.json');
  }

  if (process.env.platform !== 'win32' && platform === 'win32') {
    // Windows doesn't have permissions so this allows
    // the tests run in Mac/Linux against the Windows zip
    await chmod(pathToManifest, 0o444);
  }

  const json = await readFile(pathToManifest, 'utf8');
  const manifest = JSON.parse(json);
  const metadata = JSON.stringify({ npmVersion: manifest.version });
  await writeFile(join(dest, 'now-metadata.json'), metadata);
}

export function getUrl(
  version: string,
  platform: string = process.platform,
  arch: string = process.arch
): string {
  let ext: string;
  let plat: string;
  if (platform === 'win32') {
    ext = 'zip';
    plat = 'win';
  } else {
    ext = 'tar.gz';
    plat = platform;
  }
  return `https://nodejs.org/dist/v${version}/node-v${version}-${plat}-${arch}.${ext}`;
}
