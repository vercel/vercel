export type EmojiLabel =
  | 'notice'
  | 'tip'
  | 'warning'
  | 'link'
  | 'inspect'
  | 'success';

export function emoji(label: EmojiLabel): string | undefined {
  switch (label) {
    case 'notice':
      return '📝';
    case 'tip':
      return '💡';
    case 'warning':
      return '❗️';
    case 'link':
      return '🔗';
    case 'inspect':
      return '🔍';
    case 'success':
      return '✅';
    default:
      return undefined;
  }
}

export function prependEmoji(message: string, emoji?: string): string {
  if (emoji && process.stdout.isTTY) {
    return `${emoji}  ${message}`;
  }

  return message;
}
