import { loadEnvConfig } from '@next/env';
import { base64url, EncryptJWT, jwtDecrypt } from 'jose';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { overrideSubcommand } from './command';

export default async function override(
  client: Client,
  argv: string[]
): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(overrideSubcommand.options);
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const decryptToken = flags['--decrypt'] as string | undefined;

  if (decryptToken) {
    return handleDecrypt(client, decryptToken);
  }

  return handleEncrypt(client, args, flags);
}

async function handleEncrypt(
  client: Client,
  args: string[],
  flags: Record<string, unknown>
): Promise<number> {
  const expiration = (flags['--expiration'] as string | undefined) ?? '1y';

  if (args.length === 0) {
    output.error(
      'Please provide at least one flag override as flag=value.\n' +
        'Example: vercel flags override my-flag=true'
    );
    return 1;
  }

  const overrides: Record<string, unknown> = {};
  for (const arg of args) {
    const eqIndex = arg.indexOf('=');
    if (eqIndex === -1) {
      output.error(`Invalid override format: "${arg}". Expected flag=value.`);
      return 1;
    }
    const key = arg.slice(0, eqIndex);
    const rawValue = arg.slice(eqIndex + 1);
    overrides[key] = parseValue(rawValue);
  }

  const secret = resolveSecret(client);
  if (!secret) {
    output.error(
      'FLAGS_SECRET not found. Set it in the environment, .env.local, or .env file.'
    );
    return 1;
  }

  try {
    const encrypted = await encryptOverrides(overrides, secret, expiration);
    client.stdout.write(encrypted + '\n');
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}

async function handleDecrypt(client: Client, token: string): Promise<number> {
  const secret = resolveSecret(client);
  if (!secret) {
    output.error(
      'FLAGS_SECRET not found. Set it in the environment, .env.local, or .env file.'
    );
    return 1;
  }

  try {
    const overrides = await decryptOverrides(token, secret);
    if (overrides === undefined) {
      output.error('Invalid token: not a valid flag overrides token.');
      return 1;
    }
    client.stdout.write(JSON.stringify(overrides, null, 2) + '\n');
    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== '') return num;
  return raw;
}

function resolveSecret(client: Client): string | undefined {
  const { combinedEnv } = loadEnvConfig(client.cwd, true);
  return combinedEnv.FLAGS_SECRET;
}

async function encryptOverrides(
  overrides: Record<string, unknown>,
  secret: string,
  expirationTime: string
): Promise<string> {
  const encodedSecret = base64url.decode(secret);
  if (encodedSecret.length !== 32) {
    throw new Error(
      'Invalid FLAGS_SECRET: must be a 256-bit base64url-encoded key (32 bytes).'
    );
  }
  return new EncryptJWT({ o: overrides, pur: 'overrides' })
    .setExpirationTime(expirationTime)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .encrypt(encodedSecret);
}

async function decryptOverrides(
  encryptedData: string,
  secret: string
): Promise<Record<string, unknown> | undefined> {
  const encodedSecret = base64url.decode(secret);
  if (encodedSecret.length !== 32) {
    throw new Error(
      'Invalid FLAGS_SECRET: must be a 256-bit base64url-encoded key (32 bytes).'
    );
  }
  const { payload } = await jwtDecrypt(encryptedData, encodedSecret);
  if (payload.pur !== 'overrides' || !payload.o) {
    return undefined;
  }
  return payload.o as Record<string, unknown>;
}
