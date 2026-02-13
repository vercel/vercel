import type { ExperimentConfig, Sandbox } from '@vercel/agent-eval';
import { Vercel } from '@vercel/sdk';

/** Track projects created during setup so we can clean them up. */
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
      console.log(`Cleanup: Deleted project ${id}`);
    } catch (err) {
      console.warn(`Cleanup: Error deleting project ${id}: ${err}`);
    }
  }
  createdProjects.length = 0;
}

const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  evals: 'marketplace/*',
  runs: 1,
  earlyExit: true,
  timeout: 600,
  async setup(sandbox: Sandbox) {
    const token = process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN;
    if (!token) {
      throw new Error(
        'VERCEL_TOKEN or VERCEL_OIDC_TOKEN is required for CLI evals.'
      );
    }

    vercelClient = new Vercel({ bearerToken: token });

    // Register cleanup on process exit (covers success, failure, and SIGINT)
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

    // Install Vercel CLI globally
    await sandbox.runCommand('npm', ['install', '-g', 'vercel']);

    // Write Vercel CLI auth config
    const authJson = JSON.stringify({ token });
    await sandbox.runCommand('bash', [
      '-c',
      `mkdir -p /home/vercel-sandbox/.vercel && printf '%s' '${authJson}' > /home/vercel-sandbox/.vercel/auth.json`,
    ]);

    // Export VERCEL_TOKEN in .bashrc for agent and eval subprocesses
    await sandbox.runCommand('bash', [
      '-c',
      `printf 'export VERCEL_TOKEN="%s"\\n' '${token}' >> /home/vercel-sandbox/.bashrc`,
    ]);

    // Detect team ID
    let teamId = process.env.VERCEL_TEAM_ID;
    if (!teamId) {
      try {
        const teams = await vercelClient.teams.getTeams({ limit: 1 });
        teamId = teams.teams?.[0]?.id;
      } catch {
        // Team detection is best-effort; fall back to personal account
      }
    }

    // Create a temporary Vercel project for the eval
    const projectName = `eval-neon-${Date.now()}`;
    try {
      const project = await vercelClient.projects.createProject({
        ...(teamId ? { teamId } : {}),
        requestBody: { name: projectName },
      });

      createdProjects.push({ id: project.id, teamId });
      await sandbox.writeFiles({
        '.vercel/project.json': JSON.stringify({
          projectId: project.id,
          orgId: teamId || project.accountId,
        }),
      });
      console.log(`Setup: Created project ${projectName} (${project.id})`);
    } catch (err) {
      console.warn(`Setup: Project creation error: ${err}`);
    }
  },
};

export default config;
