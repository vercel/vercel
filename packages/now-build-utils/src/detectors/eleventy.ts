import { DetectorParameters, DetectorResult } from '../types';

export default async function detectEleventy({
  fs: { getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('@11ty/eleventy');
  if (!version) return false;
  return {
    buildCommand: 'npx @11ty/eleventy',
    outputDirectory: '_site',
    devCommand: 'npx @11ty/eleventy --serve --watch --port $PORT',
    framework: {
      slug: '@11ty/eleventy',
      version,
    },
  };
}
