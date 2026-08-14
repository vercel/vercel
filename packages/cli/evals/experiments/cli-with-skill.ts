import type { ExperimentConfig } from '@vercel/agent-eval';

const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  runs: 1,
  earlyExit: false, // Run all evals to completion so we get explicit pass/fail for each
  evals: ['_deploy'],
  timeout: 300,
  sandbox: 'docker', // Use Docker sandbox in CI (no OIDC required; Vercel sandbox prefers OIDC)
  setup: async sandbox => {
    const token = process.env.VERCEL_TOKEN;
    if (!token) {
      throw new Error(
        'VERCEL_TOKEN or VERCEL_OIDC_TOKEN is required for CLI evals.'
      );
    }
    await sandbox.writeFiles({ '.env': `VERCEL_TOKEN=${token}` });

    await sandbox.runCommand('npm', ['install', '-g', 'vercel']);

    // add vercel-cli skill
    await sandbox.runCommand('npx', [
      '--yes',
      'skills',
      'add',
      'https://github.com/vercel/vercel',
      '--skill',
      'vercel-cli',
      '--yes',
      '--global',
    ]);

    // rename fixture folder and all of its contents to something unique
    await sandbox.runCommand('mv', ['fixture', `fixture-${Date.now()}`]);
  },
  copyFiles: 'all',
};

export default config;
