import { DetectorParameters, DetectorResult } from '../types';

export default async function detectCreateReactAppEjected({
  fs: { getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('react-dev-utils');
  if (!version) {
    return false;
  }
  return {
    buildCommand: 'node scripts/build.js',
    outputDirectory: 'build',
    devCommand: 'node scripts/start.js',
    framework: {
      slug: 'react-dev-utils',
      version,
    },
    devVariables: { BROWSER: 'none' },
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
