import { beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../../mocks/client';
import {
  requireVcrRepository,
  requireVcrRepositoryAndImageId,
  requireVcrRepositoryAndTag,
  validateVcrChoice,
  validateVcrJsonOutput,
} from '../../../../../src/commands/vcr/utils/validators';

describe('validateVcrJsonOutput', () => {
  beforeEach(() => {
    client.reset();
  });

  it('resolves jsonOutput: false when no flags are set', () => {
    const result = validateVcrJsonOutput(client, {});
    expect(result).toEqual({ jsonOutput: false });
  });

  it('resolves jsonOutput: true when --format json is set', () => {
    const result = validateVcrJsonOutput(client, { '--format': 'json' });
    expect(result).toEqual({ jsonOutput: true });
  });

  it('returns exit code 1 for an invalid --format value', () => {
    const result = validateVcrJsonOutput(client, { '--format': 'bogus' });
    expect(result).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('bogus');
  });
});

describe('validateVcrChoice', () => {
  beforeEach(() => {
    client.reset();
  });

  it('returns undefined when the value is unset', () => {
    const result = validateVcrChoice(
      client,
      '--sort-by',
      undefined,
      ['name', 'size'],
      false
    );
    expect(result).toBeUndefined();
  });

  it('returns undefined when the value is a valid choice', () => {
    const result = validateVcrChoice(
      client,
      '--sort-by',
      'name',
      ['name', 'size'],
      false
    );
    expect(result).toBeUndefined();
  });

  it('returns exit code 1 and an error message for an invalid choice', () => {
    const result = validateVcrChoice(
      client,
      '--sort-by',
      'bogus',
      ['name', 'size'],
      false
    );
    expect(result).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid value for --sort-by: "bogus". Must be one of: name, size.'
    );
  });
});

describe('requireVcrRepository', () => {
  beforeEach(() => {
    client.reset();
  });

  it('returns undefined when the repository is present', () => {
    const result = requireVcrRepository(client, 'my-app', false, 'vcr ls');
    expect(result).toBeUndefined();
  });

  it('returns exit code 1 with usage when the repository is missing', () => {
    const result = requireVcrRepository(
      client,
      undefined,
      false,
      'vcr inspect <repository>'
    );
    expect(result).toBe(1);
    expect(client.stderr.getFullOutput()).toContain('vcr inspect <repository>');
  });
});

describe('requireVcrRepositoryAndImageId', () => {
  beforeEach(() => {
    client.reset();
  });

  it('returns undefined when both arguments are present', () => {
    const result = requireVcrRepositoryAndImageId(
      client,
      'my-app',
      'img_1',
      false,
      'vcr image inspect <repository> <imageId>'
    );
    expect(result).toBeUndefined();
  });

  it('returns exit code 1 when the imageId is missing', () => {
    const result = requireVcrRepositoryAndImageId(
      client,
      'my-app',
      undefined,
      false,
      'vcr image inspect <repository> <imageId>'
    );
    expect(result).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'vcr image inspect <repository> <imageId>'
    );
  });

  it('returns exit code 1 when the repository is missing', () => {
    const result = requireVcrRepositoryAndImageId(
      client,
      undefined,
      'img_1',
      false,
      'vcr image inspect <repository> <imageId>'
    );
    expect(result).toBe(1);
  });
});

describe('requireVcrRepositoryAndTag', () => {
  beforeEach(() => {
    client.reset();
  });

  it('returns undefined when both arguments are present', () => {
    const result = requireVcrRepositoryAndTag(
      client,
      'my-app',
      'latest',
      false,
      'vcr tag inspect <repository> <tag>'
    );
    expect(result).toBeUndefined();
  });

  it('returns exit code 1 when the tag is missing', () => {
    const result = requireVcrRepositoryAndTag(
      client,
      'my-app',
      undefined,
      false,
      'vcr tag inspect <repository> <tag>'
    );
    expect(result).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'vcr tag inspect <repository> <tag>'
    );
  });

  it('returns exit code 1 when the repository is missing', () => {
    const result = requireVcrRepositoryAndTag(
      client,
      undefined,
      'latest',
      false,
      'vcr tag inspect <repository> <tag>'
    );
    expect(result).toBe(1);
  });
});
