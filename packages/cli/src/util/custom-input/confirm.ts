import {
  createPrompt,
  useState,
  useKeypress,
  isEnterKey,
  makeTheme,
  isUpKey,
  isDownKey,
  type Theme,
  type KeypressEvent,
} from '@inquirer/core';
import type { PartialDeep } from '@inquirer/type';

import isUnicodeSupported from './util/is-unicode-supported';
import chalk from 'chalk';
import ansiEscapes from 'ansi-escapes';

const unicode = isUnicodeSupported();
const s = (c: string, fallback: string) => (unicode ? c : fallback);
const S_STEP_ACTIVE = s('◆', '*');
const S_STEP_SUBMIT = s('◇', 'o');

const S_BAR = s('│', '|');
const S_BAR_END = s('└', '—');

const S_RADIO_ACTIVE = s('●', '>');
const S_RADIO_INACTIVE = s('○', ' ');

type Status = 'pending' | 'done';

const symbol = (state: Status) => {
  switch (state) {
    case 'pending':
      return chalk.cyan(S_STEP_ACTIVE);
    case 'done':
      return chalk.green(S_STEP_SUBMIT);
  }
};

type ConfirmConfig = {
  message: string;
  default?: CursorState;
  active?: string;
  inactive?: string;
  transformer?: (value: boolean) => string;
  theme?: PartialDeep<Theme>;
};

const isLeftKey = (key: KeypressEvent): boolean =>
  // The left key
  key.name === 'left' ||
  // Vim keybinding
  key.name === 'h' ||
  // Emacs keybinding
  (key.ctrl && key.name === 'b');

const isRightKey = (key: KeypressEvent): boolean =>
  // The right key
  key.name === 'right' ||
  // Vim keybinding
  key.name === 'l' ||
  // Emacs keybinding
  (key.ctrl && key.name === 'f');

export type CursorState = 'yes' | 'no';

export default createPrompt<boolean, ConfirmConfig>((config, done) => {
  const { transformer = answer => (answer ? 'yes' : 'no') } = config;
  const [status, setStatus] = useState<Status>('pending');
  const [value, setValue] = useState('');
  const [cursorStatus, setCursorStatus] = useState<CursorState>(
    (config.default ? 'yes' : 'no') ?? 'yes'
  );
  const theme = makeTheme(config.theme);

  const active = config.active ?? 'Yes';
  const inactive = config.active ?? 'No';

  const toggle = (cursor_state: CursorState): CursorState => {
    if (cursor_state === 'yes') {
      return 'no';
    } else {
      return 'yes';
    }
  };

  useKeypress(key => {
    if (isEnterKey(key)) {
      let answer = cursorStatus === 'yes';

      setValue(transformer(answer));
      setStatus('done');
      done(answer);
    } else if (
      isUpKey(key) ||
      isDownKey(key) ||
      isLeftKey(key) ||
      isRightKey(key)
    ) {
      setCursorStatus(toggle(cursorStatus));
      // setValue(rl.line);
    }
  });

  const message = theme.style.message(config.message);
  const title = `${chalk.gray(S_BAR)}\n${symbol(status)}  ${message}\n`;

  const output = (status: Status) => {
    switch (status) {
      case 'done':
        return `${title}${chalk.gray(S_BAR)}  ${chalk.dim(
          value === 'yes' ? active : inactive
        )}`;
      default:
        return `${title}${chalk.cyan(S_BAR)}  ${
          cursorStatus === 'yes'
            ? `${chalk.green(S_RADIO_ACTIVE)} ${active}`
            : `${chalk.dim(S_RADIO_INACTIVE)} ${chalk.dim(active)}`
        } ${chalk.dim('/')} ${
          cursorStatus === 'no'
            ? `${chalk.green(S_RADIO_ACTIVE)} ${inactive}`
            : `${chalk.dim(S_RADIO_INACTIVE)} ${chalk.dim(inactive)}`
        } \n${chalk.cyan(S_BAR_END)} \n${ansiEscapes.cursorHide} `;
    }
  };

  return output(status);
});
