import { describe, expect, it } from 'vitest';
import {
  imagePath,
  repositoriesPath,
  repositoryImagesPath,
  repositoryPath,
  repositoryTagPath,
  repositoryTagsPath,
} from '../../../../../src/commands/vcr/utils/paths';
import type { VcrScope } from '../../../../../src/commands/vcr/utils/resolve-vcr-scope';

const scope: VcrScope = {
  teamId: 'team_dummy',
  teamSlug: 'my-team',
  projectId: 'prj_vcr',
  projectName: 'vcr-project',
};

describe('repositoriesPath', () => {
  it('builds the base path with team and project ids', () => {
    expect(repositoriesPath(scope)).toBe(
      '/v1/vcr/repository?teamId=team_dummy&projectId=prj_vcr'
    );
  });

  it('includes limit and cursor when provided', () => {
    expect(repositoriesPath(scope, { limit: 10, cursor: 'abc' })).toBe(
      '/v1/vcr/repository?teamId=team_dummy&projectId=prj_vcr&limit=10&cursor=abc'
    );
  });
});

describe('repositoryPath', () => {
  it('builds a path scoped to a single repository', () => {
    expect(repositoryPath(scope, 'my-app')).toBe(
      '/v1/vcr/repository/my-app?teamId=team_dummy&projectId=prj_vcr'
    );
  });

  it('url-encodes the repository name', () => {
    expect(repositoryPath(scope, 'my app')).toBe(
      '/v1/vcr/repository/my%20app?teamId=team_dummy&projectId=prj_vcr'
    );
  });
});

describe('repositoryImagesPath', () => {
  it('builds the images path for a repository', () => {
    expect(repositoryImagesPath(scope, 'my-app')).toBe(
      '/v1/vcr/repository/my-app/images?teamId=team_dummy&projectId=prj_vcr'
    );
  });

  it('includes untagged only when true', () => {
    expect(repositoryImagesPath(scope, 'my-app', { untagged: true })).toBe(
      '/v1/vcr/repository/my-app/images?teamId=team_dummy&projectId=prj_vcr&untagged=true'
    );
    expect(repositoryImagesPath(scope, 'my-app', { untagged: false })).toBe(
      '/v1/vcr/repository/my-app/images?teamId=team_dummy&projectId=prj_vcr'
    );
  });

  it('includes limit and cursor when provided', () => {
    expect(
      repositoryImagesPath(scope, 'my-app', { limit: 5, cursor: 'xyz' })
    ).toBe(
      '/v1/vcr/repository/my-app/images?teamId=team_dummy&projectId=prj_vcr&limit=5&cursor=xyz'
    );
  });
});

describe('imagePath', () => {
  it('builds a path scoped to a single image', () => {
    expect(imagePath(scope, 'my-app', 'img_1')).toBe(
      '/v1/vcr/repository/my-app/images/img_1?teamId=team_dummy&projectId=prj_vcr'
    );
  });
});

describe('repositoryTagsPath', () => {
  it('builds the tags path for a repository', () => {
    expect(repositoryTagsPath(scope, 'my-app')).toBe(
      '/v1/vcr/repository/my-app/tags?teamId=team_dummy&projectId=prj_vcr'
    );
  });

  it('includes sortBy and sortOrder when provided', () => {
    expect(
      repositoryTagsPath(scope, 'my-app', {
        sortBy: 'size',
        sortOrder: 'desc',
      })
    ).toBe(
      '/v1/vcr/repository/my-app/tags?teamId=team_dummy&projectId=prj_vcr&sortBy=size&sortOrder=desc'
    );
  });
});

describe('repositoryTagPath', () => {
  it('builds a path scoped to a single tag', () => {
    expect(repositoryTagPath(scope, 'my-app', 'latest')).toBe(
      '/v1/vcr/repository/my-app/tags/latest?teamId=team_dummy&projectId=prj_vcr'
    );
  });

  it('url-encodes the repository name and tag', () => {
    expect(repositoryTagPath(scope, 'my app', 'v1.0/beta')).toBe(
      '/v1/vcr/repository/my%20app/tags/v1.0%2Fbeta?teamId=team_dummy&projectId=prj_vcr'
    );
  });
});
