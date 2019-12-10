import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGridsome({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasGridsome = await hasDependency('gridsome');
  if (!hasGridsome) {
    return false;
  }
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'gridsome build',
    outputDirectory: 'dist',
    devCommand: 'gridsome develop -p $PORT',
    framework: {
      slug: 'gridsom',
      version: await getDependencyVersion('gridsom')
    }
  };
}
