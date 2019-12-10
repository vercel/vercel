import { DetectorParameters, DetectorResult } from '../types';

export default async function detectBrunch({
  fs: { hasDependency, exists },
}: DetectorParameters): Promise<DetectorResult> {
  const hasBrunch = await hasDependency('brunch');
  if (!hasBrunch) return false;

  const hasConfig = await exists('brunch-config.js');
  if (!hasConfig) return false;

  return {
    buildCommand: 'brunch build --production',
    buildDirectory: 'public',
    devCommand: 'brunch watch --server --port $PORT',
  };
}
