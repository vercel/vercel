import { describe, expect, it } from 'vitest';
import replaceDevCommandPort from '../../../../src/util/dev/replace-dev-command-port';

describe('replaceDevCommandPort', () => {
  it.each([
    ['next dev --port $PORT', 'next dev --port 4321'],
    ['next dev --port %PORT%', 'next dev --port 4321'],
    ['$PORT proxy %PORT%', '4321 proxy 4321'],
  ])('normalizes %s', (command, expected) => {
    expect(replaceDevCommandPort(command, 4321)).toBe(expected);
  });
});
