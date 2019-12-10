import { DetectorParameters, DetectorResult } from '../types';

export default async function detectNext({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasNext = await hasDependency('next');
  if (!hasNext) return false;
  return {
    buildCommand: 'next build',
    buildDirectory: 'build',
    devCommand: 'next -p $PORT',
  };
}
