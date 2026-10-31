export const STANDARD_ENVIRONMENTS = [
  'production',
  'preview',
  'development',
] as const;

export type StandardEnvironment = (typeof STANDARD_ENVIRONMENTS)[number];
