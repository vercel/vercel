import { Deployment, DeploymentBuild } from '../types';
export const isReady = ({
  readyState,
  state,
}: Deployment | DeploymentBuild): boolean =>
  readyState === 'READY' || state === 'READY';
export const isFailed = ({
  readyState,
  state,
}: Deployment | DeploymentBuild): boolean =>
  readyState
    ? readyState.endsWith('_ERROR') || readyState === 'ERROR'
    : (state && state.endsWith('_ERROR')) || state === 'ERROR';
export const isDone = (
  buildOrDeployment: Deployment | DeploymentBuild
): boolean => isReady(buildOrDeployment) || isFailed(buildOrDeployment);
export const isAliasAssigned = (deployment: Deployment): boolean =>
  Boolean(deployment.aliasAssigned);
export const isAliasError = (deployment: Deployment): boolean =>
  Boolean(deployment.aliasError);
