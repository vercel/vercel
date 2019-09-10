import { join } from 'path';
import execa from 'execa';
import { debug } from '@now/build-utils';

async function installRuby() {
  const rubyDir = '/ruby25';
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
