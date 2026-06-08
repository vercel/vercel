import { describe, it, expect } from 'vitest';
import { parseArguments } from '../../../src/util/get-args';
import { globalCommandOptions } from '../../../src/util/arg-common';
import { getFlagsSpecification } from '../../../src/util/get-flags-specification';

describe('--project-name global flag', () => {
  describe('argument parsing', () => {
    it('should parse --project-name flag', () => {
      const result = parseArguments(
        ['node', 'vercel', 'deploy', '--project-name', 'my-app'],
        {},
        { permissive: true }
      );
      expect(result.flags['--project-name']).toBe('my-app');
    });

    it('should parse -P shorthand', () => {
      const result = parseArguments(
        ['node', 'vercel', 'deploy', '-P', 'my-app'],
        {},
        { permissive: true }
      );
      expect(result.flags['--project-name']).toBe('my-app');
    });

    it('should parse --project-name=value format', () => {
      const result = parseArguments(
        ['node', 'vercel', 'deploy', '--project-name=my-app'],
        {},
        { permissive: true }
      );
      expect(result.flags['--project-name']).toBe('my-app');
    });

    it('should not conflict with other global options', () => {
      const result = parseArguments(
        [
          'node',
          'vercel',
          'deploy',
          '--project-name',
          'my-app',
          '--cwd',
          '/some/path',
          '--debug',
        ],
        {},
        { permissive: true }
      );
      expect(result.flags['--project-name']).toBe('my-app');
      expect(result.flags['--cwd']).toBe('/some/path');
      expect(result.flags['--debug']).toBe(true);
    });

    it('should not intercept subcommand --project flag', () => {
      // When a subcommand defines its own --project flag, the global
      // --project-name must NOT consume or shadow the value.
      const result = parseArguments(
        ['node', 'vercel', 'link', '--project', 'sub-proj'],
        { '--project': String },
        { permissive: true }
      );
      // The subcommand --project flag should be parsed correctly
      expect(result.flags['--project']).toBe('sub-proj');
      // The global --project-name should be undefined
      expect(result.flags['--project-name']).toBeUndefined();
    });

    it('should allow both --project-name and subcommand --project', () => {
      const result = parseArguments(
        [
          'node',
          'vercel',
          'link',
          '--project-name',
          'mono-app',
          '--project',
          'sub-proj',
        ],
        { '--project': String },
        { permissive: true }
      );
      expect(result.flags['--project-name']).toBe('mono-app');
      expect(result.flags['--project']).toBe('sub-proj');
    });
  });

  describe('global options definition', () => {
    it('should include project-name in global command options', () => {
      const projectOption = globalCommandOptions.find(
        opt => opt.name === 'project-name'
      );
      expect(projectOption).toBeDefined();
      expect(projectOption!.shorthand).toBe('P');
      expect(projectOption!.type).toBe(String);
      expect(projectOption!.deprecated).toBe(false);
    });

    it('should NOT include bare "project" in global command options', () => {
      const projectOption = globalCommandOptions.find(
        opt => (opt.name as string) === 'project'
      );
      expect(projectOption).toBeUndefined();
    });

    it('should generate correct flags specification', () => {
      const spec = getFlagsSpecification(globalCommandOptions);
      expect(spec['--project-name']).toBe(String);
      expect(spec['-P']).toBe('--project-name');
      // --project should NOT be in the global spec
      expect((spec as Record<string, unknown>)['--project']).toBeUndefined();
    });
  });
});
