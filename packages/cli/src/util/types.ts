export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

// ToTitleCase<'foo-bar'> → 'FooBar'
// ToTitleCase<'foo|bar'> → 'FooOrBar'
export type ToTitleCase<T extends string> =
  T extends `${infer Part}|${infer Rest}`
    ? `${Capitalize<Part>}Or${ToTitleCase<Capitalize<Rest>>}`
    : T extends `${infer Part}-${infer Rest}`
      ? `${Capitalize<Part>}${ToTitleCase<Capitalize<Rest>>}`
      : Capitalize<T>;
