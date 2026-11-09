import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';
import { APIError } from '../../../../src/util/errors-ts';
import {
  TunnelError,
  tunnelErrorRows,
} from '../../../../src/util/dev/tunnel/errors';

describe('tunnelErrorRows', () => {
  it("attributes the remote side's words and says where to look", () => {
    const err = new TunnelError('Failed to deploy the tunnel proxy.', {
      remote: { source: 'Deployment', message: '\u001b[31mBuild failed' },
      inspectorUrl: 'https://i/dpl_x',
    });

    expect(tunnelErrorRows(err)).toEqual([
      'Deployment: Build failed',
      '',
      'Inspect the deployment:',
      '  https://i/dpl_x',
    ]);
  });

  it("shows the API's message as the API's", () => {
    const err = new APIError(
      'Too many\ntunnels',
      new Response(null, { status: 429 })
    );

    expect(tunnelErrorRows(err)).toEqual(['Vercel API: Too many\\ntunnels']);
  });

  it('tells what the tunnel service sent from a local failure', () => {
    const sent = new ConnectError('no capacity', Code.Unavailable);
    const local = ConnectError.from(
      new Error('connect ECONNREFUSED'),
      Code.Unavailable
    );

    expect(tunnelErrorRows(sent)).toEqual(['Tunnel service: no capacity']);
    expect(tunnelErrorRows(local)).toEqual(['Reason: connect ECONNREFUSED']);
  });

  it('strips any other error onto one row', () => {
    expect(tunnelErrorRows(new Error('a\u200Bb\nc'))).toEqual([
      'Reason: ab\\nc',
    ]);
  });
});
