import { join } from 'path';
import execa from 'execa';
import { getWriteableDirectory } from '@now/build-utils';

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
    { stdio: 'inherit' }
  );
  await execa(
    'git',
    ['clone', 'git://github.com/rbenv/ruby-build.git', rubyBuildDir],
    { stdio: 'inherit' }
  );
  await execa(join(rubyBuildDir, 'bin', 'ruby-build'), [version, rubyDir], {
    stdio: 'inherit',
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
  console.log('installing ruby...');
  const { gemHome, rubyPath, gemPath } = await installRuby();

  console.log('installing bundler...');
  await execa(gemPath, ['install', 'bundler', '--no-document'], {
    stdio: 'inherit',
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
