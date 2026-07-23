import { describe, it, expect, vi } from 'vitest';
import { verifyWorldIDProof, getWorldIDVerificationURL } from './world-id';

describe('verifyWorldIDProof', () => {
  it('returns success: true on valid proof', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const result = await verifyWorldIDProof(
      {
        nullifier_hash: '0xabc123',
        proof: '0xproof',
        merkle_root: '0xroot',
      },
      {
        app_id: 'app_test',
        action: 'verify-human',
        rp_id: 'rp_test',
      }
    );

    expect(result.success).toBe(true);
    expect(result.nullifier_hash).toBe('0xabc123');
  });

  it('returns success: false on failed proof', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ code: 'invalid_proof', detail: 'The proof is invalid' }),
    } as Response);

    const result = await verifyWorldIDProof(
      { nullifier_hash: '0xbad', proof: '0xbad', merkle_root: '0xbad' },
      { app_id: 'app_test', action: 'verify-human' }
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('invalid_proof');
  });
});

describe('getWorldIDVerificationURL', () => {
  it('builds a correct verification URL', () => {
    const url = getWorldIDVerificationURL({
      app_id: 'app_test',
      action: 'verify-human',
      signal: 'user_123',
      redirect_url: 'https://myapp.com/callback',
    });

    expect(url).toContain('https://world.id/verify');
    expect(url).toContain('app_id=app_test');
    expect(url).toContain('action=verify-human');
    expect(url).toContain('signal=user_123');
  });
});
