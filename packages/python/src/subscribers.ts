import { join } from 'path';
import fs from 'fs';
import {
  NowBuildError,
  readConfigFile,
  sanitizeConsumerName,
  type TriggerEvent,
} from '@vercel/build-utils';
import {
  getModuleEntrypointName,
  parseModuleEntrypoint,
  resolveExistingEntrypoint,
  safePathSegment,
} from './module-entrypoint';

const SUBSCRIBER_OUTPUT_DIR = '_py_subscribers';

type SubscriberTriggerDefaults = Omit<
  TriggerEvent,
  'type' | 'topic' | 'consumer'
>;

export interface Subscriber {
  name: string;
  entrypoint: string;
  moduleName: string;
  variableName: string;
  topics: string[];
  triggerDefaults: SubscriberTriggerDefaults;
}

interface RawSubscriber {
  entrypoint?: unknown;
  topics?: unknown;
  max_deliveries?: unknown;
  retry_after_seconds?: unknown;
  initial_delay_seconds?: unknown;
  max_concurrency?: unknown;
}

interface TriggerNumberField {
  field: keyof RawSubscriber;
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

  const entrypoint = parseModuleEntrypoint(config.entrypoint);
  if (!entrypoint) {
    throw subscriberError(
      `${label} has invalid entrypoint "${config.entrypoint}". Use "module:object"`
    );
  }
  const name = getModuleEntrypointName(entrypoint);
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
    triggerDefaults: parseTriggerDefaults(name, config),
  };
}

function parseTopics(name: string, value: unknown): string[] {
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

function parseTriggerDefaults(
  subscriber: string,
  config: RawSubscriber
): SubscriberTriggerDefaults {
  const defaults: SubscriberTriggerDefaults = {};

  for (const { field, output, isValid, expected } of TRIGGER_NUMBER_FIELDS) {
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

function subscriberError(message: string): NowBuildError {
  return new NowBuildError({
    code: 'PYTHON_INVALID_SUBSCRIBER_CONFIG',
    message,
  });
}
