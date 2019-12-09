import { DetectorParameters, DetectorResult } from '../types';

export default async function detectNext({
  fs: { hasDependency, getPackageJsonBuildCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const hasNext = await hasDependency('next');
  if (!hasNext) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'next build',
    buildDirectory: 'build',
    devCommand: 'next -p $PORT',
  };
}
