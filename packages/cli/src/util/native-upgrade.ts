import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import {
  chmodSync,
  createReadStream,
  createWriteStream,
  realpathSync,
  rmSync,
} from 'fs';
import { rename } from 'fs/promises';
import https from 'https';
import type { IncomingMessage } from 'http';
import { dirname, join } from 'path';
import { pipeline } from 'stream/promises';
import output from '../output-manager';

const REPO = 'vercel/vercel';

function detectTarget(): string | undefined {
  let os: string | undefined;
  if (process.platform === 'darwin') {
    os = 'darwin';
  } else if (process.platform === 'linux') {
    os = 'linux';
  }

  let arch: string | undefined;
  if (process.arch === 'arm64') {
    arch = 'arm64';
  } else if (process.arch === 'x64') {
    arch = 'x64';
  }

  if (!os || !arch) {
    return undefined;
  }
  return `vercel-${os}-${arch}`;
}

function request(url: string, redirects = 5): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        const { statusCode, headers } = res;
        if (
          statusCode &&
          statusCode >= 300 &&
          statusCode < 400 &&
          headers.location
        ) {
          res.resume();
          if (redirects === 0) {
            reject(new Error(`Too many redirects fetching ${url}`));
            return;
          }
          resolve(
            request(new URL(headers.location, url).toString(), redirects - 1)
          );
          return;
        }
        if (!statusCode || statusCode >= 400) {
          res.resume();
          reject(new Error(`Request failed (${statusCode}) fetching ${url}`));
          return;
        }
        resolve(res);
      })
      .on('error', reject);
  });
}

async function fetchText(url: string): Promise<string> {
  const res = await request(url);
  let body = '';
  for await (const chunk of res) {
    body += chunk;
  }
  return body;
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await request(url);
  await pipeline(res, createWriteStream(dest));
}

async function fileChecksum(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function resolveLatestVersion(): Promise<string | undefined> {
  try {
    const body = await fetchText('https://registry.npmjs.org/vercel/latest');
    const parsed = JSON.parse(body);
    return typeof parsed?.version === 'string' ? parsed.version : undefined;
  } catch (err) {
    output.debug(`Failed to resolve latest version: ${err}`);
    return undefined;
  }
}

export async function executeStandaloneUpgrade(
  version?: string
): Promise<number> {
  const target = detectTarget();
  if (!target) {
    output.error(
      `Automatic upgrade is not supported on ${process.platform}/${process.arch}.`
    );
    return 1;
  }

  const resolvedVersion = version ?? (await resolveLatestVersion());
  if (!resolvedVersion) {
    output.error('Could not determine the latest version to install.');
    return 1;
  }

  let targetPath: string;
  try {
    targetPath = realpathSync(process.execPath);
  } catch (err) {
    output.error(`Could not resolve the running binary path: ${err}`);
    return 1;
  }

  const base = `https://github.com/${REPO}/releases/download/vercel@${resolvedVersion}`;
  const tmpFile = join(
    dirname(targetPath),
    `.vercel-upgrade-${process.pid}.tmp`
  );

  output.log('Upgrading Vercel CLI...');
  output.spinner(`Downloading Vercel CLI ${resolvedVersion}`);

  try {
    await downloadToFile(`${base}/${target}`, tmpFile);

    try {
      const sums = await fetchText(`${base}/${target}.sha256`);
      const expected = sums.trim().split(/\s+/)[0];
      const actual = await fileChecksum(tmpFile);
      if (expected && expected !== actual) {
        throw new Error(
          `checksum mismatch (expected ${expected}, got ${actual})`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('checksum mismatch')) {
        throw err;
      }
      output.warn(`Skipping checksum verification: ${message}`);
    }

    chmodSync(tmpFile, 0o755);

    const check = spawnSync(tmpFile, ['--version'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (check.status !== 0) {
      throw new Error('downloaded binary failed to execute');
    }

    await rename(tmpFile, targetPath);
    output.stopSpinner();
    output.success(`Vercel CLI has been upgraded to ${resolvedVersion}!`);
    return 0;
  } catch (err) {
    output.stopSpinner();
    rmSync(tmpFile, { force: true });

    const isPermission =
      err instanceof Error &&
      'code' in err &&
      (err as NodeJS.ErrnoException).code === 'EACCES';

    if (isPermission) {
      output.error(
        `Could not write to ${targetPath} (permission denied). Re-run the install script or check the file permissions.`
      );
    } else {
      output.error(
        `Upgrade failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    return 1;
  }
}
