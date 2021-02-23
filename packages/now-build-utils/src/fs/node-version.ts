import { intersects, validRange } from 'semver';
import { NodeVersion } from '../types';
import { NowBuildError } from '../errors';
import debug from '../debug';

const allOptions = [
  { major: 14, range: '14.x', runtime: 'nodejs14.x' },
  { major: 12, range: '12.x', runtime: 'nodejs12.x' },
  {
    major: 10,
    range: '10.x',
    runtime: 'nodejs10.x',
    discontinueDate: new Date('2021-04-20'),
  },
  {
    major: 8,
    range: '8.10.x',
    runtime: 'nodejs8.10',
    discontinueDate: new Date('2020-01-06'),
  },
] as const;

function getHint(isAuto: boolean) {
  const { major, range } = getLatestNodeVersion();
  return isAuto
    ? `Please set Node.js Version to ${range} in your Project Settings to use Node.js ${major}.`
    : `Please set "engines": { "node": "${range}" } in your \`package.json\` file to use Node.js ${major}.`;
}

const upstreamProvider =
  'This change is the result of a decision made by an upstream infrastructure provider (AWS).' +
  '\nRead more: https://docs.aws.amazon.com/lambda/latest/dg/runtime-support-policy.html';

export function getLatestNodeVersion() {
  return allOptions[0];
}

export function getDiscontinuedNodeVersions(): NodeVersion[] {
  return allOptions.filter(isDiscontinued);
}

export async function getSupportedNodeVersion(
  engineRange: string | undefined,
  isAuto: boolean
): Promise<NodeVersion> {
  let selection: NodeVersion = getLatestNodeVersion();

  if (engineRange) {
    const found =
      validRange(engineRange) &&
      allOptions.some(o => {
        // the array is already in order so return the first
        // match which will be the newest version of node
        selection = o;
        return intersects(o.range, engineRange);
      });
    if (!found) {
      throw new NowBuildError({
        code: 'BUILD_UTILS_NODE_VERSION_INVALID',
        link:
          'https://vercel.com/docs/runtimes#official-runtimes/node-js/node-js-version',
        message: `Found invalid Node.js Version: "${engineRange}".\n${getHint(
          isAuto
        )}`,
      });
    }
  }

  if (isDiscontinued(selection)) {
    const intro = `Node.js Version "${selection.range}" is discontinued and must be upgraded.`;
    throw new NowBuildError({
      code: 'BUILD_UTILS_NODE_VERSION_DISCONTINUED',
      link:
        'https://vercel.com/docs/runtimes#official-runtimes/node-js/node-js-version',
      message: intro + '\n' + getHint(isAuto) + '\n' + upstreamProvider,
    });
  }

  debug(`Selected Node.js ${selection.range}`);

  if (selection.discontinueDate) {
    const d = selection.discontinueDate.toISOString().split('T')[0];
    console.warn(
      `Warning: Node.js version ${
        selection.range
      } is deprecated. Deployments created on or after ${d} will fail to build. ${getHint(
        isAuto
      )}`
    );
    console.log(upstreamProvider);
  }

  return selection;
}

function isDiscontinued({ discontinueDate }: NodeVersion): boolean {
  const today = Date.now();
  return discontinueDate !== undefined && discontinueDate.getTime() <= today;
}
