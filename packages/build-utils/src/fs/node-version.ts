import { statSync } from 'fs';
import { intersects, validRange } from 'semver';
import { BunVersion, NodeVersion, Version } from '../types';
import { NowBuildError } from '../errors';
import debug from '../debug';
import execa from 'execa';

export type NodeVersionMajor = ReturnType<typeof getOptions>[number]['major'];

// Track which versions we've already logged to avoid duplicates
const loggedVersions = new Set<string>();

// `NODE_VERSIONS` is assumed to be sorted by version number
// with the newest supported version first
export const NODE_VERSIONS: NodeVersion[] = [
  new NodeVersion({
    major: 22,
    range: '22.x',
    runtime: 'nodejs22.x',
  }),
  new NodeVersion({
    major: 20,
    range: '20.x',
    runtime: 'nodejs20.x',
  }),
  new NodeVersion({
    major: 18,
    range: '18.x',
    runtime: 'nodejs18.x',
    discontinueDate: new Date('2025-09-01'),
  }),
  new NodeVersion({
    major: 16,
    range: '16.x',
    runtime: 'nodejs16.x',
    discontinueDate: new Date('2025-02-03'),
  }),
  new NodeVersion({
    major: 14,
    range: '14.x',
    runtime: 'nodejs14.x',
    discontinueDate: new Date('2023-08-15'),
  }),
  new NodeVersion({
    major: 12,
    range: '12.x',
    runtime: 'nodejs12.x',
    discontinueDate: new Date('2022-10-03'),
  }),
  new NodeVersion({
    major: 10,
    range: '10.x',
    runtime: 'nodejs10.x',
    discontinueDate: new Date('2021-04-20'),
  }),
  new NodeVersion({
    major: 8,
    range: '8.10.x',
    runtime: 'nodejs8.10',
    discontinueDate: new Date('2020-01-06'),
  }),
];

export const BUN_VERSIONS: BunVersion[] = [
  new BunVersion({
    major: 1,
    range: '1.x',
    runtime: 'bun1.x',
  }),
];

export function getNodeVersionByMajor(major: number): NodeVersion | undefined {
  return getOptions().find(v => v.major === major);
}

function getOptions(): NodeVersion[] {
  if (process.env.VERCEL_ALLOW_NODEJS_24 === '1') {
    return [
      new NodeVersion({
        major: 24,
        range: '24.x',
        runtime: 'nodejs24.x',
      }),
      ...NODE_VERSIONS,
    ];
  }
  return NODE_VERSIONS;
}

function isNodeVersionAvailable(version: NodeVersion): boolean {
  try {
    return statSync(`/node${version.major}`).isDirectory();
  } catch {
    // ENOENT, or any other error, we don't care about
  }
  return false;
}

export function getAvailableNodeVersions(): NodeVersionMajor[] {
  return getOptions()
    .filter(isNodeVersionAvailable)
    .map(n => n.major);
}

function getHint(isAuto = false, availableVersions?: NodeVersionMajor[]) {
  const { major, range } = getLatestNodeVersion(availableVersions);
  return isAuto
    ? `Please set Node.js Version to ${range} in your Project Settings to use Node.js ${major}.`
    : `Please set "engines": { "node": "${range}" } in your \`package.json\` file to use Node.js ${major}.`;
}

export function getLatestNodeVersion(availableVersions?: NodeVersionMajor[]) {
  const all = getOptions();
  if (availableVersions) {
    // Return the first node version that is definitely
    // available in the build-container.
    for (const version of all) {
      for (const major of availableVersions) {
        if (version.major === major) {
          return version;
        }
      }
    }
  }
  // As a fallback for local `vc build` and the tests,
  // return the first node version if none is found.
  return all[0];
}

export function getDiscontinuedNodeVersions(): NodeVersion[] {
  return getOptions().filter(version => {
    return version.state === 'discontinued';
  });
}

export async function getSupportedNodeVersion(
  engineRange: string | undefined,
  isAuto = false,
  availableVersions?: NodeVersionMajor[]
): Promise<NodeVersion> {
  let selection: NodeVersion | undefined;

  if (engineRange) {
    const found =
      validRange(engineRange) &&
      getOptions().some(o => {
        // the array is already in order so return the first
        // match which will be the newest version of node
        selection = o;
        return (
          intersects(o.range, engineRange) &&
          (availableVersions?.length
            ? availableVersions.includes(o.major)
            : true)
        );
      });
    if (!found) {
      throw new NowBuildError({
        code: 'BUILD_UTILS_NODE_VERSION_INVALID',
        link: 'http://vercel.link/node-version',
        message: `Found invalid Node.js Version: "${engineRange}". ${getHint(
          isAuto,
          availableVersions
        )}`,
      });
    }
  }

  if (!selection) {
    selection = getLatestNodeVersion(availableVersions);
  }

  if (selection.state === 'discontinued') {
    const intro = `Node.js Version "${selection.range}" is discontinued and must be upgraded.`;
    throw new NowBuildError({
      code: 'BUILD_UTILS_NODE_VERSION_DISCONTINUED',
      link: 'http://vercel.link/node-version',
      message: `${intro} ${getHint(isAuto)}`,
    });
  }

  debug(`Selected Node.js ${selection.range}`);

  // Only log once per version to avoid duplicate messages
  const logKey = `node-${selection.range}`;
  if (!loggedVersions.has(logKey)) {
    loggedVersions.add(logKey);

    // Try to get the actual Node.js version being used in the build environment
    let actualVersion = selection.range;
    try {
      // Try to query the Node version from the build environment path
      const nodePath = `/node${selection.major}/bin/node`;
      const { stdout } = await execa(nodePath, ['--version'], {
        timeout: 5000,
        reject: false,
      });
      if (stdout && stdout.trim().startsWith('v')) {
        actualVersion = stdout.trim();
      }
    } catch {
      // If /nodeXX/bin/node doesn't exist (e.g., in dev), fall back to range
    }

    console.log(`Using Node.js ${actualVersion} to build`);
  }

  if (selection.state === 'deprecated') {
    const d = selection.formattedDate;
    // formattedDate should never be undefined because the check for deprecated
    // expects that discontinueDate is set but this check is done for completeness
    if (d) {
      console.warn(
        `Error: Node.js version ${
          selection.range
        } is deprecated. Deployments created on or after ${d} will fail to build. ${getHint(
          isAuto
        )}`
      );
    } else {
      console.warn(
        `Error: Node.js version ${selection.range} is deprecated. ${getHint(
          isAuto
        )}`
      );
    }
  }

  return selection;
}

export function getSupportedBunVersion(engineRange: string): BunVersion {
  if (validRange(engineRange)) {
    const selected = BUN_VERSIONS.find(version => {
      return intersects(version.range, engineRange);
    });

    if (selected) {
      const bunVersion = new BunVersion({
        major: selected.major,
        range: selected.range,
        runtime: selected.runtime,
      });

      // Only log once per version to avoid duplicate messages
      const logKey = `bun-${bunVersion.range}`;
      if (!loggedVersions.has(logKey)) {
        loggedVersions.add(logKey);

        // Try to get the actual Bun version being used
        let actualVersion = bunVersion.range;
        try {
          // process.versions.bun gives us the actual version if running under Bun
          if (process.versions?.bun) {
            actualVersion = `v${process.versions.bun}`;
          }
        } catch {
          // Fall back to range if we can't get actual version
        }

        console.log(`Using Bun ${actualVersion} to build`);
      }

      return bunVersion;
    }
  }

  throw new NowBuildError({
    message: `Found invalid Bun Version: "${engineRange}".`,
    code: 'BUILD_UTILS_BUN_VERSION_INVALID',
  });
}

export function isBunVersion(version: Version) {
  return version.runtime.startsWith('bun');
}

// Test helper to clear logged versions
export function clearLoggedVersions() {
  loggedVersions.clear();
}
