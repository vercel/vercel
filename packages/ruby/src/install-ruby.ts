import execa from 'execa';
import { existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { intersects } from 'semver';
import { Meta, debug, NowBuildError, Version } from '@vercel/build-utils';
import which from 'which';
import { tmpdir } from 'os';

class RubyVersion extends Version {}

const allOptions: RubyVersion[] = [
  new RubyVersion({
    major: 3,
    minor: 3,
    range: '3.3.x',
    runtime: 'ruby3.3',
  }),
  new RubyVersion({
    major: 3,
    minor: 2,
    range: '3.2.x',
    runtime: 'ruby3.2',
  }),
  new RubyVersion({
    major: 2,
    minor: 7,
    range: '2.7.x',
    runtime: 'ruby2.7',
    discontinueDate: new Date('2023-12-07'),
  }),
  new RubyVersion({
    major: 2,
    minor: 5,
    range: '2.5.x',
    runtime: 'ruby2.5',
    discontinueDate: new Date('2021-11-30'),
  }),
];

function resolveSystemRuby(): {
  rubyPath: string;
  gemPath: string;
  major: number;
  minor: number;
} | null {
  const rubyPath = which.sync('ruby', { nothrow: true }) as string | null;
  const gemPath = which.sync('gem', { nothrow: true }) as string | null;
  if (!rubyPath || !gemPath) return null;
  const ver = spawnSync(rubyPath, ['-e', 'print RUBY_VERSION'], {
    encoding: 'utf8',
  });
  const [mj, mn] = String(ver.stdout || '')
    .trim()
    .split('.');
  const major = Number(mj) || 3;
  const minor = Number(mn) || 3;
  return { rubyPath, gemPath, major, minor };
}

function makeLocalRubyEnv({
  major,
  minor,
  rubyPath,
  gemPath,
}: {
  major: number;
  minor: number;
  rubyPath: string;
  gemPath: string;
}) {
  const gemHome = join(tmpdir(), `vercel-ruby-${major}${minor}-${process.pid}`);
  return {
    major,
    gemHome,
    runtime: `ruby${major}.${minor}`,
    rubyPath,
    gemPath,
    vendorPath: `vendor/bundle/ruby/${major}.${minor}.0`,
  };
}

function getLatestRubyVersion(): RubyVersion {
  const selection = allOptions.find(isInstalled);
  if (!selection) {
    throw new NowBuildError({
      code: 'RUBY_INVALID_VERSION',
      link: 'http://vercel.link/ruby-version',
      message: `Unable to find any supported Ruby versions.`,
    });
  }
  return selection;
}

function getRubyPath(meta: Meta, gemfileContents: string) {
  let selection: RubyVersion | null = null;
  try {
    selection = getLatestRubyVersion();
  } catch {
    selection = null;
  }

  if (meta.isDev) {
    const sys = resolveSystemRuby();
    if (sys) {
      const result = makeLocalRubyEnv(sys);
      debug(
        `ruby: using system ruby for local dev: ${JSON.stringify({ ruby: sys.rubyPath, gem: sys.gemPath, version: `${sys.major}.${sys.minor}` })}`
      );
      return result;
    }
    throw new NowBuildError({
      code: 'RUBY_INVALID_VERSION',
      link: 'http://vercel.link/ruby-version',
      message:
        'Unable to find any supported Ruby versions (local). Ensure ruby and gem are on PATH.',
    });
  } else if (gemfileContents) {
    const line = gemfileContents
      .split('\n')
      .find(line => line.startsWith('ruby'));
    if (line) {
      const strVersion = line.slice(4).trim().slice(1, -1).replace('~>', '');
      const found = allOptions.some(o => {
        selection = o;
        return intersects(o.range, strVersion);
      });
      if (!found) {
        throw new NowBuildError({
          code: 'RUBY_INVALID_VERSION',
          message: `Found \`Gemfile\` with invalid Ruby version: \`${line}.\``,
          link: 'http://vercel.link/ruby-version',
        });
      }

      if (
        !selection ||
        selection.state === 'discontinued' ||
        !isInstalled(selection)
      ) {
        const sys = resolveSystemRuby();
        if (sys) {
          const sysRange = `${sys.major}.${sys.minor}.x`;
          if (!strVersion || intersects(sysRange, strVersion)) {
            const result = makeLocalRubyEnv(sys);
            debug(
              `ruby: using system ruby (Gemfile) version=${sys.major}.${sys.minor} ruby=${sys.rubyPath}`
            );
            return result;
          }
        }
        const latest = getLatestRubyVersion();
        const intro = `Found \`Gemfile\` with ${selection && selection.state === 'discontinued' ? 'discontinued' : 'invalid'} Ruby version: \`${line}.\``;
        const hint = `Please set \`ruby "~> ${latest.range}"\` in your \`Gemfile\` to use Ruby ${latest.range}.`;
        throw new NowBuildError({
          code:
            selection && selection.state === 'discontinued'
              ? 'RUBY_DISCONTINUED_VERSION'
              : 'RUBY_INVALID_VERSION',
          link: 'http://vercel.link/ruby-version',
          message: `${intro} ${hint}`,
        });
      }
    }
  }

  if (selection) {
    const { major, minor, runtime } = selection;
    const gemHome = '/ruby' + major + minor;
    const result = {
      major,
      gemHome,
      runtime,
      rubyPath: join(gemHome, 'bin', 'ruby'),
      gemPath: join(gemHome, 'bin', 'gem'),
      vendorPath: `vendor/bundle/ruby/${major}.${minor}.0`,
    };
    debug(`ruby: using image runtime=${runtime} ruby=${result.rubyPath}`);
    return result;
  }

  const sys = resolveSystemRuby();
  if (sys) {
    const result = makeLocalRubyEnv(sys);
    debug(
      `ruby: using system ruby (fallback) version=${sys.major}.${sys.minor} ruby=${sys.rubyPath}`
    );
    return result;
  }

  throw new NowBuildError({
    code: 'RUBY_INVALID_VERSION',
    link: 'http://vercel.link/ruby-version',
    message: 'Unable to find any supported Ruby versions.',
  });
}

// downloads and installs `bundler` (respecting
// process.env.GEM_HOME), and returns
// the absolute path to it
export async function installBundler(meta: Meta, gemfileContents: string) {
  const { gemHome, rubyPath, gemPath, vendorPath, runtime, major } =
    getRubyPath(meta, gemfileContents);

  debug('installing bundler...');
  await execa(gemPath, ['install', 'bundler', '--no-document'], {
    stdio: 'pipe',
    env: {
      GEM_HOME: gemHome,
    },
  });

  return {
    major,
    gemHome,
    rubyPath,
    gemPath,
    vendorPath,
    runtime,
    bundlerPath: join(gemHome, 'bin', 'bundler'),
  };
}

function isInstalled({ major, minor }: RubyVersion): boolean {
  const gemHome = '/ruby' + major + minor;
  const rubyPath = join(gemHome, 'bin', 'ruby');
  const gemPath = join(gemHome, 'bin', 'gem');

  if (!existsSync(rubyPath) || !existsSync(gemPath)) {
    return false;
  }

  // Check that the ruby binary reports the expected version
  try {
    const result = spawnSync(rubyPath, ['-e', 'print RUBY_VERSION'], {
      encoding: 'utf8',
      env: { ...process.env, GEM_HOME: gemHome },
    });
    if (result.status !== 0) return false;
    const version = result.stdout.trim();
    const [actualMajor, actualMinor] = version.split('.').map(Number);
    return actualMajor === Number(major) && actualMinor === Number(minor);
  } catch {
    return false;
  }
}
