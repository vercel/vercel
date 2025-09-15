import { statSync } from 'fs';
import { intersects, validRange } from 'semver';
import { NodeVersion } from '../types';
import { NowBuildError } from '../errors';
import debug from '../debug';

export type NodeVersionMajor = ReturnType<typeof getOptions>[number]['major'];

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

export function getNodeVersionByMajor(major: number): NodeVersion | undefined {
  return NODE_VERSIONS.find(v => v.major === major);
}

function getOptions() {
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
