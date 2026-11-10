import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import resolveSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import list from './list';
import {
  blobCommand,
  delSubcommand,
  getSubcommand,
  listSubcommand,
  presignSubcommand,
  putSubcommand,
  copySubcommand,
  createStoreSubcommand,
  deleteStoreSubcommand,
  getStoreInfoSubcommand,
  listStoresSubcommand,
  putImageSubcommand,
  signedTokenSubcommand,
  emptyStoreSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { BlobTelemetryClient } from '../../util/telemetry/commands/blob';
import put from './put';
import putImage from './put-image';
import get from './get';
import del from './del';
import copy from './copy';
import addStore from './store-add';
import removeStore from './store-remove';
import getStore from './store-get';
import listStores from './store-list';
import emptyStore from './store-empty';
import presign from './presign';
import signedToken from './signed-token';
import { printError } from '../../util/error';
import { findFlagValue, getBlobRWToken } from '../../util/blob/token';
import {
  getRenamedOption,
  reportRenamedOptionError,
} from '../../util/renamed-option';
import { wantsMachineReadableOutput } from '../../util/output-format';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  put: getCommandAliases(putSubcommand),
  'put-image': getCommandAliases(putImageSubcommand),
  get: getCommandAliases(getSubcommand),
  delete: getCommandAliases(delSubcommand),
  copy: getCommandAliases(copySubcommand),
  'signed-token': getCommandAliases(signedTokenSubcommand),
  presign: getCommandAliases(presignSubcommand),
  'create-store': getCommandAliases(createStoreSubcommand),
  'delete-store': getCommandAliases(deleteStoreSubcommand),
  'get-store': getCommandAliases(getStoreInfoSubcommand),
  'list-stores': getCommandAliases(listStoresSubcommand),
  'empty-store': getCommandAliases(emptyStoreSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new BlobTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(blobCommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 2;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args, subcommandOriginal } = resolveSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('blob', subcommand);
    output.print(
      help(blobCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: blobCommand,
        columns: client.stderr.columns,
      })
    );
  }

  const json = wantsMachineReadableOutput(undefined, client.argv);
  const store = getRenamedOption(parsedArgs.flags, '--store', '--store-id', {
    json,
  });
  if ('error' in store) {
    return reportRenamedOptionError(client, store.error, { json });
  }

  const token = await getBlobRWToken(client, client.argv);
  telemetry.trackCliOptionRwToken(findFlagValue(client.argv, '--rw-token'));
  telemetry.trackCliOptionOidcToken(findFlagValue(client.argv, '--oidc-token'));
  telemetry.trackCliOptionStore(findFlagValue(client.argv, '--store'));
  telemetry.trackCliOptionStoreId(findFlagValue(client.argv, '--store-id'));

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(listSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandList(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return list(client, args, token, [store.warning]);
    case 'put':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(putSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandPut(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return put(client, args, token);
    case 'put-image':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(putImageSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandPutImage(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return putImage(client, args, token, [store.warning]);
    case 'get':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(getSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandGet(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return get(client, args, token);
    case 'delete':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(delSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      if (subcommandOriginal === 'remove') {
        warnDeprecatedSubcommand(client, 'blob remove', 'blob delete');
      }

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return del(client, args, token);
    case 'copy':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(copySubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandCopy(subcommandOriginal);
      if (subcommandOriginal === 'cp') {
        warnDeprecatedSubcommand(client, 'blob cp', 'blob copy');
      }

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return copy(client, args, token);
    case 'signed-token':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(signedTokenSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandSignedToken(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return signedToken(client, args, token, [store.warning]);
    case 'presign':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(presignSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandPresign(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return presign(client, args, token, [store.warning]);
    case 'create-store':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(createStoreSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandCreateStore(subcommandOriginal);

      return addStore(client, args);
    case 'delete-store':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(deleteStoreSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandDeleteStore(subcommandOriginal);

      return removeStore(client, args, token);
    case 'get-store':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(getStoreInfoSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandGetStore(subcommandOriginal);

      return getStore(client, args, token);
    case 'list-stores':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(listStoresSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandListStores(subcommandOriginal);
      if (subcommandOriginal === 'ls-stores') {
        warnDeprecatedSubcommand(client, 'blob ls-stores', 'blob list-stores');
      }

      return listStores(client, args);
    case 'empty-store':
      if (needHelp) {
        telemetry.trackCliFlagHelp('blob', subcommandOriginal);
        printHelp(emptyStoreSubcommand);
        return 0;
      }

      telemetry.trackCliSubcommandEmptyStore(subcommandOriginal);

      if (!token.success) {
        printError(token.error);
        return 1;
      }

      return emptyStore(client, args, token);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(blobCommand, {
          stream: client.stderr,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
