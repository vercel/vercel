import { Deployment, DeploymentBuild } from '../types.js';

export const isReady = ({
  readyState,
  state,
}: Deployment | DeploymentBuild): boolean =>
  readyState === 'READY' || state === 'READY';

export const isFailed = ({
  readyState,
  state,
}: Deployment | DeploymentBuild): boolean => {
  if (readyState) {
    return readyState.endsWith('_ERROR') || readyState === 'ERROR';
  }
  if (!state) {
    return false;
  }

  // TS is convinced `state` is `never`, but it's definitely a `string | undefined` entering this function
  return (state as string).endsWith('_ERROR') || state === 'ERROR';
};

export const isDone = (
  buildOrDeployment: Deployment | DeploymentBuild
): boolean => isReady(buildOrDeployment) || isFailed(buildOrDeployment);

export const isAliasAssigned = (deployment: Deployment): boolean =>
  Boolean(deployment.aliasAssigned);

export const isAliasError = (deployment: Deployment): boolean =>
  Boolean(deployment.aliasError);
