import { join } from 'path';
import { intersects } from 'semver';
import execa from 'execa';
import { Meta, NodeVersion, debug, NowBuildError } from '@vercel/build-utils';

interface RubyVersion extends NodeVersion {
  minor: number;
}

function getOptions() {
  const options = [
    { major: 3, minor: 2, range: '3.2.x', runtime: 'ruby3.2' },
    {
      major: 2,
      minor: 7,
      range: '2.7.x',
      runtime: 'ruby2.7',
      discontinueDate: new Date('2023-12-07T00:00:00Z'),
    },
    {
      major: 2,
      minor: 5,
      range: '2.5.x',
      runtime: 'ruby2.5',
      discontinueDate: new Date('2021-11-30T00:00:00Z'),
    },
  ] as const;
  return options;
}

function getLatestRubyVersion(): RubyVersion {
  return getOptions()[0];
}

function isDiscontinued({ discontinueDate }: RubyVersion): boolean {
  const today = Date.now();
  return discontinueDate !== undefined && discontinueDate.getTime() <= today;
}

function getRubyPath(meta: Meta, gemfileContents: string) {
  let selection = getLatestRubyVersion();
  if (meta.isDev) {
    throw new Error(
      'Ruby is in the early alpha stage and does not support vercel dev at this time.'
    );
  } else if (gemfileContents) {
    const line = gemfileContents
      .split('\n')
      .find(line => line.startsWith('ruby'));
    if (line) {
      const strVersion = line.slice(4).trim().slice(1, -1).replace('~>', '');
      const found = getOptions().some(o => {
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
      if (isDiscontinued(selection)) {
        const latest = getLatestRubyVersion();
        const intro = `Found \`Gemfile\` with discontinued Ruby version: \`${line}.\``;
        const hint = `Please set \`ruby "~> ${latest.range}"\` in your \`Gemfile\` to use Ruby ${latest.range}.`;
        throw new NowBuildError({
          code: 'RUBY_DISCONTINUED_VERSION',
          link: 'http://vercel.link/ruby-version',
          message: `${intro} ${hint}`,
        });
      }
    }
  }

  const { major, minor, runtime } = selection;
  const gemHome = '/ruby' + major + minor;
  const result = {
    gemHome,
    runtime,
    rubyPath: join(gemHome, 'bin', 'ruby'),
    gemPath: join(gemHome, 'bin', 'gem'),
    vendorPath: `vendor/bundle/ruby/${major}.${minor}.0`,
  };
  debug(JSON.stringify(result, null, ' '));
  return result;
}

// downloads and installs `bundler` (respecting
// process.env.GEM_HOME), and returns
// the absolute path to it
export async function installBundler(meta: Meta, gemfileContents: string) {
  const { gemHome, rubyPath, gemPath, vendorPath, runtime } = getRubyPath(
    meta,
    gemfileContents
  );

  // If the new File System API is used (`avoidTopLevelInstall`), the Install Command
  // will have already installed the dependencies, so we don't need to do it again.
  if (meta.avoidTopLevelInstall) {
    debug(
      `Skipping bundler installation, already installed by Install Command`
    );

    return {
      gemHome,
      rubyPath,
      gemPath,
      vendorPath,
      runtime,
      bundlerPath: join(gemHome, 'bin', 'bundler'),
    };
  }

  debug('installing bundler...');
  await execa(gemPath, ['install', 'bundler', '--no-document'], {
    stdio: 'pipe',
    env: {
      GEM_HOME: gemHome,
    },
  });

  return {
    gemHome,
    rubyPath,
    gemPath,
    vendorPath,
    runtime,
    bundlerPath: join(gemHome, 'bin', 'bundler'),
  };
}
