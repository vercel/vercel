import buildCreateDeployment from './create-deployment';

export const createDeployment = buildCreateDeployment(2);
export const createLegacyDeployment = buildCreateDeployment(1);
export * from './errors';
export * from './types';
