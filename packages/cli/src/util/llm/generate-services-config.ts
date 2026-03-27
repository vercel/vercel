import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { VercelConfig } from '../dev/types';
import type { InferredServicesResult } from '@vercel/fs-detectors';
import type { DetectPlatformConfigsResult } from '@vercel/fs-detectors';
import {
  validateConfig,
  serviceConfigSchema,
  experimentalServicesSchema,
} from '../validate-config';
import output from '../../output-manager';

interface GenerateVercelConfigOptions {
  existingConfig: VercelConfig | null;
  inferredServices: InferredServicesResult;
  platformConfigs: DetectPlatformConfigsResult;
  cwd: string;
}

function buildPrompt(opts: GenerateVercelConfigOptions): string {
  const parts: string[] = [];

  parts.push(
    `You are a Vercel configuration expert. Generate a valid vercel.json configuration based on the detected project structure.`
  );

  parts.push(`\n## Existing vercel.json\n`);
  if (opts.existingConfig && Object.keys(opts.existingConfig).length > 0) {
    parts.push(
      '```json\n' + JSON.stringify(opts.existingConfig, null, 2) + '\n```'
    );
  } else {
    parts.push('No existing configuration.');
  }

  parts.push(`\n## Detected Services (from project layout)\n`);
  parts.push(
    '```json\n' +
      JSON.stringify(opts.inferredServices.config, null, 2) +
      '\n```'
  );
  parts.push(`\nDetected ${opts.inferredServices.services.length} services:`);
  for (const svc of opts.inferredServices.services) {
    parts.push(
      `- "${svc.name}" (type: ${svc.type}, workspace: ${svc.workspace})`
    );
  }

  if (opts.platformConfigs.configs.length > 0) {
    parts.push(`\n## Detected Platform Configuration Files\n`);
    for (const config of opts.platformConfigs.configs) {
      parts.push(`### ${config.displayName}\n`);
      for (const file of config.files) {
        parts.push(`**${file.filename}:**`);
        parts.push('```\n' + file.content + '\n```');
      }
    }
  }

  parts.push(`\n## experimentalServices Schema\n`);
  parts.push(
    'The `experimentalServices` field is a map of service name to config:'
  );
  parts.push(
    '```json\n' + JSON.stringify(experimentalServicesSchema, null, 2) + '\n```'
  );
  parts.push('\nEach service config supports these properties:');
  parts.push(
    '```json\n' + JSON.stringify(serviceConfigSchema, null, 2) + '\n```'
  );

  parts.push(`\n## Rules\n`);
  parts.push(
    '- Service names must match: ^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$'
  );
  parts.push(
    '- Service types: "web" (HTTP), "cron" (scheduled), "worker" (topic-based)'
  );
  parts.push(
    '- `experimentalServices` CANNOT coexist with `builds` or `functions`'
  );
  parts.push(
    '- Use the detected services as a starting point, enriched with info from platform config files'
  );
  parts.push(
    '- Preserve any existing vercel.json settings that are compatible (routes, rewrites, headers, etc.)'
  );

  parts.push(`\n## Output\n`);
  parts.push(
    'Return ONLY valid JSON for the complete vercel.json. No markdown fences, no explanation, no comments. Just the JSON object.'
  );

  return parts.join('\n');
}

function extractJSON(text: string): string {
  // Try to extract JSON from the response, handling markdown fences
  let cleaned = text.trim();

  // Remove markdown code fences if present
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  return cleaned;
}

/**
 * Use an LLM to generate a vercel.json configuration based on detected
 * services and platform configs.
 *
 * Returns the generated VercelConfig, or null if the LLM call fails
 * (missing API key, invalid output, network error, etc.).
 */
export async function generateVercelConfig(
  opts: GenerateVercelConfigOptions
): Promise<VercelConfig | null> {
  const prompt = buildPrompt(opts);

  try {
    const { createAgentSession, SessionManager } = await import(
      '@mariozechner/pi-coding-agent'
    );

    const { session } = await createAgentSession({
      tools: [],
      sessionManager: SessionManager.inMemory(),
    });

    try {
      let responseText = '';

      session.subscribe((event: { type: string; [key: string]: unknown }) => {
        if (event.type === 'message_update') {
          const evt = event as {
            type: 'message_update';
            assistantMessageEvent: { type: string; delta?: string };
          };
          if (evt.assistantMessageEvent.type === 'text_delta') {
            responseText += evt.assistantMessageEvent.delta ?? '';
          }
        }
      });

      await session.prompt(prompt);

      // Parse and validate
      const result = parseAndValidate(responseText, opts.existingConfig);
      if (result) {
        return result;
      }

      // Retry once with the validation error
      output.debug(
        'LLM config generation: first attempt failed validation, retrying...'
      );
      responseText = '';
      await session.prompt(
        'The JSON you returned was invalid. Please try again. Return ONLY valid JSON for the complete vercel.json object, with no markdown fences or explanation.'
      );

      return parseAndValidate(responseText, opts.existingConfig);
    } finally {
      session.dispose();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    output.debug(`LLM config generation failed: ${msg}`);
    return null;
  }
}

function parseAndValidate(
  responseText: string,
  existingConfig: VercelConfig | null
): VercelConfig | null {
  try {
    const jsonStr = extractJSON(responseText);
    const parsed = JSON.parse(jsonStr) as VercelConfig;

    const validationError = validateConfig(parsed);
    if (validationError) {
      output.debug(`LLM config validation error: ${validationError.message}`);
      return null;
    }

    return parsed;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    output.debug(`LLM config parse error: ${msg}`);
    return null;
  }
}

/**
 * Write a complete vercel.json config to disk.
 */
export async function writeVercelConfig(
  cwd: string,
  config: VercelConfig
): Promise<void> {
  const configPath = join(cwd, 'vercel.json');
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}
