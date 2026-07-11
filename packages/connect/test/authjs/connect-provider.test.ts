import { describe, expect, it } from 'vitest';
import { connect } from '../../src/authjs/connect-provider.js';

describe('Auth.js connect provider', () => {
  it('requests OpenID profile and email scopes by default', () => {
    const provider = connect({
      id: 'linear',
      name: 'Linear',
      connector: 'oauth/linear',
    });

    expect(provider.authorization).toMatchObject({
      params: {
        scope: 'openid profile email offline_access',
      },
    });
  });
});
