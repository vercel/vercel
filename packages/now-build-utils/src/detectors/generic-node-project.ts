import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGenericNodeProject({
  fs: { isNpm, getPackageJsonCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const useNpm = await isNpm();
  const devCommand = await getPackageJsonCommand('dev');
  const buildCommand = await getPackageJsonCommand('build');

  if (!buildCommand) {
    return false;
  }

  return {
    buildCommand: `${useNpm ? 'npm' : 'yarn'} run build`,
    devCommand: useNpm && devCommand ? `yarn run ${devCommand}` : undefined,
    outputDirectory: 'public',
  };
}
