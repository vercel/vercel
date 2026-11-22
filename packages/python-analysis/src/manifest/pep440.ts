import assert from 'node:assert';

import { parse as parseVersion } from '@renovatebot/pep440';
import {
  parse as parseSpecifier,
  satisfies,
} from '@renovatebot/pep440/lib/specifier';
import { stringify as stringifyVersion } from '@renovatebot/pep440/lib/version';

// @renovatebot/pep440 is bundled rather than installed (its `engines` field
// warns on newer Node versions), so these mirror its types to keep the emitted
// declarations from importing the package.
export interface Pep440Constraint {
  operator: string;
  prefix: string;
  version: string;
}

export interface Pep440Version {
  public: string;
  base_version: string;
  is_prerelease: boolean;
  is_devrelease: boolean;
  is_postrelease: boolean;
  epoch: number;
  release: number[];
  pre: (string | number)[];
  post: (string | number)[];
  dev: (string | number)[];
  local: string | null;
}

export function parsePep440Version(version: string): Pep440Version | null {
  return parseVersion(version);
}

export function parsePep440Constraint(ranges: string): Pep440Constraint[] {
  return parseSpecifier(ranges);
}

export function pep440Satisfies(version: string, specifier: string): boolean {
  return satisfies(version, specifier);
}

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
  assert(verstr != null, 'pep440/lib/version:stringify returned null');
  return verstr;
}
