import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Lambda, FileBlob, type Files } from '@vercel/build-utils';

export type LambdaArchitecture = 'x86_64' | 'arm64';

export type LambdaExecutableRuntimeLanguages = 'rust' | 'go';

type LambdaConstructorOptions = ConstructorParameters<typeof Lambda>[0];

function proxyBinaryName(architecture: LambdaArchitecture): string {
  return architecture === 'arm64' ? 'proxy-linux-arm64' : 'proxy-linux-amd64';
}

// `__dirname` resolves to the consumer's `dist/` once bundled, so the
// consumer's build must copy the prebuilt binaries to `../bin`.
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

// Go source dir (proxy.go, utils.go, go.mod) — also consumed by builders
// that compile the shared helpers at dev time (e.g. @vercel/go's dev wrapper).
export function getBootstrapDir(): string {
  return join(__dirname, '..', 'bootstrap');
}

export interface CreateStandaloneLambdaOptions {
  userServerPath: string;
  architecture: LambdaArchitecture;
  /** Typically from `getLambdaOptionsFromFunction` (memory, maxDuration, ...). */
  lambdaOptions?: Partial<LambdaConstructorOptions>;
  includedFiles?: Files;
  runtimeLanguage: LambdaExecutableRuntimeLanguages;
  /** Defaults to `true`. */
  supportsResponseStreaming?: boolean;
}

// Assembles a Lambda that ships the shared IPC proxy as `executable` plus the
// user's HTTP server as `user-server`; the proxy spawns and reverse-proxies to it.
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
      executable: new FileBlob({ mode: 0o755, data: proxyData }),
      'user-server': new FileBlob({ mode: 0o755, data: userServerData }),
    },
    handler: 'executable',
    runtime: 'executable',
    supportsResponseStreaming,
    architecture,
    runtimeLanguage,
  });
}
