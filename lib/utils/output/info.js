const chalk = require('chalk');

// Prints an informational message
module.exports = msg => {
  console.log(`${chalk.gray('>')} ${msg}`);
};
