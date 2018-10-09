const { gray, cyan } = require('chalk');

const cmd = text => `${gray('`')}${cyan(text)}${gray('`')}`;

module.exports = cmd;
