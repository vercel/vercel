import { DetectorParameters, DetectorResult } from '../types';

export default async function detectNext({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('next');
  if (!version) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'next build',
    outputDirectory: '.next/static',
    devCommand: 'next -p $PORT',
    framework: {
      slug: 'next',
      version,
    },
  };
}
