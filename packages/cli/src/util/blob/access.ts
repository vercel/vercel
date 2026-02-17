const VALID_ACCESS_VALUES = ['public', 'private'] as const;

type BlobAccess = (typeof VALID_ACCESS_VALUES)[number];

export function isAccess(value: string): value is BlobAccess {
  return (VALID_ACCESS_VALUES as readonly string[]).includes(value);
}
