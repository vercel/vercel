const chalk = require('chalk');

// The equivalent of <code>, for embedding anything
// you may want to take a look at ./cmd.js

module.exports = cmd =>
  `${chalk.gray('`')}${chalk.bold(cmd)}${chalk.gray('`')}`;
