import { describe, expect, it } from 'vitest';
import { connect } from '../../src/betterauth/connect-provider.js';

describe('Better Auth connect provider', () => {
  it('requests OpenID profile and email scopes by default', () => {
    const provider = connect({
      providerId: 'linear',
      connector: 'oauth/linear',
    });

    expect(provider.scopes).toEqual([
      'openid',
      'profile',
      'email',
      'offline_access',
    ]);
  });
});
