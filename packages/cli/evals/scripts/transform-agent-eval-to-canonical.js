import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[key.slice(2)] = 'true';
      continue;
    }
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

function appendBypassQuery(url, bypassSecret) {
  const parsed = new URL(url);
  if (!parsed.searchParams.has('x-vercel-protection-bypass')) {
    parsed.searchParams.set('x-vercel-protection-bypass', bypassSecret);
  }
  return parsed.toString();
}

async function listDirectories(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter(item => item.isDirectory()).map(item => item.name);
}

async function listFilesRecursively(rootDir) {
  const files = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files;
}

function contentTypeFor(relativePath) {
  if (relativePath.endsWith('.json')) return 'application/json';
  if (relativePath.endsWith('.md')) return 'text/markdown';
  if (relativePath.endsWith('.jsonl')) return 'application/x-ndjson';
  if (relativePath.endsWith('.zip')) return 'application/zip';
  if (relativePath.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = [
    'results-dir',
    'product',
    'repo',
    'branch',
    'commit-sha',
    'run-type',
    'runner',
    'batch-id',
    'ingest-url',
    'token',
  ];

  for (const key of required) {
    if (!args[key]) {
      throw new Error(`Missing required argument --${key}`);
    }
  }

  const bypassSecret =
    args['protection-bypass-secret'] ||
    process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const bypassVia = args['bypass-via'] || 'header';

  if (!['header', 'query', 'both'].includes(bypassVia)) {
    throw new Error(
      `Invalid --bypass-via "${bypassVia}". Expected one of: header, query, both.`
    );
  }

  let ingestUrl = args['ingest-url'];
  if (bypassSecret && (bypassVia === 'query' || bypassVia === 'both')) {
    ingestUrl = appendBypassQuery(ingestUrl, bypassSecret);
  }

  const resultsDir = path.resolve(args['results-dir']);
  const topLevelDirs = await listDirectories(resultsDir);
  if (topLevelDirs.length === 0) {
    // eslint-disable-next-line no-console
    console.log('Results directory is empty; nothing to upload.');
    return;
  }

  const allFiles = await listFilesRecursively(resultsDir);
  if (allFiles.length === 0) {
    // eslint-disable-next-line no-console
    console.log('No files in results directory; nothing to upload.');
    return;
  }

  const payload = {
    format: 'agent-eval-folder',
    batchId: args['batch-id'],
    batchLabel: args['batch-label'] ?? args['batch-id'],
    product: args.product,
    repo: args.repo,
    branch: args.branch,
    commitSha: args['commit-sha'],
    benchmarkGroup: 'agent-eval',
    runType: args['run-type'],
    runner: args.runner,
    harnessVersion: args['harness-version'] ?? 'agent-eval',
    appVersion: args['app-version'],
    finishedAt: new Date().toISOString(),
    tags: ['agent-eval', 'ci'],
  };

  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));
  for (const fullPath of allFiles) {
    const relativePath = path
      .relative(resultsDir, fullPath)
      .replace(/\\/g, '/');
    const buffer = await readFile(fullPath);
    formData.append(
      'results_file',
      new File([buffer], relativePath, {
        type: contentTypeFor(relativePath),
      })
    );
  }

  const headers = {
    Authorization: `Bearer ${args.token}`,
  };
  if (bypassSecret && (bypassVia === 'header' || bypassVia === 'both')) {
    headers['x-vercel-protection-bypass'] = bypassSecret;
  }

  const response = await fetch(ingestUrl, {
    method: 'POST',
    headers,
    body: formData,
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Batch upload failed: ${response.status} ${responseBody}`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `Uploaded batch ${args['batch-id']} with ${allFiles.length} file(s): ${responseBody}`
  );
}

main().catch(error => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
