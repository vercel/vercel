import { Deployment } from '@vercel-internals/types';

export const deploymentInProgressStates: Deployment['readyState'][] = [
  'QUEUED',
  'BUILDING',
  'INITIALIZING',
];

export const deploymentCompletedStates: Deployment['readyState'][] = [
  'READY',
  'CANCELED',
  'ERROR',
];

/**
 * Checks if the deployments readyState is considered to be in progress.
 * @param readyState The deployment's readyState
 * @returns `true` if in a pending deployment state, otherwise `false` if it's
 * ready/canceled/errored
 */
export function isDeploying(readyState: Deployment['readyState']): Boolean {
  return deploymentInProgressStates.includes(readyState);
}
