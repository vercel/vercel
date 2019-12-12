import { DetectorParameters, DetectorResult } from '../types';

export default async function detectVue({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('@vue/cli-service');
  if (!version) return false;
  return {
    buildCommand:
      (await getPackageJsonBuildCommand()) || 'vue-cli-service build',
    outputDirectory: 'dist',
    devCommand: 'vue-cli-service serve --port $PORT',
    framework: {
      slug: '@vue/cli-service',
      version,
    },
    routes: [
      {
        src: '^/[^/]*\\.(js|txt|ico|json)',
        headers: { 'cache-control': 'max-age=300' },
        continue: true,
      },
      {
        src: '^/(img|js|css|fonts|media)/.*',
        headers: { 'cache-control': 'max-age=31536000, immutable' },
        continue: true,
      },
      {
        handle: 'filesystem',
      },
      {
        src: '^.*',
        dest: '/index.html',
      },
    ],
  };
}
