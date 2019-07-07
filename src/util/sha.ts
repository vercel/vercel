import { createHash } from 'crypto';

export function getSha(buffer: Buffer, cypher: string = 'sha256'): string {
  const hash = createHash(cypher);
  hash.update(buffer);
  return hash.digest('hex');
}
