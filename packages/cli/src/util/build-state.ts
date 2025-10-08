import type { Build } from '@vercel-internals/types';

export const isReady = ({ readyState }: Pick<Build, 'readyState'>) =>
  readyState === 'READY';

export const isFailed = ({ readyState }: Pick<Build, 'readyState'>) =>
  readyState.endsWith('_ERROR') || readyState === 'ERROR';
