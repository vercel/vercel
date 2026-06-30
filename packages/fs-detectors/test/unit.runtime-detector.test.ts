import { Language, Runtime } from '@vercel/frameworks';
import { detectRuntime } from '../src';
import VirtualFilesystem from './virtual-file-system';

describe('detectRuntime', () => {
  it('defaults JavaScript to Node when no bun signals are present', async () => {
    const fs = new VirtualFilesystem({ 'package.json': '{}' });
    expect(await detectRuntime({ fs, language: Language.JavaScript })).toBe(
      Runtime.Node
    );
  });

  it.each([
    'bun.lock',
    'bun.lockb',
  ])('selects Bun for JavaScript when %s is present', async lockfile => {
    const fs = new VirtualFilesystem({
      'package.json': '{}',
      [lockfile]: '',
    });
    expect(await detectRuntime({ fs, language: Language.JavaScript })).toBe(
      Runtime.Bun
    );
  });

  it('selects Bun when package.json declares engines.bun', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({ engines: { bun: '1.x' } }),
    });
    expect(await detectRuntime({ fs, language: Language.JavaScript })).toBe(
      Runtime.Bun
    );
  });

  it('selects Bun when package.json declares packageManager bun@', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({ packageManager: 'bun@1.2.0' }),
    });
    expect(await detectRuntime({ fs, language: Language.JavaScript })).toBe(
      Runtime.Bun
    );
  });

  it('does not match the engines.bun regex on engines.node', async () => {
    const fs = new VirtualFilesystem({
      'package.json': JSON.stringify({ engines: { node: '20.x' } }),
    });
    expect(await detectRuntime({ fs, language: Language.JavaScript })).toBe(
      Runtime.Node
    );
  });

  it.each([
    [Language.Python, Runtime.Python],
    [Language.Ruby, Runtime.Ruby],
    [Language.Go, Runtime.Go],
    [Language.Rust, Runtime.Rust],
  ])('returns the default runtime for %s', async (language, runtime) => {
    const fs = new VirtualFilesystem({
      'package.json': '{}',
    });
    expect(await detectRuntime({ fs, language })).toBe(runtime);
  });
});
