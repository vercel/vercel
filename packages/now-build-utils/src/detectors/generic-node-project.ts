import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGenericNodeProject({
  fs: { isNpm, getPackageJsonCommand, scan },
}: DetectorParameters): Promise<DetectorResult> {
  const useNpm = await isNpm();
  const devCommand = await getPackageJsonCommand('dev');
  const buildCommand = await getPackageJsonCommand('build');
  const hasPublic = await scan('public/**');

  // We have to skip this when `/public` exists
  // for compatability reasons, since it worked
  // like this before.
  if (!buildCommand || hasPublic.length) {
    return false;
  }

  return {
    buildCommand: `${useNpm ? 'npm' : 'yarn'} run build`,
    devCommand: `${useNpm ? 'npm' : 'yarn'} run ${
      devCommand ? 'dev' : 'build'
    }`,
    outputDirectory: 'public',
  };
}
