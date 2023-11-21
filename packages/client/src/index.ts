import buildCreateDeployment from './create-deployment.js';

export { checkDeploymentStatus } from './check-deployment-status.js';
export { getVercelIgnore, buildFileTree } from './utils/index.js';
export const createDeployment = buildCreateDeployment();
export * from './errors.js';
export * from './types.js';
