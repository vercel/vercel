const chalk = require('chalk');

// Prints a success message
module.exports = msg => {
  console.log(`${chalk.cyan('> Success!')} ${msg}`);
};
