/**
 * This file registers the custom Jest "matchers" that are useful for
 * writing CLI unit tests, and sets them up to be recognized by TypeScript.
 *
 * References:
 *  - https://haspar.us/notes/adding-jest-custom-matchers-in-typescript
 *  - https://gist.github.com/hasparus/4ebaa17ec5d3d44607f522bcb1cda9fb
 */

/// <reference types="@types/node" />
/// <reference types="@types/jest" />
import { PassThrough } from 'stream';
import type { MatcherState } from 'expect';

import * as _matchers from './matchers';

const matchers = {
  ..._matchers,
  toHaveWordsCount(this: MatcherState, sentence: string, wordsCount: number) {
    // implementation redacted
  },
};

type Tail<T extends unknown[]> = T extends [infer _Head, ...infer Tail]
  ? Tail
  : never;

type AnyFunction = (...args: never[]) => unknown;

type GetMatchersType<TMatchers, TResult> = {
  [P in keyof TMatchers]: TMatchers[P] extends AnyFunction
    ? AnyFunction extends TMatchers[P]
      ? (...args: Tail<Parameters<TMatchers[P]>>) => TResult
      : TMatchers[P]
    : TMatchers[P];
};

type FirstParam<T extends AnyFunction> = Parameters<T>[0];

type OnlyMethodsWhereFirstArgIsOfType<TObject, TWantedFirstArg> = {
  [P in keyof TObject]: TObject[P] extends AnyFunction
    ? TWantedFirstArg extends FirstParam<TObject[P]>
      ? TObject[P]
      : [
          `Error: this function is present only when received is:`,
          FirstParam<TObject[P]>
        ]
    : TObject[P];
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Matchers<R, T = {}>
      extends GetMatchersType<
        OnlyMethodsWhereFirstArgIsOfType<typeof matchers, T>,
        R
      > {}
  }
}

const jestExpect = (global as any).expect;

if (jestExpect !== undefined) {
  jestExpect.extend(matchers);
} else {
  console.error("Couldn't find Jest's global expect.");
}

// ✅
expect(new PassThrough()).toWaitFor('test');
expect(process.stdout).toWaitFor('test');
expect('foo bar').toWaitFor(2);

// 🔥 error as expected
expect('foo bar').toHaveWordsCount(2);
expect(20).toHaveWordsCount(2);
