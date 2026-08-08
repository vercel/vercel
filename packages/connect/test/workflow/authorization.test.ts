import { createWebhook, type Webhook } from 'workflow';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConnectAuthorization } from '../../src/workflow/index.js';

vi.mock('workflow', () => ({
  createWebhook: vi.fn(),
}));

describe('createConnectAuthorization()', () => {
  const dispose = vi.fn();

  beforeEach(() => {
    vi.mocked(createWebhook).mockReturnValue({
      url: 'https://example.com/.well-known/workflow/v1/webhook/token',
      [Symbol.dispose]: dispose,
    } as unknown as Webhook<Request>);
  });

  it('uses server completion for an HTTPS Workflow webhook', () => {
    const response = new Response('Authorization complete');
    const authorization = createConnectAuthorization({ respondWith: response });

    expect(createWebhook).toHaveBeenCalledWith({ respondWith: response });
    expect(authorization.startOptions).toEqual({
      webhook: 'https://example.com/.well-known/workflow/v1/webhook/token',
    });

    authorization[Symbol.dispose]();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('uses only the browser callback for a local HTTP Workflow webhook', () => {
    vi.mocked(createWebhook).mockReturnValue({
      url: 'http://localhost:3000/.well-known/workflow/v1/webhook/token',
      [Symbol.dispose]: dispose,
    } as unknown as Webhook<Request>);

    const authorization = createConnectAuthorization();

    expect(authorization.startOptions).toEqual({
      callbackUrl:
        'http://localhost:3000/.well-known/workflow/v1/webhook/token',
    });
  });
});
