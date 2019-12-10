import { DetectorParameters, DetectorResult } from '../types';

export default async function detectNext({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasNext = await hasDependency('next');
  if (!hasNext) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'next build',
    outputDirectory: '.next/static',
    devCommand: 'next -p $PORT',
    framework: {
      slug: 'next',
      version: await getDependencyVersion('next'),
    },
  };
}
