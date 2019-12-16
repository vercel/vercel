import { DetectorParameters, DetectorResult } from '../types';

export default async function detectCreateReactApp({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('react-scripts');
  if (!version) {
    return false;
  }
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'react-scripts build',
    outputDirectory: 'build',
    devCommand: 'react-scripts start',
    devVariables: { BROWSER: 'none' },
    framework: {
      slug: 'react-scripts',
      version,
    },
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
