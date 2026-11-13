import type { KeyEvent } from './ui/keys';
import type { Line } from './ui/text';
import { color, glyph } from './theme';
import { truncate } from './ui/text';

export interface SelectItem<T> {
  label: string;
  value: T;
  hint?: string;
}

/** Arrow keys or number keys pick, Enter confirms, Esc cancels. */
export class SelectList<T> {
  index = 0;

  constructor(
    readonly items: SelectItem<T>[],
    private onSelect: (value: T) => void,
    private onCancel?: () => void
  ) {}

  handleKey(event: KeyEvent): void {
    const count = this.items.length;
    if (event.name === 'up') {
      this.index = (this.index - 1 + count) % count;
    } else if (event.name === 'down' || event.name === 'tab') {
      this.index = (this.index + 1) % count;
    } else if (event.name === 'return' && this.items[this.index]) {
      this.onSelect(this.items[this.index]!.value);
    } else if (event.name === 'escape') {
      this.onCancel?.();
    } else if (event.name === 'char' && !event.ctrl && !event.meta) {
      const number = Number.parseInt(event.text ?? '', 10);
      if (number >= 1 && number <= count)
        this.onSelect(this.items[number - 1]!.value);
    }
  }

  view(width: number): Line[] {
    return this.items.map((item, i) => {
      const selected = i === this.index;
      return truncate(
        [
          {
            text: `${selected ? glyph.selected : ' '} ${i + 1}. ${item.label}`,
            style: selected ? { color: color.accent } : undefined,
          },
          ...(item.hint
            ? [
                {
                  text: `  ${item.hint}`,
                  style: { color: color.subtle },
                },
              ]
            : []),
        ],
        width
      );
    });
  }
}
