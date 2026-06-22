import { join } from 'path';
import fs from 'fs';
import {
  NowBuildError,
  readConfigFile,
  type TriggerEvent,
} from '@vercel/build-utils';

const SUBSCRIBER_NAME_RE = /^[A-Za-z]([A-Za-z0-9_-]*[A-Za-z0-9])?$/;
const MODULE_ATTR_RE =
  /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*):([A-Za-z_][\w]*)$/;

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
      subscribers?: Record<string, RawSubscriber>;
    };
  };
}

export function safePathSegment(value: string): string {
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
  if (typeof subscribers !== 'object' || Array.isArray(subscribers)) {
    throw subscriberError('"tool.vercel.subscribers" must be an object');
  }

  return Promise.all(
    Object.entries(subscribers).map(([name, config]) =>
      parseSubscriber(workPath, name, config)
    )
  );
}

async function parseSubscriber(
  workPath: string,
  name: string,
  config: RawSubscriber
): Promise<Subscriber> {
  if (!SUBSCRIBER_NAME_RE.test(name)) {
    throw subscriberError(
      `subscriber name "${name}" is invalid. Names must start with a letter, end with an alphanumeric character, and contain only alphanumeric characters, hyphens, and underscores`
    );
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw subscriberError(`subscriber "${name}" must be an object`);
  }

  for (const key of Object.keys(config)) {
    if (!SUBSCRIBER_FIELD_NAMES.has(key)) {
      throw subscriberError(
        `subscriber "${name}" has unrecognized field "${key}"`
      );
    }
  }

  if (typeof config.entrypoint !== 'string') {
    throw subscriberError(
      `subscriber "${name}" must define string field "entrypoint"`
    );
  }

  const entrypoint = parseEntrypoint(name, config.entrypoint);
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
