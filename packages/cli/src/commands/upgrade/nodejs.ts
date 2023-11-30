// import { packageName } from '../../util/pkg-name';
import type Client from '../../util/client';
import type { Project } from '@vercel-internals/types';
import { getNodeVersion, PackageJson } from '@vercel/build-utils';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { intersects, validRange } from 'semver';

type Writeable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Continuously checks a deployment status until it has succeeded, failed, or
 * taken longer than the timeout (default 3 minutes).
 *
 * @param {Client} client - The Vercel client instance
 * @param {Project} project - Project info instance
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function transformNodejs({
  client
}: {
  client: Client;
}): Promise<number> {
  const { output } = client;

  const latestNodeVersion = '20.x'; // TODO: get real latest
  const latestNpmVersion = '9.8.1'; // TODO: get real latest

  try {
    output.spinner(`Upgrading Node.js…`);

    // TODO: check for a clean git status, failing if dirty

    const packageJsonPath = path.join(client.cwd, 'package.json');
    const packageJsonContents = await readJson(packageJsonPath);
    if (!packageJsonContents) {
      throw new Error(`Could not parse package.json at: ${packageJsonPath}`);
    }
    const updatedPackageJson = await updatePackageJson(packageJsonContents, latestNodeVersion, latestNpmVersion);
    await writeJson(packageJsonPath, updatedPackageJson);

    // TODO: detect package manager by lockfile

    // TODO: if corepack enabled, ensure `packageManager` is set

    // TODO: use detected package manager to install dependencies

  } catch (error) {
    console.error(error);
    return 1;
  } finally {
    output.stopSpinner();
  }

  return 0;
}

async function readJson(jsonPath: string): Promise<Writeable<PackageJson> | undefined> {
  try {
    const fileContents = await readFile(jsonPath, 'utf8');
    return JSON.parse(fileContents);
  } catch (err) {
    // TODO
    console.error(err);
    return undefined;
  }
}

async function writeJson(jsonPath: string, jsonContents: Writeable<PackageJson>) {
  const writableContents = JSON.stringify(jsonContents, null, 2) + '\n';
  await writeFile(jsonPath, writableContents);
}

async function updatePackageJson(packageJsonContents: Writeable<PackageJson>, latestNodeVersion: string, latestNpmVersion: string): Promise<Writeable<PackageJson>> {
  const nodeVersion = packageJsonContents.engines?.node;
  const isOutdatedNodeVersion = nodeVersion && intersects(nodeVersion, `<${latestNodeVersion}`);
  if (!nodeVersion || isOutdatedNodeVersion) {
    packageJsonContents.engines ||= {};
    packageJsonContents.engines.node = latestNodeVersion;
  }

  const npmVersion = packageJsonContents.engines?.npm;
  const isOutdatedNpmVersion = npmVersion && intersects(npmVersion, `<${latestNpmVersion}`);
  if (!npmVersion || isOutdatedNpmVersion) {
    packageJsonContents.engines ||= {};
    packageJsonContents.engines.npm = latestNpmVersion;
  }

  return packageJsonContents;
}
