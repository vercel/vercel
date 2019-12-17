import { DetectorParameters, DetectorResult } from '../types';

export default async function detectMiddleman({
  fs: { exists },
}: DetectorParameters): Promise<DetectorResult> {
  const hasConfig = await exists('config.rb');
  if (!hasConfig) return false;

  return {
    buildCommand: 'bundle exec middleman build',
    outputDirectory: 'build',
    devCommand: 'bundle exec middleman server -p $PORT',
    framework: {
      slug: 'middleman',
      version: 'latest',
    },
  };
}
