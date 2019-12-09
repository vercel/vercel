import { DetectorParameters, DetectorResult } from '../types';

export default async function detectHexo({
  fs: { hasDependency, getPackageJsonBuildCommand },
}: DetectorParameters): Promise<DetectorResult> {
  const hasHexo = await hasDependency('hexo');
  if (!hasHexo) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'hexo generate',
    buildDirectory: 'public',
    devCommand: 'hexo server --port $PORT',
  };
}
