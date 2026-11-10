import { describe, expect, it } from 'vitest';
import {
  buildRepositoryReference,
  parseNameArg,
  validateImageParts,
} from '../../../../../src/commands/vcr/utils/image-ref';

describe('parseNameArg', () => {
  it('defaults the repository and leaves the tag unset when no name is given', () => {
    expect(parseNameArg(undefined, 'my-project')).toEqual({
      repository: 'my-project',
      tag: undefined,
    });
  });

  it('uses the bare name as the repository', () => {
    expect(parseNameArg('my-api', 'my-project')).toEqual({
      repository: 'my-api',
      tag: undefined,
    });
  });

  it('splits on the last colon into repository and tag', () => {
    expect(parseNameArg('my-api:1.2.3', 'my-project')).toEqual({
      repository: 'my-api',
      tag: '1.2.3',
    });
  });

  it('rejects a name containing a slash', () => {
    const result = parseNameArg('team/my-api', 'my-project');
    expect(result).toHaveProperty('error');
  });

  it('rejects a name that is only a tag', () => {
    const result = parseNameArg(':latest', 'my-project');
    expect(result).toHaveProperty('error');
  });
});

describe('validateImageParts', () => {
  it('accepts a valid repository and tag', () => {
    expect(
      validateImageParts({ repository: 'my-api', tag: '1.2.3' })
    ).toBeUndefined();
  });

  it('accepts a repository with allowed separators', () => {
    expect(
      validateImageParts({ repository: 'my_api.v2-beta', tag: undefined })
    ).toBeUndefined();
  });

  it('rejects an uppercase repository', () => {
    expect(
      validateImageParts({ repository: 'MyApi', tag: undefined })
    ).toContain('Invalid repository');
  });

  it('rejects a repository with an invalid character', () => {
    expect(
      validateImageParts({ repository: 'my/api', tag: undefined })
    ).toContain('Invalid repository');
  });

  it('rejects a tag with an invalid character', () => {
    expect(
      validateImageParts({ repository: 'my-api', tag: 'bad tag' })
    ).toContain('Invalid tag');
  });

  it('rejects a tag longer than 128 characters', () => {
    expect(
      validateImageParts({ repository: 'my-api', tag: 'a'.repeat(129) })
    ).toContain('Invalid tag');
  });

  it('accepts a tag exactly 128 characters', () => {
    expect(
      validateImageParts({ repository: 'my-api', tag: 'a'.repeat(128) })
    ).toBeUndefined();
  });
});

describe('buildRepositoryReference', () => {
  it('joins the registry, team, project, and repository', () => {
    expect(
      buildRepositoryReference({
        registry: 'vcr.vercel.com',
        teamSlug: 'my-team',
        projectName: 'my-project',
        repository: 'my-api',
      })
    ).toBe('vcr.vercel.com/my-team/my-project/my-api');
  });
});
