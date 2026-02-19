import type { ExperimentConfig, Sandbox } from '@vercel/agent-eval';
import type { Vercel } from '@vercel/sdk';

/** Projects created in setup for cleanup. */
const createdProjects: { id: string; teamId?: string }[] = [];
let vercelClient: Vercel | null = null;

async function cleanupProjects() {
  if (!vercelClient) return;
  for (const { id, teamId } of createdProjects) {
    try {
      await vercelClient.projects.deleteProject({
        idOrName: id,
        ...(teamId ? { teamId } : {}),
      });
    } catch {
      // best-effort cleanup
    }
  }
  createdProjects.length = 0;
}

const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  evals: 'smoke/*',
  runs: 1,
  earlyExit: true,
  timeout: 300,
  async setup(sandbox: Sandbox) {
    const token = process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN;
    if (!token) {
      throw new Error(
        'VERCEL_TOKEN or VERCEL_OIDC_TOKEN is required for CLI evals.'
      );
    }

    const { Vercel: VercelClient } = await import('@vercel/sdk');
    vercelClient = new VercelClient({ bearerToken: token });

    const cleanup = () => void cleanupProjects();
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(130);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(143);
    });

    await sandbox.runCommand('npm', ['install', '-g', 'vercel']);

    const authJson = JSON.stringify({ token });
    await sandbox.runCommand('bash', [
      '-c',
      `mkdir -p /home/vercel-sandbox/.vercel && printf '%s' '${authJson}' > /home/vercel-sandbox/.vercel/auth.json`,
    ]);
    await sandbox.runCommand('bash', [
      '-c',
      `printf 'export VERCEL_TOKEN="%s"\\n' '${token}' >> /home/vercel-sandbox/.bashrc`,
    ]);

    let teamId = process.env.VERCEL_TEAM_ID;
    if (!teamId && vercelClient) {
      try {
        const teams = await vercelClient.teams.getTeams({ limit: 1 });
        teamId = teams.teams?.[0]?.id;
      } catch {
        // use personal account
      }
    }

    const projectName = `eval-cli-${Date.now()}`;
    try {
      const project = await vercelClient.projects.createProject({
        ...(teamId ? { teamId } : {}),
        requestBody: { name: projectName },
      });
      createdProjects.push({ id: project.id, teamId: teamId ?? undefined });
      await sandbox.writeFiles({
        '.vercel/project.json': JSON.stringify({
          projectId: project.id,
          orgId: teamId || project.accountId,
        }),
      });
    } catch {
      // project creation optional for smoke evals
    }
  },
};

export default config;
