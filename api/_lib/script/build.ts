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

  // Publish native optional-dep tarballs for preview installs.
  // `utils/pack.ts` rewrites vercel's optionalDependencies to point at
  // `https://<deployment>/tarballs/@vercel%2Fvc-native-*.tgz`. Those files
  // must exist for `npx https://.../vercel.tgz` to fetch a matching native.
  // If the preview did not build natives (dist-native absent), we skip;
  // the trampoline falls back to JS because npm treats failed optional deps
  // as non-fatal. When binaries exist we pack each staged native dir directly.
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);
    const nativeDistRoot = join(
      repoRoot,
      'packages',
      'vc-native',
      'dist-native'
    );
    const entries = await fs.readdir(nativeDistRoot, { withFileTypes: true });
    let staged = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullDir = join(nativeDistRoot, entry.name);
      const raw = await fs
        .readFile(join(fullDir, 'package.json'), 'utf-8')
        .catch(() => null);
      if (!raw) continue;
      const pkg = JSON.parse(raw);
      if (!pkg.name?.startsWith('@vercel/vc-native-')) continue;
      await fs.mkdir(tarballsDir, { recursive: true });
      // `pnpm pack` respects `files` and writes `<name>-<version>.tgz` into
      // the destination; we then rename to `<escaped>.tgz` to match the
      // `%40vercel%2F...` URL that pack.ts emits.
      const { stdout } = await execFileAsync(
        'pnpm',
        ['pack', '--pack-destination', tarballsDir, '--json'],
        { cwd: fullDir }
      );
      try {
        const info = JSON.parse(String(stdout).trim().split('\n').at(-1) ?? '');
        // pnpm pack --json prints [{ name, version, filename }]
        const filename = info?.[0]?.filename ?? info?.filename;
        if (filename) {
          const escaped = `${pkg.name.replace('@', '%40').replace('/', '%2F')}.tgz`;
          const src = join(tarballsDir, String(filename).split('/').pop()!);
          const dest = join(tarballsDir, escaped);
          if (src !== dest) {
            await fs.rename(src, dest).catch(async () => {
              await fs.copyFile(src, dest);
              await fs.rm(src, { force: true });
            });
          }
        }
      } catch {
        // Best-effort: if --json parsing failed, fall back to plain copy by
        // scanning the tarballs dir for the newest vercel-vc-native-*.tgz.
        const files = await fs.readdir(tarballsDir);
        const match = files
          .filter(f => f.startsWith('vercel-vc-native-') && f.endsWith('.tgz'))
          .sort()
          .at(-1);
        if (match) {
          const escaped = `${pkg.name.replace('@', '%40').replace('/', '%2F')}.tgz`;
          const src = join(tarballsDir, match);
          const dest = join(tarballsDir, escaped);
          if (src !== dest) {
            await fs.copyFile(src, dest);
            await fs.rm(src, { force: true });
          }
        }
      }
      staged++;
    }
    if (staged > 0) {
      console.log(`Staged ${staged} native tarball(s) into ${tarballsDir}`);
    } else {
      console.log(
        'No native tarballs staged (no dist-native match) — preview will be JS-only'
      );
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      console.warn(
        'Failed to stage native preview tarballs:',
        err?.message ?? err
      );
    } else {
      console.log(
        'No native tarballs — preview will be JS-only (dist-native absent)'
      );
    }
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
