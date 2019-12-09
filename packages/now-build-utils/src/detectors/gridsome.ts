import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGridsome({
  fs: { hasDependency, getPackageJsonBuildCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const hasGridsome = await hasDependency('gridsome');
  if (!hasGridsome) {
    return false;
  }
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'gridsome build',
    buildDirectory: 'dist',
    devCommand: 'gridsome develop -p $PORT',
  };
}
