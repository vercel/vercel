let buildUtils: typeof import('@vercel/build-utils');

try {
  buildUtils = require('@vercel/build-utils');
} catch (e) {
  // Fallback for older CLI versions
  buildUtils = require('@now/build-utils');
}

export default buildUtils;
