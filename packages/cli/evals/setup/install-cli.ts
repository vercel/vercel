import type { Sandbox } from '@vercel/agent-eval';

export const installCLI = async (sandbox: Sandbox) => {
  await sandbox.runCommand('npm', ['install', '-g', 'vercel']);
};
