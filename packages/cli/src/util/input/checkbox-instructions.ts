import chalk from 'chalk';

/**
 * Shared checkbox key legend — replaces inquirer's parenthesized default,
 * which the CLI UX guidelines reject.
 */
export const CHECKBOX_INSTRUCTIONS = [
  ' ',
  chalk.cyan('<space>'),
  chalk.dim(' select, '),
  chalk.cyan('<enter>'),
  chalk.dim(' confirm, '),
  chalk.cyan('<a>'),
  chalk.dim(' toggle all, '),
  chalk.cyan('<i>'),
  chalk.dim(' invert'),
].join('');
