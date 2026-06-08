import { createDiagnostics } from '@vercel/build-utils';

export const version = 2;
export * from './build';
export * from './prepare-cache';
export const diagnostics = createDiagnostics('node');
