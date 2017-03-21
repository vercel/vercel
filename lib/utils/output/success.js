const chalk = require('chalk');

// prints a success message
module.exports = msg => {
  console.log(`${chalk.cyan('> Success!')} ${msg}`);
};
