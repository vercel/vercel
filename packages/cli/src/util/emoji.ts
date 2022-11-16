const emojiLabels = {
  notice: '📝',
  tip: '💡',
  warning: '❗️',
  link: '🔗',
  inspect: '🔍',
  success: '✅',
  locked: '🔒',
} as const;

export type EmojiLabel = keyof typeof emojiLabels;

export function emoji(label: EmojiLabel) {
  return emojiLabels[label];
}

export function prependEmoji(message: string, emoji?: string): string {
  if (emoji && process.stdout.isTTY) {
    return `${emoji}  ${message}`;
  }

  return message;
}

export function removeEmoji(message: string): string {
  const regExp = new RegExp(Object.values(emojiLabels).join('|'), 'gi');
  const result = message.replace(regExp, '').trimStart();

  return result;
}
