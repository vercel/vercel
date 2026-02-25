import {
  readAuthConfigFile,
  // @ts-ignore
} from '../../src/util/config/files';
import type { Sandbox } from '@vercel/agent-eval';

export const setupAuthAndConfig = async (sandbox: Sandbox) => {
  // Copy host's CLI global config (auth + config.json) into sandbox so CLI sees same token/team
  const shellEscape = (s: string) => s.replace(/'/g, "'\\''");
  const cliDataDir = '$HOME/.local/share/com.vercel.cli';
  try {
    const authConfig = process.env.VERCEL_TOKEN
      ? { token: process.env.VERCEL_TOKEN }
      : readAuthConfigFile();
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
