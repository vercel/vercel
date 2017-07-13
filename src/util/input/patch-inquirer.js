const inquirer = require('inquirer')
const chalk = require('chalk')

// Here we patch inquirer to use a `>` instead of the ugly green `?`
const getQuestion = function() {
  var message = chalk.bold('> ' + this.opt.message) + ' '

  // Append the default if available, and if question isn't answered
  if (this.opt.default != null && this.status !== 'answered') {
    message += chalk.dim('(' + this.opt.default + ') ')
  }

  return message
}
/* eslint-enable */

inquirer.prompt.prompts.input.prototype.getQuestion = getQuestion
inquirer.prompt.prompts.list.prototype.getQuestion = getQuestion
