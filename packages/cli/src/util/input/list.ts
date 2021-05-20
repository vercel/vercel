import inquirer from 'inquirer';
import stripAnsi from 'strip-ansi';
import eraseLines from '../output/erase-lines';

interface ListEntry {
  name: string;
  value: string;
  short: string;
  selected?: boolean;
}

interface ListSeparator {
  separator: string;
}

type ListChoice = ListEntry | ListSeparator | typeof inquirer.Separator;

interface ListOptions {
  message: string;
  choices: ListChoice[];
  pageSize?: number;
  separator?: boolean;
  abort?: 'start' | 'end';
  eraseFinalAnswer?: boolean;
}

function getLength(input: string): number {
  let biggestLength = 0;
  for (const line of input.split('\n')) {
    const str = stripAnsi(line);
    if (str.length > biggestLength) {
      biggestLength = str.length;
    }
  }
  return biggestLength;
}

export default async function list({
  message = 'the question',
  // eslint-disable-line no-unused-vars
  choices: _choices = [
    {
      name: 'something\ndescription\ndetails\netc',
      value: 'something unique',
      short: 'generally the first line of `name`',
    },
  ],
  pageSize = 15, // Show 15 lines without scrolling (~4 credit cards)
  separator = true, // Puts a blank separator between each choice
  abort = 'end', // Whether the `abort` option will be at the `start` or the `end`,
  eraseFinalAnswer = false, // If true, the line with the final answer that inquirer prints will be erased before returning
}: ListOptions): Promise<string> {
  require('./patch-inquirer-legacy');

  let biggestLength = 0;
  let selected: string | undefined;

  // First calculate the biggest length
  for (const choice of _choices) {
    if ('name' in choice) {
      const length = getLength(choice.name);
      if (length > biggestLength) {
        biggestLength = length;
      }
    }
  }

  const choices = _choices.map(choice => {
    if (choice instanceof inquirer.Separator) {
      return choice;
    }

    if ('separator' in choice) {
      const prefix = `── ${choice.separator} `;
      const suffix = '─'.repeat(biggestLength - getLength(prefix));
      return new inquirer.Separator(`${prefix}${suffix}`);
    }

    if ('short' in choice) {
      if (choice.selected) {
        if (selected) throw new Error('Only one choice may be selected');
        selected = choice.short;
      }
      return choice;
    }

    throw new Error('Invalid choice');
  });

  if (separator) {
    for (let i = 0; i < choices.length; i += 2) {
      choices.splice(i, 0, new inquirer.Separator(' '));
    }
  }

  const abortSeparator = new inquirer.Separator('─'.repeat(biggestLength));
  const _abort = {
    name: 'Abort',
    value: '',
    short: '',
  };

  if (abort === 'start') {
    choices.unshift(_abort, abortSeparator);
  } else {
    choices.push(abortSeparator, _abort);
  }

  const answer = await inquirer.prompt({
    name: 'value',
    type: 'list',
    default: selected,
    message,
    choices,
    pageSize,
  });

  if (eraseFinalAnswer === true) {
    process.stdout.write(eraseLines(2));
  }

  return answer.value;
}
