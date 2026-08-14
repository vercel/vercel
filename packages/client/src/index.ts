import buildCreateDeployment from './create-deployment';

export { continueDeployment } from './continue';
export { checkDeploymentStatus } from './check-deployment-status';
export { inspectDeploymentFiles } from './inspect-deployment-files';
export { getVercelIgnore, buildFileTree } from './utils/index';
export const createDeployment = buildCreateDeployment();
export * from './errors';
export * from './types';
