import inquirer from 'inquirer';
import chalk from 'chalk';

/**
 * Here we patch inquirer with some tweaks:
 * - update "list" to use ● and ○ and hide tips
 * - update "checkbox" to use ◻︎ and ◼︎ and hide tips
 * - use '?' before questions
 * - do not apply color to question's answer
 */

// adjusted from https://github.com/SBoudrias/Inquirer.js/blob/942908f17319343d1acc7b876f990797c5695918/packages/inquirer/lib/prompts/base.js#L126
const getQuestion = function () {
  let message = `${chalk.gray('?')} ${this.opt.message} `;

  if (this.opt.type === 'confirm') {
    if (this.opt.default === 'y/N') {
      message += `[y/${chalk.bold('N')}] `;
    } else {
      message += `[${chalk.bold('Y')}/n] `;
    }
  }

  // Append the default if available, and if question isn't answered
  else if (this.opt.default != null && this.status !== 'answered') {
    message += chalk.dim(`(${this.opt.default}) `);
  }

  return message;
};

inquirer.prompt.prompts.list.prototype.getQuestion = getQuestion;
inquirer.prompt.prompts.checkbox.prototype.getQuestion = getQuestion;
inquirer.prompt.prompts.input.prototype.getQuestion = getQuestion;
inquirer.prompt.prompts.confirm.prototype.getQuestion = getQuestion;

// adjusted from https://github.com/SBoudrias/Inquirer.js/blob/942908f17319343d1acc7b876f990797c5695918/packages/inquirer/lib/prompts/list.js#L80
inquirer.prompt.prompts.list.prototype.render = function () {
  // Render question
  let message = this.getQuestion();

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

// adjusted from https://github.com/SBoudrias/Inquirer.js/blob/942908f17319343d1acc7b876f990797c5695918/packages/inquirer/lib/prompts/checkbox.js#L84
inquirer.prompt.prompts.checkbox.prototype.render = function (error) {
  // Render question
  let message = this.getQuestion();
  let bottomContent = '';

  if (!this.spaceKeyPressed) {
    message +=
      '(Press ' +
      chalk.cyan.bold('<space>') +
      ' to select, ' +
      chalk.cyan.bold('<a>') +
      ' to toggle all, ' +
      chalk.cyan.bold('<i>') +
      ' to invert selection)';
  }

  // Render choices or answer depending on the state
  if (this.status === 'answered') {
    message += this.selection.length > 0 ? this.selection.join(', ') : 'None';
  } else {
    let choicesStr = renderChoices(this.opt.choices, this.pointer);
    let indexPosition = this.opt.choices.indexOf(
      this.opt.choices.getChoice(this.pointer)
    );
    message +=
      '\n' +
      this.paginator.paginate(choicesStr, indexPosition, this.opt.pageSize);
  }

  if (error) {
    bottomContent = chalk.red('>> ') + error;
  }

  this.screen.render(message, bottomContent);
};

function renderChoices(choices, pointer) {
  let output = '';
  let separatorOffset = 0;

  choices.forEach(function (choice, i) {
    if (choice.type === 'separator') {
      separatorOffset++;
      output += '' + choice + '\n';
      return;
    }

    if (choice.disabled) {
      separatorOffset++;
      output += '- ' + choice.name;
      output +=
        ' (' +
        (typeof choice.disabled === 'string' ? choice.disabled : 'Disabled') +
        ')';
    } else {
      if (i - separatorOffset === pointer) {
        output += chalk.cyan(
          (choice.checked ? '› ▪︎' : '› ▫︎') + ' ' + choice.name
        );
      } else {
        output += chalk.cyan(
          (choice.checked ? '  ▪︎' : '  ▫︎') + ' ' + choice.name
        );
      }
    }

    output += '\n';
  });

  return output.replace(/\n$/, '');
}

// adjusted from https://github.com/SBoudrias/Inquirer.js/blob/942908f17319343d1acc7b876f990797c5695918/packages/inquirer/lib/prompts/input.js#L44
inquirer.prompt.prompts.input.prototype.render = function (error) {
  let bottomContent = '';
  let appendContent = '';
  let message = this.getQuestion();
  let transformer = this.opt.transformer;
  let isFinal = this.status === 'answered';

  if (isFinal) {
    appendContent = this.answer;
  } else {
    appendContent = this.rl.line;
  }

  if (transformer) {
    message += transformer(appendContent, this.answers, { isFinal });
  } else {
    message += appendContent;
  }

  if (error) {
    bottomContent = chalk.red('>> ') + error;
  }

  this.screen.render(message, bottomContent);
};

// adjusted from https://github.com/SBoudrias/Inquirer.js/blob/942908f17319343d1acc7b876f990797c5695918/packages/inquirer/lib/prompts/confirm.js#L64
inquirer.prompt.prompts.confirm.prototype.render = function (answer) {
  let message = this.getQuestion();

  if (this.status === 'answered') {
    message += answer ? 'y' : 'n';
  } else {
    message += this.rl.line;
  }

  this.screen.render(message);

  return this;
};
