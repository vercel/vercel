import { DetectorParameters, DetectorResult } from '../types';

export default async function detectDocusaurus({
  fs: { hasDependency, getPackageJsonBuildCommand, getDependencyVersion },
}: DetectorParameters): Promise<DetectorResult> {
  const hasDocusaurus = await hasDependency('docusaurus');
  if (!hasDocusaurus) return false;
  return {
    buildCommand: (await getPackageJsonBuildCommand()) || 'docusaurus-build',
    outputDirectory: 'build',
    devCommand: 'docusaurus-start --port $PORT',
    framework: {
      slug: 'docusaurus',
      version: await getDependencyVersion('docusaurus')
    }
  };
}
