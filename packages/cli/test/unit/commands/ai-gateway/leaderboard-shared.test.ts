import { describe, expect, it } from 'vitest';
import { parseEnum } from '../../../../src/commands/ai-gateway/leaderboard-shared';
import { LEADERBOARD_METRICS } from '../../../../src/util/ai-gateway/leaderboard';

describe('ai-gateway leaderboard-shared parseEnum', () => {
  it('accepts camelCase members regardless of input casing', () => {
    expect(parseEnum('imageCount', LEADERBOARD_METRICS, 'metric')).toEqual({
      value: 'imageCount',
    });
    expect(parseEnum('imagecount', LEADERBOARD_METRICS, 'metric')).toEqual({
      value: 'imageCount',
    });
    expect(parseEnum('VIDEOCOUNT', LEADERBOARD_METRICS, 'metric')).toEqual({
      value: 'videoCount',
    });
  });

  it('accepts lowercase members case-insensitively', () => {
    expect(parseEnum('Requests', LEADERBOARD_METRICS, 'metric')).toEqual({
      value: 'requests',
    });
  });

  it('passes undefined through', () => {
    expect(parseEnum(undefined, LEADERBOARD_METRICS, 'metric')).toEqual({
      value: undefined,
    });
  });

  it('rejects unknown values with the valid list', () => {
    expect(parseEnum('bogus', LEADERBOARD_METRICS, 'metric')).toEqual({
      error: `Invalid metric: "bogus". Valid values: ${LEADERBOARD_METRICS.join(', ')}`,
    });
  });
});
