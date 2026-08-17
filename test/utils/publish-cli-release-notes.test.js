import { parseReleaseNotes } from '../../utils/publish-cli-release-notes.mjs';

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
