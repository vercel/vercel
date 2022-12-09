import { CantParseJSON } from '../../../src/util/errors-ts';
import readJSON from '../../../src/util/read-json';

describe('readJSON', () => {
  it('returns (not throws) a specific Error when json parsing fails', () => {
    const json = 'not json';
    const output = readJSON<any>(json);
    expect(output).toBeInstanceOf(CantParseJSON);
  });

  it('returns undefined when json parsing falsey value', () => {
    const json = '';
    const output = readJSON<any>(json);
    expect(output).toBe(undefined);
  });

  it('returns parsed json', () => {
    const json = '{ "some-key": "some value" }';
    const output = readJSON<any>(json);
    expect(output).toStrictEqual({
      'some-key': 'some value',
    });
  });
});
