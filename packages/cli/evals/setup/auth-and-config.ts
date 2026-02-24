import type { Sandbox } from '@vercel/agent-eval';

/**
 * Writes auth and config into the sandbox so the CLI can authenticate.
 * Uses only process.env to avoid pulling in CLI src (and @vercel/client), which
 * may not be built when agent-eval loads this in CI.
 */
export const setupAuthAndConfig = async (sandbox: Sandbox) => {
  const shellEscape = (s: string) => s.replace(/'/g, "'\\''");
  const cliDataDir = '$HOME/.local/share/com.vercel.cli';
  try {
    const token = process.env.VERCEL_TOKEN;
    const authConfig = token ? { token } : {};
    const authJson = JSON.stringify(authConfig);
    await sandbox.runCommand('bash', [
      '-c',
      `mkdir -p "${cliDataDir}" && printf '%s' '${shellEscape(authJson)}' > "${cliDataDir}/auth.json"`,
    ]);
  } catch (err) {
    // Host may have no auth file (e.g. CI with only VERCEL_TOKEN)
  }
  try {
    const configJson = JSON.stringify({
      telemetry: {
        enabled: false,
      },
      currentTeam:
        process.env.CLI_EVAL_TEAM_ID ?? 'team_KhlEYrm473sP7ybEytVDlfyj',
    });
    await sandbox.runCommand('bash', [
      '-c',
      `mkdir -p "${cliDataDir}" && printf '%s' '${shellEscape(configJson)}' > "${cliDataDir}/config.json"`,
    ]);
  } catch (err) {
    // Host may have no config.json yet
  }
};
