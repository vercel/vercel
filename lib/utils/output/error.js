const chalk = require('chalk');

// Prints an error message
module.exports = msg => {
  console.error(`${chalk.red('> Error!')} ${msg}`);
};
