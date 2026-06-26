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
import { dirname, join } from 'path';
import { pipeline } from 'stream/promises';
import fetch, { toNodeReadable, type Response } from './fetch';
import { fetchLatestVersion } from './get-latest-version';
import { getReleaseTarget } from './native-install';
import { isVersionCurrent } from './is-version-current';
import pkg from './pkg';
import output from '../output-manager';

const REPO = 'vercel/vercel';

const REQUEST_TOTAL_TIMEOUT = 120000;

async function fetchReleaseAsset(url: string): Promise<Response> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TOTAL_TIMEOUT),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Request failed (${response.status}) fetching ${url}`);
  }
  return response;
}

async function downloadToFile(url: string, dest: string): Promise<void> {
  const response = await fetchReleaseAsset(url);
  await pipeline(toNodeReadable(response.body), createWriteStream(dest));
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

    const checksumResponse = await fetchReleaseAsset(
      `${base}/${target}.sha256`
    );
    const sums = await checksumResponse.text();
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
