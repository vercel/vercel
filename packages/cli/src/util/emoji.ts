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
  const result = message.replace(stripEmojiRegex, '');
  // Multiline CLI output (e.g. `help()`) often starts with a leading newline;
  // trimStart() would strip that and break snapshots when NO_COLOR is set.
  return result.startsWith('\n') ? result : result.trimStart();
}
