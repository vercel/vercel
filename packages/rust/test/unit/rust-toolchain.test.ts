import { installRustToolchain } from '../../src/lib/rust-toolchain';

jest.mock('execa', () => {
  const mock = jest.fn();
  return {
    __esModule: true,
    default: mock,
  };
});

jest.mock('@vercel/build-utils', () => {
  const downloadTo = jest.fn().mockResolvedValue(undefined);
  class VerifiedDownloader {
    sha256: string;
    constructor(options: { sha256: string }) {
      this.sha256 = options.sha256;
    }
    downloadTo(...args: unknown[]) {
      return downloadTo(...args);
    }
  }
  return {
    __esModule: true,
    VerifiedDownloader,
    debug: () => {},
    __mocks: {
      downloadTo,
    },
  };
});

jest.mock('node:fs/promises', () => ({
  mkdtemp: jest.fn().mockResolvedValue('/tmp/rustup-mock'),
  rm: jest.fn().mockResolvedValue(undefined),
  chmod: jest.fn().mockResolvedValue(undefined),
}));

const execaMock = jest.requireMock('execa').default as jest.Mock;
const buildUtilsMock = jest.requireMock('@vercel/build-utils') as {
  __mocks: { downloadTo: jest.Mock };
};

beforeEach(() => {
  execaMock.mockReset();
  buildUtilsMock.__mocks.downloadTo.mockReset();
  buildUtilsMock.__mocks.downloadTo.mockResolvedValue(undefined);
});

describe('installRustToolchain', () => {
  it('skips download when system rustup is already installed', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'rustup 1.27.1', exitCode: 0 });

    await installRustToolchain();

    expect(execaMock).toHaveBeenCalledTimes(1);
    expect(execaMock).toHaveBeenCalledWith(
      'rustup',
      ['-V'],
      expect.objectContaining({ stdio: 'ignore' })
    );
    expect(buildUtilsMock.__mocks.downloadTo).not.toHaveBeenCalled();
  });

  it('downloads rustup-init with SHA-256 verification when rustup is missing', async () => {
    execaMock
      .mockRejectedValueOnce(new Error('rustup not found'))
      .mockResolvedValueOnce({ stdout: 'info: installed', exitCode: 0 });

    await installRustToolchain();

    // First call: probe for system rustup. Second call: rustup-init binary.
    expect(execaMock).toHaveBeenCalledTimes(2);
    expect(buildUtilsMock.__mocks.downloadTo).toHaveBeenCalledTimes(1);

    const [url, destFile] = buildUtilsMock.__mocks.downloadTo.mock.calls[0];
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^https:\/\/static\.rust-lang\.org\/rustup\/archive\//);
    expect(destFile).toEqual(expect.stringContaining('rustup-init'));
  });

  it('wraps download errors in a helpful message', async () => {
    execaMock.mockRejectedValueOnce(new Error('rustup not found'));
    buildUtilsMock.__mocks.downloadTo.mockRejectedValueOnce(
      new Error('sha mismatch')
    );

    await expect(installRustToolchain()).rejects.toThrow(
      /Installing Rust toolchain via rustup-init failed/
    );
  });
});
