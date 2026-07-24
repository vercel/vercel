/**
 * Generates a .changeset file via Vercel AI Gateway when CI requires one.
 * Requires: AI_GATEWAY_API_KEY, GITHUB_REPOSITORY, PR_TITLE, PR_BODY (optional)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const gatewayUrl =
  process.env.AI_GATEWAY_BASE_URL || 'https://ai-gateway.vercel.sh/v1';
const model = process.env.CHANGESET_AI_MODEL || 'openai/gpt-5.4';

function getChangedPackageNames() {
  const out = execSync('git diff --name-only origin/main...HEAD', {
    encoding: 'utf8',
    cwd: repoRoot,
  }).trim();
  if (!out) return [];
  const names = new Set();
  for (const file of out.split('\n').filter(Boolean)) {
    let dir = path.dirname(path.join(repoRoot, file));
    while (dir.startsWith(repoRoot)) {
      const pkgJson = path.join(dir, 'package.json');
      if (fs.existsSync(pkgJson)) {
        try {
          const { name } = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
          if (name && typeof name === 'string') names.add(name);
        } catch {
          /* ignore */
        }
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return [...names].sort();
}

function extractMarkdown(text) {
  const fence = /```(?:markdown)?\s*([\s\S]*?)```/;
  const m = text.match(fence);
  return (m ? m[1] : text).trim();
}

async function main() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    console.error('AI_GATEWAY_API_KEY is not set');
    process.exit(1);
  }

  const packages = getChangedPackageNames();
  const title = process.env.PR_TITLE || '';
  const body = process.env.PR_BODY || '';
  const diffStat = execSync('git diff --stat origin/main...HEAD', {
    encoding: 'utf8',
    cwd: repoRoot,
    maxBuffer: 10 * 1024 * 1024,
  });

  const prompt = `You write @changesets/cli compatible changelog entries for the Vercel monorepo.

Changed workspace package names (npm package names, use exactly as given):
${packages.length ? packages.map(p => `- ${p}`).join('\n') : '- (infer from diff if none listed; use vercel for packages/cli only changes)'}

PR title: ${title}

PR description (truncated):
${body.slice(0, 8000)}

Diff stat (truncated):
${diffStat.slice(0, 12000)}

Rules:
1. Output ONLY the contents of a single new file — no preamble.
2. Use this exact shape (YAML frontmatter + summary line(s)):
---
'package-name': patch
---
Concise imperative summary of user-visible change (one line or short paragraph).
3. Use patch unless the PR clearly warrants minor/major.
4. Quote keys that contain special characters (e.g. '@vercel/foo': patch).
5. Include every changed workspace package that needs versioning; omit tooling-only paths if no package changed.
6. If only repo-level files changed, you may use "vercel": patch for the CLI package when appropriate.

Generate the changeset file now.`;

  const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('AI Gateway error:', res.status, errText);
    process.exit(1);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') {
    console.error('Unexpected AI response:', JSON.stringify(data).slice(0, 2000));
    process.exit(1);
  }

  const markdown = extractMarkdown(text);
  if (!markdown.startsWith('---')) {
    console.error('Model did not return valid frontmatter:', markdown.slice(0, 500));
    process.exit(1);
  }

  const outDir = path.join(repoRoot, '.changeset');
  fs.mkdirSync(outDir, { recursive: true });
  const pr = process.env.PR_NUMBER || 'manual';
  const fileName = path.join(outDir, `ci-ai-${pr}-${Date.now()}.md`);
  fs.writeFileSync(fileName, `${markdown}\n`, 'utf8');
  console.log('Wrote', path.relative(repoRoot, fileName));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
