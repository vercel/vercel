import { join } from 'path';
import execa from 'execa';
import { getWriteableDirectory, debug } from '@now/build-utils';

const RUBY_VERSION = '2.5.5';

async function installRuby(version: string = RUBY_VERSION) {
  const baseDir = await getWriteableDirectory();
  const rubyDir = join(baseDir, 'ruby');
  const rubyBuildDir = join(baseDir, 'ruby-build');

  await execa(
    'yum',
    [
      'install',
      '-y',
      'git',
      'gcc',
      'make',
      'tar',
      'bzip2',
      'readline-devel',
      'openssl-devel',
      'ruby-devel',
      'zlib-devel',
    ],
    { stdio: 'pipe' }
  );
  await execa(
    'git',
    ['clone', 'git://github.com/rbenv/ruby-build.git', rubyBuildDir],
    { stdio: 'pipe' }
  );
  await execa(join(rubyBuildDir, 'bin', 'ruby-build'), [version, rubyDir], {
    stdio: 'pipe',
  });

  return {
    gemHome: rubyDir,
    rubyPath: join(rubyDir, 'bin', 'ruby'),
    gemPath: join(rubyDir, 'bin', 'gem'),
  };
}

// downloads and installs `bundler` (respecting
// process.env.GEM_HOME), and returns
// the absolute path to it
export async function installBundler() {
  debug('installing ruby...');
  const { gemHome, rubyPath, gemPath } = await installRuby();

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
    bundlerPath: join(gemHome, 'bin', 'bundler'),
  };
}
