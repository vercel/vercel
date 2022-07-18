import {
  parseQueryString,
  formatQueryString,
} from '../../../../src/util/dev/parse-query-string';

describe('parseQueryString', () => {
  it('should parse to Map and format back to original String', async () => {
    const querystring = '?a&b=1&c=2&c=3&d';
    const parsed = parseQueryString(querystring);
    const map = new Map<string, string[]>();
    map.set('a', []);
    map.set('b', ['1']);
    map.set('c', ['2', '3']);
    map.set('d', []);
    expect(parsed).toEqual(map);
    const format = formatQueryString(parsed);
    expect(format).toEqual(querystring);
  });
  it('should work with empty string', async () => {
    const parsed = parseQueryString('');
    expect(parsed).toEqual(new Map());
    const format = formatQueryString(parsed);
    expect(format).toEqual(undefined);
  });
  it('should work with question mark', async () => {
    const parsed = parseQueryString('?');
    expect(parsed).toEqual(new Map());
    const format = formatQueryString(parsed);
    expect(format).toEqual(undefined);
  });
  it('should work without question mark', async () => {
    const parsed = parseQueryString('blarg');
    expect(parsed).toEqual(new Map());
    const format = formatQueryString(parsed);
    expect(format).toEqual(undefined);
  });
  it('should work with undefined', async () => {
    const parsed = parseQueryString(undefined);
    expect(parsed).toEqual(new Map());
    const format = formatQueryString(parsed);
    expect(format).toEqual(undefined);
  });
});
