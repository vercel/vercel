// In-memory queue broker for local development.

import ms from 'ms';
import { randomBytes } from 'crypto';
import nodeFetch from 'node-fetch';
import type { Service } from '@vercel/fs-detectors';
import output from '../../output-manager';

interface StoredMessage {
  messageId: string;
  payload: Buffer;
  contentType: string;
  queueName: string;
  createdAt: string;
  retentionMs: number;
}

interface ConsumerGroup {
  name: string;
  topicPattern: string;
  topicRegex: RegExp;
  serviceOriginFn: () => string | null;
  retryAfterMs: number;
  maxDeliveries: number;
  initialDelayMs: number;
}

type DeliveryStatus = 'pending' | 'in-flight' | 'acked';

interface DeliveryState {
  status: DeliveryStatus;
  deliveryCount: number;
  ticket: string;
  visibleAt: number;
  leaseExpiresAt: number;
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
}

export class QueueBroker {
  private messages = new Map<string, StoredMessage>();
  private consumerGroups: ConsumerGroup[] = [];
  private deliveryState = new Map<string, Map<string, DeliveryState>>();
  private tickTimer: ReturnType<typeof setInterval>;

  constructor(
    services: Service[],
    private getServiceOrigin: (name: string) => string | null
  ) {
    for (const service of services) {
      if (service.type !== 'worker') continue;

      const topicPattern = service.topic || 'default';
      const group: ConsumerGroup = {
        name: service.name,
        topicPattern,
        topicRegex: topicPatternToRegex(topicPattern),
        serviceOriginFn: () => this.getServiceOrigin(service.name),
        retryAfterMs: DEFAULT_RETRY_AFTER,
        maxDeliveries: DEFAULT_MAX_DELIVERIES,
        initialDelayMs: DEFAULT_INITIAL_DELAY,
      };

      this.consumerGroups.push(group);
      this.deliveryState.set(group.name, new Map());
    }

    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL);
    this.tickTimer.unref();
  }

  enqueue(
    queueName: string,
    payload: Buffer,
    contentType: string,
    options?: EnqueueOptions
  ): { messageId: string } {
    const messageId = randomBytes(16).toString('hex');
    const retentionMs =
      (options?.retentionSeconds ?? 0) > 0
        ? options!.retentionSeconds! * 1000
        : DEFAULT_RETENTION;

    const message: StoredMessage = {
      messageId,
      payload,
      contentType,
      queueName,
      createdAt: new Date().toISOString(),
      retentionMs,
    };

    this.messages.set(messageId, message);
    output.debug(
      `queues: stored message ${messageId} for queue "${queueName}"`
    );

    const delaySeconds = options?.delaySeconds ?? 0;
    const matchingGroups = this.consumerGroups.filter(g =>
      g.topicRegex.test(queueName)
    );

    if (matchingGroups.length === 0) {
      output.debug(
        `queues: no consumer group matches topic "${queueName}", message stored but not dispatched`
      );
    }

    for (const group of matchingGroups) {
      const groupDeliveries = this.deliveryState.get(group.name)!;
      const delayMs = delaySeconds > 0 ? delaySeconds * 1000 : 0;
      const effectiveDelayMs = Math.max(delayMs, group.initialDelayMs);
      const visibleAt =
        effectiveDelayMs > 0 ? Date.now() + effectiveDelayMs : 0;

      groupDeliveries.set(messageId, {
        status: 'pending',
        deliveryCount: 0,
        ticket: '',
        visibleAt,
        leaseExpiresAt: 0,
      });

      // If no delay, dispatch immediately
      if (visibleAt === 0) {
        this.dispatchToConsumer(message, group).catch(err => {
          output.debug(`queues: unexpected dispatch error: ${err}`);
        });
      }
    }

    return { messageId };
  }

  receiveById(
    messageId: string,
    consumerGroup: string
  ): {
    payload: Buffer;
    contentType: string;
    deliveryCount: number;
    createdAt: string;
    ticket: string;
  } | null {
    const message = this.messages.get(messageId);
    if (!message) return null;

    const groupDeliveries = this.deliveryState.get(consumerGroup);
    if (!groupDeliveries) return null;

    const state = groupDeliveries.get(messageId);
    if (!state) return null;

    return {
      payload: message.payload,
      contentType: message.contentType,
      deliveryCount: state.deliveryCount,
      createdAt: message.createdAt,
      ticket: state.ticket,
    };
  }

  acknowledge(
    messageId: string,
    consumerGroup: string,
    ticket: string
  ): boolean {
    const groupDeliveries = this.deliveryState.get(consumerGroup);
    if (!groupDeliveries) return false;

    const state = groupDeliveries.get(messageId);
    if (!state) return false;

    if (state.ticket && state.ticket !== ticket) {
      output.debug(
        `queues: ACK rejected for ${messageId} in group "${consumerGroup}" - ticket mismatch`
      );
      return false;
    }

    state.status = 'acked';
    groupDeliveries.delete(messageId);
    output.debug(
      `queues: ACK message ${messageId} in group "${consumerGroup}"`
    );

    // Clean up message if acked in all groups
    this.maybeCleanupMessage(messageId);
    return true;
  }

  changeVisibility(
    messageId: string,
    consumerGroup: string,
    ticket: string,
    timeoutSeconds: number
  ): boolean {
    const groupDeliveries = this.deliveryState.get(consumerGroup);
    if (!groupDeliveries) return false;

    const state = groupDeliveries.get(messageId);
    if (!state || state.status !== 'in-flight') return false;

    if (state.ticket && state.ticket !== ticket) return false;

    state.leaseExpiresAt = Date.now() + timeoutSeconds * 1000;
    output.debug(
      `queues: visibility for ${messageId} in group "${consumerGroup}" extended by ${timeoutSeconds}s`
    );
    return true;
  }

  private async dispatchToConsumer(
    message: StoredMessage,
    group: ConsumerGroup
  ): Promise<void> {
    const groupDeliveries = this.deliveryState.get(group.name);
    if (!groupDeliveries) return;

    const state = groupDeliveries.get(message.messageId);
    if (!state || state.status === 'acked') return;

    if (state.deliveryCount >= group.maxDeliveries) {
      output.debug(
        `queues: message ${message.messageId} exceeded maxDeliveries (${group.maxDeliveries}) for group "${group.name}", dropping`
      );
      groupDeliveries.delete(message.messageId);
      this.maybeCleanupMessage(message.messageId);
      return;
    }

    const upstream = group.serviceOriginFn();
    if (!upstream) {
      // Service not ready yet, retry later
      state.visibleAt = Date.now() + group.retryAfterMs;
      return;
    }

    const ticket = randomBytes(16).toString('hex');
    state.status = 'in-flight';
    state.ticket = ticket;
    state.deliveryCount++;
    state.leaseExpiresAt = Date.now() + DEFAULT_VISIBILITY_TIMEOUT;

    const cloudEvent = JSON.stringify({
      type: 'com.vercel.queue.v1beta',
      specversion: '1.0',
      source: 'vc-dev',
      id: message.messageId,
      time: new Date().toISOString(),
      datacontenttype: 'application/json',
      data: {
        queueName: message.queueName,
        consumerGroup: group.name,
        messageId: message.messageId,
      },
    });

    output.debug(
      `queues: dispatching CloudEvent to worker "${group.name}" at ${upstream}`
    );

    try {
      const response = await nodeFetch(`${upstream}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/cloudevents+json' },
        body: cloudEvent,
      });

      if (!response.ok) {
        output.debug(
          `queues: worker "${group.name}" returned ${response.status} for message ${message.messageId}`
        );
        this.handleDeliveryFailure(message.messageId, group);
      }
    } catch (err) {
      output.debug(
        `queues: failed to dispatch CloudEvent to "${group.name}": ${err}`
      );
      this.handleDeliveryFailure(message.messageId, group);
    }
  }

  private handleDeliveryFailure(messageId: string, group: ConsumerGroup): void {
    const groupDeliveries = this.deliveryState.get(group.name);
    if (!groupDeliveries) return;

    const state = groupDeliveries.get(messageId);
    if (!state) return;

    state.status = 'pending';
    state.visibleAt = Date.now() + group.retryAfterMs;
    state.leaseExpiresAt = 0;
  }

  private tick(): void {
    const now = Date.now();

    for (const group of this.consumerGroups) {
      const groupDeliveries = this.deliveryState.get(group.name);
      if (!groupDeliveries) continue;

      for (const [messageId, state] of groupDeliveries) {
        const message = this.messages.get(messageId);

        // Clean up if message expired
        if (message) {
          const expiresAt =
            new Date(message.createdAt).getTime() + message.retentionMs;
          if (expiresAt < now) {
            groupDeliveries.delete(messageId);
            this.maybeCleanupMessage(messageId);
            continue;
          }
        }

        if (!message) {
          groupDeliveries.delete(messageId);
          continue;
        }

        if (state.status === 'in-flight' && state.leaseExpiresAt < now) {
          if (state.deliveryCount >= group.maxDeliveries) {
            output.debug(
              `queues: message ${messageId} exceeded maxDeliveries (${group.maxDeliveries}) for group "${group.name}", dropping`
            );
            groupDeliveries.delete(messageId);
            this.maybeCleanupMessage(messageId);
          } else {
            state.status = 'pending';
            state.visibleAt = now + group.retryAfterMs;
            state.leaseExpiresAt = 0;
          }
          continue;
        }

        // Dispatch pending messages that are now visible
        if (state.status === 'pending' && state.visibleAt <= now) {
          this.dispatchToConsumer(message, group).catch(err => {
            output.debug(`queues: unexpected dispatch error: ${err}`);
          });
        }
      }
    }
  }

  private maybeCleanupMessage(messageId: string): void {
    for (const groupDeliveries of this.deliveryState.values()) {
      if (groupDeliveries.has(messageId)) {
        return;
      }
    }

    // No group references it anymore, safe to remove
    this.messages.delete(messageId);
  }

  stop(): void {
    clearInterval(this.tickTimer);
  }
}
