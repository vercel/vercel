const determineTurboHitOrMiss = require('../../../utils/determine-turbo-hit-or-miss');

describe('determineTurboHitOrMiss', () => {
  it('detects HITs', async () => {
    let missCount = await determineTurboHitOrMiss('hit', __dirname);
    expect(missCount).toEqual(0);
  });

  it('detects MISSes', async () => {
    let missCount = await determineTurboHitOrMiss('miss', __dirname);
    expect(missCount).toEqual(1);
  });
});
