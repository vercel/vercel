import { describe, expect, it, vi } from 'vitest';
import { DeploymentTracker } from '../../../../src/commands/ship/deployments';
import { StreamRenderer } from '../../../../src/commands/ship/render-stream';

/**
 * What `vercel deploy` prints, trimmed to the relevant lines. Taken from the
 * aligned labels the deploy command emits, so the patterns are matched against
 * the real shape rather than an invented one.
 */
const DEPLOY_OUTPUT = `Vercel CLI 58.4.4
Inspect: https://vercel.com/acme/widget/7Hk2Qw9 [1s]
Preview: https://widget-abc123-acme.vercel.app [12s]
`;

describe('ship deployment tracking', () => {
  it('captures the URL a deploy printed', () => {
    const tracker = new DeploymentTracker();
    tracker.observe('vercel deploy', DEPLOY_OUTPUT);

    expect(tracker.list()).toEqual([
      {
        url: 'https://widget-abc123-acme.vercel.app',
        inspectUrl: 'https://vercel.com/acme/widget/7Hk2Qw9',
        production: false,
      },
    ]);
  });

  it('treats a bare vercel invocation as a deploy', () => {
    const tracker = new DeploymentTracker();
    tracker.observe('vercel --yes', DEPLOY_OUTPUT);

    expect(tracker.list()).toHaveLength(1);
  });

  it('marks a production deploy', () => {
    const tracker = new DeploymentTracker();
    tracker.observe('vercel deploy --prod', DEPLOY_OUTPUT);

    expect(tracker.latest()?.production).toBe(true);
  });

  it('finds a deploy inside a compound command', () => {
    const tracker = new DeploymentTracker();
    tracker.observe(
      'cd api && vercel build && vercel deploy --prebuilt',
      DEPLOY_OUTPUT
    );

    expect(tracker.list()).toHaveLength(1);
  });

  it('ignores URLs from commands that do not deploy', () => {
    const tracker = new DeploymentTracker();
    // `vercel ls` prints existing deployments, none of which this session made.
    tracker.observe('vercel ls', DEPLOY_OUTPUT);
    tracker.observe('vercel inspect https://old.vercel.app', DEPLOY_OUTPUT);
    tracker.observe(
      'curl https://widget-abc123-acme.vercel.app',
      DEPLOY_OUTPUT
    );
    tracker.observe('cat README.md', DEPLOY_OUTPUT);

    expect(tracker.list()).toEqual([]);
  });

  it('ignores a deploy that produced no URL', () => {
    const tracker = new DeploymentTracker();
    tracker.observe('vercel deploy', 'Error: no project linked');

    expect(tracker.list()).toEqual([]);
  });

  it('reports the most recent deployment last', () => {
    const tracker = new DeploymentTracker();
    tracker.observe('vercel deploy', DEPLOY_OUTPUT);
    tracker.observe(
      'vercel deploy',
      'Preview: https://widget-def456-acme.vercel.app'
    );

    expect(tracker.list().map(d => d.url)).toEqual([
      'https://widget-abc123-acme.vercel.app',
      'https://widget-def456-acme.vercel.app',
    ]);
    expect(tracker.latest()?.url).toBe('https://widget-def456-acme.vercel.app');
  });

  it('does not repeat a URL printed more than once', () => {
    const tracker = new DeploymentTracker();
    tracker.observe(
      'vercel deploy',
      `${DEPLOY_OUTPUT}\nQueued https://widget-abc123-acme.vercel.app`
    );

    expect(tracker.list()).toHaveLength(1);
  });

  it('fills in an inspect URL that arrived with a later mention', () => {
    const tracker = new DeploymentTracker();
    tracker.observe('vercel deploy', 'https://widget-abc123-acme.vercel.app');
    tracker.observe('vercel deploy', DEPLOY_OUTPUT);

    expect(tracker.latest()?.inspectUrl).toBe(
      'https://vercel.com/acme/widget/7Hk2Qw9'
    );
  });

  it('promotes a deployment later redeployed to production', () => {
    const tracker = new DeploymentTracker();
    tracker.observe('vercel deploy', DEPLOY_OUTPUT);
    tracker.observe('vercel deploy --prod', DEPLOY_OUTPUT);

    expect(tracker.list()).toHaveLength(1);
    expect(tracker.latest()?.production).toBe(true);
  });

  it('ignores a tool call that is not a shell command', () => {
    const tracker = new DeploymentTracker();
    tracker.observe(undefined, DEPLOY_OUTPUT);

    expect(tracker.list()).toEqual([]);
  });
});

describe('capture through the stream renderer', () => {
  it('pairs a deploy command with the output of that call', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const tracker = new DeploymentTracker();
    const renderer = new StreamRenderer();
    renderer.trackDeployments(tracker);

    renderer.render({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'bash',
      input: { command: 'vercel deploy --yes' },
    });
    renderer.render({
      type: 'tool-result',
      toolCallId: 'c1',
      toolName: 'bash',
      output: `${DEPLOY_OUTPUT}`,
    });

    expect(tracker.latest()).toEqual({
      url: 'https://widget-abc123-acme.vercel.app',
      inspectUrl: 'https://vercel.com/acme/widget/7Hk2Qw9',
      production: false,
    });
  });

  it('ignores a failed deploy, which printed no working URL', () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const tracker = new DeploymentTracker();
    const renderer = new StreamRenderer();
    renderer.trackDeployments(tracker);

    renderer.render({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'bash',
      input: { command: 'vercel deploy' },
    });
    renderer.render({
      type: 'tool-error',
      toolCallId: 'c1',
      toolName: 'bash',
      error: DEPLOY_OUTPUT,
    });

    expect(tracker.list()).toEqual([]);
  });
});
