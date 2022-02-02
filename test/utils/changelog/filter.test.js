const filterLog = require('../../../utils/changelog/filter');

describe('changelog', () => {
  describe('filter', () => {
    it('should remove "Publish" commits', async () => {
      const commits = [
        {
          areas: ['cli'],
          hash: '073f353fcf1944633bb43119c8ffcff46eea0480',
          message: 'does some work',
          revertsHashes: [],
          subject:
            '[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]',
        },
        {
          areas: ['UNCATEGORIZED'],
          hash: 'a1787c740de0d9004e11f7666b6014f820d3c523',
          message: 'does some work',
          revertsHashes: [],
          subject: 'Publish Stable [Nathan Rajlich]',
        },
      ];

      let filteredCommits = filterLog(commits);
      expect(filteredCommits).toEqual([
        {
          areas: ['cli'],
          hash: '073f353fcf1944633bb43119c8ffcff46eea0480',
          message: 'does some work',
          revertsHashes: [],
          subject:
            '[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]',
        },
      ]);
    });

    it('should remove "Revert" and the revertted commits', async () => {
      const commits = [
        {
          areas: ['cli'],
          hash: '073f353fcf1944633bb43119c8ffcff46eea0480',
          message:
            'This reverts commit 17fd88e044a807adf4ee6ed662cdb7c7556e912d.',
          revertsHashes: ['17fd88e044a807adf4ee6ed662cdb7c7556e912d'],
          subject:
            'Revert "[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]"',
        },
        {
          areas: ['frameworks', 'cli'],
          hash: '17fd88e044a807adf4ee6ed662cdb7c7556e912d',
          message: 'does some work',
          revertsHashes: [],
          subject:
            '[frameworks][cli] Disable blank issues again [Leo Lamprecht]',
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

      let filteredCommits = filterLog(commits);
      expect(filteredCommits).toEqual([
        {
          areas: ['UNCATEGORIZED'],
          hash: 'a1787c740de0d9004e11f7666b6014f820d3c523',
          message: 'does some work',
          revertsHashes: [],
          subject:
            'Revert "[cli] Switch from hardlinks to symlinks in vc build" (#7054) [Andy]',
        },
      ]);
    });

    it('should NOT remove "Revert" if the reverted commit is not in the current changelog entry', async () => {
      const commits = [
        {
          areas: ['cli'],
          hash: '073f353fcf1944633bb43119c8ffcff46eea0480',
          message:
            'This reverts commit 17fd88e044a807adf4ee6ed662cdb7c7556e912d.',
          revertsHashes: ['17fd88e044a807adf4ee6ed662cdb7c7556e912d'],
          subject:
            'Revert "[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]"',
        },
        {
          areas: ['frameworks', 'cli'],
          hash: '29a44db8d9377d7f16146817aded57ebfbcff752',
          message: 'does some work',
          revertsHashes: [],
          subject:
            '[frameworks][cli] Disable blank issues again [Leo Lamprecht]',
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

      let filteredCommits = filterLog(commits);
      expect(filteredCommits).toEqual([
        {
          areas: ['cli'],
          hash: '073f353fcf1944633bb43119c8ffcff46eea0480',
          message:
            'This reverts commit 17fd88e044a807adf4ee6ed662cdb7c7556e912d.',
          revertsHashes: ['17fd88e044a807adf4ee6ed662cdb7c7556e912d'],
          subject:
            'Revert "[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich]"',
        },
        {
          areas: ['frameworks', 'cli'],
          hash: '29a44db8d9377d7f16146817aded57ebfbcff752',
          message: 'does some work',
          revertsHashes: [],
          subject:
            '[frameworks][cli] Disable blank issues again [Leo Lamprecht]',
        },
        {
          areas: ['UNCATEGORIZED'],
          hash: 'a1787c740de0d9004e11f7666b6014f820d3c523',
          message: 'does some work',
          revertsHashes: [],
          subject:
            'Revert "[cli] Switch from hardlinks to symlinks in vc build" (#7054) [Andy]',
        },
      ]);
    });
  });
});
