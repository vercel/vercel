import { join } from 'path';
import {
  NowBuildError,
  readConfigFile,
  type ServiceQueueTopic,
} from '@vercel/build-utils';

const DYNAMIC_SCHEDULE = '<dynamic>';
const SERVICE_NAME_REGEX = /^[a-zA-Z]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;
const PYTHON_MODULE_RE = /^[A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*$/;
const PYTHON_MODULE_ATTR_RE =
  /^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*):([A-Za-z_][\w]*)$/;

interface PyprojectVercelServiceConfig {
  entrypoint?: unknown;
  topics?: unknown;
  schedule?: unknown;
}

interface PyprojectVercelConfig {
  subscribers?: Record<string, PyprojectVercelServiceConfig>;
  crons?: Record<string, PyprojectVercelServiceConfig>;
}

interface PyprojectConfig {
  tool?: {
    vercel?: PyprojectVercelConfig;
  };
}

export interface PyprojectEntrypoint {
  raw: string;
  filePath: string;
  handlerFunction?: string;
}

export interface PyprojectSubscriber {
  name: string;
  entrypoint: PyprojectEntrypoint;
  topics: ServiceQueueTopic[];
}

export interface PyprojectCron {
  name: string;
  entrypoint: PyprojectEntrypoint;
  schedule: string | string[];
  dynamic: boolean;
}

export interface PyprojectServices {
  subscribers: PyprojectSubscriber[];
  crons: PyprojectCron[];
}

export function hasPyprojectServices(services: PyprojectServices): boolean {
  return services.subscribers.length > 0 || services.crons.length > 0;
}

export async function readPyprojectServices(
  workPath: string
): Promise<PyprojectServices> {
  const pyproject = await readConfigFile<PyprojectConfig>(
    join(workPath, 'pyproject.toml')
  );
  const vercel = pyproject?.tool?.vercel;
  if (!vercel) {
    return { subscribers: [], crons: [] };
  }

  const subscribers = readSubscribers(vercel.subscribers);
  const crons = readCrons(vercel.crons);
  return { subscribers, crons };
}

function readSubscribers(
  subscribers: Record<string, PyprojectVercelServiceConfig> | undefined
): PyprojectSubscriber[] {
  if (subscribers === undefined) return [];
  assertPlainObject(subscribers, 'tool.vercel.subscribers');

  return Object.entries(subscribers).map(([name, config]) => {
    validateServiceName(name, 'subscriber');
    assertPlainObject(config, `tool.vercel.subscribers.${name}`);
    const entrypoint = readEntrypoint(
      config.entrypoint,
      `tool.vercel.subscribers.${name}.entrypoint`
    );
    const topics = readTopics(
      config.topics,
      `tool.vercel.subscribers.${name}.topics`
    );
    return { name, entrypoint, topics };
  });
}

function readCrons(
  crons: Record<string, PyprojectVercelServiceConfig> | undefined
): PyprojectCron[] {
  if (crons === undefined) return [];
  assertPlainObject(crons, 'tool.vercel.crons');

  return Object.entries(crons).map(([name, config]) => {
    validateServiceName(name, 'cron');
    assertPlainObject(config, `tool.vercel.crons.${name}`);
    const entrypoint = readEntrypoint(
      config.entrypoint,
      `tool.vercel.crons.${name}.entrypoint`
    );
    const { schedule, dynamic } = readSchedule(
      config.schedule,
      `tool.vercel.crons.${name}.schedule`
    );
    if (dynamic && !entrypoint.handlerFunction) {
      throw new NowBuildError({
        code: 'PYPROJECT_DYNAMIC_CRON_ENTRYPOINT_INVALID',
        message:
          `Dynamic cron "${name}" must use a "module:object" entrypoint ` +
          `where the object has a get_crons() method.`,
      });
    }
    return { name, entrypoint, schedule, dynamic };
  });
}

function readEntrypoint(value: unknown, label: string): PyprojectEntrypoint {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new NowBuildError({
      code: 'PYPROJECT_SERVICE_ENTRYPOINT_INVALID',
      message: `"${label}" must be a non-empty string.`,
    });
  }

  const raw = value.trim();
  const moduleAttr = PYTHON_MODULE_ATTR_RE.exec(raw);
  if (moduleAttr) {
    return {
      raw,
      filePath: `${moduleAttr[1].replace(/\./g, '/')}.py`,
      handlerFunction: moduleAttr[2],
    };
  }

  if (raw.endsWith('.py') || raw.includes('/')) {
    return { raw, filePath: raw.endsWith('.py') ? raw : `${raw}.py` };
  }

  if (PYTHON_MODULE_RE.test(raw)) {
    return { raw, filePath: `${raw.replace(/\./g, '/')}.py` };
  }

  throw new NowBuildError({
    code: 'PYPROJECT_SERVICE_ENTRYPOINT_INVALID',
    message:
      `"${label}" must be a Python file path, module name, or ` +
      `"module:callable" reference.`,
  });
}

function readTopics(value: unknown, label: string): ServiceQueueTopic[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new NowBuildError({
      code: 'PYPROJECT_SUBSCRIBER_TOPICS_INVALID',
      message: `"${label}" must be a non-empty array.`,
    });
  }

  return value.map((item, index): ServiceQueueTopic => {
    const itemLabel = `${label}[${index}]`;
    if (typeof item === 'string') {
      if (item.length === 0) {
        throw new NowBuildError({
          code: 'PYPROJECT_SUBSCRIBER_TOPICS_INVALID',
          message: `"${itemLabel}" must not be empty.`,
        });
      }
      return { topic: item };
    }
    assertPlainObject(item, itemLabel);
    const topic = (item as Record<string, unknown>).topic;
    if (typeof topic !== 'string' || topic.length === 0) {
      throw new NowBuildError({
        code: 'PYPROJECT_SUBSCRIBER_TOPICS_INVALID',
        message: `"${itemLabel}.topic" must be a non-empty string.`,
      });
    }
    const retryAfterSeconds = readOptionalNonNegativeInteger(
      item,
      'retry_after_seconds',
      itemLabel
    );
    const initialDelaySeconds = readOptionalNonNegativeInteger(
      item,
      'initial_delay_seconds',
      itemLabel
    );
    return {
      topic,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      ...(initialDelaySeconds !== undefined ? { initialDelaySeconds } : {}),
    };
  });
}

function readSchedule(
  value: unknown,
  label: string
): { schedule: string | string[]; dynamic: boolean } {
  if (value === undefined) {
    return { schedule: DYNAMIC_SCHEDULE, dynamic: true };
  }
  if (typeof value === 'string') {
    if (value.length === 0) {
      throw new NowBuildError({
        code: 'PYPROJECT_CRON_SCHEDULE_INVALID',
        message: `"${label}" must not be empty.`,
      });
    }
    return { schedule: value, dynamic: value === DYNAMIC_SCHEDULE };
  }
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(item => typeof item === 'string' && item.length > 0)
  ) {
    return { schedule: value, dynamic: false };
  }
  throw new NowBuildError({
    code: 'PYPROJECT_CRON_SCHEDULE_INVALID',
    message:
      `"${label}" must be a cron string, an array of cron strings, ` +
      `or omitted for dynamic cron discovery.`,
  });
}

function validateServiceName(name: string, type: string): void {
  if (!SERVICE_NAME_REGEX.test(name)) {
    throw new NowBuildError({
      code: 'PYPROJECT_SERVICE_NAME_INVALID',
      message:
        `Pyproject ${type} service name "${name}" is invalid. Names must ` +
        `start with a letter, end with an alphanumeric character, and contain ` +
        `only alphanumeric characters, hyphens, and underscores.`,
    });
  }
}

function readOptionalNonNegativeInteger(
  item: unknown,
  key: string,
  label: string
): number | undefined {
  const record = item as Record<string, unknown>;
  const value = record[key];
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new NowBuildError({
      code: 'PYPROJECT_SUBSCRIBER_TOPICS_INVALID',
      message: `"${label}.${key}" must be a non-negative integer.`,
    });
  }
  return value as number;
}

function assertPlainObject(
  value: unknown,
  label: string
): asserts value is object {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NowBuildError({
      code: 'PYPROJECT_SERVICE_CONFIG_INVALID',
      message: `"${label}" must be an object.`,
    });
  }
}
