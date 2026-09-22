import fs from 'node:fs';
import path from 'node:path';
import type { FileFsRef, Files } from '@vercel/build-utils';
import { debug, glob, runShellScript } from '@vercel/build-utils';

const CARGO_MANIFEST = 'Cargo.toml';

/**
 * Every directory in `files` holding a `Cargo.toml`, as `''` or `'apps/api/'`.
 * Anchoring on manifests avoids dropping a Rust module named `target`.
 */
function cargoManifestDirs(files: Files): string[] {
  return Object.keys(files)
    .filter(
      filePath =>
        filePath === CARGO_MANIFEST || filePath.endsWith(`/${CARGO_MANIFEST}`)
    )
    .map(filePath => filePath.slice(0, -CARGO_MANIFEST.length));
}

/**
 * Drop cargo's build output from the files handed to `download()`, which would
 * otherwise copy each file onto itself and truncate the compiled binary — and
 * cargo may then consider the build fresh and deploy it as-is.
 *
 * The default ignore list only covers a root `/target`, so nested crates and
 * `CARGO_TARGET_DIR` still come through. An absolute `CARGO_TARGET_DIR` is a
 * single shared directory for every crate: when it points inside `workPath` it
 * is excluded relative to it, and when it points outside it never appears in
 * `files` to begin with.
 */
export function excludeCargoTargetDir(
  files: Files,
  env: NodeJS.ProcessEnv = process.env,
  workPath?: string
): Files {
  const rawTargetDir = env.CARGO_TARGET_DIR || 'target';
  const prefixes: string[] = [];

  if (path.isAbsolute(rawTargetDir)) {
    if (workPath) {
      const relative = path.relative(
        path.resolve(workPath),
        path.resolve(rawTargetDir)
      );
      if (relative && !relative.startsWith('..')) {
        prefixes.push(`${relative.split(path.sep).join('/')}/`);
      }
    }
  } else {
    const targetDir = rawTargetDir.replace(/^\.\//, '').replace(/\/+$/, '');
    // Seeded unconditionally: the root manifest may be absent from the map.
    prefixes.push(`${targetDir}/`);
    for (const dir of cargoManifestDirs(files)) {
      prefixes.push(`${dir}${targetDir}/`);
    }
  }

  const filtered: Files = {};
  let excluded = 0;

  for (const [filePath, file] of Object.entries(files)) {
    if (prefixes.some(prefix => filePath.startsWith(prefix))) {
      excluded++;
      continue;
    }
    filtered[filePath] = file;
  }

  if (excluded > 0) {
    debug(
      `Excluded ${excluded} file(s) under \`${rawTargetDir}\` from the build`
    );
  }

  return filtered;
}

/** Error for a `vercel_runtime` build whose entrypoint file does not exist. */
export function missingEntrypointError(
  entrypoint: string,
  isApiHandler: boolean
): Error {
  if (!isApiHandler) {
    return new Error(
      `This project depends on \`vercel_runtime\` but \`${entrypoint}\` was not found. ` +
        'To deploy a standalone server, add a `src/main.rs` and remove the `vercel_runtime` dependency.'
    );
  }
  return new Error(
    `Entrypoint "${entrypoint}" was not found. Make sure the file exists, or set the entrypoint to the Rust source file you want to deploy.`
  );
}

export function getExecutableName(binName: string): string {
  // The compiled binary in Windows has the `.exe` extension
  return process.platform === 'win32' ? `${binName}.exe` : binName;
}

export function assertEnv(name: string): string {
  if (!process.env[name]) {
    throw new Error(`Missing ENV variable process.env.${name}`);
  }
  return process.env[name] as unknown as string;
}

export async function runUserScripts(dir: string): Promise<void> {
  const buildScriptPath = path.join(dir, 'build.sh');
  const buildScriptExists = fs.existsSync(buildScriptPath);

  if (buildScriptExists) {
    debug('Running `build.sh`');
    await runShellScript(buildScriptPath);
  }
}

export async function gatherExtraFiles(
  globMatcher: string | string[] | undefined,
  workPath: string
): Promise<Record<string, FileFsRef>> {
  if (!globMatcher) return {};

  debug(
    `Gathering extra files for glob \`${JSON.stringify(
      globMatcher
    )}\` in ${workPath}`
  );

  if (Array.isArray(globMatcher)) {
    const allMatches = await Promise.all(
      globMatcher.map(pattern => glob(pattern, workPath))
    );

    return allMatches.reduce((acc, matches) => ({ ...acc, ...matches }), {});
  }

  return glob(globMatcher, workPath);
}
