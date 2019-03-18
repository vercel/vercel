// Packages
import chalk from 'chalk';

// The equivalent of <code>, for embedding anything
// you may want to take a look at ./cmd.js

export default cmd => `${chalk.gray('`')}${chalk.bold(cmd)}${chalk.gray('`')}`;
