export const isReady = ({ readyState }) => readyState === 'READY';
export const isFailed = ({ readyState }) =>
  readyState.endsWith('_ERROR') || readyState === 'ERROR';
export const isDone = ({ readyState }) =>
  isReady({ readyState }) || isFailed({ readyState });
