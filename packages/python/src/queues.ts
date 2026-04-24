import fs from 'fs';
import { join } from 'path';
import execa from 'execa';
import {
  getInternalServiceFunctionPath,
  NowBuildError,
  sanitizeConsumerName,
  type TriggerEvent,
} from '@vercel/build-utils';
import { entrypointToModule } from './utils';

const scriptPath = join(__dirname, '..', 'templates', 'vc_queue_detect.py');
const script = fs.readFileSync(scriptPath, 'utf-8');

interface DetectedQueueSubscription {
  topic: string;
  handler: string;
}

interface QueueDetectionResult {
  subscriptions?: DetectedQueueSubscription[];
  error?: string;
}

export interface ServiceQueueConsumer extends DetectedQueueSubscription {
  consumer: string;
}

export function buildQueueConsumerName(
  serviceName: string,
  handler: string
): string {
  return sanitizeConsumerName(
    `${getInternalServiceFunctionPath(serviceName)}#${handler}`
  );
}

export function buildQueueConsumerMap(
  consumers: ServiceQueueConsumer[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const consumer of consumers) {
    map[consumer.handler] = consumer.consumer;
  }
  return map;
}

export function buildQueueConsumerTriggers(
  consumers: ServiceQueueConsumer[]
): TriggerEvent[] {
  return consumers.map(consumer => ({
    type: 'queue/v2beta',
    topic: consumer.topic,
    consumer: consumer.consumer,
  }));
}

export async function getServiceQueueConsumers(opts: {
  service?: {
    name?: string;
    type?: string;
    trigger?: string;
  };
  entrypoint?: string;
  handlerFunction?: string;
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  workPath: string;
}): Promise<ServiceQueueConsumer[] | undefined> {
  const { service, entrypoint } = opts;
  const isQueueTriggeredService =
    service?.type === 'worker' ||
    (service?.type === 'job' && service.trigger === 'queue');
  if (!isQueueTriggeredService || !service?.name || !entrypoint) {
    return undefined;
  }
  const serviceName = service.name;

  const detected = await detectQueueSubscriptions({
    pythonBin: opts.pythonBin,
    env: opts.env,
    workPath: opts.workPath,
    moduleName: entrypointToModule(entrypoint),
    attrName: opts.handlerFunction,
  });

  if (detected.length === 0) {
    return undefined;
  }

  return detected.map(subscription => ({
    ...subscription,
    consumer: buildQueueConsumerName(serviceName, subscription.handler),
  }));
}

async function detectQueueSubscriptions(opts: {
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  workPath: string;
  moduleName: string;
  attrName?: string;
}): Promise<DetectedQueueSubscription[]> {
  const { pythonBin, env, workPath, moduleName, attrName } = opts;

  let stdout: string;
  try {
    const args = ['-c', script, moduleName];
    if (attrName) {
      args.push(attrName);
    }
    const result = await execa(pythonBin, args, {
      env,
      cwd: workPath,
    });
    stdout = result.stdout;
  } catch (err: any) {
    let detail = err?.stderr || err?.message || String(err);
    try {
      const parsed = JSON.parse(err?.stdout) as QueueDetectionResult;
      if (parsed.error) detail = parsed.error;
    } catch {}
    throw new NowBuildError({
      code: 'PYTHON_QUEUE_SUBSCRIPTION_DETECTION_FAILED',
      message: `Failed to detect queue subscriptions: ${detail}`,
    });
  }

  let parsed: QueueDetectionResult;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new NowBuildError({
      code: 'PYTHON_QUEUE_SUBSCRIPTION_DETECTION_FAILED',
      message: `Queue subscription detection returned invalid JSON: ${stdout}`,
    });
  }

  return parsed.subscriptions || [];
}
