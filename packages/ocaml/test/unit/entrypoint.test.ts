import { join } from 'path';
import { mkdirp, writeFile, remove } from 'fs-extra';
import {
  detectOcamlEntrypoint,
  OCAML_CANDIDATE_ENTRYPOINTS,
} from '../../src/entrypoint';

describe('OCaml Entrypoint Detection', () => {
  const testDir = join(__dirname, '.test-fixtures');

  beforeEach(async () => {
    await mkdirp(testDir);
  });

  afterEach(async () => {
    await remove(testDir);
  });

  it('should export candidate entrypoints', () => {
    expect(OCAML_CANDIDATE_ENTRYPOINTS).toBeDefined();
    expect(Array.isArray(OCAML_CANDIDATE_ENTRYPOINTS)).toBe(true);
    expect(OCAML_CANDIDATE_ENTRYPOINTS).toContain('bin/main.ml');
    expect(OCAML_CANDIDATE_ENTRYPOINTS).toContain('src/main.ml');
    expect(OCAML_CANDIDATE_ENTRYPOINTS).toContain('main.ml');
  });

  it('should return null when no entrypoint exists', async () => {
    const result = await detectOcamlEntrypoint(testDir, 'nonexistent.ml');
    expect(result).toBeNull();
  });

  it('should detect configured entrypoint when it exists', async () => {
    const entrypoint = 'custom/server.ml';
    await mkdirp(join(testDir, 'custom'));
    await writeFile(join(testDir, entrypoint), '(* OCaml code *)');

    const result = await detectOcamlEntrypoint(testDir, entrypoint);
    expect(result).toBe(entrypoint);
  });

  it('should detect bin/main.ml entrypoint', async () => {
    await mkdirp(join(testDir, 'bin'));
    await writeFile(join(testDir, 'bin/main.ml'), '(* OCaml code *)');

    const result = await detectOcamlEntrypoint(testDir, 'nonexistent.ml');
    expect(result).toBe('bin/main.ml');
  });

  it('should detect src/main.ml entrypoint', async () => {
    await mkdirp(join(testDir, 'src'));
    await writeFile(join(testDir, 'src/main.ml'), '(* OCaml code *)');

    const result = await detectOcamlEntrypoint(testDir, 'nonexistent.ml');
    expect(result).toBe('src/main.ml');
  });

  it('should detect main.ml entrypoint in root', async () => {
    await writeFile(join(testDir, 'main.ml'), '(* OCaml code *)');

    const result = await detectOcamlEntrypoint(testDir, 'nonexistent.ml');
    expect(result).toBe('main.ml');
  });

  it('should prioritize bin/main.ml over main.ml', async () => {
    await mkdirp(join(testDir, 'bin'));
    await writeFile(join(testDir, 'bin/main.ml'), '(* OCaml code *)');
    await writeFile(join(testDir, 'main.ml'), '(* OCaml code *)');

    const result = await detectOcamlEntrypoint(testDir, 'nonexistent.ml');
    expect(result).toBe('bin/main.ml');
  });

  it('should use configured entrypoint over candidates when both exist', async () => {
    const configured = 'custom.ml';
    await writeFile(join(testDir, configured), '(* OCaml code *)');
    await mkdirp(join(testDir, 'bin'));
    await writeFile(join(testDir, 'bin/main.ml'), '(* OCaml code *)');

    const result = await detectOcamlEntrypoint(testDir, configured);
    expect(result).toBe(configured);
  });
});
