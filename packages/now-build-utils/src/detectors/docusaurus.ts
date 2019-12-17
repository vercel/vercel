import { DetectorParameters, DetectorResult } from '../types';

export default async function detectDocusaurus({
  fs: { getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const version = await getDependencyVersion('docusaurus');
  if (!version) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'docusaurus-build',
    outputDirectory: 'build',
    devCommand: 'docusaurus-start --port $PORT',
    framework: {
      slug: 'docusaurus',
      version,
    },
  };
}
