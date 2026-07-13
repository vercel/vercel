#!/usr/bin/env node
// Regenerates src/util/api-endpoint-policy/public-endpoints.json from the
// public Vercel OpenAPI spec. Run this when an endpoint has been moved to the
// public spec and the API endpoint policy check still reports it as private.
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const OPENAPI_URL = 'https://openapi.vercel.sh/';
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head']);

const outFile = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'util',
  'api-endpoint-policy',
  'public-endpoints.json'
);

const res = await fetch(OPENAPI_URL, {
  headers: { accept: 'application/json' },
});
if (!res.ok) {
  throw new Error(`Failed to fetch ${OPENAPI_URL}: HTTP ${res.status}`);
}
const spec = await res.json();

// Keep in sync with normalizeEndpoint() in
// src/util/api-endpoint-policy/policy.ts
function normalizePath(path) {
  let normalized = path.split('?')[0];
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized
    .split('/')
    .map(segment =>
      segment.startsWith(':') || /^\{.*\}$/.test(segment) ? '{}' : segment
    )
    .join('/');
}

const endpoints = new Set();
for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
  for (const method of Object.keys(pathItem)) {
    if (HTTP_METHODS.has(method)) {
      endpoints.add(`${method.toUpperCase()} ${normalizePath(path)}`);
    }
  }
}

const sorted = Array.from(endpoints).sort();
writeFileSync(
  outFile,
  `${JSON.stringify(
    {
      '//': `Normalized "METHOD /path" operations from the public Vercel OpenAPI spec (${OPENAPI_URL}). Regenerate with: node scripts/update-public-endpoints.mjs`,
      generatedAt: new Date().toISOString().slice(0, 10),
      endpoints: sorted,
    },
    null,
    2
  )}\n`
);
console.log(`Wrote ${sorted.length} public endpoints to ${outFile}`);
