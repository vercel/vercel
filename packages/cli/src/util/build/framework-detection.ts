import output from '../../output-manager';
import {
  detectAllFrameworks as detectAllFrameworksCore,
  detectFirstDeploymentFramework as detectFirstDeploymentFrameworkCore,
  isFirstDeployment as isFirstDeploymentCore,
  isFrameworkDetectionEnabled as isFrameworkDetectionEnabledCore,
  warnIfFrameworkMismatch as warnIfFrameworkMismatchCore,
} from '@vercel-internals/cli-builder-integration/framework-detection';

export type {
  DetectedFramework,
  FrameworkMismatchResult,
} from '@vercel-internals/cli-builder-integration/framework-detection';

export const isFrameworkDetectionEnabled = () =>
  isFrameworkDetectionEnabledCore(output);
export const isFirstDeployment = () => isFirstDeploymentCore(output);
export const detectFirstDeploymentFramework = (
  options: Parameters<typeof detectFirstDeploymentFrameworkCore>[0]
) => detectFirstDeploymentFrameworkCore({ ...options, output });
export const detectAllFrameworks = (
  ...args: Parameters<typeof detectAllFrameworksCore>
) => detectAllFrameworksCore(args[0], args[1], output);
export const warnIfFrameworkMismatch = (
  options: Parameters<typeof warnIfFrameworkMismatchCore>[0]
) => warnIfFrameworkMismatchCore(options, output);
