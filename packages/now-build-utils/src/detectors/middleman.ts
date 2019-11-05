import { DetectorParameters, DetectorResult } from '../types';

export default async function detectHugo({
  fs: { exists },
}: DetectorParameters): Promise<DetectorResult> {
  const hasConfig = await exists('config.rb');
  if (!hasConfig) return false;

  return {
    buildCommand: ['bundle', 'exec', 'middleman', 'build'],
    buildDirectory: 'build',
    devCommand: ['bundle', 'exec', 'middleman', 'server', '-p', '$PORT'],
  };
}
