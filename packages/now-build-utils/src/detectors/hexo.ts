import { DetectorParameters, DetectorResult } from '../types';

export default async function detectHexo({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasHexo = await hasDependency('hexo');
  if (!hasHexo) return false;
  return {
    buildCommand: ['hexo', 'generate'],
    buildDirectory: 'public',
    devCommand: ['hexo', 'server', '--port', '$PORT'],
  };
}
