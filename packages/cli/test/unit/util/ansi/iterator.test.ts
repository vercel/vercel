import { Readable } from 'stream';
import { createAnsiIterator } from '../../../../src/util/ansi/iterator';

async function toArray<T>(it: AsyncIterable<T>): Promise<T[]> {
  const arr: T[] = [];
  for await (const next of it) arr.push(next);
  return arr;
}

describe('createAnsiIterator()', () => {
  it('should parse single-byte control codes', async () => {
    const stream = Readable.from(['foo\rba']);
    const iterator = createAnsiIterator(stream);
    const array = await toArray(iterator);
    expect(array).toMatchInlineSnapshot(`
      [
        {
          "leftover": "
      ba",
          "raw": "foo",
          "type": "text",
        },
        {
          "leftover": "ba",
          "raw": "
      ",
          "type": "control",
        },
        {
          "leftover": "",
          "raw": "ba",
          "type": "text",
        },
      ]
    `);
  });

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
          "leftover": "",
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
      '\u001B[30;47m', // black letters, white background
      '\u001B[1;31m', // bold, red foreground
      '\u001B',
      '[',
      '3',
      '8;5',
      ';170mhi', // 256 color index 170
      '\u001B[38;2;50;150;200m', // RBG color r=50, b=150, g=200
      '\u001B[0m', // reset all styles
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
          "abbr": "SGR",
          "code": "m",
          "leftover": " DANGER[0m Will Robbinson",
          "parameters": "31",
          "raw": "[31m",
          "style": {
            "foregroundColor": 1,
          },
          "type": "escape",
        },
        {
          "leftover": "[0m Will Robbinson",
          "raw": " DANGER",
          "type": "text",
        },
        {
          "abbr": "SGR",
          "code": "m",
          "leftover": " Will Robbinson",
          "parameters": "0",
          "raw": "[0m",
          "style": {
            "backgroundColor": false,
            "bold": false,
            "dim": false,
            "foregroundColor": false,
            "italic": false,
            "underline": false,
          },
          "type": "escape",
        },
        {
          "leftover": "",
          "raw": " Will Robbinson",
          "type": "text",
        },
        {
          "abbr": "SGR",
          "code": "m",
          "leftover": "",
          "parameters": "30;47",
          "raw": "[30;47m",
          "style": {
            "backgroundColor": 7,
            "foregroundColor": 0,
          },
          "type": "escape",
        },
        {
          "abbr": "SGR",
          "code": "m",
          "leftover": "",
          "parameters": "1;31",
          "raw": "[1;31m",
          "style": {
            "bold": true,
            "foregroundColor": 1,
          },
          "type": "escape",
        },
        {
          "abbr": "SGR",
          "code": "m",
          "leftover": "hi",
          "parameters": "38;5;170",
          "raw": "[38;5;170m",
          "style": {
            "foregroundColor": 170,
          },
          "type": "escape",
        },
        {
          "leftover": "",
          "raw": "hi",
          "type": "text",
        },
        {
          "abbr": "SGR",
          "code": "m",
          "leftover": "",
          "parameters": "38;2;50;150;200",
          "raw": "[38;2;50;150;200m",
          "style": {
            "foregroundColor": {
              "b": 200,
              "g": 150,
              "r": 50,
            },
          },
          "type": "escape",
        },
        {
          "abbr": "SGR",
          "code": "m",
          "leftover": "",
          "parameters": "0",
          "raw": "[0m",
          "style": {
            "backgroundColor": false,
            "bold": false,
            "dim": false,
            "foregroundColor": false,
            "italic": false,
            "underline": false,
          },
          "type": "escape",
        },
      ]
    `);
  });

  it('should parse window title', async () => {
    const stream = Readable.from([
      '\u001b]0;This is the window title ending with ST\u001b\\some text',
      '\u001b]0;This is the window title ending with BEL\u0007',
    ]);
    const iterator = createAnsiIterator(stream);
    const array = await toArray(iterator);
    console.log(array);
  });

  it('should parse hyperlinks', async () => {
    const stream = Readable.from([
      '\u001b]8;;http://example.com\u001b\\This is a link\u001b]8;;\u001b\\\n',
    ]);
    const iterator = createAnsiIterator(stream);
    const array = await toArray(iterator);
    console.log(array);
  });
});
