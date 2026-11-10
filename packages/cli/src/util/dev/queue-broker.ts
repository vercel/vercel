// In-memory queue broker for local development.

import ms from 'ms';
import { randomBytes } from 'crypto';
import { directFetch } from '../fetch';
import {
  getServiceQueueTopicConfigs,
  isQueueBackedService,
  type ExperimentalService,
  type DevQueueSubscription,
} from '@vercel/build-utils';
import output from '../../output-manager';
import { dev } from './diagnostics';

interface StoredMessage {
  messageId: string;
  payload: Buffer;
  contentType: string;
  queueName: string;
  createdAt: string;
  retentionMs: number;
  visibleAt: number;
}

interface ConsumerGroup {
  id: string;
  name: string;
  serviceName?: string;
  configOwned?: boolean;
  resolveFunction?: () => FunctionDispatch | null;
  topicPattern: string;
  topicRegex: RegExp;
  serviceOriginFn?: () => string | null;
  retryAfterMs: number;
  maxDeliveries: number;
  initialDelayMs: number;
}

type DeliveryStatus = 'pending' | 'in-flight' | 'acked';

interface DeliveryState {
  status: DeliveryStatus;
  deliveryCount: number;
  receiptHandle: string;
  visibleAt: number;
  leaseExpiresAt: number;
}

export interface ReceivedMessage {
  messageId: string;
  payload: Buffer;
  contentType: string;
  deliveryCount: number;
  createdAt: string;
  receiptHandle: string;
}

const DEFAULT_RETRY_AFTER = ms('1m');
const DEFAULT_MAX_DELIVERIES = 32;
const DEFAULT_INITIAL_DELAY = 0;
const DEFAULT_VISIBILITY_TIMEOUT = ms('1m');
const DEFAULT_RETENTION = ms('1h');
const TICK_INTERVAL = ms('1s');

/**
 * Convert a topic to a proper regex.
 *
 * Topic names may only contain [A-Za-z0-9_-].
 * `*` expands to match zero or more valid topic characters.
 */
export function topicPatternToRegex(pattern: string): RegExp {
  const parts = pattern.split('*').map(s => s.replace(/-/g, '\\-'));
  return new RegExp(`^${parts.join('[A-Za-z0-9_\\-]*')}$`);
}

export interface EnqueueOptions {
  retentionSeconds?: number;
  delaySeconds?: number;
  idempotencyKey?: string;
}

interface IdempotencyRecord {
  messageId: string;
  expiresAt: number;
}

interface DuplicateMessageRecord {
  queueName: string;
  originalMessageId: string;
  expiresAt: number;
}

type QueueBrokerService = ExperimentalService & { consumer?: string };

export interface FunctionQueueSubscription extends DevQueueSubscription {
  outputPath: string;
}

export interface FunctionInvocationRequest {
  method: string;
  headers: Record<string, string>;
  body: Buffer;
  signal?: AbortSignal;
}

export type FunctionDispatch = (
  request: FunctionInvocationRequest
) => Promise<{ ok: boolean; status: number } | null>;

export class QueueBroker {
  private messages = new Map<string, StoredMessage>();
  private idempotencyRecords = new Map<string, IdempotencyRecord>();
  private duplicateMessages = new Map<string, DuplicateMessageRecord>();
  private consumerGroups: ConsumerGroup[] = [];
  private deliveryState = new Map<string, Map<string, DeliveryState>>();
  private tickTimer: ReturnType<typeof setInterval>;

  constructor(
    services: QueueBrokerService[],
    private getServiceOrigin: (name: string) => string | null
  ) {
    this.registerServices(services);

    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL);
    this.tickTimer.unref();
  }

  registerServices(services: QueueBrokerService[]): void {
    const ids = new Set<string>();
    for (const service of services.filter(isQueueBackedService)) {
      for (const { topic } of getServiceQueueTopicConfigs(service)) {
        const consumerGroup = service.consumer ?? service.name;
        const id = `${consumerGroup}::${topic}`;
        const existing = this.consumerGroups.find(group => group.id === id);
        if (
          ids.has(id) ||
          existing?.serviceOriginFn ||
          existing?.resolveFunction
        ) {
          throw dev.DEV_QUEUE_CONSUMER_DUPLICATE({ consumerGroup, topic });
        }
        ids.add(id);
      }
    }
    for (const service of services) {
      if (!isQueueBackedService(service)) continue;

      const topicConfigs = getServiceQueueTopicConfigs(service);
      const consumerGroup = service.consumer ?? service.name;
      for (const topicConfig of topicConfigs) {
        const topicPattern = topicConfig.topic;
        const id = `${consumerGroup}::${topicPattern}`;
        const existingGroup = this.consumerGroups.find(
          group => group.id === id
        );
        if (
          existingGroup &&
          !existingGroup.serviceOriginFn &&
          !existingGroup.resolveFunction
        ) {
          existingGroup.serviceName = service.name;
          existingGroup.serviceOriginFn = () =>
            this.getServiceOrigin(service.name);
          existingGroup.retryAfterMs =
            topicConfig.retryAfterSeconds !== undefined
              ? topicConfig.retryAfterSeconds * 1000
              : DEFAULT_RETRY_AFTER;
          existingGroup.initialDelayMs =
            topicConfig.initialDelaySeconds !== undefined
              ? topicConfig.initialDelaySeconds * 1000
              : DEFAULT_INITIAL_DELAY;
          this.activatePushGroup(existingGroup);
          continue;
        }
        if (existingGroup) {
          throw dev.DEV_QUEUE_CONSUMER_DUPLICATE({
            consumerGroup,
            topic: topicPattern,
          });
        }
        const group: ConsumerGroup = {
          id,
          name: consumerGroup,
          serviceName: service.name,
          topicPattern,
          topicRegex: topicPatternToRegex(topicPattern),
          serviceOriginFn: () => this.getServiceOrigin(service.name),
          retryAfterMs:
            topicConfig.retryAfterSeconds !== undefined
              ? topicConfig.retryAfterSeconds * 1000
              : DEFAULT_RETRY_AFTER,
          maxDeliveries: DEFAULT_MAX_DELIVERIES,
          initialDelayMs:
            topicConfig.initialDelaySeconds !== undefined
              ? topicConfig.initialDelaySeconds * 1000
              : DEFAULT_INITIAL_DELAY,
        };

        this.consumerGroups.push(group);
        this.deliveryState.set(group.id, this.createRetainedDeliveries(group));
        this.activatePushGroup(group);
      }
    }
  }

  /**
   * Replace a service's consumer groups with the queue subscriptions its
   * dev server introspected from the runtime SDK. The SDK dispatches push
   * deliveries by the registered (consumer group, topic) pair, so deliveries
   * must carry these consumer groups — not the synthesized per-service name
   * derived from the service topology.
   */
  updateServiceSubscriptions(
    serviceName: string,
    subscriptions: DevQueueSubscription[]
  ): void {
    if (subscriptions.length === 0) {
      return;
    }

    const kept: ConsumerGroup[] = [];
    for (const group of this.consumerGroups) {
      if (group.serviceName === serviceName) {
        this.deliveryState.delete(group.id);
      } else {
        kept.push(group);
      }
    }
    this.consumerGroups = kept;

    for (const subscription of subscriptions) {
      const id = `${subscription.consumer}::${subscription.topic}`;
      const existingGroup = this.consumerGroups.find(group => group.id === id);
      if (
        existingGroup &&
        !existingGroup.serviceOriginFn &&
        !existingGroup.resolveFunction
      ) {
        existingGroup.serviceName = serviceName;
        existingGroup.serviceOriginFn = () =>
          this.getServiceOrigin(serviceName);
        existingGroup.retryAfterMs =
          subscription.retryAfterSeconds !== undefined
            ? subscription.retryAfterSeconds * 1000
            : DEFAULT_RETRY_AFTER;
        existingGroup.maxDeliveries =
          subscription.maxDeliveries ?? DEFAULT_MAX_DELIVERIES;
        existingGroup.initialDelayMs =
          subscription.initialDelaySeconds !== undefined
            ? subscription.initialDelaySeconds * 1000
            : DEFAULT_INITIAL_DELAY;
        this.activatePushGroup(existingGroup);
        continue;
      }
      if (existingGroup) {
        output.debug(
          `Queue consumer "${subscription.consumer}" is already registered ` +
            `for topic "${subscription.topic}"; keeping the first registration`
        );
        continue;
      }
      const group: ConsumerGroup = {
        id,
        name: subscription.consumer,
        serviceName,
        topicPattern: subscription.topic,
        topicRegex: topicPatternToRegex(subscription.topic),
        serviceOriginFn: () => this.getServiceOrigin(serviceName),
        retryAfterMs:
          subscription.retryAfterSeconds !== undefined
            ? subscription.retryAfterSeconds * 1000
            : DEFAULT_RETRY_AFTER,
        maxDeliveries: subscription.maxDeliveries ?? DEFAULT_MAX_DELIVERIES,
        initialDelayMs:
          subscription.initialDelaySeconds !== undefined
            ? subscription.initialDelaySeconds * 1000
            : DEFAULT_INITIAL_DELAY,
      };
      this.consumerGroups.push(group);
      this.deliveryState.set(group.id, this.createRetainedDeliveries(group));
      this.activatePushGroup(group);
    }

    output.debug(
      `Queue consumer groups for service "${serviceName}" updated from ` +
        `${subscriptions.length} introspected subscription(s)`
    );
  }

  validateFunctionSubscriptions(
    subscriptions: FunctionQueueSubscription[]
  ): void {
    const ids = new Set<string>();
    // Validate the entire replacement before changing ownership or dispatching.
    for (const subscription of subscriptions) {
      const id = `${subscription.consumer}::${subscription.topic}`;
      const existing = this.consumerGroups.find(group => group.id === id);
      if (ids.has(id) || (existing?.serviceOriginFn && !existing.configOwned)) {
        throw dev.DEV_QUEUE_CONSUMER_DUPLICATE({
          consumerGroup: subscription.consumer,
          topic: subscription.topic,
        });
      }
      ids.add(id);
    }
  }

  setFunctionSubscriptions(
    subscriptions: FunctionQueueSubscription[],
    resolve: (outputPath: string) => FunctionDispatch | null
  ): void {
    this.validateFunctionSubscriptions(subscriptions);
    const ids = new Set(
      subscriptions.map(
        subscription => `${subscription.consumer}::${subscription.topic}`
      )
    );
    for (const group of this.consumerGroups) {
      if (group.configOwned && !ids.has(group.id)) {
        // Removing a push target must not discard ACKs or a polling client's lease.
        delete group.configOwned;
        delete group.resolveFunction;
      }
    }

    for (const subscription of subscriptions) {
      const id = `${subscription.consumer}::${subscription.topic}`;
      let group = this.consumerGroups.find(group => group.id === id);
      if (!group) {
        group = {
          id,
          name: subscription.consumer,
          topicPattern: subscription.topic,
          topicRegex: topicPatternToRegex(subscription.topic),
          retryAfterMs: DEFAULT_RETRY_AFTER,
          maxDeliveries: DEFAULT_MAX_DELIVERIES,
          initialDelayMs: DEFAULT_INITIAL_DELAY,
        };
        this.consumerGroups.push(group);
        this.deliveryState.set(id, this.createRetainedDeliveries(group));
      }
      group.configOwned = true;
      group.resolveFunction = () => resolve(subscription.outputPath);
      group.retryAfterMs =
        subscription.retryAfterSeconds === undefined
          ? DEFAULT_RETRY_AFTER
          : subscription.retryAfterSeconds * 1000;
      group.maxDeliveries =
        subscription.maxDeliveries ?? DEFAULT_MAX_DELIVERIES;
      group.initialDelayMs = (subscription.initialDelaySeconds ?? 0) * 1000;
      this.activatePushGroup(group);
    }
  }

  enqueue(
    queueName: string,
    payload: Buffer,
    contentType: string,
    options?: EnqueueOptions
  ): { messageId: string } {
    const now = Date.now();
    const messageId = randomBytes(16).toString('hex');
    const retentionMs =
      (options?.retentionSeconds ?? 0) > 0
        ? options!.retentionSeconds! * 1000
        : DEFAULT_RETENTION;
    const idempotencyRecordKey = options?.idempotencyKey
      ? `${queueName}:${options.idempotencyKey}`
      : undefined;

    if (idempotencyRecordKey) {
      const record = this.idempotencyRecords.get(idempotencyRecordKey);
      if (record && record.expiresAt > Date.now()) {
        this.duplicateMessages.set(messageId, {
          queueName,
          originalMessageId: record.messageId,
          expiresAt: Date.now() + retentionMs,
        });
        output.debug(
          `queues: skipped duplicate message for queue "${queueName}"`
        );
        return { messageId };
      }
      if (record) {
        this.idempotencyRecords.delete(idempotencyRecordKey);
      }
    }

    if (idempotencyRecordKey) {
      this.idempotencyRecords.set(idempotencyRecordKey, {
        messageId,
        expiresAt: Date.now() + retentionMs,
      });
    }

    const message: StoredMessage = {
      messageId,
      payload,
      contentType,
      queueName,
      createdAt: new Date(now).toISOString(),
      retentionMs,
      visibleAt:
        (options?.delaySeconds ?? 0) > 0
          ? now + options!.delaySeconds! * 1000
          : 0,
    };

    this.messages.set(messageId, message);
    output.debug(
      `queues: stored message ${messageId} for queue "${queueName}"`
    );

    const matchingGroups = this.consumerGroups.filter(g =>
      g.topicRegex.test(queueName)
    );

    if (matchingGroups.length === 0) {
      output.debug(
        `queues: no consumer group matches topic "${queueName}", message stored but not dispatched`
      );
    }

    for (const group of matchingGroups) {
      const groupDeliveries = this.deliveryState.get(group.id)!;
      const initialVisibleAt =
        group.initialDelayMs > 0 ? now + group.initialDelayMs : 0;
      const visibleAt = Math.max(message.visibleAt, initialVisibleAt);

      groupDeliveries.set(messageId, {
        status: 'pending',
        deliveryCount: 0,
        receiptHandle: '',
        visibleAt,
        leaseExpiresAt: 0,
      });

      // If no delay, dispatch immediately
      if (
        visibleAt <= now &&
        (group.serviceOriginFn || group.resolveFunction)
      ) {
        this.dispatchToConsumer(message, group).catch(err => {
          output.debug(`queues: unexpected dispatch error: ${err}`);
        });
      }
    }

    return { messageId };
  }

  getOriginalMessageIdForDuplicate(
    queueName: string,
    messageId: string
  ): string | null {
    const duplicate = this.duplicateMessages.get(messageId);
    if (!duplicate || duplicate.queueName !== queueName) {
      return null;
    }
    if (duplicate.expiresAt <= Date.now()) {
      this.duplicateMessages.delete(messageId);
      return null;
    }
    return duplicate.originalMessageId;
  }

  receiveById(
    queueName: string,
    messageId: string,
    consumerGroup: string
  ): ReceivedMessage | null {
    const message = this.messages.get(messageId);
    if (
      !message ||
      message.queueName !== queueName ||
      this.isMessageExpired(message)
    ) {
      return null;
    }

    const group = this.getOrCreatePullGroup(queueName, consumerGroup);
    const state = this.deliveryState.get(group.id)?.get(messageId);
    if (!state) return null;

    if (state.status === 'pending') {
      if (state.visibleAt > Date.now()) return null;
      state.status = 'in-flight';
      state.receiptHandle = randomBytes(16).toString('hex');
      state.deliveryCount++;
      state.leaseExpiresAt = Date.now() + DEFAULT_VISIBILITY_TIMEOUT;
    }

    return {
      messageId: message.messageId,
      payload: message.payload,
      contentType: message.contentType,
      deliveryCount: state.deliveryCount,
      createdAt: message.createdAt,
      receiptHandle: state.receiptHandle,
    };
  }

  receiveMessages(
    queueName: string,
    consumerGroup: string,
    options?: {
      limit?: number;
      visibilityTimeoutSeconds?: number;
    }
  ): ReceivedMessage[] {
    const group = this.getOrCreatePullGroup(queueName, consumerGroup);

    const groupDeliveries = this.deliveryState.get(group.id);
    if (!groupDeliveries) return [];

    const now = Date.now();
    const limit = Math.min(Math.max(options?.limit ?? 1, 1), 10);
    const visibilityTimeoutMs =
      (options?.visibilityTimeoutSeconds ?? DEFAULT_VISIBILITY_TIMEOUT / 1000) *
      1000;
    const results: ReceivedMessage[] = [];

    for (const [messageId, state] of groupDeliveries) {
      const message = this.messages.get(messageId);
      if (!message) {
        groupDeliveries.delete(messageId);
        continue;
      }
      if (this.isMessageExpired(message, now)) {
        this.deleteMessage(messageId);
        continue;
      }

      if (
        message.queueName !== queueName ||
        state.status !== 'pending' ||
        state.visibleAt > now
      ) {
        continue;
      }

      // Lease the message
      const receiptHandle = randomBytes(16).toString('hex');
      state.status = 'in-flight';
      state.receiptHandle = receiptHandle;
      state.deliveryCount++;
      state.leaseExpiresAt = Date.now() + visibilityTimeoutMs;

      results.push({
        messageId: message.messageId,
        payload: message.payload,
        contentType: message.contentType,
        deliveryCount: state.deliveryCount,
        createdAt: message.createdAt,
        receiptHandle,
      });

      if (results.length >= limit) break;
    }

    return results;
  }

  acknowledge(
    messageId: string,
    consumerGroup: string,
    receiptHandle: string
  ): boolean {
    const { deliveries: groupDeliveries, state } = this.findDeliveryState(
      messageId,
      consumerGroup
    );
    if (!groupDeliveries || !state) return false;

    if (state.receiptHandle && state.receiptHandle !== receiptHandle) {
      output.debug(
        `queues: ACK rejected for ${messageId} in group "${consumerGroup}" - receipt handle mismatch`
      );
      return false;
    }

    state.status = 'acked';
    groupDeliveries.delete(messageId);
    output.debug(
      `queues: ACK message ${messageId} in group "${consumerGroup}"`
    );

    return true;
  }

  changeVisibility(
    messageId: string,
    consumerGroup: string,
    receiptHandle: string,
    timeoutSeconds: number
  ): boolean {
    const { state } = this.findDeliveryState(messageId, consumerGroup);
    if (!state || state.status !== 'in-flight') return false;

    if (state.receiptHandle && state.receiptHandle !== receiptHandle)
      return false;

    state.leaseExpiresAt = Date.now() + timeoutSeconds * 1000;
    output.debug(
      `queues: visibility for ${messageId} in group "${consumerGroup}" extended by ${timeoutSeconds}s`
    );
    return true;
  }

  findMessageIdByReceiptHandle(
    consumerGroup: string,
    receiptHandle: string
  ): string | null {
    for (const group of this.consumerGroups) {
      if (group.name !== consumerGroup) continue;

      const deliveries = this.deliveryState.get(group.id);
      if (!deliveries) continue;

      for (const [messageId, state] of deliveries) {
        if (state.receiptHandle === receiptHandle) {
          return messageId;
        }
      }
    }
    return null;
  }

  private findDeliveryState(
    messageId: string,
    serviceName: string
  ): {
    deliveries: Map<string, DeliveryState> | null;
    state: DeliveryState | null;
  } {
    for (const group of this.consumerGroups) {
      if (group.name !== serviceName) continue;
      const deliveries = this.deliveryState.get(group.id);
      if (!deliveries) continue;
      const state = deliveries.get(messageId);
      if (state) return { deliveries, state };
    }
    return { deliveries: null, state: null };
  }

  private getOrCreatePullGroup(
    queueName: string,
    consumerGroup: string
  ): ConsumerGroup {
    const existingGroup = this.consumerGroups.find(
      group => group.name === consumerGroup && group.topicRegex.test(queueName)
    );
    if (existingGroup) return existingGroup;

    const group: ConsumerGroup = {
      id: `${consumerGroup}::${queueName}`,
      name: consumerGroup,
      topicPattern: queueName,
      topicRegex: topicPatternToRegex(queueName),
      retryAfterMs: DEFAULT_RETRY_AFTER,
      maxDeliveries: DEFAULT_MAX_DELIVERIES,
      initialDelayMs: DEFAULT_INITIAL_DELAY,
    };
    const deliveries = new Map<string, DeliveryState>();
    for (const message of this.messages.values()) {
      if (message.queueName !== queueName || this.isMessageExpired(message)) {
        continue;
      }
      deliveries.set(message.messageId, {
        status: 'pending',
        deliveryCount: 0,
        receiptHandle: '',
        visibleAt: message.visibleAt,
        leaseExpiresAt: 0,
      });
    }
    this.consumerGroups.push(group);
    this.deliveryState.set(group.id, deliveries);
    return group;
  }

  private isMessageExpired(message: StoredMessage, now = Date.now()): boolean {
    return new Date(message.createdAt).getTime() + message.retentionMs < now;
  }

  private deleteMessage(messageId: string): void {
    this.messages.delete(messageId);
    for (const groupDeliveries of this.deliveryState.values()) {
      groupDeliveries.delete(messageId);
    }
  }

  private createRetainedDeliveries(
    group: ConsumerGroup
  ): Map<string, DeliveryState> {
    const deliveries = new Map<string, DeliveryState>();
    for (const message of this.messages.values()) {
      if (
        !group.topicRegex.test(message.queueName) ||
        this.isMessageExpired(message)
      ) {
        continue;
      }
      deliveries.set(message.messageId, {
        status: 'pending',
        deliveryCount: 0,
        receiptHandle: '',
        visibleAt: Math.max(
          message.visibleAt,
          new Date(message.createdAt).getTime() + group.initialDelayMs
        ),
        leaseExpiresAt: 0,
      });
    }
    return deliveries;
  }

  private activatePushGroup(group: ConsumerGroup): void {
    if (!group.serviceOriginFn && !group.resolveFunction) return;

    const now = Date.now();
    const deliveries = this.deliveryState.get(group.id);
    if (!deliveries) return;

    for (const [messageId, state] of deliveries) {
      const message = this.messages.get(messageId);
      if (!message || state.status !== 'pending') continue;

      state.visibleAt = Math.max(
        state.visibleAt,
        new Date(message.createdAt).getTime() + group.initialDelayMs
      );
      if (state.visibleAt <= now) {
        this.dispatchToConsumer(message, group).catch(err => {
          output.debug(`queues: unexpected dispatch error: ${err}`);
        });
      }
    }
  }

  private async dispatchToConsumer(
    message: StoredMessage,
    group: ConsumerGroup
  ): Promise<void> {
    const groupDeliveries = this.deliveryState.get(group.id);
    if (!groupDeliveries) return;

    const state = groupDeliveries.get(message.messageId);
    if (!state || state.status !== 'pending') return;

    if (state.deliveryCount >= group.maxDeliveries) {
      output.debug(
        `queues: message ${message.messageId} exceeded maxDeliveries (${group.maxDeliveries}) for group "${group.name}", dropping`
      );
      groupDeliveries.delete(message.messageId);
      return;
    }

    const upstream = group.serviceOriginFn?.();
    const dispatch = group.resolveFunction?.();
    if (!upstream && !dispatch) {
      // Service not ready yet, retry later
      state.visibleAt = Date.now() + TICK_INTERVAL;
      return;
    }

    const receiptHandle = randomBytes(16).toString('hex');
    state.status = 'in-flight';
    state.receiptHandle = receiptHandle;
    state.deliveryCount++;
    state.leaseExpiresAt = Date.now() + DEFAULT_VISIBILITY_TIMEOUT;

    const now = new Date().toISOString();
    const expiresAt = new Date(
      new Date(message.createdAt).getTime() + message.retentionMs
    ).toISOString();

    output.debug(
      `queues: dispatching v2beta callback to worker "${group.name}"`
    );

    try {
      const request: FunctionInvocationRequest = {
        method: 'POST',
        headers: {
          'content-type': message.contentType,
          'ce-type': 'com.vercel.queue.v2beta',
          'ce-specversion': '1.0',
          'ce-source': `/topic/${message.queueName}/consumer/${group.name}`,
          'ce-id': message.messageId,
          'ce-time': now,
          'ce-vqsmessageid': message.messageId,
          'ce-vqsqueuename': message.queueName,
          'ce-vqsconsumergroup': group.name,
          'ce-vqsreceipthandle': receiptHandle,
          'ce-vqsdeliverycount': String(state.deliveryCount),
          'ce-vqscreatedat': message.createdAt,
          'ce-vqsexpiresat': expiresAt,
          'ce-vqsregion': 'dev1',
        },
        body: message.payload,
      };
      const response = dispatch
        ? await dispatch(request)
        : await directFetch(`${upstream}/`, request);

      // A target removed while its runtime was starting did not receive this
      // delivery. Do not spend an attempt or overwrite a newer polling lease.
      if (response === null) {
        if (
          state.receiptHandle === receiptHandle &&
          state.status === 'in-flight'
        ) {
          state.status = 'pending';
          state.deliveryCount--;
          state.receiptHandle = '';
          state.leaseExpiresAt = 0;
          state.visibleAt = Date.now() + TICK_INTERVAL;
        }
        return;
      }

      if (!response.ok) {
        output.debug(
          `queues: worker "${group.name}" returned ${response.status} for message ${message.messageId}`
        );
        this.handleDeliveryFailure(message.messageId, group, receiptHandle);
      }
    } catch (err) {
      output.debug(
        `queues: failed to dispatch CloudEvent to "${group.name}": ${err}`
      );
      this.handleDeliveryFailure(message.messageId, group, receiptHandle);
    }
  }

  private handleDeliveryFailure(
    messageId: string,
    group: ConsumerGroup,
    receiptHandle: string
  ): void {
    const groupDeliveries = this.deliveryState.get(group.id);
    if (!groupDeliveries) return;

    const state = groupDeliveries.get(messageId);
    if (!state || state.receiptHandle !== receiptHandle) return;

    state.status = 'pending';
    state.visibleAt = Date.now() + group.retryAfterMs;
    state.leaseExpiresAt = 0;
  }

  private tick(): void {
    const now = Date.now();

    for (const [key, record] of this.idempotencyRecords) {
      if (record.expiresAt <= now) {
        this.idempotencyRecords.delete(key);
      }
    }

    for (const [messageId, record] of this.duplicateMessages) {
      if (record.expiresAt <= now) {
        this.duplicateMessages.delete(messageId);
      }
    }

    for (const [messageId, message] of this.messages) {
      if (this.isMessageExpired(message, now)) {
        this.deleteMessage(messageId);
      }
    }

    for (const group of this.consumerGroups) {
      const groupDeliveries = this.deliveryState.get(group.id);
      if (!groupDeliveries) continue;

      for (const [messageId, state] of groupDeliveries) {
        const message = this.messages.get(messageId);

        if (!message) {
          groupDeliveries.delete(messageId);
          continue;
        }

        if (state.status === 'in-flight' && state.leaseExpiresAt <= now) {
          if (state.deliveryCount >= group.maxDeliveries) {
            output.debug(
              `queues: message ${messageId} exceeded maxDeliveries (${group.maxDeliveries}) for group "${group.name}", dropping`
            );
            groupDeliveries.delete(messageId);
          } else {
            state.status = 'pending';
            state.visibleAt =
              group.serviceOriginFn || group.resolveFunction
                ? now + group.retryAfterMs
                : now;
            state.leaseExpiresAt = 0;
          }
          continue;
        }

        // Dispatch pending messages that are now visible
        if (
          state.status === 'pending' &&
          state.visibleAt <= now &&
          (group.serviceOriginFn || group.resolveFunction)
        ) {
          this.dispatchToConsumer(message, group).catch(err => {
            output.debug(`queues: unexpected dispatch error: ${err}`);
          });
        }
      }
    }
  }

  stop(): void {
    clearInterval(this.tickTimer);
  }
}
