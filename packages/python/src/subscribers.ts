import { join } from 'path';
import fs from 'fs';
import execa from 'execa';
import {
  NowBuildError,
  readConfigFile,
  sanitizeConsumerName,
  type TriggerEvent,
} from '@vercel/build-utils';

const MODULE_ATTR_RE =
  /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*):([A-Za-z_][\w]*)$/;
const SUBSCRIBER_OUTPUT_DIR = '_py_subscribers';

const detectScriptPath = join(
  __dirname,
  '..',
  'templates',
  'vc_subscriber_detect.py'
);
const detectScript = fs.readFileSync(detectScriptPath, 'utf-8');

type SubscriberTriggerDefaults = Omit<
  TriggerEvent,
  'type' | 'topic' | 'consumer'
>;

export interface Subscriber {
  name: string;
  entrypoint: string;
  moduleName: string;
  variableName: string;
  /**
   * Static topics from pyproject.toml. Undefined means topics are derived
   * from code by calling get_queue_subscriptions() on the entrypoint object.
   */
  topics: string[] | undefined;
  triggerDefaults: SubscriberTriggerDefaults;
}

/** A single queue subscription resolved for a subscriber. */
export interface SubscriberSubscription {
  topic: string;
  trigger: SubscriberTriggerDefaults;
}

interface SubscriberTriggerFields {
  max_deliveries?: unknown;
  retry_after_seconds?: unknown;
  initial_delay_seconds?: unknown;
  max_concurrency?: unknown;
}

interface RawSubscriber extends SubscriberTriggerFields {
  entrypoint?: unknown;
  topics?: unknown;
}

interface DetectedSubscriptionEntry extends SubscriberTriggerFields {
  topic: string;
}

interface DetectionResult {
  subscriptions?: DetectedSubscriptionEntry[];
  unsupported?: boolean;
  error?: string;
}

type DetectionOutcome =
  /** get_queue_subscriptions() ran and returned these subscriptions. */
  | { kind: 'detected'; entries: DetectedSubscriptionEntry[] }
  /** The entrypoint object does not implement get_queue_subscriptions(). */
  | { kind: 'unsupported' };

interface TriggerNumberField {
  field: keyof SubscriberTriggerFields;
  output: keyof SubscriberTriggerDefaults;
  isValid: (value: number) => boolean;
  expected: string;
}

const TRIGGER_NUMBER_FIELDS = [
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
] satisfies TriggerNumberField[];

const SUBSCRIBER_FIELD_NAMES = new Set([
  'entrypoint',
  'topics',
  ...TRIGGER_NUMBER_FIELDS.map(({ field }) => field),
]);

interface Pyproject {
  tool?: {
    vercel?: {
      subscribers?: RawSubscriber[];
    };
  };
}

function safePathSegment(value: string): string {
  return [...value]
    .map(char => {
      if (char === '_') {
        return '__';
      }
      return /[A-Za-z0-9-]/.test(char)
        ? char
        : `_${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;
    })
    .join('');
}

export function getSubscriberOutputPath(subscriberName: string): string {
  return `${SUBSCRIBER_OUTPUT_DIR}/${safePathSegment(subscriberName)}`;
}

export function getSubscriberConsumerName(subscriberName: string): string {
  return sanitizeConsumerName(getSubscriberOutputPath(subscriberName));
}

export async function getPyprojectSubscribers(
  workPath: string
): Promise<Subscriber[]> {
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
    subscribers.map((config, index) => parseSubscriber(workPath, index, config))
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

async function parseSubscriber(
  workPath: string,
  index: number,
  config: RawSubscriber
): Promise<Subscriber> {
  const label = `subscriber #${index + 1}`;
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw subscriberError(`${label} must be an object`);
  }

  for (const key of Object.keys(config)) {
    if (!SUBSCRIBER_FIELD_NAMES.has(key)) {
      throw subscriberError(`${label} has unrecognized field "${key}"`);
    }
  }

  if (typeof config.entrypoint !== 'string') {
    throw subscriberError(`${label} must define string field "entrypoint"`);
  }

  const entrypoint = parseEntrypoint(label, config.entrypoint);
  const name = getSubscriberName(entrypoint);
  const existingEntrypoint = await resolveExistingEntrypoint(
    workPath,
    entrypoint.filePath
  );
  if (!existingEntrypoint) {
    throw subscriberError(
      `subscriber "${name}" has entrypoint "${config.entrypoint}" but file "${entrypoint.filePath}" does not exist`
    );
  }

  return {
    name,
    entrypoint: existingEntrypoint,
    moduleName: entrypoint.moduleName,
    variableName: entrypoint.variableName,
    topics: parseTopics(name, config.topics),
    triggerDefaults: parseTriggerFields(`subscriber "${name}"`, config),
  };
}

function getSubscriberName({
  moduleName,
  variableName,
}: {
  moduleName: string;
  variableName: string;
}): string {
  return `${moduleName.replace(/\./g, '-')}_${variableName}`;
}

function parseEntrypoint(
  name: string,
  value: string
): { moduleName: string; variableName: string; filePath: string } {
  const match = MODULE_ATTR_RE.exec(value);
  if (!match) {
    throw subscriberError(
      `subscriber "${name}" has invalid entrypoint "${value}". Use "module:object"`
    );
  }

  return {
    moduleName: match[1],
    variableName: match[2],
    filePath: `${match[1].replace(/\./g, '/')}.py`,
  };
}

async function resolveExistingEntrypoint(
  workPath: string,
  filePath: string
): Promise<string | null> {
  const candidates = [filePath, filePath.replace(/\.py$/i, '/__init__.py')];
  for (const candidate of candidates) {
    try {
      const stat = await fs.promises.stat(join(workPath, candidate));
      if (stat.isFile()) {
        return candidate;
      }
    } catch {}
  }
  return null;
}

function parseTopics(name: string, value: unknown): string[] | undefined {
  if (value === undefined) {
    // Topics are derived from the entrypoint's get_queue_subscriptions().
    return undefined;
  }
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

function parseTriggerFields(
  label: string,
  config: SubscriberTriggerFields
): SubscriberTriggerDefaults {
  const defaults: SubscriberTriggerDefaults = {};

  for (const { field, output, isValid, expected } of TRIGGER_NUMBER_FIELDS) {
    const value = config[field];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'number' || !isValid(value)) {
      throw subscriberError(`${label} field "${field}" must be ${expected}`);
    }
    defaults[output] = value;
  }

  return defaults;
}

function getStaticSubscriberSubscriptions(
  subscriber: Subscriber
): SubscriberSubscription[] | undefined {
  if (!subscriber.topics) {
    return undefined;
  }
  return subscriber.topics.map(topic => ({
    topic,
    trigger: { ...subscriber.triggerDefaults },
  }));
}

/**
 * Resolve the queue subscriptions for a subscriber by calling
 * get_queue_subscriptions() on the entrypoint object.
 *
 * Without "topics" in pyproject.toml the code is the source of truth: every
 * declared subscription becomes a trigger. With "topics", each topic must be
 * declared by the code (exactly or via a wildcard pattern) and adopts the
 * matching subscription's trigger config; entrypoints that do not implement
 * get_queue_subscriptions() cannot be verified, so their explicit topics are
 * trusted as-is. Per-subscription trigger config from code overrides the
 * subscriber-level pyproject defaults.
 */
export async function resolveSubscriberSubscriptions(opts: {
  subscriber: Subscriber;
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  workPath: string;
}): Promise<SubscriberSubscription[]> {
  const { subscriber } = opts;
  const staticSubscriptions = getStaticSubscriberSubscriptions(subscriber);

  const outcome = await detectSubscriptions(opts);

  if (outcome.kind === 'unsupported') {
    if (staticSubscriptions) {
      return staticSubscriptions;
    }
    throw subscriberDetectionError(
      subscriber.name,
      `"${subscriber.moduleName}.${subscriber.variableName}" has no ` +
        `"get_queue_subscriptions" method. A subscriber without "topics" in ` +
        `pyproject.toml must define a get_queue_subscriptions() method that ` +
        `returns its queue subscriptions.`
    );
  }

  const { entries } = outcome;
  if (staticSubscriptions) {
    return validateStaticTopics(subscriber, entries);
  }

  if (entries.length === 0) {
    throw new NowBuildError({
      code: 'PYTHON_SUBSCRIBER_NO_SUBSCRIPTIONS',
      message:
        `subscriber "${subscriber.name}" returned no subscriptions from ` +
        `"${subscriber.moduleName}.${subscriber.variableName}` +
        `.get_queue_subscriptions()". Register at least one subscription or ` +
        `declare "topics" in pyproject.toml.`,
    });
  }

  console.log(
    `Detected ${entries.length} queue subscription(s) for subscriber ` +
      `"${subscriber.name}": ${entries.map(e => e.topic).join(', ')}`
  );

  return entries.map(entry => ({
    topic: entry.topic,
    trigger: mergedTrigger(subscriber, entry),
  }));
}

/**
 * Enforce that explicit pyproject topics are a subset of the code-declared
 * subscriptions. Each topic adopts the trigger config of the subscription it
 * matches.
 */
function validateStaticTopics(
  subscriber: Subscriber,
  entries: DetectedSubscriptionEntry[]
): SubscriberSubscription[] {
  const topics = subscriber.topics || [];
  return topics.map(topic => {
    const matched = matchDetectedSubscription(topic, entries);
    if (!matched) {
      const declared = entries.length
        ? entries.map(e => `"${e.topic}"`).join(', ')
        : '(none)';
      throw new NowBuildError({
        code: 'PYTHON_SUBSCRIBER_TOPIC_NOT_DECLARED',
        message:
          `subscriber "${subscriber.name}" declares topic "${topic}" but ` +
          `"${subscriber.moduleName}.${subscriber.variableName}` +
          `.get_queue_subscriptions()" does not declare it. Declared ` +
          `topics: ${declared}`,
      });
    }
    return {
      topic,
      trigger: mergedTrigger(subscriber, matched),
    };
  });
}

/**
 * Match a concrete topic against code-declared subscriptions. Mirrors the
 * SDK's routing precedence: exact beats prefix patterns, longer prefixes beat
 * shorter ones, and "*" matches everything.
 */
function matchDetectedSubscription(
  topic: string,
  entries: DetectedSubscriptionEntry[]
): DetectedSubscriptionEntry | undefined {
  let best: DetectedSubscriptionEntry | undefined;
  let bestScore = -1;
  for (const entry of entries) {
    let score: number;
    if (entry.topic === topic) {
      score = Number.MAX_SAFE_INTEGER;
    } else if (entry.topic === '*') {
      score = 0;
    } else if (
      entry.topic.endsWith('*') &&
      topic.startsWith(entry.topic.slice(0, -1))
    ) {
      score = entry.topic.length;
    } else {
      continue;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

function mergedTrigger(
  subscriber: Subscriber,
  entry: DetectedSubscriptionEntry
): SubscriberTriggerDefaults {
  return {
    ...subscriber.triggerDefaults,
    ...parseTriggerFields(
      `subscriber "${subscriber.name}" subscription "${entry.topic}"`,
      entry
    ),
  };
}

/**
 * Call get_queue_subscriptions() on the subscriber entrypoint object via a
 * Python subprocess.
 */
async function detectSubscriptions(opts: {
  subscriber: Subscriber;
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  workPath: string;
}): Promise<DetectionOutcome> {
  const { subscriber, pythonBin, env, workPath } = opts;

  let stdout: string;
  try {
    const result = await execa(
      pythonBin,
      ['-c', detectScript, subscriber.moduleName, subscriber.variableName],
      { env, cwd: workPath }
    );
    stdout = result.stdout;
  } catch (err: any) {
    // The Python script writes structured JSON errors to stdout before
    // exiting non-zero. Prefer that over execa's generic error.
    let detail = err?.stderr || err?.message || String(err);
    try {
      const parsed = JSON.parse(err?.stdout) as DetectionResult;
      if (parsed.error) detail = parsed.error;
    } catch {}
    throw subscriberDetectionError(subscriber.name, detail);
  }

  let parsed: DetectionResult;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw subscriberDetectionError(
      subscriber.name,
      `detection returned invalid JSON: ${stdout}`
    );
  }

  if (parsed.unsupported) {
    return { kind: 'unsupported' };
  }
  return { kind: 'detected', entries: parsed.subscriptions || [] };
}

function subscriberDetectionError(
  subscriber: string,
  detail: string
): NowBuildError {
  return new NowBuildError({
    code: 'PYTHON_SUBSCRIBER_TOPIC_DETECTION_FAILED',
    message: `could not detect queue subscriptions for subscriber "${subscriber}": ${detail}`,
  });
}

function subscriberError(message: string): NowBuildError {
  return new NowBuildError({
    code: 'PYTHON_INVALID_SUBSCRIBER_CONFIG',
    message,
  });
}
