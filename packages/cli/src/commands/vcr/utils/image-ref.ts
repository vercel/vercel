/**
 * Docker repository component: lowercase alphanumerics separated by a single
 * `.`, one or two `_`, or one or more `-`.
 */
const REPOSITORY_PATTERN = /^[a-z0-9]+(?:(?:\.|_|__|-+)[a-z0-9]+)*$/;

/** OCI tag: up to 128 chars of letters, digits, `_`, `.`, `-`. */
const TAG_PATTERN = /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/;

/** Tag applied when the user does not type one. */
export const DEFAULT_TAG = 'latest';

export interface ParsedName {
  repository: string;
  /** Left `undefined` when no `:tag` was typed, so callers can default it. */
  tag: string | undefined;
}

/**
 * Parses the optional `name[:tag]` positional. The registry, team, and project
 * segments are added by the CLI, so a `/` in the name is rejected rather than
 * silently accepted as a path.
 */
export function parseNameArg(
  nameArg: string | undefined,
  defaultRepo: string
): ParsedName | { error: string } {
  if (!nameArg) {
    return { repository: defaultRepo, tag: undefined };
  }
  if (nameArg.includes('/')) {
    return {
      error: `Invalid image name "${nameArg}". Provide only a repository name (optionally with :tag); the registry, team, and project are added automatically.`,
    };
  }
  const colon = nameArg.lastIndexOf(':');
  if (colon === -1) {
    return { repository: nameArg, tag: undefined };
  }
  const repository = nameArg.slice(0, colon);
  const tag = nameArg.slice(colon + 1);
  if (!repository) {
    return {
      error: `Invalid image name "${nameArg}". Missing repository name before ":".`,
    };
  }
  return { repository, tag };
}

/**
 * Validates the user-supplied repository and tag against the registry's naming
 * rules. Returns an error message naming the offending part, or `undefined`.
 */
export function validateImageParts(parts: {
  repository: string;
  tag: string | undefined;
}): string | undefined {
  if (!REPOSITORY_PATTERN.test(parts.repository)) {
    return `Invalid repository name "${parts.repository}". Use lowercase letters, digits, and separators (\`.\` \`_\` \`-\`), for example "my-app". Pass a valid name explicitly, e.g. \`... my-app\`.`;
  }
  if (parts.tag !== undefined && !TAG_PATTERN.test(parts.tag)) {
    return `Invalid tag "${parts.tag}". Tags may contain letters, digits, "_", ".", "-" and be up to 128 characters.`;
  }
  return undefined;
}

/** Builds the tag-less image reference `registry/team/project/repository`. */
export function buildRepositoryReference(parts: {
  registry: string;
  teamSlug: string;
  projectName: string;
  repository: string;
}): string {
  return `${parts.registry}/${parts.teamSlug}/${parts.projectName}/${parts.repository}`;
}
