import { describe, expect, test } from 'vitest';
import { patchWindowsSmallIcuGenccodeGyp } from '../../../scripts/patch-node-source.mjs';

const windowsSmallIcuAction = `                  # build final .dat -> .obj
                  'action_name': 'genccode',
                  'msvs_quote_cmd': 0,
                  'inputs': [ '<(SHARED_INTERMEDIATE_DIR)/icutmp/icudt<(icu_ver_major)<(icu_endianness).dat' ],
                  'outputs': [ '<(SHARED_INTERMEDIATE_DIR)/icudt<(icu_ver_major)<(icu_endianness)_dat.<(icu_asm_ext)' ],
                  'action': [ '<(PRODUCT_DIR)/genccode<(EXECUTABLE_SUFFIX)',
                              '<@(icu_asm_opts)', # -o
                              '-d', '<(SHARED_INTERMEDIATE_DIR)/',`;

describe('patchWindowsSmallIcuGenccodeGyp', () => {
  test('passes the target architecture to genccode', () => {
    const patched = patchWindowsSmallIcuGenccodeGyp(windowsSmallIcuAction);

    expect(patched).toContain(
      `'<@(icu_asm_opts)', # -o\n                              '-c', '<(target_arch)',\n                              '-d', '<(SHARED_INTERMEDIATE_DIR)/',`
    );
  });

  test('is idempotent', () => {
    const patched = patchWindowsSmallIcuGenccodeGyp(windowsSmallIcuAction);

    expect(patchWindowsSmallIcuGenccodeGyp(patched)).toBe(patched);
  });

  test('fails closed when the upstream source layout changes', () => {
    expect(() => patchWindowsSmallIcuGenccodeGyp('unexpected source')).toThrow(
      'Could not identify exactly one unpatched Windows small-ICU genccode action'
    );
  });
});
