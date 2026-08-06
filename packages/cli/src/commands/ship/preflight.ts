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

/** Skill id looked up in the agent skill directories. */
const VERCEL_SKILL_ID = 'vercel-cli';

export interface Preflight {
  cliVersion: string;
  /** Authenticated username, when a session is available. */
  username?: string;
  /** Team slug or id in scope, when one is set. */
  team?: string;
  /** Team slugs the user can act in — the values `--scope` accepts. */
  teams?: string[];
  /** Whether the workspace already resolves to a linked project. */
  linked: boolean;
  linkedProjectName?: string;
  /** Whether the `vercel-cli` agent skill is installed locally. */
  skillInstalled: boolean;
  /** Deterministic static analysis of the workspace. */
  intelligence?: ProjectIntelligence;
}

/**
 * Gather the Vercel-side facts the agent needs before it starts, so the prompt
 * describes reality instead of asking the agent to rediscover it.
 *
 * Every lookup is best-effort: `vercel ship` must still run for a user who is
 * logged out, so it can tell them to log in.
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
  ]);

  const { currentTeam } = client.config;
  if (!preflight.team && currentTeam) {
    preflight.team = currentTeam;
  }

  return preflight;
}

function debug(what: string, error: unknown): void {
  output.debug(
    `ship preflight: ${what}: ${
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

  if (preflight.team) {
    lines.push(`- Team in scope: ${preflight.team}`);
  }

  if (preflight.teams && preflight.teams.length > 0) {
    lines.push(
      `- Teams available (values \`--scope\` accepts): ${preflight.teams.join(', ')}`
    );
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

  return lines.join('\n');
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
