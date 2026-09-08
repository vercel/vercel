import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseReleaseNotes,
  readPublishIntegrity,
  PUBLISH_INTEGRITY_ENV,
} from '../../utils/publish-cli-release-notes.mjs';

const changelog = `# vercel

## 2.0.0

### Major Changes

- abcdef1: Remove the legacy command.

### Minor Changes

- abcdef2: Add the new command.
  This includes additional behavior.

### Patch Changes

- abcdef3: Fix the existing command.
- Updated dependencies [abcdef4]
  - @vercel/example@1.0.0

## 1.0.0

### Patch Changes

- abcdef5: Previous release.
`;

describe('parseReleaseNotes', () => {
  it('groups direct changes and excludes dependency updates', () => {
    expect(parseReleaseNotes(changelog, '2.0.0')).toEqual({
      major: [
        {
          commit: 'abcdef1',
          description: 'Remove the legacy command.',
        },
      ],
      minor: [
        {
          commit: 'abcdef2',
          description:
            'Add the new command. This includes additional behavior.',
        },
      ],
      patch: [
        {
          commit: 'abcdef3',
          description: 'Fix the existing command.',
        },
      ],
    });
  });

  it('throws when the release is missing from the changelog', () => {
    expect(() => parseReleaseNotes(changelog, '3.0.0')).toThrow(
      'Could not find vercel@3.0.0 in the CLI changelog'
    );
  });
});

describe('readPublishIntegrity', () => {
  const sample =
    'sha512-txB2MtU8QLYFDT6eCDn26nCPik5COyrusuLktqLnU5fDWM/VWTrjrxM8pa5vavfYOLqA6A8+JScRuw3eNXY5gw==';

  it('prefers the integrity env var from the publish step', async () => {
    await expect(
      readPublishIntegrity({
        env: { [PUBLISH_INTEGRITY_ENV]: sample },
        filePath: join(tmpdir(), 'missing-integrity-file'),
      })
    ).resolves.toBe(sample);
  });

  it('falls back to the integrity file written by npm-publish.sh', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cli-integrity-'));
    const filePath = join(dir, '.vercel-cli-publish-integrity');
    await writeFile(filePath, `${sample}\n`);

    try {
      await expect(
        readPublishIntegrity({
          env: {},
          filePath,
        })
      ).resolves.toBe(sample);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('throws when neither env nor file is present', async () => {
    await expect(
      readPublishIntegrity({
        env: {},
        filePath: join(tmpdir(), 'definitely-missing-integrity'),
      })
    ).rejects.toThrow('Missing vercel publish integrity');
  });
});
