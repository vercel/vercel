import { DetectorParameters, DetectorResult } from '../types';

export default async function detectVue({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasVue = await hasDependency('@vue/cli-service');
  if (!hasVue) return false;
  return {
    buildCommand: ['vue-cli-service', 'build'],
    buildDirectory: 'dist',
    devCommand: ['vue-cli-service', 'serve', '--port', '$PORT'],
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
