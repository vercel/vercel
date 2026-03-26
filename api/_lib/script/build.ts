import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import tar from 'tar-fs';
import { pipeline } from 'stream/promises';
import { join, dirname } from 'path';
import { getExampleList } from '../examples/example-list';
import { mapOldToNew } from '../examples/map-old-to-new';

const repoRoot = join(__dirname, '..', '..', '..');
const pubDir = join(repoRoot, 'public');
const ignoredPackages = [];

async function main() {
  console.log(`Building static frontend ${repoRoot}...`);

  await fs.rm(pubDir, { recursive: true, force: true });
  await fs.mkdir(pubDir);

  await fs.cp(
    join(repoRoot, 'packages', 'frameworks', 'logos'),
    join(pubDir, 'framework-logos'),
    { recursive: true, force: true }
  );

  await fs.cp(
    join(repoRoot, 'packages', 'fs-detectors', 'logos'),
    join(pubDir, 'monorepo-logos'),
    { recursive: true, force: true }
  );

  const examples = await getExampleList();
  const pathListAll = join(pubDir, 'list-all.json');
  await fs.writeFile(pathListAll, JSON.stringify(examples));

  const exampleDirPath = join(repoRoot, 'examples');
  const exampleDirs = await fs.readdir(exampleDirPath, {
    withFileTypes: true,
  });

  const existingExamples = exampleDirs
    .filter(
      dir =>
        dir.isDirectory() &&
        dir.name !== 'node_modules' &&
        dir.name !== '__tests__'
    )
    .map(dir => ({
      name: dir.name,
      visible: true,
      suggestions: [],
    }));

  const oldExamples = Object.keys(mapOldToNew).map(key => ({
    name: key,
    visible: false,
    suggestions: mapOldToNew[key],
  }));

  const pathList = join(pubDir, 'list.json');
  await fs.writeFile(
    pathList,
    JSON.stringify([...existingExamples, ...oldExamples])
  );

  const tarballsDir = join(pubDir, 'tarballs');
  const packagesDir = join(repoRoot, 'packages');
  const packages = await fs.readdir(packagesDir);
  for (const pkg of packages) {
    if (ignoredPackages.includes(pkg)) {
      continue;
    }

    const fullDir = join(packagesDir, pkg);
    const packageJsonRaw = await fs
      .readFile(join(fullDir, 'package.json'), 'utf-8')
      .catch(() => null);
    if (!packageJsonRaw) {
      // `package.json` might not exist if this directory exists due to the
      // Vercel deployment's build cache (even though the package has been
      // deleted). So skip in that case.
      continue;
    }

    const packageJson = JSON.parse(packageJsonRaw);
    const files = await fs.readdir(fullDir);
    const tarballName = files.find(f => /^vercel-.+\.tgz$/.test(f));
    if (!tarballName) {
      throw new Error(
        `Expected vercel-*.tgz in ${fullDir} but found ${JSON.stringify(
          files,
          null,
          2
        )}`
      );
    }
    const srcTarballPath = join(fullDir, tarballName);
    const destTarballPath = join(tarballsDir, `${packageJson.name}.tgz`);
    await fs.mkdir(dirname(destTarballPath), { recursive: true });
    await fs.copyFile(srcTarballPath, destTarballPath);
  }

  // Copy Python wheels to tarballs, preserving the original filename
  // (uv requires valid wheel tags in the filename for URL installs).
  // Write a well-known sidecar .json with full .whl name.
  const pythonDir = join(repoRoot, 'python');
  try {
    const pythonPackages = await fs.readdir(pythonDir, { withFileTypes: true });
    for (const entry of pythonPackages) {
      if (!entry.isDirectory()) continue;
      const distDir = join(pythonDir, entry.name, 'dist');
      let distFiles: string[];
      try {
        distFiles = await fs.readdir(distDir);
      } catch {
        continue;
      }
      // Wheels sort lexicographically by version; pick the latest.
      const wheelFiles = distFiles.filter(f => f.endsWith('.whl')).sort();
      const wheelFile = wheelFiles.at(-1);
      if (wheelFile) {
        await fs.mkdir(tarballsDir, { recursive: true });
        await fs.copyFile(
          join(distDir, wheelFile),
          join(tarballsDir, wheelFile)
        );
        await fs.writeFile(
          join(tarballsDir, `${entry.name}-wheel.json`),
          JSON.stringify({ filename: wheelFile })
        );
        console.log(`Copied Python wheel ${wheelFile} to tarballs/`);
      }
    }
  } catch {
    console.log('No Python packages found - skipping wheel copy');
  }

  // Create (ungzipped) tarballs of the examples / templates
  const examplesOutputDir = join(pubDir, 'api/examples/download');
  await fs.mkdir(examplesOutputDir, { recursive: true });
  for (const dir of exampleDirs) {
    const dirName = join(exampleDirPath, dir.name);
    const stream = tar.pack(dirName);
    const tarGzPath = join(examplesOutputDir, `${dir.name}.tar.gz`);
    await pipeline(stream, createWriteStream(tarGzPath));
    console.log(`Wrote "${tarGzPath}"`);
  }

  console.log('Completed building static frontend.');
}

main().catch(err => {
  console.log('error running build:', err);
  process.exit(1);
});
