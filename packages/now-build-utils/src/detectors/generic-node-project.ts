import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGenericNodeProject({
  fs: { isNpm, getPackageJsonCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const isNpm = await isNpm();
  const devCommand = await getPackageJsonCommand('dev');
  const buildCommand = await getPackageJsonCommand('build');

  if (!buildCommand) {
    return false;
  }

  return {
    buildCommand: `${isNpm ? 'npm' : 'yarn'} run build`,
    devCommand: `${isNpm ? 'npm' : 'yarn'} run ${devCommand ? 'dev' : 'build'}`,
    outputDirectory: 'dist',
  };
}
