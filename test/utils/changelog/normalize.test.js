const filterLog = require('../../../utils/changelog/normalize');

describe('changelog', () => {
  describe('normalize', () => {
    it('should remove "Publish" commits', async () => {
      const logLines = [
        '[api] Fix `GET /api/examples/list` output (#6574) [Nathan Rajlich]',
        '[client][frameworks][api] Update `readdir()` call with `withFileTypes` (#6554) [Steven]',
        'Publish Stable [Nathan Rajlich]',
        'Publish Canary [Nathan Rajlich]',
        '[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]',
      ];

      let filteredLogLines = filterLog(logLines);
      expect(filteredLogLines).toEqual([
        '[api] Fix `GET /api/examples/list` output (#6574) [Nathan Rajlich]',
        '[client][frameworks][api] Update `readdir()` call with `withFileTypes` (#6554) [Steven]',
        '[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]',
      ]);
    });

    it('should trim lines', async () => {
      const logLines = [
        '[client][frameworks][api] Update `readdir()` call with `withFileTypes` (#6554) [Steven]',
        ' [cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]',
      ];

      let filteredLogLines = filterLog(logLines);
      expect(filteredLogLines).toEqual([
        '[client][frameworks][api] Update `readdir()` call with `withFileTypes` (#6554) [Steven]',
        '[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]',
      ]);
    });
  });
});
