import assert from 'node:assert';

import type { Pep440Version, Pep440Constraint } from '@renovatebot/pep440';
import { stringify as stringifyVersion } from '@renovatebot/pep440/lib/version';

export type { Pep440Version, Pep440Constraint } from '@renovatebot/pep440';
export { parse as parsePep440Version } from '@renovatebot/pep440';
export {
  parse as parsePep440Constraint,
  satisfies as pep440Satisfies,
} from '@renovatebot/pep440/lib/specifier';

export function pep440ConstraintFromVersion(
  v: Pep440Version
): Pep440Constraint[] {
  return [
    {
      operator: '==',
      version: unparsePep440Version(v),
      prefix: '',
    },
  ];
}

export function unparsePep440Version(v: Pep440Version): string {
  const verstr = stringifyVersion(v);
  // pep440 stringify only returns null if input is null which it isn't here.
  assert(verstr !== null, 'pep440/lib/version:stringify returned null');
  return verstr;
}
