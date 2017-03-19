const chalk = require("chalk");

// the equivalent of <code>, for embedding anything
// you may want to take a look at ./cmd.js

module.exports = cmd =>
  `${chalk.gray("`")}${chalk.bold(cmd)}${chalk.gray("`")}`;
