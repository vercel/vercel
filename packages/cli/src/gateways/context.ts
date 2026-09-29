import type Client from '../util/client';
import type { AgentDetector } from './agent-detector';
import type { CliConfigStore } from './cli-config-store';
import type { ErrorReporter } from './error-reporter';
import type { IdentityGateway } from './identity-gateway';
import type { LocalWorkspaceGateway } from './local-workspace';
import type { ProjectLinkStore } from './project-link-store';
import type { TelemetryGateway } from './telemetry-gateway';
import type { TokenIntrospectionGateway } from './token-introspection-gateway';
import type { WorkingDirectory } from './working-directory';

/** Capabilities that exist before `Client` is constructed. */
export type CliBootstrapContext = {
  cliConfig: CliConfigStore;
  workspace: LocalWorkspaceGateway;
  workingDirectory: WorkingDirectory;
  agentDetector: AgentDetector;
  telemetry: TelemetryGateway;
  errorReporter: ErrorReporter;
  projectLinks: ProjectLinkStore;
};

/**
 * API-backed gateways. They need `Client`'s HTTP pipeline (auth, `teamId`
 * injection, retry, reauthentication).
 */
export type ApiGateways = {
  identity: IdentityGateway;
  tokenIntrospection: TokenIntrospectionGateway;
};

/** Everything `runCli` needs from the outside world. */
export type CliContext = CliBootstrapContext & {
  createApiGateways(input: { client: Client }): ApiGateways;
};

/** Capabilities used by identity and scope resolution. */
export type ScopeResolutionContext = ApiGateways & {
  projectLinks: ProjectLinkStore;
  cliConfig: CliConfigStore;
};
