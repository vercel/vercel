import { getConnectorMetadata } from '../connector.js';
import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../token.js';

export type SendblueFromNumber = string | (() => Promise<string>);

/** Shared token parameters accepted by Sendblue Connect helpers. */
export type ConnectSendblueParams = Omit<ConnectTokenParams, 'subject'> & {
  /** Select a Sendblue line when the connector owns more than one. */
  fromNumber?: SendblueFromNumber;
};

/** Shared Connect-backed Sendblue credentials and line resolvers. */
export interface ConnectSendblueConfig {
  accessToken: () => Promise<string>;
  defaultFromNumber: () => Promise<string>;
  allowedFromNumbers: () => Promise<readonly string[]>;
}

/** Reads non-empty Sendblue line numbers from Connect connector metadata. */
export function readPhoneNumbers(vendor: Record<string, unknown>): string[] {
  const lines = vendor.lines;
  if (!Array.isArray(lines)) return [];

  const phoneNumbers: string[] = [];
  for (const line of lines) {
    if (typeof line !== 'object' || line === null) return [];
    const phoneNumber = (line as { phone_number?: unknown }).phone_number;
    if (typeof phoneNumber !== 'string' || phoneNumber.length === 0) return [];
    phoneNumbers.push(phoneNumber);
  }
  return phoneNumbers;
}

/** Resolvers for a selected Sendblue line and every line managed by Connect. */
export interface SendblueLineResolvers {
  fromNumber: () => Promise<string>;
  allowedFromNumbers: () => Promise<readonly string[]>;
}

/**
 * Builds shared lazy resolvers for the connector's managed Sendblue lines.
 * An explicit selected line must be one of the managed lines; when no line is
 * selected, Connect's sole line is used automatically.
 */
export function createSendblueLineResolvers(
  connector: string,
  fromNumber: SendblueFromNumber | undefined,
  options?: ConnectOptions
): SendblueLineResolvers {
  let pending: Promise<string[]> | undefined;
  let resolved: string[] | undefined;

  function resolveAllowedFromNumbers(): Promise<readonly string[]> {
    if (resolved !== undefined) return Promise.resolve(resolved);
    if (!pending) {
      pending = getConnectorMetadata(connector, options)
        .then(metadata => {
          const phoneNumbers = readPhoneNumbers(metadata.vendor);
          if (phoneNumbers.length === 0) {
            throw new Error(
              `Vercel Connect connector ${connector} has no Sendblue lines.`
            );
          }
          resolved = phoneNumbers;
          return phoneNumbers;
        })
        .finally(() => {
          pending = undefined;
        });
    }
    return pending;
  }

  async function resolveFromNumber(): Promise<string> {
    const phoneNumbers = await resolveAllowedFromNumbers();
    const selected =
      typeof fromNumber === 'function' ? await fromNumber() : fromNumber;
    if (selected === undefined) {
      if (phoneNumbers.length === 1) return phoneNumbers[0]!;
      throw new Error(
        `Vercel Connect connector ${connector} has multiple Sendblue lines. Pass fromNumber to select one.`
      );
    }
    if (!phoneNumbers.includes(selected)) {
      throw new Error(
        `Vercel Connect connector ${connector} did not authorize Sendblue line ${selected}.`
      );
    }
    return selected;
  }

  return {
    fromNumber: resolveFromNumber,
    allowedFromNumbers: resolveAllowedFromNumbers,
  };
}

/** Resolves an explicit Sendblue line, or the connector's sole managed line. */
export function createSendblueFromNumberResolver(
  connector: string,
  fromNumber: SendblueFromNumber | undefined,
  options?: ConnectOptions
): () => Promise<string> {
  return createSendblueLineResolvers(connector, fromNumber, options).fromNumber;
}

/**
 * Builds the shared credential and line configuration for Sendblue Connect
 * integrations. Callers add the webhook verifier required by their runtime.
 */
export function createConnectSendblueConfig(
  connector: string,
  params: ConnectSendblueParams = {},
  options?: ConnectOptions
): ConnectSendblueConfig {
  const { fromNumber, ...tokenParams } = params;
  const { fromNumber: defaultFromNumber, allowedFromNumbers } =
    createSendblueLineResolvers(connector, fromNumber, options);

  return {
    accessToken: () =>
      getToken(
        connector,
        { ...tokenParams, subject: { type: 'app' } },
        options
      ),
    defaultFromNumber,
    allowedFromNumbers,
  };
}
