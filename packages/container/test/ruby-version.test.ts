import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_RUBY_VERSION,
  RUBY_VERSION_FILES,
  parseGemfileRubyVersion,
  ruby,
} from '../src/buildpacks/ruby';

const { files } = vi.hoisted(() => ({ files: new Map<string, string>() }));
vi.mock('node:fs', () => ({
  existsSync: (path: string) => files.has(path),
  readFileSync: (path: string) => {
    if (!files.has(path)) throw new Error(`Unexpected file read: ${path}`);
    return files.get(path);
  },
}));

const workPath = join('/', 'project');

function resolve(projectFiles: Record<string, string> = {}) {
  for (const [name, contents] of Object.entries(projectFiles)) {
    files.set(join(workPath, name), contents);
  }
  return ruby.resolveImage(workPath);
}

const image = (version: string) => ({
  version,
  buildImage: `docker.io/library/ruby:${version}`,
  runImage: `docker.io/library/ruby:${version}`,
});

beforeEach(() => {
  files.clear();
});

describe('Ruby version files', () => {
  it('consults .ruby-version, .tool-versions, then mise.toml', () => {
    expect(RUBY_VERSION_FILES).toEqual([
      '.ruby-version',
      '.tool-versions',
      'mise.toml',
    ]);
  });

  it.each([
    ['3.4.1\n', '3.4.1'],
    ['3.4.1', '3.4.1'],
    ['3.4.1\r\n', '3.4.1'],
    ['  3.4.1  \n', '3.4.1'],
    ['ruby-3.4.1\n', '3.4.1'],
    ['ruby-3.4\n', '3.4'],
    ['3.4\n', '3.4'],
    ['4.0.2\n', '4.0.2'],
  ])('reads .ruby-version %j as %s', async (contents, version) => {
    expect(await resolve({ '.ruby-version': contents })).toEqual(
      image(version)
    );
  });

  it.each([
    ['ruby 3.4.1\n', '3.4.1'],
    ['ruby   3.4.1# comment\n', '3.4.1'],
    ['nodejs 22.1.0\nruby 3.4.1 # pinned\npython 3.12.0\n', '3.4.1'],
    ['ruby 3.4.1 3.3.0\n', '3.4.1'],
    ['ruby 3.4\n', '3.4'],
  ])('reads .tool-versions %j as %s', async (contents, version) => {
    expect(await resolve({ '.tool-versions': contents })).toEqual(
      image(version)
    );
  });

  it.each([
    ['[tools]\nruby = "3.4.1"\n', '3.4.1'],
    ["[tools]\nruby = '3.4.1'\n", '3.4.1'],
    ['[tools]\nnode = "22"\nruby = "3.4" # latest patch\n', '3.4'],
    ['[tools]\n  ruby = "3.4.1"\n', '3.4.1'],
    ['tools.ruby = "3.4.1"\n', '3.4.1'],
    ['[vars]\nruby = "2.7.8"\n[tools]\nruby = "3.4.1"\n', '3.4.1'],
    [
      '[plugins]\nruby = "https://github.com/asdf-vm/asdf-ruby.git"\n[tools]\nruby = "3.4.1"\n',
      '3.4.1',
    ],
  ])('reads mise.toml %j as %s', async (contents, version) => {
    expect(await resolve({ 'mise.toml': contents })).toEqual(image(version));
  });

  it('prefers .ruby-version, then .tool-versions, then mise.toml', async () => {
    expect(
      await resolve({
        '.ruby-version': '3.4.1',
        '.tool-versions': 'ruby 3.3.10',
        'mise.toml': '[tools]\nruby = "3.2.9"',
      })
    ).toEqual(image('3.4.1'));

    files.clear();
    expect(
      await resolve({
        '.tool-versions': 'ruby 3.3.10',
        'mise.toml': '[tools]\nruby = "3.2.9"',
      })
    ).toEqual(image('3.3.10'));
  });

  it('ignores the Gemfile when a version file exists', async () => {
    expect(
      await resolve({
        '.ruby-version': '3.4.1',
        Gemfile: 'ruby ENV.fetch("RUBY_VERSION")\nruby "~> 2.7"',
      })
    ).toEqual(image('3.4.1'));
  });

  it('does not consult ancestor directories', async () => {
    files.set(join('/', '.ruby-version'), '2.7.1');
    files.set(join('/', '.tool-versions'), 'ruby 2.7.1');
    files.set(join('/', 'mise.toml'), '[tools]\nruby = "2.7.1"');
    files.set(join('/', 'Gemfile'), 'ruby "2.7.1"');
    expect(
      await resolve({ 'Gemfile.lock': 'RUBY VERSION\n   ruby 2.7.1p0' })
    ).toEqual(image(DEFAULT_RUBY_VERSION));
  });

  it.each([
    '',
    '   \n',
    'invalid',
    '3',
    '>= 3.4.1',
    '~> 3.4',
    '3.4.1p0',
    '3.4.1-preview1',
    '03.4.1',
    '3.4.1 junk',
    '3.4\n3.3',
    '../3.4.1',
    'evil.example/ruby:3.4.1',
    '3.4@sha256:abcd',
    '9007199254740992.4.1',
    'jruby-9.4.0.0',
    'truffleruby-24.0.0',
    'ruby-head',
    'system',
    'ruby 3.4.1@gemset',
  ])('rejects .ruby-version %j instead of falling back', async contents => {
    await expect(
      resolve({ '.ruby-version': contents, Gemfile: 'ruby "3.4.1"' })
    ).rejects.toThrow('Invalid Ruby version in .ruby-version');
  });

  it.each([
    ['.tool-versions', 'nodejs 22.1.0\n'],
    ['.tool-versions', 'ruby ref:master\n'],
    ['.tool-versions', 'ruby latest\n'],
    ['mise.toml', 'ruby = "3.4.1"\n'],
    ['mise.toml', '[vars]\nruby = "3.4.1"\n'],
    ['mise.toml', 'tools = "3.4.1"\n'],
    ['mise.toml', '[tools]\nnode = "22"\n'],
    ['mise.toml', '[tools]\nruby = 3.4\n'],
    ['mise.toml', '[tools]\nruby = "~> 3.4"\n'],
    ['mise.toml', '[tools]\nruby = { version = "3.4.1" }\n'],
    ['mise.toml', '[tools]\nruby = ["3.4.1"]\n'],
  ])('rejects %s without a usable ruby entry: %j', async (name, contents) => {
    await expect(resolve({ [name]: contents })).rejects.toThrow(
      `Invalid Ruby version in ${name}`
    );
  });

  it.each([
    '[tools]\nruby = "3.4.1"\nruby = "3.3.10"\n',
    '[tools]\nruby = "3.4.1\n',
  ])('rejects malformed mise.toml: %j', async contents => {
    await expect(resolve({ 'mise.toml': contents })).rejects.toThrow(
      'Invalid mise.toml:'
    );
  });
});

describe('Gemfile ruby declarations', () => {
  it.each([
    ['ruby "3.4.1"', '3.4.1'],
    ["ruby '3.4.1'", '3.4.1'],
    ['ruby("3.4.1")', '3.4.1'],
    ['ruby ("3.4.1")', '3.4.1'],
    ['ruby "3.4.1" # pinned for production', '3.4.1'],
    ['  ruby "3.4.1"  ', '3.4.1'],
    ['ruby "3.4"', '3.4.0'],
    ['ruby "4.0.2"', '4.0.2'],
    ['source "https://rubygems.org"\n\nruby "3.4.1"\n\ngem "rake"\n', '3.4.1'],
    ['source "https://rubygems.org"\r\nruby "3.4.1"\r\n', '3.4.1'],
    ['# frozen_string_literal: true\n# ruby "2.7.8"\nruby "3.4.1"\n', '3.4.1'],
    ['gem "rake"\ngem "puma"\nruby "3.4.1"\n', '3.4.1'],
  ])('parses %j as %s', (gemfile, version) => {
    expect(parseGemfileRubyVersion(gemfile)).toBe(version);
  });

  it.each([
    '',
    'source "https://rubygems.org"\n\ngem "rake"\n',
    '# ruby "3.3.1"\n',
    'gem "ruby-progressbar"\ngem "ruby", platforms: :ruby\n',
    'gem "puma", platforms: %i[ruby]\n',
    'gem "debug", platforms: %i[ mri windows ], require: "debug/prelude"\n',
    'gem "thing",\n  ruby: true\n',
    'rubygems_version = "3.5"\nruby_version = "3.4.1"\n',
  ])('finds no declaration in %j', gemfile => {
    expect(parseGemfileRubyVersion(gemfile)).toBeUndefined();
  });

  it.each([
    'ruby',
    'ruby ""',
    'ruby "nonsense"',
    'ruby "3"',
    'ruby "~> 3.3"',
    'ruby ">= 3.3"',
    'ruby ">= 3.3", "< 4.0"',
    'ruby "3.4.0-preview1"',
    'ruby "03.4.1"',
    'ruby "9007199254740992.4.1"',
    'ruby "#{RUBY_VERSION}"',
    'ruby RUBY_VERSION',
    'ruby ENV.fetch("RUBY_VERSION")',
    'ruby File.read(".ruby-version").strip',
    'ruby file: ".ruby-version"',
    "ruby(file: '.ruby-version')",
    'ruby "3.4.1", engine: "jruby", engine_version: "9.4.0.0"',
    'ruby "3.4.1", patchlevel: "0"',
    'ruby "3.4.1", :engine => "ruby", :engine_version => "3.4.1"',
    'ruby ["3.4.1"]',
    'ruby %q{3.4.1}',
    'ruby "3.4.1" if ENV["PRODUCTION"]',
    'ruby("3.4.1") if true',
    'ruby "3.4.1"; system("false")',
    'ruby("3.4.1"',
    'ruby "3.4.1",\n  "< 4"',
    'ruby "3.4.1"\nruby "3.3.1"',
    'if ENV["PRODUCTION"]\n  ruby "3.4.1"\nelse\n  ruby "3.3.1"\nend',
  ])('rejects %j', gemfile => {
    expect(() => parseGemfileRubyVersion(gemfile)).toThrow(
      'Unsupported ruby declaration in Gemfile'
    );
  });

  it('names the offending line in the error', () => {
    expect(() =>
      parseGemfileRubyVersion('source "https://rubygems.org"\nruby "~> 3.3"\n')
    ).toThrow('Unsupported ruby declaration in Gemfile: "ruby \\"~> 3.3\\""');
  });
});

describe('Rails SECRET_KEY_BASE validation', () => {
  const railsGemfile = 'source "https://rubygems.org"\ngem "rails", "~> 8.0"\n';
  const rackGemfile = 'source "https://rubygems.org"\ngem "rack", "~> 3.1"\n';

  function validate(
    projectFiles: Record<string, string>,
    buildEnv?: Record<string, string>
  ) {
    for (const [name, contents] of Object.entries(projectFiles)) {
      files.set(join(workPath, name), contents);
    }
    return () => ruby.validate?.({ workPath, buildEnv });
  }

  it.each([
    ['gem "rails"', 'source "https://rubygems.org"\ngem "rails"\n'],
    ["gem 'rails'", 'source "https://rubygems.org"\ngem \'rails\'\n'],
    [
      'indented with a version constraint',
      'source "https://rubygems.org"\n  gem "rails", "~> 8.0"\n',
    ],
  ])('rejects %s without SECRET_KEY_BASE', (_name, gemfile) => {
    expect(validate({ Gemfile: gemfile })).toThrow(
      'Rails requires SECRET_KEY_BASE at runtime, but it is not set in the project'
    );
  });

  it('rejects an empty SECRET_KEY_BASE', () => {
    expect(
      validate({ Gemfile: railsGemfile }, { SECRET_KEY_BASE: '' })
    ).toThrow('Rails requires SECRET_KEY_BASE at runtime');
  });

  it('accepts a Rails app with SECRET_KEY_BASE set', () => {
    expect(
      validate(
        { Gemfile: railsGemfile },
        { SECRET_KEY_BASE: 'synthetic-test-value' }
      )
    ).not.toThrow();
  });

  it('ignores a commented-out rails gem', () => {
    expect(
      validate({ Gemfile: 'source "https://rubygems.org"\n# gem "rails"\n' })
    ).not.toThrow();
  });

  it('accepts a non-Rails Gemfile without SECRET_KEY_BASE', () => {
    expect(validate({ Gemfile: rackGemfile })).not.toThrow();
  });

  it('accepts a missing Gemfile', () => {
    expect(validate({})).not.toThrow();
  });
});

describe('Ruby image selection', () => {
  it(`defaults to ${DEFAULT_RUBY_VERSION} when nothing declares a version`, async () => {
    expect(DEFAULT_RUBY_VERSION).toBe('3.4');
    expect(await resolve()).toEqual(image('3.4'));
    files.clear();
    expect(
      await resolve({ Gemfile: 'source "https://rubygems.org"\ngem "rake"\n' })
    ).toEqual(image('3.4'));
  });

  it('falls back to an exact Gemfile declaration without a version file', async () => {
    expect(
      await resolve({
        Gemfile:
          'source "https://rubygems.org"\n\nruby "3.3.10"\n\ngem "puma"\n',
      })
    ).toEqual(image('3.3.10'));
  });

  it('fails an unsupported Gemfile declaration instead of using the default', async () => {
    await expect(
      resolve({ Gemfile: 'source "https://rubygems.org"\nruby "~> 3.3"\n' })
    ).rejects.toThrow('Unsupported ruby declaration in Gemfile');
  });

  it('never performs network requests', async () => {
    const fetchMock = vi.fn(() => {
      throw new Error('Unexpected network request');
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await resolve({ Gemfile: 'ruby "3.3.10"' });
      files.clear();
      await resolve({ '.tool-versions': 'ruby 3.4' });
      files.clear();
      await resolve();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
