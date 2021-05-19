import inquirer from 'inquirer';
import stripAnsi from 'strip-ansi';
import eraseLines from '../output/erase-lines';

function getLength(string) {
  let biggestLength = 0;
  string.split('\n').map(str => {
    str = stripAnsi(str);
    if (str.length > biggestLength) {
      biggestLength = str.length;
    }
    return undefined;
  });
  return biggestLength;
}

export default async function ({
  message = 'the question',
  // eslint-disable-line no-unused-vars
  choices = [
    {
      name: 'something\ndescription\ndetails\netc',
      value: 'something unique',
      short: 'generally the first line of `name`',
    },
  ],
  pageSize = 15, // Show 15 lines without scrolling (~4 credit cards)
  separator = true, // Puts a blank separator between each choice
  abort = 'end', // Wether the `abort` option will be at the `start` or the `end`,
  eraseFinalAnswer = false, // If true, the line with the final answer that inquirer prints will be erased before returning
}) {
  require('./patch-inquirer-legacy');

  let selected;
  let biggestLength = 0;

  choices = choices.map(choice => {
    if (choice.name) {
      const length = getLength(choice.name);
      if (length > biggestLength) {
        biggestLength = length;
      }
      if (choice.selected) {
        if (selected) throw new Error('Only one choice may be selected');
        selected = choice.short;
      }
      return choice;
    }

    if (choice instanceof inquirer.Separator) {
      return choice;
    }

    throw new Error('Invalid choice');
  });

  if (separator === true) {
    choices = choices.reduce(
      (prev, curr) => prev.concat(new inquirer.Separator(' '), curr),
      []
    );
  }

  const abortSeparator = new inquirer.Separator('─'.repeat(biggestLength));
  const _abort = {
    name: 'Abort',
    value: undefined,
  };

  if (abort === 'start') {
    const blankSep = choices.shift();
    choices.unshift(abortSeparator);
    choices.unshift(_abort);
    choices.unshift(blankSep);
  } else {
    choices.push(abortSeparator);
    choices.push(_abort);
  }

  const nonce = Date.now();
  const answer = await inquirer.prompt({
    name: nonce,
    type: 'list',
    default: selected,
    message,
    choices,
    pageSize,
  });

  if (eraseFinalAnswer === true) {
    process.stdout.write(eraseLines(2));
  }

  return answer[nonce];
}
