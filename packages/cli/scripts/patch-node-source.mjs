import fs from 'node:fs/promises';
import { join } from 'node:path';

const windowsSmallIcuGenccodeAction = `                  # build final .dat -> .obj
                  'action_name': 'genccode',
                  'msvs_quote_cmd': 0,
                  'inputs': [ '<(SHARED_INTERMEDIATE_DIR)/icutmp/icudt<(icu_ver_major)<(icu_endianness).dat' ],
                  'outputs': [ '<(SHARED_INTERMEDIATE_DIR)/icudt<(icu_ver_major)<(icu_endianness)_dat.<(icu_asm_ext)' ],
                  'action': [ '<(PRODUCT_DIR)/genccode<(EXECUTABLE_SUFFIX)',
                              '<@(icu_asm_opts)', # -o
                              '-d', '<(SHARED_INTERMEDIATE_DIR)/',`;

const patchedWindowsSmallIcuGenccodeAction = `                  # build final .dat -> .obj
                  'action_name': 'genccode',
                  'msvs_quote_cmd': 0,
                  'inputs': [ '<(SHARED_INTERMEDIATE_DIR)/icutmp/icudt<(icu_ver_major)<(icu_endianness).dat' ],
                  'outputs': [ '<(SHARED_INTERMEDIATE_DIR)/icudt<(icu_ver_major)<(icu_endianness)_dat.<(icu_asm_ext)' ],
                  'action': [ '<(PRODUCT_DIR)/genccode<(EXECUTABLE_SUFFIX)',
                              '<@(icu_asm_opts)', # -o
                              '-c', '<(target_arch)',
                              '-d', '<(SHARED_INTERMEDIATE_DIR)/',`;

/**
 * Node 24 forces ClangCL for Windows builds. ICU's Windows small-ICU action
 * does not pass the target CPU to genccode, even though its full-ICU action
 * does. ClangCL cannot generate the data object without that value.
 * See https://github.com/nodejs/node/issues/58751.
 *
 * Keep this replacement exact so a future Node source change requires us to
 * re-evaluate or remove the workaround instead of patching an unrelated block.
 */
export function patchWindowsSmallIcuGenccodeGyp(source) {
  const unpatchedMatches = countOccurrences(
    source,
    windowsSmallIcuGenccodeAction
  );
  const patchedMatches = countOccurrences(
    source,
    patchedWindowsSmallIcuGenccodeAction
  );

  if (unpatchedMatches === 0 && patchedMatches === 1) {
    return source;
  }

  if (unpatchedMatches !== 1 || patchedMatches !== 0) {
    throw new Error(
      'Could not identify exactly one unpatched Windows small-ICU genccode ' +
        'action in Node source. Re-evaluate the Node 24 ClangCL workaround ' +
        'before updating the embedded Node version.'
    );
  }

  return source.replace(
    windowsSmallIcuGenccodeAction,
    patchedWindowsSmallIcuGenccodeAction
  );
}

export async function patchWindowsSmallIcuGenccode(sourceDir) {
  const gypPath = join(sourceDir, 'tools', 'icu', 'icu-generic.gyp');
  const source = await fs.readFile(gypPath, 'utf8');
  const patched = patchWindowsSmallIcuGenccodeGyp(source);

  if (patched !== source) {
    await fs.writeFile(gypPath, patched);
    console.log(
      'Patched Node Windows small-ICU genccode action with target architecture'
    );
  }
}

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}
