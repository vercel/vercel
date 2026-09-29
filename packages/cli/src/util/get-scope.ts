import type Client from './client';
import type { Org } from '@vercel-internals/types';
import output from '../output-manager';
import { scopeContextFromClient } from '../gateways/live-context';
import {
  resolveScope,
  type BasicScopeContext,
  type ResolveScopeOptions,
  type ResolveScopeWithLocalScopeOptions,
  type ResolveScopeWithoutLocalScopeOptions,
  type ScopeContext,
} from './scope/resolve-scope';

export type { BasicScopeContext, ScopeContext };
export { detectExplicitScope } from './scope/resolve-scope';

/**
 * Legacy entry point for scope resolution. Builds live gateways from `client`
 * and delegates to `resolveScope`.
 */
export default function getScope(
  client: Client,
  opts: ResolveScopeWithLocalScopeOptions
): Promise<ScopeContext>;
export default function getScope(
  client: Client,
  opts?: ResolveScopeWithoutLocalScopeOptions
): Promise<BasicScopeContext>;
export default async function getScope(
  client: Client,
  opts: ResolveScopeOptions = {}
): Promise<BasicScopeContext | ScopeContext> {
  return resolveScope(scopeContextFromClient(client), client, opts);
}

export function applyScopeFromLink(client: Client, link: { org: Org }): void {
  const localOrgId = link.org.id;
  const globalTeamId = client.config.currentTeam;

  const scopeMismatch = Boolean(globalTeamId && globalTeamId !== localOrgId);

  if (scopeMismatch) {
    output.warn(
      `This directory is linked to a project under a different team than your current scope. ` +
        `Using the linked project's team. To change, run \`vc link\`.`
    );
  }

  client.config.currentTeam = localOrgId.startsWith('team_')
    ? localOrgId
    : undefined;
}
