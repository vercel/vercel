/**
 * This file registers the custom Jest "matchers" that are useful for
 * writing CLI unit tests, and sets them up to be recognized by TypeScript.
 *
 * References:
 *  - https://haspar.us/notes/adding-jest-custom-matchers-in-typescript
 *  - https://gist.github.com/hasparus/4ebaa17ec5d3d44607f522bcb1cda9fb
 */

/// <reference types="@types/jest" />

import * as matchers from './matchers';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
type Tail<T extends unknown[]> = T extends [infer _Head, ...infer Tail]
  ? Tail
  : never;

type AnyFunction = (...args: any[]) => any;
type PromiseFunction = (...args: any[]) => Promise<any>;

type GetMatcherType<TP, TResult> = TP extends PromiseFunction
  ? (...args: Tail<Parameters<TP>>) => Promise<TResult>
  : TP extends AnyFunction
  ? (...args: Tail<Parameters<TP>>) => TResult
  : TP;

type GetMatchersType<TMatchers, TResult> = {
  [P in keyof TMatchers]: GetMatcherType<TMatchers[P], TResult>;
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
