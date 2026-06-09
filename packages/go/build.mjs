import { buildBuilder } from '../../utils/build-builder.mjs';
import { cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

await buildBuilder();

const ipcProxyDir = dirname(
  require.resolve('@vercel-internals/ipc-proxy/package.json')
);

// Ship the prebuilt proxy binaries at ../bin relative to dist/, where the
// bundled getProxyBinaryPath() resolves them.
const binDest = join(__dirname, 'bin');
mkdirSync(binDest, { recursive: true });
cpSync(join(ipcProxyDir, 'bin'), binDest, { recursive: true });

// utils.go is compiled by the `vercel dev` wrapper (vc-init-dev.go) via `go run`.
cpSync(
  join(ipcProxyDir, 'bootstrap', 'utils.go'),
  join(__dirname, 'bootstrap', 'utils.go')
);
