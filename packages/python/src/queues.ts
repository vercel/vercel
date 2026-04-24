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

export interface ServiceQueueSubscription extends DetectedQueueSubscription {
  consumer: string;
}

export function buildQueueSubscriptionConsumer(
  serviceName: string,
  handler: string
): string {
  return sanitizeConsumerName(
    `${getInternalServiceFunctionPath(serviceName)}#${handler}`
  );
}

export function buildQueueSubscriptionConsumerMap(
  subscriptions: ServiceQueueSubscription[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const subscription of subscriptions) {
    map[subscription.handler] = subscription.consumer;
  }
  return map;
}

export function buildQueueSubscriptionTriggers(
  subscriptions: ServiceQueueSubscription[]
): TriggerEvent[] {
  return subscriptions.map(subscription => ({
    type: 'queue/v2beta',
    topic: subscription.topic,
    consumer: subscription.consumer,
  }));
}

export async function getServiceQueueSubscriptions(opts: {
  service?: {
    name?: string;
    type?: string;
  };
  entrypoint?: string;
  handlerFunction?: string;
  pythonBin: string;
  env: NodeJS.ProcessEnv;
  workPath: string;
}): Promise<ServiceQueueSubscription[] | undefined> {
  const { service, entrypoint } = opts;
  if (!service || service.type !== 'worker' || !service.name || !entrypoint) {
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
    consumer: buildQueueSubscriptionConsumer(serviceName, subscription.handler),
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
