import { DetectorParameters, DetectorResult } from '../types';

export default async function detectHugo({
  fs: { exists },
}: DetectorParameters): Promise<DetectorResult> {
  const [hasArchetypes, hasConfig] = await Promise.all([
    exists('archetypes/default.md'),
    exists('config.toml'),
  ]);
  if (!hasArchetypes || !hasConfig) {
    return false;
  }
  return {
    buildCommand: ['hugo'],
    buildDirectory: 'public',
    devCommand: ['hugo', 'server', '-D', '-w', '-p', '$PORT'],
  };
}
