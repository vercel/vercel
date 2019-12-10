import { DetectorParameters, DetectorResult } from '../types';

export default async function detectCreateReactApp({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasReactScripts = await hasDependency('react-scripts');
  if (!hasReactScripts) {
    return false;
  }
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'react-scripts build',
    outputDirectory: 'build',
    devCommand: 'react-scripts start',
    devVariables: { BROWSER: 'none' },
    framework: {
      slug: 'react-scripts',
      version: await getDependencyVersion('react-scripts')
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
