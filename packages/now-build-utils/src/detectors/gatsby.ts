import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGatsby({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('gatsby');
  if (!version) {
    return false;
  }
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'gatsby build',
    outputDirectory: 'public',
    devCommand: 'gatsby develop -p $PORT',
    framework: {
      slug: 'gatsby',
      version,
    },
    cachePattern: '.cache/**',
  };
}
