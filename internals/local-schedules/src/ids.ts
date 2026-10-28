import { createHash } from 'node:crypto';
import { ulid } from 'ulid';

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateScheduleId(): string {
  return `sch_${ulid()}`;
}

export function scheduleExecutionId(
  scheduleId: string,
  scheduledAtMs: number
): string {
  const hash = createHash('sha256')
    .update(`${scheduleId}:${scheduledAtMs}`)
    .digest();
  // Interpret the first 16 bytes as an unsigned big-endian integer.
  let value = (hash.readBigUInt64BE(0) << 64n) | hash.readBigUInt64BE(8);
  let encoded = '';
  for (let i = 0; i < 26; i++) {
    encoded = CROCKFORD_BASE32[Number(value & 31n)] + encoded;
    value >>= 5n;
  }
  return `schx_${encoded}`;
}
