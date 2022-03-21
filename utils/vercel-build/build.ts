import fs from 'fs-extra';
import { createGzip } from 'zlib';
import tar from 'tar-fs';
import { join } from 'path';
import _frameworks, { Framework } from '@vercel/frameworks';
// @ts-ignore
import pipe from 'promisepipe';

const ROOT_DIR = join(__dirname, '../..');
const EXAMPLES_DIR = join(ROOT_DIR, 'examples');
const PUBLIC_DIR = join(ROOT_DIR, 'public');

async function main() {
  // Start fresh
  await fs.remove(PUBLIC_DIR);
  await fs.mkdirp(PUBLIC_DIR);

  // Output `frameworks.json`
  const frameworks = (_frameworks as Framework[])
    .sort(
      (a, b) =>
        (a.sort || Number.MAX_SAFE_INTEGER) -
        (b.sort || Number.MAX_SAFE_INTEGER)
    )
    .map(frameworkItem => {
      const framework = {
        ...frameworkItem,
        detectors: undefined,
        sort: undefined,
        dependency: undefined,
        defaultRoutes: undefined,
      };

      if (framework.logo) {
        framework.logo = `https://res.cloudinary.com/zeit-inc/image/fetch/${framework.logo}`;
      }

      return framework;
    });

  await fs.writeJSON(join(PUBLIC_DIR, 'frameworks.json'), frameworks, {
    spaces: 2,
  });
  console.log(`Wrote "frameworks.json"`);

  // Output `examples` tarballs
  const exampleDirs = await fs.readdir(EXAMPLES_DIR);
  const examplesOutputDir = join(PUBLIC_DIR, 'examples');
  await fs.mkdirp(examplesOutputDir);
  for (const dirName of exampleDirs) {
    const dir = join(EXAMPLES_DIR, dirName);
    const s = await fs.stat(dir);
    if (!s.isDirectory()) continue; // skip `README.md`
    const stream = tar.pack(dir);
    const tarPath = join(examplesOutputDir, `${dirName}.tar.gz`);
    await pipe(stream, createGzip(), fs.createWriteStream(tarPath));
    console.log(`Wrote "examples/${dirName}.tar.gz"`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
