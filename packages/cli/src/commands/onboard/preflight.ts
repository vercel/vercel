import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type Client from '../../util/client';
import getUser from '../../util/get-user';
import getTeams from '../../util/teams/get-teams';
import { getLinkedProject } from '../../util/projects/link';
import output from '../../output-manager';
import pkg from '../../util/pkg';
import {
  collectProjectIntelligence,
  formatProjectIntelligence,
  type ProjectIntelligence,
} from './project-intelligence';
import { fetchMarketplaceIntegrationsList } from '../../util/integration/fetch-marketplace-integrations-list';

/** Skill id looked up in the agent skill directories. */
const VERCEL_SKILL_ID = 'vercel-cli';

/**
 * Upper bound on catalog entries injected into the prompt. The marketplace is
 * small enough that this is normally the whole catalog; the cap only guards
 * against the list growing into a prompt tax later.
 */
const MAX_CATALOG_ENTRIES = 60;

export interface MarketplaceCatalogEntry {
  slug: string;
  name: string;
  description?: string;
}

export interface Preflight {
  cliVersion: string;
  /** Authenticated username, when a session is available. */
  username?: string;
  /** Team slug or id in scope, when one is set. */
  team?: string;
  /**
   * The team was decided before the session — chosen by the user at the
   * onboard prompt, or the only one there is — so the agent uses it instead
   * of asking.
   */
  teamPinned?: boolean;
  /** Team slugs the user can act in — the values `--scope` accepts. */
  teams?: string[];
  /** Whether the workspace already resolves to a linked project. */
  linked: boolean;
  linkedProjectName?: string;
  /** Whether the `vercel-cli` agent skill is installed locally. */
  skillInstalled: boolean;
  /** Deterministic static analysis of the workspace. */
  intelligence?: ProjectIntelligence;
  /**
   * The marketplace catalog, pre-fetched so the agent picks an integration
   * from facts instead of spending discovery round trips browsing for one.
   */
  marketplace?: MarketplaceCatalogEntry[];
}

/**
 * Gather the Vercel-side facts the agent needs before it starts, so the prompt
 * describes reality instead of asking the agent to rediscover it.
 *
 * Every lookup is best-effort: `vercel onboard` must still run for a user who
 * is logged out, so it can tell them to log in.
 */
export async function collectPreflight(
  client: Client,
  cwd: string
): Promise<Preflight> {
  const preflight: Preflight = {
    cliVersion: pkg.version,
    linked: false,
    skillInstalled: await isSkillInstalled(cwd),
  };

  // Independent lookups run concurrently; each is best-effort on its own.
  await Promise.all([
    (async () => {
      try {
        const user = await getUser(client);
        preflight.username = user.username;
      } catch (error) {
        debug('could not resolve user', error);
      }
    })(),

    (async () => {
      try {
        const teams = await getTeams(client);
        preflight.teams = teams
          .map(team => team.slug)
          .filter((slug): slug is string => Boolean(slug));
        const current = teams.find(
          team => team.id === client.config.currentTeam
        );
        if (current?.slug) {
          preflight.team = current.slug;
        }
      } catch (error) {
        debug('could not list teams', error);
      }
    })(),

    (async () => {
      try {
        const link = await getLinkedProject(client, { cwd });
        if (link.status === 'linked') {
          preflight.linked = true;
          preflight.linkedProjectName = link.project.name;
        }
      } catch (error) {
        debug('could not resolve project link', error);
      }
    })(),

    (async () => {
      try {
        preflight.intelligence = await collectProjectIntelligence(cwd);
      } catch (error) {
        debug('could not analyze the workspace', error);
      }
    })(),

    (async () => {
      try {
        const integrations = await fetchMarketplaceIntegrationsList(client);
        const catalog = integrations
          .filter(integration => integration.canInstall !== false)
          .slice(0, MAX_CATALOG_ENTRIES)
          .map(integration => ({
            slug: integration.slug,
            name: integration.name,
            ...(integration.shortDescription
              ? { description: truncate(integration.shortDescription, 80) }
              : {}),
          }));
        if (catalog.length > 0) {
          preflight.marketplace = catalog;
        }
      } catch (error) {
        debug('could not fetch the marketplace catalog', error);
      }
    })(),
  ]);

  const { currentTeam } = client.config;
  if (!preflight.team && currentTeam) {
    preflight.team = currentTeam;
  }

  return preflight;
}

function debug(what: string, error: unknown): void {
  output.debug(
    `onboard preflight: ${what}: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

/**
 * Render the preflight as the prose block substituted into the instructions.
 */
export function formatPreflight(preflight: Preflight): string {
  const lines = [
    `- Vercel CLI version: ${preflight.cliVersion}`,
    preflight.username
      ? `- Authenticated as: ${preflight.username}`
      : '- Not authenticated. Ask the user to run `vercel login` before continuing.',
  ];

  if (preflight.team && preflight.teamPinned) {
    // Decided at the onboard prompt, so the agent must not relitigate it —
    // and the available-teams list is withheld, because a list of
    // alternatives next to a decision invites second-guessing.
    lines.push(
      `- Team for this session: ${preflight.team} — already chosen by the user. ` +
        `Pass \`--scope ${preflight.team}\` on every remote command. Do not ask ` +
        'which team to use.'
    );
  } else {
    if (preflight.team) {
      lines.push(`- Team in scope: ${preflight.team}`);
    }

    if (preflight.teams && preflight.teams.length > 0) {
      lines.push(
        `- Teams available (values \`--scope\` accepts): ${preflight.teams.join(', ')}`
      );
    }
  }

  lines.push(
    preflight.linked
      ? `- This directory is already linked to project "${preflight.linkedProjectName}". Do not re-link it.`
      : '- This directory is not linked to a Vercel project yet.'
  );

  lines.push(
    preflight.skillInstalled
      ? '- The `vercel-cli` agent skill is installed. Use it as your reference for CLI behavior.'
      : '- The `vercel-cli` agent skill is not installed. Use the Command reference below; run `vercel <command> --help` only for what it does not cover.'
  );

  const intelligence = preflight.intelligence
    ? formatProjectIntelligence(preflight.intelligence)
    : undefined;
  if (intelligence) {
    lines.push(intelligence);
  }

  if (preflight.marketplace && preflight.marketplace.length > 0) {
    lines.push(
      [
        '- Marketplace catalog, pre-fetched by the CLI — these are the values',
        '  `vercel integration add <slug>` accepts. Pick from this list directly',
        '  instead of browsing; fall back to `vercel integration categories` /',
        '  `vercel integration discover` only when nothing here covers the need:',
        ...preflight.marketplace.map(entry => {
          const description = entry.description
            ? ` — ${entry.description}`
            : '';
          return `    ${entry.slug} (${entry.name})${description}`;
        }),
      ].join('\n')
    );
  }

  return lines.join('\n');
}

function truncate(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

async function isSkillInstalled(cwd: string): Promise<boolean> {
  const candidates = [
    join(cwd, '.agents', 'skills', VERCEL_SKILL_ID),
    join(homedir(), '.agents', 'skills', VERCEL_SKILL_ID),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return true;
    } catch {
      // Not installed at this location; try the next.
    }
  }

  return false;
}
