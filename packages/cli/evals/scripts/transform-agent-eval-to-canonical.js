import { Buffer } from 'node:buffer';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MAX_REQUEST_BYTES = 3_500_000;
const MULTIPART_PAYLOAD_OVERHEAD_BYTES = 2048;
const MULTIPART_FILE_OVERHEAD_BYTES = 1024;

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

function parseMaxRequestBytes(value) {
  if (!value) return DEFAULT_MAX_REQUEST_BYTES;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(
      `Invalid --max-request-bytes "${value}". Expected a positive number.`
    );
  }

  return Math.floor(parsed);
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

function getRelativePath(resultsDir, fullPath) {
  return path.relative(resultsDir, fullPath).replace(/\\/g, '/');
}

function isTimestampSegment(segment) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:\.\d+)?Z$/.test(segment);
}

function splitAtTimestamp(relativePath) {
  const segments = relativePath.split('/');
  const timestampIndex = segments.findIndex(isTimestampSegment);
  return { segments, timestampIndex };
}

function normalizeUploadPath(relativePath) {
  const { segments, timestampIndex } = splitAtTimestamp(relativePath);
  if (timestampIndex <= 1) return relativePath;

  const modelSegments = segments.slice(1, timestampIndex);
  if (modelSegments.length <= 1) return relativePath;

  return [
    segments[0],
    modelSegments.join('-'),
    ...segments.slice(timestampIndex),
  ].join('/');
}

function getRunGroup(relativePath) {
  const { segments, timestampIndex } = splitAtTimestamp(relativePath);
  if (timestampIndex === -1) return 'ungrouped';
  return segments.slice(0, timestampIndex + 1).join('/');
}

function getEvalGroup(relativePath) {
  const { segments, timestampIndex } = splitAtTimestamp(relativePath);
  if (timestampIndex === -1) return 'ungrouped';

  const runIndex = segments.findIndex(
    (segment, index) => index > timestampIndex && /^run-\d+$/.test(segment)
  );
  if (runIndex !== -1) {
    return segments.slice(0, runIndex).join('/');
  }

  return segments.slice(0, -1).join('/');
}

function isResultsFile(relativePath) {
  return (
    relativePath.endsWith('/summary.json') ||
    /\/run-\d+\/result\.json$/.test(relativePath)
  );
}

function groupFilesByRun(files, resultsDir) {
  const groups = new Map();

  for (const fullPath of files) {
    const relativePath = getRelativePath(resultsDir, fullPath);
    const group = getRunGroup(relativePath);
    const groupFiles = groups.get(group) ?? [];
    groupFiles.push(fullPath);
    groups.set(group, groupFiles);
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function groupFilesByEval(files, resultsDir) {
  const groups = new Map();

  for (const fullPath of files) {
    const relativePath = getRelativePath(resultsDir, fullPath);
    const group = getEvalGroup(relativePath);
    const groupFiles = groups.get(group) ?? [];
    groupFiles.push(fullPath);
    groups.set(group, groupFiles);
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function estimatePayloadPartBytes(payload) {
  return (
    Buffer.byteLength(JSON.stringify(payload), 'utf8') +
    MULTIPART_PAYLOAD_OVERHEAD_BYTES
  );
}

async function estimateFilePartBytes(resultsDir, fullPath) {
  const relativePath = getRelativePath(resultsDir, fullPath);
  const fileInfo = await stat(fullPath);
  return (
    fileInfo.size +
    Buffer.byteLength(relativePath, 'utf8') +
    MULTIPART_FILE_OVERHEAD_BYTES
  );
}

async function estimateFilesPartBytes(resultsDir, files) {
  let total = 0;
  for (const fullPath of files) {
    total += await estimateFilePartBytes(resultsDir, fullPath);
  }
  return total;
}

async function estimateRequestBytes(payload, resultsDir, files) {
  return (
    estimatePayloadPartBytes(payload) +
    (await estimateFilesPartBytes(resultsDir, files))
  );
}

async function packFilesIntoChunks({
  files,
  resultsDir,
  seedFiles,
  baseBytes,
  maxRequestBytes,
}) {
  const chunks = [];
  let currentChunk = [...seedFiles];
  let currentBytes = baseBytes;

  for (const fullPath of files) {
    const relativePath = getRelativePath(resultsDir, fullPath);
    const fileBytes = await estimateFilePartBytes(resultsDir, fullPath);

    if (baseBytes + fileBytes > maxRequestBytes) {
      const seedNote = seedFiles.length > 0 ? ' plus results files' : '';
      console.warn(
        `Warning: ${relativePath}${seedNote} is approximately ${baseBytes + fileBytes} bytes before multipart framing and exceeds --max-request-bytes=${maxRequestBytes}; uploading it in its own request.`
      );
    }

    if (
      currentChunk.length > seedFiles.length &&
      currentBytes + fileBytes > maxRequestBytes
    ) {
      chunks.push(currentChunk);
      currentChunk = [...seedFiles];
      currentBytes = baseBytes;
    }

    currentChunk.push(fullPath);
    currentBytes += fileBytes;
  }

  if (currentChunk.length > seedFiles.length) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function chunkFilesWithoutResults({
  files,
  resultsDir,
  payload,
  maxRequestBytes,
}) {
  return packFilesIntoChunks({
    files,
    resultsDir,
    seedFiles: [],
    baseBytes: estimatePayloadPartBytes(payload),
    maxRequestBytes,
  });
}

async function chunkEvalFilesByEstimatedRequestSize({
  files,
  resultsDir,
  payload,
  maxRequestBytes,
}) {
  const sortedFiles = [...files].sort((a, b) =>
    getRelativePath(resultsDir, a).localeCompare(getRelativePath(resultsDir, b))
  );
  const resultsFiles = sortedFiles.filter(fullPath =>
    isResultsFile(getRelativePath(resultsDir, fullPath))
  );
  const artifactFiles = sortedFiles.filter(
    fullPath => !isResultsFile(getRelativePath(resultsDir, fullPath))
  );

  if (resultsFiles.length === 0) {
    return chunkFilesWithoutResults({
      files: sortedFiles,
      resultsDir,
      payload,
      maxRequestBytes,
    });
  }

  if (artifactFiles.length === 0) {
    return [resultsFiles];
  }

  const payloadBytes = estimatePayloadPartBytes(payload);
  const resultsBytes = await estimateFilesPartBytes(resultsDir, resultsFiles);
  const baseBytes = payloadBytes + resultsBytes;

  if (baseBytes > maxRequestBytes) {
    const evalGroup = getEvalGroup(
      getRelativePath(resultsDir, resultsFiles[0])
    );
    console.warn(
      `Warning: results files for ${evalGroup} are approximately ${resultsBytes} bytes before multipart framing and exceed --max-request-bytes=${maxRequestBytes}.`
    );
  }

  if (
    (await estimateRequestBytes(payload, resultsDir, sortedFiles)) <=
    maxRequestBytes
  ) {
    return [sortedFiles];
  }

  return packFilesIntoChunks({
    files: artifactFiles,
    resultsDir,
    seedFiles: resultsFiles,
    baseBytes,
    maxRequestBytes,
  });
}

async function chunkRunGroupByEstimatedRequestSize({
  files,
  resultsDir,
  payload,
  maxRequestBytes,
}) {
  if (
    (await estimateRequestBytes(payload, resultsDir, files)) <= maxRequestBytes
  ) {
    return [files];
  }

  const chunks = [];
  const evalGroups = groupFilesByEval(files, resultsDir);

  for (const [_evalGroup, evalFiles] of evalGroups) {
    chunks.push(
      ...(await chunkEvalFilesByEstimatedRequestSize({
        files: evalFiles,
        resultsDir,
        payload,
        maxRequestBytes,
      }))
    );
  }

  return chunks;
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
    const relativePath = getRelativePath(resultsDir, fullPath);
    const uploadPath = normalizeUploadPath(relativePath);
    const buffer = await readFile(fullPath);
    formData.append(
      'results_file',
      new File([buffer], uploadPath, {
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
    const hint =
      response.status === 413
        ? ' Try lowering --max-request-bytes, or use --upload-artifacts results if an individual artifact is too large for the ingest endpoint.'
        : '';
    throw new Error(
      `Batch upload failed: ${response.status} ${responseBody}${hint}`
    );
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
  const maxRequestBytes = parseMaxRequestBytes(
    args['max-request-bytes'] ?? process.env.CLI_EVAL_UPLOAD_MAX_REQUEST_BYTES
  );

  if (!['results', 'all'].includes(uploadArtifacts)) {
    throw new Error(
      `Invalid --upload-artifacts "${uploadArtifacts}". Expected one of: results, all.`
    );
  }

  const filesToUpload = allFiles.filter(fullPath => {
    const relativePath = getRelativePath(resultsDir, fullPath);
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
  let uploadRequestCount = 0;

  for (const [group, files] of fileGroups) {
    const sortedFiles = [...files].sort((a, b) =>
      getRelativePath(resultsDir, a).localeCompare(
        getRelativePath(resultsDir, b)
      )
    );
    const groupPayload = {
      ...payload,
      metadata: {
        ...payload.metadata,
        uploadGroup: group,
      },
    };
    const chunks = await chunkRunGroupByEstimatedRequestSize({
      files: sortedFiles,
      resultsDir,
      payload: groupPayload,
      maxRequestBytes,
    });

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const chunkPayload = {
        ...groupPayload,
        metadata: {
          ...groupPayload.metadata,
          uploadGroupFileCount: sortedFiles.length,
          uploadPart: index + 1,
          uploadParts: chunks.length,
          uploadMaxRequestBytes: maxRequestBytes,
        },
      };
      const responseBody = await uploadFileGroup({
        files: chunk,
        resultsDir,
        payload: chunkPayload,
        ingestUrl,
        headers,
      });
      uploadRequestCount += 1;
      const partLabel =
        chunks.length > 1 ? ` part ${index + 1}/${chunks.length}` : '';
      console.log(
        `Uploaded batch ${args['batch-id']} group ${group}${partLabel} with ${chunk.length}/${sortedFiles.length} file(s): ${responseBody}`
      );
    }
  }

  console.log(
    `Uploaded batch ${args['batch-id']} in ${uploadRequestCount} request(s) across ${fileGroups.length} group(s) with ${filesToUpload.length}/${allFiles.length} file(s).`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

export {
  parseMaxRequestBytes,
  splitAtTimestamp,
  normalizeUploadPath,
  getRunGroup,
  getEvalGroup,
  isResultsFile,
  estimatePayloadPartBytes,
  estimateFilePartBytes,
  estimateFilesPartBytes,
  estimateRequestBytes,
  packFilesIntoChunks,
  chunkFilesWithoutResults,
  chunkEvalFilesByEstimatedRequestSize,
  chunkRunGroupByEstimatedRequestSize,
  groupFilesByRun,
  groupFilesByEval,
};
