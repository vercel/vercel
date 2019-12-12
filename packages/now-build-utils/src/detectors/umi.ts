import { DetectorParameters, DetectorResult } from '../types';

export default async function detectUmiJS({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('umi');
  if (!version) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'umi build',
    outputDirectory: 'dist',
    devCommand: 'umi dev --port $PORT',
    framework: {
      slug: 'umi',
      version,
    },
    routes: [
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        dest: '/index.html',
      },
    ],
  };
}
