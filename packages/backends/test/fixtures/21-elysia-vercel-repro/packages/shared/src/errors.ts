export const AuthErrors = {
  INVALID_TOKEN: 'INVALID_TOKEN',
  MISSING_TOKEN: 'MISSING_TOKEN',
} as const;

export const CommonErrors = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type AuthError = (typeof AuthErrors)[keyof typeof AuthErrors];
export type CommonError = (typeof CommonErrors)[keyof typeof CommonErrors];
