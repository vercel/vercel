const { createRequestHandler } = require('@remix-run/vercel');
const build = require('./');
module.exports = createRequestHandler({ build });
