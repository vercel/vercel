import {
  createPrompt,
  useState,
  useKeypress,
  isEnterKey,
  isBackspaceKey,
  makeTheme,
  type Theme,
} from '@inquirer/core';

import type { PartialDeep } from '@inquirer/type';
import chalk from 'chalk';
import ansiEscapes from 'ansi-escapes';
import isUnicodeSupported from './util/is-unicode-supported';

const unicode = isUnicodeSupported();
const s = (c: string, fallback: string) => (unicode ? c : fallback);
const S_STEP_ACTIVE = s('◆', '*');
const S_STEP_CANCEL = s('■', 'x');
const S_STEP_SUBMIT = s('◇', 'o');

const S_BAR = s('│', '|');
const S_BAR_END = s('└', '—');

type InputConfig = {
  message: string;
  default?: string;
  transformer?: (value: string, { isFinal }: { isFinal: boolean }) => string;
  validate?: (value: string) => boolean | string | Promise<string | boolean>;
  theme?: PartialDeep<Theme>;
};

type Status = 'pending' | 'loading' | 'done';

const symbol = (state: Status) => {
  switch (state) {
    case 'pending':
      return chalk.cyan(S_STEP_ACTIVE);
    case 'loading':
      return chalk.red(S_STEP_CANCEL);
    case 'done':
      return chalk.green(S_STEP_SUBMIT);
  }
};

export default createPrompt<string, InputConfig>((config, done) => {
  const { validate = () => true } = config;
  const theme = makeTheme(config.theme);
  const [status, setStatus] = useState<Status>('pending');
  const [cursorIndex, setCursorIndex] = useState<number>(0);
  const [defaultValue = '', setDefaultValue] = useState<string>(
    config.default || ''
  );
  const [errorMsg, setError] = useState<string | undefined>(undefined);
  const [value, setValue] = useState<string>('');

  useKeypress(async (key, rl) => {
    // Ignore keypress while our prompt is doing other processing.
    if (status !== 'pending') {
      return;
    }
    setCursorIndex(rl.cursor);
    if (isEnterKey(key)) {
      const answer = value || defaultValue;
      setStatus('loading');
      const isValid = await validate(answer);
      if (isValid === true) {
        setValue(answer);
        setStatus('done');
        done(answer);
      } else {
        // Reset the readline line value to the previous value. On line event, the value
        // get cleared, forcing the user to re-enter the value instead of fixing it.
        rl.write(value);
        setError(isValid || 'You must provide a valid value');
        setStatus('pending');
      }
    } else if (isBackspaceKey(key) && !value) {
      setDefaultValue('');
    } else if (key.name === 'tab' && !value) {
      setDefaultValue('');
      rl.clearLine(0); // Remove the tab character.
      rl.write(defaultValue);
      setValue(defaultValue);
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  const message = theme.style.message(config.message);
  let formattedValue = value;
  if (typeof config.transformer === 'function') {
    formattedValue = config.transformer(value, { isFinal: status === 'done' });
  } else if (status === 'done') {
    formattedValue = theme.style.answer(value);
  }

  let error = '';
  if (errorMsg) {
    error = theme.style.error(errorMsg);
  }

  let valueWithCursor: any;
  if (cursorIndex && cursorIndex >= value.length) {
    valueWithCursor = `${value}${chalk.inverse(chalk.hidden(' '))}`;
  } else {
    const s1 = value.slice(0, cursorIndex);
    const s2 = value.slice(cursorIndex);
    if (s2.length !== 0)
      valueWithCursor = `${s1}${chalk.inverse(s2[0])}${s2.slice(1)}`;
    else valueWithCursor = `${s1}${chalk.inverse(' ')}`;
  }

  const title = `${chalk.gray(S_BAR)}\n${symbol(status)}  ${message}\n`;

  const output = (status: any) => {
    switch (status) {
      case 'done':
        return `${title}${chalk.gray(S_BAR)}  ${formattedValue}`;
      default:
        return `${title}${chalk.cyan(S_BAR)}  ${valueWithCursor}\n${chalk.cyan(
          S_BAR_END
        )}\n${ansiEscapes.cursorHide}`;
    }
  };

  return [output(status), error];
});
