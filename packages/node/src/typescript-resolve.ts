import { createRequire } from 'module';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';

const require_ = createRequire(__filename);

export type ResolvedTypescript = {
  /** Package that exposes the classic Compiler API (TS ≤ 6). */
  apiModulePath: string;
  apiVersion: string;
  /** Absolute path to a native TS ≥ 7 `tsc` binary, when available. */
  nativeTscPath?: string;
  nativeVersion?: string;
  /** True when the user's project resolved to TypeScript ≥ 7. */
  userIsNative: boolean;
};

function readPackageVersion(modulePath: string): string | undefined {
  // modulePath may be .../typescript/lib/typescript.js (TS5/6) or
  // .../typescript/lib/version.cjs (TS7). Walk up to package.json.
  let dir = dirname(modulePath);
  for (let i = 0; i < 4; i++) {
    const pkgPath = join(dir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
          name?: string;
          version?: string;
        };
        if (pkg.name === 'typescript' && pkg.version) {
          return pkg.version;
        }
      } catch {
        // ignore malformed package.json
      }
    }
    dir = dirname(dir);
  }
  return undefined;
}

function majorVersion(version: string | undefined): number {
  if (!version) return 0;
  const major = Number.parseInt(version.split('.')[0] || '0', 10);
  return Number.isFinite(major) ? major : 0;
}

function resolvePackage(
  specifier: string,
  paths: string[]
): string | undefined {
  try {
    return require_.resolve(specifier, { paths });
  } catch {
    return undefined;
  }
}

function tscBinFromModule(modulePath: string): string | undefined {
  let dir = dirname(modulePath);
  for (let i = 0; i < 4; i++) {
    const candidate = join(dir, 'bin', 'tsc');
    if (existsSync(candidate)) {
      return candidate;
    }
    dir = dirname(dir);
  }
  return undefined;
}

/**
 * Resolve a Compiler-API-capable TypeScript module plus an optional native
 * TypeScript 7+ `tsc` binary.
 *
 * TypeScript 7 removed the classic Compiler API from the `typescript` package
 * export. Projects that depend on `typescript@7` must not be `require()`'d for
 * `createLanguageService` / `transpileModule` / `ts-morph`. Instead we keep a
 * built-in TS5/6 for the API and use the native `tsc` binary for typechecking.
 */
export function resolveTypescript(options: {
  projectPath: string;
  compiler?: string;
}): ResolvedTypescript {
  const { projectPath, compiler } = options;

  const userModulePath = resolvePackage(compiler || 'typescript', [
    projectPath,
  ]);
  const builtinModulePath = resolvePackage('typescript', [
    join(__dirname, '..'),
  ]);
  const nativePackageModulePath =
    resolvePackage('@typescript/native', [join(__dirname, '..')]) ||
    resolvePackage('@typescript/native', [projectPath]);

  let userVersion: string | undefined;
  let userIsNative = false;
  let nativeTscPath: string | undefined;
  let nativeVersion: string | undefined;

  if (userModulePath) {
    userVersion = readPackageVersion(userModulePath);
    userIsNative = majorVersion(userVersion) >= 7;
    if (userIsNative) {
      nativeTscPath = tscBinFromModule(userModulePath);
      nativeVersion = userVersion;
    }
  }

  // Prefer a shipped native binary when the user has not provided TS7+.
  if (!nativeTscPath && nativePackageModulePath) {
    const version = readPackageVersion(nativePackageModulePath);
    if (majorVersion(version) >= 7) {
      nativeTscPath = tscBinFromModule(nativePackageModulePath);
      nativeVersion = version;
    }
  }

  // Compiler API module: never use a native-only TS7 package.
  let apiModulePath: string | undefined;
  let apiVersion: string | undefined;

  if (userModulePath && !userIsNative) {
    apiModulePath = userModulePath;
    apiVersion = userVersion;
  } else if (builtinModulePath) {
    const builtinVersion = readPackageVersion(builtinModulePath);
    if (majorVersion(builtinVersion) >= 7) {
      throw new Error(
        `@vercel/node requires a TypeScript Compiler API package (typescript@≤6), but the built-in resolved to ${builtinVersion}. Install typescript@5/6 or @typescript/typescript6.`
      );
    }
    apiModulePath = builtinModulePath;
    apiVersion = builtinVersion;
  }

  if (!apiModulePath || !apiVersion) {
    throw new Error(
      'Unable to resolve a TypeScript Compiler API package for @vercel/node'
    );
  }

  return {
    apiModulePath,
    apiVersion,
    nativeTscPath,
    nativeVersion,
    userIsNative,
  };
}

export function shouldUseNativeTypecheck(
  resolved: ResolvedTypescript,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!resolved.nativeTscPath) return false;
  // Emergency rollback / force Language Service path.
  if (env.VERCEL_NODE_NATIVE_TYPECHECK === '0') return false;
  // Users on TypeScript ≥ 7 cannot use the Compiler API, so native `tsc` is
  // the only viable typecheck path for them.
  if (resolved.userIsNative) return true;
  // Opt-in spike: ship `@typescript/native` and set this to try TS7 typecheck
  // while keeping transpile on the classic API.
  return env.VERCEL_NODE_NATIVE_TYPECHECK === '1';
}
