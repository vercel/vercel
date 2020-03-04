import { join } from 'path';
import execa from 'execa';
import { debug, Meta, NowBuildError } from '@now/build-utils';

const validVersions = new Set(['2.7.x', '2.5.x']);

function getRubyPath(meta: Meta, version = process.env.RUBY_VERSION) {
  if (meta.isDev) {
    throw new Error(
      'Ruby is in the early alpha stage and does not support now dev at this time.'
    );
  } else if (!version) {
    version = '2.7.x';
  } else if (!validVersions.has(version)) {
    throw new NowBuildError({
      code: 'NOW_RUBY_INVALID_VERSION',
      message: `Invalid Ruby Version: ${version}`,
    });
  }

  const [major, minor] = version.split('.');
  const gemHome = '/ruby' + major + minor;
  const result = {
    gemHome,
    rubyPath: join(gemHome, 'bin', 'ruby'),
    gemPath: join(gemHome, 'bin', 'gem'),
    vendorPath: `vendor/bundle/ruby/${major}.${minor}.0`,
    runtime: `ruby${major}.${minor}`,
  };
  debug(JSON.stringify(result, null, ' '));
  return result;
}

// downloads and installs `bundler` (respecting
// process.env.GEM_HOME), and returns
// the absolute path to it
export async function installBundler(meta: Meta) {
  const { gemHome, rubyPath, gemPath, vendorPath, runtime } = await getRubyPath(
    meta
  );

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
