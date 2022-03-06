import type { MiddlewareIndexed } from '../src/types';

type Assignable<A, B extends A> = B extends A ? 'okay' : 'not okay';

type middleware_tests = [
  // @ts-expect-error - not assignable, example
  Assignable<'hello', string>,

  Assignable<MiddlewareIndexed, { middleware: 1 }>,
  Assignable<MiddlewareIndexed, { middlewarePath: 'hello.js' }>,

  // Can be assigned an empty object
  Assignable<MiddlewareIndexed, Record<string, never>>,

  // @ts-expect-error - can't assign to both middleware and middlewarePath
  Assignable<MiddlewareIndexed, { middlewarePath: 'hello.js'; middleware: 10 }>
];
