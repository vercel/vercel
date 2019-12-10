import { DetectorParameters, DetectorResult } from '../types';

export default async function detectSapper({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasSapper = await hasDependency('sapper');
  if (!hasSapper) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'sapper export',
    outputDirectory: '__sapper__/export',
    devCommand: 'sapper dev --port $PORT',
    framework: {
      slug: 'sapper',
      version: await getDependencyVersion('sapper')
    }
  };
}
