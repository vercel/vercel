// Write the App Store Connect API key JSON that rcodesign --api-key-file
// expects. Used by realease-binary.yml.
//
// APPLE_API_KEY may be the JSON itself (GitHub UI / `gh secret set < file.json`)
// or the historical base64-encoded JSON.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function resolveAppleApiKeyJson(raw) {
  const text = (raw ?? '').trim();
  if (!text) {
    throw new Error('APPLE_API_KEY secret is empty or unavailable');
  }

  try {
    JSON.parse(text);
    return text;
  } catch {
    // Historical secret format is base64 of the JSON file.
  }

  let decoded;
  try {
    decoded = Buffer.from(text, 'base64').toString('utf8');
    JSON.parse(decoded);
  } catch {
    throw new Error('APPLE_API_KEY is neither JSON nor base64-encoded JSON');
  }
  return decoded;
}

function main() {
  const dest = process.env.APPLE_API_KEY_PATH ?? '';
  if (!dest) {
    console.error('::error::APPLE_API_KEY_PATH is required');
    process.exit(1);
  }

  try {
    writeFileSync(dest, resolveAppleApiKeyJson(process.env.APPLE_API_KEY));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`::error::${message}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
