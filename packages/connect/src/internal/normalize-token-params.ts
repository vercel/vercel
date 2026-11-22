import type { ConnectTokenParams, ConnectTokenSubject } from '../token.js';

export function normalizeTokenSubject(
  subject: ConnectTokenSubject
): ConnectTokenSubject {
  if (
    (subject.type === undefined || subject.type === 'token') &&
    typeof subject.token === 'string'
  ) {
    return { type: 'token', token: subject.token };
  }
  return subject;
}

export function normalizeTokenParams(
  params: ConnectTokenParams
): ConnectTokenParams {
  return {
    ...params,
    subject: normalizeTokenSubject(params.subject),
    scopes: params.scopes === undefined ? ['*'] : params.scopes,
  };
}
