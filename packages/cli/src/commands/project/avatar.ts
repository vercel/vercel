import chalk from 'chalk';
import ms from 'ms';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Project } from '@vercel-internals/types';
import type Client from '../../util/client';
import { isAPIError, ProjectNotFound } from '../../util/errors-ts';
import { getCommandName } from '../../util/pkg-name';
import output from '../../output-manager';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import { ProjectAvatarTelemetryClient } from '../../util/telemetry/commands/project/avatar';
import { avatarSubcommand } from './command';

/**
 * Public avatar upload contract (POST /v1/projects/:idOrName/avatar):
 * the request body is the raw image bytes and `Content-Type` declares the
 * format. Keep these in sync with the API's image-processing constants.
 */
const MAX_AVATAR_BYTES = 1024 * 1024;
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/svg+xml',
] as const;

/**
 * Detect one of the API's accepted image content types from the file bytes.
 * Sniffing (rather than trusting the extension) ensures the declared
 * `Content-Type` matches the actual payload the server validates.
 */
function detectContentType(bytes: Buffer): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  const head = bytes.subarray(0, 1024).toString('utf8').trimStart();
  if (
    head.startsWith('<?xml') ||
    head.startsWith('<svg') ||
    /<svg[\s>]/.test(head)
  ) {
    return 'image/svg+xml';
  }
  return null;
}

export default async function avatar(
  client: Client,
  argv: string[]
): Promise<number> {
  const action = argv[0];
  if (action !== 'set') {
    output.error(
      `Unknown action "${action ?? ''}". Usage: ${chalk.cyan(
        getCommandName('project avatar set <project> <file>')
      )}`
    );
    return 1;
  }
  return set(client, argv.slice(1), action);
}

async function set(
  client: Client,
  argv: string[],
  action: string
): Promise<number> {
  const telemetry = new ProjectAvatarTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(avatarSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }
  const { args } = parsedArgs;

  telemetry.trackCliArgumentAction(action);

  if (args.length !== 2) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        getCommandName('project avatar set <project> <file>')
      )}`
    );
    return 1;
  }

  const [projectNameOrId, filePath] = args;
  telemetry.trackCliArgumentProject(projectNameOrId);
  telemetry.trackCliArgumentFile(filePath);

  // Validate the file locally before any remote work.
  const absolutePath = resolve(client.cwd, filePath);

  let size: number;
  try {
    const stats = statSync(absolutePath);
    if (!stats.isFile()) {
      output.error(`Not a file: ${filePath}`);
      return 1;
    }
    size = stats.size;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      output.error(`File not found: ${filePath}`);
      return 1;
    }
    output.error(
      `Cannot read file "${filePath}": ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }

  if (size > MAX_AVATAR_BYTES) {
    output.error(
      `Avatar must be ${MAX_AVATAR_BYTES} bytes or fewer (got ${size}).`
    );
    return 1;
  }

  let bytes: Buffer;
  try {
    bytes = readFileSync(absolutePath);
  } catch (err: unknown) {
    output.error(
      `Cannot read file "${filePath}": ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }

  const contentType = detectContentType(bytes);
  if (!contentType) {
    output.error(
      `Unsupported image type. Avatar must be a PNG, JPEG, or SVG (${ALLOWED_CONTENT_TYPES.join(', ')}).`
    );
    return 1;
  }

  const project = await getProjectByNameOrId(client, projectNameOrId);
  if (project instanceof ProjectNotFound) {
    output.error('No such project exists');
    return 1;
  }

  const start = Date.now();

  let updated: Project;
  try {
    updated = await client.fetch<Project>(
      `/v1/projects/${encodeURIComponent(project.id)}/avatar`,
      {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: bytes,
      }
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      output.error(err.message);
      return 1;
    }
    throw err;
  }

  const elapsed = ms(Date.now() - start);
  output.log(
    `${chalk.cyan('Success!')} Avatar set for project ${chalk.bold(
      updated.name || project.name
    )} ${chalk.gray(`[${elapsed}]`)}`
  );
  return 0;
}
