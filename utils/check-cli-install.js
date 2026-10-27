// Check the packed CLI as a consumer, outside the workspace and without its
// lockfile, overrides, caches, or npm configuration. CI runs this on Linux.
// Usage: node utils/check-cli-install.js <npm|pnpm> <manager-js> <cli-tarball>
const { execFile } = require('node:child_process');
const { mkdir, mkdtemp, realpath, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { delimiter, dirname, join } = require('node:path');
const { promisify, stripVTControlCharacters } = require('node:util');

const exec = promisify(execFile);

function installWarnings({ stdout = '', stderr = '' }) {
  return stripVTControlCharacters(`${stdout}\n${stderr}`)
    .split(/\r?\n/)
    .filter(line =>
      /\bnpm\s+warn\s+deprecated\b|\bWARN\s+(?:\d+\s+)?deprecated\b|\b(?:EBADENGINE|ERR_PNPM_UNSUPPORTED_ENGINE)\b|\bUnsupported engine\b/i.test(
        line
      )
    );
}

async function checkCliInstall({
  manager,
  executable,
  tarball,
  run = exec,
  log = console.log,
}) {
  if (!['npm', 'pnpm'].includes(manager) || !executable || !tarball) {
    throw new Error(
      'Usage: node utils/check-cli-install.js <npm|pnpm> <manager-js> <cli-tarball>'
    );
  }
  executable = await realpath(executable);
  tarball = await realpath(tarball);
  const root = await realpath(await mkdtemp(join(tmpdir(), 'vercel-install-')));
  try {
    const home = join(root, 'home');
    const cwd = join(root, 'project');
    const prefix = join(root, 'prefix');
    const bin = manager === 'npm' ? join(prefix, 'bin') : join(root, 'bin');
    const temporary = join(root, 'tmp');
    const userconfig = join(home, '.npmrc');
    const globalconfig = join(root, 'global.npmrc');
    await Promise.all(
      [home, cwd, bin, temporary].map(path => mkdir(path, { recursive: true }))
    );
    await writeFile(userconfig, '');
    await writeFile(
      globalconfig,
      [
        'registry=https://registry.npmjs.org/',
        'audit=false',
        'fund=false',
        'update-notifier=false',
        // npm rejects incompatible engines even without a warning. Keep its
        // check mandatory: pnpm does not enforce this for every tarball install.
        'engine-strict=true',
        ...(manager === 'pnpm'
          ? [
              `store-dir=${join(root, 'store')}`,
              `cache-dir=${join(root, 'pnpm-cache')}`,
              `global-dir=${join(root, 'pnpm-global')}`,
              `global-bin-dir=${bin}`,
            ]
          : ['loglevel=warn']),
        '',
      ].join('\n')
    );
    const env = {
      // Do not inherit npm_config_*, auth tokens, NODE_OPTIONS, or shared caches.
      PATH: [bin, dirname(process.execPath), process.env.PATH]
        .filter(Boolean)
        .join(delimiter),
      HOME: home,
      XDG_CONFIG_HOME: join(root, 'config'),
      XDG_CACHE_HOME: join(root, 'cache'),
      XDG_DATA_HOME: join(root, 'data'),
      XDG_STATE_HOME: join(root, 'state'),
      TMPDIR: temporary,
      TMP: temporary,
      TEMP: temporary,
      CI: '1',
      NO_COLOR: '1',
      NO_UPDATE_NOTIFIER: '1',
      VERCEL_TELEMETRY_DISABLED: '1',
      npm_config_userconfig: userconfig,
      npm_config_globalconfig: globalconfig,
      npm_config_prefix: prefix,
      npm_config_cache: join(root, 'npm-cache'),
      PNPM_HOME: bin,
      COREPACK_ENABLE_NETWORK: '0',
      COREPACK_ENABLE_PROJECT_SPEC: '0',
    };
    const options = {
      cwd,
      env,
      encoding: 'utf8',
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
    };
    const install = await run(
      process.execPath,
      [
        executable,
        manager === 'npm' ? 'install' : 'add',
        '--global',
        tarball,
        ...(manager === 'pnpm' ? ['--reporter=append-only'] : []),
      ],
      options
    );
    log(`${install.stdout}\n${install.stderr}`.trim());
    const warnings = installWarnings(install);
    if (warnings.length) {
      throw new Error(
        `${manager} install emitted dependency warnings:\n${warnings.join('\n')}`
      );
    }
    // Exercise the installed launcher rather than the source checkout.
    const version = await run(join(bin, 'vercel'), ['--version'], options);
    if (!`${version.stdout}${version.stderr}`.trim()) {
      throw new Error('Installed vercel --version returned no output');
    }
    log(`${version.stdout}\n${version.stderr}`.trim());
    log(
      `${manager} clean install and vercel --version passed on ${process.version}`
    );
  } catch (error) {
    // execFile rejects on nonzero exits/timeouts, but its message can omit stdout.
    // Preserve both streams so CI shows pnpm errors as well as npm errors.
    const diagnostics = [error.stdout, error.stderr].filter(
      output => output && !error.message.includes(output.trim())
    );
    throw new Error([error.message, ...diagnostics].join('\n'), {
      cause: error,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

module.exports = { checkCliInstall, installWarnings };

if (require.main === module) {
  const [manager, executable, tarball] = process.argv.slice(2);
  checkCliInstall({ manager, executable, tarball }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
