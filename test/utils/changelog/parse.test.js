const childProcess = require('child_process');

const parseCommits = require('../../../utils/changelog/parse');

jest.mock('child_process');

describe('changelog', () => {
  describe('parse', () => {
    const logLines = [
      '[cli] Add "outDir" to `tsconfig.json` (#6566) [Nathan Rajlich] &&& 073f353fcf1944633bb43119c8ffcff46eea0480',
      '[frameworks][cli] Disable blank issues again [Leo Lamprecht] &&& 17fd88e044a807adf4ee6ed662cdb7c7556e912d',
      'Revert "[cli] Switch from hardlinks to symlinks in vc build" (#7054) [Andy] &&& a1787c740de0d9004e11f7666b6014f820d3c523',
    ];

    it('should group commits by area', async () => {
      childProcess.execSync.mockReturnValue(`does some work`);
      childProcess.execSync.mockReturnValueOnce(
        `This reverts commit 17fd88e044a807adf4ee6ed662cdb7c7556e912d.`
      );

      let commits = parseCommits(logLines);
      expect(commits).toEqual([
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
