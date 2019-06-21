import { intersects } from 'semver';
import { NodeVersion } from '../types';

const supportedOptions: NodeVersion[] = [
  { major: 10, range: '10.x', runtime: 'nodejs10.x' },
  { major: 8, range: '8.x', runtime: 'nodejs8.10' },
];

// This version should match Fargate's default in the PATH
export const defaultSelection = supportedOptions[supportedOptions.length - 1];

export async function getSupportedNodeVersion(
  engineRange?: string
): Promise<NodeVersion> {
  let selection = defaultSelection;

  if (!engineRange) {
    console.log(
      'missing `engines` in `package.json`, using default node v' +
        selection.major
    );
  } else {
    for (let o of supportedOptions) {
      if (intersects(o.range, engineRange)) {
        selection = o;
        console.log(
          'found `engines` in `package.json`, selecting node v' +
            selection.major
        );
        return selection; // the array is ordered so break early to use the first (largest) match
      }
    }
    console.log(
      'WARNING: version of `engines` in `package.json` is not supported, using default node v' +
        selection.major
    );
  }
  return selection;
}
