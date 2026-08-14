import { join } from 'path';
import fs from 'fs';
import execa from 'execa';
import {
  debug,
  NowBuildError,
  readConfigFile,
  sanitizeConsumerName,
  type DevQueueSubscription,
  type TriggerEvent,
} from '@vercel/build-utils';
import {
  getModuleEntrypointName,
  parseModuleEntrypoint,
  resolveExistingEntrypoint,
  safePathSegment,
} from './module-entrypoint';
import type { UvRunner } from './uv';
import type { QueueIntegration } from './conditional-vendoring';

// Shared by the vercel-queue and legacy vercel-workers integrations.
// Consumer names are derived from output paths, so deployments must keep
// producing the same `_py_subscribers/...`-based names to retain their
// queue consumer-group positions.
const SUBSCRIBER_OUTPUT_DIR = '_py_subscribers';

type SubscriberTriggerDefaults = Omit<
  TriggerEvent,
  'type' | 'topic' | 'consumer'
>;

export interface LegacySubscriberConfig {
  topics: string[];
  triggerDefaults: SubscriberTriggerDefaults;
}

export interface SubscriberDeclaration {
  name: string;
  entrypoint: string;
  moduleName: string;
  variableName: string;
  topicPatterns?: string[];
  /** Present iff parsed under the legacy vercel-workers schema. */
  legacy?: LegacySubscriberConfig;
}

export interface SubscriberSubscription {
  topic: string;
  consumer: string;
  triggerDefaults: SubscriberTriggerDefaults;
}

export interface Subscriber extends SubscriberDeclaration {
  subscriptions: SubscriberSubscription[];
}

interface RawSubscriber {
  entrypoint?: unknown;
  topics?: unknown;
}

interface RawLegacySubscriber {
  entrypoint?: unknown;
  topics?: unknown;
  max_deliveries?: unknown;
  retry_after_seconds?: unknown;
  initial_delay_seconds?: unknown;
  max_concurrency?: unknown;
}

interface RawQueueSubscription {
  topic?: unknown;
  consumer_group?: unknown;
  retry_after_seconds?: unknown;
  initial_delay_seconds?: unknown;
  max_concurrency?: unknown;
  max_attempts?: unknown;
}

interface TriggerNumberField {
  field: keyof RawQueueSubscription;
  output: keyof SubscriberTriggerDefaults;
  isValid: (value: number) => boolean;
  expected: string;
}

const TRIGGER_NUMBER_FIELDS = [
  {
    field: 'max_attempts',
    output: 'maxDeliveries',
    isValid: (value: number) => Number.isInteger(value) && value >= 1,
    expected: 'an integer greater than or equal to 1',
  },
  {
    field: 'retry_after_seconds',
    output: 'retryAfterSeconds',
    isValid: (value: number) => value > 0,
    expected: 'greater than 0',
  },
  {
    field: 'initial_delay_seconds',
    output: 'initialDelaySeconds',
    isValid: (value: number) => value >= 0,
    expected: 'greater than or equal to 0',
  },
  {
    field: 'max_concurrency',
    output: 'maxConcurrency',
    isValid: (value: number) => Number.isInteger(value) && value >= 1,
    expected: 'an integer greater than or equal to 1',
  },
] satisfies TriggerNumberField[];

const SUBSCRIBER_FIELD_NAMES = new Set(['entrypoint', 'topics']);

interface LegacyTriggerNumberField {
  field: keyof RawLegacySubscriber;
  output: keyof SubscriberTriggerDefaults;
  isValid: (value: number) => boolean;
  expected: string;
}

const LEGACY_TRIGGER_NUMBER_FIELDS = [
  {
    field: 'max_deliveries',
    output: 'maxDeliveries',
    isValid: (value: number) => Number.isInteger(value) && value >= 1,
    expected: 'an integer greater than or equal to 1',
  },
  {
    field: 'retry_after_seconds',
    output: 'retryAfterSeconds',
    isValid: (value: number) => value > 0,
    expected: 'greater than 0',
  },
  {
    field: 'initial_delay_seconds',
    output: 'initialDelaySeconds',
    isValid: (value: number) => value >= 0,
    expected: 'greater than or equal to 0',
  },
  {
    field: 'max_concurrency',
    output: 'maxConcurrency',
    isValid: (value: number) => Number.isInteger(value) && value >= 1,
    expected: 'an integer greater than or equal to 1',
  },
] satisfies LegacyTriggerNumberField[];

const LEGACY_SUBSCRIBER_FIELD_NAMES = new Set([
  'entrypoint',
  'topics',
  ...LEGACY_TRIGGER_NUMBER_FIELDS.map(({ field }) => field),
]);

interface Pyproject {
  tool?: {
    vercel?: {
      subscribers?: RawSubscriber[];
    };
  };
}

export function getSubscriberOutputPath(subscriberName: string): string {
  return `${SUBSCRIBER_OUTPUT_DIR}/${safePathSegment(subscriberName)}`;
}

export function getSubscriberConsumerName(subscriberName: string): string {
  return sanitizeConsumerName(getSubscriberOutputPath(subscriberName));
}

/**
 * Path of the generated handler module that serves an output path's queue
 * subscriptions through `vercel.queue.asgi_app()`.
 */
export function getGeneratedQueueHandlerPath(outputPath: string): string {
  return `_vc_queue_handlers/${outputPath.replace(/[^A-Za-z0-9_]+/g, '_')}.py`;
}

export function generatedPythonPathToModule(filePath: string): string {
  return filePath
    .replace(/\.py$/, '')
    .split(/[\\/]+/)
    .join('.');
}

export async function getPyprojectSubscribers(
  workPath: string,
  { legacySchema = false }: { legacySchema?: boolean } = {}
): Promise<SubscriberDeclaration[]> {
  const pyprojectPath = join(workPath, 'pyproject.toml');
  if (!fs.existsSync(pyprojectPath)) {
    return [];
  }

  const pyproject = await readConfigFile<Pyproject>(pyprojectPath);
  const subscribers = pyproject?.tool?.vercel?.subscribers;
  if (!subscribers) {
    return [];
  }
  if (!Array.isArray(subscribers)) {
    throw subscriberError('"tool.vercel.subscribers" must be an array');
  }

  const parsedSubscribers = await Promise.all(
    subscribers.map((config, index) =>
      legacySchema
        ? parseLegacySubscriber(workPath, index, config)
        : parseSubscriber(workPath, index, config)
    )
  );

  const seenNames = new Set<string>();
  for (const subscriber of parsedSubscribers) {
    if (seenNames.has(subscriber.name)) {
      throw subscriberError(
        `subscriber "${subscriber.name}" is declared more than once`
      );
    }
    seenNames.add(subscriber.name);
  }

  return parsedSubscribers;
}

export async function resolveQueueSubscribers({
  declarations,
  uv,
  venvPath,
  projectDir,
  kind = 'subscriber',
  integrations = [],
}: {
  declarations: SubscriberDeclaration[];
  uv: UvRunner;
  venvPath: string;
  projectDir: string;
  kind?: 'subscriber' | 'workflow';
  integrations?: QueueIntegration[];
}): Promise<Subscriber[]> {
  const result: Subscriber[] = [];

  for (const declaration of declarations) {
    const introspected = await introspectQueueSubscriptions({
      declaration,
      uv,
      venvPath,
      projectDir,
      kind,
      integrations,
    });
    const hint =
      kind === 'workflow'
        ? '; ensure the entrypoint instantiates vercel.workflow.Workflows'
        : '';
    const unmatchedTopicPatterns = getUnmatchedQueueTopicPatterns(
      declaration,
      introspected
    );
    if (unmatchedTopicPatterns.length > 0) {
      const introspectedTopics = introspected.map(({ topic }) => topic);
      throw subscriberError(
        `${kind} "${declaration.name}" declared topics [${unmatchedTopicPatterns.join(
          ', '
        )}] but no introspected queue subscriptions matched them; introspected topics [${introspectedTopics.join(
          ', '
        )}]${hint}`
      );
    }
    const subscriptions = filterQueueSubscriptions(declaration, introspected);
    if (subscriptions.length === 0) {
      const declared = declaration.topicPatterns?.join(', ') ?? '*';
      throw subscriberError(
        `${kind} "${declaration.name}" declared topics [${declared}] but no introspected queue subscriptions matched${hint}`
      );
    }
    result.push({ ...declaration, subscriptions });
  }

  return result;
}

export function filterQueueSubscriptions(
  declaration: SubscriberDeclaration,
  subscriptions: SubscriberSubscription[]
): SubscriberSubscription[] {
  if (!declaration.topicPatterns) {
    return subscriptions;
  }
  return subscriptions.filter(subscription =>
    declaration.topicPatterns!.some(pattern =>
      queueTopicPatternsOverlap(pattern, subscription.topic)
    )
  );
}

function getUnmatchedQueueTopicPatterns(
  declaration: SubscriberDeclaration,
  subscriptions: SubscriberSubscription[]
): string[] {
  return (declaration.topicPatterns ?? []).filter(
    pattern =>
      !subscriptions.some(subscription =>
        queueTopicPatternsOverlap(pattern, subscription.topic)
      )
  );
}

export function queueTopicPatternsOverlap(
  left: string,
  right: string
): boolean {
  if (left === '*' || right === '*') {
    return true;
  }
  const leftPrefix = getQueueWildcardPrefix(left);
  const rightPrefix = getQueueWildcardPrefix(right);
  if (leftPrefix === undefined && rightPrefix === undefined) {
    return left === right;
  }
  if (leftPrefix !== undefined && rightPrefix !== undefined) {
    return (
      leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix)
    );
  }
  if (leftPrefix !== undefined) {
    return right.startsWith(leftPrefix);
  }
  return left.startsWith(rightPrefix!);
}

/**
 * Python lines that activate the queue adapter integrations required by
 * the project's dependencies. The adapter packages have no import-time
 * side effects, so nothing else activates them. Activation runs after
 * the subscriber module is imported: each installer retroactively
 * registers subscriptions for apps the import created. And because the
 * project demonstrably depends on the upstream package, a failed import
 * or install is a hard error rather than something to skip.
 */
function createIntegrationInstallLines(
  integrations: QueueIntegration[],
  { serving }: { serving: boolean }
): string[] {
  return integrations.flatMap(({ module, installer, servingActivator }) => [
    `from ${module} import ${installer}`,
    `${installer}()`,
    // Queue-serving processes must also activate consumption (register
    // push callbacks, start the adapter's embedded worker); introspection
    // and publish-only processes must not.
    ...(serving && servingActivator
      ? [`from ${module} import ${servingActivator}`, `${servingActivator}()`]
      : []),
  ]);
}

export function createQueueHandlerModule(
  declaration: SubscriberDeclaration,
  integrations: QueueIntegration[]
): string {
  return [
    'import importlib',
    'import vercel.queue',
    '',
    `importlib.import_module(${JSON.stringify(declaration.moduleName)})`,
    ...createIntegrationInstallLines(integrations, { serving: true }),
    'app = vercel.queue.asgi_app()',
    '',
  ].join('\n');
}

async function parseSubscriberEntrypoint(
  workPath: string,
  label: string,
  entrypointValue: unknown
): Promise<Omit<SubscriberDeclaration, 'topicPatterns' | 'legacy'>> {
  if (typeof entrypointValue !== 'string') {
    throw subscriberError(`${label} must define string field "entrypoint"`);
  }

  const entrypoint = parseModuleEntrypoint(entrypointValue);
  if (!entrypoint) {
    throw subscriberError(
      `${label} has invalid entrypoint "${entrypointValue}". Use "module:object"`
    );
  }
  const name = getModuleEntrypointName(entrypoint);
  const existingEntrypoint = await resolveExistingEntrypoint(
    workPath,
    entrypoint.filePath
  );
  if (!existingEntrypoint) {
    throw subscriberError(
      `subscriber "${name}" has entrypoint "${entrypointValue}" but file "${entrypoint.filePath}" does not exist`
    );
  }

  return {
    name,
    entrypoint: existingEntrypoint,
    moduleName: entrypoint.moduleName,
    variableName: entrypoint.variableName,
  };
}

async function parseSubscriber(
  workPath: string,
  index: number,
  config: RawSubscriber
): Promise<SubscriberDeclaration> {
  const label = `subscriber #${index + 1}`;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw subscriberError(`${label} must be an object`);
  }

  for (const key of Object.keys(config)) {
    if (!SUBSCRIBER_FIELD_NAMES.has(key)) {
      throw subscriberError(`${label} has unrecognized field "${key}"`);
    }
  }

  const base = await parseSubscriberEntrypoint(
    workPath,
    label,
    config.entrypoint
  );
  return {
    ...base,
    topicPatterns: parseTopicPatterns(base.name, config.topics),
  };
}

async function parseLegacySubscriber(
  workPath: string,
  index: number,
  config: RawLegacySubscriber
): Promise<SubscriberDeclaration> {
  const label = `subscriber #${index + 1}`;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw subscriberError(`${label} must be an object`);
  }

  for (const key of Object.keys(config)) {
    if (!LEGACY_SUBSCRIBER_FIELD_NAMES.has(key)) {
      throw subscriberError(`${label} has unrecognized field "${key}"`);
    }
  }

  const base = await parseSubscriberEntrypoint(
    workPath,
    label,
    config.entrypoint
  );
  return {
    ...base,
    legacy: {
      topics: parseLegacyTopics(base.name, config.topics),
      triggerDefaults: parseLegacyTriggerDefaults(base.name, config),
    },
  };
}

function parseLegacyTopics(name: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw subscriberError(
      `subscriber "${name}" must define non-empty array field "topics"`
    );
  }
  for (const topic of value) {
    if (typeof topic !== 'string' || topic.length === 0) {
      throw subscriberError(
        `subscriber "${name}" field "topics" must contain only non-empty strings`
      );
    }
  }
  return value;
}

function parseLegacyTriggerDefaults(
  subscriber: string,
  config: RawLegacySubscriber
): SubscriberTriggerDefaults {
  const defaults: SubscriberTriggerDefaults = {};

  for (const {
    field,
    output,
    isValid,
    expected,
  } of LEGACY_TRIGGER_NUMBER_FIELDS) {
    const value = config[field];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'number' || !isValid(value)) {
      throw subscriberError(
        `subscriber "${subscriber}" field "${field}" must be ${expected}`
      );
    }
    defaults[output] = value;
  }

  return defaults;
}

function parseTopicPatterns(
  name: string,
  value: unknown
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw subscriberError(
      `subscriber "${name}" field "topics" must be a non-empty array when provided`
    );
  }
  for (const topic of value) {
    if (typeof topic !== 'string' || topic.length === 0) {
      throw subscriberError(
        `subscriber "${name}" field "topics" must contain only non-empty strings`
      );
    }
  }
  return value;
}

/**
 * Python script that imports a subscriber module and dumps the registered
 * queue subscriptions as JSON. Subscription objects carry a live `func`
 * callable and are not JSON serializable, so extract the trigger metadata
 * explicitly. None values are dropped rather than emitted as JSON null.
 */
function createQueueIntrospectionScript(
  moduleName: string,
  integrations: QueueIntegration[]
): string {
  return [
    'import importlib, json, sys',
    `importlib.import_module(${JSON.stringify(moduleName)})`,
    ...createIntegrationInstallLines(integrations, { serving: false }),
    'from vercel.queue import get_subscriptions',
    'subs = [',
    '    {k: v for k, v in {',
    "        'topic': s.topic,",
    "        'consumer_group': s.consumer_group,",
    "        'max_attempts': getattr(s, 'max_attempts', None),",
    "        'retry_after_seconds': getattr(s, 'retry_after_seconds', None),",
    "        'initial_delay_seconds': getattr(s, 'initial_delay_seconds', None),",
    "        'max_concurrency': getattr(s, 'max_concurrency', None),",
    '    }.items() if v is not None}',
    '    for s in get_subscriptions()',
    ']',
    'json.dump(subs, sys.stdout)',
  ].join('\n');
}

async function introspectQueueSubscriptions({
  declaration,
  uv,
  venvPath,
  projectDir,
  kind,
  integrations,
}: {
  declaration: SubscriberDeclaration;
  uv: UvRunner;
  venvPath: string;
  projectDir: string;
  kind: 'subscriber' | 'workflow';
  integrations: QueueIntegration[];
}): Promise<SubscriberSubscription[]> {
  const script = createQueueIntrospectionScript(
    declaration.moduleName,
    integrations
  );

  try {
    const { stdout } = await uv.run({
      venvPath,
      projectDir,
      args: ['python', '-c', script],
      // Deployed functions always run with VERCEL=1, VERCEL_REGION, and
      // VERCEL_DEPLOYMENT_ID, and SDKs rely on them at import time
      // (vercel-celery only registers `vercel://` auto-transport queues on
      // Vercel; queue client construction requires a region;
      // vercel.workflow selects its hosted world by the deployment id), so
      // introspection must see the same markers regardless of the build
      // host's own environment.
      env: {
        VERCEL: '1',
        VERCEL_REGION: process.env.VERCEL_REGION || 'iad1',
        VERCEL_DEPLOYMENT_ID:
          process.env.VERCEL_DEPLOYMENT_ID || 'dpl_introspection',
      },
    });
    return parseIntrospectedSubscriptions(kind, declaration.name, stdout);
  } catch (err) {
    if (err instanceof NowBuildError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw subscriberError(
      `failed to introspect queue subscriptions for ${kind} "${declaration.name}": ${message}`
    );
  }
}

/**
 * Dev-server variant of queue subscription introspection: runs the given
 * interpreter directly (the dev venv python) and maps the results to the
 * flat shape the CLI's dev queue broker consumes. Returns undefined when
 * introspection fails; never throws.
 */
export async function introspectDevQueueSubscriptions({
  moduleName,
  pythonBin,
  cwd,
  env,
  integrations,
}: {
  moduleName: string;
  pythonBin: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  integrations: QueueIntegration[];
}): Promise<DevQueueSubscription[] | undefined> {
  try {
    const { stdout } = await execa(
      pythonBin,
      ['-c', createQueueIntrospectionScript(moduleName, integrations)],
      // Match the deployed-function environment (see
      // introspectQueueSubscriptions): SDKs may need VERCEL=1,
      // VERCEL_REGION, and VERCEL_DEPLOYMENT_ID to register subscriptions.
      {
        cwd,
        env: {
          ...env,
          VERCEL: '1',
          VERCEL_REGION: env.VERCEL_REGION || 'iad1',
          VERCEL_DEPLOYMENT_ID: env.VERCEL_DEPLOYMENT_ID || 'dpl_introspection',
        },
      }
    );
    const subscriptions = parseIntrospectedSubscriptions(
      'subscriber',
      moduleName,
      stdout
    );
    return subscriptions.map(subscription => {
      const { retryAfterSeconds, initialDelaySeconds, maxDeliveries } =
        subscription.triggerDefaults;
      return {
        topic: subscription.topic,
        consumer: subscription.consumer,
        ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        ...(initialDelaySeconds === undefined ? {} : { initialDelaySeconds }),
        ...(maxDeliveries === undefined ? {} : { maxDeliveries }),
      };
    });
  } catch (err) {
    debug(
      `Failed to introspect dev queue subscriptions for module "${moduleName}": ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return undefined;
  }
}

function parseIntrospectedSubscriptions(
  kind: 'subscriber' | 'workflow',
  subscriberName: string,
  stdout: string
): SubscriberSubscription[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw subscriberError(
      `${kind} "${subscriberName}" queue introspection did not return valid JSON`
    );
  }
  if (!Array.isArray(parsed)) {
    throw subscriberError(
      `${kind} "${subscriberName}" queue introspection must return an array`
    );
  }

  return parsed.map((subscription, index) =>
    parseIntrospectedSubscription(kind, subscriberName, index, subscription)
  );
}

function parseIntrospectedSubscription(
  kind: 'subscriber' | 'workflow',
  subscriberName: string,
  index: number,
  value: unknown
): SubscriberSubscription {
  const label = `${kind} "${subscriberName}" introspected subscription #${index + 1}`;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw subscriberError(`${label} must be an object`);
  }
  const subscription = value as RawQueueSubscription;
  if (
    typeof subscription.topic !== 'string' ||
    subscription.topic.length === 0
  ) {
    throw subscriberError(
      `${label} must define non-empty string field "topic"`
    );
  }
  if (
    typeof subscription.consumer_group !== 'string' ||
    subscription.consumer_group.length === 0
  ) {
    throw subscriberError(
      `${label} must define non-empty string field "consumer_group"`
    );
  }

  return {
    topic: subscription.topic,
    consumer: subscription.consumer_group,
    triggerDefaults: parseTriggerDefaults(label, subscription),
  };
}

function parseTriggerDefaults(
  label: string,
  subscription: RawQueueSubscription
): SubscriberTriggerDefaults {
  const defaults: SubscriberTriggerDefaults = {};

  for (const { field, output, isValid, expected } of TRIGGER_NUMBER_FIELDS) {
    const value = subscription[field];
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value !== 'number' || !isValid(value)) {
      throw subscriberError(`${label} field "${field}" must be ${expected}`);
    }
    defaults[output] = value;
  }

  return defaults;
}

function getQueueWildcardPrefix(pattern: string): string | undefined {
  if (pattern.endsWith('*')) {
    return pattern.slice(0, -1);
  }
  return undefined;
}

function subscriberError(message: string): NowBuildError {
  return new NowBuildError({
    code: 'PYTHON_INVALID_SUBSCRIBER_CONFIG',
    message,
  });
}
