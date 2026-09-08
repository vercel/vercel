import { packageName } from '../../util/pkg-name';
import {
  formatOption,
  jsonOption,
  limitOption,
  projectOption,
  yesOption,
} from '../../util/arg-common';
import { KMS_ALGORITHMS } from '../../util/kms/types';

/**
 * The list cursor is an opaque base64url token, so this cannot reuse the
 * shared `nextOption`, which is a millisecond timestamp.
 */
const cursorOption = {
  name: 'next',
  shorthand: null,
  type: String,
  argument: 'CURSOR',
  deprecated: false,
  description:
    'Show the next page of results, using a cursor from a prior page',
} as const;

const algorithmOption = {
  name: 'algorithm',
  shorthand: 'a',
  type: String,
  argument: 'ALGORITHM',
  deprecated: false,
  description: `Signing algorithm: ${KMS_ALGORITHMS.join(', ')} (default: RS512)`,
} as const;

/**
 * On import the algorithm has to agree with the key material, so it is derived
 * from the key when only one algorithm fits — every RSA algorithm fits an RSA
 * key, so those need it stated.
 */
const importAlgorithmOption = {
  name: 'algorithm',
  shorthand: 'a',
  type: String,
  argument: 'ALGORITHM',
  deprecated: false,
  description: `Signing algorithm: ${KMS_ALGORITHMS.join(', ')} (required for RSA keys, otherwise derived from the key)`,
} as const;

const nameOption = {
  name: 'name',
  shorthand: null,
  type: String,
  argument: 'NAME',
  deprecated: false,
  description: 'New name for the issuer',
} as const;

const claimsSchemaOption = {
  name: 'claims-schema',
  shorthand: null,
  type: String,
  argument: 'JSON',
  deprecated: false,
  description:
    'JSON Schema validating token claims, as inline JSON, `@<file>`, or `@-` for stdin',
} as const;

const removeClaimsSchemaOption = {
  name: 'remove-claims-schema',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description: 'Remove the claims schema, so claims are no longer validated',
} as const;

const tokenClaimsOption = {
  name: 'token-claims',
  shorthand: null,
  type: String,
  argument: 'JSON',
  deprecated: false,
  description:
    'Claims to include in tokens signed for this grant, as inline JSON, `@<file>`, or `@-` for stdin',
} as const;

const removeTokenClaimsOption = {
  name: 'remove-token-claims',
  shorthand: null,
  type: Boolean,
  deprecated: false,
  description: 'Remove the token claims from the grant',
} as const;

const grantProjectOption = {
  ...projectOption,
  shorthand: 'p',
} as const;

const environmentOption = {
  name: 'environment',
  shorthand: 'e',
  type: [String],
  argument: 'ENV',
  deprecated: false,
  description:
    'Environment the grant applies to: a system environment (production, preview, development) or a custom environment ID (env_…). Repeatable',
} as const;

const keyOption = {
  name: 'key',
  shorthand: 'k',
  type: String,
  argument: 'FILE',
  deprecated: false,
  description:
    'Path to the PEM private key to import, or `-` to read it from stdin',
} as const;

const keyIdOption = {
  name: 'key-id',
  shorthand: null,
  type: String,
  argument: 'KID',
  deprecated: false,
  description: 'JWKS `kid` for the imported key (default: server-generated)',
} as const;

const revokePreviousAfterHoursOption = {
  name: 'revoke-previous-after-hours',
  shorthand: null,
  type: Number,
  argument: 'HOURS',
  deprecated: false,
  description:
    'Hours the previous key keeps verifying after activation (default: 1)',
} as const;

const activationOption = {
  name: 'activation',
  shorthand: null,
  type: String,
  argument: 'MODE',
  deprecated: false,
  description:
    'When the key starts signing: automatic or manual (default: automatic)',
} as const;

/**
 * `--yes` carries a per-command description so help says what is being skipped.
 */
function skipConfirmationOption(action: string) {
  return {
    ...yesOption,
    description: `Skip the confirmation prompt when ${action}`,
  } as const;
}

export const listSubcommand = {
  name: 'list',
  aliases: ['ls'],
  description: 'Show all KMS issuers',
  default: true,
  arguments: [],
  options: [formatOption, jsonOption, limitOption, cursorOption],
  examples: [
    {
      name: 'List issuers as JSON',
      value: `${packageName} kms ls --format json`,
    },
  ],
} as const;

export const inspectSubcommand = {
  name: 'inspect',
  aliases: ['get'],
  description: 'Show an issuer with its signing keys and grants',
  arguments: [
    {
      name: 'issuerId',
      required: true,
    },
  ],
  options: [formatOption, jsonOption],
  examples: [
    {
      name: 'Inspect an issuer',
      value: `${packageName} kms inspect iss_1a2b3c4d`,
    },
  ],
} as const;

export const addSubcommand = {
  name: 'add',
  aliases: ['create'],
  description: 'Create an issuer with a Vercel-generated signing key',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [algorithmOption, claimsSchemaOption, formatOption, jsonOption],
  examples: [
    {
      name: 'Create an issuer that signs with ES256',
      value: `${packageName} kms add my-issuer --algorithm ES256`,
    },
  ],
} as const;

export const importSubcommand = {
  name: 'import',
  aliases: [],
  description: 'Create an issuer from a private key you already have',
  arguments: [
    {
      name: 'name',
      required: true,
    },
  ],
  options: [
    keyOption,
    keyIdOption,
    importAlgorithmOption,
    claimsSchemaOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Import an EC private key, whose algorithm is derived from the key',
      value: `${packageName} kms import my-issuer --key ./private-key.pem`,
    },
    {
      name: 'Import an RSA private key from stdin',
      value: `cat private-key.pem | ${packageName} kms import my-issuer --key - --algorithm RS256`,
    },
  ],
} as const;

export const updateSubcommand = {
  name: 'update',
  aliases: [],
  description: 'Rename an issuer or change its claims schema',
  arguments: [
    {
      name: 'issuerId',
      required: true,
    },
  ],
  options: [
    nameOption,
    claimsSchemaOption,
    removeClaimsSchemaOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Rename an issuer',
      value: `${packageName} kms update iss_1a2b3c4d --name billing-tokens`,
    },
    {
      name: 'Replace the claims schema from a file',
      value: `${packageName} kms update iss_1a2b3c4d --claims-schema @claims-schema.json`,
    },
  ],
} as const;

export const removeSubcommand = {
  name: 'remove',
  aliases: ['rm', 'delete'],
  description: 'Delete an issuer and all of its keys',
  arguments: [
    {
      name: 'issuerId',
      required: true,
    },
  ],
  options: [skipConfirmationOption('deleting an issuer')],
  examples: [
    {
      name: 'Delete an issuer',
      value: `${packageName} kms rm iss_1a2b3c4d`,
    },
  ],
} as const;

export const addKeySubcommand = {
  name: 'add-key',
  aliases: [],
  description: 'Add a Vercel-generated signing key to an issuer',
  arguments: [
    {
      name: 'issuerId',
      required: true,
    },
  ],
  options: [
    activationOption,
    revokePreviousAfterHoursOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Rotate to a new key, retiring the previous one after 24 hours',
      value: `${packageName} kms add-key iss_1a2b3c4d --revoke-previous-after-hours 24`,
    },
    {
      name: 'Stage a key without activating it',
      value: `${packageName} kms add-key iss_1a2b3c4d --activation manual`,
    },
  ],
} as const;

export const importKeySubcommand = {
  name: 'import-key',
  aliases: [],
  description: 'Add a signing key you already have to an imported issuer',
  arguments: [
    {
      name: 'issuerId',
      required: true,
    },
  ],
  options: [
    keyOption,
    keyIdOption,
    activationOption,
    revokePreviousAfterHoursOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Rotate an imported issuer to a new private key',
      value: `${packageName} kms import-key iss_1a2b3c4d --key ./private-key.pem`,
    },
  ],
} as const;

export const activateKeySubcommand = {
  name: 'activate-key',
  aliases: [],
  description: 'Start signing with a staged key',
  arguments: [
    {
      name: 'issuerId',
      required: true,
    },
    {
      name: 'keyId',
      required: true,
    },
  ],
  options: [revokePreviousAfterHoursOption, formatOption, jsonOption],
  examples: [
    {
      name: 'Activate a key',
      value: `${packageName} kms activate-key iss_1a2b3c4d key_5e6f7g8h`,
    },
  ],
} as const;

export const revokeKeySubcommand = {
  name: 'revoke-key',
  aliases: [],
  description: 'End a scheduled revocation now, so a key stops verifying',
  arguments: [
    {
      name: 'issuerId',
      required: true,
    },
    {
      name: 'keyId',
      required: true,
    },
  ],
  options: [skipConfirmationOption('revoking a key')],
  examples: [
    {
      name: 'Revoke a key that is already scheduled for revocation',
      value: `${packageName} kms revoke-key iss_1a2b3c4d key_5e6f7g8h`,
    },
  ],
} as const;

export const addGrantSubcommand = {
  name: 'add-grant',
  aliases: [],
  description: 'Grant a project permission to sign with an issuer',
  arguments: [
    {
      name: 'issuerId',
      required: true,
    },
  ],
  options: [
    grantProjectOption,
    environmentOption,
    tokenClaimsOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Grant a project signing access in Production and Preview',
      value: `${packageName} kms add-grant iss_1a2b3c4d --project prj_9i8h7g6f --environment production --environment preview`,
    },
    {
      name: 'Grant a project signing access in a custom environment',
      value: `${packageName} kms add-grant iss_1a2b3c4d --project prj_9i8h7g6f --environment env_1a2b3c4d`,
    },
  ],
} as const;

export const updateGrantSubcommand = {
  name: 'update-grant',
  aliases: [],
  description: "Change a project grant's environments or token claims",
  arguments: [
    {
      name: 'issuerId',
      required: true,
    },
    {
      name: 'projectId',
      required: true,
    },
  ],
  options: [
    environmentOption,
    tokenClaimsOption,
    removeTokenClaimsOption,
    formatOption,
    jsonOption,
  ],
  examples: [
    {
      name: 'Restrict a grant to Production',
      value: `${packageName} kms update-grant iss_1a2b3c4d prj_9i8h7g6f --environment production`,
    },
  ],
} as const;

export const removeGrantSubcommand = {
  name: 'remove-grant',
  aliases: ['rm-grant', 'delete-grant'],
  description: "Revoke a project's permission to sign with an issuer",
  arguments: [
    {
      name: 'issuerId',
      required: true,
    },
    {
      name: 'projectId',
      required: true,
    },
  ],
  options: [skipConfirmationOption('removing a grant')],
  examples: [
    {
      name: 'Remove a project grant',
      value: `${packageName} kms rm-grant iss_1a2b3c4d prj_9i8h7g6f`,
    },
  ],
} as const;

export const kmsCommand = {
  name: 'kms',
  aliases: [],
  description: 'Manage KMS issuers, signing keys, and project grants',
  arguments: [],
  subcommands: [
    listSubcommand,
    inspectSubcommand,
    addSubcommand,
    importSubcommand,
    updateSubcommand,
    removeSubcommand,
    addKeySubcommand,
    importKeySubcommand,
    activateKeySubcommand,
    revokeKeySubcommand,
    addGrantSubcommand,
    updateGrantSubcommand,
    removeGrantSubcommand,
  ],
  options: [],
  examples: [],
} as const;
