import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveAgentDetector } from '../../src/gateways/agent-detector';
import { liveCliConfigStore } from '../../src/gateways/cli-config-store';
import { liveErrorReporter } from '../../src/gateways/error-reporter';
import { liveIdentityGateway } from '../../src/gateways/identity-gateway';
import {
  liveCliContext,
  scopeContextFromClient,
} from '../../src/gateways/live-context';
import { liveLocalWorkspace } from '../../src/gateways/local-workspace';
import { liveProjectLinkStore } from '../../src/gateways/project-link-store';
import { liveTelemetryGateway } from '../../src/gateways/telemetry-gateway';
import { liveTokenIntrospectionGateway } from '../../src/gateways/token-introspection-gateway';
import { liveWorkingDirectory } from '../../src/gateways/working-directory';
import type Client from '../../src/util/client';
import getGlobalPathConfig from '../../src/util/config/global-path';

// Each factory returns a tagged stub so the test checks wiring only.
vi.mock('../../src/util/config/global-path', () => ({ default: vi.fn() }));
vi.mock('../../src/gateways/agent-detector', () => ({
  liveAgentDetector: vi.fn(() => ({ tag: 'agentDetector' })),
}));
vi.mock('../../src/gateways/cli-config-store', () => ({
  liveCliConfigStore: vi.fn(() => ({ tag: 'cliConfig' })),
}));
vi.mock('../../src/gateways/error-reporter', () => ({
  liveErrorReporter: vi.fn(() => ({ tag: 'errorReporter' })),
}));
vi.mock('../../src/gateways/identity-gateway', () => ({
  liveIdentityGateway: vi.fn(() => ({ tag: 'identity' })),
}));
vi.mock('../../src/gateways/local-workspace', () => ({
  liveLocalWorkspace: vi.fn(() => ({ tag: 'workspace' })),
}));
vi.mock('../../src/gateways/project-link-store', () => ({
  liveProjectLinkStore: vi.fn(() => ({ tag: 'projectLinks' })),
}));
vi.mock('../../src/gateways/telemetry-gateway', () => ({
  liveTelemetryGateway: vi.fn(() => ({ tag: 'telemetry' })),
}));
vi.mock('../../src/gateways/token-introspection-gateway', () => ({
  liveTokenIntrospectionGateway: vi.fn(() => ({ tag: 'tokenIntrospection' })),
}));
vi.mock('../../src/gateways/working-directory', () => ({
  liveWorkingDirectory: vi.fn(() => ({ tag: 'workingDirectory' })),
}));

const globalDir = join('/global', 'vercel');
const client = {
  apiUrl: 'https://api.vercel.com',
  cliConfig: { tag: 'clientCliConfig' },
} as unknown as Client;

describe('liveCliContext (mocked gateway factories)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGlobalPathConfig).mockReturnValue(globalDir);
    vi.spyOn(process, 'cwd').mockReturnValue('/work');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds every bootstrap gateway over the resolved global directory', () => {
    const argv = ['node', 'vc.js', 'whoami', '--global-config', globalDir];

    const context = liveCliContext({ argv, env: {} });

    expect(getGlobalPathConfig).toHaveBeenCalledWith(
      ['whoami', '--global-config', globalDir],
      '/work'
    );
    expect(liveCliConfigStore).toHaveBeenCalledWith({ globalDir });
    expect(liveTelemetryGateway).toHaveBeenCalledWith({
      deviceFilePath: join(globalDir, 'telemetry-device.json'),
      sessionFilePath: join(globalDir, 'telemetry-session.json'),
    });
    expect(context).toMatchObject({
      cliConfig: { tag: 'cliConfig' },
      workspace: { tag: 'workspace' },
      workingDirectory: { tag: 'workingDirectory' },
      agentDetector: { tag: 'agentDetector' },
      telemetry: { tag: 'telemetry' },
      errorReporter: { tag: 'errorReporter' },
      projectLinks: { tag: 'projectLinks' },
    });
    expect(liveLocalWorkspace).toHaveBeenCalledWith();
    expect(liveWorkingDirectory).toHaveBeenCalledWith();
    expect(liveAgentDetector).toHaveBeenCalledWith();
    expect(liveErrorReporter).toHaveBeenCalledWith();
    expect(liveProjectLinkStore).toHaveBeenCalledWith();
  });

  it('builds API gateways only on demand, over the client', () => {
    const context = liveCliContext({ argv: ['node', 'vc.js'], env: {} });
    expect(liveIdentityGateway).not.toHaveBeenCalled();

    expect(context.createApiGateways({ client })).toEqual({
      identity: { tag: 'identity' },
      tokenIntrospection: { tag: 'tokenIntrospection' },
    });
    expect(liveIdentityGateway).toHaveBeenCalledWith({ api: client });
    expect(liveTokenIntrospectionGateway).toHaveBeenCalledWith({
      apiUrl: client.apiUrl,
    });
  });
});

describe('scopeContextFromClient (mocked gateway factories)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the scope context from the client and its config store', () => {
    expect(scopeContextFromClient(client)).toEqual({
      identity: { tag: 'identity' },
      tokenIntrospection: { tag: 'tokenIntrospection' },
      projectLinks: { tag: 'projectLinks' },
      cliConfig: { tag: 'clientCliConfig' },
    });
    expect(liveIdentityGateway).toHaveBeenCalledWith({ api: client });
    expect(liveTokenIntrospectionGateway).toHaveBeenCalledWith({
      apiUrl: client.apiUrl,
    });
  });
});
