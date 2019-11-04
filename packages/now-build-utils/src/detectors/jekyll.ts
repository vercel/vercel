import { DetectorParameters, DetectorResult } from '../types';

export default async function detectJekyll({
  fs: { exists },
}: DetectorParameters): Promise<DetectorResult> {
  const hasConfig = await exists('_config.yml');
  if (!hasConfig) {
    return false;
  }
  return {
    buildCommand: ['jekyll', 'build'],
    buildDirectory: '_site',
    devCommand: ['bundle', 'exec', 'jekyll', 'serve', '-w'],
  };
}
