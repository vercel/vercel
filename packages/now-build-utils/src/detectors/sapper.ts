import { DetectorParameters, DetectorResult } from '../types';

export default async function detectSapper({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasSapper = await hasDependency('sapper');
  if (!hasSapper) return false;
  return {
    buildCommand: 'sapper export',
    buildDirectory: '__sapper__/export',
    devCommand: 'sapper dev --port $PORT',
  };
}
