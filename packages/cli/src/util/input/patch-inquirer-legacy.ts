import chalk from 'chalk';
import inquirer from 'inquirer';
import Prompt from 'inquirer/lib/prompts/base';

// Here we patch inquirer to use a `>` instead of the ugly green `?`

/* eslint-disable no-multiple-empty-lines, no-var, no-undef, no-eq-null, eqeqeq, semi */
const getQuestion = function (this: Prompt) {
  var message = `${chalk.bold(`> ${this.opt.message}`)} `;

  // Append the default if available, and if question isn't answered
  if (this.opt.default != null && this.status !== 'answered') {
    message += chalk.dim(`(${this.opt.default}) `);
  }

  return message;
};
/* eslint-enable */

inquirer.prompt.prompts.input.prototype.getQuestion = getQuestion;
inquirer.prompt.prompts.list.prototype.getQuestion = getQuestion;
