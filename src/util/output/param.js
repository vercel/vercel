const { gray, bold } = require('chalk');

const param = text => `${gray('"')}${bold(text)}${gray('"')}`;

module.exports = param;
