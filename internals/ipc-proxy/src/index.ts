import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Lambda, FileBlob, type Files } from '@vercel/build-utils';

/** Supported Lambda architectures. */
export type LambdaArchitecture = 'x86_64' | 'arm64';

/** Languages supported by the `executable` runtime. */
export type LambdaExecutableRuntimeLanguages = 'rust' | 'go';

/** Options accepted by the `Lambda` constructor. */
type LambdaConstructorOptions = ConstructorParameters<typeof Lambda>[0];

/**
 * Maps a Vercel architecture to the prebuilt proxy binary filename.
 */
function proxyBinaryName(architecture: LambdaArchitecture): string {
  return architecture === 'arm64' ? 'proxy-linux-arm64' : 'proxy-linux-amd64';
}

/**
 * Returns the absolute path to the prebuilt IPC proxy binary for the
 * given target architecture.
 *
 * The proxy is a static (CGO-free) Go binary that handles the Vercel
 * "executable" runtime protocol: it connects to the `VERCEL_IPC_PATH`
 * Unix socket, spawns the user's server binary (`./user-server`) with a
 * `PORT` env var, reverse-proxies HTTP traffic to it, answers the
 * `/_vercel/ping` health check, and emits IPC lifecycle messages.
 *
 * The binaries are compiled at package build time (see `build.mjs`) and
 * shipped in this package's `bin/` directory.
 *
 * When this package is bundled by esbuild into a consumer (e.g.
 * `@vercel/go`), `__dirname` resolves to the consumer's `dist/`
 * directory. The consumer's build step must copy the prebuilt binaries
 * to `../bin` relative to its `dist/` output.
 */
export function getProxyBinaryPath(architecture: LambdaArchitecture): string {
  const binPath = join(__dirname, '..', 'bin', proxyBinaryName(architecture));
  if (!existsSync(binPath)) {
    throw new Error(
      `IPC proxy binary not found for architecture "${architecture}" at ${binPath}. ` +
        `Ensure @vercel-internals/ipc-proxy has been built and its prebuilt ` +
        `binaries copied alongside the consumer's dist output.`
    );
  }
  return binPath;
}

/**
 * Returns the path to the IPC proxy bootstrap source directory.
 *
 * This directory contains the Go source files (`proxy.go`, `utils.go`,
 * `go.mod`). It is the source from which the prebuilt binaries are
 * compiled, and is also consumed by builders that need the shared Go
 * helpers at dev time (e.g. `@vercel/go`'s `vercel dev` wrapper, which
 * compiles `utils.go` via `go run`).
 */
export function getBootstrapDir(): string {
  return join(__dirname, '..', 'bootstrap');
}

export interface CreateStandaloneLambdaOptions {
  /** Absolute path to the compiled user server binary. */
  userServerPath: string;
  /** Target architecture for the function. */
  architecture: LambdaArchitecture;
  /**
   * Resolved lambda options (memory, maxDuration, regions, ...), typically
   * from `getLambdaOptionsFromFunction`.
   */
  lambdaOptions?: Partial<LambdaConstructorOptions>;
  /** Additional files to include alongside the proxy and user server. */
  includedFiles?: Files;
  /** The language of the user server binary, used for diagnostics. */
  runtimeLanguage: LambdaExecutableRuntimeLanguages;
  /** Whether the function supports response streaming. Defaults to `true`. */
  supportsResponseStreaming?: boolean;
}

/**
 * Assembles a `Lambda` for a standalone (bring-your-own-HTTP-server)
 * compiled runtime.
 *
 * The output ships two binaries:
 * - `executable`  — the shared IPC proxy (handles the Vercel protocol)
 * - `user-server` — the user's compiled HTTP server (binds `PORT`)
 *
 * The proxy is the function entrypoint (`runtime: 'executable'`); it
 * spawns `user-server` and reverse-proxies requests to it. This is shared
 * across all compiled runtimes (Go, Rust, and any future ones) so that
 * each builder does not need to reimplement the IPC protocol.
 */
export async function createStandaloneLambda(
  options: CreateStandaloneLambdaOptions
): Promise<Lambda> {
  const {
    userServerPath,
    architecture,
    lambdaOptions,
    includedFiles,
    runtimeLanguage,
    supportsResponseStreaming = true,
  } = options;

  const proxyPath = getProxyBinaryPath(architecture);

  const [proxyData, userServerData] = await Promise.all([
    readFile(proxyPath),
    readFile(userServerPath),
  ]);

  return new Lambda({
    ...lambdaOptions,
    files: {
      ...includedFiles,
      // The IPC proxy is the main entrypoint (handles the Vercel protocol).
      executable: new FileBlob({ mode: 0o755, data: proxyData }),
      // The user's server is spawned by the proxy.
      'user-server': new FileBlob({ mode: 0o755, data: userServerData }),
    },
    handler: 'executable',
    runtime: 'executable',
    supportsResponseStreaming,
    architecture,
    runtimeLanguage,
  });
}
