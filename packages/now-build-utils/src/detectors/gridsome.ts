import { DetectorParameters, DetectorResult } from '../types';

export default async function detectGridsome({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasGridsome = await hasDependency('gridsome');
  if (!hasGridsome) {
    return false;
  }
  return {
    buildCommand: 'gridsome build',
    buildDirectory: 'dist',
    devCommand: 'gridsome develop -p $PORT',
  };
}
