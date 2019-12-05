import { DetectorParameters, DetectorResult } from '../types';

/**
 * https://jekyllrb.com/docs/configuration/options/
 */
interface JekyllConfig {
  destination?: string;
}

export default async function detectJekyll({
  fs: { readConfigFile },
}: DetectorParameters): Promise<DetectorResult> {
  const config = await readConfigFile<JekyllConfig>('_config.yml');
  if (!config) {
    return false;
  }
  return {
    buildCommand: 'jekyll build',
    buildDirectory: config.destination || '_site',
    devCommand: 'bundle exec jekyll serve --watch --port $PORT',
  };
}
