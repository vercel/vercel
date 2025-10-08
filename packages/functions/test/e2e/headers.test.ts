import { expect, test } from 'vitest';

import {
  CITY_HEADER_NAME,
  COUNTRY_HEADER_NAME,
  geolocation,
  ipAddress,
  IP_HEADER_NAME,
  LATITUDE_HEADER_NAME,
  LONGITUDE_HEADER_NAME,
  REGION_HEADER_NAME,
  REQUEST_ID_HEADER_NAME,
  POSTAL_CODE_HEADER_NAME,
} from '../../src/headers';

const URL = 'https://vercel-functions-e2e.vercel.app/api';

test.each(['lambda', 'edge'])(
  'headers are present in a %s request',
  async runtime => {
    const url = `${URL}/${runtime}`;
    const response = await fetch(url);
    const { headers } = await response.json();

    expect(headers[IP_HEADER_NAME]).toBeDefined();
    expect(headers[REQUEST_ID_HEADER_NAME]).toBeDefined();
    expect(headers[CITY_HEADER_NAME]).toBeDefined();
    expect(headers[REGION_HEADER_NAME]).toBeDefined();
    expect(headers[COUNTRY_HEADER_NAME]).toBeDefined();
    expect(headers[LATITUDE_HEADER_NAME]).toBeDefined();
    expect(headers[LONGITUDE_HEADER_NAME]).toBeDefined();
    expect(headers[POSTAL_CODE_HEADER_NAME]).toBeDefined();
  }
);

test.each(['lambda', 'edge'])(
  'get `ipAddress` from a %s request',
  async runtime => {
    const url = `${URL}/${runtime}`;
    const response = await fetch(url);
    const { headers } = await response.json();
    const request = new Request(url, { headers });
    const ip = ipAddress(request);
    expect(ip).toBeDefined();
  }
);

test.each(['lambda', 'edge'])(
  'get `geolocation` from a %s request',
  async runtime => {
    const url = `${URL}/${runtime}`;
    const response = await fetch(url);
    const { headers } = await response.json();
    const request = new Request(url, { headers });
    const payload = geolocation(request);
    expect(payload).toBeDefined();

    expect(payload.city).toBeDefined();
    expect(payload.country).toBeDefined();
    expect(payload.flag).toBeDefined();
    expect(payload.countryRegion).toBeDefined();
    expect(payload.region).toBeDefined();
    expect(payload.latitude).toBeDefined();
    expect(payload.longitude).toBeDefined();
  }
);
