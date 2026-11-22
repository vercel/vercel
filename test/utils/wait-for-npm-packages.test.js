import { describe, expect, it } from 'vitest';
import { waitForPackages } from '../../utils/wait-for-npm-packages.mjs';

describe('waitForPackages', () => {
  it('polls only pending packages until all are served', async () => {
    const seen = [];
    let round = 0;
    await waitForPackages(['a@1.0.0', 'b@1.0.0'], {
      isPublished: async spec => {
        seen.push(`${round}:${spec}`);
        return spec === 'a@1.0.0' || round > 0;
      },
      sleep: async () => {
        round += 1;
      },
      log: () => {},
    });
    expect(seen).toEqual(['0:a@1.0.0', '0:b@1.0.0', '1:b@1.0.0']);
  });

  it('times out naming the missing packages', async () => {
    let now = 0;
    await expect(
      waitForPackages(['a@1.0.0'], {
        isPublished: async () => false,
        timeoutMs: 30,
        intervalMs: 10,
        now: () => now,
        sleep: async ms => {
          now += ms;
        },
        log: () => {},
      })
    ).rejects.toThrow('Timed out waiting for npm to serve: a@1.0.0');
  });

  it('rejects an empty package list', async () => {
    await expect(waitForPackages([], { log: () => {} })).rejects.toThrow(
      'No packages to wait for.'
    );
  });
});
