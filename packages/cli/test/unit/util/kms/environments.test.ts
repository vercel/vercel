import { describe, expect, it } from 'vitest';
import {
  findInvalidEnvironments,
  invalidEnvironmentsMessage,
} from '../../../../src/util/kms/environments';

describe('findInvalidEnvironments', () => {
  it('accepts system environments', () => {
    expect(
      findInvalidEnvironments(['production', 'preview', 'development'])
    ).toEqual([]);
  });

  it('accepts custom environment IDs', () => {
    expect(findInvalidEnvironments(['env_1a2b3c4d'])).toEqual([]);
  });

  it('accepts a mix of system environments and custom environment IDs', () => {
    expect(findInvalidEnvironments(['production', 'env_1a2b3c4d'])).toEqual([]);
  });

  it('flags a custom environment name (not its ID)', () => {
    expect(findInvalidEnvironments(['production', 'staging'])).toEqual([
      'staging',
    ]);
  });

  it('flags the bare custom environment prefix', () => {
    expect(findInvalidEnvironments(['env_'])).toEqual(['env_']);
  });
});

describe('invalidEnvironmentsMessage', () => {
  it('uses the singular label for one entry', () => {
    expect(invalidEnvironmentsMessage(['staging'])).toContain(
      'Invalid environment: staging'
    );
  });

  it('uses the plural label for multiple entries', () => {
    expect(invalidEnvironmentsMessage(['staging', 'qa'])).toContain(
      'Invalid environments: staging, qa'
    );
  });
});
