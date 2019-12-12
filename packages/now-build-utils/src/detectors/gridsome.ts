import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGridsome({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('gridsome');
  if (!version) {
    return false;
  }
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'gridsome build',
    outputDirectory: 'dist',
    devCommand: 'gridsome develop -p $PORT',
    framework: {
      slug: 'gridsom',
      version,
    },
  };
}
