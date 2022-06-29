import type { MatcherState } from 'expect';

export * from './to-wait-for';

export function toHaveWordsCount(
  this: MatcherState,
  sentence: string,
  wordsCount: number
) {
  // implementation redacted
}
