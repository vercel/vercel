import { DetectorParameters, DetectorResult } from '../types';

export default async function detectAngular({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasAngular = await hasDependency('@angular/cli');
  if (!hasAngular) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'ng build',
    outputDirectory: 'dist',
    devCommand: 'ng serve --port $PORT',
    framework: {
      slug: '@angular/cli',
      version: await getDependencyVersion('@angular/cli')
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
