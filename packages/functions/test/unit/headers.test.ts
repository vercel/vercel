import { expect, test, describe } from 'vitest';

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
  REQUEST_ID_HEADER_NAME,
} from '../../src/headers';

test('`ipAddress` returns the value from the header', () => {
  const req = new Request('https://example.vercel.sh', {
    headers: {
      [IP_HEADER_NAME]: '127.0.0.1',
    },
  });
  expect(ipAddress(req)).toBe('127.0.0.1');
});

describe('`geolocation`', () => {
  test('returns an object with lots of undefined if headers are not found', () => {
    const req = new Request('https://example.vercel.sh');
    expect(geolocation(req)).toEqual({
      city: undefined,
      flag: undefined,
      country: undefined,
      countryRegion: undefined,
      latitude: undefined,
      longitude: undefined,
      region: 'dev1',
    });
  });

  test('reads values from headers', () => {
    const req = new Request('https://example.vercel.sh', {
      headers: {
        [CITY_HEADER_NAME]: 'Tel Aviv',
        [COUNTRY_HEADER_NAME]: 'IL',
        [LATITUDE_HEADER_NAME]: '32.109333',
        [LONGITUDE_HEADER_NAME]: '34.855499',
        [REGION_HEADER_NAME]: 'TA', // https://en.wikipedia.org/wiki/ISO_3166-2:IL
        [REQUEST_ID_HEADER_NAME]: 'fra1::kpwjx-123455678-c0ffee',
      },
    });
    expect(geolocation(req)).toEqual<Geo>({
      city: 'Tel Aviv',
      flag: '🇮🇱',
      country: 'IL',
      latitude: '32.109333',
      longitude: '34.855499',
      region: 'fra1',
      countryRegion: 'TA',
    });
  });

  test('reads values from headers (with a request ID containing two edge regions)', () => {
    const req = new Request('https://example.vercel.sh', {
      headers: {
        [CITY_HEADER_NAME]: 'Tokyo',
        [COUNTRY_HEADER_NAME]: 'JP',
        [LATITUDE_HEADER_NAME]: '37.1233',
        [LONGITUDE_HEADER_NAME]: '30.733399',
        [REGION_HEADER_NAME]: '13',
        [REQUEST_ID_HEADER_NAME]: 'hnd1:iad1::kpwjx-123455678-c0ffee',
      },
    });
    expect(geolocation(req)).toEqual<Geo>({
      city: 'Tokyo',
      flag: '🇯🇵',
      country: 'JP',
      latitude: '37.1233',
      longitude: '30.733399',
      region: 'hnd1',
      countryRegion: '13',
    });
  });

  test('reads values from headers (without a request ID)', () => {
    const req = new Request('https://example.vercel.sh', {
      headers: {
        [CITY_HEADER_NAME]: 'Tokyo',
        [COUNTRY_HEADER_NAME]: 'JP',
        [LATITUDE_HEADER_NAME]: '37.1233',
        [LONGITUDE_HEADER_NAME]: '30.733399',
        [REGION_HEADER_NAME]: '13',
      },
    });
    expect(geolocation(req)).toEqual<Geo>({
      city: 'Tokyo',
      flag: '🇯🇵',
      country: 'JP',
      latitude: '37.1233',
      longitude: '30.733399',
      region: 'dev1',
      countryRegion: '13',
    });
  });

  test('returns undefined if countryCode is invalid', () => {
    const req = new Request('https://example.vercel.sh', {
      headers: {
        [CITY_HEADER_NAME]: 'Tokyo',
        [COUNTRY_HEADER_NAME]: 'AAA',
        [LATITUDE_HEADER_NAME]: '37.1233',
        [LONGITUDE_HEADER_NAME]: '30.733399',
        [REGION_HEADER_NAME]: '13',
      },
    });
    expect(geolocation(req)).toEqual<Geo>({
      city: 'Tokyo',
      flag: undefined,
      country: 'AAA',
      latitude: '37.1233',
      longitude: '30.733399',
      region: 'dev1',
      countryRegion: '13',
    });
  });

  test('reads values from headers (city with multi-byte chars)', () => {
    const req = new Request('https://example.vercel.sh', {
      headers: {
        // São Paulo
        [CITY_HEADER_NAME]: 'S%C3%A3o%20Paulo',
        [COUNTRY_HEADER_NAME]: 'BR',
        [LATITUDE_HEADER_NAME]: '-23.6283',
        [LONGITUDE_HEADER_NAME]: '-46.6409',
        [REGION_HEADER_NAME]: 'SP',
        [REQUEST_ID_HEADER_NAME]: 'gru1::kpwjx-123455678-c0ffee',
      },
    });
    expect(geolocation(req)).toEqual<Geo>({
      city: 'São Paulo',
      flag: '🇧🇷',
      country: 'BR',
      latitude: '-23.6283',
      longitude: '-46.6409',
      region: 'gru1',
      countryRegion: 'SP',
    });
  });
});
