import { getBodyParser } from '../../../src/serverless-functions/helpers';

describe('serverless-functions/helpers', () => {
  describe('getBodyParser', () => {
    it.skip('content type undefined should return the original string', () => {
      const rawBody = 'body content';
      const body = Buffer.from(rawBody);
      const result = getBodyParser(body, undefined)();
      expect(result).toBe(rawBody);
    });

    it.skip('content type "text/plain" should return the original string', () => {
      const rawBody = 'body content';
      const body = Buffer.from(rawBody);
      const result = getBodyParser(body, 'text/plain')();
      expect(result).toBe(rawBody);
    });

    it.skip('content type "application/octet-stream" should return the body buffer', () => {
      const rawBody = 'body content';
      const body = Buffer.from(rawBody);
      const result = getBodyParser(body, 'application/octet-stream')();
      expect(result).toBe(body);
    });

    it.skip('content type "application/x-www-form-urlencoded" should return the parsed query string', () => {
      const rawBody = 'foo=bar&baz=zim';
      const body = Buffer.from(rawBody);

      const result = getBodyParser(body, 'application/x-www-form-urlencoded')();
      expect(result).toEqual({
        foo: 'bar',
        baz: 'zim',
      });
    });

    it.skip('content type "application/json" should return the parsed object', () => {
      const rawBody = '{"foo": "bar", "baz": "zim"}';
      const body = Buffer.from(rawBody);
      const result = getBodyParser(body, 'application/json')();
      expect(result).toEqual({
        foo: 'bar',
        baz: 'zim',
      });
    });

    it.skip('content type "application/json" should throw when parsing bad json', () => {
      const rawBody = 'not valid json';
      const body = Buffer.from(rawBody);
      expect(() => {
        getBodyParser(body, 'application/json')();
      }).toThrow('Invalid JSON');
    });
  });
});
