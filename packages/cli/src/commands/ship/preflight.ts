import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type Client from '../../util/client';
import getUser from '../../util/get-user';
import { getLinkedProject } from '../../util/projects/link';
import output from '../../output-manager';
import pkg from '../../util/pkg';

/** Skill id looked up in the agent skill directories. */
const VERCEL_SKILL_ID = 'vercel-cli';

export interface Preflight {
  cliVersion: string;
  /** Authenticated username, when a session is available. */
  username?: string;
  /** Team slug or id in scope, when one is set. */
  team?: string;
  /** Whether the workspace already resolves to a linked project. */
  linked: boolean;
  linkedProjectName?: string;
  /** Whether the `vercel-cli` agent skill is installed locally. */
  skillInstalled: boolean;
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

  try {
    const user = await getUser(client);
    preflight.username = user.username;
  } catch (error) {
    output.debug(
      `ship preflight: could not resolve user: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const { currentTeam } = client.config;
  if (currentTeam) {
    preflight.team = currentTeam;
  }

  try {
    const link = await getLinkedProject(client, { cwd });
    if (link.status === 'linked') {
      preflight.linked = true;
      preflight.linkedProjectName = link.project.name;
    }
  } catch (error) {
    output.debug(
      `ship preflight: could not resolve project link: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return preflight;
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

  lines.push(
    preflight.linked
      ? `- This directory is already linked to project "${preflight.linkedProjectName}". Do not re-link it.`
      : '- This directory is not linked to a Vercel project yet.'
  );

  lines.push(
    preflight.skillInstalled
      ? '- The `vercel-cli` agent skill is installed. Use it as your reference for CLI behavior.'
      : '- The `vercel-cli` agent skill is not installed. Rely on `vercel <command> --help`.'
  );

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
