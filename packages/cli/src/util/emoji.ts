const emojiLabels = {
  notice: '📝',
  tip: '💡',
  warning: '❗️',
  link: '🔗',
  inspect: '🔍',
  success: '✅',
  locked: '🔒',
  loading: '⏳',
} as const;

const stripEmojiRegex = new RegExp(Object.values(emojiLabels).join('|'), 'gi');

export type EmojiLabel = keyof typeof emojiLabels;

export function emoji<Label extends EmojiLabel>(
  label: Label
): (typeof emojiLabels)[Label] {
  return emojiLabels[label];
}

export function prependEmoji(message: string, emoji?: string): string {
  if (emoji && process.stdout.isTTY) {
    return `${emoji}  ${message}`;
  }

  return message;
}

export function removeEmoji(message: string): string {
  const emojiAtStart = message.search(stripEmojiRegex) === 0;
  const result = message.replace(stripEmojiRegex, '');
  // Multiline CLI output (e.g. `help()`) often starts with a leading newline;
  // trimStart() would strip that and break snapshots when NO_COLOR is set.
  if (result.startsWith('\n')) {
    return result;
  }
  // Padding after a leading emoji (e.g. `prependEmoji`) should be trimmed.
  if (emojiAtStart) {
    return result.trimStart();
  }
  // Preserve leading spaces (e.g. indented lines from `output.print` under a header).
  if (result.startsWith(' ')) {
    return result;
  }
  return result.trimStart();
}
