const path = require('path');

// eslint-disable-next-line no-eval
module.exports = () => path.basename(eval('__filename')) === 'index.js';
