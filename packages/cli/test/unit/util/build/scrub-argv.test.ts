import { scrubArgv } from '../../../../src/util/build/scrub-argv';

describe('scrubArgv()', () => {
  describe('--build-env', () => {
    it.skip('should scrub --build-env <key=value>', () => {
      const result = scrubArgv(['foo', '--build-env', 'bar=wiz', 'baz']);
      expect(result).toEqual(['foo', '--build-env', 'REDACTED', 'baz']);
    });

    it.skip('should scrub --build-env=<key=value>', () => {
      const result = scrubArgv(['foo', '--build-env=bar=wiz', 'baz']);
      expect(result).toEqual(['foo', '--build-env=REDACTED', 'baz']);
    });

    it.skip('should handle --build-env without a value', () => {
      const result = scrubArgv(['foo', '--build-env']);
      expect(result).toEqual(['foo', '--build-env']);
    });

    it.skip('should scrub -b <key=value>', () => {
      const result = scrubArgv(['foo', '-b', 'bar=wiz', 'baz']);
      expect(result).toEqual(['foo', '-b', 'REDACTED', 'baz']);
    });

    it.skip('should scrub -b=<token>', () => {
      const result = scrubArgv(['foo', '-b=bar=wiz', 'baz']);
      expect(result).toEqual(['foo', '-b=REDACTED', 'baz']);
    });

    it.skip('should handle -b without a value', () => {
      const result = scrubArgv(['foo', '-b']);
      expect(result).toEqual(['foo', '-b']);
    });

    it.skip('should scrub -b from grouped short flags', () => {
      const result = scrubArgv(['foo', '-xyb', 'bar=wiz', 'baz']);
      expect(result).toEqual(['foo', '-xyb', 'REDACTED', 'baz']);
    });
  });

  describe('--env', () => {
    it.skip('should scrub --env <key=value>', () => {
      const result = scrubArgv(['foo', '--env', 'bar=wiz', 'baz']);
      expect(result).toEqual(['foo', '--env', 'REDACTED', 'baz']);
    });

    it.skip('should scrub --env=<key=value>', () => {
      const result = scrubArgv(['foo', '--env=bar=wiz', 'baz']);
      expect(result).toEqual(['foo', '--env=REDACTED', 'baz']);
    });

    it.skip('should handle --env without a value', () => {
      const result = scrubArgv(['foo', '--env']);
      expect(result).toEqual(['foo', '--env']);
    });

    it.skip('should scrub -e <key=value>', () => {
      const result = scrubArgv(['foo', '-e', 'bar=wiz', 'baz']);
      expect(result).toEqual(['foo', '-e', 'REDACTED', 'baz']);
    });

    it.skip('should scrub -e=<token>', () => {
      const result = scrubArgv(['foo', '-e=bar=wiz', 'baz']);
      expect(result).toEqual(['foo', '-e=REDACTED', 'baz']);
    });

    it.skip('should handle -e without a value', () => {
      const result = scrubArgv(['foo', '-e']);
      expect(result).toEqual(['foo', '-e']);
    });

    it.skip('should scrub -e from grouped short flags', () => {
      const result = scrubArgv(['foo', '-xye', 'bar=wiz', 'baz']);
      expect(result).toEqual(['foo', '-xye', 'REDACTED', 'baz']);
    });
  });

  describe('--token', () => {
    it.skip('should scrub --token <token>', () => {
      const result = scrubArgv(['foo', '--token', 'bar', 'baz']);
      expect(result).toEqual(['foo', '--token', 'REDACTED', 'baz']);
    });

    it.skip('should scrub --token=<token>', () => {
      const result = scrubArgv(['foo', '--token=bar', 'baz']);
      expect(result).toEqual(['foo', '--token=REDACTED', 'baz']);
    });

    it.skip('should handle --token without a value', () => {
      const result = scrubArgv(['foo', '--token']);
      expect(result).toEqual(['foo', '--token']);
    });

    it.skip('should scrub -t <token>', () => {
      const result = scrubArgv(['foo', '-t', 'bar', 'baz']);
      expect(result).toEqual(['foo', '-t', 'REDACTED', 'baz']);
    });

    it.skip('should scrub -t=<token>', () => {
      const result = scrubArgv(['foo', '-t=bar', 'baz']);
      expect(result).toEqual(['foo', '-t=REDACTED', 'baz']);
    });

    it.skip('should handle -t without a value', () => {
      const result = scrubArgv(['foo', '-t']);
      expect(result).toEqual(['foo', '-t']);
    });

    it.skip('should scrub -t from grouped short flags', () => {
      const result = scrubArgv(['foo', '-xyt', 'bar', 'baz']);
      expect(result).toEqual(['foo', '-xyt', 'REDACTED', 'baz']);
    });
  });

  describe('Multiple', () => {
    it.skip('should scrub vc build arg', () => {
      const result = scrubArgv([
        'vc',
        'build',
        '--cwd',
        '/path/to/project',
        '--env',
        '"NODE_ENV=production"',
        '--token',
        '"$TOKEN"',
        '--prod',
        '--yes',
      ]);
      expect(result).toEqual([
        'vc',
        'build',
        '--cwd',
        '/path/to/project',
        '--env',
        'REDACTED',
        '--token',
        'REDACTED',
        '--prod',
        '--yes',
      ]);
    });

    it.skip('should scrub multiple args', () => {
      const result = scrubArgv([
        'a',
        '--token',
        'b',
        'c',
        '-xyt',
        'd',
        '--env',
        'e=f',
        '-e',
        'g=h',
        '--build-env',
        'i',
        '-b',
        'j=k',
        '-vb=l',
        'm',
        '--env2',
        'n',
        '-ot',
        'p',
        '-t=',
        '-e="r"',
        's',
      ]);
      expect(result).toEqual([
        'a',
        '--token',
        'REDACTED',
        'c',
        '-xyt',
        'REDACTED',
        '--env',
        'REDACTED',
        '-e',
        'REDACTED',
        '--build-env',
        'REDACTED',
        '-b',
        'REDACTED',
        '-vb=REDACTED',
        'm',
        '--env2',
        'n',
        '-ot',
        'REDACTED',
        '-t=REDACTED',
        '-e=REDACTED',
        's',
      ]);
    });
  });
});
