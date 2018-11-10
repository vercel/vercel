const fastStreamToBuffer = require('fast-stream-to-buffer');
const { promisify } = require('util');

module.exports = promisify(fastStreamToBuffer);
