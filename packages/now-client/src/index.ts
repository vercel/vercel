// Polyfill Node 8 and below
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-3.html#the-for-await-of-statement
if (!Symbol.asyncIterator) {
  (Symbol as any).asyncIterator = Symbol.for('Symbol.asyncIterator');
}

import buildCreateDeployment from './create-deployment';

export const createDeployment = buildCreateDeployment(2);
export const createLegacyDeployment = buildCreateDeployment(1);
export * from './errors';
export * from './types';
