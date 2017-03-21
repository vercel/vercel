const chalk = require('chalk');

// Returns a user param in a nice formatting
// e.g.: google.com -> "google.com" (in bold)

module.exports = param =>
  chalk.bold(`${chalk.gray('"')}${chalk.bold(param)}${chalk.gray('"')}`);
