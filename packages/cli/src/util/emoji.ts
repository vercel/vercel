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
  if (emoji && process.stdout.isTTY && process.env.NO_COLOR !== '1') {
    return `${emoji}  ${message}`;
  }

  return message;
}
