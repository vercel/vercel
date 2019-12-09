import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGatsby({
  fs: { hasDependency, getPackageJsonBuildCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const hasGatsby = await hasDependency('gatsby');
  if (!hasGatsby) {
    return false;
  }
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'gatsby build',
    buildDirectory: 'public',
    devCommand: 'gatsby develop -p $PORT',
    cachePattern: '.cache/**',
  };
}
