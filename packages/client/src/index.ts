import buildCreateDeployment from './create-deployment';

export { checkDeploymentStatus } from './check-deployment-status';
export { getVercelIgnore, buildFileTree, shouldUseInlineFiles } from './utils/index';
export const createDeployment = buildCreateDeployment();
export * from './errors';
export * from './types';
