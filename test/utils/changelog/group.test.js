const groupLog = require('../../../utils/changelog/group');

describe('changelog', () => {
  describe('group', () => {
    const commits = [
      {
        areas: ['cli'],
        hash: '073f353fcf1944633bb43119c8ffcff46eea0480',
        message:
          'This reverts commit 17fd88e044a807adf4ee6ed662cdb7c7556e912d.',
        revertsHashes: ['17fd88e044a807adf4ee6ed662cdb7c7556e912d'],
        subject:
          '[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]',
      },
      {
        areas: ['frameworks', 'cli'],
        hash: '17fd88e044a807adf4ee6ed662cdb7c7556e912d',
        message: 'does some work',
        revertsHashes: [],
        subject: '[frameworks][cli] Disable blank issues again [Leo Lamprecht]',
      },
      {
        areas: ['UNCATEGORIZED'],
        hash: 'a1787c740de0d9004e11f7666b6014f820d3c523',
        message: 'does some work',
        revertsHashes: [],
        subject:
          'Revert "[cli] Switch from hardlinks to symlinks in vc build" (#7054) [Andy]',
      },
    ];

    it('should group commits by area', async () => {
      let groupedLogLines = groupLog(commits);

      expect(groupedLogLines).toEqual({
        UNCATEGORIZED: [
          'Revert "[cli] Switch from hardlinks to symlinks in vc build" (#7054) [Andy]',
        ],
        frameworks: [
          '[frameworks][cli] Disable blank issues again [Leo Lamprecht]',
        ],
        cli: [
          '[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]',
          '[frameworks][cli] Disable blank issues again [Leo Lamprecht]',
        ],
      });
    });
  });
});
