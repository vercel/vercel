import { intersects } from 'semver';
import { NodeVersion } from '../types';
import debug from '../debug';

const supportedOptions: NodeVersion[] = [
  { major: 12, range: '12.x', runtime: 'nodejs12.x' },
  { major: 10, range: '10.x', runtime: 'nodejs10.x' },
  { major: 8, range: '8.10.x', runtime: 'nodejs8.10' },
];

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
    const found = supportedOptions.some(o => {
      // the array is already in order so return the first
      // match which will be the newest version of node
      selection = o;
      return intersects(o.range, engineRange);
    });
    if (found) {
      if (!silent) {
        debug(
          'Found `engines` in `package.json`, selecting range: ' +
            selection.range
        );
      }
    } else {
      if (!silent) {
        throw new Error(
          'Found `engines` in `package.json` with an unsupported node range: ' +
            engineRange +
            '\nPlease use one of the following supported ranges: ' +
            JSON.stringify(supportedOptions.map(o => o.range))
        );
      }
    }
  }
  return selection;
}
