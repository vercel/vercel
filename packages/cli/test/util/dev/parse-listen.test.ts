import parseListen from '../../../src/util/dev/parse-listen';

describe('parseListen', () => {
  it('should parse "0" as port 0', () => {
    const result = parseListen('0');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(0);
  });

  it('should parse "3000" as port 3000', () => {
    const result = parseListen('3000');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(3000);
  });

  it('should parse "0.0.0.0" as IP address', () => {
    const result = parseListen('0.0.0.0');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(3000);
    expect(result[1]).toEqual('0.0.0.0');
  });

  it('should parse "127.0.0.1:4000" as IP address and port', () => {
    const result = parseListen('127.0.0.1:4000');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(4000);
    expect(result[1]).toEqual('127.0.0.1');
  });

  it('should parse "tcp://127.0.0.1:5000" as IP address and port', () => {
    const result = parseListen('tcp://127.0.0.1:5000');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(5000);
    expect(result[1]).toEqual('127.0.0.1');
  });

  if (process.platform !== 'win32') {
    it('should parse "unix:/home/user/server.sock" as UNIX socket file', () => {
      const result = parseListen('unix:/home/user/server.sock');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual('/home/user/server.sock');
    });

    it('should parse "pipe:\\\\.\\pipe\\PipeName" as UNIX pipe', () => {
      const result = parseListen('pipe:\\\\.\\pipe\\PipeName');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual('\\\\.\\pipe\\PipeName');
    });
  }

  it('should fail to parse "bad://url"', () => {
    let err: Error;
    try {
      parseListen('bad://url');
      throw new Error('Should not happen');
    } catch (_err) {
      err = _err;
    }
    expect(err.message).toEqual('Unknown `--listen` scheme (protocol): bad:');
  });
});
