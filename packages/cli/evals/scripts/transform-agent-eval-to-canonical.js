import { readdir, readFile, stat } from 'node:fs/promises';
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

async function directoryExists(dir) {
  try {
    return (await stat(dir)).isDirectory();
  } catch (error) {
    if (error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function collectModelValues(value, models = new Set(), seen = new Set()) {
  if (value === null || value === undefined) return models;

  if (typeof value !== 'object') return models;
  if (seen.has(value)) return models;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      collectModelValues(item, models, seen);
    }
    return models;
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (key === 'model' && typeof entryValue === 'string' && entryValue) {
      models.add(entryValue);
    }
    collectModelValues(entryValue, models, seen);
  }

  return models;
}

async function collectRunMetadata(files) {
  const configuredModels = new Set();
  const resolvedModels = new Set();
  const agents = new Set();

  for (const fullPath of files) {
    if (
      !fullPath.endsWith('transcript.json') &&
      !fullPath.endsWith('result.json')
    ) {
      continue;
    }

    let data;
    try {
      data = JSON.parse(await readFile(fullPath, 'utf8'));
    } catch (_error) {
      continue;
    }

    if (typeof data.agent === 'string' && data.agent) {
      agents.add(data.agent);
    }

    if (typeof data.model === 'string' && data.model) {
      configuredModels.add(data.model);
    }

    if (fullPath.endsWith('transcript.json')) {
      for (const model of collectModelValues(data)) {
        if (typeof model === 'string' && model) {
          resolvedModels.add(model);
        }
      }
    }
  }

  for (const model of configuredModels) {
    resolvedModels.delete(model);
  }

  return {
    agents: [...agents],
    configuredModels: [...configuredModels],
    resolvedModels: [...resolvedModels],
  };
}
function contentTypeFor(relativePath) {
  if (relativePath.endsWith('.json')) return 'application/json';
  if (relativePath.endsWith('.md')) return 'text/markdown';
  if (relativePath.endsWith('.jsonl')) return 'application/x-ndjson';
  if (relativePath.endsWith('.zip')) return 'application/zip';
  if (relativePath.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

function shouldUploadFile(relativePath, uploadArtifacts) {
  if (uploadArtifacts === 'results') {
    return (
      relativePath.endsWith('/summary.json') ||
      /\/run-\d+\/result\.json$/.test(relativePath)
    );
  }

  return true;
}

function isTimestampSegment(segment) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:\.\d+)?Z$/.test(segment);
}

function getRunGroup(relativePath) {
  const segments = relativePath.split('/');
  const timestampIndex = segments.findIndex(isTimestampSegment);
  if (timestampIndex === -1) return 'ungrouped';
  return segments.slice(0, timestampIndex + 1).join('/');
}

function groupFilesByRun(files, resultsDir) {
  const groups = new Map();

  for (const fullPath of files) {
    const relativePath = path
      .relative(resultsDir, fullPath)
      .replace(/\\/g, '/');
    const group = getRunGroup(relativePath);
    const groupFiles = groups.get(group) ?? [];
    groupFiles.push(fullPath);
    groups.set(group, groupFiles);
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

async function uploadFileGroup({
  files,
  resultsDir,
  payload,
  ingestUrl,
  headers,
}) {
  const formData = new FormData();
  formData.append('payload', JSON.stringify(payload));

  for (const fullPath of files) {
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

  const response = await fetch(ingestUrl, {
    method: 'POST',
    headers,
    body: formData,
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Batch upload failed: ${response.status} ${responseBody}`);
  }

  return responseBody;
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
  if (!(await directoryExists(resultsDir))) {
    console.log(
      `Results directory does not exist; nothing to upload: ${resultsDir}`
    );
    return;
  }

  const topLevelDirs = await listDirectories(resultsDir);
  if (topLevelDirs.length === 0) {
    console.log('Results directory is empty; nothing to upload.');
    return;
  }

  const allFiles = await listFilesRecursively(resultsDir);
  if (allFiles.length === 0) {
    console.log('No files in results directory; nothing to upload.');
    return;
  }

  const runMetadata = await collectRunMetadata(allFiles);
  const uploadArtifacts = args['upload-artifacts'] ?? 'all';

  if (!['results', 'all'].includes(uploadArtifacts)) {
    throw new Error(
      `Invalid --upload-artifacts "${uploadArtifacts}". Expected one of: results, all.`
    );
  }

  const filesToUpload = allFiles.filter(fullPath => {
    const relativePath = path
      .relative(resultsDir, fullPath)
      .replace(/\\/g, '/');
    return shouldUploadFile(relativePath, uploadArtifacts);
  });

  if (filesToUpload.length === 0) {
    console.log(
      'No result files found in results directory; nothing to upload.'
    );
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
    metadata: {
      agentEval: runMetadata,
    },
  };

  const headers = {
    Authorization: `Bearer ${args.token}`,
  };
  if (bypassSecret && (bypassVia === 'header' || bypassVia === 'both')) {
    headers['x-vercel-protection-bypass'] = bypassSecret;
  }

  const fileGroups = groupFilesByRun(filesToUpload, resultsDir);

  for (const [group, files] of fileGroups) {
    const groupPayload = {
      ...payload,
      metadata: {
        ...payload.metadata,
        uploadGroup: group,
      },
    };
    const responseBody = await uploadFileGroup({
      files,
      resultsDir,
      payload: groupPayload,
      ingestUrl,
      headers,
    });
    console.log(
      `Uploaded batch ${args['batch-id']} group ${group} with ${files.length} file(s): ${responseBody}`
    );
  }

  console.log(
    `Uploaded batch ${args['batch-id']} in ${fileGroups.length} request(s) with ${filesToUpload.length}/${allFiles.length} file(s).`
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
