export const PROJECT_ENV_TARGET = {
  Production: 'production',
  Preview: 'preview',
  Development: 'development'
} as const;

export const PROJECT_ENV_TYPE = {
  Plaintext: 'plain',
  Secret: 'secret',
  Encrypted: 'encrypted',
  System: 'system'
} as const;
