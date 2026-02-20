import { describe, expect, it, vi } from 'vitest';
import { fetchInstallationPrepaymentInfo } from '../../../../src/util/integration/fetch-installation-prepayment-info';

describe('fetchInstallationPrepaymentInfo', () => {
  it('constructs URL with correct teamId query parameter', async () => {
    const mockFetch = vi.fn().mockResolvedValue({});
    const mockClient = { fetch: mockFetch } as any;

    await fetchInstallationPrepaymentInfo(
      mockClient,
      'team_dummy',
      'install_123'
    );

    expect(mockFetch).toHaveBeenCalledWith(
      '/v1/integrations/installations/install_123/billing/balance?teamId=team_dummy',
      { json: true }
    );
  });
});
