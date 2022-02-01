const groupLog = require('../../../utils/changelog/group');

describe('changelog', () => {
  describe('group', () => {
    const logLines = [
      '[api] Fix `GET /api/examples/list` output (#6574) [Nathan Rajlich]',
      '[client][frameworks][api] Update `readdir()` call with `withFileTypes` (#6554) [Steven]',
      '[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]',
      'Disable blank issues again [Leo Lamprecht]',
    ];

    it('should group commits by area', async () => {
      let groupedLogLines = groupLog(logLines);

      expect(groupedLogLines).toEqual({
        UNCATEGORIZED: ['Disable blank issues again [Leo Lamprecht]'],
        api: [
          '[api] Fix `GET /api/examples/list` output (#6574) [Nathan Rajlich]',
          '[client][frameworks][api] Update `readdir()` call with `withFileTypes` (#6554) [Steven]',
        ],
        client: [
          '[client][frameworks][api] Update `readdir()` call with `withFileTypes` (#6554) [Steven]',
        ],
        frameworks: [
          '[client][frameworks][api] Update `readdir()` call with `withFileTypes` (#6554) [Steven]',
        ],
        cli: ['[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]'],
      });
    });
  });
});
