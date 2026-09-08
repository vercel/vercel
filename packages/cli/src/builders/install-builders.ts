import { createInstallBuilders } from '@vercel-internals/builder-orchestration/install-builders';
import cliPkg from '../util/pkg';
import readJSONFile from '../util/read-json-file';
import { CantParseJSONFile } from '../util/errors-ts';
import cmd from '../util/output/cmd';
import code from '../util/output/code';
import output from '../output-manager';
import execa from 'execa';

export const installBuilders = createInstallBuilders({
  buildUtilsVersion: cliPkg.dependencies?.['@vercel/build-utils'],
  code,
  cmd,
  isCantParseJSONFile: (value): value is CantParseJSONFile =>
    value instanceof CantParseJSONFile,
  output,
  readJSONFile,
  run: execa,
});
