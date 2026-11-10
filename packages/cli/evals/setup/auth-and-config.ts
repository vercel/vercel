import type { Sandbox } from '@vercel/agent-eval';
import {
  ALLOWED_EVAL_TEAM_ID,
  assertAllowedEvalTeam,
  getVerifiedEvalToken,
} from '../team-guard';

/**
 * Writes auth and config into the sandbox so the CLI can authenticate.
 * Uses only process.env to avoid pulling in CLI src (and @vercel/client), which
 * may not be built when agent-eval loads this in CI.
 *
 * HARD SAFETY GUARD: this is the single chokepoint where credentials enter a
 * sandbox. The token is verified (fail-closed) to be scoped to ONLY the
 * dedicated evals team, and the sandbox CLI scope is pinned to that team.
 * Every experiment that authenticates a sandbox goes through here, so
 * individual evals and experiments need no guards of their own.
 */
export const setupAuthAndConfig = async (sandbox: Sandbox) => {
  const shellEscape = (s: string) => s.replace(/'/g, "'\\''");
  // Throws (and aborts the run) if the token can reach any team other than
  // the dedicated evals team — deliberately outside the try/catch blocks below.
  const token = await getVerifiedEvalToken();
  const authConfig = token ? { token } : {};
  const authJson = JSON.stringify(authConfig);
  const cliDataDir = '$HOME/.local/share/com.vercel.cli';
  const vercelDir = '$HOME/.vercel';

  try {
    await sandbox.runCommand('bash', [
      '-c',
      `mkdir -p "${cliDataDir}" && printf '%s' '${shellEscape(authJson)}' > "${cliDataDir}/auth.json"`,
    ]);
    await sandbox.runCommand('bash', [
      '-c',
      `mkdir -p "${vercelDir}" && printf '%s' '${shellEscape(authJson)}' > "${vercelDir}/auth.json"`,
    ]);
    if (token) {
      await sandbox.runCommand('bash', [
        '-c',
        `printf 'export VERCEL_TOKEN="%s"\\n' '${shellEscape(token)}' >> "$HOME/.bashrc"`,
      ]);
      await sandbox.runCommand('bash', [
        '-c',
        `printf 'export VERCEL_TOKEN="%s"\\n' '${shellEscape(token)}' >> "$HOME/.profile"`,
      ]);
    }
  } catch (_err) {
    // Host may have no auth (e.g. CI with only VERCEL_TOKEN)
  }
  // HARD SAFETY GUARD: the sandbox CLI scope may only ever be the dedicated
  // evals team (see team-guard.ts). Throws if CLI_EVAL_TEAM_ID points anywhere else.
  const currentTeam = process.env.CLI_EVAL_TEAM_ID ?? ALLOWED_EVAL_TEAM_ID;
  assertAllowedEvalTeam(currentTeam, 'CLI_EVAL_TEAM_ID (sandbox currentTeam)');
  try {
    const configJson = JSON.stringify({
      telemetry: { enabled: false },
      currentTeam,
    });
    await sandbox.runCommand('bash', [
      '-c',
      `mkdir -p "${cliDataDir}" && printf '%s' '${shellEscape(configJson)}' > "${cliDataDir}/config.json"`,
    ]);
  } catch (_err) {
    // Best-effort config write
  }
};
