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
  const constructed = jest.fn();
  class VerifiedDownloader {
    constructor(options: unknown) {
      constructed(options);
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
      constructed,
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
  __mocks: { downloadTo: jest.Mock; constructed: jest.Mock };
};

beforeEach(() => {
  execaMock.mockReset();
  buildUtilsMock.__mocks.downloadTo.mockReset();
  buildUtilsMock.__mocks.downloadTo.mockResolvedValue(undefined);
  buildUtilsMock.__mocks.constructed.mockReset();
});

describe('installRustToolchain', () => {
  it('skips download when cargo is already on PATH', async () => {
    execaMock.mockResolvedValueOnce({ stdout: 'cargo 1.82.0', exitCode: 0 });

    await installRustToolchain();

    expect(execaMock).toHaveBeenCalledTimes(1);
    expect(execaMock).toHaveBeenCalledWith(
      'cargo',
      ['-V'],
      expect.objectContaining({ stdio: 'ignore' })
    );
    expect(buildUtilsMock.__mocks.downloadTo).not.toHaveBeenCalled();
  });

  it('skips download when rustup is installed but cargo is not on PATH', async () => {
    execaMock
      .mockRejectedValueOnce(new Error('cargo not found'))
      .mockResolvedValueOnce({ stdout: 'rustup 1.27.1', exitCode: 0 });

    await installRustToolchain();

    expect(execaMock).toHaveBeenCalledTimes(2);
    expect(execaMock).toHaveBeenNthCalledWith(
      1,
      'cargo',
      ['-V'],
      expect.objectContaining({ stdio: 'ignore' })
    );
    expect(execaMock).toHaveBeenNthCalledWith(
      2,
      'rustup',
      ['-V'],
      expect.objectContaining({ stdio: 'ignore' })
    );
    expect(buildUtilsMock.__mocks.downloadTo).not.toHaveBeenCalled();
  });

  it('downloads rustup-init with remote SHA-256 verification when neither cargo nor rustup is present', async () => {
    execaMock
      .mockRejectedValueOnce(new Error('cargo not found'))
      .mockRejectedValueOnce(new Error('rustup not found'))
      .mockResolvedValueOnce({ stdout: 'info: installed', exitCode: 0 });

    await installRustToolchain();

    // cargo probe, rustup probe, rustup-init execution = 3 execa calls.
    expect(execaMock).toHaveBeenCalledTimes(3);
    expect(buildUtilsMock.__mocks.downloadTo).toHaveBeenCalledTimes(1);

    const [url, destFile] = buildUtilsMock.__mocks.downloadTo.mock.calls[0];
    expect(typeof url).toBe('string');
    expect(url).toMatch(/^https:\/\/static\.rust-lang\.org\/rustup\/archive\//);
    expect(destFile).toEqual(expect.stringContaining('rustup-init'));

    // VerifiedDownloader should have been constructed with a remote SHA
    // source (sha256Url + parseSha256), not a hard-coded digest.
    expect(buildUtilsMock.__mocks.constructed).toHaveBeenCalledTimes(1);
    const opts = buildUtilsMock.__mocks.constructed.mock.calls[0][0] as {
      sha256?: string;
      sha256Url?: string;
      parseSha256?: (body: string) => string | undefined;
    };
    expect(opts.sha256).toBeUndefined();
    expect(opts.sha256Url).toMatch(
      /^https:\/\/static\.rust-lang\.org\/rustup\/archive\/.+\/rustup-init(\.exe)?\.sha256$/
    );
    expect(typeof opts.parseSha256).toBe('function');
    // The parser should extract the leading hex token from a sidecar body.
    expect(opts.parseSha256!('deadbeef  rustup-init\n')).toBe('deadbeef');
    expect(opts.parseSha256!('')).toBeUndefined();
  });

  it('wraps download errors in a helpful message', async () => {
    execaMock
      .mockRejectedValueOnce(new Error('cargo not found'))
      .mockRejectedValueOnce(new Error('rustup not found'));
    buildUtilsMock.__mocks.downloadTo.mockRejectedValueOnce(
      new Error('sha mismatch')
    );

    await expect(installRustToolchain()).rejects.toThrow(
      /Installing Rust toolchain via rustup-init failed/
    );
  });
});
