import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ExperimentConfig } from '@vercel/agent-eval';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '../../../../skills/vercel-cli');

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
  runs: 1,
  earlyExit: false, // Run all evals to completion so we get explicit pass/fail for each
  timeout: 600,
  sandbox: 'docker', // Use Docker sandbox in CI (no OIDC required; Vercel sandbox prefers OIDC)
  setup: async sandbox => {
    const teamId = process.env.CLI_EVAL_TEAM_ID ?? '';
    const projectId = process.env.CLI_EVAL_PROJECT_ID ?? '';
    const vercelToken = process.env.VERCEL_TOKEN ?? '';

    // Set environment variables for agent detection and Vercel auth
    // This enables non-interactive mode automatically via agent detection
    const runCmd =
      (sandbox as any).runCommand ||
      (sandbox as any).exec ||
      (sandbox as any).run ||
      null;

    if (runCmd && vercelToken) {
      try {
        // Export VERCEL_TOKEN and agent detection vars in .bashrc for agent and eval subprocesses
        await runCmd.call(sandbox, 'bash', [
          '-c',
          `printf 'export VERCEL_TOKEN="%s"\\n' '${vercelToken.replace(/'/g, "'\\''")}' >> /home/vercel-sandbox/.bashrc`,
        ]);
        await runCmd.call(sandbox, 'bash', [
          '-c',
          'printf \'export AI_AGENT="claude-code"\\n\' >> /home/vercel-sandbox/.bashrc',
        ]);
        await runCmd.call(sandbox, 'bash', [
          '-c',
          'printf \'export CLAUDE_CODE="1"\\n\' >> /home/vercel-sandbox/.bashrc',
        ]);
      } catch (error: any) {
        // Environment variable setup failed - continue anyway
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

    // Read and copy all skill files
    const skillFiles: Record<string, string> = {};

    // Main skill file
    try {
      skillFiles['docs/vercel-cli/SKILL.md'] = readFileSync(
        join(SKILLS_DIR, 'SKILL.md'),
        'utf-8'
      );
    } catch (error: any) {
      // Skill file read failed - continue without it
      void error;
    }

    // Command file
    try {
      skillFiles['docs/vercel-cli/command/vercel.md'] = readFileSync(
        join(SKILLS_DIR, 'command/vercel.md'),
        'utf-8'
      );
    } catch (error: any) {
      // Command file read failed - continue without it
      void error;
    }

    // Reference files
    const referenceFiles = [
      'global-options.md',
      'environment-variables.md',
      'ci-automation.md',
      'deployment.md',
      'getting-started.md',
      'local-development.md',
      'monitoring-and-debugging.md',
      'projects-and-teams.md',
      'domains-and-dns.md',
      'storage.md',
      'integrations.md',
      'advanced.md',
    ];

    for (const file of referenceFiles) {
      try {
        skillFiles[`docs/vercel-cli/references/${file}`] = readFileSync(
          join(SKILLS_DIR, 'references', file),
          'utf-8'
        );
      } catch (error: any) {
        // Reference file read failed - continue without it
        void error;
      }
    }

    // Create README pointing to documentation
    skillFiles['docs/README.md'] = `# Vercel CLI Documentation

This directory contains the Vercel CLI skill and reference documentation.

## Quick Start

1. **Verify CLI is installed**: Run \`vercel --version\`. If not installed, run \`npm install -g vercel@latest\`
2. **Verify authentication**: Run \`vercel whoami\` to check if VERCEL_TOKEN is set correctly
3. **Read the skill**: Check \`docs/vercel-cli/SKILL.md\` for an overview
4. **Check references**: See \`docs/vercel-cli/references/\` for specific topics:
   - \`global-options.md\` - Global flags like \`--yes\`, \`--debug\`, \`--non-interactive\`
   - \`ci-automation.md\` - CI/CD patterns and non-interactive usage (IMPORTANT!)
   - \`environment-variables.md\` - Managing env vars with \`vercel env\`
   - \`deployment.md\` - Deployment commands
   - \`projects-and-teams.md\` - Project linking and team management
   - \`getting-started.md\` - First-time setup

## Key Points for Non-Interactive Usage (CRITICAL!)

**You are running in a non-interactive environment. Always:**

1. **Use \`--yes\` or \`-y\` flag** to skip all confirmation prompts
2. **Use \`VERCEL_TOKEN\` environment variable** for authentication (never use \`--token\` flag)
3. **Link projects non-interactively**: Use \`vercel link --yes --scope <team> --project <project>\` or read from \`evals-setup.json\`
4. **Run commands from the correct directory**: Commands must be run from directory with \`.vercel/\` folder

## Common Commands

\`\`\`bash
# Link a project (non-interactive)
vercel link --yes --scope <team-slug> --project <project-name>

# List environment variables
vercel env ls

# Build a project
vercel build

# Deploy (preview)
vercel --yes

# Deploy (production)
vercel --prod --yes
\`\`\`

## Authentication

The \`VERCEL_TOKEN\` environment variable should be set for authentication.
- Verify with: \`vercel whoami\`
- If missing, check that VERCEL_TOKEN is set in the environment

## Setup Information

Check \`evals-setup.json\` for team and project IDs that may be needed for linking.

## Getting Help

- \`vercel <command> -h\` - Show help for any command
- \`vercel --help\` - Show general help
- \`vercel <command> --help\` - Show detailed help for a command
`;

    // Write all files
    await sandbox.writeFiles({
      'evals-setup.json': JSON.stringify({ teamId, projectId }, null, 2),
      ...skillFiles,
    });
  },
};

export default config;
