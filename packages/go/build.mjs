import { buildBuilder } from '../../utils/build-builder.mjs';
import { cpSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

await buildBuilder();

// Locate the @vercel-internals/ipc-proxy package directory.
const ipcProxyDir = dirname(
  require.resolve('@vercel-internals/ipc-proxy/package.json')
);

// Copy the prebuilt IPC proxy binaries into bin/ so they ship in the
// tarball. When esbuild bundles @vercel-internals/ipc-proxy into
// dist/index.js, __dirname resolves to dist/ and getProxyBinaryPath()
// looks for the binaries at join(__dirname, '..', 'bin').
const binSrc = join(ipcProxyDir, 'bin');
const binDest = join(__dirname, 'bin');
mkdirSync(binDest, { recursive: true });
cpSync(binSrc, binDest, { recursive: true });

// Copy the shared Go helper source (utils.go) into bootstrap/ so the
// `vercel dev` wrapper (vc-init-dev.go) can compile against it via
// `go run`. The production proxy ships as a prebuilt binary, so only the
// shared helpers are needed here (not proxy.go).
cpSync(
  join(ipcProxyDir, 'bootstrap', 'utils.go'),
  join(__dirname, 'bootstrap', 'utils.go')
);
