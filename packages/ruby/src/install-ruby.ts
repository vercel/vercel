import execa from 'execa';
import which from 'which';
import { join } from 'path';
import { intersects } from 'semver';
import { Meta, debug, NowBuildError, Version } from '@vercel/build-utils';

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

      if (selection.state === 'discontinued' || !isInstalled(selection)) {
        const latest = getLatestRubyVersion();
        const intro = `Found \`Gemfile\` with ${
          selection.state === 'discontinued' ? 'discontinued' : 'invalid'
        } Ruby version: \`${line}.\``;
        const hint = `Please set \`ruby "~> ${latest.range}"\` in your \`Gemfile\` to use Ruby ${latest.range}.`;
        throw new NowBuildError({
          code:
            selection.state === 'discontinued'
              ? 'RUBY_DISCONTINUED_VERSION'
              : 'RUBY_INVALID_VERSION',
          link: 'http://vercel.link/ruby-version',
          message: `${intro} ${hint}`,
        });
      }
    }
  }

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
  debug(JSON.stringify(result, null, ' '));
  return result;
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
  return (
    Boolean(which.sync(join(gemHome, 'bin/ruby'), { nothrow: true })) &&
    Boolean(which.sync(join(gemHome, 'bin/gem'), { nothrow: true }))
  );
}
