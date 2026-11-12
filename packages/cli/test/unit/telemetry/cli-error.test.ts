import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Diagnostic } from 'nostics';
import {
  cliErrorFromUnknown,
  recordCliError,
  recordCliErrorFromOutput,
  peekCliError,
  takeCliError,
} from '../../../src/util/telemetry/cli-error';
import { writeAgentError } from '../../../src/util/agent-output';
import { printError } from '../../../src/util/error';
import output from '../../../src/output-manager';
import { client } from '../../mocks/client';

describe('cli error recording', () => {
  beforeEach(() => {
    takeCliError();
    vi.spyOn(output, 'print').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads code, status, slug and action off an error', () => {
    const err = Object.assign(new Error('Project not found'), {
      code: 'not_found',
      status: 404,
      slug: 'project-not-found',
      action: 'Learn More',
    });

    expect(cliErrorFromUnknown(err)).toEqual({
      code: 'not_found',
      status: 404,
      slug: 'project-not-found',
      action: 'Learn More',
      serverMessage: undefined,
    });
  });

  it('reads the message only when asked', () => {
    const err = new Error('Project not found');
    const apiErr = Object.assign(new Error('Forbidden (403)'), {
      serverMessage: 'Forbidden',
    });

    expect(
      cliErrorFromUnknown(err, { includeMessage: true }).serverMessage
    ).toBe('Project not found');
    expect(
      cliErrorFromUnknown(apiErr, { includeMessage: true }).serverMessage
    ).toBe('Forbidden');
  });

  it('never records the message of a printed error', () => {
    printError(
      new Error('Invalid field format: vca_secret. Expected key=value')
    );
    output.prettyError(new Error('Could not read /Users/someone/.env'));

    expect(JSON.stringify(takeCliError())).not.toMatch(
      /vca_secret|\/Users\/someone/
    );
  });

  it('uses the name of a Diagnostic as its code', () => {
    const err = new Diagnostic({ why: 'The dev command exited.' });
    err.name = 'DEV_COMMAND_EXITED';

    expect(cliErrorFromUnknown(err).code).toBe('DEV_COMMAND_EXITED');
  });

  it('uses the class name of an error with no code', () => {
    expect(cliErrorFromUnknown(new TypeError('x is undefined')).code).toBe(
      'TypeError'
    );
    expect(cliErrorFromUnknown(new Error('plain')).code).toBeUndefined();
  });

  it('keeps the first error that has a code', () => {
    recordCliError({ slug: 'first' });
    recordCliError({ code: 'not_found' });
    recordCliError({ code: 'forbidden' });
    recordCliError({ slug: 'last' });

    expect(peekCliError()).toEqual({ code: 'not_found' });
    expect(takeCliError()).toEqual({ code: 'not_found' });
    expect(takeCliError()).toBeUndefined();
  });

  it('lets a thrown error replace an earlier one', () => {
    recordCliError({ code: 'not_found' });
    recordCliError({ code: 'ETIMEDOUT' }, { override: true });

    expect(takeCliError()).toEqual({ code: 'ETIMEDOUT' });
  });

  it('records the slug but not the text of output.error', () => {
    output.error('Could not read /Users/someone/project', 'missing-file');

    expect(takeCliError()).toEqual({ slug: 'missing-file' });
  });

  it('records errors passed to output.prettyError', () => {
    output.prettyError(
      Object.assign(new Error('Team was deleted'), { code: 'TEAM_DELETED' })
    );

    expect(takeCliError()).toMatchObject({ code: 'TEAM_DELETED' });
  });

  it('records errors passed to printError', () => {
    printError(
      Object.assign(new Error('Deployment not found'), {
        code: 'DEPLOYMENT_NOT_FOUND',
      })
    );

    expect(takeCliError()).toMatchObject({ code: 'DEPLOYMENT_NOT_FOUND' });
  });

  it('records the reason of an agent error payload without its message', () => {
    client.reset();
    writeAgentError(client, {
      status: 'error',
      reason: 'project_not_found',
      message: 'Project my-secret-project was not found',
    });

    expect(takeCliError()).toEqual({
      code: 'project_not_found',
      reportOnSuccess: true,
    });
  });

  it('records output.fatal without its text', () => {
    output.fatal('Could not read /Users/someone/project');

    expect(takeCliError()).toEqual({});
  });

  it('records the reason of an error payload written to stdout', () => {
    recordCliErrorFromOutput(
      `${JSON.stringify(
        { status: 'error', reason: 'not_domain_owner', message: 'secret.dev' },
        null,
        2
      )}\n`
    );

    expect(takeCliError()).toEqual({ code: 'not_domain_owner' });
  });

  it('records the reason of an action_required payload written to stdout', () => {
    recordCliErrorFromOutput(
      JSON.stringify({ status: 'action_required', reason: 'missing_scope' })
    );

    expect(takeCliError()).toEqual({ code: 'missing_scope' });
  });

  it.each([
    ['plain text', 'Error: reason not found'],
    ['a success payload', JSON.stringify({ status: 'ok', reason: 'done' })],
    ['an API error body', JSON.stringify({ error: { code: 'not_found' } })],
    ['invalid JSON', '{"status": "error", "reason": '],
    ['a non-string chunk', Buffer.from('{"status":"error","reason":"x"}')],
    [
      'output over the size limit',
      JSON.stringify({ status: 'error', reason: 'x', data: 'y'.repeat(70000) }),
    ],
  ])('ignores %s on stdout', (_label, chunk) => {
    recordCliErrorFromOutput(chunk);

    expect(takeCliError()).toBeUndefined();
  });
});
