import { intersects } from 'semver';
import boxen from 'boxen';
import { NodeVersion } from '../types';
import debug from '../debug';

const allOptions: NodeVersion[] = [
  { major: 12, range: '12.x', runtime: 'nodejs12.x' },
  { major: 10, range: '10.x', runtime: 'nodejs10.x' },
  {
    major: 8,
    range: '8.10.x',
    runtime: 'nodejs8.10',
    discontinueDate: new Date('2020-01-06'),
  },
];

const supportedOptions = allOptions.filter(o => !isDiscontinued(o));

// This version should match Fargate's default in the PATH
// Today that is Node 8
export const defaultSelection = supportedOptions.find(
  o => o.major === 8
) as NodeVersion;

export async function getSupportedNodeVersion(
  engineRange?: string,
  silent?: boolean
): Promise<NodeVersion> {
  let selection = defaultSelection;

  if (!engineRange) {
    if (!silent) {
      debug(
        'Missing `engines` in `package.json`, using default range: ' +
          selection.range
      );
    }
  } else {
    const found = allOptions.some(o => {
      // the array is already in order so return the first
      // match which will be the newest version of node
      selection = o;
      return intersects(o.range, engineRange);
    });
    const discontinued = isDiscontinued(selection);
    if (found && !discontinued) {
      if (!silent) {
        debug(
          'Found `engines` in `package.json`, selecting range: ' +
            selection.range
        );
      }
    } else {
      throw new Error(
        'Found `engines` in `package.json` with an unsupported Node.js version range: ' +
          engineRange +
          '\nPlease use one of the following supported ranges: ' +
          JSON.stringify(supportedOptions.map(o => o.range)) +
          (discontinued
            ? '\nThis change is the result of a decision made by an upstream infrastructure provider (AWS).' +
              '\nRead more: https://docs.aws.amazon.com/lambda/latest/dg/runtime-support-policy.html'
            : '')
      );
    }
  }

  const { range, discontinueDate } = selection;
  if (discontinueDate && !isDiscontinued(selection)) {
    const d = discontinueDate.toISOString().split('T')[0];
    const validRanges = supportedOptions
      .filter(o => !o.discontinueDate)
      .map(o => o.range);
    console.warn(
      boxen(
        'WARNING' +
          '\n' +
          `\nNode.js ${range} will be discontinued on ${d}.` +
          `\nDeployments created on or after ${d} will fail to build.` +
          '\nPlease use one of the following supported `engines` in `package.json`: ' +
          JSON.stringify(validRanges) +
          '\nThis change is the result of a decision made by an upstream infrastructure provider (AWS).' +
          '\nRead more: https://docs.aws.amazon.com/lambda/latest/dg/runtime-support-policy.html',
        { padding: 1 }
      )
    );
  }

  return selection;
}

function isDiscontinued({ discontinueDate }: NodeVersion): boolean {
  const today = new Date();
  return discontinueDate !== undefined && discontinueDate <= today;
}
