import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import type { ExperimentConfig } from '@vercel/agent-eval';
import { setupAuthAndConfig } from '../setup/auth-and-config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '../../../../skills/vercel-cli');

/** Recursively list all files under dir, returns paths relative to dir. */
function listSkillFiles(dir: string, baseDir: string = dir): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...listSkillFiles(full, baseDir));
    } else if (e.isFile() && /\.md$/i.test(e.name)) {
      files.push(relative(baseDir, full));
    }
  }
  return files;
}

/**
 * CLI evals experiment. Add eval fixtures under evals/ and configure
 * credentials (AI_GATEWAY_API_KEY, VERCEL_TOKEN, etc.) to run.
 *
 * Setup:
 * - Installs Vercel CLI globally
 * - Copies CLI skills and documentation to sandbox
 * - Writes evals-setup.json (teamId, projectId) for evals that need link targets
 * - Ensures VERCEL_TOKEN is available
 */
const config: ExperimentConfig = {
  agent: 'vercel-ai-gateway/claude-code',
  evals: ['build', 'non-interactive'],
  runs: 1,
  earlyExit: false, // Run all evals to completion so we get explicit pass/fail for each
  timeout: 900, // 15 min per eval (env can need link + env ls; build is long)
  sandbox: 'docker', // Use Docker sandbox in CI (no OIDC required; Vercel sandbox prefers OIDC)
  setup: async sandbox => {
    const teamId = process.env.CLI_EVAL_TEAM_ID ?? '';
    const projectId = process.env.CLI_EVAL_PROJECT_ID ?? '';

    await setupAuthAndConfig(sandbox);

    const runCmd =
      (sandbox as any).runCommand ||
      (sandbox as any).exec ||
      (sandbox as any).run ||
      null;

    // Docker sandbox: enable non-interactive mode via agent detection
    if (runCmd) {
      try {
        await runCmd.call(sandbox, 'bash', [
          '-c',
          'printf \'export AI_AGENT="claude-code"\\n\' >> "$HOME/.bashrc"',
        ]);
        await runCmd.call(sandbox, 'bash', [
          '-c',
          'printf \'export CLAUDE_CODE="1"\\n\' >> "$HOME/.bashrc"',
        ]);
      } catch (error: any) {
        void error;
      }
    }

    if (runCmd) {
      try {
        const installResult = await runCmd.call(sandbox, 'npm', [
          'install',
          '-g',
          'vercel@latest',
        ]);
        // CLI installation attempted (output ignored for linting)
        void installResult;
      } catch (error: any) {
        // Don't throw - CLI might already be installed or method might differ
        void error;
      }

      // Verify CLI is available
      try {
        const versionResult = await runCmd.call(sandbox, 'vercel', [
          '--version',
        ]);
        // CLI version check attempted (output ignored for linting)
        void versionResult;
      } catch (error: any) {
        // CLI verification failed - may need manual installation
        void error;
      }
    }
    // Note: If runCmd is not available, CLI installation will need to happen during eval

    // Copy all skill files by iterating the skills directory (no hardcoded list)
    const skillFiles: Record<string, string> = {};
    try {
      if (existsSync(SKILLS_DIR)) {
        const files = listSkillFiles(SKILLS_DIR);
        for (const rel of files) {
          try {
            const full = join(SKILLS_DIR, rel);
            skillFiles[`docs/vercel-cli/${rel}`] = readFileSync(full, 'utf-8');
          } catch (error: any) {
            void error;
          }
        }
      }
    } catch (error: any) {
      void error;
    }

    // Short README: point to skill docs and CLI help (rely on built-in CLI behavior)
    skillFiles['docs/README.md'] = `# Vercel CLI

Docs are in \`docs/vercel-cli/\` (skill + references). Use \`vercel <command> -h\` for help.

Use \`--yes\` and \`evals-setup.json\` for team/project IDs when linking.

If \`vercel link\` reports no credentials, run \`source ~/.profile\` first (or \`source ~/.bashrc\`) so VERCEL_TOKEN is set, then retry.`;

    // Write all files
    await sandbox.writeFiles({
      'evals-setup.json': JSON.stringify({ teamId, projectId }, null, 2),
      ...skillFiles,
    });
  },
};

export default config;
