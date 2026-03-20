import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import type Client from '../../util/client';
import { KNOWN_AGENTS } from '@vercel/detect-agent';
import { printError } from '../../util/error';
import output from '../../output-manager';

const BEST_PRACTICES_START = '<!-- VERCEL BEST PRACTICES START -->';
const BEST_PRACTICES_END = '<!-- VERCEL BEST PRACTICES END -->';

const BEST_PRACTICES_BODY = `## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or \`NEXT_PUBLIC_*\`
- Provision Marketplace native integrations with \`vercel integration add\` (CI/agent-friendly)
- Sync env + project settings with \`vercel env pull\` / \`vercel pull\` when you need local/offline parity
- Use \`waitUntil\` for post-response work; avoid the deprecated Function \`context\` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., \`maxDuration\`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via \`@vercel/otel\` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access`;

const BEST_PRACTICES_CONTENT = `${BEST_PRACTICES_START}\n${BEST_PRACTICES_BODY}\n${BEST_PRACTICES_END}\n`;

function getTargetFile(agentName?: string): string {
  if (agentName === KNOWN_AGENTS.CLAUDE) {
    return 'CLAUDE.md';
  }
  return 'AGENTS.md';
}

export default async function agentInit(
  client: Client,
  yes?: boolean
): Promise<number> {
  const targetFile = getTargetFile(client.agentName);
  const filePath = join(client.cwd, targetFile);

  let existing: string | null = null;
  try {
    existing = await readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  const hasMarkers =
    existing !== null &&
    existing.includes(BEST_PRACTICES_START) &&
    existing.includes(BEST_PRACTICES_END);

  const action = hasMarkers
    ? 'update'
    : existing !== null
      ? 'append'
      : 'create';
  const promptMessage = hasMarkers
    ? `We're going to update Vercel best practices in your ${chalk.bold(targetFile)}. Proceed?`
    : `We're going to add Vercel best practices to your ${chalk.bold(targetFile)}. Proceed?`;

  if (!yes && client.stdin.isTTY) {
    const confirmed = await client.input.confirm(promptMessage, true);
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  } else if (!yes && !client.stdin.isTTY) {
    output.error(
      'Missing required flag --yes. Use --yes to skip confirmation, or run interactively in a terminal.'
    );
    return 1;
  }

  output.spinner(`Writing Vercel best practices to ${targetFile}`);

  try {
    if (action === 'update') {
      const startIdx = existing!.indexOf(BEST_PRACTICES_START);
      const endIdx =
        existing!.indexOf(BEST_PRACTICES_END) + BEST_PRACTICES_END.length;
      const trailingNewline = existing![endIdx] === '\n' ? 1 : 0;
      const updated =
        existing!.slice(0, startIdx) +
        BEST_PRACTICES_CONTENT +
        existing!.slice(endIdx + trailingNewline);
      await writeFile(filePath, updated, 'utf-8');
      output.stopSpinner();
      output.success(
        `Updated Vercel best practices in ${chalk.bold(targetFile)}`
      );
    } else if (action === 'append') {
      const separator = existing!.endsWith('\n') ? '\n' : '\n\n';
      await writeFile(
        filePath,
        existing + separator + BEST_PRACTICES_CONTENT,
        'utf-8'
      );
      output.stopSpinner();
      output.success(
        `Appended Vercel best practices to ${chalk.bold(targetFile)}`
      );
    } else {
      await writeFile(filePath, BEST_PRACTICES_CONTENT, 'utf-8');
      output.stopSpinner();
      output.success(
        `Created ${chalk.bold(targetFile)} with Vercel best practices`
      );
    }
  } catch (error) {
    output.stopSpinner();
    printError(error);
    return 1;
  }

  output.log(chalk.dim('Run vercel deploy to ship your project'));

  return 0;
}
