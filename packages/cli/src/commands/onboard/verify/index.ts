import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type Client from '../../../util/client';
import output from '../../../output-manager';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { help } from '../../help';
import { getFullUrlAndToken } from '../../curl/shared';
import {
  getOnboardSessionDir,
  recordSessionEvent,
} from '../../../util/onboard-session';
import { onboardCommand, verifySubcommand } from '../command';
import {
  parseManifest,
  type StatefulMilestone,
  type VerifyCheck,
} from './manifest';
import { runChecks, type CheckOutcome } from './run';

/**
 * `vercel onboard verify [manifest]` — execute a verification manifest
 * against a deployment, deterministically.
 *
 * This is the CLI's half of deployment verification: the agent authors the
 * manifest (which routes prove what), this command owns everything
 * mechanical — the requests, the comparisons, the output format, and the
 * typed `verification` ledger event the session report reads. A model
 * cannot inflate the result, because the result never passes through one.
 *
 * Works outside an onboard session too; the ledger write is simply a no-op
 * there.
 */
export async function onboardVerify(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(verifySubcommand.options);

  let parsedArgs;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(
      help(verifySubcommand, {
        parent: onboardCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  const manifestPath = resolveManifestPath(client, parsedArgs.args[0]);
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf-8');
  } catch {
    output.error(`Could not read the manifest at ${manifestPath}.`);
    return 1;
  }

  const parsed = parseManifest(raw);
  if (!parsed.ok) {
    output.error(`Invalid manifest ${manifestPath}:`);
    for (const error of parsed.errors) {
      output.print(`  - ${error}\n`);
    }
    return 1;
  }

  const deploymentArg =
    parsedArgs.flags['--deployment'] ?? parsed.manifest.deployment;
  if (!deploymentArg) {
    output.error(
      'No deployment to verify. Pass --deployment <url> or set "deployment" in the manifest.'
    );
    return 1;
  }
  const baseUrl = normalizeOrigin(deploymentArg);
  if (!baseUrl) {
    output.error(`Not a valid deployment URL: ${deploymentArg}`);
    return 1;
  }

  // Deployment Protection bypass, through the same machinery `vercel curl`
  // uses. Best-effort: without a token the checks still run, and a 401
  // shows up as the failure it is. The same acquisition is handed to the
  // runner as a refresh callback, so a pass that hits protection (a stale
  // or missing token) can reacquire and rerun without importing the client
  // layer itself.
  const acquireBypassToken = async (): Promise<string | null> => {
    try {
      const { deploymentProtectionToken } = await getFullUrlAndToken(
        client,
        baseUrl
      );
      return deploymentProtectionToken ?? null;
    } catch (err) {
      output.debug(
        `onboard verify: no protection bypass token: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return null;
    }
  };
  const bypassToken = await acquireBypassToken();

  const {
    outcomes,
    passed,
    failed,
    attempts,
    protectionRetries,
    protectionBlocked,
  } = await runChecks({
    baseUrl,
    manifest: parsed.manifest,
    bypassToken,
    refreshBypassToken: acquireBypassToken,
    onRetry: (attempt, reason) => {
      client.stdout.write(
        reason === 'protection'
          ? `Deployment Protection blocked checks — refreshing the bypass token and retrying the full manifest (attempt ${attempt})…\n`
          : `deployment not answering yet — retrying (attempt ${attempt})…\n`
      );
    },
  });

  // Results go to stdout: the caller is usually an agent, and stdout is the
  // parsing contract.
  client.stdout.write(
    `Verifying ${baseUrl} — ${outcomes.length} check${
      outcomes.length === 1 ? '' : 's'
    }\n`
  );
  for (const outcome of outcomes) {
    const status = outcome.status ?? 'error';
    const label = outcome.ok ? 'PASS' : 'FAIL';
    const detail = outcome.ok ? '' : ` (${outcome.failures.join('; ')})`;
    const why = outcome.why ? ` — ${outcome.why}` : '';
    client.stdout.write(
      `${label} ${outcome.method} ${outcome.path} → ${status}${detail}${why}\n`
    );
    if (!outcome.ok && outcome.bodySnippet) {
      client.stdout.write(`     body: ${outcome.bodySnippet}\n`);
    }
  }
  client.stdout.write(`${passed}/${outcomes.length} checks passed\n`);

  // Milestones: what the passing checks prove, and — just as important —
  // what the failing ones leave unproven. Printed so the agent reads the
  // migration state, journaled so the report does.
  const milestones = deriveMilestones(parsed.manifest.checks, outcomes);
  if (milestones) {
    if (milestones.verified.length > 0) {
      client.stdout.write(
        `Milestones verified: ${milestones.verified.join(', ')}\n`
      );
    }
    if (milestones.unverified.length > 0) {
      client.stdout.write(
        `Milestones NOT verified: ${milestones.unverified.join(', ')}\n`
      );
    }
  }

  // Protection is named as what it is, so a protected deployment is never
  // read as the application failing — and never as propagation either.
  if (protectionBlocked > 0) {
    client.stdout.write(
      `Deployment Protection blocked ${protectionBlocked} check${
        protectionBlocked === 1 ? '' : 's'
      } after refreshing the bypass token ${protectionRetries} time${
        protectionRetries === 1 ? '' : 's'
      }. This is an access-control result, not an application failure — the
app behind the protection was not measured by the blocked checks.\n`
    );
  }

  // The typed fact the session report reads. Journaled from the outcomes
  // this process measured — the deployment's "verified" status comes from
  // here, never from the transcript.
  recordSessionEvent({
    type: 'verification',
    deployment: baseUrl,
    passed,
    failed,
    attempts,
    // The protection story, minus the token itself: how many refresh-and-
    // rerun passes happened, and how many checks stayed blocked.
    ...(protectionRetries > 0 ? { protectionRetries } : {}),
    ...(protectionBlocked > 0 ? { protectionBlocked } : {}),
    ...(milestones ? { milestones } : {}),
    checks: outcomes.map(outcome => ({
      method: outcome.method,
      path: outcome.path,
      ...(outcome.status !== undefined ? { status: outcome.status } : {}),
      expected: outcome.expectedStatus,
      ok: outcome.ok,
      ...(outcome.failures.length > 0 ? { failures: outcome.failures } : {}),
      ...(outcome.failureClass ? { failureClass: outcome.failureClass } : {}),
      ...(outcome.why ? { why: outcome.why } : {}),
    })),
  });

  return failed === 0 ? 0 : 1;
}

/**
 * A milestone is verified only when every check claiming it passed. One
 * failing check un-verifies the milestone — evidence is conjunctive: a POST
 * that worked proves nothing about persistence if the GET after it failed.
 * `undefined` when the manifest claims no milestones, so older manifests
 * journal exactly what they did before.
 */
function deriveMilestones(
  checks: VerifyCheck[],
  outcomes: CheckOutcome[]
):
  | { verified: StatefulMilestone[]; unverified: StatefulMilestone[] }
  | undefined {
  const status = new Map<StatefulMilestone, boolean>();
  checks.forEach((check, index) => {
    for (const milestone of check.proves ?? []) {
      const passed = outcomes[index]?.ok === true;
      status.set(milestone, (status.get(milestone) ?? true) && passed);
    }
  });
  if (status.size === 0) {
    return undefined;
  }
  const verified: StatefulMilestone[] = [];
  const unverified: StatefulMilestone[] = [];
  for (const [milestone, ok] of status) {
    (ok ? verified : unverified).push(milestone);
  }
  return { verified, unverified };
}

/**
 * The manifest lives in the session directory by default, next to the
 * ledger, so a session's record and the checks that verified it stay
 * together.
 */
function resolveManifestPath(client: Client, argument?: string): string {
  if (argument) {
    return isAbsolute(argument) ? argument : resolve(client.cwd, argument);
  }
  const sessionDir = getOnboardSessionDir();
  return sessionDir
    ? join(sessionDir, 'verify.json')
    : resolve(client.cwd, 'verify.json');
}

/** `https://host` from a URL or bare host; `undefined` when unparseable. */
function normalizeOrigin(input: string): string | undefined {
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
    ? input
    : `https://${input}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return undefined;
  }
}
