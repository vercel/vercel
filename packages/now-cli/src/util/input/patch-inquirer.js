import inquirer from 'inquirer';
import chalk from 'chalk';

// Here we patch inquirer to use a `>` instead of the ugly green `?`

/* eslint-disable no-multiple-empty-lines, no-var, no-undef, no-eq-null, eqeqeq, semi */
const getQuestionLegacy = function() {
  var message = `${chalk.bold(`> ${this.opt.message}`)} `;

  // Append the default if available, and if question isn't answered
  if (this.opt.default != null && this.status !== 'answered') {
    message += chalk.dim(`(${this.opt.default}) `);
  }

  return message;
};
/* eslint-enable */

inquirer.prompt.prompts.input.prototype.getQuestion = getQuestionLegacy;
// inquirer.prompt.prompts.list.prototype.getQuestion = getQuestion;

function listRender(choices, pointer) {
  let output = '';
  let separatorOffset = 0;

  choices.forEach((choice, i) => {
    if (choice.type === 'separator') {
      separatorOffset++;
      output += '  ' + choice + '\n';
      return;
    }

    if (choice.disabled) {
      separatorOffset++;
      output += '  - ' + choice.name;
      output +=
        ' (' +
        (typeof choice.disabled === 'string' ? choice.disabled : 'Disabled') +
        ')';
      output += '\n';
      return;
    }

    let isSelected = i - separatorOffset === pointer;
    let line = (isSelected ? '● ' : '○ ') + choice.name;
    line = chalk.cyan(line);
    output += line + ' \n';
  });

  return output.replace(/\n$/, '');
}

const renderList = function() {
  // Render question
  let message = this.getQuestion();

  // if (this.firstRender) {
  //   message += chalk.dim('(Use arrow keys)');
  // }

  // Render choices or answer depending on the state
  if (this.status === 'answered') {
    message += this.opt.choices.getChoice(this.selected).short;
  } else {
    let choicesStr = listRender(this.opt.choices, this.selected);
    let indexPosition = this.opt.choices.indexOf(
      this.opt.choices.getChoice(this.selected)
    );
    message +=
      '\n' +
      this.paginator.paginate(choicesStr, indexPosition, this.opt.pageSize);
  }

  this.firstRender = false;

  this.screen.render(message);
};

const getQuestion = function() {
  let message = `${chalk.gray('?')} ${this.opt.message} `;

  // Append the default if available, and if question isn't answered
  if (this.opt.default != null && this.status !== 'answered') {
    message += chalk.dim(`(${this.opt.default}) `);
  }

  return message;
};

inquirer.prompt.prompts.list.prototype.render = renderList;
inquirer.prompt.prompts.list.prototype.getQuestion = getQuestion;
