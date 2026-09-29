import { join } from 'path';
import type Client from '../util/client';
import getGlobalPathConfig from '../util/config/global-path';
import { liveAgentDetector } from './agent-detector';
import { liveCliConfigStore } from './cli-config-store';
import type {
  ApiGateways,
  CliContext,
  ScopeResolutionContext,
} from './context';
import { liveErrorReporter } from './error-reporter';
import { liveIdentityGateway } from './identity-gateway';
import { liveLocalWorkspace } from './local-workspace';
import { liveProjectLinkStore } from './project-link-store';
import { liveTelemetryGateway } from './telemetry-gateway';
import { liveTokenIntrospectionGateway } from './token-introspection-gateway';
import { liveWorkingDirectory } from './working-directory';

/**
 * Production composition root: builds every live gateway for one CLI
 * invocation. Cheap to construct; gateways do no I/O until called.
 */
export function liveCliContext({
  argv,
}: {
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
}): CliContext {
  // Same value `util/config/files.ts` computes at import time.
  const globalDir = getGlobalPathConfig(argv.slice(2), process.cwd());

  return {
    cliConfig: liveCliConfigStore({ globalDir }),
    workspace: liveLocalWorkspace(),
    workingDirectory: liveWorkingDirectory(),
    agentDetector: liveAgentDetector(),
    telemetry: liveTelemetryGateway({
      deviceFilePath: join(globalDir, 'telemetry-device.json'),
      sessionFilePath: join(globalDir, 'telemetry-session.json'),
    }),
    errorReporter: liveErrorReporter(),
    projectLinks: liveProjectLinkStore(),
    createApiGateways: ({ client }) => liveApiGateways(client),
  };
}

function liveApiGateways(client: Client): ApiGateways {
  return {
    identity: liveIdentityGateway({ api: client }),
    tokenIntrospection: liveTokenIntrospectionGateway({
      apiUrl: client.apiUrl,
    }),
  };
}

/**
 * Legacy bridge: builds a scope-resolution context of live gateways from a
 * `Client`. Used by the legacy `getScope`/`getUser` wrappers and as the
 * default context of migrated commands.
 */
export function scopeContextFromClient(client: Client): ScopeResolutionContext {
  return {
    ...liveApiGateways(client),
    projectLinks: liveProjectLinkStore(),
    cliConfig: client.cliConfig,
  };
}
