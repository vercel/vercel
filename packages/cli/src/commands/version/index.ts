import { join } from 'path';
import { readdirSync, existsSync } from 'fs-extra';
import semver from 'semver';
import output from '../../output-manager';
import pkg from '../../util/pkg';
import { packageName } from '../../util/pkg-name';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { fetchLatestVersion } from '../../util/get-latest-version';
import type Client from '../../util/client';
import { versionCommand } from './command';
import {
  getStoreRoot,
  readPointer,
  writePointer,
  removeStore,
  getStoreEntrypoint,
  installVersionToStore,
  installNativeVersionToStore,
  installTarballUrlToStore,
} from '../../util/cli-store';

export default async function version(client: Client): Promise<number> {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(versionCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const args = parsedArgs.args.slice(1); // drop 'version'
  const subcommand = args[0];
  const binary = Boolean(parsedArgs.flags['--binary']);
  const experimental = Boolean(parsedArgs.flags['--experimental']);

  switch (subcommand) {
    case 'pin':
      return pin(args[1], { binary });
    case 'unpin':
      return unpin();
    case 'list':
    case 'ls':
      return list();
    case 'reset':
      return reset();
    case undefined:
      if (experimental || binary) {
        return pin('latest', { binary });
      }
      return status();
    default:
      output.error(`Unknown subcommand: ${subcommand}`);
      return 2;
  }
}

async function pin(
  specifier: string | undefined,
  { binary }: { binary: boolean }
): Promise<number> {
  if (!specifier) {
    output.error(
      'A version specifier is required: a semver version, "latest", or a tarball URL'
    );
    return 2;
  }

  try {
    if (/^https?:\/\//.test(specifier)) {
      if (binary) {
        output.error('--binary cannot be combined with a tarball URL');
        return 2;
      }
      output.warn(
        'Installing from a tarball URL — no registry integrity verification.'
      );
      const installed = await installTarballUrlToStore(specifier);
      output.success(`Pinned to v${installed} (from tarball).`);
      return 0;
    }

    if (specifier === 'latest') {
      const latest = await fetchLatestVersion({ name: packageName });
      if (!latest) {
        output.error('Could not resolve "latest" from the registry.');
        return 1;
      }
      const install = binary
        ? installNativeVersionToStore(latest, undefined, { force: true })
        : installVersionToStore(packageName, latest, undefined, {
            force: true,
          });
      const installed = await install;
      output.success(
        `Tracking latest${binary ? ' (native binary)' : ''} — currently v${installed}.`
      );
      return 0;
    }

    if (!semver.valid(specifier)) {
      output.error(
        `"${specifier}" is not a valid version, "latest", or a tarball URL`
      );
      return 2;
    }

    const installed = binary
      ? await installNativeVersionToStore(specifier, undefined, {
          pinned: true,
          force: true,
        })
      : await installVersionToStore(packageName, specifier, undefined, {
          pinned: true,
          force: true,
        });
    output.success(
      `Pinned to v${installed}${binary ? ' (native binary)' : ''}. Run \`${packageName} version unpin\` to resume upgrades.`
    );
    return 0;
  } catch (err) {
    output.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

function unpin(): number {
  const pointer = readPointer();
  if (!pointer) {
    output.log('Not enrolled in the managed store.');
    return 0;
  }
  if (!pointer.pinned) {
    output.log('Not pinned.');
    return 0;
  }
  writePointer({ ...pointer, pinned: undefined }, undefined, { force: true });
  output.success(
    `Unpinned. Staying on v${pointer.version} until a newer version arrives.`
  );
  return 0;
}

function list(): number {
  const root = getStoreRoot();
  const pointer = readPointer(root);
  if (!pointer && !existsSync(join(root, 'versions'))) {
    output.log('Not enrolled in the managed store.');
    return 0;
  }

  for (const type of ['npm', 'native'] as const) {
    const dir = join(root, 'versions', type);
    let entries: string[] = [];
    try {
      entries = readdirSync(dir).filter(name => semver.valid(name));
    } catch (_) {}
    entries.sort(semver.compare);
    for (const v of entries) {
      const current = pointer?.version === v && pointer?.type === type;
      const marker = current
        ? ` ← current${pointer?.pinned ? ' (pinned)' : ''}`
        : '';
      output.print(`${type.padEnd(8)}v${v}${marker}\n`);
    }
  }
  output.print(`\nrunning: v${pkg.version}\n`);
  return 0;
}

function reset(): number {
  if (!readPointer()) {
    output.log('Not enrolled in the managed store.');
    return 0;
  }
  removeStore();
  output.success(
    'Managed store removed. Installs revert to package-manager-managed behavior.'
  );
  return 0;
}

async function status(): Promise<number> {
  const root = getStoreRoot();
  const pointer = readPointer(root);
  output.print(`Vercel CLI v${pkg.version}\n`);
  if (!pointer) {
    output.print('Managed store: not enrolled\n');
    output.print(`Run \`${packageName} version --experimental\` to enroll.\n`);
    return 0;
  }
  const payloadPresent = existsSync(
    getStoreEntrypoint(pointer.version, root, pointer.type)
  );
  output.print(
    `Managed store: v${pointer.version} (${pointer.type}${pointer.pinned ? ', pinned' : ''})${payloadPresent ? '' : ' [payload missing]'}\n`
  );
  return 0;
}
