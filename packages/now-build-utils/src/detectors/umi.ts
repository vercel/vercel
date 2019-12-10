import { DetectorParameters, DetectorResult } from '../types';

export default async function detectUmiJS({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasUmi = await hasDependency('umi');
  if (!hasUmi) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'umi build',
    outputDirectory: 'dist',
    devCommand: 'umi dev --port $PORT',
    framework: {
      slug: 'umi',
      version: await getDependencyVersion('umi')
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
