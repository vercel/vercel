const ms = require('ms');
const chalk = require('chalk');

// Returns a time delta with the right color
// example: `[103ms]`

module.exports = () => {
  const start = new Date();
  return () => chalk.gray(`[${ms(new Date() - start)}]`);
};
