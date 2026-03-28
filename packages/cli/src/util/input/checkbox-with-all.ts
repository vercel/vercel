/**
 * Custom checkbox prompt with an "All" toggle that implements mutual exclusion:
 * - Checking "All" checks every individual item
 * - Unchecking "All" unchecks every individual item
 * - Unchecking any individual item unchecks "All"
 * - Checking every individual item re-checks "All"
 *
 * Built on top of @inquirer/core (same primitives as @inquirer/checkbox).
 */
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
} from '@inquirer/core';
import chalk from 'chalk';
import ansiEscapes from 'ansi-escapes';

const ICONS = { circle: '◯', circleFilled: '◉', pointer: '❯' };
const ALL_SENTINEL = Symbol('__all__');

type Item<T> = {
  name: string;
  value: T | typeof ALL_SENTINEL;
  checked: boolean;
  disabled: boolean | string;
};

type Choice<T> = {
  name: string;
  value: T;
  checked?: boolean;
  disabled?: boolean | string;
};

type Config<T> = {
  message: string;
  allLabel?: string;
  choices: Choice<T>[];
  pageSize?: number;
  loop?: boolean;
  required?: boolean;
  theme?: Record<string, unknown>;
};

function toggleItem<T>(items: Item<T>[], activeIdx: number): Item<T>[] {
  const current = items[activeIdx];
  if (!current || current.disabled) return items;

  const isAllItem = current.value === ALL_SENTINEL;
  const newChecked = !current.checked;

  if (isAllItem) {
    return items.map(item => ({
      ...item,
      checked: item.disabled ? item.checked : newChecked,
    }));
  }

  const updated = items.map((item, i) =>
    i === activeIdx ? { ...item, checked: newChecked } : item
  );
  const individuals = updated.filter(
    i => i.value !== ALL_SENTINEL && !i.disabled
  );
  updated[0] = { ...updated[0], checked: individuals.every(i => i.checked) };
  return updated;
}

const checkboxWithAllPrompt = createPrompt(
  <T>(config: Config<T>, done: (value: T[]) => void) => {
    const { pageSize = 7, loop = true, required, allLabel = 'All' } = config;
    const theme = makeTheme(config.theme ?? {});
    const prefix = usePrefix({ theme });

    const initialItems: Item<T>[] = [
      {
        name: allLabel,
        value: ALL_SENTINEL,
        checked: config.choices.every(c => c.checked !== false),
        disabled: false,
      },
      ...config.choices.map(c => ({
        name: c.name,
        value: c.value,
        checked: c.checked !== false,
        disabled: c.disabled ?? false,
      })),
    ];

    const [status, setStatus] = useState<'pending' | 'done'>('pending');
    const [items, setItems] = useState(initialItems);
    const bounds = useMemo(() => {
      const last = items.length - 1;
      return { first: 0, last };
    }, [items]);
    const [active, setActive] = useState(0);
    const [showHelpTip, setShowHelpTip] = useState(true);
    const [errorMsg, setError] = useState<string | undefined>(undefined);

    useKeypress((key: { name: string; ctrl: boolean }) => {
      if (isEnterKey(key)) {
        const individuals = items.filter(
          i => i.value !== ALL_SENTINEL && !i.disabled
        );
        const allItem = items[0];
        const selection = allItem?.checked
          ? individuals
          : individuals.filter(i => i.checked);

        if (required && selection.length === 0) {
          setError('At least one choice must be selected');
        } else {
          setStatus('done');
          done(selection.map(i => i.value as T));
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
          } while (items[next]?.disabled);
          setActive(next);
        }
      } else if (isSpaceKey(key)) {
        setError(undefined);
        setShowHelpTip(false);
        setItems(toggleItem(items, active));
      } else if (isNumberKey(key)) {
        const position = Number(key.name) - 1;
        if (
          position >= 0 &&
          position < items.length &&
          !items[position]?.disabled
        ) {
          setActive(position);
          setItems(toggleItem(items, position));
        }
      }
    });

    const message = theme.style.message(config.message);

    const page = usePagination({
      items,
      active,
      renderItem({ item, isActive }: { item: Item<T>; isActive: boolean }) {
        const line = item.name;
        if (item.disabled) {
          const label =
            typeof item.disabled === 'string' ? item.disabled : '(disabled)';
          return chalk.dim(`- ${line} ${label}`);
        }
        const icon = item.checked
          ? chalk.green(ICONS.circleFilled)
          : ICONS.circle;
        const color = isActive ? theme.style.highlight : (x: string) => x;
        const cursor = isActive ? ICONS.pointer : ' ';
        return color(`${cursor}${icon} ${line}`);
      },
      pageSize,
      loop,
      theme,
    });

    if (status === 'done') {
      const selection = items.filter(
        i => i.checked && i.value !== ALL_SENTINEL
      );
      const allItem = items[0];
      const label = allItem?.checked
        ? allLabel
        : selection.map(i => i.name).join(', ');
      return `${prefix} ${message} ${theme.style.answer(label)}`;
    }

    let helpTip = '';
    if (showHelpTip) {
      helpTip = ` (Press ${theme.style.key('space')} to select, ${theme.style.key('enter')} to proceed)`;
    }

    const error = errorMsg ? theme.style.error(errorMsg) : '';
    return `${prefix} ${message}${helpTip}\n${page}\n${error}${ansiEscapes.cursorHide}`;
  }
);

export default checkboxWithAllPrompt;
