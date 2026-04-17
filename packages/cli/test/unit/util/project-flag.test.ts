import { describe, it, expect } from 'vitest';
import { parseArguments } from '../../../src/util/get-args';
import { globalCommandOptions } from '../../../src/util/arg-common';
import { getFlagsSpecification } from '../../../src/util/get-flags-specification';

describe('--project global flag', () => {
  describe('argument parsing', () => {
    it('should parse --project flag', () => {
      const result = parseArguments(
        ['node', 'vercel', 'deploy', '--project', 'my-app'],
        {},
        { permissive: true }
      );
      expect(result.flags['--project']).toBe('my-app');
    });

    it('should parse -P shorthand', () => {
      const result = parseArguments(
        ['node', 'vercel', 'deploy', '-P', 'my-app'],
        {},
        { permissive: true }
      );
      expect(result.flags['--project']).toBe('my-app');
    });

    it('should parse --project=value format', () => {
      const result = parseArguments(
        ['node', 'vercel', 'deploy', '--project=my-app'],
        {},
        { permissive: true }
      );
      expect(result.flags['--project']).toBe('my-app');
    });

    it('should not conflict with other global options', () => {
      const result = parseArguments(
        [
          'node',
          'vercel',
          'deploy',
          '--project',
          'my-app',
          '--cwd',
          '/some/path',
          '--debug',
        ],
        {},
        { permissive: true }
      );
      expect(result.flags['--project']).toBe('my-app');
      expect(result.flags['--cwd']).toBe('/some/path');
      expect(result.flags['--debug']).toBe(true);
    });
  });

  describe('global options definition', () => {
    it('should include project in global command options', () => {
      const projectOption = globalCommandOptions.find(
        opt => opt.name === 'project'
      );
      expect(projectOption).toBeDefined();
      expect(projectOption!.shorthand).toBe('P');
      expect(projectOption!.type).toBe(String);
      expect(projectOption!.deprecated).toBe(false);
    });

    it('should generate correct flags specification', () => {
      const spec = getFlagsSpecification(globalCommandOptions);
      expect(spec['--project']).toBe(String);
      expect(spec['-P']).toBe('--project');
    });
  });
});
