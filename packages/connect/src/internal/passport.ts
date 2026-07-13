import type { ConnectPassportOptions, ConnectTokenSubject } from '../token.js';

export const PASSPORT_TOKEN_HEADER_NAME = 'x-vercel-oidc-passport-token';
export const PASSPORT_RESOURCE_HEADER_NAME = 'x-vercel-passport-resource';

export function passportAuthorizationHeaders(
  subject: ConnectTokenSubject,
  options?: Partial<ConnectPassportOptions>
): Record<string, string> {
  if (subject.type !== 'passport') {
    return {};
  }

  if (!options?.passportToken?.trim()) {
    throw new Error(
      'passportToken is required when subject.type is "passport"'
    );
  }

  const headers = { [PASSPORT_TOKEN_HEADER_NAME]: options.passportToken };
  if (!options.passportResource) {
    return headers;
  }
  return {
    ...headers,
    [PASSPORT_RESOURCE_HEADER_NAME]: options.passportResource,
  };
}

export function isPassportSubject(subject: ConnectTokenSubject): boolean {
  return subject.type === 'passport';
}
