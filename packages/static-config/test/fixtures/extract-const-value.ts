export const TEST_CASES = [
  {
    identifier: 'config',
    input: `export const config = { a: 'string1', b: "string2" }`,
    expected: {
      a: 'string1',
      b: 'string2',
    },
  },
  {
    identifier: 'config',
    input: `export const config = { 'a': 'string1', "b": "string2" }`,
    expected: {
      a: 'string1',
      b: 'string2',
    },
  },
  {
    identifier: 'config',
    input: `export const config = { 'a': '\\tstring1', "b": "\\tstring2" }`,
    expected: {
      a: '\tstring1',
      b: '\tstring2',
    },
  },
  {
    identifier: 'config',
    input: `export const config = { a: null, b: undefined }`,
    expected: {
      a: null,
      b: undefined,
    },
  },
  {
    identifier: 'config',
    input: `export const config = { a: true, b: false }`,
    expected: {
      a: true,
      b: false,
    },
  },
  {
    identifier: 'config',
    input: `export const config = { a: 123, b: 456.789 }`,
    expected: {
      a: 123,
      b: 456.789,
    },
  },
  {
    identifier: 'config',
    input: `export const config = { a: [1, [2, 3]] }`,
    expected: {
      a: [1, [2, 3]],
    },
  },
  {
    identifier: 'config',
    input: `export const config = { a: [1,,3] }`,
    expected: {
      a: [1, undefined, 3],
    },
  },
  {
    identifier: 'config',
    input: `export const config = { a: { b: 123, c: { d: 'nested' } } }`,
    expected: {
      a: {
        b: 123,
        c: {
          d: 'nested',
        },
      },
    },
  },
  {
    identifier: 'config2',
    input: `export const config1 = 1; export const config2 = 2;`,
    expected: 2,
  },
  {
    identifier: 'runtime',
    input: `export const runtime = 'edge'`,
    expected: 'edge',
  },
];

export const UNSUPPORTED_VALUE_CASES = [
  {
    identifier: 'config',
    input: `export const config = { a: 1 + 2 + 3 }`,
  },
  {
    identifier: 'config',
    input: `export const config = { 123: "a" }`,
  },
  {
    identifier: 'config',
    input: `export const config = { ["a"]: true }`,
  },
  {
    identifier: 'config',
    input: `export const config = { a: foo }`,
  },
  {
    identifier: 'config',
    input: `export const config = { foo }`,
  },
  {
    identifier: 'config',
    input: `export const config = { ...foo }`,
  },
  {
    identifier: 'config',
    input: `export const config = [ ...foo ]`,
  },
];

export const NO_SUCH_DECLARATION_CASES = [
  {
    identifier: 'no_such_identifier',
    input: `export const runtime = "edge"`,
  },
  {
    identifier: 'runtime',
    input: `const runtime = "edge"`,
  },
  {
    identifier: 'runtime',
    input: `export let runtime = "edge"`,
  },
  {
    identifier: 'runtime',
    input: `export var runtime = "edge"`,
  },
  {
    identifier: 'runtime',
    input: `export function runtime() {}`,
  },
];
