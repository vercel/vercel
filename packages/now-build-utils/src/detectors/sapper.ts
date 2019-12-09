import { DetectorParameters, DetectorResult } from '../types';

export default async function detectSapper({
  fs: { hasDependency, getPackageJsonBuildCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const hasSapper = await hasDependency('sapper');
  if (!hasSapper) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'sapper export',
    buildDirectory: '__sapper__/export',
    devCommand: 'sapper dev --port $PORT',
  };
}
