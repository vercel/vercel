// Vendored from vercel/api.
// See packages/cli/src/util/describe/vendor/README.md before editing.

import { FileBlob, type Files, type Lambda } from '@vercel/build-utils';

export interface EncryptedEnv {
  filename?: string;
  contentBase64?: string;
}

/**
 * Path AWS Lambda invokes for OS-only ("provided.*") runtimes.
 */
export const ROOT_BOOTSTRAP_PATH = 'bootstrap';

/**
 * Path where the user's original bootstrap is relocated inside the lambda.
 */
export const USER_BOOTSTRAP_PATH = '___vc_bootstrap';

/**
 * Runtime families that already honor `AWS_LAMBDA_EXEC_WRAPPER` on their own,
 * so they need no shim. Mirrors build-utils' `ENV_WRAPPER_SUPPORTED_FAMILIES`;
 * keep the two in sync. The AWS-managed runtimes (`nodejs`, `python`, `ruby`,
 * `java`, `dotnetcore`) honor it through AWS's own bootstrap, documented at
 * https://docs.aws.amazon.com/lambda/latest/dg/runtimes-modify.html; `bun` and
 * `executable` are Vercel-managed families treated the same way.
 */
const NATIVELY_WRAPPER_SUPPORTED_FAMILIES = [
  'nodejs',
  'python',
  'ruby',
  'java',
  'dotnetcore',
  'bun',
  'executable',
];

/**
 * POSIX-sh shim. Compatible with both Amazon Linux 2 and Amazon Linux 2023
 * base images shipped under `provided.al2` / `provided.al2023`.
 *
 * The shim:
 *  1. If `AWS_LAMBDA_EXEC_WRAPPER` is set, clears the env var to prevent
 *     infinite re-entry, then `exec`s the wrapper with the user's bootstrap
 *     as its argument.
 *  2. Otherwise `exec`s the user's bootstrap directly.
 *
 * `exec` (not fork) replaces the current process, so PID stays 1 from
 * Lambda's perspective and signal handling is unaffected.
 */
export const BOOTSTRAP_SHIM = `#!/bin/sh
USER_BOOTSTRAP="/var/task/${USER_BOOTSTRAP_PATH}"

if [ -n "\${AWS_LAMBDA_EXEC_WRAPPER:-}" ]; then
  __VC_WRAPPER="$AWS_LAMBDA_EXEC_WRAPPER"
  AWS_LAMBDA_EXEC_WRAPPER=""
  export AWS_LAMBDA_EXEC_WRAPPER
  exec "$__VC_WRAPPER" "$USER_BOOTSTRAP" "$@"
fi

exec "$USER_BOOTSTRAP" "$@"
`;

/**
 * Hydrate the filesystem by adding the encrypted environment file and
 * ensuring that the lambda is capable of loading it when invoked.
 *
 * For `provided.*` runtimes that don't honor `AWS_LAMBDA_EXEC_WRAPPER`,
 * this transparently injects a Vercel bootstrap shim ahead of the user's
 * bootstrap.
 */
export function hydrateLambdaFiles(
  lambda: Pick<Lambda, 'files' | 'runtime' | 'supportsWrapper'>,
  encryptedEnv: EncryptedEnv
): Files {
  const files = lambda.files ?? {};

  if (
    lambda.runtime === 'container' ||
    !encryptedEnv.filename ||
    !encryptedEnv.contentBase64
  ) {
    return files;
  }

  files[encryptedEnv.filename] = new FileBlob({
    data: Buffer.from(encryptedEnv.contentBase64, 'base64'),
  });

  if (
    lambda.supportsWrapper !== true &&
    !NATIVELY_WRAPPER_SUPPORTED_FAMILIES.some(family =>
      lambda.runtime.startsWith(family)
    )
  ) {
    if (!lambda.runtime.startsWith('provided')) {
      throw new Error(
        `Serverless Function runtime ${lambda.runtime} does not support more than 4KB for environment variables`
      );
    }

    const userBootstrap = files[ROOT_BOOTSTRAP_PATH];
    if (!userBootstrap) {
      throw new Error(
        `Serverless Function runtime ${lambda.runtime} does not support more than 4KB for environment variables`
      );
    }

    if (files[USER_BOOTSTRAP_PATH]) {
      throw new Error(
        `Cannot wrap "provided.*" lambda: reserved file path ${USER_BOOTSTRAP_PATH} is already in use. ` +
          `Please rename your file.`
      );
    }

    /**
     * Relocate the user's original bootstrap. We preserve the File reference
     * (mode bits, fsPath/symlink target, contentType) by moving the entry
     */
    files[USER_BOOTSTRAP_PATH] = userBootstrap;
    delete files[ROOT_BOOTSTRAP_PATH];

    /**
     * Install the shim at the canonical `bootstrap` path. Mode 0o100755 =
     * regular file + rwxr-xr-x; required so Lambda can exec it.
     */
    files[ROOT_BOOTSTRAP_PATH] = new FileBlob({
      data: BOOTSTRAP_SHIM,
      mode: 0o100755,
    });
  }

  return files;
}
