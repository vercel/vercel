import buildCreateDeployment from './create-deployment';

export { checkDeploymentStatus } from './check-deployment-status';
export { buildFileTree, getVercelIgnore } from './utils/index';
export const createDeployment = buildCreateDeployment();
export * from './errors';
export * from './types';
