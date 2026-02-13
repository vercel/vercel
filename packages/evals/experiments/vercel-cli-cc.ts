import type { ExperimentConfig, Sandbox } from '@vercel/agent-eval';

/** Track projects created during setup so we can clean them up. */
const createdProjects: { id: string; teamId?: string }[] = [];

function getAuthHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function cleanupProjects(token: string) {
  for (const { id, teamId } of createdProjects) {
    try {
      const qs = teamId ? `?teamId=${teamId}` : '';
      const res = await fetch(`https://api.vercel.com/v9/projects/${id}${qs}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (res.ok || res.status === 404) {
        console.log(`Cleanup: Deleted project ${id}`);
      } else {
        console.warn(`Cleanup: Failed to delete project ${id} (${res.status})`);
      }
    } catch (err) {
      console.warn(`Cleanup: Error deleting project ${id}: ${err}`);
    }
  }
  createdProjects.length = 0;
}

const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  evals: 'marketplace/install-neon-postgres',
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

    // Register cleanup on process exit (covers success, failure, and SIGINT)
    const cleanup = () => void cleanupProjects(token);
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
        const teamsRes = await fetch('https://api.vercel.com/v2/teams', {
          headers: getAuthHeaders(token),
        });
        if (teamsRes.ok) {
          const teamsData = (await teamsRes.json()) as {
            teams?: { id: string }[];
          };
          teamId = teamsData.teams?.[0]?.id;
        }
      } catch {
        // Team detection is best-effort; fall back to personal account
      }
    }

    // Create a temporary Vercel project for the eval
    const projectName = `eval-neon-${Date.now()}`;
    try {
      const url = teamId
        ? `https://api.vercel.com/v10/projects?teamId=${teamId}`
        : 'https://api.vercel.com/v10/projects';
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: projectName }),
      });

      if (res.ok) {
        const project = (await res.json()) as {
          id: string;
          accountId: string;
        };
        // Track for cleanup
        createdProjects.push({ id: project.id, teamId });
        await sandbox.writeFiles({
          '.vercel/project.json': JSON.stringify({
            projectId: project.id,
            orgId: teamId || project.accountId,
          }),
        });
        console.log(`Setup: Created project ${projectName} (${project.id})`);
      } else {
        const err = await res.text();
        console.warn(
          `Setup: Could not create project (${res.status}: ${err}).`
        );
      }
    } catch (err) {
      console.warn(`Setup: Project creation error: ${err}`);
    }
  },
};

export default config;
