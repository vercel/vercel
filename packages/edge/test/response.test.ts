/**
 * @jest-environment @edge-runtime/jest-environment
 */

import { json } from '../src/response';

describe('json', () => {
  it.skip('returns a response with JSON content', async () => {
    const content = { foo: 'bar' };
    const response = json(content);
    expect(response.headers.get('content-type')).toEqual('application/json');
    expect(await response.json()).toEqual(content);
  });

  it.skip('can set response init', async () => {
    const content = { bar: 'baz' };
    const status = 201;
    const statusText = 'it is in';
    const customHeader = 'x-custom';
    const customHeaderValue = '1';
    const response = json(content, {
      status,
      statusText,
      headers: { [customHeader]: customHeaderValue },
    });
    expect(response).toMatchObject({
      status,
      statusText,
    });
    expect(response.headers.get('content-type')).toEqual('application/json');
    expect(response.headers.get(customHeader)).toEqual(customHeaderValue);
    expect(await response.json()).toEqual(content);
  });
});
