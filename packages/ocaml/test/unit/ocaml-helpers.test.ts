import { join } from 'path';
import { mkdirp, writeFile, remove } from 'fs-extra';
import {
  getProjectName,
  findExecutablePath,
  localCacheDir,
} from '../../src/ocaml-helpers';

describe('OCaml Helpers', () => {
  const testDir = join(__dirname, '.test-fixtures-helpers');

  beforeEach(async () => {
    await mkdirp(testDir);
  });

  afterEach(async () => {
    await remove(testDir);
  });

  describe('localCacheDir', () => {
    it('should be defined', () => {
      expect(localCacheDir).toBe('.vercel/cache/ocaml');
    });
  });

  describe('getProjectName', () => {
    it('should return "app" when no dune-project exists', async () => {
      const name = await getProjectName(testDir);
      expect(name).toBe('app');
    });

    it('should extract name from dune-project', async () => {
      await writeFile(
        join(testDir, 'dune-project'),
        '(lang dune 3.0)\n(name my_project)'
      );

      const name = await getProjectName(testDir);
      expect(name).toBe('my_project');
    });

    it('should handle complex dune-project files', async () => {
      await writeFile(
        join(testDir, 'dune-project'),
        `(lang dune 3.0)
(name dream_app)

(package
 (name dream_app)
 (depends
  (ocaml (>= 5.1))
  (dream (>= 1.0.0~alpha5))))`
      );

      const name = await getProjectName(testDir);
      expect(name).toBe('dream_app');
    });
  });

  describe('findExecutablePath', () => {
    it('should return default path when no dune file exists', async () => {
      const path = await findExecutablePath(testDir);
      expect(path).toBe('_build/default/bin/main.exe');
    });

    it('should find executable from bin/dune with name', async () => {
      await mkdirp(join(testDir, 'bin'));
      await writeFile(
        join(testDir, 'bin/dune'),
        '(executable (name main) (libraries dream))'
      );

      const path = await findExecutablePath(testDir);
      expect(path).toBe(join('_build', 'default', 'bin', 'main.exe'));
    });

    it('should prefer public_name over name', async () => {
      await mkdirp(join(testDir, 'bin'));
      await writeFile(
        join(testDir, 'bin/dune'),
        '(executable (name main) (public_name my_server) (libraries dream))'
      );

      const path = await findExecutablePath(testDir);
      expect(path).toBe(join('_build', 'default', 'bin', 'my_server.exe'));
    });

    it('should find executable from src/dune', async () => {
      await mkdirp(join(testDir, 'src'));
      await writeFile(
        join(testDir, 'src/dune'),
        '(executable (name server) (libraries cohttp))'
      );

      const path = await findExecutablePath(testDir);
      expect(path).toBe(join('_build', 'default', 'src', 'server.exe'));
    });

    it('should handle multiline dune files', async () => {
      await mkdirp(join(testDir, 'bin'));
      await writeFile(
        join(testDir, 'bin/dune'),
        `(executable
 (name main)
 (public_name dream_app)
 (libraries dream unix))`
      );

      const path = await findExecutablePath(testDir);
      expect(path).toBe(join('_build', 'default', 'bin', 'dream_app.exe'));
    });
  });
});
