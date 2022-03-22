import fs from 'fs-extra';
import { createGzip } from 'zlib';
import tar from 'tar-fs';
import { join } from 'path';
import { getExampleList } from './example-list';
import { mapOldToNew } from './map-old-to-new';
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

  const exampleDirs = (await fs.readdir(EXAMPLES_DIR)).filter(d => {
    const dir = join(EXAMPLES_DIR, d);
    const s = fs.statSync(dir);
    return s.isDirectory();
  });

  // Output `list.json`
  const existingExamples = Array.from(exampleDirs).map(key => ({
    name: key,
    visible: true,
    suggestions: [],
  }));
  const oldExamples = Object.keys(mapOldToNew).map(key => ({
    name: key,
    visible: false,
    suggestions: mapOldToNew[key],
  }));
  const list = [...existingExamples, ...oldExamples];
  await fs.writeJSON(join(PUBLIC_DIR, 'list-all.json'), list, {
    spaces: 2,
  });
  console.log(`Wrote "list.json"`);

  // Output `list-all.json`
  const examplesList = getExampleList();
  await fs.writeJSON(join(PUBLIC_DIR, 'list-all.json'), examplesList, {
    spaces: 2,
  });
  console.log(`Wrote "list-all.json"`);

  // Output `examples` tarballs
  const examplesOutputDir = join(PUBLIC_DIR, 'examples');
  await fs.mkdirp(examplesOutputDir);
  for (const name of exampleDirs) {
    const dirName = join(EXAMPLES_DIR, name);
    const stream = tar.pack(dirName);
    const tarPath = join(examplesOutputDir, `${name}.tar.gz`);
    await pipe(stream, createGzip(), fs.createWriteStream(tarPath));
    console.log(`Wrote "examples/${name}.tar.gz"`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
