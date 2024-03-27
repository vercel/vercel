import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  isEnterKey,
  makeTheme,
  type Theme,
} from '@inquirer/core';
import type { PartialDeep } from '@inquirer/type';
import chalk from 'chalk';

import isUnicodeSupported from './util/is-unicode-supported';

const unicode = isUnicodeSupported();
const s = (c: string, fallback: string) => (unicode ? c : fallback);
const S_STEP_ACTIVE = s('◆', '*');
const S_STEP_SUBMIT = s('◇', 'o');

const S_BAR = s('│', '|');
const S_BAR_END = s('└', '—');

type Status = 'pending' | 'done';

const symbol = (state: Status) => {
  switch (state) {
    case 'pending':
      return chalk.cyan(S_STEP_ACTIVE);
    case 'done':
      return chalk.green(S_STEP_SUBMIT);
  }
};

type ExpandChoice =
  | { key: string; name: string }
  | { key: string; value: string }
  | { key: string; name: string; value: string };

type ExpandConfig = {
  message: string;
  choices: ReadonlyArray<ExpandChoice>;
  default?: string;
  expanded?: boolean;
  theme?: PartialDeep<Theme>;
};

const helpChoice = {
  key: 'h',
  name: 'Help, list all options',
  value: undefined,
};

function getChoiceKey(choice: ExpandChoice, key: 'name' | 'value'): string {
  if (key === 'name') {
    if ('name' in choice) return choice.name;
    return choice.value;
  }

  if ('value' in choice) return choice.value;
  return choice.name;
}

export default createPrompt<string, ExpandConfig>((config, done) => {
  const {
    choices,
    default: defaultKey = 'h',
    expanded: defaultExpandState = false,
  } = config;
  const [status, setStatus] = useState<string>('pending');
  const [value, setValue] = useState<string>('');
  const [expanded, setExpanded] = useState<boolean>(defaultExpandState);
  const [errorMsg, setError] = useState<string | undefined>(undefined);
  const theme = makeTheme(config.theme);
  const prefix = usePrefix({ theme });

  useKeypress((event, rl) => {
    if (isEnterKey(event)) {
      const answer = (value || defaultKey).toLowerCase();
      if (answer === 'h' && !expanded) {
        setExpanded(true);
      } else {
        const selectedChoice = choices.find(({ key }) => key === answer);
        if (selectedChoice) {
          const finalValue = getChoiceKey(selectedChoice, 'value');
          setValue(finalValue);
          setStatus('done');
          done(finalValue);
        } else if (value === '') {
          setError('Please input a value');
        } else {
          setError(`"${chalk.red(value)}" isn't an available option`);
        }
      }
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  const message = theme.style.message(config.message);

  const title = `${chalk.gray(S_BAR)}\n${symbol(status)}  ${prefix} ${message}`;

  if (status === 'done') {
    // TODO: `value` should be the display name instead of the raw value.
    return `${title}\n${chalk.gray(S_BAR)} ${theme.style.answer(value)}`;
  }

  const allChoices = expanded ? choices : [...choices, helpChoice];

  // Collapsed display style
  let longChoices = '';
  let shortChoices = allChoices
    .map(choice => {
      if (choice.key === defaultKey) {
        return choice.key.toUpperCase();
      }

      return choice.key;
    })
    .join('');
  shortChoices = ` ${theme.style.defaultAnswer(shortChoices)}`;

  // Expanded display style
  if (expanded) {
    shortChoices = '';
    longChoices = allChoices
      .map(choice => {
        const line = `  ${choice.key}) ${getChoiceKey(choice, 'name')}`;
        if (choice.key === value.toLowerCase()) {
          return `${chalk.cyan(S_BAR)} ${theme.style.highlight(line)}`;
        }

        return `${chalk.cyan(S_BAR)} ${line}`;
      })
      .join('\n');
  }

  let helpTip = '';
  const currentOption = allChoices.find(
    ({ key }) => key === value.toLowerCase()
  );
  if (currentOption) {
    helpTip = `${chalk.cyan(S_BAR)}  ${chalk.cyan('>>')} ${getChoiceKey(
      currentOption,
      'name'
    )} `;
  }

  let error = '';
  if (errorMsg) {
    error = theme.style.error(errorMsg);
  }

  return [
    `${title}${shortChoices} \n${chalk.cyan(S_BAR)}  ${value}`,
    `${[longChoices, helpTip, error, chalk.cyan(S_BAR_END)]
      .filter(Boolean)
      .join('\n')}`,
  ];
});
