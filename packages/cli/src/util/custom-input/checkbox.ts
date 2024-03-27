import {
  createPrompt,
  useState,
  useKeypress,
  usePrefix,
  usePagination,
  useMemo,
  makeTheme,
  isUpKey,
  isDownKey,
  isSpaceKey,
  isNumberKey,
  isEnterKey,
  ValidationError,
  Separator,
  type Theme,
} from '@inquirer/core';
import type { PartialDeep } from '@inquirer/type';
import chalk from 'chalk';
import figures from './util/figures';
import ansiEscapes from 'ansi-escapes';

import isUnicodeSupported from './util/is-unicode-supported';

const unicode = isUnicodeSupported();
const s = (c: string, fallback: string) => (unicode ? c : fallback);
const S_STEP_ACTIVE = s('◆', '*');
const S_STEP_SUBMIT = s('◇', 'o');

const S_BAR = s('│', '|');

const S_CHECKBOX_SELECTED = s('◼', '[+]');
const S_CHECKBOX_INACTIVE = s('◻', '[ ]');

type Status = 'pending' | 'done';

const symbol = (state: Status) => {
  switch (state) {
    case 'pending':
      return chalk.cyan(S_STEP_ACTIVE);
    case 'done':
      return chalk.green(S_STEP_SUBMIT);
  }
};

type CheckboxTheme = {
  icon: {
    checked: string;
    unchecked: string;
    cursor: string;
  };
  style: {
    disabledChoice: (text: string) => string;
    renderSelectedChoices: <T>(
      selectedChoices: ReadonlyArray<Choice<T>>,
      allChoices: ReadonlyArray<Choice<T> | Separator>
    ) => string;
  };
};

const checkboxTheme: CheckboxTheme = {
  icon: {
    checked: chalk.green(figures.circleFilled),
    unchecked: figures.circle,
    cursor: figures.pointer,
  },
  style: {
    disabledChoice: (text: string) => chalk.dim(`- ${text}`),
    renderSelectedChoices: selectedChoices =>
      selectedChoices.map(choice => choice.name || choice.value).join(', '),
  },
};

type Choice<Value> = {
  name?: string;
  value: Value;
  disabled?: boolean | string;
  checked?: boolean;
  type?: never;
};

type Config<Value> = {
  message: string;
  prefix?: string;
  pageSize?: number;
  instructions?: string | boolean;
  choices: ReadonlyArray<Choice<Value> | Separator>;
  loop?: boolean;
  required?: boolean;
  validate?: (
    items: ReadonlyArray<Item<Value>>
  ) => boolean | string | Promise<string | boolean>;
  theme?: PartialDeep<Theme<CheckboxTheme>>;
};

type Item<Value> = Separator | Choice<Value>;

function isSelectable<Value>(item: Item<Value>): item is Choice<Value> {
  return !Separator.isSeparator(item) && !item.disabled;
}

function isChecked<Value>(item: Item<Value>): item is Choice<Value> {
  return isSelectable(item) && Boolean(item.checked);
}

function toggle<Value>(item: Item<Value>): Item<Value> {
  return isSelectable(item) ? { ...item, checked: !item.checked } : item;
}

function check(checked: boolean) {
  return function <Value>(item: Item<Value>): Item<Value> {
    return isSelectable(item) ? { ...item, checked } : item;
  };
}

export default createPrompt(
  <Value>(config: Config<Value>, done: (value: Array<Value>) => void) => {
    const {
      instructions,
      pageSize = 7,
      loop = true,
      choices,
      required,
      validate = () => true,
    } = config;
    const theme = makeTheme<CheckboxTheme>(checkboxTheme, config.theme);
    const prefix = usePrefix({ theme });
    const [status, setStatus] = useState<Status>('pending');
    const [items, setItems] = useState<ReadonlyArray<Item<Value>>>(
      choices.map(choice => ({ ...choice }))
    );

    const bounds = useMemo(() => {
      const first = items.findIndex(isSelectable);
      // TODO: Replace with `findLastIndex` when it's available.
      const last =
        items.length - 1 - [...items].reverse().findIndex(isSelectable);

      if (first < 0) {
        throw new ValidationError(
          '[checkbox prompt] No selectable choices. All choices are disabled.'
        );
      }

      return { first, last };
    }, [items]);

    const [active, setActive] = useState(bounds.first);
    const [showHelpTip, setShowHelpTip] = useState(true);
    const [errorMsg, setError] = useState<string | undefined>(undefined);

    useKeypress(async key => {
      if (isEnterKey(key)) {
        const selection = items.filter(isChecked);
        const isValid = await validate([...selection]);
        if (required && !items.some(isChecked)) {
          setError('At least one choice must be selected');
        } else if (isValid === true) {
          setStatus('done');
          done(selection.map(choice => choice.value));
        } else {
          setError(isValid || 'You must select a valid value');
        }
      } else if (isUpKey(key) || isDownKey(key)) {
        if (
          loop ||
          (isUpKey(key) && active !== bounds.first) ||
          (isDownKey(key) && active !== bounds.last)
        ) {
          const offset = isUpKey(key) ? -1 : 1;
          let next = active;
          do {
            next = (next + offset + items.length) % items.length;
          } while (!isSelectable(items[next]!));
          setActive(next);
        }
      } else if (isSpaceKey(key)) {
        setError(undefined);
        setShowHelpTip(false);
        setItems(
          items.map((choice, i) => (i === active ? toggle(choice) : choice))
        );
      } else if (key.name === 'a') {
        const selectAll = Boolean(
          items.find(choice => isSelectable(choice) && !choice.checked)
        );
        setItems(items.map(check(selectAll)));
      } else if (key.name === 'i') {
        setItems(items.map(toggle));
      } else if (isNumberKey(key)) {
        // Adjust index to start at 1
        const position = Number(key.name) - 1;
        const item = items[position];
        if (item != null && isSelectable(item)) {
          setActive(position);
          setItems(
            items.map((choice, i) => (i === position ? toggle(choice) : choice))
          );
        }
      }
    });

    const message = theme.style.message(config.message);

    const page = usePagination<Item<Value>>({
      items,
      active,
      renderItem({ item, isActive }: { item: Item<Value>; isActive: boolean }) {
        if (Separator.isSeparator(item)) {
          return `${chalk.cyan(S_BAR)}   ${item.separator}`;
        }

        const line = item.name || item.value;
        if (item.disabled) {
          const disabledLabel =
            typeof item.disabled === 'string' ? item.disabled : '(disabled)';
          return `${chalk.cyan(S_BAR)}  ${theme.style.disabledChoice(
            `${line} ${disabledLabel}`
          )}`;
        }

        const checkbox = item.checked
          ? S_CHECKBOX_SELECTED
          : S_CHECKBOX_INACTIVE;
        const color = isActive ? theme.style.highlight : (x: string) => x;
        // const cursor = isActive ? " " : " ";
        return `${chalk.cyan(S_BAR)}  ${color(`${checkbox} ${line}`)}`;
      },
      pageSize,
      loop,
      theme,
    });

    let helpTip = '';
    if (showHelpTip && (instructions === undefined || instructions)) {
      if (typeof instructions === 'string') {
        helpTip = instructions;
      } else {
        const keys = [
          `${theme.style.key('space')} to select`,
          `${theme.style.key('a')} to toggle all`,
          `${theme.style.key('i')} to invert selection`,
          `and ${theme.style.key('enter')} to proceed`,
        ];
        helpTip = ` (Press ${keys.join(', ')})`;
      }
    }
    const title_basic = `${chalk.gray(S_BAR)}\n${symbol(
      status
    )}  ${prefix} ${message}`;
    const title_with_help = `${title_basic}${helpTip}\n`;
    const title_without_help = `${title_basic}\n`;

    if (status === 'done') {
      const selection = items.filter(isChecked);
      const answer = theme.style.answer(
        theme.style.renderSelectedChoices(selection, items)
      );

      return `${title_without_help}${chalk.gray(S_BAR)} ${answer}`;
    }

    let error = '';
    if (errorMsg) {
      error = theme.style.error(errorMsg);
    }

    return `${title_with_help}${page}\n${error}${ansiEscapes.cursorHide}`;
  }
);

export { Separator };
