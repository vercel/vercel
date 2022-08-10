import {
  parseQueryString,
  formatQueryString,
} from '../../../../src/util/dev/parse-query-string';

describe('parseQueryString', () => {
  it('should parse to Map and format back to original String', async () => {
    const querystring =
      '?a&a=&a&b=1&c=2&c=3&d=&d&d=&space%20bar=4&html=%3Ch1%3E';
    const parsed = parseQueryString(querystring);
    expect(parsed).toEqual({
      a: [undefined, '', undefined],
      b: ['1'],
      c: ['2', '3'],
      d: ['', undefined, ''],
      'space bar': ['4'],
      html: ['<h1>'],
    });
    const format = formatQueryString(parsed);
    expect(format).toEqual(querystring);
  });
  it('should work with empty string', async () => {
    const parsed = parseQueryString('');
    expect(parsed).toEqual({});
    const format = formatQueryString(parsed);
    expect(format).toEqual(undefined);
  });
  it('should work with question mark', async () => {
    const parsed = parseQueryString('?');
    expect(parsed).toEqual({});
    const format = formatQueryString(parsed);
    expect(format).toEqual(undefined);
  });
  it('should work without question mark', async () => {
    const parsed = parseQueryString('blarg');
    expect(parsed).toEqual({});
    const format = formatQueryString(parsed);
    expect(format).toEqual(undefined);
  });
  it('should work with undefined', async () => {
    const parsed = parseQueryString(undefined);
    expect(parsed).toEqual({});
    const format = formatQueryString(parsed);
    expect(format).toEqual(undefined);
  });
});
