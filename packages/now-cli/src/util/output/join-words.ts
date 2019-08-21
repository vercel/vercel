export default function joinWords(words: string[] = []) {
  if (words.length === 0) {
    return '';
  }

  if (words.length === 1) {
    return words[0];
  }

  const last = words[words.length - 1];
  const rest = words.slice(0, words.length - 1);
  return `${rest.join(', ')} and ${last}`;
}
