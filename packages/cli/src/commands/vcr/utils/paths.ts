import type { VcrScope } from './resolve-vcr-scope';

function baseQuery(scope: VcrScope): URLSearchParams {
  return new URLSearchParams({
    teamId: scope.teamId,
    projectId: scope.projectId,
  });
}

export function repositoriesPath(
  scope: VcrScope,
  opts: { limit?: number; cursor?: string } = {}
): string {
  const query = baseQuery(scope);
  if (opts.limit !== undefined) {
    query.set('limit', String(opts.limit));
  }
  if (opts.cursor) {
    query.set('cursor', opts.cursor);
  }
  return `/v1/vcr/repository?${query.toString()}`;
}

export function repositoryPath(scope: VcrScope, idOrName: string): string {
  return `/v1/vcr/repository/${encodeURIComponent(idOrName)}?${baseQuery(scope).toString()}`;
}

export function repositoryImagesPath(
  scope: VcrScope,
  idOrName: string,
  opts: { limit?: number; cursor?: string; untagged?: boolean } = {}
): string {
  const query = baseQuery(scope);
  if (opts.limit !== undefined) {
    query.set('limit', String(opts.limit));
  }
  if (opts.cursor) {
    query.set('cursor', opts.cursor);
  }
  if (opts.untagged) {
    query.set('untagged', 'true');
  }
  return `/v1/vcr/repository/${encodeURIComponent(idOrName)}/images?${query.toString()}`;
}

export function imagePath(
  scope: VcrScope,
  idOrName: string,
  imageId: string
): string {
  return `/v1/vcr/repository/${encodeURIComponent(idOrName)}/images/${encodeURIComponent(imageId)}?${baseQuery(scope).toString()}`;
}

export function repositoryTagsPath(
  scope: VcrScope,
  idOrName: string,
  opts: {
    limit?: number;
    cursor?: string;
    sortBy?: string;
    sortOrder?: string;
  } = {}
): string {
  const query = baseQuery(scope);
  if (opts.limit !== undefined) {
    query.set('limit', String(opts.limit));
  }
  if (opts.cursor) {
    query.set('cursor', opts.cursor);
  }
  if (opts.sortBy) {
    query.set('sortBy', opts.sortBy);
  }
  if (opts.sortOrder) {
    query.set('sortOrder', opts.sortOrder);
  }
  return `/v1/vcr/repository/${encodeURIComponent(idOrName)}/tags?${query.toString()}`;
}

export function repositoryTagPath(
  scope: VcrScope,
  idOrName: string,
  tag: string
): string {
  return `/v1/vcr/repository/${encodeURIComponent(idOrName)}/tags/${encodeURIComponent(tag)}?${baseQuery(scope).toString()}`;
}
