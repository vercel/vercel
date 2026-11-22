import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { vercelBuildpack } from './distribution';
import type { BuildpackRuntime } from './registry';
import { isValidVersion } from './version';

/** Stock image tag used when a project declares no Ruby version. */
export const DEFAULT_RUBY_VERSION = '3.4';

const RUBY_IMAGE_REPOSITORY = 'docker.io/library/ruby';

const RUBY_VERSION_DOCS = 'https://vercel.link/ruby-version';

/**
 * Version files, in the order they are consulted. This is the order
 * `ruby/setup-ruby` uses, and every file format Bundler accepts for
 * `ruby file: ...`.
 */
export const RUBY_VERSION_FILES = [
  '.ruby-version',
  '.tool-versions',
  'mise.toml',
] as const;

/**
 * Bundler's `normalize_ruby_file`: the version is the first token after a
 * line-leading `ruby`, which covers `ruby-3.1.2`, `ruby 3.1.2 # comment`
 * (`.tool-versions`). A file that never mentions `ruby` holds the bare version.
 */
const VERSION_FILE_RE = /^ruby[\s-]*(?:=\s*)?["']?([^\s#"']+)["']?/m;

/** A line that starts a `ruby` call (not a `ruby:` hash key). */
const GEMFILE_RUBY_CALL_RE = /^\s*ruby\b(?!\s*:)/;

/**
 * A `ruby` declaration with a single quoted version and nothing else but an
 * optional comment. Anything more (operators, options, expressions) is
 * unsupported rather than guessed at.
 */
const GEMFILE_RUBY_LINE_RE =
  /^\s*ruby(?:\s*\(\s*("[^"]*"|'[^']*')\s*\)|\s*("[^"]*"|'[^']*'))\s*(?:#.*)?$/;

/**
 * A `gem "rails"` / `gem 'rails'` declaration. The line-leading `gem` call
 * skips commented-out declarations.
 */
const GEMFILE_RAILS_GEM_RE = /^\s*gem\s+["']rails["']/m;

/** Vercel-owned Ruby buildpack; see `buildpacks/ruby` in vercel/buildpacks. */
export const ruby: BuildpackRuntime = {
  runtime: 'ruby',
  projectMarkers: ['Gemfile'],
  buildpacks: [vercelBuildpack('ruby')],
  async resolveImage(workPath) {
    const version = selectRubyVersion(workPath) ?? DEFAULT_RUBY_VERSION;
    const image = `${RUBY_IMAGE_REPOSITORY}:${version}`;
    return { version, buildImage: image, runImage: image };
  },
  validate({ workPath, buildEnv }) {
    const gemfile = join(workPath, 'Gemfile');
    if (!existsSync(gemfile)) return;
    if (!GEMFILE_RAILS_GEM_RE.test(readFileSync(gemfile, 'utf8'))) return;
    if (buildEnv?.SECRET_KEY_BASE) return;
    // Rails refuses to boot in production without SECRET_KEY_BASE; failing
    // the build beats shipping an image that crashes on boot.
    throw new Error(
      "Rails requires SECRET_KEY_BASE at runtime, but it is not set in the project's environment variables. Add SECRET_KEY_BASE to the project's environment variables and deploy again."
    );
  },
};

/**
 * The Ruby version a service declares, or `undefined` when it declares none.
 * The first version file present wins; the Gemfile is only read when there
 * is none. Only the service directory is consulted, never its ancestors.
 */
export function selectRubyVersion(workPath: string): string | undefined {
  for (const name of RUBY_VERSION_FILES) {
    const file = join(workPath, name);
    if (existsSync(file)) {
      return parseVersionFile(name, readFileSync(file, 'utf8'));
    }
  }
  const gemfile = join(workPath, 'Gemfile');
  return existsSync(gemfile)
    ? parseGemfileRubyVersion(readFileSync(gemfile, 'utf8'))
    : undefined;
}

/** The Ruby version in a version file; `major.minor` selects that minor's tag. */
export function parseVersionFile(name: string, contents: string): string {
  let version: unknown;
  if (name === 'mise.toml') {
    try {
      const { tools } = parseToml(contents);
      version =
        typeof tools === 'object' && 'ruby' in tools ? tools.ruby : undefined;
    } catch (error) {
      throw new Error(`Invalid ${name}: ${(error as Error).message}`);
    }
  } else {
    version = VERSION_FILE_RE.exec(contents)?.[1] ?? contents.trim();
  }
  if (typeof version !== 'string' || !isValidVersion(version)) {
    throw new Error(
      `Invalid Ruby version in ${name}: ${JSON.stringify(version)}. Expected a numeric major.minor or major.minor.patch version such as 3.4.1; only MRI is supported. Learn more: ${RUBY_VERSION_DOCS}`
    );
  }
  return version;
}

/**
 * The exact Ruby version a Gemfile declares with `ruby "X.Y.Z"`, or
 * `undefined` when it has no `ruby` line. Bundler treats `ruby "3.4"` as
 * `= 3.4.0`, so a two-component version is completed rather than floated.
 */
export function parseGemfileRubyVersion(contents: string): string | undefined {
  const lines = contents
    .split(/\r?\n/)
    .filter(line => GEMFILE_RUBY_CALL_RE.test(line));
  if (lines.length === 0) return undefined;

  const [line] = lines;
  const match = lines.length === 1 ? GEMFILE_RUBY_LINE_RE.exec(line) : null;
  const version = (match?.[1] ?? match?.[2])?.slice(1, -1);
  if (version === undefined || !isValidVersion(version)) {
    throw new Error(
      `Unsupported ruby declaration in Gemfile: ${JSON.stringify(line.trim())}. Pin Ruby with a .ruby-version, .tool-versions, or mise.toml file, or declare an exact version such as ruby "3.4.1". Version operators, engine:, patchlevel:, file:, and computed values are not supported. Learn more: ${RUBY_VERSION_DOCS}`
    );
  }
  return [...version.split('.'), '0'].slice(0, 3).join('.');
}
