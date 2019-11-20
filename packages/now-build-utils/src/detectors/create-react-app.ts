import { DetectorParameters, DetectorResult } from '../types';

export default async function detectCreateReactApp({
  fs: { hasDependency },
}: DetectorParameters): Promise<DetectorResult> {
  const hasReactScripts = await hasDependency('react-scripts');
  if (!hasReactScripts) {
    return false;
  }
  return {
    buildCommand: ['react-scripts', 'build'],
    buildDirectory: 'build',
    devCommand: ['react-scripts', 'start'],
    devEnv: { BROWSER: 'none' },
    routes: [
      {
        src: '/static/(.*)',
        headers: { 'cache-control': 's-maxage=31536000, immutable' },
        continue: true,
      },
      {
        src: '/service-worker.js',
        headers: { 'cache-control': 's-maxage=0' },
        continue: true,
      },
      {
        src: '/sockjs-node/(.*)',
        dest: '/sockjs-node/$1',
      },
      {
        handle: 'filesystem',
      },
      {
        src: '/(.*)',
        headers: { 'cache-control': 's-maxage=0' },
        dest: '/index.html',
      },
    ],
  };
}
