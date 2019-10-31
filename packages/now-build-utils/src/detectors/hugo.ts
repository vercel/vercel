import { DetectorParameters, DetectorResult } from '../types';

export default async function detectHugo({
  fs: { exists },
}: DetectorParameters): Promise<DetectorResult> {
  const [hasConfigYaml, hasConfigToml] = await Promise.all([
    exists('config.yaml'),
    exists('config.toml'),
  ]);
  if (!hasConfigYaml && !hasConfigToml) {
    return false;
  }
  return {
    buildCommand: ['hugo'],
    buildDirectory: 'public',
    devCommand: ['hugo', 'server', '-D', '-w', '-p', '$PORT'],
  };
}
