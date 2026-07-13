import type Client from '../client';
import type { ProjectLinkResult } from '@vercel-internals/types';
import { resolveProjectContext } from './resolve-project-context';

/**
 * Compatibility entry point for commands that have not migrated to
 * `resolveProjectContext()` yet. New project-aware commands should use the
 * shared resolver directly.
 *
 * Resolves the project for commands that accept `--project` outside a linked
 * directory.
 *
 * When an explicit `--project` name fails to resolve, this reports the
 * standard "project not found" error (including the structured
 * non-interactive payload) instead of returning `not_linked` — the generic
 * "pass --project or run vercel link" guidance would tell the caller to pass
 * the flag they already passed.
 */
export async function getLinkedProjectOrFail(
  client: Client,
  projectName?: string
): Promise<ProjectLinkResult> {
  return resolveProjectContext({
    client,
    projectNameOrId: projectName,
  });
}
