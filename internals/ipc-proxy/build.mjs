// Standard TS build plus cross-compilation of the proxy Go source into static,
// CGO-free per-arch binaries shipped in `bin/`, so consuming builders never
// need a Go toolchain at deploy time.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirp } from 'fs-extra';
import execa from 'execa';
import { tsc, esbuild } from '../../utils/build.mjs';
import { resolveGo } from './go-toolchain.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const TARGETS = [
  { goarch: 'amd64', output: 'proxy-linux-amd64' },
  { goarch: 'arm64', output: 'proxy-linux-arm64' },
];

async function compileProxyBinaries() {
  const bootstrapDir = join(__dirname, 'bootstrap');
  const binDir = join(__dirname, 'bin');
  await mkdirp(binDir);

  const { goBin, env } = await resolveGo();

  for (const { goarch, output } of TARGETS) {
    const outputPath = join(binDir, output);
    console.log(`Compiling IPC proxy: linux/${goarch} -> bin/${output}`);
    // Inherit the full env so the Go toolchain can locate its cache/home on
    // every OS; only override the cross-compile settings.
    await execa(
      goBin,
      ['build', '-trimpath', '-ldflags=-s -w', '-o', outputPath, '.'],
      {
        cwd: bootstrapDir,
        env: {
          ...env,
          GOARCH: goarch,
          GOOS: 'linux',
          CGO_ENABLED: '0',
        },
        stdio: 'inherit',
      }
    );
  }
}

await Promise.all([tsc(), esbuild()]);
await compileProxyBinaries();
