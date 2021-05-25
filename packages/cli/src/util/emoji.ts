export const emojiLabels = {
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
