import type {
  TelemetryFlushPayload,
  TelemetryGateway,
} from '../../src/gateways/telemetry-gateway';
import type { PersistedCliSession } from '../../src/util/telemetry/session';
import type { VercelPluginActiveSessionMarker } from '../../src/util/telemetry/vercel-plugin';

export type FakeTelemetryGatewayState = {
  deviceId?: string;
  session?: PersistedCliSession;
  pluginMarker?: VercelPluginActiveSessionMarker | null;
};

/** In-memory telemetry host. Records delivered payloads instead of spawning. */
export class FakeTelemetryGateway implements TelemetryGateway {
  #deviceId: string;
  #session: PersistedCliSession;
  #pluginMarker: VercelPluginActiveSessionMarker | null;
  #sent: TelemetryFlushPayload[] = [];

  constructor(state: FakeTelemetryGatewayState = {}) {
    this.#deviceId = state.deviceId ?? 'device_fake';
    this.#session = { ...(state.session ?? fakeSession()) };
    this.#pluginMarker = state.pluginMarker ? { ...state.pluginMarker } : null;
  }

  /** Payloads delivered so far, in order. */
  get sent(): TelemetryFlushPayload[] {
    return structuredClone(this.#sent);
  }

  /** The stored session. */
  get session(): PersistedCliSession {
    return { ...this.#session };
  }

  loadDeviceId(): string {
    return this.#deviceId;
  }

  loadSession(): PersistedCliSession {
    return { ...this.#session };
  }

  touchSession({
    session,
  }: {
    session: PersistedCliSession;
  }): PersistedCliSession {
    this.#session = { ...session, lastSeenAt: session.lastSeenAt + 1 };
    return { ...this.#session };
  }

  readPluginSessionMarker(): VercelPluginActiveSessionMarker | null {
    return this.#pluginMarker ? { ...this.#pluginMarker } : null;
  }

  async send({ payload }: { payload: TelemetryFlushPayload; debug: boolean }) {
    this.#sent.push(structuredClone(payload));
  }
}

function fakeSession(): PersistedCliSession {
  return { id: 'session_fake', createdAt: 0, lastSeenAt: 0 };
}
