import { NowBuildError } from '../errors';

export const MAX_DEPLOYMENT_ID_LENGTH = 32;
export const VALID_DEPLOYMENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export function validateDeploymentId(deploymentId?: string): void {
  if (deploymentId && deploymentId.length > MAX_DEPLOYMENT_ID_LENGTH) {
    throw new NowBuildError({
      message: `The configured deploymentId "${deploymentId}" exceeds the maximum length of ${MAX_DEPLOYMENT_ID_LENGTH} characters. Please use a shorter deploymentId.`,
      code: 'VC_BUILD_INVALID_DEPLOYMENT_ID_LENGTH',
    });
  }

  if (deploymentId && !VALID_DEPLOYMENT_ID_PATTERN.test(deploymentId)) {
    throw new NowBuildError({
      message: `The configured deploymentId "${deploymentId}" contains invalid characters. Only alphanumeric characters (a-z, A-Z, 0-9), hyphens (-), and underscores (_) are allowed.`,
      code: 'VC_BUILD_INVALID_DEPLOYMENT_ID_CHARACTERS',
    });
  }
}
