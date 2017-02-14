const chalk = require('chalk')
const inquirer = require('inquirer')
const stripAnsi = require('strip-ansi')

/* eslint-disable no-multiple-empty-lines, no-var, no-undef, no-eq-null, eqeqeq, semi */
inquirer.prompt.prompts.list.prototype.getQuestion = function () {
  var message = chalk.bold('> ' + this.opt.message) + ' '

  // Append the default if available, and if question isn't answered
  if (this.opt.default != null && this.status !== 'answered') {
    message += chalk.dim('(' + this.opt.default + ') ')
  }

  return message
};
/* eslint-enable */

function getLength(string) {
  let biggestLength = 0
  string.split('\n').map(str => {
    str = stripAnsi(str)
    if (str.length > biggestLength) {
      biggestLength = str.length
    }
    return undefined
  })
  return biggestLength
}

module.exports = async function ({
  message = 'the question',
  choices = [{ // eslint-disable-line no-unused-vars
    name: 'something\ndescription\ndetails\netc',
    value: 'something unique',
    short: 'generally the first line of `name`'
  }],
  pageSize = 15, // Show 15 lines without scrolling (~4 credit cards)
  separator = true, // puts a blank separator between each choice
  abort = 'end' // wether the `abort` option will be at the `start` or the `end`
}) {
  let biggestLength = 0

  choices = choices.map(choice => {
    if (choice.name) {
      const length = getLength(choice.name)
      if (length > biggestLength) {
        biggestLength = length
      }
      return choice
    }
    throw new Error('Invalid choice')
  })

  if (separator === true) {
    choices = choices.reduce((prev, curr) => (
      prev.concat(new inquirer.Separator(' '), curr)
    ), [])
  }

  const abortSeparator = new inquirer.Separator('─'.repeat(biggestLength))
  const _abort = {
    name: 'Abort',
    value: undefined
  }

  if (abort === 'start') {
    const blankSep = choices.shift()
    choices.unshift(abortSeparator)
    choices.unshift(_abort)
    choices.unshift(blankSep)
  } else {
    choices.push(abortSeparator)
    choices.push(_abort)
  }

  const nonce = Date.now()
  const answer = await inquirer.prompt({
    name: nonce,
    type: 'list',
    message,
    choices,
    pageSize
  })

  return answer[nonce]
}
