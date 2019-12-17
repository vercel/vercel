import { DetectorParameters, DetectorResult } from '../types';

export default async function detectAngular({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('@angular/cli');
  if (!version) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'ng build',
    outputDirectory: 'dist',
    devCommand: 'ng serve --port $PORT',
    framework: {
      slug: '@angular/cli',
      version,
    },
    minNodeRange: '10.x',
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
