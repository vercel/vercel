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
import { fetchLatestVersion } from './get-latest-version';
import { getReleaseTarget } from './native-install';
import { isVersionCurrent } from './is-version-current';
import pkg from './pkg';
import output from '../output-manager';

const REPO = 'vercel/vercel';

const REQUEST_IDLE_TIMEOUT = 30000;
const REQUEST_TOTAL_TIMEOUT = 120000;

function request(url: string, redirects = 5): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: REQUEST_IDLE_TIMEOUT }, res => {
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
    });
    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out fetching ${url}`));
    });
    req.on('error', reject);
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
  const deadline = setTimeout(() => {
    res.destroy(new Error(`Download exceeded ${REQUEST_TOTAL_TIMEOUT}ms`));
  }, REQUEST_TOTAL_TIMEOUT);
  try {
    await pipeline(res, createWriteStream(dest));
  } finally {
    clearTimeout(deadline);
  }
}

async function fileChecksum(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function resolveLatestVersion(): Promise<string | undefined> {
  return fetchLatestVersion({ name: '@vercel/vc-native' });
}

export async function executeStandaloneUpgrade(
  version?: string
): Promise<number> {
  const target = getReleaseTarget();
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

  if (isVersionCurrent(pkg.version, resolvedVersion)) {
    output.log(
      `No upgrade available. Vercel CLI is already up to date (v${pkg.version}).`
    );
    return 0;
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
      if (!/^[0-9a-f]{64}$/i.test(expected)) {
        throw new Error(
          `checksum invalid: ${target}.sha256 did not contain a sha256 digest`
        );
      }
      const actual = await fileChecksum(tmpFile);
      if (expected.toLowerCase() !== actual.toLowerCase()) {
        throw new Error(
          `checksum mismatch (expected ${expected}, got ${actual})`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes('checksum mismatch') ||
        message.includes('checksum invalid')
      ) {
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
