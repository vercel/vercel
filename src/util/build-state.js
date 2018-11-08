exports.isReady = ({ readyState }) => readyState === 'READY';
exports.isFailed = ({ readyState }) => readyState.endsWith('_ERROR') || readyState === 'ERROR';
exports.isDone = ({ readyState }) => exports.isReady({ readyState }) || exports.isFailed({ readyState });
