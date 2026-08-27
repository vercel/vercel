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

  // Publish vendored Podman runtimes.
  // Previous behaviour: only copy if `packages/container/dist-runtimes/` exists locally.
  // That dir is gitignored (tars are 50-60MB each) so Vercel builds (Linux) saw it empty
  // and logged "No podman dist-runtimes found, skipping".
  // Fixed behaviour:
  //  1. If dist-runtimes already has tars (local dev / pre-built), use them.
  //  2. Otherwise, build them on-the-fly during vercel-build (works on Linux too now
  //     because build-podman-runtimes.mjs handles .pkg via bsdtar/xar, no pkgutil needed).
  //  3. If build fails, still publish what we have rather than crashing the site build.
  try {
    const { spawn } = await import('child_process');
    const distRuntimesDir = join(
      repoRoot,
      'packages',
      'container',
      'dist-runtimes'
    );
    let podmanTars = await fs
      .readdir(distRuntimesDir)
      .catch(() => [] as string[]);

    let podmanTarsFiltered = podmanTars.filter(f =>
      /^podman-v.+\.tar\.gz(\.sha256)?$/.test(f)
    );

    // If empty, attempt to build runtimes during vercel-build. This is the fix for the
    // "No podman dist-runtimes found" message on Vercel — the tars are not checked into git.
    if (!podmanTarsFiltered.length) {
      const verFromManifest = await (async () => {
        try {
          const manifestTs = await fs.readFile(
            join(repoRoot, 'packages/container/src/engines/podman/manifest.ts'),
            'utf8'
          );
          const m = manifestTs.match(
            /PODMAN_VENDOR_VERSION\s*=\s*['"]([^'"]+)['"]/
          );
          return m?.[1] ?? '5.4.2';
        } catch {
          return '5.4.2';
        }
      })();
      console.log(
        `No podman dist-runtimes found locally; building v${verFromManifest} from upstream (this may take ~2min on first build, cached thereafter)...`
      );
      // Vercel's build runs on Linux, but we need darwin tarballs too (for Mac users).
      // build-podman-runtimes.mjs now extracts darwin .pkg on Linux via bsdtar/xar/cpio,
      // so we can build all 4 platforms from Linux. No macOS host required.
      // Override with PODMAN_BUILD_PLATFORMS if you need to slim builds:
      //   PODMAN_BUILD_PLATFORMS=linux-only   -> linux only (fastest)
      //   PODMAN_BUILD_PLATFORMS=darwin-arm64  -> single arch etc
      const ALL = 'darwin-arm64,darwin-amd64,linux-amd64,linux-arm64';
      const raw = process.env.PODMAN_BUILD_PLATFORMS?.trim();
      const platformsArg =
        !raw || raw === 'all'
          ? ALL
          : raw === 'linux-only'
            ? 'linux-amd64,linux-arm64'
            : raw === 'darwin-only'
              ? 'darwin-arm64,darwin-amd64'
              : raw;
      const scriptPath = join(
        repoRoot,
        'packages/container/scripts/build-podman-runtimes.mjs'
      );
      try {
        await new Promise<void>((resolveP, reject) => {
          const child = spawn(
            'node',
            [
              scriptPath,
              '--version',
              verFromManifest,
              '--platforms',
              platformsArg,
            ],
            {
              stdio: 'inherit',
              env: { ...process.env, CI: '1' },
            }
          );
          child.on('error', reject);
          child.on('close', code =>
            code === 0
              ? resolveP()
              : reject(new Error(`build-podman-runtimes exited ${code}`))
          );
        });
        podmanTars = await fs
          .readdir(distRuntimesDir)
          .catch(() => [] as string[]);
        podmanTarsFiltered = podmanTars.filter(f =>
          /^podman-v.+\.tar\.gz(\.sha256)?$/.test(f)
        );
        if (podmanTarsFiltered.length) {
          console.log(
            `Built ${podmanTarsFiltered.filter(f => f.endsWith('.tar.gz')).length} podman runtime tarball(s) during vercel-build`
          );
        }
      } catch (buildErr) {
        console.warn(
          `podman runtime build during vercel-build failed, continuing without runtimes: ${(buildErr as Error).message}`
        );
        // Don't fail the whole site build — framework list etc still useful without runtimes
      }
    }

    if (podmanTarsFiltered.length) {
      // Version is inferred from first tarball filename: podman-v<ver>-<platform>.tar.gz
      const first =
        podmanTarsFiltered.find(f => f.endsWith('.tar.gz')) ??
        podmanTarsFiltered[0];
      const vMatch = first.match(/^podman-v([^-\s]+)-/);
      const ver = vMatch ? `v${vMatch[1]}` : 'v0';
      const outDir = join(pubDir, 'runtimes', 'podman', ver);
      await fs.mkdir(outDir, { recursive: true });
      for (const f of podmanTarsFiltered) {
        const src = join(distRuntimesDir, f);
        const dest = join(outDir, f.replace(/^podman-v[^-\s]+-/, 'podman-'));
        await fs.copyFile(src, dest);
        console.log(
          `Copied podman runtime ${f} -> runtimes/podman/${ver}/${dest.split('/').pop()}`
        );
      }
      // Also publish manifest for verifiability: SHA256SUMS + generated json
      const generatedManifestSrc = join(
        repoRoot,
        'packages',
        'container',
        'src/engines/podman/manifest.generated.json'
      );
      try {
        await fs.copyFile(generatedManifestSrc, join(outDir, 'manifest.json'));
        console.log(
          `Copied podman manifest to runtimes/podman/${ver}/manifest.json`
        );
      } catch {}
      // Build an aggregate SHA256SUMS file
      let lines: string[] = [];
      for (const f of podmanTarsFiltered.filter(x => x.endsWith('.tar.gz'))) {
        const shaName = `${f}.sha256`;
        const shaSidecar = podmanTarsFiltered.includes(shaName)
          ? join(distRuntimesDir, shaName)
          : null;
        try {
          const sha = shaSidecar
            ? (await fs.readFile(shaSidecar, 'utf8')).split(/\s+/)[0]
            : null;
          if (sha)
            lines.push(`${sha}  ${f.replace(/^podman-v[^-\s]+-/, 'podman-')}`);
        } catch {}
      }
      if (lines.length) {
        await fs.writeFile(join(outDir, 'SHA256SUMS'), lines.join('\n') + '\n');
      }
    } else {
      console.log(
        'No podman dist-runtimes found after attempted build, skipping runtimes/podman publish (framework list still served)'
      );
    }
  } catch (err) {
    console.warn(`podman runtime publish skipped: ${(err as Error).message}`);
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
