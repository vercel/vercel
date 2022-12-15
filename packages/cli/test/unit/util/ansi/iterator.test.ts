import { Readable } from 'stream';
import { createAnsiIterator } from '../../../../src/util/ansi/iterator';

async function toArray<T>(it: AsyncIterable<T>): Promise<T[]> {
  const arr: T[] = [];
  for await (const next of it) arr.push(next);
  return arr;
}

describe('createAnsiIterator()', () => {
  it('should work', async () => {
    const stream = Readable.from([
      '🤖\u001B[31m DANGER\u001B[0m Will Robbinson',
    ]);
    const iterator = createAnsiIterator(stream);
    const array = await toArray(iterator);
    //console.log(array);
    expect(array).toMatchInlineSnapshot(`
      [
        {
          "raw": "🤖",
          "type": "text",
        },
        {
          "raw": "[31m",
          "type": "escape",
        },
        {
          "raw": " DANGER",
          "type": "text",
        },
        {
          "raw": "[0m",
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
