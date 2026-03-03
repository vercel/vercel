import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';

const BEST_PRACTICES_CONTENT = `## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Keep \`vercel.json\`/\`vercel.ts\` minimal; rely on framework defaults unless you need an explicit override.
- Use \`vercel dev\` to emulate the Vercel runtime locally (routing, functions, env).
- Sync env + project settings with \`vercel env pull\` / \`vercel pull\` when you need local/offline parity.
- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons).
- Edge Functions (standalone) are deprecated; prefer Vercel Functions (Node.js by default; use Edge only when needed).
- On the Edge runtime, stick to Web APIs (\`fetch\`, \`Request\`, \`Response\`); avoid Node-only modules.
- For streaming (chat/agents), start sending the response quickly (Edge has a 25s "start" window).
- Use \`waitUntil\` for post-response work; avoid the deprecated Function \`context\` parameter.
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips.
- Tune Fluid Compute knobs (e.g., \`maxDuration\`, memory/CPU) for long I/O-heavy calls (LLMs, APIs).
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV).
- Use ISR + caching headers; rely on request collapsing to prevent cache stampedes on revalidation.
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET.
- Use Vercel Blob for uploads/media; choose public vs private stores up-front.
- Use Edge Config for small, globally-read config (feature flags, redirects, IP blocks).
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead.
- Provision Marketplace native integrations with \`vercel integration add\` (CI/agent-friendly).
- Store secrets in Vercel Environment Variables; never in git or \`NEXT_PUBLIC_*\`.
- Enable Deployment Protection for Preview/Prod; treat \`*.vercel.app\` URLs as public by default.
- Add WAF/Firewall + bot protection for public apps; rate-limit sensitive endpoints (often via Redis).
- Add OpenTelemetry via \`@vercel/otel\` on Node; don't expect OTEL support on the Edge runtime.
- Enable Web Analytics + Speed Insights early (Vercel Agent can automate setup via PR).
- Use Rolling Releases for gradual rollouts; keep rollback (\`vercel rollback\`) in your incident playbook.
- Use AI Gateway + AI SDK for model routing, budgets, usage monitoring, and provider failover.
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access.
`;

export default async function agentInit(client: Client): Promise<number> {
  const filePath = join(client.cwd, 'AGENTS.md');

  let existing: string | null = null;
  try {
    existing = await readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist
  }

  if (
    existing !== null &&
    existing.includes('## Best practices for developing on Vercel')
  ) {
    output.log(
      `Vercel best practices already present in ${chalk.bold('AGENTS.md')}`
    );
    return 0;
  }

  if (client.stdin.isTTY) {
    const confirmed = await client.input.confirm(
      `We're going to add Vercel best practices to your ${chalk.bold('AGENTS.md')}. Proceed?`,
      true
    );
    if (!confirmed) {
      output.log('Canceled');
      return 0;
    }
  }

  output.spinner('Writing Vercel best practices to AGENTS.md');

  if (existing !== null) {
    const separator = existing.endsWith('\n') ? '\n' : '\n\n';
    await writeFile(
      filePath,
      existing + separator + BEST_PRACTICES_CONTENT,
      'utf-8'
    );
    output.stopSpinner();
    output.success(
      `Appended Vercel best practices to ${chalk.bold('AGENTS.md')}`
    );
  } else {
    await writeFile(filePath, BEST_PRACTICES_CONTENT, 'utf-8');
    output.stopSpinner();
    output.success(
      `Created ${chalk.bold('AGENTS.md')} with Vercel best practices`
    );
  }

  output.log(chalk.dim('Run vercel deploy to ship your project'));

  return 0;
}
