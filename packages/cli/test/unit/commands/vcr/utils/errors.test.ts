import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../../mocks/client';
import {
  emitVcrArgParseError,
  handleVcrApiError,
} from '../../../../../src/commands/vcr/utils/errors';

describe('handleVcrApiError', () => {
  beforeEach(() => {
    client.reset();
  });

  it('maps 401 to a not-authorized message', () => {
    const exitCode = handleVcrApiError(client, { status: 401 }, false);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You do not have access to the container registry'
    );
  });

  it('maps 403 to the same not-authorized message as 401', () => {
    const exitCode = handleVcrApiError(client, { status: 403 }, false);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'You do not have access to the container registry'
    );
  });

  it('maps 404 to the server message when present', () => {
    const exitCode = handleVcrApiError(
      client,
      { status: 404, serverMessage: 'Repository not found' },
      false
    );
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Repository not found');
  });

  it('maps 409 to a generic conflict message when no server message', () => {
    const exitCode = handleVcrApiError(client, { status: 409 }, false);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('API error (409).');
  });

  it('maps 429 using the server message', () => {
    const exitCode = handleVcrApiError(
      client,
      { status: 429, serverMessage: 'Too many requests' },
      false
    );
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Too many requests');
  });

  it('maps 500+ to a retry-with-debug message', () => {
    const exitCode = handleVcrApiError(client, { status: 503 }, false);
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('Re-run with --debug');
  });

  it('falls back to a generic message for other status codes', () => {
    const exitCode = handleVcrApiError(
      client,
      { status: 418, serverMessage: "I'm a teapot" },
      false
    );
    expect(exitCode).toBe(1);
    expect(client.stderr.getFullOutput()).toContain("I'm a teapot");
  });

  it('writes a JSON error when jsonOutput is true', () => {
    const exitCode = handleVcrApiError(
      client,
      { status: 404, code: 'NOT_FOUND', serverMessage: 'Repository not found' },
      true
    );
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(client.stdout.getFullOutput());
    expect(parsed.error.code).toBe('NOT_FOUND');
    expect(parsed.error.message).toBe('Repository not found');
  });
});

describe('emitVcrArgParseError', () => {
  let exitSpy: { mockRestore: () => void };

  beforeEach(() => {
    client.reset();
    client.nonInteractive = true;
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as () => never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  it('emits a friendly message when --project is missing its value', () => {
    emitVcrArgParseError(
      client,
      new Error('Option `--project` requires argument'),
      'vcr ls --project <name-or-id>'
    );
    const written = client.stdout.getFullOutput();
    const parsed = JSON.parse(written);
    expect(parsed.message).toContain(
      '`--project` requires a project name or id'
    );
  });

  it('passes through the original error message otherwise', () => {
    emitVcrArgParseError(client, new Error('Unknown flag `--bogus`'), 'vcr ls');
    const written = client.stdout.getFullOutput();
    const parsed = JSON.parse(written);
    expect(parsed.message).toBe('Unknown flag `--bogus`');
  });
});
