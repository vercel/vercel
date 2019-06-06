import { join } from 'path';
import fetch from 'node-fetch';
import { extract } from 'tar';
import pipe from 'promisepipe';

export async function install(dest: string, version: string) {
  const tarballUrl = `https://registry.npmjs.org/npm/-/npm-${version}.tgz`;
  console.log('Downloading from ' + tarballUrl);
  console.log('Downloading to ' + dest);
  const res = await fetch(tarballUrl);
  if (!res.ok) {
    throw new Error(`HTTP request failed: ${res.status}`);
  }
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

  const pathToManifest = join(dest, 'package.json');
  const manifest = require(pathToManifest);
  const entrypoint = manifest.bin.npm;
  return { entrypoint };
}
