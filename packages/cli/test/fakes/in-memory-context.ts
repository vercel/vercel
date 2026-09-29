import { resolve } from 'path';
import type { CliContext } from '../../src/gateways/context';
import type { AgentDetection } from '../../src/gateways/agent-detector';
import { FakeAgentDetector } from './fake-agent-detector';
import {
  FakeCliConfigStore,
  type FakeCliConfigStoreState,
} from './fake-cli-config-store';
import { FakeErrorReporter } from './fake-error-reporter';
import {
  FakeIdentityGateway,
  type FakeIdentityGatewayState,
} from './fake-identity-gateway';
import {
  FakeLocalWorkspace,
  type FakeLocalWorkspaceState,
} from './fake-local-workspace';
import {
  FakeProjectLinkStore,
  type FakeProjectLinkStoreState,
} from './fake-project-link-store';
import {
  FakeTelemetryGateway,
  type FakeTelemetryGatewayState,
} from './fake-telemetry-gateway';
import {
  FakeTokenIntrospectionGateway,
  type FakeTokenIntrospectionState,
} from './fake-token-introspection-gateway';
import { FakeWorkingDirectory } from './fake-working-directory';

/** Constructor state for every fake in the CLI context. */
export type InMemoryCliState = {
  /** Working directory. Defaults to `/work` (resolved for the platform). */
  cwd?: string;
  /**
   * Global config dir, `config.json` and credentials. By default
   * `config.json` exists with telemetry disabled and there are no
   * credentials (logged out).
   */
  cliConfig?: FakeCliConfigStoreState;
  workspace?: FakeLocalWorkspaceState;
  agent?: AgentDetection;
  telemetry?: FakeTelemetryGatewayState;
  projectLinks?: FakeProjectLinkStoreState;
  identity?: FakeIdentityGatewayState;
  introspection?: FakeTokenIntrospectionState;
};

export type InMemoryFakes = {
  cliConfig: FakeCliConfigStore;
  workspace: FakeLocalWorkspace;
  workingDirectory: FakeWorkingDirectory;
  agentDetector: FakeAgentDetector;
  telemetry: FakeTelemetryGateway;
  errorReporter: FakeErrorReporter;
  projectLinks: FakeProjectLinkStore;
  identity: FakeIdentityGateway;
  tokenIntrospection: FakeTokenIntrospectionGateway;
};

/** Default working directory for in-memory scenarios. */
export const DEFAULT_CWD = resolve('/work');

/** Builds a `CliContext` backed entirely by in-memory fakes. */
export function inMemoryContext(state: InMemoryCliState = {}): {
  context: CliContext;
  fakes: InMemoryFakes;
} {
  const fakes: InMemoryFakes = {
    cliConfig: new FakeCliConfigStore({
      globalConfig: { telemetry: { enabled: false } },
      authConfig: 'missing',
      ...state.cliConfig,
    }),
    workspace: new FakeLocalWorkspace(state.workspace),
    workingDirectory: new FakeWorkingDirectory({
      cwd: state.cwd ?? DEFAULT_CWD,
    }),
    agentDetector: new FakeAgentDetector(state.agent),
    telemetry: new FakeTelemetryGateway(state.telemetry),
    errorReporter: new FakeErrorReporter(),
    projectLinks: new FakeProjectLinkStore(state.projectLinks),
    identity: new FakeIdentityGateway(state.identity),
    tokenIntrospection: new FakeTokenIntrospectionGateway(state.introspection),
  };

  const context: CliContext = {
    cliConfig: fakes.cliConfig,
    workspace: fakes.workspace,
    workingDirectory: fakes.workingDirectory,
    agentDetector: fakes.agentDetector,
    telemetry: fakes.telemetry,
    errorReporter: fakes.errorReporter,
    projectLinks: fakes.projectLinks,
    createApiGateways: () => ({
      identity: fakes.identity,
      tokenIntrospection: fakes.tokenIntrospection,
    }),
  };

  return { context, fakes };
}
