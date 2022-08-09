import { snakeCase } from 'snake-case';
import { upper } from '../lib/upper';

export const config = {
  runtime: 'experimental-edge',
};

export default async function edge(request, event) {
  const requestBody = await request.text();

  return new Response(
    JSON.stringify({
      headerContentType: request.headers.get('content-type'),
      url: request.url,
      method: request.method,
      body: requestBody,
      snakeCase: snakeCase('someCamelCaseThing'),
      upperCase: upper('someThing'),
      optionalChaining: request?.doesnotexist ?? 'fallback',
      ENV_VAR_IN_EDGE: process.env.ENV_VAR_IN_EDGE,
    })
  );
}
