import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../client';

/**
 * The redirect URI Connect replays to OAuth providers for connectors
 */
export const CONNEX_REDIRECT_URI = 'https://connect.vercel.com/callback';

/**
 * A product or surface a service exposes vended at the service level
 * and referenced by slug from each method.
 */
export interface ConnexServiceTarget {
  target: string;
  label: string;
  description?: string;
  docsUrl?: string;
}

/**
 * A `{placeholder}` value the caller supplies and the server substitutes into
 * the method's endpoints. Server owns validation.
 */
export interface ConnexTemplateField {
  key: string;
  label: string;
  placeholder?: string;
  help?: string;
  default?: string;
}

/**
 * The subset of the vended `ConnexServiceTypeInfo` the CLI reads.
 */
export interface ConnexMethodTypeInfo {
  type: string;
  createInputSchema?: Record<string, unknown>;
  /** Already resolved server-side. Don't prompt for these keys. */
  createInputDefaults?: Record<string, unknown>;
  encryptedFields?: string[];
}

/**
 * Connection method a service offers
 */
export interface ConnexConnectionMethod {
  connectionMethod: string;
  type: ConnexMethodTypeInfo;
  targets?: string[];
  label: string;
  description?: string;
  docUrl?: string;
  settingsUrl?: string;
  instructions?: string;
  templateFields?: ConnexTemplateField[];
  /**
   * Create paths the API derived at response time. `managed` is absent when
   * it isn't knowable; `manual` is false when the driver declares BYO
   * credentials non-viable.
   */
  create: {
    managed?: boolean;
    manual: boolean;
  };
}

/** The parts of `GET /v1/connect/services/:service?schemas=true` the CLI reads. */
export interface ConnexServiceInfo {
  name?: string;
  types?: Array<{
    type?: string;
    createInputSchema?: Record<string, unknown>;
  }>;
  targets?: ConnexServiceTarget[];
  connectionMethods?: ConnexConnectionMethod[];
}

/** A user-facing failure in method/target/param resolution. */
export class ConnexMethodError extends Error {}

/** The method the user picked, plus the target it resolved to. */
export interface ConnexMethodSelection {
  method: ConnexConnectionMethod;
  target?: string;
}

/**
 * Keys the create endpoints reject on the method path: they identify the
 * OAuth endpoints, which the registry owns. Mirrors `ENDPOINT_IDENTITY_KEYS`
 * in api-connex.
 */
const ENDPOINT_IDENTITY_KEYS = new Set([
  'serverConfig',
  'serverUrl',
  'discoveryServerUrl',
]);

/** Fallback masking rule when a type vends no `encryptedFields`. */
const SECRET_KEY_PATTERN =
  /secret|password|passwd|token|api[-_]?key|private[-_]?key|credential/i;

/** Aligns a chooser entry's body lines under its title, past the `> ` cursor. */
const CHOICE_INDENT = '  ';

/**
 * Fetches service info from the registry
 */
export async function fetchConnexServiceInfo(
  client: Client,
  service: string,
  opts: { useCurrentTeam?: boolean } = {}
): Promise<ConnexServiceInfo | undefined> {
  try {
    return await client.fetch<ConnexServiceInfo>(
      `/v1/connect/services/${encodeURIComponent(service)}?schemas=true`,
      opts
    );
  } catch (err) {
    if ((err as { status?: number }).status === 404) {
      return undefined;
    }
    throw err;
  }
}

/**
 * Parses repeatable `--param KEY=VALUE` flags.
 */
export function parseConnexParams(values: string[] | undefined): {
  params: Record<string, string>;
  warnings: string[];
} {
  const params: Record<string, string> = {};
  const warnings: string[] = [];

  for (const raw of values ?? []) {
    const separator = raw.indexOf('=');
    if (separator <= 0) {
      throw new ConnexMethodError(
        `Invalid --param "${raw}". Use --param KEY=VALUE.`
      );
    }
    const key = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1);
    if (!key) {
      throw new ConnexMethodError(
        `Invalid --param "${raw}". Use --param KEY=VALUE.`
      );
    }
    if (key in params) {
      warnings.push(
        `--param ${key} was passed more than once. Using the last value.`
      );
    }
    params[key] = value;
  }

  return { params, warnings };
}

/** `oauth (OAuth 2.0), mcp (MCP)` - for enumerating valid slugs in errors. */
export function formatMethodOptions(
  methods: readonly ConnexConnectionMethod[]
): string {
  return methods
    .map(method => `${method.connectionMethod} (${method.label})`)
    .join(', ');
}

/** `api (Notion API), mcp (Notion MCP)` - for enumerating valid targets. */
export function formatTargetOptions(
  targets: readonly ConnexServiceTarget[]
): string {
  return targets.map(target => `${target.target} (${target.label})`).join(', ');
}

/**
 * How the connector gets created, as a chooser suffix.
 */
export function createPathBadge(
  method: ConnexConnectionMethod
): string | undefined {
  if (method.create.managed === true) {
    return 'automatic registration';
  }
  if (method.create.manual) {
    return 'bring your own credentials';
  }
  return undefined;
}

/**
 * The single target a method serves, when it serves exactly one.
 */
export function soleTargetOf(
  method: ConnexConnectionMethod
): string | undefined {
  return method.targets?.length === 1 ? method.targets[0] : undefined;
}

/**
 * Minimal terminal rendering of the markdown the registry authors, which uses
 * only links and bold.
 */
export function renderConnexMarkdown(markdown: string): string {
  return markdown
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_match, text: string, url: string) =>
        linksToSameTarget(text, url)
          ? output.link(text, url, { fallback: () => chalk.cyan(url) })
          : output.link(text, url)
    )
    .replace(/\*\*([^*]+)\*\*/g, (_match, text: string) => chalk.bold(text));
}

/**
 * The same markdown as plain text
 */
export function connexMarkdownToPlainText(markdown: string): string {
  return markdown
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      (_match, text: string, url: string) =>
        linksToSameTarget(text, url) ? url : `${text} (${url})`
    )
    .replace(/\*\*([^*]+)\*\*/g, '$1');
}

/** Whether a link's text is just its own URL written without the scheme. */
function linksToSameTarget(text: string, url: string): boolean {
  const normalize = (value: string) =>
    value
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  return normalize(text) === normalize(url);
}

/**
 * Setup guidance shown before credential prompts
 */
export function buildMethodGuidance(
  method: ConnexConnectionMethod,
  serviceName: string
): string[] {
  const lines: string[] = [];

  if (method.type.type !== 'api-key') {
    const registerUrl = method.settingsUrl ?? method.docUrl;
    lines.push(
      registerUrl
        ? `Register an OAuth app for ${serviceName} at ${chalk.cyan(registerUrl)} and copy its Client ID and Client Secret.`
        : `Register an OAuth app for ${serviceName} and copy its Client ID and Client Secret.`
    );
    lines.push(
      `Add ${chalk.cyan(CONNEX_REDIRECT_URI)} as a redirect URI in that app.`
    );
    if (method.docUrl && method.docUrl !== registerUrl) {
      lines.push(`Docs: ${chalk.cyan(method.docUrl)}`);
    }
  }

  if (method.instructions) {
    lines.push(renderConnexMarkdown(method.instructions));
  }

  return lines;
}

/**
 * Whether a create-input key should be masked while the user types it.
 */
export function isSecretInputKey(
  method: ConnexConnectionMethod,
  key: string
): boolean {
  const encrypted = method.type.encryptedFields;
  if (encrypted && encrypted.length > 0) {
    return encrypted.includes(key);
  }
  return SECRET_KEY_PATTERN.test(key);
}

/**
 * Whether the CLI must prompt for a create-input key: not already supplied
 * via `--data`, not pre-filled by the method's `createInputDefaults`, and not
 * an endpoint-identity key.
 */
export function needsCredentialPrompt(
  method: ConnexConnectionMethod,
  key: string,
  suppliedData: Record<string, unknown> | undefined
): boolean {
  if (ENDPOINT_IDENTITY_KEYS.has(key)) {
    return false;
  }
  if (suppliedData && key in suppliedData) {
    return false;
  }
  const defaults = method.type.createInputDefaults;
  if (defaults && key in defaults) {
    return false;
  }
  return true;
}

/**
 * What a non-interactive caller has to put in `--data`, per driver.
 * Just mentioning client id/secret and api key for description purposes.
 */
export function describeCredentialFields(
  method: ConnexConnectionMethod
): string | undefined {
  if (method.type.type === 'oauth') {
    return 'clientId (required), clientSecret';
  }
  if (method.type.type === 'api-key') {
    return 'values: [{ "value": "<api key>" }]';
  }
  return undefined;
}

/**
 * Collects the credentials the create POST needs, per driver.
 */
export async function collectMethodCredentials(
  client: Client,
  method: ConnexConnectionMethod,
  suppliedData: Record<string, unknown> | undefined,
  interactive: boolean,
  /** Runs once, immediately before the first prompt. Never if none happens. */
  onFirstPrompt?: () => void
): Promise<Record<string, unknown>> {
  const data: Record<string, unknown> = { ...suppliedData };
  let announced = false;
  const announce = () => {
    if (!announced) {
      announced = true;
      onFirstPrompt?.();
    }
  };

  if (method.type.type === 'oauth') {
    if (needsCredentialPrompt(method, 'clientId', suppliedData)) {
      if (!interactive) {
        throw missingCredentialsError(method);
      }
      announce();
      data.clientId = await promptCredential(client, method, {
        key: 'clientId',
        message: 'Client ID',
        required: true,
      });
    }
    if (
      interactive &&
      needsCredentialPrompt(method, 'clientSecret', suppliedData)
    ) {
      // Optional in the schema: public/PKCE clients legitimately have none.
      announce();
      const secret = await promptCredential(client, method, {
        key: 'clientSecret',
        message: `Client Secret ${chalk.dim('leave blank for a public client')}`,
        required: false,
      });
      if (secret) {
        data.clientSecret = secret;
      }
    }
    return data;
  }

  if (method.type.type === 'api-key') {
    if (data.values === undefined) {
      if (!interactive) {
        throw missingCredentialsError(method);
      }
      announce();
      const value = await promptCredential(client, method, {
        key: 'value',
        message: method.label,
        required: true,
      });
      data.values = [{ value }];
    }
    return data;
  }

  if (suppliedData === undefined) {
    const schema = method.type.createInputSchema;
    const hint = schema
      ? `\n\nExpected --data schema for connection method "${method.connectionMethod}":\n${JSON.stringify(schema, null, 2)}`
      : '';
    throw new ConnexMethodError(
      `Connection method "${method.connectionMethod}" needs credentials passed with --data. Pass --data @<path> to read from a file.${hint}`
    );
  }

  return data;
}

/**
 * Prompts for one create-input value, masked when the type declares the key
 * encrypted.
 */
async function promptCredential(
  client: Client,
  method: ConnexConnectionMethod,
  opts: { key: string; message: string; required: boolean }
): Promise<string> {
  const validate = opts.required
    ? (value: string) => value.trim().length > 0 || `${opts.key} is required.`
    : undefined;

  const answer = isSecretInputKey(method, opts.key)
    ? await client.input.password({
        message: opts.message,
        mask: true,
        validate,
      })
    : await client.input.text({ message: opts.message, validate });

  return answer.trim();
}

function missingCredentialsError(
  method: ConnexConnectionMethod
): ConnexMethodError {
  const fields = describeCredentialFields(method);
  const withFields = fields ? ` with: ${fields}` : '';
  return new ConnexMethodError(
    `Missing credentials. Provide --data${withFields}. Pass --data @<path> to read from a file.`
  );
}

/**
 * Resolves which connection method (and target) to create with.
 */
export async function resolveConnexConnectionMethod(
  client: Client,
  opts: {
    service: string;
    serviceName: string;
    methods: ConnexConnectionMethod[];
    targets?: ConnexServiceTarget[];
    connectionMethodFlag?: string;
    targetFlag?: string;
    interactive: boolean;
    skipConfirm: boolean;
  }
): Promise<ConnexMethodSelection> {
  const { methods, targets, connectionMethodFlag, targetFlag } = opts;

  if (methods.length === 0) {
    throw new ConnexMethodError(
      `"${opts.service}" doesn't publish connection methods.`
    );
  }

  const explicitTarget = targetFlag
    ? validateTarget(targetFlag, targets, opts.service)
    : undefined;

  if (connectionMethodFlag) {
    const method = methods.find(
      candidate => candidate.connectionMethod === connectionMethodFlag
    );
    if (!method) {
      throw new ConnexMethodError(
        `Unknown connection method "${connectionMethodFlag}" for "${opts.service}". Available: ${formatMethodOptions(methods)}.`
      );
    }
    if (explicitTarget && !servesTarget(method, explicitTarget)) {
      throw new ConnexMethodError(
        `Connection method "${method.connectionMethod}" doesn't connect to target "${explicitTarget}".`
      );
    }
    return {
      method,
      target: explicitTarget ?? soleTargetOf(method),
    };
  }

  const width = choiceWidth(client);

  let chosenTarget = explicitTarget;
  if (!chosenTarget && targets && targets.length > 1 && opts.interactive) {
    printOptionCatalog(
      `${opts.serviceName} products:`,
      targets.map(target => ({
        label: target.label,
        description: target.description,
        docsUrl: target.docsUrl,
      })),
      width
    );
    chosenTarget = await client.input.select<string>({
      message: 'What do you want to connect to?',
      choices: targets.map(target => ({
        name: choiceLabel(target.label, width),
        value: target.target,
      })),
    });
  }

  const candidates = chosenTarget
    ? methods.filter(method => servesTarget(method, chosenTarget))
    : methods;

  if (candidates.length === 0) {
    throw new ConnexMethodError(
      `No connection method for "${opts.service}" connects to target "${chosenTarget}".`
    );
  }

  if (candidates.length > 1) {
    if (!opts.interactive) {
      throw new ConnexMethodError(
        `Missing --connection-method. "${opts.service}" supports: ${formatMethodOptions(candidates)}. Re-run with --connection-method <value>.`
      );
    }
    printOptionCatalog(
      `Connection methods for ${opts.serviceName}:`,
      candidates.map(method => ({
        label: method.label,
        badge: createPathBadge(method),
        description: method.description,
        docsUrl: method.docUrl,
      })),
      width
    );
    const slug = await client.input.select<string>({
      message: `How do you want to connect to ${opts.serviceName}?`,
      choices: candidates.map(method => ({
        name: choiceLabel(method.label, width),
        value: method.connectionMethod,
      })),
    });
    const method = candidates.find(
      candidate => candidate.connectionMethod === slug
    );
    /* c8 ignore next 3 -- the select can only return a listed value */
    if (!method) {
      throw new ConnexMethodError(`Unknown connection method "${slug}".`);
    }
    return { method, target: chosenTarget ?? soleTargetOf(method) };
  }

  const method = candidates[0];
  const target = chosenTarget ?? soleTargetOf(method);

  if (opts.interactive && !opts.skipConfirm) {
    // The service offers one way in, so there is nothing to choose — but the
    // user should still see what they're about to create before it happens.
    const badge = createPathBadge(method);
    const suffix = badge ? ` (${badge})` : '';
    const confirmed = await client.input.confirm(
      `Connect to ${opts.serviceName} with ${method.label}${suffix}?`,
      true
    );
    if (!confirmed) {
      throw new ConnexMethodError('Canceled.');
    }
  }

  return { method, target };
}

/**
 * Collects `templateFields` values. Blank input falls back to the field's
 * default; a field without one is re-prompted. Values already supplied via
 * `--param` are not prompted for.
 */
export async function collectTemplateParams(
  client: Client,
  method: ConnexConnectionMethod,
  suppliedParams: Record<string, string>,
  interactive: boolean
): Promise<Record<string, string>> {
  const fields = method.templateFields ?? [];
  if (fields.length === 0) {
    if (Object.keys(suppliedParams).length > 0) {
      throw new ConnexMethodError(
        `Connection method "${method.connectionMethod}" takes no --param values.`
      );
    }
    return {};
  }

  const known = new Set(fields.map(field => field.key));
  for (const key of Object.keys(suppliedParams)) {
    if (!known.has(key)) {
      throw new ConnexMethodError(
        `Unknown --param "${key}" for connection method "${method.connectionMethod}". Valid keys: ${fields.map(field => field.key).join(', ')}.`
      );
    }
  }

  const params: Record<string, string> = {};
  for (const field of fields) {
    const supplied = (suppliedParams[field.key] ?? '').trim();
    if (supplied) {
      const problem = templateValueProblem(field, supplied);
      if (problem) {
        throw new ConnexMethodError(
          `Invalid --param ${field.key}="${supplied}". ${problem}`
        );
      }
      params[field.key] = supplied;
      continue;
    }

    if (interactive) {
      // `@inquirer/input` applies `default` before `validate`, so a field
      // with a default always passes on an empty Enter.
      const answer = await client.input.text({
        message: promptMessage(field),
        default: field.default,
        validate: (value: string) => {
          const trimmed = value.trim();
          if (!trimmed) {
            return `${field.label} is required.`;
          }
          return templateValueProblem(field, trimmed) ?? true;
        },
      });
      params[field.key] = answer.trim();
      continue;
    }

    if (field.default !== undefined) {
      params[field.key] = field.default;
      continue;
    }

    throw new ConnexMethodError(
      `Missing --param ${field.key}=<value> (${describeField(field)}) for connection method "${method.connectionMethod}".`
    );
  }

  return params;
}

function promptMessage(field: ConnexTemplateField): string {
  const hints: string[] = [];
  if (field.placeholder) {
    hints.push(`e.g. ${field.placeholder}`);
  }
  if (field.help) {
    hints.push(field.help);
  }
  return hints.length > 0
    ? `${field.label} ${chalk.dim(hints.join(' · '))}`
    : field.label;
}

function describeField(field: ConnexTemplateField): string {
  return field.placeholder
    ? `"${field.label}", e.g. ${field.placeholder}`
    : `"${field.label}"`;
}

/** One hostname label: alphanumerics with inner hyphens. */
const HOSTNAME_RE =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

/**
 * Why a template value can't work, when that is knowable from vended data
 * alone.
 */
function templateValueProblem(
  field: ConnexTemplateField,
  value: string
): string | undefined {
  const sample = field.default ?? field.placeholder;
  // Only fields whose own sample is a bare dotted host get checked, so an
  // opaque id (`default`) or a full URL sample is left alone.
  if (!sample || !HOSTNAME_RE.test(sample) || HOSTNAME_RE.test(value)) {
    return undefined;
  }
  return `Enter a hostname like ${sample}, without the https:// prefix.`;
}

/** One row of the catalog printed above a chooser. */
interface ConnexCatalogEntry {
  label: string;
  badge?: string;
  description?: string;
  docsUrl?: string;
}

/**
 * Prints options above the prompt so every entry shows its own description,
 * not just the highlighted one. Choice names must stay single-line:
 * pagination positions items by index but lays them out by line.
 */
function printOptionCatalog(
  heading: string,
  entries: ConnexCatalogEntry[],
  width: number
): void {
  if (!entries.some(entry => entry.description || entry.docsUrl)) {
    return;
  }

  output.print(`\n  ${chalk.dim(heading)}\n\n`);
  for (const entry of entries) {
    const badge = entry.badge ? chalk.dim(` — ${entry.badge}`) : '';
    output.print(`    ${chalk.bold(entry.label)}${badge}\n`);
    if (entry.description) {
      for (const line of wrapPlain(entry.description, width - 6)) {
        output.print(`      ${chalk.dim(line)}\n`);
      }
    }
    if (entry.docsUrl) {
      output.print(`      ${chalk.dim(`Docs: ${entry.docsUrl}`)}\n`);
    }
    output.print('\n');
  }
}

/**
 * A chooser line. Single-line by construction — see {@link printOptionCatalog}
 * for why — and truncated so an unusually long label can never wrap into the
 * pagination bug it would otherwise trigger.
 */
function choiceLabel(label: string, width: number): string {
  const max = Math.max(24, width - CHOICE_INDENT.length - 1);
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function choiceWidth(client: Client): number {
  return Math.max(40, Math.min(client.stderr.columns || 80, 100));
}

/**
 * Greedy word wrap. Runs before any styling is applied, so it never has to
 * reason about ANSI width.
 */
export function wrapPlain(text: string, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    if (!line) {
      line = word;
    } else if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) {
    lines.push(line);
  }

  return lines;
}

function servesTarget(method: ConnexConnectionMethod, target: string): boolean {
  // A method with no `targets` predates target-aware services and serves
  // whatever the service offers.
  return method.targets === undefined || method.targets.includes(target);
}

function validateTarget(
  target: string,
  targets: ConnexServiceTarget[] | undefined,
  service: string
): string {
  if (!targets || targets.length === 0) {
    throw new ConnexMethodError(
      `"${service}" doesn't publish targets, so --target can't be used.`
    );
  }
  if (!targets.some(candidate => candidate.target === target)) {
    throw new ConnexMethodError(
      `Unknown target "${target}". Available: ${formatTargetOptions(targets)}.`
    );
  }
  return target;
}
