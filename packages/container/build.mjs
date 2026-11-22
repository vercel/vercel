import { execFileSync } from 'node:child_process';
import { resolveGo } from '@vercel-internals/ipc-proxy/go-toolchain.mjs';
import { buildBuilder } from '../../utils/build-builder.mjs';

await buildBuilder({
  entryPoints: {
    index: 'src/index.ts',
    'buildah-store-command': 'src/buildah-store-cache/command/main.ts',
  },
});
// Container functions target linux/amd64. A static binary needs neither Go
// nor a C library in the user's image.
const { goBin, env } = await resolveGo();
execFileSync(
  goBin,
  [
    'build',
    '-trimpath',
    '-ldflags=-s -w',
    '-o',
    '../dist/schedules-command-dispatcher',
    '.',
  ],
  {
    cwd: 'schedules-command-dispatcher',
    env: { ...env, CGO_ENABLED: '0', GOOS: 'linux', GOARCH: 'amd64' },
    stdio: 'inherit',
  }
);
