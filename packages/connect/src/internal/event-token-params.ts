import type { ConnectTokenParams, ConnectTokenSubject } from '../token.js';

/** Copy only credential fields; extra properties cannot become routing input. */
export function snapshotEventTokenParams(
  params: ConnectTokenParams
): ConnectTokenParams {
  if (!params || typeof params !== 'object') throw invalid();
  const subject = snapshotSubject(params.subject);
  for (const field of ['scopes', 'audience', 'resources'] as const) {
    const value = params[field];
    if (
      value !== undefined &&
      (!Array.isArray(value) || !value.every(nonEmptyString))
    ) {
      throw invalid();
    }
  }
  if (
    params.installationId !== undefined &&
    !nonEmptyString(params.installationId)
  )
    throw invalid();
  if (
    params.validityBufferMs !== undefined &&
    (!Number.isSafeInteger(params.validityBufferMs) ||
      params.validityBufferMs < 0)
  )
    throw invalid();
  if (
    params.authorizationDetails !== undefined &&
    (!Array.isArray(params.authorizationDetails) ||
      !params.authorizationDetails.every(
        detail => object(detail) && nonEmptyString(detail.type)
      ))
  )
    throw invalid();

  // Snapshot nested arrays/details before any asynchronous credential lookup.
  // Reject non-JSON values instead of silently changing credential constraints.
  return JSON.parse(
    JSON.stringify(
      {
        subject,
        installationId: params.installationId,
        scopes: params.scopes,
        audience: params.audience,
        resources: params.resources,
        authorizationDetails: params.authorizationDetails,
        validityBufferMs: params.validityBufferMs,
      },
      (_key, value: unknown) => {
        if (
          typeof value === 'function' ||
          typeof value === 'symbol' ||
          typeof value === 'bigint' ||
          (typeof value === 'number' && !Number.isFinite(value))
        )
          throw invalid();
        return value;
      }
    )
  ) as ConnectTokenParams;
}

function snapshotSubject(subject: ConnectTokenSubject): ConnectTokenSubject {
  if (!subject || typeof subject !== 'object') throw invalid();
  switch (subject.type) {
    case 'app':
      return { type: 'app' };
    case 'user':
      if (
        !nonEmptyString(subject.id) ||
        !optionalString(subject.issuer) ||
        !optionalString(subject.experimental_idp)
      )
        throw invalid();
      return {
        type: 'user',
        id: subject.id,
        issuer: subject.issuer,
        experimental_idp: subject.experimental_idp,
      };
    case 'jwt-bearer':
      if (
        !nonEmptyString(subject.sub) ||
        !optionalString(subject.iss) ||
        !optionalString(subject.aud) ||
        (subject.additionalClaims !== undefined &&
          !object(subject.additionalClaims))
      )
        throw invalid();
      return {
        type: 'jwt-bearer',
        sub: subject.sub,
        iss: subject.iss,
        aud: subject.aud,
        additionalClaims: subject.additionalClaims,
      };
    case 'token':
    case undefined:
      if (!nonEmptyString(subject.token)) throw invalid();
      return { type: subject.type, token: subject.token };
    default:
      throw invalid();
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
function optionalString(value: unknown) {
  return value === undefined || nonEmptyString(value);
}
function invalid() {
  return new TypeError('Valid resolved ConnectTokenParams are required.');
}
