import execa from 'execa';
import which from 'which';
import { join } from 'path';
import { intersects } from 'semver';
import { Meta, debug, NowBuildError, Version } from '@vercel/build-utils';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { getMiseBinaryOrInstall, installRubyViaMise } from './mise';

class RubyVersion extends Version {}

// The order must be most recent first
const allOptions: RubyVersion[] = [
  new RubyVersion({
    major: 3,
    minor: 4,
    range: '3.4.x',
    runtime: 'ruby3.4',
  }),
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
  if (ver.status !== 0 || !ver.stdout) return null;
  const [mj, mn] = String(ver.stdout).trim().split('.');
  const major = Number(mj) ?? 3;
  const minor = Number(mn) ?? 3;
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

  const matchedOption = allOptions.find(
    o => o.major === major && o.minor === minor && o.state !== 'discontinued'
  );

  if (!matchedOption) {
    throw new NowBuildError({
      code: 'RUBY_INVALID_VERSION',
      link: 'http://vercel.link/ruby-version',
      message: `Local Ruby ${major}.${minor} does not match any supported Vercel runtime. Supported: ${allOptions
        .filter(o => o.state !== 'discontinued')
        .map(o => `${o.major}.${o.minor}`)
        .join(', ')}`,
    });
  }

  return {
    major,
    gemHome,
    runtime: matchedOption.runtime,
    rubyPath,
    gemPath,
    vendorPath: `vendor/bundle/ruby/${major}.${minor}.0`,
  };
}

interface DeclaredRubyVersion {
  version: string;
  source: '.ruby-version' | '.tool-versions' | 'mise.toml' | 'Gemfile';
}

async function getRubyPath(
  meta: Meta,
  gemfileContents: string,
  declaredVersion?: DeclaredRubyVersion
) {
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
  }

  // Priority 1: .ruby-version or .tool-versions file
  if (declaredVersion) {
    const { version, source } = declaredVersion;
    // Extract major.minor from the declared version (e.g. "3.4.1" -> 3, 4)
    const parts = version.split('.');
    const declaredMajor = Number(parts[0]);
    const declaredMinor = Number(parts[1]);

    if (!Number.isNaN(declaredMajor) && !Number.isNaN(declaredMinor)) {
      const matchedOption = allOptions.find(
        o => o.major === declaredMajor && o.minor === declaredMinor
      );

      if (matchedOption) {
        if (matchedOption.state === 'discontinued') {
          throw new NowBuildError({
            code: 'RUBY_DISCONTINUED_VERSION',
            link: 'http://vercel.link/ruby-version',
            message: `Ruby version "${version}" from ${source} is discontinued and must be upgraded.`,
          });
        }

        if (isInstalled(matchedOption)) {
          // Pre-installed in the build container — use directly
          console.log(
            `Using Ruby ${matchedOption.major}.${matchedOption.minor} from ${source}`
          );
          selection = matchedOption;
        } else {
          // Not pre-installed — install via mise
          console.log(
            `Ruby ${matchedOption.major}.${matchedOption.minor} (from ${source}) is not pre-installed, installing via mise...`
          );
          return installViaMise(matchedOption, version);
        }
      } else {
        console.warn(
          `Warning: Ruby version "${version}" from ${source} is not supported. Supported: ${allOptions
            .filter(o => o.state !== 'discontinued')
            .map(o => `${o.major}.${o.minor}`)
            .join(', ')}`
        );
      }
    } else {
      console.warn(
        `Warning: Could not parse Ruby version "${version}" from ${source}, ignoring.`
      );
    }
  }

  // Priority 2: Gemfile ruby directive (existing logic)
  if (!selection?.state || selection.state === 'discontinued') {
    // Reset selection for Gemfile parsing
    try {
      selection = getLatestRubyVersion();
    } catch {
      selection = null;
    }
  }

  if (gemfileContents) {
    const line = gemfileContents
      .split('\n')
      .find(line => line.startsWith('ruby'));
    if (line) {
      const strVersion = line.slice(4).trim().slice(1, -1).replace(/~>\s*/, '');
      const found = allOptions.some(o => {
        // The array is already in order so return the first
        // match which will be the newest version.
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
        // If the selected version is active but not pre-installed, install via mise
        if (
          selection &&
          selection.state !== 'discontinued' &&
          !isInstalled(selection)
        ) {
          console.log(
            `Ruby ${selection.major}.${selection.minor} (from Gemfile) is not pre-installed, installing via mise...`
          );
          return installViaMise(
            selection,
            `${selection.major}.${selection.minor}`
          );
        }

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

        let latest: RubyVersion | null = null;
        try {
          latest = getLatestRubyVersion();
        } catch {
          // No Ruby versions available, still show helpful error
        }
        const intro = `Found \`Gemfile\` with ${
          selection && selection.state === 'discontinued'
            ? 'discontinued'
            : 'invalid'
        } Ruby version: \`${line}.\``;
        const hint = latest
          ? `Please set \`ruby "~> ${latest.range}"\` in your \`Gemfile\` to use Ruby ${latest.range}.`
          : 'Please update your `Gemfile` to use a supported Ruby version.';
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

    // If the selected version is not pre-installed, install via mise
    if (!isInstalled(selection) && selection.state !== 'discontinued') {
      console.log(
        `Ruby ${major}.${minor} is not pre-installed, installing via mise...`
      );
      return installViaMise(selection, `${major}.${minor}`);
    }

    const gemHome = '/ruby' + major + minor;
    const result = {
      major,
      gemHome,
      runtime,
      rubyPath: join(gemHome, 'bin', 'ruby'),
      gemPath: join(gemHome, 'bin', 'gem'),
      vendorPath: `vendor/bundle/ruby/${major}.${minor}.0`,
    };
    debug(JSON.stringify(result, null, ' '));
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

/**
 * Install a Ruby version via mise and return the path information
 * needed for the build.
 */
async function installViaMise(
  option: RubyVersion,
  version: string
): Promise<{
  major: number;
  gemHome: string;
  runtime: string;
  rubyPath: string;
  gemPath: string;
  vendorPath: string;
}> {
  const misePath = await getMiseBinaryOrInstall();
  const { rubyPath, gemPath } = await installRubyViaMise(misePath, version);

  const gemHome = join(
    tmpdir(),
    `vercel-ruby-${option.major}${option.minor}-${process.pid}`
  );

  return {
    major: option.major,
    gemHome,
    runtime: option.runtime,
    rubyPath,
    gemPath,
    vendorPath: `vendor/bundle/ruby/${option.major}.${option.minor}.0`,
  };
}

// downloads and installs `bundler` (respecting
// process.env.GEM_HOME), and returns
// the absolute path to it
export async function installBundler(
  meta: Meta,
  gemfileContents: string,
  declaredVersion?: DeclaredRubyVersion
) {
  const { gemHome, rubyPath, gemPath, vendorPath, runtime, major } =
    await getRubyPath(meta, gemfileContents, declaredVersion);

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

export type { DeclaredRubyVersion };

function isInstalled({ major, minor }: RubyVersion): boolean {
  const gemHome = '/ruby' + major + minor;
  return (
    Boolean(which.sync(join(gemHome, 'bin/ruby'), { nothrow: true })) &&
    Boolean(which.sync(join(gemHome, 'bin/gem'), { nothrow: true }))
  );
}
