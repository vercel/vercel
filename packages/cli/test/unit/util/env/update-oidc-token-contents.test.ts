import { describe, expect, it } from 'vitest';
import { updateOidcTokenContents } from '../../../../src/util/env/update-oidc-token-contents';

describe('updateOidcTokenContents', () => {
  it('appends one OIDC token without changing existing variables', () => {
    const existing = 'LOCAL_ONLY=value\nSPECIAL_FLAG=local-value\n';

    expect(updateOidcTokenContents(existing, 'fresh-token')).toBe(
      `${existing}\n# Created by Vercel CLI\nVERCEL_OIDC_TOKEN="fresh-token"\n`
    );
  });

  it('appends after a file without a final newline', () => {
    expect(updateOidcTokenContents('LOCAL_ONLY=value', 'fresh-token')).toBe(
      'LOCAL_ONLY=value\n\n# Created by Vercel CLI\nVERCEL_OIDC_TOKEN="fresh-token"\n'
    );
  });

  it('replaces an exported token while preserving CRLF and other bytes', () => {
    const existing =
      '\uFEFFLOCAL_ONLY=value\r\nexport VERCEL_OIDC_TOKEN = "stale-token"\r\nTAIL=keep';

    expect(updateOidcTokenContents(existing, 'fresh-token')).toBe(
      '\uFEFFLOCAL_ONLY=value\r\nVERCEL_OIDC_TOKEN="fresh-token"\r\nTAIL=keep'
    );
  });

  it('removes duplicate OIDC token assignments', () => {
    const existing =
      'VERCEL_OIDC_TOKEN=stale-one\nLOCAL_ONLY=value\n  export VERCEL_OIDC_TOKEN=stale-two\nTAIL=keep\n';

    expect(updateOidcTokenContents(existing, 'fresh-token')).toBe(
      'VERCEL_OIDC_TOKEN="fresh-token"\nLOCAL_ONLY=value\nTAIL=keep\n'
    );
  });

  it('removes stale OIDC assignments when no token is returned', () => {
    const existing =
      'LOCAL_ONLY=value\nVERCEL_OIDC_TOKEN=stale-token\nTAIL=keep\n';

    expect(updateOidcTokenContents(existing, undefined)).toBe(
      'LOCAL_ONLY=value\nTAIL=keep\n'
    );
  });
});
