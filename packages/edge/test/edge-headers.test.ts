/**
 * @jest-environment @edge-runtime/jest-environment
 */

import {
  CITY_HEADER_NAME,
  COUNTRY_HEADER_NAME,
  Geo,
  geolocation,
  ipAddress,
  IP_HEADER_NAME,
  LATITUDE_HEADER_NAME,
  LONGITUDE_HEADER_NAME,
  REGION_HEADER_NAME,
} from '../src';

test('`ipAddress` returns the value from the header', () => {
  const req = new Request('https://example.vercel.sh', {
    headers: {
      [IP_HEADER_NAME]: '127.0.0.1',
    },
  });
  expect(ipAddress(req)).toBe('127.0.0.1');
});

describe('`geolocation`', () => {
  test('returns an empty object if headers are not found', () => {
    const req = new Request('https://example.vercel.sh');
    expect(geolocation(req)).toEqual({});
  });

  test('reads values from headers', () => {
    const req = new Request('https://example.vercel.sh', {
      headers: {
        [CITY_HEADER_NAME]: 'Tel Aviv',
        [COUNTRY_HEADER_NAME]: 'Israel',
        [LATITUDE_HEADER_NAME]: '32.109333',
        [LONGITUDE_HEADER_NAME]: '34.855499',
        [REGION_HEADER_NAME]: 'fra1',
      },
    });
    expect(geolocation(req)).toEqual<Geo>({
      city: 'Tel Aviv',
      country: 'Israel',
      latitude: '32.109333',
      longitude: '34.855499',
      region: 'fra1',
    });
  });
});
