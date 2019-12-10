import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGatsby({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasGatsby = await hasDependency('gatsby');
  if (!hasGatsby) {
    return false;
  }
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'gatsby build',
    outputDirectory: 'public',
    devCommand: 'gatsby develop -p $PORT',
    framework: {
      slug: 'gatsby',
      version: await getDependencyVersion('gatsby')
    },
    cachePattern: '.cache/**',
  };
}
