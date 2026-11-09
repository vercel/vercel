import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUpdateCommandMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../src/util/get-update-command', () => ({
  default: getUpdateCommandMock,
}));

import { getUnsupportedBuilderVersionError } from '../../../../src/util/dev/unsupported-builder-version';

describe('getUnsupportedBuilderVersionError', () => {
  beforeEach(() => {
    getUpdateCommandMock.mockReset();
  });

  it('includes the detected update command', async () => {
    getUpdateCommandMock.mockResolvedValue('pnpm i -g vercel@latest');

    await expect(getUnsupportedBuilderVersionError(4)).resolves.toMatchObject({
      name: 'DEV_UNSUPPORTED_BUILDER_VERSION',
      message: 'Vercel CLI does not support builder version 4',
      fix: 'Please run `pnpm i -g vercel@latest` to update to the latest CLI.',
    });
  });

  it('preserves the builder error when update detection fails', async () => {
    getUpdateCommandMock.mockRejectedValue(
      new Error(
        'Could not detect a supported global package-manager installation.'
      )
    );

    await expect(getUnsupportedBuilderVersionError(4)).resolves.toMatchObject({
      name: 'DEV_UNSUPPORTED_BUILDER_VERSION',
      message: 'Vercel CLI does not support builder version 4',
      fix: 'Could not detect a supported global package-manager installation.',
    });
  });
});
