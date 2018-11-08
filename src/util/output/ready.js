const { cyan } = require('chalk');

const ready = msg => `${cyan('> Ready!')} ${msg}`;

module.exports = ready;
