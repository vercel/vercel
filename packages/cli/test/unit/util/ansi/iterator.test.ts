import { Readable } from 'stream';
import { createAnsiIterator } from '../../../../src/util/ansi/iterator';

async function toArray<T>(it: AsyncIterable<T>): Promise<T[]> {
  const arr: T[] = [];
  for await (const next of it) arr.push(next);
  return arr;
}

describe('createAnsiIterator()', () => {
  it('should parse CUU (cursor up) escape', async () => {
    const stream = Readable.from([
      '\u001B[A',
      '\u001B[1A',
      '\u001B[5A',
      '\u001B',
      '[A',
    ]);
    const iterator = createAnsiIterator(stream);
    const array = await toArray(iterator);
    expect(array).toMatchInlineSnapshot(`
      [
        {
          "abbr": "CUU",
          "code": "A",
          "leftover": "",
          "parameters": "",
          "raw": "[A",
          "steps": 1,
          "type": "escape",
        },
        {
          "abbr": "CUU",
          "code": "A",
          "leftover": "",
          "parameters": "1",
          "raw": "[1A",
          "steps": 1,
          "type": "escape",
        },
        {
          "abbr": "CUU",
          "code": "A",
          "leftover": "",
          "parameters": "5",
          "raw": "[5A",
          "steps": 5,
          "type": "escape",
        },
        {
          "abbr": "CUU",
          "code": "A",
          "leftover": "",
          "parameters": "",
          "raw": "[A",
          "steps": 1,
          "type": "escape",
        },
      ]
    `);
  });

  it('should parse CUP (cursor position) escape', async () => {
    const stream = Readable.from([
      '\u001B[3;4Hhi',
      '\u001B[;5H',
      '\u001B[8H',
      '\u001B',
      '[H',
    ]);
    const iterator = createAnsiIterator(stream);
    const array = await toArray(iterator);
    expect(array).toMatchInlineSnapshot(`
      [
        {
          "abbr": "CUP",
          "code": "H",
          "column": 4,
          "leftover": "hi",
          "parameters": "3;4",
          "raw": "[3;4H",
          "row": 3,
          "type": "escape",
        },
        {
          "raw": "hi",
          "type": "text",
        },
        {
          "abbr": "CUP",
          "code": "H",
          "column": 5,
          "leftover": "",
          "parameters": ";5",
          "raw": "[;5H",
          "row": 1,
          "type": "escape",
        },
        {
          "abbr": "CUP",
          "code": "H",
          "column": 1,
          "leftover": "",
          "parameters": "8",
          "raw": "[8H",
          "row": 8,
          "type": "escape",
        },
        {
          "abbr": "CUP",
          "code": "H",
          "column": 1,
          "leftover": "",
          "parameters": "",
          "raw": "[H",
          "row": 1,
          "type": "escape",
        },
      ]
    `);
  });

  it('should parse color and reset escapes', async () => {
    const stream = Readable.from([
      '🤖\u001B[31m DANGER\u001B[0m Will Robbinson',
    ]);
    const iterator = createAnsiIterator(stream);
    const array = await toArray(iterator);
    expect(array).toMatchInlineSnapshot(`
      [
        {
          "leftover": "[31m DANGER[0m Will Robbinson",
          "raw": "🤖",
          "type": "text",
        },
        {
          "code": "m",
          "leftover": " DANGER[0m Will Robbinson",
          "parameters": "31",
          "type": "escape",
        },
        {
          "leftover": "[0m Will Robbinson",
          "raw": " DANGER",
          "type": "text",
        },
        {
          "code": "m",
          "leftover": " Will Robbinson",
          "parameters": "0",
          "type": "escape",
        },
        {
          "raw": " Will Robbinson",
          "type": "text",
        },
      ]
    `);
  });

  it('should work', async () => {
    const stream = Readable.from(['foo\rba']);
    const iterator = createAnsiIterator(stream);
    const array = await toArray(iterator);
    expect(array).toMatchInlineSnapshot(`
      [
        {
          "raw": "foo",
          "type": "text",
        },
        {
          "raw": "
      ",
          "type": "escape",
        },
        {
          "raw": "ba",
          "type": "text",
        },
      ]
    `);
  });
});
