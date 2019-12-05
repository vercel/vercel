import { DetectorParameters, DetectorResult } from '../types';

export default async function detectEleventy({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasEleventy = await hasDependency('@11ty/eleventy');
  if (!hasEleventy) return false;
  return {
    buildCommand: 'npx @11ty/eleventy',
    buildDirectory: '_site',
    devCommand: 'npx @11ty/eleventy --serve --watch --port $PORT',
  };
}
