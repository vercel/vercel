import { DetectorParameters, DetectorResult } from '../types';

/**
 * https://gohugo.io/getting-started/configuration/#configuration-file
 */
interface HugoConfig {
  publishDir?: string;
}

export default async function detectHugo({
  fs: { readConfigFile },
}: DetectorParameters): Promise<DetectorResult> {
  const config = await readConfigFile<HugoConfig>(
    'config.toml',
    'config.yaml',
    'config.json'
  );
  if (!config) {
    return false;
  }
  return {
    buildCommand: 'hugo',
    buildDirectory: config.publishDir || 'public',
    devCommand: 'hugo server -D -w -p $PORT',
  };
}
